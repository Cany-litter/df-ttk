import { TTKChart } from './TTKChart.js';
import { DistanceChart } from './DistanceChart.js';

/**
 * 图表管理器
 * 轻量级协调器，负责协调不同类型的图表
 * 
 * 适配新的 configs 结构：
 * - 图表管理器本身不直接操作数据结构
 * - TTKChart 和 DistanceChart 从 SimulationEngine 获取数据
 * - 保持与 main.js 的接口兼容
 */
export class ChartManager {
  constructor() {
    this.ttkChart = new TTKChart();
    this.distanceChart = new DistanceChart();
  }

  /**
   * 更新TTK图表
   * @param {Array} stats - TTK统计数据
   * @param {Object} params - 页面参数
   */
  updateTtkChart(stats, params) {
    if (!this.ttkChart) {
      console.warn('TTKChart 未初始化');
      return;
    }
    this.ttkChart.update(stats, params);
  }

  /**
   * 更新距离图表
   * @param {Array} armed - 应用附件后的武器数据
   * @param {Array} attachments - 附件配置数组
   * @param {Object} params - 页面参数
   */
  updateDistanceChart(armed, attachments, params) {
    if (!this.distanceChart) {
      console.warn('DistanceChart 未初始化');
      return;
    }
    this.distanceChart.update(armed, attachments, params);
  }

  /**
   * 销毁所有图表
   */
  destroy() {
    if (this.ttkChart) {
      this.ttkChart.destroy();
    }
    if (this.distanceChart) {
      this.distanceChart.destroy();
    }
  }

  /**
   * 获取TTK图表实例
   * @returns {TTKChart|null} TTK图表实例
   */
  getTTKChart() {
    return this.ttkChart;
  }

  /**
   * 获取距离图表实例
   * @returns {DistanceChart|null} 距离图表实例
   */
  getDistanceChart() {
    return this.distanceChart;
  }

  /**
   * 刷新所有图表（重新渲染）
   */
  refreshAll() {
    // 如果有上次的数据，可以重新渲染
    // 但 ChartManager 不存储数据，需要外部重新调用 update 方法
    console.log('ChartManager: 请通过 updateTtkChart 和 updateDistanceChart 重新渲染');
  }
}