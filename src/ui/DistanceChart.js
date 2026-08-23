import { 
  TIME_UNITS, 
  CHART_CONFIG, 
  SIMULATION_CONFIG 
} from '../core/config.js';
import { SimulationEngine } from '../core/SimulationEngine.js';
import { BulletStrategyFactory } from '../core/BulletStrategy.js';
import { formatTime } from '../utils/formatters.js';
import { resetSeed } from '../utils/rng.js';

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
 * 距离折线图专用类
 */
export class DistanceChart {
  constructor() {
    this.chart = null;
    this.showAllWeapons = false;
    this.lastStats = null;
    this.lastDistances = null;
    this.lastParams = null;
    this.lastArmed = null;
    this.lastAttachments = null;
    
    // 控制台日志控制 - 只输出一次
    this._hitRateLogPrinted = false;
  }

  /**
   * 更新距离图表
   */
  update(armed, attachments, params) {
    resetSeed();
    
    const showAllCheckbox = document.getElementById('showAllWeapons');
    this.showAllWeapons = showAllCheckbox ? showAllCheckbox.checked : false;
    
    const distances = Array.from({ length: 101 }, (_, i) => i);
    const stats = this.calculateDistanceStats(armed, attachments, params, distances);
    stats.sort((a, b) => a.avg35 - b.avg35);

    // 保存数据供导出使用
    this.lastStats = stats;
    this.lastDistances = distances;
    this.lastParams = params;
    this.lastArmed = armed;
    this.lastAttachments = attachments;

    this.renderChart(distances, stats);
  }

  /**
   * 计算距离统计数据
   */
  calculateDistanceStats(armed, attachments, params, distances) {
    const dm = window.__app__?.dataManager;
    if (!dm) {
      console.error('DistanceChart: DataManager 未找到');
      return [];
    }

    // 重置日志标记，每次重新计算时允许再次输出
    this._hitRateLogPrinted = false;

    return armed.map((w, idx) => {
      const selectedBulletType = attachments[idx]?.bulletType;
      
      let realBulletKey = SimulationEngine.getRealBulletKey(selectedBulletType, w, params, dm);
      
      if (!realBulletKey) {
        console.warn(`武器 ${w.name} 没有匹配的子弹，跳过`);
        return null;
      }
      
      const bulletData = dm.getBulletById(realBulletKey);
      if (!bulletData) {
        console.warn(`武器 ${w.name} 的子弹 ${realBulletKey} 不存在，跳过`);
        return null;
      }
      
      const strategy = BulletStrategyFactory.getStrategy(realBulletKey);
      
      const validRanges = w.ranges.filter(r => r !== Infinity && r <= CHART_CONFIG.MAX_DISTANCE);
      const keyDistances = [0, ...validRanges];
      
      const simulationCache = new Map();
      
      // ============================================================
      // ✅ 修改点1：每个关键距离点独立计算命中率
      // ============================================================
      keyDistances.forEach(distance => {
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
        
        const { avgTime } = SimulationEngine.calculateAvgStats(
          w, 
          simParams, 
          SIMULATION_CONFIG.DISTANCE_SIM_COUNT, 
          strategy, 
          bulletData
        );
        
        const trigger = params.triggerDelayEnable 
          ? (w._current?.triggerDelay ?? w.triggerDelay ?? 0) / TIME_UNITS.SECONDS_TO_MS 
          : 0;
        
        simulationCache.set(distance, avgTime + trigger);
      });
      
      // ============================================================
      // ✅ 修改点2：插值时使用动态命中率（通过 params.hitRateMap 传递）
      // ============================================================
      const times = distances.map(d => {
        if (simulationCache.has(d)) {
          return simulationCache.get(d);
        } else {
          return this.calculateTTKByFormula(
            w, 
            d, 
            params, 
            strategy, 
            simulationCache,
            params.hitRateMap
          );
        }
      });
      
      const cutoff = distances.findIndex(d => d > CHART_CONFIG.CUTOFF_DISTANCE);
      const slice = cutoff === -1 ? times : times.slice(0, cutoff);
      const avg35 = slice.reduce((s, t) => s + t, 0) / slice.length;
      
      return { weapon: w, times, avg35 };
    }).filter(Boolean);
  }

