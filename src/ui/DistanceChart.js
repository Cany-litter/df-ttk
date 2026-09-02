// src/ui/DistanceChart.js
import { 
  TIME_UNITS, 
  CHART_CONFIG, 
  SIMULATION_CONFIG 
} from '../core/config.js';
import { SimulationEngine } from '../core/SimulationEngine.js';
import { BulletStrategyFactory } from '../core/BulletStrategy.js';
import { formatTime } from '../utils/formatters.js';
import { resetSeed } from '../utils/rng.js';
import { getConfigCacheManager } from '../core/ConfigCacheManager.js';
import perf from '../utils/performance.js';

/**
 * 垂直线插件
 * 在距离图表上绘制垂直参考线
 */
const verticalLinePlugin = {
  id: 'verticalLine',
  afterDraw(chart) {
    const ctx = chart.ctx;
    const tooltip = chart.tooltip;
    if (!tooltip._active || !tooltip._active.length) return;

    const x = tooltip._active[0].element.x;
    const yTop = chart.scales.y.top;
    const yBottom = chart.scales.y.bottom;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, yBottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(33, 15, 199, 0.89)';
    ctx.stroke();
    ctx.restore();
  }
};

/**
 * 距离折线图类
 * 
 * 使用快速模式（关键点模拟 + 插值）生成 0-100m 的 TTK 曲线
 * 支持缓存：从 data.json 读取预计算的关键点数据
 * 
 * 线条样式：
 * - 全距离加权平均 TTK 排名前 15% 的武器：实线 (borderDash: [])，粗线 (2.5px)，鲜艳颜色
 * - 其余 85% 的武器：虚线 (borderDash: [6, 4])，细线 (1.0px)，淡色
 * - 用户高亮的武器：红色实线，最粗 (4px)，带数据点
 */
export class DistanceChart {
  constructor() {
    this.chart = null;
    this.showAllWeapons = true;  // 默认开启显示全部
    this.lastStats = null;
    this.lastDistances = null;
    this.lastParams = null;
    this.lastArmed = null;
    this.lastAttachments = null;
    
    // 控制台日志控制
    this._hitRateLogPrinted = false;
    this._keyDistancesLogged = false;
    
    // 防重入锁
    this._isUpdating = false;
    
    // 缓存管理器
    this.cacheManager = null;
    
    // ⭐ 高亮武器相关
    this.highlightWeapon = null;      // 当前高亮武器名称
    this.highlightColor = '#ff0000';  // 高亮颜色（红色）
    this.highlightBorderWidth = 4;    // 高亮线条宽度
    
    // ⭐ 缓存统计
    this._cacheHitCount = 0;
    this._cacheMissCount = 0;
  }

  // ============================================================
  // 1. 主更新方法
  // ============================================================

