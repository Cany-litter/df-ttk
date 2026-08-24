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
 * 8. 初始化 CacheManager（缓存管理）
 * 9. 协调 TTK 计算和距离图表计算
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
import { getCacheManager } from './core/CacheManager.js';

class App {
  constructor() {
    this.dataManager = null;
    this.domController = null;
    this.eventHandler = null;
    this.chartManager = null;
    this.barrelEditor = null;
    this.cacheManager = null;
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

      // 4. 初始化 CacheManager
      this.initCacheManager();

      // 5. 设置 SimulationEngine 的 DataManager 依赖
      this.setupSimulationEngine();

      // 6. 初始化图表管理器
      this.initChartManager();

      // 7. 初始化 DOM 控制器
      this.initDOMController();

      // 8. 初始化枪管编辑器
      this.initBarrelEditor();

      // 9. 初始化事件处理器
      this.initEventHandler();

      // 10. 绑定缓存相关事件
      this.bindCacheEvents();

      // 11. 应用启动完成
      this.isInitialized = true;
      console.log('✅ 应用启动完成');
      
      // 12. 输出缓存统计
      if (this.cacheManager) {
        this.cacheManager.logStats();
      }

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
  // 3. 初始化 CacheManager
  // ============================================================

  initCacheManager() {
    this.cacheManager = getCacheManager();
    console.log('✅ CacheManager 初始化完成');
  }

  // ============================================================
  // 4. 初始化 ChartManager
  // ============================================================

  initChartManager() {
    this.chartManager = new ChartManager();
    if (this.chartManager.distanceChart) {
      this.chartManager.distanceChart.setCacheManager(this.cacheManager);
    }
  }

  // ============================================================
  // 5. 初始化 DOMController
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
  // 6. 初始化 BarrelEditor
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
  // 7. 初始化 EventHandler
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
  // 8. 缓存相关事件绑定
  // ============================================================

  bindCacheEvents() {
    document.addEventListener('export-cache', () => {
      if (this.chartManager && this.chartManager.distanceChart) {
        this.chartManager.distanceChart.exportCache();
      } else {
        alert('⚠️ 请先生成折线图！');
      }
    });

    document.addEventListener('import-cache', async () => {
      if (this.chartManager && this.chartManager.distanceChart) {
        await this.chartManager.distanceChart.importCache();
      } else {
        alert('⚠️ 请先生成折线图！');
      }
    });

    document.addEventListener('clear-cache', () => {
      if (this.chartManager && this.chartManager.distanceChart) {
        this.chartManager.distanceChart.clearCache();
      }
    });

    console.log('✅ 缓存事件绑定完成');
  }

  // ============================================================
  // 9. 核心功能 - TTK 计算
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

      // 检查真实模拟模式下是否有启用的配置
      const toggle = document.getElementById('realSimulationToggle');
      const isRealMode = toggle ? toggle.checked : false;
      
      if (isRealMode) {
        const priceTable = document.getElementById('priceTable');
        if (priceTable) {
          const rows = priceTable.querySelectorAll('tbody tr');
          let hasEnabled = false;
          for (const row of rows) {
            const checkbox = row.querySelector('.price-enabled-checkbox');
            if (checkbox && checkbox.checked) {
              hasEnabled = true;
              break;
            }
          }
          if (!hasEnabled) {
            alert('⚠️ 真实模拟模式需要至少一个启用的价格配置！\n请到"价格数据" Tab 中启用至少一个配置。');
            return;
          }
        } else {
          alert('⚠️ 价格表格未加载，请刷新页面后重试。');
          return;
        }
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
  // 10. 数据准备
  // ============================================================

  /**
   * 准备武器数据
   * 优先从价格表格读取启用的配置，每个配置作为一个独立武器实例
   * 如果没有启用的配置，降级到原有逻辑
   */
  prepareWeaponData() {
    const params = this.domController.readPageParams();
    
    validatePageParams(params);
    validateHitProb(params);

    const weapons = this.dataManager.getWeapons();
    if (!weapons || weapons.length === 0) {
      throw new Error('没有武器数据');
    }

    // 从价格表格获取启用的配置
    const enabledConfigs = this.domController.getEnabledPriceConfigs(weapons, params);
    
    if (!enabledConfigs || enabledConfigs.length === 0) {
      // 没有启用的配置，使用降级方案
      console.warn('⚠️ 没有启用的价格配置，使用降级方案 (每个武器取第一个配置)');
      const { armed, attachments } = this.buildFallbackData(weapons, params);
      console.log(`📊 降级模式: ${armed.length} 把武器 (每个武器取第一个配置)`);
      return { params, armed, attachments };
    }
    
    console.log(`📋 使用 ${enabledConfigs.length} 个启用的价格配置`);
    // 打印启用的配置列表，便于调试
    console.log('  配置列表:', enabledConfigs.map(c => c.displayName).join(', '));
    
    // 从启用的配置构建武器数据
    const { armed, attachments } = this.buildFromConfigs(enabledConfigs, params);
    
    console.log(`✅ 从配置构建: ${armed.length} 个武器实例`);
    
    return { params, armed, attachments };
  }

  /**
   * 降级方案：每个武器取第一个价格配置
   * 当没有启用的价格配置时使用
   */
  buildFallbackData(weapons, params) {
    const armed = [];
    const attachments = [];
    
    for (const weapon of weapons) {
      // 获取该武器的第一个配置
      const priceConfig = this.dataManager.getPriceByWeaponId(weapon.id);
      let config = null;
      if (priceConfig && priceConfig.configs && priceConfig.configs.length > 0) {
        config = priceConfig.configs[0];
      }
      
      if (config) {
        // 使用配置中的枪管
        let barrel = null;
        let barrelIndex = -1;
        let barrelName = '无';
        
        if (config.barrelId !== undefined && config.barrelId >= 0 && 
            weapon.barrels && weapon.barrels[config.barrelId]) {
          barrel = weapon.barrels[config.barrelId];
          barrelIndex = config.barrelId;
          barrelName = barrel.name || '无';
        } else if (config.barrel && config.barrel !== '无') {
          const idx = this.dataManager.findBarrelIdByName(weapon.id, config.barrel);
          if (idx >= 0 && weapon.barrels && weapon.barrels[idx]) {
            barrel = weapon.barrels[idx];
            barrelIndex = idx;
            barrelName = config.barrel;
          }
        }
        
        // 如果还是没有枪管，使用最佳枪管
        if (!barrel) {
          const bestIdx = this.dataManager.findBestBarrelIndex(weapon.id);
          if (bestIdx >= 0 && weapon.barrels && weapon.barrels[bestIdx]) {
            barrel = weapon.barrels[bestIdx];
            barrelIndex = bestIdx;
            barrelName = barrel.name || '无';
          }
        }
        
        // 计算当前值
        const muzzleId = config.muzzleId || 0;
        const current = WeaponTable.calculateCurrentValues(weapon, barrel, muzzleId, 0.09);
        
        // 获取命中率
        const hitRate = this.dataManager.getHitRateForDistance(
          weapon.id,
          config.id || '#1',
          params.distance,
          params.hitRate
        );
        
        // 显示名称：武器名 + 序号（直接使用 config.id）
        const displayName = `${weapon.name} ${config.id || '#1'}`;
        
        const armedWeapon = {
          ...weapon,
          ...current,
          // ⭐ 显式覆盖为计算后的值
          velocity: current.velocity,
          rof: current.rof,
          flesh: current.flesh,
          armor: current.armor,
          ranges: current.ranges,
          mult: current.mult,
          
          _original: { ...weapon },
          _current: { ...current },
          _attachments: {
            barrel: barrel,
            barrelId: barrelIndex,
            barrelName: barrelName,
            muzzleId: muzzleId,
            muzzleName: config.muzzle || '无'
          },
          hitRate: hitRate,
          _displayName: displayName,
          _buildCode: config.buildCode || '-',
          _price: config.price || 0,
          _configId: config.id || '#1'
        };
        
        armed.push(armedWeapon);
        
        attachments.push({
          weaponId: weapon.id,
          configId: config.id || '#1',
          barrelIndex: barrelIndex >= 0 ? barrelIndex + 1 : 0,
          barrelName: barrelName,
          muzzleIndex: muzzleId,
          muzzleName: config.muzzle || '无',
          hitRate: hitRate,
          bulletType: config.bullet || null,
          displayName: displayName,
          buildCode: config.buildCode || '-',
          price: config.price || 0
        });
      } else {
        // 没有价格配置，使用默认值
        const bestIdx = this.dataManager.findBestBarrelIndex(weapon.id);
        const barrel = bestIdx >= 0 && weapon.barrels ? weapon.barrels[bestIdx] : null;
        const barrelName = barrel?.name || '无';
        const current = WeaponTable.calculateCurrentValues(weapon, barrel, 0, 0.09);
        
        const armedWeapon = {
          ...weapon,
          ...current,
          // ⭐ 显式覆盖为计算后的值
          velocity: current.velocity,
          rof: current.rof,
          flesh: current.flesh,
          armor: current.armor,
          ranges: current.ranges,
          mult: current.mult,
          
          _original: { ...weapon },
          _current: { ...current },
          _attachments: {
            barrel: barrel,
            barrelId: bestIdx,
            barrelName: barrelName,
            muzzleId: 0,
            muzzleName: '无'
          },
          hitRate: params.hitRate,
          _displayName: weapon.name,
          _buildCode: '-',
          _price: 0,
          _configId: '#1'
        };
        
        armed.push(armedWeapon);
        
        attachments.push({
          weaponId: weapon.id,
          configId: '#1',
          barrelIndex: bestIdx >= 0 ? bestIdx + 1 : 0,
          barrelName: barrelName,
          muzzleIndex: 0,
          muzzleName: '无',
          hitRate: params.hitRate,
          bulletType: null,
          displayName: weapon.name,
          buildCode: '-',
          price: 0
        });
      }
    }
    
    return { armed, attachments };
  }

  /**
   * 从价格配置构建武器数据
   * 每个配置生成一个独立的武器实例
   */
  buildFromConfigs(configs, params) {
    const armed = [];
    const attachments = [];
    
    // 获取枪口名称列表
    const muzzleOptions = this.dataManager.getMuzzleNames();
    
    for (const config of configs) {
      const weapon = config.weapon;
      
      // 计算应用枪管/枪口后的属性
      const current = WeaponTable.calculateCurrentValues(
        weapon,
        config.barrel,
        config.muzzleId,
        0.09  // 默认精校值，价格配置不单独设置精校
      );
      
      // 获取命中率（从配置中读取）
      const hitRate = config.hitRate;
      
      // 构建武装后的武器
      const armedWeapon = {
        ...weapon,
        ...current,
        // ⭐ 显式覆盖为计算后的值，确保柱状图使用应用枪管加成后的属性
        velocity: current.velocity,
        rof: current.rof,
        flesh: current.flesh,
        armor: current.armor,
        ranges: current.ranges,
        mult: current.mult,
        
        _original: { ...weapon },
        _current: { ...current },
        _attachments: {
          barrel: config.barrel,
          barrelId: config.barrelIndex,
          barrelName: config.barrelName,
          muzzleId: config.muzzleId,
          muzzleName: config.muzzleName
        },
        // 使用配置中的命中率
        hitRate: hitRate,
        // 存储价格配置显示信息
        _displayName: config.displayName,
        _buildCode: config.buildCode,
        _price: config.price,
        _configId: config.configId,
        _bulletId: config.bulletId,
        _hitRateMap: config.hitRateMap,
        _configIndex: config.configIndex,
        _priceRow: config._rawRow
      };
      
      armed.push(armedWeapon);
      
      // 构建附件配置
      const barrelIndex = config.barrelIndex >= 0 ? config.barrelIndex + 1 : 0;
      
      attachments.push({
        weaponId: weapon.id,
        configId: config.configId,
        barrelIndex: barrelIndex,
        barrelName: config.barrelName,
        muzzleIndex: config.muzzleId,
        muzzleName: config.muzzleName,
        hitRate: hitRate,
        hitRateMap: config.hitRateMap,
        bulletType: config.bulletId,
        displayName: config.displayName,
        buildCode: config.buildCode,
        price: config.price,
        _config: config
      });
    }
    
    console.log(`✅ 从配置构建: ${armed.length} 个武器实例`);
    
    return { armed, attachments };
  }

  // ============================================================
  // 11. 错误处理
  // ============================================================

  showError(message) {
    alert('❌ ' + message);
  }

  // ============================================================
  // 12. 工具方法
  // ============================================================

  getStatus() {
    return {
      initialized: this.isInitialized,
      dataLoaded: this.dataManager?.isLoaded || false,
      weaponCount: this.dataManager?.getWeapons()?.length || 0,
      bulletCount: this.dataManager?.getBullets()?.length || 0,
      priceCount: this.dataManager?.getPrices()?.length || 0,
      cacheSize: this.cacheManager?.getStats()?.size || 0
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
    if (this.cacheManager) {
      this.cacheManager.clear();
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