  /**
   * 根据距离从命中率映射中获取对应的命中率
   * 使用 DataManager 的插值方法，降级方案为手动线性插值
   * 
   * @param {Array} hitRateMap - 距离-命中率映射数组 [{distance, rate}, ...]
   * @param {number} distance - 目标距离
   * @param {number} fallback - 默认值
   * @returns {number} 命中率 (0-1)
   */
  getHitRateForDistance(hitRateMap, distance, fallback = 0.85) {
    // 尝试使用 DataManager 的插值方法
    const dm = window.__app__?.dataManager;
    if (dm && typeof dm.getHitRateFromMap === 'function') {
      const result = dm.getHitRateFromMap(hitRateMap, distance, fallback);
      // 控制台日志：只输出一次关键距离点的命中率
      this._logHitRateOnce(hitRateMap, distance, result);
      return result;
    }
    
    // 降级方案：手动线性插值
    if (!hitRateMap || hitRateMap.length === 0) {
      return fallback;
    }
    
    const sorted = [...hitRateMap].sort((a, b) => a.distance - b.distance);
    
    // 过滤无效点
    const validPoints = sorted.filter(p => 
      p.distance >= 0 && 
      p.rate !== undefined && 
      p.rate !== null &&
      !isNaN(p.rate) &&
      p.rate >= 0 && 
      p.rate <= 1
    );
    
    if (validPoints.length === 0) {
      return fallback;
    }
    
    // 强制在10米处确保100%命中率
    const hasNearPoint = validPoints.some(p => p.distance <= 10);
    let points = [...validPoints];
    if (!hasNearPoint) {
      if (points[0].distance > 10) {
        points.unshift({ distance: 10, rate: 1.0 });
      } else {
        const nearPoint = points.find(p => p.distance <= 10);
        if (nearPoint && nearPoint.rate < 0.95) {
          nearPoint.rate = 1.0;
        }
      }
    } else {
      const nearPoint = points.find(p => p.distance <= 10);
      if (nearPoint && nearPoint.rate < 0.95) {
        nearPoint.rate = 1.0;
      }
    }
    
    points.sort((a, b) => a.distance - b.distance);
    
    let result;
    
    // 距离小于最近的点：从100%线性插值到最近点
    if (distance <= points[0].distance) {
      if (distance <= 0) {
        result = Math.min(1.0, points[0].rate);
      } else {
        const startRate = 1.0;
        const endRate = points[0].rate;
        const t = distance / points[0].distance;
        const rate = startRate + t * (endRate - startRate);
        result = Math.max(0, Math.min(1, rate));
      }
      this._logHitRateOnce(hitRateMap, distance, result);
      return result;
    }
    
    // 距离大于最远的点：线性外推
    if (distance >= points[points.length - 1].distance) {
      const last = points[points.length - 1];
      const prev = points[points.length - 2] || last;
      const distDiff = last.distance - prev.distance;
      if (distDiff <= 0) {
        result = Math.max(0, Math.min(1, last.rate));
      } else {
        const slope = (last.rate - prev.rate) / distDiff;
        const extrapolated = last.rate + slope * (distance - last.distance);
        result = Math.max(0, Math.min(1, extrapolated));
      }
      this._logHitRateOnce(hitRateMap, distance, result);
      return result;
    }
    
    // 线性插值
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      if (distance >= p1.distance && distance < p2.distance) {
        const distDiff = p2.distance - p1.distance;
        if (distDiff <= 0) {
          result = Math.max(0, Math.min(1, p1.rate));
        } else {
          const t = (distance - p1.distance) / distDiff;
          const rate = p1.rate + t * (p2.rate - p1.rate);
          result = Math.max(0, Math.min(1, rate));
        }
        this._logHitRateOnce(hitRateMap, distance, result);
        return result;
      }
    }
    
