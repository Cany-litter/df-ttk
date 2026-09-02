/**
 * 性能监控工具
 * 用于记录应用各环节的加载耗时
 * 
 * 使用方式：
 *   import perf from './utils/performance.js';
 *   perf.mark('start');
 *   // ... 执行代码
 *   perf.mark('dataLoaded');
 *   perf.report(); // 输出报告
 */

class PerformanceMonitor {
  constructor() {
    this.marks = {};
    this.startTime = performance.now();
    this.enabled = true;
  }

  /**
   * 记录一个时间点
   * @param {string} name - 标记名称
   * @param {string} description - 标记描述（可选）
   */
  mark(name, description = '') {
    if (!this.enabled) return;
    this.marks[name] = {
      time: performance.now(),
      description: description
    };
  }

  /**
   * 获取从 start 到指定标记的耗时（毫秒）
   * @param {string} name - 标记名称
   * @returns {number} 耗时（毫秒）
   */
  getDuration(name) {
    if (!this.marks[name]) return 0;
    return this.marks[name].time - this.startTime;
  }

  /**
   * 获取两个标记之间的耗时
   * @param {string} from - 起始标记
   * @param {string} to - 结束标记
   * @returns {number} 耗时（毫秒）
   */
  getDurationBetween(from, to) {
    if (!this.marks[from] || !this.marks[to]) return 0;
    return this.marks[to].time - this.marks[from].time;
  }

  /**
   * 输出性能报告到控制台
   */
  report() {
    if (!this.enabled) return;
    
    const totalTime = performance.now() - this.startTime;
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 性能监控报告');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('📈 各阶段耗时明细:');
    console.log('───────────────────────────────────────────────────────────');
    
    const markNames = Object.keys(this.marks);
    let prevMark = null;
    
    // 按时间排序
    const sortedMarks = markNames.sort((a, b) => this.marks[a].time - this.marks[b].time);
    
    for (const name of sortedMarks) {
      const mark = this.marks[name];
      const fromStart = (mark.time - this.startTime).toFixed(2);
      let fromPrev = '';
      
      if (prevMark) {
        const prevTime = this.marks[prevMark].time;
        fromPrev = ` (${(mark.time - prevTime).toFixed(2)}ms)`;
      }
      
      const desc = mark.description ? ` - ${mark.description}` : '';
      console.log(`  ${name.padEnd(30)} ${fromStart.padStart(10)}ms from start${fromPrev}${desc}`);
      prevMark = name;
    }
    
    console.log('');
    console.log('───────────────────────────────────────────────────────────');
    console.log(`  TOTAL${' '.repeat(24)} ${totalTime.toFixed(2)}ms from start to report`);
    console.log('');
    
    // 输出关键阶段的耗时
    this._reportKeyMetrics();
    
    console.log('═══════════════════════════════════════════════════════════');
  }

  /**
   * 输出关键阶段耗时
   */
  _reportKeyMetrics() {
    const stages = [
      { from: 'appStart', to: 'librariesLoaded', label: '第三方库加载' },
      { from: 'librariesLoaded', to: 'dataLoaded', label: '数据加载' },
      { from: 'dataLoaded', to: 'appReady', label: '应用初始化' },
      { from: 'appReady', to: 'autoCalcDone', label: '自动计算' },
      { from: 'ttkCalcStart', to: 'ttkCalcDone', label: 'TTK计算' },
      { from: 'distanceChartStart', to: 'distanceChartDone', label: '折线图计算' },
    ];
    
    console.log('📊 关键阶段耗时:');
    console.log('───────────────────────────────────────────────────────────');
    
    let hasData = false;
    for (const stage of stages) {
      const duration = this.getDurationBetween(stage.from, stage.to);
      if (duration > 0 || this.marks[stage.from]) {
        hasData = true;
        const fromStartTo = this.getDuration(stage.to);
        console.log(`  ${stage.label.padEnd(20)} ${duration.toFixed(2)}ms${' '.repeat(5)}(${fromStartTo.toFixed(2)}ms from start)`);
      }
    }
    
    if (!hasData) {
      console.log('  (无关键阶段数据，请确保所有 mark 点已设置)');
    }
    console.log('');
  }

  /**
   * 重置监控数据
   */
  reset() {
    this.marks = {};
    this.startTime = performance.now();
  }

  /**
   * 启用/禁用监控
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }
}

// 创建单例
const perf = new PerformanceMonitor();

// 自动标记页面加载开始
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    perf.mark('domReady', 'DOM 就绪');
  });
} else {
  perf.mark('domReady', 'DOM 就绪');
}

export default perf;