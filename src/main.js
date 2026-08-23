/**
 * 应用主入口
 * 
 * 职责：
 * 1. 等待 DOM 和第三方库加载完成
 * 2. 初始化 DataManager 并加载数据
 * 3. 初始化 DOMController（表格渲染）
 * 4. 初始化 EventHandler（事件绑定）
 * 5. 初始化 ChartManager（图表）
 * 6. 初始化 BarrelEditor（枪管编辑器）
 * 7. 设置 SimulationEngine 的 DataManager 依赖
 * 8. 协调 TTK 计算和距离图表计算
 */
import { getDataManager } from './core/DataManager.js';
import { SimulationEngine } from './core/SimulationEngine.js';
import DOMController from './ui/DOMController.js';
import EventHandler from './ui/EventHandler.js';
import BarrelEditor from './ui/BarrelEditor.js';
import { ChartManager } from './ui/ChartManager.js';
import WeaponTable from './ui/WeaponTable.js';
import { resetSeed } from './utils/rng.js';
import { validateHitProb, validateWeaponHitRates, validatePageParams } from './utils/validators.js';

class App {
  constructor() {
    this.dataManager = null;
    this.domController = null;
    this.eventHandler = null;
    this.chartManager = null;
    this.barrelEditor = null;
    this.isInitialized = false;
    this._refreshTimer = null;
  }

  /**
   * 启动应用
   */
  async start() {
    try {
      console.log('🚀 应用启动中...');

      // 1. 等待 DOM 就绪
      await this.waitForDOM();

      // 2. 等待第三方库加载
      await this.waitForLibraries();

      // 3. 初始化 DataManager 并加载数据
      await this.initDataManager();

      // 4. 设置 SimulationEngine 的 DataManager 依赖
      this.setupSimulationEngine();

      // 5. 初始化图表管理器
      this.initChartManager();

      // 6. 初始化 DOM 控制器
      this.initDOMController();

      // 7. 初始化枪管编辑器
      this.initBarrelEditor();

      // 8. 初始化事件处理器
      this.initEventHandler();

      // 9. 应用启动完成
      this.isInitialized = true;
      console.log('✅ 应用启动完成');
      console.log('📊 数据状态:', this.dataManager.getStats());

    } catch (error) {
      console.error('❌ 应用启动失败:', error);
      this.showError('应用启动失败: ' + error.message);
    }
  }

  // ============================================================
  // 1. 等待就绪
  // ============================================================

