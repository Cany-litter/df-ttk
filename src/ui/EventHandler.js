/**
 * 事件处理器
 * 负责绑定和管理所有UI事件
 * 
 * 适配新的 configs 结构：
 * - 事件处理器本身不直接操作数据结构
 * - 保持与 main.js 和 DOMController 的接口兼容
 */
export class EventHandler {
  constructor() {
    this.handlers = new Map();
    this._jsonExportHandler = null;
  }

  /**
   * 绑定事件处理器
   * @param {Function} calcHandler - 计算按钮事件处理器
   * @param {Function} distChartHandler - 距离图表按钮事件处理器
   * @param {Function} globalBarrelChangeHandler - 全局枪管类型变化处理器
   */
  bindEventHandlers(calcHandler, distChartHandler, globalBarrelChangeHandler) {
    // 存储处理器引用
    this.handlers.set('calc', calcHandler);
    this.handlers.set('distChart', distChartHandler);
    this.handlers.set('globalBarrelChange', globalBarrelChangeHandler);

    // 绑定计算按钮事件
    const calcBtn = document.getElementById('calcBtn');
    if (calcBtn) {
      // 移除旧监听器，避免重复绑定
      calcBtn.removeEventListener('click', this._calcHandler);
      this._calcHandler = () => {
        try {
          calcHandler();
        } catch (error) {
          console.error('计算按钮事件处理错误:', error);
        }
      };
      calcBtn.addEventListener('click', this._calcHandler);
    }

    // 绑定距离图表按钮事件
    const distChartBtn = document.getElementById('distChartBtn');
    if (distChartBtn) {
      distChartBtn.removeEventListener('click', this._distHandler);
      this._distHandler = () => {
        try {
          distChartHandler();
        } catch (error) {
          console.error('距离图表按钮事件处理错误:', error);
        }
      };
      distChartBtn.addEventListener('click', this._distHandler);
    }

    // 绑定全局枪管类型变化事件
    const globalBarrelTypeSelect = document.getElementById('globalBarrelType');
    if (globalBarrelTypeSelect && globalBarrelChangeHandler) {
      globalBarrelTypeSelect.removeEventListener('change', this._globalBarrelHandler);
      this._globalBarrelHandler = () => {
        try {
          globalBarrelChangeHandler();
        } catch (error) {
          console.error('全局枪管类型变化事件处理错误:', error);
        }
      };
      globalBarrelTypeSelect.addEventListener('change', this._globalBarrelHandler);
    }

    // 绑定距离图表JSON导出按钮事件
    this.bindDistanceExportHandlers();
  }

  /**
   * 绑定距离图表JSON导出按钮事件
   */
  bindDistanceExportHandlers() {
    // JSON 导出
    const jsonBtn = document.getElementById('exportJSONBtn');
    if (jsonBtn) {
      // 移除旧监听器，避免重复绑定
      jsonBtn.removeEventListener('click', this._jsonExportHandler);
      this._jsonExportHandler = () => {
        try {
          if (window.app?.chartManager?.distanceChart) {
            window.app.chartManager.distanceChart.exportAsJSON();
          } else {
            alert('⚠️ 请先生成折线图！');
          }
        } catch (error) {
          console.error('JSON导出失败:', error);
          alert('❌ JSON导出失败: ' + error.message);
        }
      };
      jsonBtn.addEventListener('click', this._jsonExportHandler);
    }
  }

  /**
   * 绑定显示全部武器复选框事件
   * @param {Function} onChange - 变化回调
   */
  bindShowAllWeapons(onChange) {
    const checkbox = document.getElementById('showAllWeapons');
    if (checkbox) {
      checkbox.removeEventListener('change', this._showAllHandler);
      this._showAllHandler = () => {
        try {
          if (onChange) {
            onChange(checkbox.checked);
          }
        } catch (error) {
          console.error('显示全部武器复选框事件处理错误:', error);
        }
      };
      checkbox.addEventListener('change', this._showAllHandler);
    }
  }

  /**
   * 解绑事件处理器
   */
  unbindEventHandlers() {
    const calcBtn = document.getElementById('calcBtn');
    const distChartBtn = document.getElementById('distChartBtn');
    const globalBarrelTypeSelect = document.getElementById('globalBarrelType');
    const jsonBtn = document.getElementById('exportJSONBtn');
    const showAllCheckbox = document.getElementById('showAllWeapons');

    if (calcBtn && this._calcHandler) {
      calcBtn.removeEventListener('click', this._calcHandler);
    }

    if (distChartBtn && this._distHandler) {
      distChartBtn.removeEventListener('click', this._distHandler);
    }

    if (globalBarrelTypeSelect && this._globalBarrelHandler) {
      globalBarrelTypeSelect.removeEventListener('change', this._globalBarrelHandler);
    }

    if (jsonBtn && this._jsonExportHandler) {
      jsonBtn.removeEventListener('click', this._jsonExportHandler);
    }

    if (showAllCheckbox && this._showAllHandler) {
      showAllCheckbox.removeEventListener('change', this._showAllHandler);
    }

    this.handlers.clear();
  }

  /**
   * 获取处理器
   * @param {string} type - 处理器类型
   * @returns {Function} 事件处理器函数
   */
  getHandler(type) {
    return this.handlers.get(type);
  }

  /**
   * 检查处理器是否已绑定
   * @param {string} type - 处理器类型
   * @returns {boolean} 是否已绑定
   */
  hasHandler(type) {
    return this.handlers.has(type);
  }

  /**
   * 获取所有已绑定的处理器类型列表
   * @returns {string[]} 处理器类型列表
   */
  getHandlerTypes() {
    return Array.from(this.handlers.keys());
  }
}