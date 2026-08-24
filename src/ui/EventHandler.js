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

    // 2. 绑定数据操作事件（导入/导出/重置）
    this.bindDataOperationEvents();

    // 3. 绑定缓存相关事件（新增）
    this.bindCacheEvents();

    // 4. 绑定真实模拟开关事件（新增）
    this.bindRealSimEvents();

    // 5. 绑定其他事件
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
  // 2. 数据操作事件
  // ============================================================

  /**
   * 绑定数据操作事件（导入/导出/重置）
   */
  bindDataOperationEvents() {
    // ===== 导出数据按钮 =====
    const exportBtn = document.getElementById('exportDataBtn');
    if (exportBtn) {
      const handler = () => {
        this.domController.exportData();
      };
      exportBtn.addEventListener('click', handler);
      this._boundEvents.push({ element: exportBtn, event: 'click', handler });
    }

    // ===== 导入数据按钮 =====
    const importBtn = document.getElementById('importDataBtn');
    if (importBtn) {
      const handler = () => {
        this.domController.importData();
      };
      importBtn.addEventListener('click', handler);
      this._boundEvents.push({ element: importBtn, event: 'click', handler });
    }

    // ===== 重置数据按钮 =====
    const resetBtn = document.getElementById('resetDataBtn');
    if (resetBtn) {
      const handler = () => {
        this.domController.resetData();
      };
      resetBtn.addEventListener('click', handler);
      this._boundEvents.push({ element: resetBtn, event: 'click', handler });
    }

    // ===== 距离图表 JSON 导出按钮 =====
    const exportJSONBtn = document.getElementById('exportJSONBtn');
    if (exportJSONBtn) {
      const handler = () => {
        this.triggerCustomEvent('export-distance-json');
      };
      exportJSONBtn.addEventListener('click', handler);
      this._boundEvents.push({ element: exportJSONBtn, event: 'click', handler });
    }
  }

  // ============================================================
  // 3. 缓存相关事件（新增）
  // ============================================================

  /**
   * 绑定缓存操作事件
   * - 导出缓存 → 触发自定义事件
   * - 导入缓存 → 触发自定义事件
   * - 清除缓存 → 触发自定义事件
   */
  bindCacheEvents() {
    // ===== 导出缓存按钮 =====
    const exportCacheBtn = document.getElementById('exportCacheBtn');
    if (exportCacheBtn) {
      const handler = () => {
        this.triggerCustomEvent('export-cache');
      };
      exportCacheBtn.addEventListener('click', handler);
      this._boundEvents.push({ element: exportCacheBtn, event: 'click', handler });
    }

    // ===== 导入缓存按钮 =====
    const importCacheBtn = document.getElementById('importCacheBtn');
    if (importCacheBtn) {
      const handler = () => {
        this.triggerCustomEvent('import-cache');
      };
      importCacheBtn.addEventListener('click', handler);
      this._boundEvents.push({ element: importCacheBtn, event: 'click', handler });
    }

    // ===== 清除缓存按钮 =====
    const clearCacheBtn = document.getElementById('clearCacheBtn');
    if (clearCacheBtn) {
      const handler = () => {
        this.triggerCustomEvent('clear-cache');
      };
      clearCacheBtn.addEventListener('click', handler);
      this._boundEvents.push({ element: clearCacheBtn, event: 'click', handler });
    }
  }

  // ============================================================
  // 4. 真实模拟开关事件（新增）
  // ============================================================

  /**
   * 绑定真实模拟开关事件
   * - 切换时更新状态显示
   * - ⭐ 不再自动触发折线图计算 - 用户需点击"生成折线图"按钮手动刷新
   */
  bindRealSimEvents() {
    const toggle = document.getElementById('realSimulationToggle');
    if (!toggle) return;

    const handler = (e) => {
      const isReal = e.target.checked;
      
      // 更新状态提示
      const statusEl = document.getElementById('simStatus');
      if (statusEl) {
        if (isReal) {
          statusEl.textContent = '(真实模拟)';
          statusEl.className = 'hint-text mode-real';
        } else {
          statusEl.textContent = '(快速模式)';
          statusEl.className = 'hint-text mode-fast';
        }
      }

      // 显示/隐藏真实模拟信息栏
      const infoEl = document.getElementById('realSimInfo');
      if (infoEl) {
        if (isReal) {
          infoEl.style.display = 'flex';
          // 尝试获取当前选中的武器名称
          const nameEl = document.getElementById('simWeaponName');
          if (nameEl) {
            // 从价格表格获取第一个启用的配置
            const priceTable = document.getElementById('priceTable');
            if (priceTable) {
              const rows = priceTable.querySelectorAll('tbody tr');
              let found = false;
              for (const row of rows) {
                const checkbox = row.querySelector('.price-enabled-checkbox');
                if (checkbox && checkbox.checked) {
                  const nameCell = row.querySelector('td:first-child');
                  if (nameCell) {
                    nameEl.textContent = nameCell.textContent.trim() || '未知武器';
                    found = true;
                    break;
                  }
                }
              }
              if (!found) {
                nameEl.textContent = '⚠️ 请启用至少一个配置';
              }
            }
          }
          const progressEl = document.getElementById('simProgress');
          if (progressEl) {
            progressEl.textContent = '就绪';
          }
        } else {
          infoEl.style.display = 'none';
        }
      }

      // ⭐ 不再自动触发折线图 - 用户需点击"生成折线图"按钮手动刷新
      if (e._isUserAction !== false) {
        console.log(`🔄 已切换至 ${isReal ? '真实模拟' : '快速模式'} 模式，请点击"生成折线图"按钮刷新图表`);
      }
    };

    toggle.addEventListener('change', handler);
    this._boundEvents.push({ element: toggle, event: 'change', handler });

    // 初始化状态：仅设置 UI 状态，不触发计算
    setTimeout(() => {
      const initEvent = { target: toggle, _isUserAction: false };
      handler(initEvent);
    }, 100);
  }

  // ============================================================
  // 5. 其他事件
  // ============================================================

  /**
   * 绑定其他杂项事件
   */
  bindMiscEvents() {
    // ===== ⭐ 显示全部武器复选框（仅作为UI状态，不触发计算） =====
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
  // 6. 工具方法
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