  /**
   * 更新距离图表
   * 
   * 流程：
   * 1. 检查每个配置的缓存状态
   * 2. 缓存命中 → 直接使用关键点数据
   * 3. 缓存未命中 → 执行快速模式模拟 → 保存缓存
   * 4. 插值生成完整曲线
   * 5. 计算全距离加权平均 TTK，确定线条样式
   * 6. ⭐ 计算哈弗币消耗并触发更新
   */
  update(armed, attachments, params) {
    perf.mark('distanceChartUpdate', 'DistanceChart 更新开始');
    
    // 防重入锁
    if (this._isUpdating) {
      console.log('⏳ 图表正在更新中，跳过本次请求');
      return;
    }
    this._isUpdating = true;
    
    try {
      resetSeed();
      
      // 默认开启显示全部
      const showAllCheckbox = document.getElementById('showAllWeapons');
      if (showAllCheckbox) {
        this.showAllWeapons = showAllCheckbox.checked;
      } else {
        this.showAllWeapons = true;
      }
      
      const distances = Array.from({ length: 101 }, (_, i) => i);
      
      // 保存参数供导出使用
      this.lastParams = params;
      this.lastArmed = armed;
      this.lastAttachments = attachments;
      this.lastDistances = distances;
      
      // 重置日志标记和统计
      this._hitRateLogPrinted = false;
      this._keyDistancesLogged = false;
      this._cacheHitCount = 0;
      this._cacheMissCount = 0;
      
      // ⭐ 读取高亮武器选择
      this._readHighlightWeapon(armed);
      
      // 获取 DataManager 和缓存管理器
      const dm = window.__app__?.dataManager;
      if (!dm) {
        console.error('DistanceChart: DataManager 未找到');
        return;
      }
      this.cacheManager = getConfigCacheManager(dm);
      
      // 获取修改标记
      const modifiedWeaponIds = dm.getModifiedWeaponIds ? dm.getModifiedWeaponIds() : [];
      const modifiedSet = new Set(modifiedWeaponIds);
      
      // 构建统计数据（含缓存）
      const stats = this._buildStatsWithCache(armed, attachments, params, distances, dm, modifiedSet);
      
      if (!stats || stats.length === 0) {
        console.warn('DistanceChart: 没有可用的统计数据');
        return;
      }
      
      // 计算每把武器的全距离加权平均 TTK 并排序
      // 权重公式: 1.50 - (distance / 100) * 1.00
      const getWeight = (d) => 1.50 - (d / 100) * 1.00;
      
      const statsWithWeightedAvg = stats.map(s => {
        // 计算加权平均 TTK
        let weightedSum = 0;
        let weightSum = 0;
        distances.forEach((d, i) => {
          const ttk = s.times[i];
          if (ttk !== undefined && ttk !== null && ttk > 0) {
            const w = getWeight(d);
            weightedSum += ttk * w;
            weightSum += w;
          }
        });
        const weightedAvg = weightSum > 0 ? weightedSum / weightSum : Infinity;
        return {
          ...s,
          weightedAvg: weightedAvg
        };
      });
      
      // 按加权平均 TTK 排序（升序）
      statsWithWeightedAvg.sort((a, b) => a.weightedAvg - b.weightedAvg);
      
      // 计算前 15% 的阈值
      const top15PercentCount = Math.max(1, Math.ceil(statsWithWeightedAvg.length * 0.15));
      const top15Weapons = statsWithWeightedAvg.slice(0, top15PercentCount);
      const top15Names = new Set(top15Weapons.map(s => s.displayName));
      
      // 保存数据供导出使用
      this.lastStats = statsWithWeightedAvg;
      
      // ⭐ 提取经济参数
      const economicParams = {
        kdRatio: params.kdRatio || 1.0,
        extractRate: params.extractRate || 0.5,
        extraCost: params.extraCost || 30
      };
      
      // ⭐ 计算哈弗币消耗并触发更新
      const havocCosts = this._calculateHavocCosts(statsWithWeightedAvg, economicParams);
      this._emitHavocCostUpdate(havocCosts);
      
      // 渲染图表（传入 top15Names 用于线条样式判断）
      this.renderChart(distances, statsWithWeightedAvg, top15Names);
      
      // ⭐ 输出精简的缓存统计
      const cacheStats = this.cacheManager.getStats();
      console.log(`📊 缓存统计: ${cacheStats.cached}/${cacheStats.total} 已缓存, ${modifiedSet.size} 个武器待重新计算`);
      
    } finally {
      this._isUpdating = false;
      perf.mark('distanceChartUpdateDone', 'DistanceChart 更新完成');
    }
  }

  // ============================================================
  // 2. 缓存构建 ⭐ 精简日志
  // ============================================================

