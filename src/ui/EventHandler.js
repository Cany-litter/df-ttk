/**
 * 事件处理器
 * 
 * 负责绑定和管理所有 UI 事件，保持轻量，主要职责是：
 * 1. 绑定 DOM 事件
 * 2. 将用户操作路由到对应的处理器（DOMController / 自定义事件）
 * 3. 不包含业务逻辑，只做事件转发
 * 
 * 事件流向：
 * - 计算类事件 → 触发自定义事件 → main.js 监听执行
 * - 数据操作事件 → 调用 DOMController 方法
 * - Tab 切换事件 → 由 DOMController 处理（不在此重复绑定）
 */
export class EventHandler {
  /**
   * @param {Object} domController - DOMController 实例
   * @param {Object} dataManager - DataManager 实例
   */
  constructor(domController, dataManager) {
    this.domController = domController;
    this.dataManager = dataManager;
    this._boundEvents = [];
    this._initialized = false;
  }

  /**
   * 初始化事件绑定
   * @param {Object} options - 配置选项
   * @param {Function} options.onCalculate - 计算 TTK 回调（由 main.js 提供）
   * @param {Function} options.onDistanceChart - 距离图表回调（由 main.js 提供）
   */
  initialize(options = {}) {
    if (this._initialized) {
      return;
    }

    const { onCalculate = null, onDistanceChart = null } = options;

    // 1. 绑定计算相关事件
    this.bindCalculateEvents(onCalculate, onDistanceChart);

    // ⭐ 数据操作事件（导入/导出/重置）由 DOMController 负责，此处不重复绑定
    // 注释掉以避免重复绑定导致导出两个文件
    // this.bindDataOperationEvents();

    // 2. 绑定其他事件
    this.bindMiscEvents();

    this._initialized = true;
  }

  // ============================================================
  // 1. 计算相关事件
  // ============================================================

  /**
   * 绑定计算相关事件
   * - 计算 TTK 按钮 → 触发自定义事件或直接调用回调
   * - 距离折线图按钮 → 触发自定义事件或直接调用回调
   * 
   * @param {Function} onCalculate - 计算 TTK 回调
   * @param {Function} onDistanceChart - 距离图表回调
   */
  bindCalculateEvents(onCalculate, onDistanceChart) {
    // ===== 计算 TTK 按钮 =====
    const calcBtn = document.getElementById('calcBtn');
    if (calcBtn) {
      const handler = () => {
        if (typeof onCalculate === 'function') {
          onCalculate();
        } else {
          this.triggerCustomEvent('calculate-ttk');
        }
      };
      calcBtn.addEventListener('click', handler);
      this._boundEvents.push({ element: calcBtn, event: 'click', handler });
    }

    // ===== 距离折线图按钮 =====
    const distChartBtn = document.getElementById('distChartBtn');
    if (distChartBtn) {
      const handler = () => {
        if (typeof onDistanceChart === 'function') {
          onDistanceChart();
        } else {
          this.triggerCustomEvent('calculate-distance');
        }
      };
      distChartBtn.addEventListener('click', handler);
      this._boundEvents.push({ element: distChartBtn, event: 'click', handler });
    }
  }

  /**
   * 触发自定义事件
   * @param {string} eventName - 事件名称
   * @param {*} detail - 事件数据
   */
  triggerCustomEvent(eventName, detail = null) {
    const event = new CustomEvent(eventName, {
      detail: {
        dataManager: this.dataManager,
        domController: this.domController,
        ...(detail || {})
      },
      bubbles: true
    });
    document.dispatchEvent(event);
  }

  // ============================================================
  // 2. 数据操作事件（已废弃 - 由 DOMController 负责）
  // ============================================================

  /**
   * 绑定数据操作事件（导入/导出/重置）
   * ⚠️ 此方法已被弃用，数据操作事件由 DOMController 统一管理
   * 保留方法体为空，避免调用时报错
   */
  bindDataOperationEvents() {
    // 数据操作事件（导入/导出/重置）已由 DOMController.bindImportExportEvents() 处理
    // 此处不再重复绑定，防止导出时下载两个文件
    // 保留此方法为空，确保向后兼容
  }

  // ============================================================
  // 3. 其他事件
  // ============================================================

  /**
   * 绑定其他杂项事件
   */
  bindMiscEvents() {
    // ===== 显示全部武器复选框（仅作为UI状态，不触发计算） =====
    // 点击"生成折线图"时由 DistanceChart 读取该状态
    const showAllCheckbox = document.getElementById('showAllWeapons');
    if (showAllCheckbox) {
      // 不绑定任何事件，仅保留DOM元素供读取
      // 状态由 DistanceChart.update() 读取
    }

    // ===== 全局枪管类型（已废弃） =====
    const globalBarrelSelect = document.getElementById('globalBarrelType');
    if (globalBarrelSelect) {
      globalBarrelSelect.disabled = true;
      globalBarrelSelect.title = '已废弃，请在价格表格中配置枪管';
      globalBarrelSelect.style.opacity = '0.6';
      globalBarrelSelect.style.cursor = 'not-allowed';
    }

    // ===== 扳机延迟启用复选框 =====
    const triggerDelayCheckbox = document.getElementById('triggerDelayEnable');
    if (triggerDelayCheckbox) {
      const handler = (e) => {
        this.triggerCustomEvent('trigger-delay-toggle', {
          enabled: e.target.checked
        });
      };
      triggerDelayCheckbox.addEventListener('change', handler);
      this._boundEvents.push({ element: triggerDelayCheckbox, event: 'change', handler });
    }

    // ===== 键盘快捷键 =====
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.triggerCustomEvent('calculate-ttk');
      }
    });
  }

  // ============================================================
  // 4. 工具方法
  // ============================================================

  /**
   * 解绑所有事件
   */
  unbindAll() {
    this._boundEvents.forEach(({ element, event, handler }) => {
      if (element) {
        element.removeEventListener(event, handler);
      }
    });
    this._boundEvents = [];
    this._initialized = false;
  }

  /**
   * 重新绑定事件（在 DOM 更新后调用）
   */
  rebind(options = {}) {
    this.unbindAll();
    this.initialize(options);
  }

  /**
   * 获取事件绑定状态
   * @returns {Object} 状态信息
   */
  getStatus() {
    return {
      initialized: this._initialized,
      boundEventsCount: this._boundEvents.length
    };
  }
}

export default EventHandler;