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
 * 
 * 适配新的 configs 结构：
 * - 从 configs 读取命中率曲线、子弹类型
 * - 使用 configs 进行距离模拟
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
    this.lastConfigs = null;
  }

  /**
   * 更新距离图表
   * @param {Array} armed - 应用附件后的武器数据
   * @param {Array} attachments - 附件配置数组
   * @param {Object} params - 页面参数
   */
  update(armed, attachments, params) {
    resetSeed();
    
    const showAllCheckbox = document.getElementById('showAllWeapons');
    this.showAllWeapons = showAllCheckbox ? showAllCheckbox.checked : false;
    
    // 获取 configs（从 armed 中的武器对象提取）
    const configs = armed.map((w, idx) => {
      // 从原始武器中获取 configs
      const weapons = window.app?.weaponManager?.getWeapons() || [];
      const weapon = weapons[idx];
      if (weapon && weapon.configs && weapon.configs.length > 0) {
        return weapon.configs[0];
      }
      return null;
    });
    
    this.lastConfigs = configs;
    
    const distances = Array.from({ length: 101 }, (_, i) => i);
    const stats = this.calculateDistanceStats(armed, attachments, params, distances, configs);
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
   * @param {Array} armed - 应用附件后的武器数据
   * @param {Array} attachments - 附件配置数组
   * @param {Object} params - 页面参数
   * @param {Array} distances - 距离数组
   * @param {Array} configs - 改枪配置数组
   * @returns {Array} 距离统计数据
   */
  calculateDistanceStats(armed, attachments, params, distances, configs = null) {
    return armed.map((w, idx) => {
      const selectedBulletType = attachments[idx]?.bulletType || null;
      const config = (configs && configs[idx]) ? configs[idx] : null;
      
      // 获取真实子弹类型
      let realBulletKey = selectedBulletType;
      if (!realBulletKey && config && config.bulletType !== undefined) {
        realBulletKey = config.bulletType;
      }
      // 如果还没有，使用 params.bulletLevel
      if (!realBulletKey) {
        realBulletKey = params.bulletLevel;
      }
      
      // 检查子弹是否被武器允许
      const allowed = w.allowedBullets || [];
      if (!allowed.includes(realBulletKey) && realBulletKey !== params.bulletLevel) {
        // 尝试使用 params.bulletLevel
        if (allowed.includes(params.bulletLevel)) {
          realBulletKey = params.bulletLevel;
        } else {
          // 使用第一个允许的子弹
          realBulletKey = allowed.length > 0 ? allowed[0] : params.bulletLevel;
        }
      }
      
      // 验证真实子弹类型
      if (!realBulletKey) return null;
      
      // 尝试从 bulletData 验证
      try {
        const { bulletData } = require('../core/bullets.js');
        if (!bulletData[realBulletKey]) {
          // 如果子弹数据不存在，尝试使用 params.bulletLevel
          const { bulletData: bd } = require('../core/bullets.js');
          if (bd[params.bulletLevel]) {
            realBulletKey = params.bulletLevel;
          } else {
            return null;
          }
        }
      } catch (e) {
        // 如果验证失败，继续尝试
      }
      
      const hitRate = attachments[idx]?.hitRate != null ? attachments[idx].hitRate : params.hitRate;
      const strategy = BulletStrategyFactory.getStrategy(realBulletKey);
      
      const validRanges = w.ranges.filter(r => r !== Infinity && r <= CHART_CONFIG.MAX_DISTANCE);
      const keyDistances = [0, ...validRanges];
      
      const simulationCache = new Map();
      
      keyDistances.forEach(distance => {
        const simParams = { ...params, distance, hitRate, bulletLevel: realBulletKey };
        const { avgTime } = SimulationEngine.calculateAvgStats(w, simParams, SIMULATION_CONFIG.DISTANCE_SIM_COUNT, strategy, config);
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
   * @param {Array} distances - 距离数组
   * @param {Array} stats - 统计数据
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
    if (!distCtx) {
      console.warn('距离图表 Canvas 未找到');
      return;
    }
    
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
   * 使用公式计算TTK（用于距离图表外推）
   * @param {Object} weapon - 武器对象
   * @param {number} distance - 距离
   * @param {Object} params - 页面参数
   * @param {Object} strategy - 子弹策略
   * @param {Map} simulationCache - 模拟缓存
   * @returns {number} TTK值
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
   * @param {string} chartId - 图表元素ID
   * @returns {CanvasRenderingContext2D|null} Canvas上下文
   */
  getChartContext(chartId) {
    const canvas = document.getElementById(chartId);
    if (!canvas) {
      console.warn(`图表元素 #${chartId} 未找到`);
      return null;
    }
    return canvas.getContext('2d');
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
   * @param {boolean} showAll - 是否显示全部武器
   */
  setShowAllWeapons(showAll) {
    this.showAllWeapons = showAll;
  }

  /**
   * 获取当前图表数据
   * @returns {Object} 图表数据
   */
  getData() {
    if (!this.chart) return null;
    return this.chart.data;
  }

  /**
   * 获取当前统计数据
   * @returns {Array} 统计数据
   */
  getStats() {
    return this.lastStats;
  }

  // ==================== 导出功能 ====================

  /**
   * 获取底部枪械表格数据
   * @param {Array} armed - 应用附件后的武器数据
   * @param {Array} attachments - 附件配置数组
   * @param {Array} muzzles - 枪口数据
   * @param {Array} configs - 改枪配置数组
   * @returns {Array} 表格数据数组
   */
  getWeaponsTableData(armed, attachments, muzzles, configs = null) {
    return armed.map((w, idx) => {
      const attach = attachments[idx] || {};
      const config = (configs && configs[idx]) ? configs[idx] : null;
      
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
      
      // 获取命中率 - 从 config 读取
      let hitRate = '';
      if (config && config.hitRate !== undefined && config.hitRate !== null) {
        hitRate = config.hitRate;
      } else if (attach.hitRate !== undefined && attach.hitRate !== null) {
        hitRate = attach.hitRate;
      }
      
      // 获取子弹类型 - 从 config 读取
      let bulletType = '全局';
      if (config && config.bulletType !== undefined) {
        bulletType = config.bulletType;
      } else if (attach.bulletType) {
        bulletType = attach.bulletType;
      }
      
      // 获取枪口初速精校 - 从 config 读取
      let velocityPrecision = '0%';
      if (config && config.precision !== undefined) {
        velocityPrecision = `${Math.round(config.precision * 100)}%`;
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
        bulletType: bulletType,
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
        
        // 收集所有武器在当前距离点的TTK值
        const allTtks = stats.map((other) => {
          const idx = distances.indexOf(d);
          const val = other.times[idx];
          return val !== undefined ? parseFloat((val * 1000).toFixed(2)) : Infinity;
        });
        
        // 排序并计算排名
        const sorted = [...allTtks].sort((a, b) => a - b);
        // 使用 findIndex 查找第一个匹配的值（处理并列排名）
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
    const configs = this.lastConfigs || [];

    // 获取枪口数据（从 WeaponManager 获取）
    let muzzles = [];
    if (window.app?.weaponManager) {
      muzzles = window.app.weaponManager.getMuzzles() || [];
    }

    // 1. 获取底部枪械表格数据
    const weaponsTableData = this.getWeaponsTableData(armed, attachments, muzzles, configs);

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
   * @param {Blob} blob - 数据Blob
   * @param {string} filename - 文件名
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