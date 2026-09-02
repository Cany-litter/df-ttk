// src/ui/TTKChart.js
import { 
  TIME_UNITS, 
  CHART_COLORS, 
  RANK_COLORS, 
  CHART_CONFIG 
} from '../core/config.js';
import { formatTime } from '../utils/formatters.js';
import { getConfigCacheManager } from '../core/ConfigCacheManager.js';
import perf from '../utils/performance.js';

/**
 * TTK柱状图专用类
 * 
 * 使用缓存的 keyPoints 数据，通过插值计算指定距离的 TTK
 * 优先从缓存读取，缓存未命中时使用 SimulationEngine 的计算结果
 */
export class TTKChart {
  constructor() {
    this.lastResults = [];
    this.previousResults = [];
    this.chart = null;
    this.initialize();
  }

  initialize() {
    this.registerPlugins();
    this.createChart();
  }

  registerPlugins() {
    const rankDelayPlugin = {
      id: 'rankDelayPlugin',
      afterDatasetsDraw: (chart) => this.drawRankDelayPlugin(chart)
    };
    Chart.register(rankDelayPlugin);
    
    if (typeof ChartDataLabels === 'undefined') {
      setTimeout(() => this.registerPlugins(), 100);
      return;
    }
    Chart.register(ChartDataLabels);
  }

  createChart() {
    const ttkCtx = this.getChartContext('ttkChart');
    this.chart = new Chart(ttkCtx, {
      type: 'bar',
      data: {
        labels: [], 
        datasets: [
          { label: '无空枪射击延迟', backgroundColor: CHART_COLORS.NO_MISS_FIRE, data: [] },
          { label: '平均连发间隔', backgroundColor: CHART_COLORS.BURST_INTERVAL, data: [] },
          { label: '平均空枪延迟', backgroundColor: CHART_COLORS.EMPTY_DELAY, data: [] },
          { label: '飞行延迟', backgroundColor: CHART_COLORS.FLIGHT_DELAY, data: [] },
          { label: '扳机延迟', backgroundColor: CHART_COLORS.TRIGGER_DELAY, data: [] }
        ]
      },
      options: {
        layout: { padding: { top: CHART_CONFIG.PADDING_TOP } },
        plugins: {
          datalabels: { 
            display: ctx => ctx.datasetIndex === 4, 
            anchor: 'end', 
            align: 'end', 
            color: '#000', 
            formatter: (value, ctx) => this.formatTTKLabel(value, ctx)
          },
          tooltip: { 
            mode: 'index', 
            intersect: false, 
            callbacks: this.getTooltipCallbacks()
          },
          legend: { 
            position: 'bottom', 
            labels: { 
              usePointStyle: true,
              font: (ctx) => {
                const stats = this.lastResults;
                return stats.length > 20 ? { size: 10 } : { size: 12 };
              },
              padding: (ctx) => {
                const stats = this.lastResults;
                return stats.length > 20 ? 4 : 8;
              }
            } 
          }
        },
        responsive: true,
        scales: {
          x: { 
            stacked: true,
            ticks: {
              maxRotation: 45,
              minRotation: 0,
              font: (ctx) => {
                const stats = this.lastResults;
                return stats.length > 30 ? { size: 9 } : stats.length > 20 ? { size: 10 } : { size: 11 };
              }
            }
          },
          y: { 
            stacked: true, 
            beginAtZero: true, 
            ticks: { 
              callback: v => formatTime(v, 'ms', true) 
            } 
          }
        }
      }
    });
  }

