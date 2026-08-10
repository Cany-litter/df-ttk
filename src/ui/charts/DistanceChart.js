import { 
  TIME_UNITS, 
  CHART_CONFIG, 
  SIMULATION_CONFIG 
} from '../../constants/config.js';
import { SimulationEngine } from '../../core/SimulationEngine.js';
import { BulletStrategyFactory } from '../../core/BulletStrategy.js';
import { formatTime } from '../../utils/formatters.js';
import { resetSeed } from '../../utils/rng.js';

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
    return armed.map((w, idx) => {
      const selectedBulletType = attachments[idx].bulletType;
      let realBulletKey = SimulationEngine.getRealBulletKey(selectedBulletType, w, params);
      
      if (!realBulletKey) return null;
      
      const hitRate = attachments[idx].hitRate != null ? attachments[idx].hitRate : params.hitRate;
      const strategy = BulletStrategyFactory.getStrategy(realBulletKey);
      
      const validRanges = w.ranges.filter(r => r !== Infinity && r <= CHART_CONFIG.MAX_DISTANCE);
      const keyDistances = [0, ...validRanges];
      
      const simulationCache = new Map();
      
      keyDistances.forEach(distance => {
        const simParams = { ...params, distance, hitRate, bulletLevel: realBulletKey };
        const { avgTime } = SimulationEngine.calculateAvgStats(w, simParams, SIMULATION_CONFIG.DISTANCE_SIM_COUNT, strategy);
        const trigger = params.triggerDelayEnable ? w.triggerDelay / TIME_UNITS.SECONDS_TO_MS : 0;
        simulationCache.set(distance, avgTime + trigger);
      });
      
      const times = distances.map(d => {
        if (simulationCache.has(d)) {
          return simulationCache.get(d);
        } else {
          return this.calculateTTKByFormula(w, d, params, strategy, simulationCache);
        }
      });
      
      const cutoff = distances.findIndex(d => d > CHART_CONFIG.CUTOFF_DISTANCE);
      const slice = cutoff === -1 ? times : times.slice(0, cutoff);
      const avg35 = slice.reduce((s, t) => s + t, 0) / slice.length;
      
      return { weapon: w, times, avg35 };
    }).filter(Boolean);
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
   * 使用公式计算TTK
   */
  calculateTTKByFormula(weapon, distance, params, strategy, simulationCache) {
    const keys = Array.from(simulationCache.keys()).filter(k => k <= distance);
    const startDistance = keys.length ? Math.max(...keys) : 0;
    const startTTK = simulationCache.get(startDistance);
    
    if (!startTTK) {
      return 0;
    }
    
    if (distance === startDistance) {
      return startTTK;
    }
    
    const flightTimeDiff = (distance - startDistance) / weapon.velocity;
    return startTTK + flightTimeDiff;
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
   * @param {Array} armed - 应用附件后的武器数据
   * @param {Array} attachments - 附件配置数组
   * @param {Array} muzzles - 枪口数据
   * @returns {Array} 表格数据数组
   */
  getWeaponsTableData(armed, attachments, muzzles) {
    return armed.map((w, idx) => {
      const attach = attachments[idx] || {};
      
      // 获取武器当前数据（应用附件后的计算值）
      const current = w._current || w;
      const original = w._original || w;
      
      // 格式化射程
      const rangesStr = (current.ranges || []).map(r => 
        r === Infinity ? '∞' : Math.round(r)
      ).join(',');
      
      // 计算部位伤害：当前基础伤害 × 各部位倍率
      const mult = current.mult || { head: 1, chest: 1, stomach: 1, limbs: 1 };
      const partDamage = [
        (current.flesh * (mult.head || 1)).toFixed(1),
        (current.flesh * (mult.chest || 1)).toFixed(1),
        (current.flesh * (mult.stomach || 1)).toFixed(1),
        (current.flesh * (mult.limbs || 1)).toFixed(1)
      ].join(',');
      
      // 获取枪管名称
      let barrelName = '无';
      const barrelIndex = attach.barrelIndex || 0;
      if (barrelIndex > 0 && w.barrels && w.barrels[barrelIndex - 1]) {
        barrelName = w.barrels[barrelIndex - 1].name || '无';
      }
      
      // 获取枪口名称
      let muzzleName = '无';
      const muzzleIndex = attach.muzzleIndex || 0;
      if (muzzleIndex > 0 && muzzles && muzzles[muzzleIndex]) {
        muzzleName = muzzles[muzzleIndex].name || '无';
      }
      
      // 获取命中率
      const hitRate = attach.hitRate !== undefined && attach.hitRate !== null 
        ? attach.hitRate 
        : (original.hitRate !== undefined && original.hitRate !== null ? original.hitRate : '');
      
      // 获取枪口初速精校
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
   * @param {Array} stats - 统计数据
   * @param {Array} distances - 距离数组
   * @param {number} step - 步长，默认5
   * @returns {Object} { distances, weapons }
   */
  getDistanceDataWithRanks(stats, distances, step = 5) {
    // 按步长筛选距离点
    const filteredDistances = distances.filter((d, i) => i % step === 0);
    
    // 构建每个武器的TTK数据和排名
    const weaponsData = stats.map((s) => {
      // 计算TTK值（四舍五入到小数点后2位，单位毫秒）
      const ttkValues = filteredDistances.map(d => {
        const idx = distances.indexOf(d);
        const value = s.times[idx];
        return value !== undefined ? parseFloat((value * 1000).toFixed(2)) : null;
      });
      
      // 计算每个距离点的排名
      const ranks = filteredDistances.map((d, distIdx) => {
        const currentTtk = ttkValues[distIdx];
        if (currentTtk === null || currentTtk === undefined) return null;
        
        // 收集所有武器在当前距离点的TTK值（同样四舍五入到小数点后2位）
        const allTtks = stats.map((other) => {
          const idx = distances.indexOf(d);
          const val = other.times[idx];
          return val !== undefined ? parseFloat((val * 1000).toFixed(2)) : Infinity;
        });
        
        // 排序并计算排名（TTK越小排名越靠前，允许并列）
        const sorted = [...allTtks].sort((a, b) => a - b);
        // 使用 findIndex 查找第一个匹配的值（处理并列排名）
        let rankIndex = sorted.findIndex(v => v === currentTtk);
        // 如果 findIndex 找不到（浮点数精度问题），使用容差比较
        if (rankIndex === -1) {
          rankIndex = sorted.findIndex(v => Math.abs(v - currentTtk) < 0.01);
        }
        // 如果仍然找不到，使用 indexOf 作为最后的尝试
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
    
    // 按avg35排序（与stats顺序一致）
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

    // 获取枪口数据（从 WeaponManager 获取）
    let muzzles = [];
    if (window.app?.weaponManager) {
      muzzles = window.app.weaponManager.getMuzzles() || [];
    }

    // 1. 获取底部枪械表格数据
    const weaponsTableData = this.getWeaponsTableData(armed, attachments, muzzles);

    // 2. 获取每5m的TTK数据和排名
    const distanceData = this.getDistanceDataWithRanks(stats, distances, 5);

    // 3. 组装完整的JSON
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