  /**
   * 等待 DOM 就绪
   * @returns {Promise}
   */
  waitForDOM() {
    return new Promise((resolve) => {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', resolve);
      } else {
        resolve();
      }
    });
  }

  /**
   * 等待第三方库加载
   * @returns {Promise}
   */
  waitForLibraries() {
    return new Promise((resolve) => {
      const checkLibraries = () => {
        if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
          resolve();
        } else {
          setTimeout(checkLibraries, 100);
        }
      };
      checkLibraries();
    });
  }

  // ============================================================
  // 2. 初始化 DataManager
  // ============================================================

  /**
   * 初始化 DataManager 并加载数据
   */
  async initDataManager() {
    this.dataManager = getDataManager();
    await this.dataManager.loadFromJSON('./data.json');
    console.log('📊 DataManager 加载完成');
  }

  /**
   * 设置 SimulationEngine 的 DataManager 依赖
   */
  setupSimulationEngine() {
    SimulationEngine.setDataManager(this.dataManager);
    console.log('🔧 SimulationEngine 依赖已注入');
  }

  // ============================================================
  // 3. 初始化 ChartManager
  // ============================================================

  /**
   * 初始化图表管理器
   */
  initChartManager() {
    this.chartManager = new ChartManager();
    console.log('📈 ChartManager 初始化完成');
  }

  // ============================================================
  // 4. 初始化 DOMController
  // ============================================================

  /**
   * 初始化 DOM 控制器
   */
  initDOMController() {
    this.domController = new DOMController();
    this.domController.initialize({
      onBarrelEdit: (weaponId) => {
        if (this.barrelEditor) {
          this.barrelEditor.openEditor(weaponId);
        }
      }
    });
    console.log('🎮 DOMController 初始化完成');
  }

  // ============================================================
  // 5. 初始化 BarrelEditor
  // ============================================================

  /**
   * 初始化枪管编辑器
   */
  initBarrelEditor() {
    this.barrelEditor = new BarrelEditor(
      this.dataManager,
      this.domController,
      () => {
        // 枪管数据变更后刷新武器表格
        this.domController.refreshWeaponTable();
        // 刷新价格表格（枪管列表可能变化）
        this.domController.refreshPriceTable();
      }
    );
    console.log('🔧 BarrelEditor 初始化完成');
  }

  // ============================================================
  // 6. 初始化 EventHandler
  // ============================================================

  /**
   * 初始化事件处理器
   */
  initEventHandler() {
    this.eventHandler = new EventHandler(this.domController, this.dataManager);
    this.eventHandler.initialize({
      onCalculate: () => {
        this.handleCalculate();
      },
      onDistanceChart: () => {
        this.handleDistanceChart();
      }
    });

    // 监听自定义事件（作为备用）
    document.addEventListener('calculate-ttk', () => {
      this.handleCalculate();
    });

    document.addEventListener('calculate-distance', () => {
      this.handleDistanceChart();
    });

    document.addEventListener('export-distance-json', () => {
      this.handleExportDistanceJSON();
    });

    console.log('🎯 EventHandler 初始化完成');
  }

  // ============================================================
  // 7. 核心功能 - TTK 计算
  // ============================================================

  /**
   * 处理 TTK 计算
   */
  handleCalculate() {
    try {
      const { params, armed, attachments } = this.prepareWeaponData();
      
      if (!armed || armed.length === 0) {
        alert('没有可用的武器数据，请检查 data.json');
        return;
      }

      resetSeed();
      const results = SimulationEngine.calculateWeaponsTTK(
        armed, 
        attachments, 
        params, 
        this.dataManager
      );
      
      this.chartManager.updateTtkChart(results, params);
      
      console.log(`📊 TTK 计算完成，${results.length} 把武器`);
    } catch (error) {
      console.error('TTK 计算失败:', error);
      alert('TTK 计算失败: ' + error.message);
    }
  }

  /**
   * 处理距离图表
   */
  handleDistanceChart() {
    try {
      const { params, armed, attachments } = this.prepareWeaponData();
      
      if (!armed || armed.length === 0) {
        alert('没有可用的武器数据，请检查 data.json');
        return;
      }

      this.chartManager.updateDistanceChart(armed, attachments, params);
      
      console.log(`📈 距离图表生成完成，${armed.length} 把武器`);
    } catch (error) {
      console.error('距离图表生成失败:', error);
      alert('距离图表生成失败: ' + error.message);
    }
  }

  /**
   * 处理距离图表 JSON 导出
   */
  handleExportDistanceJSON() {
    try {
      if (this.chartManager && this.chartManager.distanceChart) {
        this.chartManager.distanceChart.exportAsJSON();
      } else {
        alert('⚠️ 请先生成折线图！');
      }
    } catch (error) {
      console.error('JSON 导出失败:', error);
      alert('❌ JSON 导出失败: ' + error.message);
    }
  }

  // ============================================================
  // 8. 数据准备
  // ============================================================

  /**
   * 准备武器数据（从 DataManager 和 DOMController 获取）
   * @returns {Object} { params, armed, attachments }
   */
  prepareWeaponData() {
    // 1. 读取参数
    const params = this.domController.readPageParams();
    
    // 2. 验证参数
    validatePageParams(params);
    validateHitProb(params);

    // 3. 获取武器数据
    const weapons = this.dataManager.getWeapons();
    if (!weapons || weapons.length === 0) {
      throw new Error('没有武器数据');
    }

    // 4. 构建附件配置（从 DOM 读取）
    const attachments = this.buildAttachments(weapons, params);

    // 5. 应用附件计算当前值
    const armed = this.applyAttachments(weapons, attachments);

    // 6. 验证命中率
    validateWeaponHitRates(attachments, weapons);

    return { params, armed, attachments };
  }

  /**
   * 构建附件配置
   * @param {Array} weapons - 武器数据
   * @param {Object} params - 页面参数
   * @returns {Array} 附件配置数组
   */
  buildAttachments(weapons, params) {
    return weapons.map((weapon, index) => {
      // 从 DOMController 获取附件配置
      const attachment = this.domController.getWeaponAttachment(weapon.id) || {
        barrelId: -1,
        muzzleId: 0,
        precision: 0.09
      };

      // 获取子弹类型
      const bulletType = this.domController.getWeaponBulletType 
        ? this.domController.getWeaponBulletType(index) 
        : null;

      // 🔥 获取命中率（从价格配置获取，传入全局命中率映射作为后备）
      const hitRate = this.getHitRateForWeapon(weapon.id, params.distance, params.hitRateMap);

      // 获取配置 ID（用于价格配置中的命中率查找）
      const priceConfig = this.dataManager.getPriceByWeaponId(weapon.id);
      const configId = priceConfig?.configs?.[0]?.id || 'cfg-1';

      // 🔥 barrelIndex 是下拉选项中的索引（0-based，包含"无"）
      // barrelId 是武器 barrels 数组中的索引（-1 表示无）
      // 转换：barrelIndex = barrelId + 1
      const barrelIndex = attachment.barrelId !== undefined && attachment.barrelId >= 0 
        ? attachment.barrelId + 1 
        : 0;

      return {
        barrelIndex: barrelIndex,
        muzzleIndex: attachment.muzzleId !== undefined ? attachment.muzzleId : 0,
        hitRate: hitRate,
        bulletType: bulletType,
        velocityPrecision: attachment.precision || 0.09,
        configId: configId,
        weaponId: weapon.id
      };
    });
  }

  /**
   * 应用附件到武器
   * @param {Array} weapons - 武器数据
   * @param {Array} attachments - 附件配置
   * @returns {Array} 应用附件后的武器数据
   */
  applyAttachments(weapons, attachments) {
    return weapons.map((weapon, index) => {
      const att = attachments[index] || {};
      
      // 🔥 从 barrelIndex 转换为 barrelId
      // barrelIndex: 下拉选项中的索引（0 = '无', 1 = 第一个枪管, ...）
      // barrelId: weapons.barrels 数组索引（-1 = 无, 0 = 第一个枪管, ...）
      const barrelId = att.barrelIndex !== undefined && att.barrelIndex > 0 
        ? att.barrelIndex - 1 
        : -1;
      
      const barrel = (barrelId >= 0 && weapon.barrels && weapon.barrels[barrelId])
        ? weapon.barrels[barrelId]
        : null;

      // 🔥 获取枪口 ID
      const muzzleId = att.muzzleIndex || 0;

      // 🔥 获取枪口对象
      const muzzle = this.dataManager.getMuzzleById(muzzleId);

      // 🔥 AKM 调试日志
      if (weapon.id === 2) {
        console.log('🔍 [applyAttachments] AKM 数据:');
        console.log(`  att.barrelIndex: ${att.barrelIndex}`);
        console.log(`  barrelId: ${barrelId}`);
        console.log(`  barrel: ${barrel?.name || '无'}`);
        console.log(`  muzzleId: ${muzzleId}`);
        console.log(`  muzzle: ${muzzle?.name || '无'}`);
        console.log(`  velocityPrecision: ${att.velocityPrecision}`);
      }

      // 使用 WeaponTable 的计算方法，传入 muzzleId
      const current = WeaponTable.calculateCurrentValues(
        weapon,
        barrel,
        muzzleId,
        att.velocityPrecision || 0.09
      );

      // 合并原始值和当前值
      return {
        ...weapon,
        ...current,
        _original: { ...weapon },
        _current: { ...current },
        _attachments: {
          ...att,
          barrel: barrel,      // 🔥 存储 barrel 对象
          muzzle: muzzle,      // 🔥 存储 muzzle 对象
          barrelId: barrelId,  // 🔥 存储 barrelId
          muzzleId: muzzleId   // 🔥 存储 muzzleId
        },
        // 确保命中率使用配置值
        hitRate: att.hitRate !== undefined ? att.hitRate : weapon.hitRate
      };
    });
  }

  /**
   * 🔥 获取武器的命中率（支持全局命中率映射）
   * @param {number} weaponId - 武器 ID
   * @param {number} distance - 距离
   * @param {Array} hitRateMap - 全局命中率映射 [{ distance, rate }, ...]
   * @returns {number} 命中率
   */
  getHitRateForWeapon(weaponId, distance, hitRateMap) {
    // 从 DataManager 获取命中率
    // 使用第一个配置（cfg-1）作为默认
    // 传入全局命中率映射作为后备
    const hitRate = this.dataManager.getHitRateForDistance(
      weaponId,
      'cfg-1',
      distance,
      hitRateMap || [{ distance: 30, rate: 0.85 }, { distance: 50, rate: 0.8 }, { distance: 100, rate: 0.7 }]
    );
    return hitRate;
  }

  // ============================================================
  // 9. 错误处理
  // ============================================================

  /**
   * 显示错误信息
   * @param {string} message - 错误信息
   */
  showError(message) {
    alert('❌ ' + message);
  }

  // ============================================================
  // 10. 工具方法
  // ============================================================

  /**
   * 获取应用状态
   * @returns {Object} 状态信息
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      dataLoaded: this.dataManager?.isLoaded || false,
      weaponCount: this.dataManager?.getWeapons()?.length || 0,
      bulletCount: this.dataManager?.getBullets()?.length || 0,
      priceCount: this.dataManager?.getPrices()?.length || 0
    };
  }

  /**
   * 重新加载数据
   */
  async reloadData() {
    try {
      await this.dataManager.loadFromJSON('./data.json');
      this.domController.refreshAll();
      console.log('✅ 数据重新加载完成');
    } catch (error) {
      console.error('重新加载失败:', error);
      alert('重新加载失败: ' + error.message);
    }
  }

  /**
   * 销毁应用
   */
  destroy() {
    if (this.eventHandler) {
      this.eventHandler.unbindAll();
    }
    if (this.chartManager) {
      this.chartManager.destroy();
    }
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
    this.isInitialized = false;
    console.log('🛑 应用已销毁');
  }
}

// ============================================================
// 启动应用
// ============================================================

const app = new App();
app.start();

// 导出应用实例（用于调试）
window.__app__ = app;

// 导出默认
export default app;