  /**
   * 从缓存构建统计数据
   * 优先使用缓存，未命中的执行模拟
   */
  _buildStatsWithCache(armed, attachments, params, distances, dm, modifiedSet) {
    const stats = [];
    const itemsToCalculate = [];

    // 第一遍：检查缓存状态
    for (let idx = 0; idx < armed.length; idx++) {
      const weapon = armed[idx];
      const attachment = attachments[idx] || {};
      const configId = attachment.configId || '#1';
      const weaponId = weapon.id;
      const displayName = weapon._displayName || weapon.name;
      
      const price = dm.getPriceByWeaponId(weaponId);
      if (!price) {
        console.warn(`⚠️ 未找到武器 ${weaponId} 的价格配置`);
        continue;
      }
      
      const config = price.configs.find(c => c.id === configId);
      if (!config) {
        console.warn(`⚠️ 未找到配置 ${configId}（武器 ${weaponId}）`);
        continue;
      }
      
      const cacheStatus = this.cacheManager.checkCacheStatus(
        weapon, config, params, attachment, modifiedSet
      );
      
      if (cacheStatus.needsRecalc) {
        // ⭐ 只记录需要计算的配置，不打印详细日志
        this._cacheMissCount++;
        itemsToCalculate.push({
          idx,
          weapon,
          attachment,
          config,
          configId,
          weaponId,
          displayName,
          reason: cacheStatus.reason
        });
      } else {
        this._cacheHitCount++;
        const keyPoints = cacheStatus.cacheData.keyPoints;
        const times = this._keyPointsToTimes(keyPoints, distances);
        const avg35 = this._calculateAvg35(times);
        
        stats.push({
          weapon,
          times,
          avg35,
          displayName: displayName,
          fromCache: true,
          keyPoints: keyPoints
        });
      }
    }

    // 第二遍：计算未命中的武器
    if (itemsToCalculate.length > 0) {
      console.log(`🔬 需要计算 ${itemsToCalculate.length} 个配置...`);
      
      let savedCount = 0;
      
      for (const item of itemsToCalculate) {
        const { weapon, attachment, config, weaponId, configId, displayName } = item;
        
        const result = this._calculateFastModeForSingleWeapon(
          weapon, params, distances, attachment, dm
        );
        
        if (result) {
          const { keyPoints, times, avg35 } = result;
          
          const hash = this.cacheManager.generateParamsHash(
            weapon, config, params, attachment
          );
          config.cache = {
            keyPoints: keyPoints,
            hash: hash,
            cachedAt: new Date().toISOString()
          };
          savedCount++;
          
          stats.push({
            weapon,
            times,
            avg35,
            displayName: displayName,
            fromCache: false,
            keyPoints: keyPoints
          });
        }
      }
      
      const calculatedWeaponIds = [...new Set(itemsToCalculate.map(item => item.weaponId))];
      for (const id of calculatedWeaponIds) {
        dm.clearWeaponModified && dm.clearWeaponModified(id);
      }
      
      // ⭐ 精简缓存保存日志
      console.log(`💾 保存了 ${savedCount} 个配置的缓存, 清除了 ${calculatedWeaponIds.length} 个修改标记`);
    }

    // ⭐ 输出缓存命中率汇总
    const total = this._cacheHitCount + this._cacheMissCount;
    if (total > 0) {
      const hitRate = Math.round((this._cacheHitCount / total) * 100);
      console.log(`📊 缓存命中率: ${this._cacheHitCount}/${total} (${hitRate}%)`);
    }

    return stats;
  }

  /**
   * 将关键点转换为完整的距离-TTK 数组
   */
  _keyPointsToTimes(keyPoints, distances) {
    return distances.map(d => {
      return this.cacheManager.interpolateTTK(keyPoints, d);
    });
  }

  /**
   * 计算 35m 内的平均 TTK
   */
  _calculateAvg35(times) {
    if (!times || times.length === 0) return 0;
    const cutoff = Math.min(35, times.length - 1);
    const slice = times.slice(0, cutoff + 1);
    return slice.reduce((s, t) => s + t, 0) / slice.length;
  }

  // ============================================================
  // 3. 快速模式模拟（单武器）⭐ 精简日志
  // ============================================================