  /**
   * 更新柱状图
   * 
   * ⭐ 核心修改：优先从缓存读取 TTK 值
   * 只有缓存未命中时才使用 SimulationEngine 的计算结果
   * 
   * @param {Array} stats - 统计结果（来自 SimulationEngine，作为缓存未命中时的降级方案）
   * @param {Object} params - 参数 { distance, triggerDelayEnable }
   */
  update(stats, params) {
    perf.mark('ttkChartUpdate', 'TTK图表更新开始');
    
    this.previousResults = this.lastResults.slice();
    
    const dm = window.__app__?.dataManager;
    let cacheManager = null;
    if (dm) {
      cacheManager = getConfigCacheManager(dm);
    }
    
    const distance = params.distance || 30;
    
    // ⭐ 统计缓存命中情况
    let cacheHitCount = 0;
    let cacheMissCount = 0;
    
    const newResults = stats.map(stat => {
      const weapon = stat.weapon;
      const weaponId = weapon.id;
      const configId = weapon._configId || '#1';
      
      let totalTimeMs = 0;
      let fromCache = false;
      let keyPoints = null;
      let avgShots = stat.avgShots || 0;
      let avgMisses = stat.avgMisses || 0;
      let avgBurstInterval = stat.avgBurstInterval || 0;
      
      // ⭐⭐⭐ 优先从缓存获取 TTK 值
      if (dm && cacheManager) {
        const price = dm.getPriceByWeaponId(weaponId);
        if (price) {
          const config = price.configs.find(c => c.id === configId);
          if (config && config.cache && config.cache.keyPoints) {
            keyPoints = config.cache.keyPoints;
            // 用插值计算指定距离的 TTK（返回毫秒）
            totalTimeMs = cacheManager.interpolateTTK(keyPoints, distance);
            fromCache = true;
            cacheHitCount++;
            
            // ⭐ 从缓存的关键点中提取 avgShots
            // 计算所有关键点的平均 shots
            let totalShots = 0;
            let shotCount = 0;
            for (const point of keyPoints) {
              if (point.shots !== undefined && point.shots !== null) {
                totalShots += point.shots;
                shotCount++;
              }
            }
            if (shotCount > 0) {
              avgShots = totalShots / shotCount;
            } else if (stat.avgShots !== undefined && stat.avgShots > 0) {
              avgShots = stat.avgShots;
            } else {
              // 粗略估算
              const rof = weapon._current?.rof || weapon.rof || 600;
              const shotInterval = 60 / rof;
              avgShots = Math.max(1, Math.round(totalTimeMs / 1000 / shotInterval) + 1);
            }
            avgMisses = stat.avgMisses || Math.max(0, Math.round(avgShots * 0.15));
            avgBurstInterval = stat.avgBurstInterval || 0;
          }
        }
      }
      
      // ⭐ 如果缓存未命中，使用 stat 中的 avgTime（降级方案）
      if (!fromCache) {
        cacheMissCount++;
        totalTimeMs = stat.avgTime * TIME_UNITS.SECONDS_TO_MS;
        avgShots = stat.avgShots || 0;
        avgMisses = stat.avgMisses || 0;
        avgBurstInterval = stat.avgBurstInterval || 0;
      }
      
      // 计算扳机延迟（毫秒）
      const triggerDelayValue = weapon._current?.triggerDelay ?? weapon.triggerDelay ?? 0;
      const triggerDelay = params.triggerDelayEnable ? triggerDelayValue : 0;
      
      // 计算飞行延迟（毫秒）
      const velocity = weapon.velocity || weapon._current?.velocity || 1;
      const flight = (params.distance / velocity) * TIME_UNITS.SECONDS_TO_MS;
      
      // 总时间 - 飞行 - 扳机延迟 - 连发间隔 = 射击延迟（命中间隔 + 空枪间隔）
      const burstIntervalMs = (avgBurstInterval || 0) * TIME_UNITS.SECONDS_TO_MS;
      const remainingTime = totalTimeMs - flight - triggerDelay - burstIntervalMs;
      
      // 按比例分配命中延迟和空枪延迟
      let noMissFireDelay = 0;
      let emptyDelay = 0;
      const totalIntervals = Math.max(1, avgShots - 1);
      if (avgMisses > 0 && remainingTime > 0) {
        const missRatio = Math.min(1, avgMisses / totalIntervals);
        emptyDelay = remainingTime * missRatio;
        noMissFireDelay = remainingTime * (1 - missRatio);
      } else {
        noMissFireDelay = Math.max(0, remainingTime);
      }
      
      // 确保数值有效
      const clamp = (v) => Math.max(0, v);
      
      return { 
        name: weapon._displayName || weapon.name,
        weapon,
        noMissFireDelay: clamp(noMissFireDelay),
        flight: clamp(flight),
        emptyDelay: clamp(emptyDelay),
        burstInterval: clamp(burstIntervalMs),
        triggerDelay: clamp(triggerDelay),
        avgShots: avgShots,
        totalTime: clamp(totalTimeMs),
        fromCache: fromCache
      };
    });
    
    // 按 totalTime 排序
    newResults.sort((a, b) => a.totalTime - b.totalTime);
    
    // 计算排名变化
    this.calculateRankChanges(newResults);
    this.lastResults = newResults;
    
    // 更新图表数据
    this.updateChartData(newResults);
    
    // ⭐ 输出缓存统计（区分折线图的缓存统计）
    const total = cacheHitCount + cacheMissCount;
    if (total > 0) {
      const hitRate = Math.round((cacheHitCount / total) * 100);
      console.log(`📊 TTK柱状图: ${cacheHitCount}/${total} 个配置使用缓存 (${hitRate}%, 距离: ${distance}m)`);
      if (cacheMissCount > 0) {
        console.log(`  ⚠️ ${cacheMissCount} 个配置缓存未命中，使用模拟计算结果`);
      }
    } else {
      console.log(`📊 TTK柱状图: 0 个配置 (距离: ${distance}m)`);
    }
    
    perf.mark('ttkChartUpdateDone', 'TTK图表更新完成');
  }

