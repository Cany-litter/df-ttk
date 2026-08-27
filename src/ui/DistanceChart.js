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
   */
  update(armed, attachments, params) {
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
      
      // 重置日志标记
      this._hitRateLogPrinted = false;
      this._keyDistancesLogged = false;
      
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
      
      console.log(`📊 前 15% 武器 (${top15PercentCount}/${statsWithWeightedAvg.length}):`, 
                  Array.from(top15Names).join(', '));
      
      // 保存数据供导出使用
      this.lastStats = statsWithWeightedAvg;
      
      // 渲染图表（传入 top15Names 用于线条样式判断）
      this.renderChart(distances, statsWithWeightedAvg, top15Names);
      
      // 输出缓存统计
      const cacheStats = this.cacheManager.getStats();
      console.log(`📊 缓存统计: ${cacheStats.cached}/${cacheStats.total} 已缓存, ${modifiedSet.size} 个武器待重新计算`);
      
    } finally {
      this._isUpdating = false;
    }
  }

  // ============================================================
  // 2. 缓存构建
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
        
        console.log(`✅ 缓存命中: ${displayName} (${keyPoints.length} 个关键点)`);
      }
    }

    // 第二遍：计算未命中的武器
    if (itemsToCalculate.length > 0) {
      console.log(`🔬 需要计算 ${itemsToCalculate.length} 个配置...`);
      
      let savedCount = 0;
      
      for (const item of itemsToCalculate) {
        const { weapon, attachment, config, weaponId, configId, displayName } = item;
        
        console.log(`  计算中: ${displayName} (${item.reason})`);
        
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
          console.log(`  💾 缓存已保存: ${displayName} (${keyPoints.length} 个关键点)`);
          
          stats.push({
            weapon,
            times,
            avg35,
            displayName: displayName,
            fromCache: false,
            keyPoints: keyPoints
          });
          
          console.log(`  ✅ 计算完成: ${displayName}`);
        }
      }
      
      const calculatedWeaponIds = [...new Set(itemsToCalculate.map(item => item.weaponId))];
      for (const id of calculatedWeaponIds) {
        dm.clearWeaponModified && dm.clearWeaponModified(id);
      }
      console.log(`📝 已清除 ${calculatedWeaponIds.length} 个武器的修改标记`);
      
      console.log(`💾 本次保存了 ${savedCount} 个配置的缓存到 DataManager.data`);
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
  // 3. 快速模式模拟（单武器）
  // ============================================================

  /**
   * 计算单把武器的快速模式数据
   * 返回关键点数据
   */
  _calculateFastModeForSingleWeapon(weapon, params, distances, attachment, dm) {
    const selectedBulletType = attachment.bulletType;
    let realBulletKey = SimulationEngine.getRealBulletKey(
      selectedBulletType, weapon, params, dm
    );
    
    if (!realBulletKey) {
      console.warn(`武器 ${weapon.name} 没有匹配的子弹，跳过`);
      return null;
    }
    
    const bulletData = dm.getBulletById(realBulletKey);
    if (!bulletData) {
      console.warn(`武器 ${weapon.name} 的子弹 ${realBulletKey} 不存在`);
      return null;
    }
    
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
    
    for (const distance of keyDistances) {
      const hitRateAtDistance = this.getHitRateForDistance(
        params.hitRateMap,
        distance,
        0.85
      );
      
      const simParams = { 
        ...params, 
        distance, 
        hitRate: hitRateAtDistance, 
        bulletLevel: realBulletKey 
      };
      
      const avgTime = SimulationEngine.calculateSinglePoint(
        weapon, 
        simParams, 
        SIMULATION_CONFIG.DEFAULT_SIM_COUNT, 
        strategy, 
        bulletData
      );
      
      const trigger = params.triggerDelayEnable 
        ? (weapon._current?.triggerDelay ?? weapon.triggerDelay ?? 0) / TIME_UNITS.SECONDS_TO_MS 
        : 0;
      
      const totalTimeMs = (avgTime + trigger) * TIME_UNITS.SECONDS_TO_MS;
      
      keyPoints.push({ d: distance, t: totalTimeMs });
    }
    
    const times = distances.map(d => {
      return this.cacheManager.interpolateTTK(keyPoints, d);
    });
    
    const avg35 = this._calculateAvg35(times);
    
    console.log(`  关键点: ${keyPoints.length} 个, avg35: ${avg35.toFixed(1)}ms`);
    
    return { keyPoints, times, avg35 };
  }

  // ============================================================
  // 4. 辅助方法
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
  // 5. 渲染图表
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
      
      // 根据是否前15% 选择颜色和样式
      let colorIndex;
      let color;
      
      if (isTop15) {
        // 前15% 使用鲜艳颜色，按排名顺序分配
        colorIndex = top15Names.size > 0 ? Array.from(top15Names).indexOf(label) % topColorPalette.length : i % topColorPalette.length;
        color = topColorPalette[colorIndex % topColorPalette.length];
      } else {
        // 其余使用淡色
        colorIndex = i % mutedColorPalette.length;
        color = mutedColorPalette[colorIndex];
      }
      
      // 前15% 使用更粗的线条 (2.5)，其余使用细线 (1.0)
      const borderWidth = isTop15 ? 2.5 : 1.0;
      
      return {
        label: label,
        data: s.times,
        fill: false,
        tension: 0,
        hidden: i >= displayCount,
        pointRadius: 0,
        pointHoverRadius: isTop15 ? 4 : 2,
        borderColor: color,
        borderWidth: borderWidth,
        // 前15% 实线，其余虚线
        borderDash: isTop15 ? [] : [6, 4],
        pointStyle: 'circle',
        pointBackgroundColor: color,
        pointBorderColor: isTop15 ? color : 'rgba(0,0,0,0.1)',
        // 保存排名信息，用于图例显示
        _isTop15: isTop15,
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
                return `${isTop15} #${rank} ${label}: ${value}`;
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
                    label.text = `${isTop15}#${rank} ${label.text}`;
                    // 虚线样式在图例中显示
                    if (dataset.borderDash && dataset.borderDash.length > 0) {
                      label.lineDash = dataset.borderDash;
                    }
                    // 图例颜色也使用对应的颜色
                    label.fillStyle = dataset.borderColor;
                    label.strokeStyle = dataset.borderColor;
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