  /**
   * 计算单把武器的快速模式数据
   * 返回关键点数据（含 avgShots 和 bulletPrice）
   * 
   * ⭐ 核心修改：使用配置自己的命中率映射，而不是全局的 params.hitRateMap
   */
  _calculateFastModeForSingleWeapon(weapon, params, distances, attachment, dm) {
    const selectedBulletType = attachment.bulletType;
    
    let realBulletKey = SimulationEngine.getRealBulletKey(
      selectedBulletType, weapon, params, dm
    );
    
    if (!realBulletKey) {
      console.warn(`⚠️ 武器 ${weapon._displayName || weapon.name} 没有匹配的子弹，跳过`);
      return null;
    }
    
    const bulletData = dm.getBulletById(realBulletKey);
    if (!bulletData) {
      console.warn(`⚠️ 武器 ${weapon._displayName || weapon.name} 的子弹 ${realBulletKey} 不存在`);
      return null;
    }
    
    // ⭐ 获取子弹单价
    const bulletPrice = bulletData.price || 0;
    
    const strategy = BulletStrategyFactory.getStrategy(realBulletKey);
    
    const keyDistances = this.getKeyDistances(
      weapon.ranges || [40, 70, Infinity, Infinity],
      CHART_CONFIG.MAX_DISTANCE
    );
    
    if (!this._keyDistancesLogged) {
      console.log(`📊 [快速模式] 关键模拟点:`, keyDistances);
      this._keyDistancesLogged = true;
    }
    
    const keyPoints = [];
    
    // ⭐⭐⭐ 核心修改：获取配置自己的命中率映射
    // 优先使用 attachment.hitRateMap（来自价格配置）
    // 如果没有，降级使用 params.hitRateMap（全局）
    const configHitRateMap = attachment.hitRateMap || params.hitRateMap || [];
    
    for (const distance of keyDistances) {
      // ⭐ 使用配置自己的命中率映射
      const hitRateAtDistance = this.getHitRateForDistance(
        configHitRateMap,
        distance,
        0.85
      );
      
      const simParams = { 
        ...params, 
        distance, 
        hitRate: hitRateAtDistance, 
        bulletLevel: realBulletKey 
      };
      
      // ⭐ 现在返回完整数据（包含 avgShots）
      const result = SimulationEngine.calculateSinglePoint(
        weapon, 
        simParams, 
        SIMULATION_CONFIG.DEFAULT_SIM_COUNT, 
        strategy, 
        bulletData
      );
      
      const trigger = params.triggerDelayEnable 
        ? (weapon._current?.triggerDelay ?? weapon.triggerDelay ?? 0) / TIME_UNITS.SECONDS_TO_MS 
        : 0;
      
      const totalTimeMs = (result.avgTime + trigger) * TIME_UNITS.SECONDS_TO_MS;
      
      // ⭐ 存储：距离、TTK、平均枪数、子弹单价
      keyPoints.push({ 
        d: distance, 
        t: totalTimeMs,
        shots: result.avgShots,
        bulletPrice: bulletPrice
      });
    }
    
    const times = distances.map(d => {
      return this.cacheManager.interpolateTTK(keyPoints, d);
    });
    
    const avg35 = this._calculateAvg35(times);
    
    return { keyPoints, times, avg35 };
  }

  // ============================================================
  // 4. ⭐ 新增：哈弗币消耗计算（使用唯一 Key）
  // ============================================================

  /**
   * 计算所有配置的哈弗币消耗估算
   * 
   * 取所有关键点 shots 的平均值作为最终平均致死枪数
   * ⭐ 使用 weaponId + configId 组合作为唯一 key
   * 
   * @param {Array} stats - 统计数据（包含 keyPoints 和 weapon）
   * @param {Object} economicParams - 经济参数
   * @param {number} economicParams.kdRatio - KD 比率
   * @param {number} economicParams.extractRate - 撤离率 (0-1)
   * @param {number} economicParams.extraCost - 其他消耗子弹数量（发）
   * @returns {Object} { uniqueKey: { totalCost, weaponLossCost, bulletCost, weaponPrice, avgShots, bulletPrice, effectiveShots, kdRatio, extractRate, extraCost, displayName, configId } }
   */
  _calculateHavocCosts(stats, economicParams = {}) {
    const {
      kdRatio = 1.0,
      extractRate = 0.5,
      extraCost = 30
    } = economicParams;

    const havocCosts = {};

    for (const stat of stats) {
      const weapon = stat.weapon;
      // ⭐ 使用 weaponId + configId 组合作为唯一 key
      const weaponId = weapon.id;
      const configId = weapon._configId || '#1';
      const uniqueKey = `${weaponId}_${configId}`;
      const weaponPrice = weapon._price || 0;
      const keyPoints = stat.keyPoints || [];
      const displayName = weapon._displayName || weapon.name || '未知武器';

      if (keyPoints.length === 0) {
        const weaponLossCost = weaponPrice * (1 - extractRate);
        havocCosts[uniqueKey] = {
          totalCost: weaponLossCost,
          weaponLossCost: weaponLossCost,
          bulletCost: 0,
          weaponPrice: weaponPrice,
          avgShots: 0,
          bulletPrice: 0,
          effectiveShots: 0,
          kdRatio: kdRatio,
          extractRate: extractRate,
          extraCost: extraCost,
          displayName: displayName,
          configId: configId
        };
        continue;
      }

      // ⭐ 使用缓存管理器计算（取所有关键点的平均 shots）
      const costResult = this.cacheManager.calculateHavocCostAverage(
        keyPoints,
        {
          weaponPrice: weaponPrice,
          kdRatio: kdRatio,
          extractRate: extractRate,
          extraCost: extraCost
        }
      );

      havocCosts[uniqueKey] = {
        ...costResult,
        displayName: displayName,
        configId: configId
      };
    }

    console.log(`💰 哈弗币消耗估算完成 (${Object.keys(havocCosts).length} 个配置)`);
    
    return havocCosts;
  }

