// ChartManager.js
import TTKChart from './TTKChart.js';
import DistanceChart from './DistanceChart.js';

/**
 * 图表管理器
 * 轻量级协调器，负责协调不同类型的图表
 */
export class ChartManager {
  constructor() {
    this.ttkChart = new TTKChart();
    this.distanceChart = new DistanceChart();
    
    // ⭐ 不再绑定 toggle-show-all 事件
    // 显示全部状态由 DistanceChart.update() 从 DOM 直接读取
  }

  /**
   * 更新TTK图表
   */
  updateTtkChart(stats, params) {
    this.ttkChart.update(stats, params);
  }

  /**
   * 更新距离图表
   * ⭐ 同时更新高亮武器下拉选项
   */
  updateDistanceChart(armed, attachments, params) {
    // ⭐ 更新高亮武器下拉选项
    if (this.distanceChart) {
      this.distanceChart.updateHighlightOptions(armed);
    }
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