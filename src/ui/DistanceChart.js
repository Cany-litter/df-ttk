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
 * 线条样式规则：
 * - 用户高亮：红色实线，最粗 (4px)
 * - 前 15%（至少 3 条）：实线，粗 (2.5px)，鲜艳颜色
 * - 15%~40%：实线，中等 (1.5px)，中低饱和度颜色
 * - 40% 以后：虚线 (6,4)，细 (1.0px)，淡色
 */
export class DistanceChart {
  constructor() {
    this.chart = null;
    this.showAllWeapons = true;
    this.lastStats = null;
    this.lastDistances = null;
    this.lastParams = null;
    this.lastArmed = null;
    this.lastAttachments = null;
    
    this._hitRateLogPrinted = false;
    this._keyDistancesLogged = false;
    this._isUpdating = false;
    this.cacheManager = null;
    
    this.highlightWeapon = null;
    this.highlightColor = '#ff0000';
    this.highlightBorderWidth = 4;
    
    this._cacheHitCount = 0;
    this._cacheMissCount = 0;
  }

  // ============================================================
  // 1. 主更新方法
  // ============================================================

  update(armed, attachments, params) {
    perf.mark('distanceChartUpdate', 'DistanceChart 更新开始');
    
    if (this._isUpdating) {
      console.log('⏳ 图表正在更新中，跳过本次请求');
      return;
    }
    this._isUpdating = true;
    
    try {
      resetSeed();
      
      const showAllCheckbox = document.getElementById('showAllWeapons');
      if (showAllCheckbox) {
        this.showAllWeapons = showAllCheckbox.checked;
      } else {
        this.showAllWeapons = true;
      }
      
      const distances = Array.from({ length: 101 }, (_, i) => i);
      
      this.lastParams = params;
      this.lastArmed = armed;
      this.lastAttachments = attachments;
      this.lastDistances = distances;
      
      this._hitRateLogPrinted = false;
      this._keyDistancesLogged = false;
      this._cacheHitCount = 0;
      this._cacheMissCount = 0;
      
      this._readHighlightWeapon(armed);
      
      const dm = window.__app__?.dataManager;
      if (!dm) {
        console.error('DistanceChart: DataManager 未找到');
        return;
      }
      this.cacheManager = getConfigCacheManager(dm);
      
      const modifiedWeaponIds = dm.getModifiedWeaponIds ? dm.getModifiedWeaponIds() : [];
      const modifiedSet = new Set(modifiedWeaponIds);
      
      const stats = this._buildStatsWithCache(armed, attachments, params, distances, dm, modifiedSet);
      
      if (!stats || stats.length === 0) {
        console.warn('DistanceChart: 没有可用的统计数据');
        return;
      }
      
      const getWeight = (d) => 1.50 - (d / 100) * 1.00;
      
      const statsWithWeightedAvg = stats.map(s => {
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
      
      statsWithWeightedAvg.sort((a, b) => a.weightedAvg - b.weightedAvg);
      
      const totalCount = statsWithWeightedAvg.length;
      // ⭐ 前 15% 至少 3 条
      const top15PercentCount = Math.max(3, Math.ceil(totalCount * 0.15));
      const top15Weapons = statsWithWeightedAvg.slice(0, top15PercentCount);
      const top15Names = new Set(top15Weapons.map(s => s.displayName));
      
      this.lastStats = statsWithWeightedAvg;
      
      const economicParams = {
        kdRatio: params.kdRatio || 1.0,
        extractRate: params.extractRate || 0.5,
        extraCost: params.extraCost || 30
      };
      
      const havocCosts = this._calculateHavocCosts(statsWithWeightedAvg, economicParams);
      this._emitHavocCostUpdate(havocCosts);
      
      // ⭐ 传递 top15PercentCount 到 renderChart
      this.renderChart(distances, statsWithWeightedAvg, top15Names, top15PercentCount);
      
      const cacheStats = this.cacheManager.getStats();
      console.log(`📊 缓存统计: ${cacheStats.cached}/${cacheStats.total} 已缓存, ${modifiedSet.size} 个武器待重新计算`);
      
    } finally {
      this._isUpdating = false;
      perf.mark('distanceChartUpdateDone', 'DistanceChart 更新完成');
    }
  }

  // ============================================================
  // 2. 缓存构建
  // ============================================================

  _buildStatsWithCache(armed, attachments, params, distances, dm, modifiedSet) {
    const stats = [];
    const itemsToCalculate = [];

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
      
      console.log(`💾 保存了 ${savedCount} 个配置的缓存, 清除了 ${calculatedWeaponIds.length} 个修改标记`);
    }

    const total = this._cacheHitCount + this._cacheMissCount;
    if (total > 0) {
      const hitRate = Math.round((this._cacheHitCount / total) * 100);
      console.log(`📊 缓存命中率: ${this._cacheHitCount}/${total} (${hitRate}%)`);
    }

    return stats;
  }

  _keyPointsToTimes(keyPoints, distances) {
    return distances.map(d => {
      return this.cacheManager.interpolateTTK(keyPoints, d);
    });
  }

  _calculateAvg35(times) {
    if (!times || times.length === 0) return 0;
    const cutoff = Math.min(35, times.length - 1);
    const slice = times.slice(0, cutoff + 1);
    return slice.reduce((s, t) => s + t, 0) / slice.length;
  }

  // ============================================================
  // 3. 快速模式模拟
  // ============================================================

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
    const configHitRateMap = attachment.hitRateMap || params.hitRateMap || [];
    
    for (const distance of keyDistances) {
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
  // 4. 哈弗币消耗计算
  // ============================================================

  _calculateHavocCosts(stats, economicParams = {}) {
    const {
      kdRatio = 1.0,
      extractRate = 0.5,
      extraCost = 30
    } = economicParams;

    const havocCosts = {};

    for (const stat of stats) {
      const weapon = stat.weapon;
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
  // 6. 高亮武器相关
  // ============================================================

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
    
    const matched = armed.find(w => {
      const displayName = w._displayName || w.name;
      return displayName === selectedValue;
    });
    
    this.highlightWeapon = matched ? (matched._displayName || matched.name) : null;
  }

  updateHighlightOptions(armed) {
    const select = document.getElementById('highlightWeaponSelect');
    if (!select) return;
    
    const currentValue = select.value;
    
    select.innerHTML = '<option value="">无</option>';
    
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
    
    if (currentValue && seen.has(currentValue)) {
      select.value = currentValue;
    }
  }

  // ============================================================
  // 7. 渲染图表 ⭐ 核心修改：三层线条样式，中间层饱和度降低
  // ============================================================

  /**
   * 渲染距离图表
   * 
   * 线条样式规则：
   * - 用户高亮：红色实线，最粗 (4px)
   * - 前 15%（至少 3 条）：实线，粗 (2.5px)，鲜艳颜色 (#e74c3c, #2ecc71, #3498db 等)
   * - 15%~40%：实线，中等 (1.5px)，中低饱和度颜色 (rgba 0.6 透明度)
   * - 40% 以后：虚线 (6,4)，细 (1.0px)，淡色 (rgba 0.35 透明度)
   * 
   * @param {Array} distances - 距离数组
   * @param {Array} stats - 统计数据（已按加权平均排序）
   * @param {Set} top15Names - 前 15% 武器的名称集合
   * @param {number} top15Count - 前 15% 的数量（至少 3）
   */
  renderChart(distances, stats, top15Names, top15Count) {
    // 显示全部默认开启
    const maxDisplay = this.showAllWeapons ? stats.length : stats.length;
    const displayCount = Math.min(maxDisplay, stats.length);

    // ⭐ 计算 40% 阈值
    const totalCount = stats.length;
    const top40Count = Math.ceil(totalCount * 0.40);

    // 前 15% 使用鲜艳颜色
    const topColorPalette = [
      '#e74c3c', '#2ecc71', '#3498db', '#f39c12', '#9b59b6',
      '#1abc9c', '#e67e22', '#2c3e50', '#27ae60', '#8e44ad',
      '#16a085', '#d35400', '#2980b9', '#c0392b', '#f1c40f'
    ];
    
    // ⭐ 15%-40% 使用中低饱和度颜色（0.6 透明度，比前15%淡但比40%后浓）
    const midColorPalette = [
      'rgba(231, 76, 60, 0.60)',
      'rgba(46, 204, 113, 0.60)',
      'rgba(52, 152, 219, 0.60)',
      'rgba(243, 156, 18, 0.60)',
      'rgba(155, 89, 182, 0.60)',
      'rgba(26, 188, 156, 0.60)',
      'rgba(230, 126, 34, 0.60)',
      'rgba(44, 62, 80, 0.60)',
      'rgba(39, 174, 96, 0.60)',
      'rgba(142, 68, 173, 0.60)',
      'rgba(22, 160, 133, 0.60)',
      'rgba(211, 84, 0, 0.60)',
      'rgba(41, 128, 185, 0.60)',
      'rgba(192, 57, 43, 0.60)',
      'rgba(241, 196, 15, 0.60)'
    ];
    
    // 40% 以后使用淡色（0.35 透明度）
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
      const isTop15 = i < top15Count;           // ⭐ 前 15%（至少 3 条）
      const isTop40 = i < top40Count;           // ⭐ 前 40%
      const isHighlighted = this.highlightWeapon && label === this.highlightWeapon;
      
      let color;
      let borderWidth;
      let borderDash;
      let pointRadius;
      let pointHoverRadius;
      
      if (isHighlighted) {
        // ⭐ 用户高亮：红色粗实线，最粗
        color = this.highlightColor;
        borderWidth = this.highlightBorderWidth; // 4px
        borderDash = [];
        pointRadius = 4;
        pointHoverRadius = 6;
      } else if (isTop15) {
        // ⭐ 前 15%：鲜艳颜色，粗实线
        const colorIndex = i % topColorPalette.length;
        color = topColorPalette[colorIndex];
        borderWidth = 2.5;
        borderDash = [];
        pointRadius = 0;
        pointHoverRadius = 4;
      } else if (isTop40) {
        // ⭐ 15%~40%：中低饱和度颜色，细实线
        const colorIndex = i % midColorPalette.length;
        color = midColorPalette[colorIndex];
        borderWidth = 1.5;
        borderDash = [];
        pointRadius = 0;
        pointHoverRadius = 3;
      } else {
        // ⭐ 40% 以后：淡色，细虚线
        const colorIndex = i % mutedColorPalette.length;
        color = mutedColorPalette[colorIndex];
        borderWidth = 1.0;
        borderDash = [6, 4];
        pointRadius = 0;
        pointHoverRadius = 2;
      }
      
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
        _isTop15: isTop15,
        _isTop40: isTop40,
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
              generateLabels: function(chart) {
                const labels = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                return labels.map((label, index) => {
                  const dataset = chart.data.datasets[index];
                  if (dataset) {
                    const rank = dataset._rank || '?';
                    const isTop15 = dataset._isTop15 ? '⭐ ' : '';
                    const isHighlighted = dataset._isHighlighted ? '🔴 ' : '';
                    label.text = `${isHighlighted}${isTop15}#${rank} ${label.text}`;
                    if (dataset.borderDash && dataset.borderDash.length > 0) {
                      label.lineDash = dataset.borderDash;
                    }
                    label.fillStyle = dataset.borderColor;
                    label.strokeStyle = dataset.borderColor;
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