  /**
   * 触发哈弗币消耗数据更新事件
   */
  _emitHavocCostUpdate(havocCosts) {
    const event = new CustomEvent('havoc-cost-update', {
      detail: { havocCosts },
      bubbles: true
    });
    document.dispatchEvent(event);
  }

  // ============================================================
  // 5. 辅助方法
  // ============================================================

  getKeyDistances(ranges, maxDistance) {
    const validRanges = ranges.filter(r => r !== Infinity && r <= maxDistance);
    
    const keyDistances = [0];
    
    for (const range of validRanges) {
      const before = Math.max(0, range - 1);
      if (before > 0 && !keyDistances.includes(before)) {
        keyDistances.push(before);
      }
      if (!keyDistances.includes(range)) {
        keyDistances.push(range);
      }
    }
    
    if (!keyDistances.includes(maxDistance)) {
      keyDistances.push(maxDistance);
    }
    
    return [...new Set(keyDistances)].sort((a, b) => a - b);
  }

  getHitRateForDistance(hitRateMap, distance, fallback = 0.85) {
    const dm = window.__app__?.dataManager;
    if (dm && typeof dm.getHitRateFromMap === 'function') {
      const result = dm.getHitRateFromMap(hitRateMap, distance, fallback);
      this._logHitRateOnce(hitRateMap, distance, result);
      return result;
    }
    return fallback;
  }

  _logHitRateOnce(hitRateMap, distance, rate) {
    if (this._hitRateLogPrinted) return;
    
    const logDistances = [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100];
    if (!logDistances.includes(Math.round(distance))) return;
    
    const mapStr = hitRateMap && hitRateMap.length > 0
      ? hitRateMap.map(p => `${p.distance}m:${Math.round(p.rate * 100)}%`).join(', ')
      : '无映射';
    
    console.log(
      `📊 [距离-命中率] ${Math.round(distance)}m → ${Math.round(rate * 100)}%  ` +
      `(映射: ${mapStr})`
    );
    
    if (Math.round(distance) === 100) {
      this._hitRateLogPrinted = true;
      console.log('✅ 距离-命中率日志输出完成 (仅输出关键距离点)');
    }
  }

  // ============================================================
  // 6. ⭐ 高亮武器相关方法
  // ============================================================

  /**
   * 读取高亮武器选择
   */
  _readHighlightWeapon(armed) {
    const select = document.getElementById('highlightWeaponSelect');
    if (!select) {
      this.highlightWeapon = null;
      return;
    }
    
    const selectedValue = select.value;
    if (!selectedValue) {
      this.highlightWeapon = null;
      return;
    }
    
    // 从 armed 中查找匹配的武器
    const matched = armed.find(w => {
      const displayName = w._displayName || w.name;
      return displayName === selectedValue;
    });
    
    this.highlightWeapon = matched ? (matched._displayName || matched.name) : null;
  }

