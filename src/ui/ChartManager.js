import { TTKChart } from './TTKChart.js';
import { DistanceChart } from './DistanceChart.js';

/**
 * 图表管理器
 * 轻量级协调器，负责协调不同类型的图表
 */
export class ChartManager {
  constructor() {
    this.ttkChart = new TTKChart();
    this.distanceChart = new DistanceChart();
    
    // 绑定事件
    this.bindEvents();
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 监听显示全部武器复选框变化
    document.addEventListener('toggle-show-all', (e) => {
      const checked = e.detail?.checked;
      if (this.distanceChart) {
        this.distanceChart.setShowAllWeapons(checked);
        // 通过自定义事件重新触发距离图表计算
        document.dispatchEvent(new CustomEvent('calculate-distance'));
      }
    });
  }

  /**
   * 更新TTK图表
   */
  updateTtkChart(stats, params) {
    this.ttkChart.update(stats, params);
  }

  /**
   * 更新距离图表
   */
  updateDistanceChart(armed, attachments, params) {
    this.distanceChart.update(armed, attachments, params);
  }

  /**
   * 销毁图表
   */
  destroy() {
    if (this.ttkChart) {
      this.ttkChart.destroy();
    }
    if (this.distanceChart) {
      this.distanceChart.destroy();
    }
  }
}