  /**
   * 计算排名变化
   */
  calculateRankChanges(newResults) {
    newResults.forEach((r, newIdx) => {
      const oldIdx = this.previousResults.findIndex(o => o.name === r.name);
      if (oldIdx >= 0) {
        r.rankChange = newIdx - oldIdx;
        r.delayChange = Math.round(r.totalTime - this.previousResults[oldIdx].totalTime);
      } else {
        r.rankChange = 0;
        r.delayChange = 0;
      }
    });
  }

  /**
   * 更新图表数据
   */
  updateChartData(newResults) {
    this.chart.data.labels = newResults.map(r => r.name);
    const keys = ['noMissFireDelay', 'burstInterval', 'emptyDelay', 'flight', 'triggerDelay'];
    this.chart.data.datasets.forEach((ds, i) => {
      ds.data = newResults.map(r => r[keys[i]] || 0);
    });
    this.chart.update();
  }

  /**
   * 绘制排名和延迟变化
   */
  drawRankDelayPlugin(chart) {
    if (chart.config.type !== 'bar') return;
    
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(4);
    if (!meta || !meta.data) return;
    
    meta.data.forEach((bar, i) => {
      const r = this.lastResults[i];
      if (!r) return;
      
      const rank = r.rankChange;
      let rankText, rankColor;
      
      if (rank === 0) {
        rankText = '0';
        rankColor = RANK_COLORS.NO_CHANGE;
      } else if (rank > 0) {
        rankText = `↓${Math.abs(rank)}`;
        rankColor = RANK_COLORS.RANK_DOWN;
      } else {
        rankText = `↑${Math.abs(rank)}`;
        rankColor = RANK_COLORS.RANK_UP;
      }

      const delay = r.delayChange;
      let delayText = delay === 0 ? '0' : (delay > 0 ? '+' + delay : delay.toString());

      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const x = bar.x;
      const y = bar.y;

      ctx.fillStyle = RANK_COLORS.NO_CHANGE;
      ctx.fillText(delayText, x, y - 40);
      
      ctx.fillStyle = rankColor;
      ctx.fillText(rankText, x, y - 55);
    });
  }

  /**
   * 获取图表上下文
   */
  getChartContext(chartId) {
    return document.getElementById(chartId).getContext('2d');
  }

  /**
   * 格式化 TTK 标签（显示在柱状图顶部）
   * ⭐ sum 已经是毫秒，直接使用
   */
  formatTTKLabel(value, ctx) {
    const totals = this.lastResults.map(r => r.totalTime);
    if (totals.length === 0 || ctx.dataIndex >= totals.length) return '';
    
    const sum = totals[ctx.dataIndex];
    const best = Math.min(...totals);
    const pct = Math.round((sum / best) * 100);
    return `${pct}%\n${Math.round(sum)}ms`;
  }

  /**
   * 获取 Tooltip 回调
   */
  getTooltipCallbacks() {
    return {
      title: items => items[0]?.label || '',
      label: ctx => `${ctx.dataset.label}: ${formatTime(ctx.raw, 'ms', true)}`,
      afterBody: items => {
        if (items.length === 0) return [];
        const idx = items[0].dataIndex;
        const r = this.lastResults[idx];
        if (!r) return [];
        
        const currentRank = idx + 1;
        const totalWeapons = this.lastResults.length;
        const weapon = r.weapon || {};
        
        const isBurst = weapon.fireMode === 'burst' && weapon.burstCount && weapon.burstInternalROF;
        
        const tooltipLines = [
          `当前排名: ${currentRank}/${totalWeapons}`,
          `子弹初速: ${Math.round(weapon._current?.velocity || weapon.velocity || 0)} m/s`,
          `肉伤: ${weapon._current?.flesh || weapon.flesh || 0}`,
          `甲伤: ${weapon._current?.armor || weapon.armor || 0}`,
          `射速: ${weapon._current?.rof || weapon.rof || 0}`,
          `平均致死枪数: ${(r.avgShots || 0).toFixed(2)}`
        ];
        
        if (isBurst) {
          const burstInterval = weapon.burstInterval || 0;
          const burstInternalROF = weapon.burstInternalROF || 0;
          tooltipLines.push(
            `连发间隔: ${formatTime(burstInterval, 'ms')}`,
            `内部射速: ${burstInternalROF}`
          );
        }
        
        if (r.fromCache) {
          tooltipLines.push('💾 数据来源: 缓存');
        }
        
        return tooltipLines;
      }
    };
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
}

export default TTKChart;