  /**
   * 更新高亮武器下拉选项
   */
  updateHighlightOptions(armed) {
    const select = document.getElementById('highlightWeaponSelect');
    if (!select) return;
    
    // 保存当前选中的值
    const currentValue = select.value;
    
    // 清空并重新填充选项
    select.innerHTML = '<option value="">无</option>';
    
    // 去重：使用 Set 存储显示名称
    const seen = new Set();
    for (const weapon of armed) {
      const displayName = weapon._displayName || weapon.name;
      if (!seen.has(displayName)) {
        seen.add(displayName);
        const option = document.createElement('option');
        option.value = displayName;
        option.textContent = displayName;
        select.appendChild(option);
      }
    }
    
    // 恢复选中的值
    if (currentValue && seen.has(currentValue)) {
      select.value = currentValue;
    }
  }

  // ============================================================
  // 7. 渲染图表
  // ============================================================

  /**
   * 渲染距离图表
   * @param {Array} distances - 距离数组
   * @param {Array} stats - 统计数据（已按加权平均排序）
   * @param {Set} top15Names - 前 15% 武器的名称集合（实线）
   */
  renderChart(distances, stats, top15Names) {
    // 显示全部默认开启
    const maxDisplay = this.showAllWeapons ? stats.length : stats.length;
    const displayCount = Math.min(maxDisplay, stats.length);

    // 前15% 使用更鲜艳的颜色
    const topColorPalette = [
      '#e74c3c', '#2ecc71', '#3498db', '#f39c12', '#9b59b6',
      '#1abc9c', '#e67e22', '#2c3e50', '#27ae60', '#8e44ad',
      '#16a085', '#d35400', '#2980b9', '#c0392b', '#f1c40f'
    ];
    
    // 其余使用淡色（降低饱和度/透明度）
    const mutedColorPalette = [
      'rgba(231, 76, 60, 0.35)',
      'rgba(46, 204, 113, 0.35)',
      'rgba(52, 152, 219, 0.35)',
      'rgba(243, 156, 18, 0.35)',
      'rgba(155, 89, 182, 0.35)',
      'rgba(26, 188, 156, 0.35)',
      'rgba(230, 126, 34, 0.35)',
      'rgba(44, 62, 80, 0.35)',
      'rgba(39, 174, 96, 0.35)',
      'rgba(142, 68, 173, 0.35)',
      'rgba(22, 160, 133, 0.35)',
      'rgba(211, 84, 0, 0.35)',
      'rgba(41, 128, 185, 0.35)',
      'rgba(192, 57, 43, 0.35)',
      'rgba(241, 196, 15, 0.35)'
    ];

    // 构建数据集
    const datasets = stats.map((s, i) => {
      const label = s.displayName || s.weapon.name;
      const isTop15 = top15Names.has(label);
      const isHighlighted = this.highlightWeapon && label === this.highlightWeapon;
      
      // 根据是否高亮/前15% 选择颜色和样式
      let colorIndex;
      let color;
      
      if (isHighlighted) {
        // ⭐ 高亮武器：使用鲜艳红色
        color = this.highlightColor;
      } else if (isTop15) {
        // 前15% 使用鲜艳颜色
        colorIndex = top15Names.size > 0 ? Array.from(top15Names).indexOf(label) % topColorPalette.length : i % topColorPalette.length;
        color = topColorPalette[colorIndex % topColorPalette.length];
      } else {
        // 其余使用淡色
        colorIndex = i % mutedColorPalette.length;
        color = mutedColorPalette[colorIndex];
      }
      
      // ⭐ 高亮武器使用最粗线条，前15%次之，其余最细
      let borderWidth;
      if (isHighlighted) {
        borderWidth = this.highlightBorderWidth; // 4px
      } else if (isTop15) {
        borderWidth = 2.5;
      } else {
        borderWidth = 1.0;
      }
      
      // ⭐ 高亮武器使用实线（即使不在前15%）
      let borderDash;
      if (isHighlighted) {
        borderDash = [];
      } else if (isTop15) {
        borderDash = [];
      } else {
        borderDash = [6, 4];
      }
      
      // ⭐ 高亮武器显示数据点
      const pointRadius = isHighlighted ? 4 : 0;
      const pointHoverRadius = isHighlighted ? 6 : (isTop15 ? 4 : 2);
      
      return {
        label: label,
        data: s.times,
        fill: false,
        tension: 0,
        hidden: i >= displayCount,
        pointRadius: pointRadius,
        pointHoverRadius: pointHoverRadius,
        borderColor: color,
        borderWidth: borderWidth,
        borderDash: borderDash,
        pointStyle: 'circle',
        pointBackgroundColor: isHighlighted ? color : (isTop15 ? color : 'rgba(0,0,0,0.1)'),
        pointBorderColor: isHighlighted ? color : (isTop15 ? color : 'rgba(0,0,0,0.1)'),
        // 保存排名信息，用于图例显示
        _isTop15: isTop15,
        _isHighlighted: isHighlighted,
        _rank: i + 1,
        _weightedAvg: s.weightedAvg
      };
    });

    if (datasets.length > 0 && displayCount === 0) {
      datasets[0].hidden = false;
    }

    if (this.chart) this.chart.destroy();
    
    const distCtx = this.getChartContext('distanceChart');
    this.chart = new Chart(distCtx, {
      type: 'line',
      data: { labels: distances, datasets },
      options: {
        scales: {
          x: { 
            title: { display: true, text: '距离 (m)' },
            grid: {
              color: 'rgba(0,0,0,0.05)'
            }
          },
          y: { 
            beginAtZero: true, 
            title: { display: true, text: '平均 TTK (ms)' }, 
            ticks: { 
              callback: v => formatTime(v, 'ms_raw', true) 
            },
            grid: {
              color: 'rgba(0,0,0,0.05)'
            }
          }
        },
        plugins: {
          datalabels: { display: false },
          tooltip: {
            mode: 'index', 
            intersect: false, 
            itemSort: (a, b) => a.parsed.y - b.parsed.y, 
            callbacks: {
              title: items => `${items[0].label}m`,
              label: i => {
                const label = i.dataset.label || '武器';
                const value = formatTime(i.raw, 'ms', true);
                const rank = i.dataset._rank || '?';
                const isTop15 = i.dataset._isTop15 ? '⭐' : '';
                const isHighlighted = i.dataset._isHighlighted ? '🔴' : '';
                return `${isHighlighted}${isTop15} #${rank} ${label}: ${value}`;
              }
            }
          },
          legend: { 
            position: 'bottom', 
            labels: { 
              usePointStyle: true,
              font: stats.length > 20 ? { size: 10 } : { size: 12 },
              padding: stats.length > 20 ? 4 : 8,
              // 自定义图例标签
              generateLabels: function(chart) {
                const labels = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                return labels.map((label, index) => {
                  const dataset = chart.data.datasets[index];
                  if (dataset) {
                    const rank = dataset._rank || '?';
                    const isTop15 = dataset._isTop15 ? '⭐ ' : '';
                    const isHighlighted = dataset._isHighlighted ? '🔴 ' : '';
                    label.text = `${isHighlighted}${isTop15}#${rank} ${label.text}`;
                    // 虚线样式在图例中显示
                    if (dataset.borderDash && dataset.borderDash.length > 0) {
                      label.lineDash = dataset.borderDash;
                    }
                    // 图例颜色也使用对应的颜色
                    label.fillStyle = dataset.borderColor;
                    label.strokeStyle = dataset.borderColor;
                    // 高亮武器的图例边框加粗
                    if (dataset._isHighlighted) {
                      label.borderWidth = 3;
                    }
                  }
                  return label;
                });
              }
            } 
          }
        },
        hover: {
          mode: 'index',
          intersect: false
        },
        interaction: {
          mode: 'index',
          intersect: false
        }
      },
      plugins: [ChartDataLabels, verticalLinePlugin]
    });
  }

  /**
   * 获取图表上下文
   */
  getChartContext(chartId) {
    return document.getElementById(chartId).getContext('2d');
  }

  /**
   * 销毁图表
   */
  destroy() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

  /**
   * 切换显示模式
   */
  setShowAllWeapons(showAll) {
    this.showAllWeapons = showAll;
  }
}

export default DistanceChart;