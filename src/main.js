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

    } catch (error) {
      console.error('❌ 应用启动失败:', error);
      this.showError('应用启动失败: ' + error.message);
    }
  }

  // ============================================================
  // 1. 等待就绪
  // ============================================================

  waitForDOM() {
    return new Promise((resolve) => {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', resolve);
      } else {
        resolve();
      }
    });
  }

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

  async initDataManager() {
    this.dataManager = getDataManager();
    await this.dataManager.loadFromJSON('./data.json');
  }

  setupSimulationEngine() {
    SimulationEngine.setDataManager(this.dataManager);
  }

  // ============================================================
  // 3. 初始化 ChartManager
  // ============================================================

  initChartManager() {
    this.chartManager = new ChartManager();
  }

  // ============================================================
  // 4. 初始化 DOMController
  // ============================================================

  initDOMController() {
    this.domController = new DOMController();
    this.domController.initialize({
      onBarrelEdit: (weaponId) => {
        if (this.barrelEditor) {
          this.barrelEditor.openEditor(weaponId);
        }
      }
    });
  }

  // ============================================================
  // 5. 初始化 BarrelEditor
  // ============================================================

  initBarrelEditor() {
    this.barrelEditor = new BarrelEditor(
      this.dataManager,
      this.domController,
      () => {
        this.domController.refreshWeaponTable();
        this.domController.refreshPriceTable();
      }
    );
  }

  // ============================================================
  // 6. 初始化 EventHandler
  // ============================================================

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

    document.addEventListener('calculate-ttk', () => {
      this.handleCalculate();
    });

    document.addEventListener('calculate-distance', () => {
      this.handleDistanceChart();
    });

    document.addEventListener('export-distance-json', () => {
      this.handleExportDistanceJSON();
    });
  }

  // ============================================================
  // 7. 核心功能 - TTK 计算
  // ============================================================

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

  prepareWeaponData() {
    const params = this.domController.readPageParams();
    
    validatePageParams(params);
    validateHitProb(params);

    const weapons = this.dataManager.getWeapons();
    if (!weapons || weapons.length === 0) {
      throw new Error('没有武器数据');
    }

    const attachments = this.buildAttachments(weapons, params);
    const armed = this.applyAttachments(weapons, attachments);
    validateWeaponHitRates(attachments, weapons);

    return { params, armed, attachments };
  }

  buildAttachments(weapons, params) {
    return weapons.map((weapon, index) => {
      const attachment = this.domController.getWeaponAttachment(weapon.id) || {
        barrelId: -1,
        muzzleId: 0,
        precision: 0.09
      };

      const bulletType = this.domController.getWeaponBulletType 
        ? this.domController.getWeaponBulletType(index) 
        : null;

      const hitRate = this.getHitRateForWeapon(weapon.id, params.distance, params.hitRateMap);

      const priceConfig = this.dataManager.getPriceByWeaponId(weapon.id);
      const configId = priceConfig?.configs?.[0]?.id || 'cfg-1';

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

  applyAttachments(weapons, attachments) {
    return weapons.map((weapon, index) => {
      const att = attachments[index] || {};
      
      const barrelId = att.barrelIndex !== undefined && att.barrelIndex > 0 
        ? att.barrelIndex - 1 
        : -1;
      
      const barrel = (barrelId >= 0 && weapon.barrels && weapon.barrels[barrelId])
        ? weapon.barrels[barrelId]
        : null;

      const muzzleId = att.muzzleIndex || 0;
      const muzzle = this.dataManager.getMuzzleById(muzzleId);

      const current = WeaponTable.calculateCurrentValues(
        weapon,
        barrel,
        muzzleId,
        att.velocityPrecision || 0.09
      );

      return {
        ...weapon,
        ...current,
        _original: { ...weapon },
        _current: { ...current },
        _attachments: {
          ...att,
          barrel: barrel,
          muzzle: muzzle,
          barrelId: barrelId,
          muzzleId: muzzleId
        },
        hitRate: att.hitRate !== undefined ? att.hitRate : weapon.hitRate
      };
    });
  }

  getHitRateForWeapon(weaponId, distance, hitRateMap) {
    const hitRate = this.dataManager.getHitRateForDistance(
      weaponId,
      'cfg-1',
      distance,
      hitRateMap || [{ distance: 30, rate: 0.9 }, { distance: 50, rate: 0.8 }, { distance: 100, rate: 0.7 }]
    );
    return hitRate;
  }

  // ============================================================
  // 9. 错误处理
  // ============================================================

  showError(message) {
    alert('❌ ' + message);
  }

  // ============================================================
  // 10. 工具方法
  // ============================================================

  getStatus() {
    return {
      initialized: this.isInitialized,
      dataLoaded: this.dataManager?.isLoaded || false,
      weaponCount: this.dataManager?.getWeapons()?.length || 0,
      bulletCount: this.dataManager?.getBullets()?.length || 0,
      priceCount: this.dataManager?.getPrices()?.length || 0
    };
  }

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
  }
}

// ============================================================
// 启动应用
// ============================================================

const app = new App();
app.start();

window.__app__ = app;

export default app;