    result = Math.max(0, Math.min(1, points[points.length - 1].rate));
    this._logHitRateOnce(hitRateMap, distance, result);
    return result;
  }

  /**
   * 控制台日志输出 - 只输出一次，显示关键距离点的命中率
   * 在 getHitRateForDistance 被调用时，只记录第一个武器的命中率映射
   * 
   * @param {Array} hitRateMap - 距离-命中率映射
   * @param {number} distance - 当前查询距离
   * @param {number} rate - 计算出的命中率
   */
  _logHitRateOnce(hitRateMap, distance, rate) {
    if (this._hitRateLogPrinted) return;
    
    // 只在几个关键距离点输出日志
    const logDistances = [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100];
    if (!logDistances.includes(Math.round(distance))) return;
    
    // 格式化显示命中率映射
    const mapStr = hitRateMap && hitRateMap.length > 0
      ? hitRateMap.map(p => `${p.distance}m:${Math.round(p.rate * 100)}%`).join(', ')
      : '无映射';
    
    console.log(
      `📊 [距离-命中率] ${Math.round(distance)}m → ${Math.round(rate * 100)}%  ` +
      `(映射: ${mapStr})`
    );
    
    // 标记已输出，后续不再重复
    if (Math.round(distance) === 100) {
      this._hitRateLogPrinted = true;
      console.log('✅ 距离-命中率日志输出完成 (仅输出关键距离点)');
    }
  }

  /**
   * 使用公式计算TTK（支持两个关键点之间插值）
   * 
   * @param {Object} weapon - 武器对象
   * @param {number} distance - 目标距离
   * @param {Object} params - 参数
   * @param {Object} strategy - 子弹策略
   * @param {Map} simulationCache - 关键点模拟缓存
   * @param {Array} hitRateMap - 距离-命中率映射（用于日志）
   * @returns {number} TTK 时间（秒）
   */
  calculateTTKByFormula(weapon, distance, params, strategy, simulationCache, hitRateMap) {
    const keys = Array.from(simulationCache.keys()).filter(k => k <= distance);
    const startDistance = keys.length ? Math.max(...keys) : 0;
    const startTTK = simulationCache.get(startDistance);
    
    if (!startTTK) {
      return 0;
    }
    
    if (distance === startDistance) {
      return startTTK;
    }
    
    // ✅ 查找下一个关键点
    const nextKeys = Array.from(simulationCache.keys())
      .filter(k => k > distance)
      .sort((a, b) => a - b);
    
    // 如果存在下一个关键点，在两个关键点之间插值
    if (nextKeys.length > 0) {
      const nextDistance = nextKeys[0];
      const nextTTK = simulationCache.get(nextDistance);
      
      if (nextTTK !== undefined) {
        const t = (distance - startDistance) / (nextDistance - startDistance);
        return startTTK + t * (nextTTK - startTTK);
      }
    }
    
    // 没有下一个关键点：用飞行时间推算
    const velocity = weapon._current?.velocity ?? weapon.velocity ?? 575;
    const flightTimeDiff = (distance - startDistance) / velocity;
    return startTTK + flightTimeDiff;
  }

  /**
   * 渲染距离图表
   */
  renderChart(distances, stats) {
    const maxDisplay = this.showAllWeapons ? stats.length : CHART_CONFIG.TOP_WEAPONS_COUNT;
    const displayCount = Math.min(maxDisplay, stats.length);

    const datasets = stats.map((s, i) => ({
      label: s.weapon.name,
      data: s.times,
      fill: false,
      tension: 0,
      hidden: i >= displayCount,
      pointRadius: 0,
      pointHoverRadius: 3,
    }));

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
          x: { title: { display: true, text: '距离 (m)' } },
          y: { 
            beginAtZero: true, 
            title: { display: true, text: '平均 TTK' }, 
            ticks: { callback: v => formatTime(v, 'ms_raw') } 
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
              label: i => `${i.dataset.label}: ${formatTime(i.raw, 'ms')}`
            }
          },
          legend: { 
            position: 'bottom', 
            labels: { 
              usePointStyle: true,
              font: stats.length > 20 ? { size: 10 } : { size: 12 },
              padding: stats.length > 20 ? 4 : 8
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

  // ==================== 导出功能 ====================

  /**
   * 获取底部枪械表格数据
   */
  getWeaponsTableData(armed, attachments, muzzles) {
    return armed.map((w, idx) => {
      const attach = attachments[idx] || {};
      
      const current = w._current || w;
      const original = w._original || w;
      
      const rangesStr = (current.ranges || []).map(r => 
        r === Infinity ? '∞' : Math.round(r)
      ).join(',');
      
      const mult = current.mult || { head: 1, chest: 1, stomach: 1, limbs: 1 };
      const partDamage = [
        (current.flesh * (mult.head || 1)).toFixed(1),
        (current.flesh * (mult.chest || 1)).toFixed(1),
        (current.flesh * (mult.stomach || 1)).toFixed(1),
        (current.flesh * (mult.limbs || 1)).toFixed(1)
      ].join(',');
      
      let barrelName = '无';
      const barrelIndex = attach.barrelIndex || 0;
      if (barrelIndex > 0 && w.barrels && w.barrels[barrelIndex - 1]) {
        barrelName = w.barrels[barrelIndex - 1].name || '无';
      }
      
      let muzzleName = '无';
      const muzzleIndex = attach.muzzleIndex || 0;
      if (muzzleIndex > 0 && muzzles && muzzles[muzzleIndex]) {
        muzzleName = muzzles[muzzleIndex].name || '无';
      }
      
      const hitRate = attach.hitRate !== undefined && attach.hitRate !== null 
        ? attach.hitRate 
        : (original.hitRate !== undefined && original.hitRate !== null ? original.hitRate : '');
      
      let velocityPrecision = '0%';
      const precisionSlider = document.querySelector(`.velocity-precision-slider[data-weapon="${idx}"]`);
      if (precisionSlider) {
        const val = parseFloat(precisionSlider.value) || 0;
        velocityPrecision = `${Math.round(val * 100)}%`;
      }
      
      return {
        name: w.name || '未知',
        type: w.type || '未知',
        rof: Math.round(current.rof || 0),
        ranges: rangesStr,
        flesh: Math.round(current.flesh || 0),
        armor: Math.round(current.armor || 0),
        partDamage: partDamage,
        barrel: barrelName,
        muzzle: muzzleName,
        bulletType: attach.bulletType || '全局',
        hitRate: hitRate,
        velocityPrecision: velocityPrecision
      };
    });
  }

  /**
   * 获取每5m的TTK数据和排名
   */
  getDistanceDataWithRanks(stats, distances, step = 5) {
    const filteredDistances = distances.filter((d, i) => i % step === 0);
    
    const weaponsData = stats.map((s) => {
      const ttkValues = filteredDistances.map(d => {
        const idx = distances.indexOf(d);
        const value = s.times[idx];
        return value !== undefined ? parseFloat((value * 1000).toFixed(2)) : null;
      });
      
      const ranks = filteredDistances.map((d, distIdx) => {
        const currentTtk = ttkValues[distIdx];
        if (currentTtk === null || currentTtk === undefined) return null;
        
        const allTtks = stats.map((other) => {
          const idx = distances.indexOf(d);
          const val = other.times[idx];
          return val !== undefined ? parseFloat((val * 1000).toFixed(2)) : Infinity;
        });
        
        const sorted = [...allTtks].sort((a, b) => a - b);
        let rankIndex = sorted.findIndex(v => v === currentTtk);
        if (rankIndex === -1) {
          rankIndex = sorted.findIndex(v => Math.abs(v - currentTtk) < 0.01);
        }
        if (rankIndex === -1) {
          rankIndex = sorted.indexOf(currentTtk);
        }
        const rank = rankIndex + 1;
        
        return rank;
      });
      
      return {
        name: s.weapon.name,
        ttk: ttkValues,
        ranks: ranks
      };
    });
    
    const orderedWeaponsData = stats.map(s => 
      weaponsData.find(w => w.name === s.weapon.name)
    ).filter(Boolean);
    
    return {
      distances: filteredDistances,
      weapons: orderedWeaponsData
    };
  }

  /**
   * 导出折线图数据为 JSON 格式
   */
  exportAsJSON() {
    if (!this.lastStats || !this.lastDistances) {
      alert('⚠️ 请先生成折线图再导出数据！');
      return;
    }

    const stats = this.lastStats;
    const distances = this.lastDistances;
    const params = this.lastParams || {};
    const armed = this.lastArmed || [];
    const attachments = this.lastAttachments || [];

    let muzzles = [];
    if (window.__app__?.dataManager) {
      muzzles = window.__app__.dataManager.getMuzzles() || [];
    }

    const weaponsTableData = this.getWeaponsTableData(armed, attachments, muzzles);
    const distanceData = this.getDistanceDataWithRanks(stats, distances, 5);

    const data = {
      meta: {
        exportedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
        description: 'TTK计算器 - 折线图数据导出',
        params: {
          bulletLevel: params.bulletLevel,
          armorLevel: params.armorLevel,
          armorValue: params.armorValue,
          helmetLevel: params.helmetLevel,
          helmetValue: params.helmetValue,
          healthValue: params.healthValue,
          hitRate: params.hitRate,
          triggerDelayEnable: params.triggerDelayEnable,
          distance: params.distance
        },
        note: 'TTK值单位: 毫秒(ms)，数据点间隔5米。排名基于每个距离点所有武器的TTK排序，TTK越小排名越靠前，允许并列排名。'
      },
      weapons: weaponsTableData,
      distanceData: {
        distances: distanceData.distances,
        weapons: distanceData.weapons
      }
    };

    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    this.downloadBlob(blob, `ttk_distance_data_${new Date().toISOString().slice(0, 10)}.json`);
  }

  /**
   * 通用下载方法
   */
  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`✅ 已导出: ${filename}`);
  }
}