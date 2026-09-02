// src/main.js

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
 * 9. ⭐ 监听哈弗币消耗更新事件
 */
import { getDataManager } from './core/DataManager.js';
import { SimulationEngine } from './core/SimulationEngine.js';
import { BulletStrategyFactory } from './core/BulletStrategy.js';
import { getConfigCacheManager } from './core/ConfigCacheManager.js';
import DOMController from './ui/DOMController.js';
import EventHandler from './ui/EventHandler.js';
import BarrelEditor from './ui/BarrelEditor.js';
import { ChartManager } from './ui/ChartManager.js';
import WeaponTable from './ui/WeaponTable.js';
import { resetSeed } from './utils/rng.js';
import { validateHitProb, validateWeaponHitRates, validatePageParams } from './utils/validators.js';
import perf from './utils/performance.js';

class App {
  constructor() {
    // ⭐ 记录应用启动时间
    perf.mark('appStart', '应用启动');
    
    this.dataManager = null;
    this.domController = null;
    this.eventHandler = null;
    this.chartManager = null;
    this.barrelEditor = null;
    this.isInitialized = false;
    this._refreshTimer = null;
    this._isCalculating = false;  // 防止重复计算
    
    // 防止事件重复绑定
    this._eventHandlerInitialized = false;
    
    // ⭐ 新增：标记是否已完成首次自动计算
    this._initialAutoCalcDone = false;
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
      perf.mark('librariesLoaded', '第三方库加载完成');

      // 3. 初始化 DataManager 并加载数据
      await this.initDataManager();
      perf.mark('dataLoaded', '数据加载完成');

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
      perf.mark('appReady', '应用就绪');
      console.log('✅ 应用启动完成');
      
      // 10. 输出缓存统计
      this._logCacheStats();

      // ⭐ 11. 自动加载 TTK 柱状图和折线图
      this._autoLoadCharts();

      // ⭐ 12. 监听哈弗币消耗更新事件
      this._bindHavocCostEvents();

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
          // 将 weaponId 转换为 weapons 数组索引
          const weapons = this.dataManager.getWeapons();
          const index = weapons.findIndex(w => w.id === weaponId);
          if (index !== -1) {
            this.barrelEditor.openEditor(index);
          } else {
            console.error(`❌ 未找到武器 ID: ${weaponId}`);
            alert('未找到该武器，请刷新页面后重试');
          }
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
    // 防止重复绑定
    if (this._eventHandlerInitialized) {
      console.warn('⚠️ EventHandler 已初始化，跳过重复绑定');
      return;
    }
    this._eventHandlerInitialized = true;

    this.eventHandler = new EventHandler(this.domController, this.dataManager);
    this.eventHandler.initialize({
      onCalculate: () => {
        this.handleCalculate();
      },
      onDistanceChart: () => {
        this.handleDistanceChart();
      }
    });

    // 只保留其他模块触发的特殊事件
    document.addEventListener('export-distance-json', () => {
      this.handleExportDistanceJSON();
    });
  }

  // ============================================================
  // 7. ⭐ 绑定哈弗币消耗更新事件
  // ============================================================

  _bindHavocCostEvents() {
    document.addEventListener('havoc-cost-update', (e) => {
      this._handleHavocCostUpdate(e.detail.havocCosts);
    });
  }

  /**
   * 处理哈弗币消耗更新
   */
  _handleHavocCostUpdate(havocCosts) {
    if (!this.domController) {
      console.warn('⚠️ DOMController 未初始化，无法更新哈弗币消耗');
      return;
    }
    this.domController.updateHavocCosts(havocCosts);
  }

  // ============================================================
  // 8. ⭐ 自动加载图表
  // ============================================================

  /**
   * 启动完成后自动加载 TTK 柱状图和折线图
   * 使用 requestAnimationFrame 确保 DOM 已完全渲染
   */
  _autoLoadCharts() {
    // 延迟执行，确保所有组件都已完全初始化
    setTimeout(() => {
      if (this._initialAutoCalcDone) {
        console.log('⏳ 自动加载已执行，跳过');
        return;
      }
      this._initialAutoCalcDone = true;

      console.log('🔄 自动加载 TTK 柱状图和折线图...');
      perf.mark('autoCalcStart', '自动计算开始');

      // 先加载柱状图
      this.handleCalculate();

      // 延迟 300ms 再加载折线图，避免同时计算造成性能压力
      setTimeout(() => {
        this.handleDistanceChart();
        perf.mark('autoCalcDone', '自动计算完成');
        console.log('✅ 自动加载完成');
        
        // ⭐ 输出性能报告
        perf.report();
      }, 300);
    }, 500);  // 等待 500ms 确保 DOM 完全渲染
  }

  // ============================================================
  // 9. 核心功能 - TTK 计算 ⭐ 核心修改：优先从缓存读取
  // ============================================================

  /**
   * 处理 TTK 计算
   * ⭐ 核心修改：优先从缓存读取，避免重复模拟
   * 使用防锁防止重复调用
   */
  handleCalculate() {
    // 防止重复调用
    if (this._isCalculating) {
      console.log('⏳ 计算中，请稍候...');
      return;
    }
    this._isCalculating = true;

    try {
      const { params, armed, attachments } = this.prepareWeaponData();
      
      if (!armed || armed.length === 0) {
        alert('没有可用的武器数据，请检查 data.json');
        this._isCalculating = false;
        return;
      }

      perf.mark('ttkCalcStart', 'TTK计算开始');
      resetSeed();
      
      // ⭐⭐⭐ 核心修改：直接从缓存构建结果，而不是调用 SimulationEngine.calculateWeaponsTTK()
      const dm = this.dataManager;
      const cacheManager = getConfigCacheManager(dm);
      const distance = params.distance || 30;
      
      const results = [];
      let cacheHitCount = 0;
      let cacheMissCount = 0;
      
      for (let idx = 0; idx < armed.length; idx++) {
        const weapon = armed[idx];
        const attachment = attachments[idx] || {};
        const configId = attachment.configId || '#1';
        const weaponId = weapon.id;
        
        let avgTime = 0;
        let avgShots = 0;
        let avgMisses = 0;
        let avgBurstInterval = 0;
        let fromCache = false;
        
        // ⭐ 优先从缓存获取
        const price = dm.getPriceByWeaponId(weaponId);
        if (price) {
          const config = price.configs.find(c => c.id === configId);
          if (config && config.cache && config.cache.keyPoints) {
            const totalTimeMs = cacheManager.interpolateTTK(config.cache.keyPoints, distance);
            avgTime = totalTimeMs / 1000;  // 转换为秒
            fromCache = true;
            cacheHitCount++;
            
            // 从关键点提取 avgShots
            let totalShots = 0;
            let shotCount = 0;
            for (const point of config.cache.keyPoints) {
              if (point.shots !== undefined && point.shots !== null) {
                totalShots += point.shots;
                shotCount++;
              }
            }
            avgShots = shotCount > 0 ? totalShots / shotCount : 0;
            avgMisses = Math.max(0, Math.round(avgShots * 0.15));
          }
        }
        
        // ⭐ 缓存未命中，降级到模拟计算
        if (!fromCache) {
          cacheMissCount++;
          console.log(`  ⚠️ 缓存未命中: ${weapon._displayName || weapon.name}，执行模拟计算`);
          
          // 获取真实子弹
          const realBulletKey = SimulationEngine.getRealBulletKey(
            attachment.bulletType, weapon, params, dm
          );
          if (realBulletKey) {
            const bulletData = dm.getBulletById(realBulletKey);
            if (bulletData) {
              const strategy = BulletStrategyFactory.getStrategy(realBulletKey);
              const stat = SimulationEngine.calculateAvgStats(
                weapon, params, undefined, strategy, bulletData
              );
              avgTime = stat.avgTime;
              avgShots = stat.avgShots;
              avgMisses = stat.avgMisses;
              avgBurstInterval = stat.avgBurstInterval;
            }
          }
        }
        
        results.push({
          weapon: weapon,
          avgTime: avgTime,
          avgShots: avgShots,
          avgMisses: avgMisses,
          avgBurstInterval: avgBurstInterval,
          name: weapon._displayName || weapon.name,
          _fromCache: fromCache
        });
      }
      
      // 按 TTK 排序
      results.sort((a, b) => a.avgTime - b.avgTime);
      
      perf.mark('ttkCalcDone', 'TTK计算完成');
      
      // ⭐ 输出缓存统计
      const total = cacheHitCount + cacheMissCount;
      if (total > 0) {
        const hitRate = Math.round((cacheHitCount / total) * 100);
        console.log(`📊 TTK计算结果: ${cacheHitCount}/${total} 个配置来自缓存 (${hitRate}%)`);
        if (cacheMissCount > 0) {
          console.log(`  ⚠️ ${cacheMissCount} 个配置缓存未命中，已执行模拟计算`);
        }
      }
      
      this.chartManager.updateTtkChart(results, params);
      
      console.log(`📊 TTK 计算完成，${results.length} 把武器`);
      
    } catch (error) {
      console.error('TTK 计算失败:', error);
      alert('TTK 计算失败: ' + error.message);
    } finally {
      this._isCalculating = false;
    }
  }

  /**
   * 处理距离图表生成
   * 使用防锁防止重复调用
   */
  handleDistanceChart() {
    // 防止重复调用
    if (this._isCalculating) {
      console.log('⏳ 计算中，请稍候...');
      return;
    }
    this._isCalculating = true;

    try {
      const { params, armed, attachments } = this.prepareWeaponData();
      
      if (!armed || armed.length === 0) {
        alert('没有可用的武器数据，请检查 data.json');
        this._isCalculating = false;
        return;
      }

      perf.mark('distanceChartStart', '折线图计算开始');
      // ⭐ DistanceChart.update 内部会计算哈弗币消耗并触发更新事件
      this.chartManager.updateDistanceChart(armed, attachments, params);
      perf.mark('distanceChartDone', '折线图计算完成');
      
      console.log(`📈 距离图表生成完成，${armed.length} 把武器`);
    } catch (error) {
      console.error('距离图表生成失败:', error);
      alert('距离图表生成失败: ' + error.message);
    } finally {
      this._isCalculating = false;
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
  // 10. 数据准备 ⭐ 核心修改：传递 hitRateMap
  // ============================================================

  /**
   * 准备武器数据
   * 优先从价格表格读取启用的配置，每个配置作为一个独立武器实例
   * 如果没有启用的配置，降级到原有逻辑
   * 
   * ⭐ 核心修改：确保 hitRateMap 在 attachments 中传递
   */
  prepareWeaponData() {
    const params = this.domController.readPageParams();
    
    validatePageParams(params);
    validateHitProb(params);

    const weapons = this.dataManager.getWeapons();
    if (!weapons || weapons.length === 0) {
      throw new Error('没有武器数据');
    }

    // 从价格表格获取启用的配置（包含 hitRateMap）
    const enabledConfigs = this.domController.getEnabledPriceConfigs(weapons, params);
    
    if (!enabledConfigs || enabledConfigs.length === 0) {
      // 没有启用的配置，使用降级方案
      console.warn('⚠️ 没有启用的价格配置，使用降级方案 (每个武器取第一个配置)');
      const { armed, attachments } = this.buildFallbackData(weapons, params);
      console.log(`📊 降级模式: ${armed.length} 把武器 (每个武器取第一个配置)`);
      return { params, armed, attachments };
    }
    
    // 从启用的配置构建武器数据（包含 hitRateMap）
    const { armed, attachments } = this.buildFromConfigs(enabledConfigs, params);
    
    return { params, armed, attachments };
  }

  /**
   * 降级方案：每个武器取第一个价格配置
   * 当没有启用的价格配置时使用
   * ⭐ 修改：包含 hitRateMap
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
        
        // ⭐ 构建配置自己的命中率映射
        let hitRateMap = [];
        if (config.distance && config.hitRate && 
            Array.isArray(config.distance) && Array.isArray(config.hitRate) &&
            config.distance.length > 0 && config.hitRate.length > 0) {
          const len = Math.min(config.distance.length, config.hitRate.length);
          for (let i = 0; i < len; i++) {
            hitRateMap.push({
              distance: config.distance[i],
              rate: config.hitRate[i]
            });
          }
        }
        
        // 如果没有配置自己的映射，使用全局的
        if (hitRateMap.length === 0) {
          hitRateMap = params.hitRateMap || [];
        }
        
        // 获取命中率
        let hitRate = params.hitRate || 0.85;
        if (hitRateMap.length > 0) {
          hitRate = this.dataManager.getHitRateFromMap(
            hitRateMap,
            params.distance || 30,
            0.85
          );
        }
        
        // 显示名称：武器名 + 序号（直接使用 config.id）
        const displayName = `${weapon.name} ${config.id || '#1'}`;
        
        const armedWeapon = {
          ...weapon,
          ...current,
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
          hitRateMap: hitRateMap,
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
        
        // 使用全局命中率映射
        const hitRateMap = params.hitRateMap || [];
        let hitRate = params.hitRate || 0.85;
        if (hitRateMap.length > 0) {
          hitRate = this.dataManager.getHitRateFromMap(
            hitRateMap,
            params.distance || 30,
            0.85
          );
        }
        
        const armedWeapon = {
          ...weapon,
          ...current,
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
          hitRate: hitRate,
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
          hitRateMap: hitRateMap,
          hitRate: hitRate,
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
   * 
   * ⭐ 核心修改：确保 hitRateMap 在 attachments 中传递
   * ⭐ 精简日志：移除逐条命中率打印
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
      
      // ⭐ 获取配置自己的命中率映射（由 DOMController 提供）
      const hitRateMap = config.hitRateMap || [];
      
      // 获取命中率（从配置中读取，或从映射计算）
      let hitRate = config.hitRate;
      
      // 如果配置没有提供 hitRate，从 hitRateMap 计算
      if (hitRate === undefined || hitRate === null) {
        if (hitRateMap.length > 0) {
          hitRate = this.dataManager.getHitRateFromMap(
            hitRateMap,
            params.distance || 30,
            0.85
          );
        } else {
          hitRate = params.hitRate || 0.85;
        }
      }
      
      // 构建武装后的武器
      const armedWeapon = {
        ...weapon,
        ...current,
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
        hitRate: hitRate,
        _displayName: config.displayName,
        _buildCode: config.buildCode,
        _price: config.price,
        _configId: config.configId,
        _bulletId: config.bulletId,
        _hitRateMap: hitRateMap,
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
        hitRateMap: hitRateMap,
        hitRate: hitRate,
        bulletType: config.bulletId,
        displayName: config.displayName,
        buildCode: config.buildCode,
        price: config.price,
        _config: config
      });
    }
    
    // ⭐ 精简日志：只打印汇总信息
    console.log(`✅ 从配置构建: ${armed.length} 个武器实例`);
    
    // ⭐ 只打印统计信息，不逐条打印
    const withCustomMap = attachments.filter(a => a.hitRateMap && a.hitRateMap.length > 0).length;
    if (withCustomMap > 0) {
      console.log(`  📊 ${withCustomMap}/${attachments.length} 个配置使用自定义命中率映射`);
    }
    
    return { armed, attachments };
  }

  // ============================================================
  // 11. 缓存统计
  // ============================================================

  /**
   * 输出缓存统计信息
   */
  _logCacheStats() {
    if (!this.dataManager) return;
    
    const stats = this.dataManager.getStats();
    console.log(`📊 数据统计: ${stats.weaponCount} 把武器, ${stats.bulletCount} 种子弹, ${stats.priceCount} 条价格配置`);
    console.log(`📊 缓存统计: ${stats.cachedConfigs}/${stats.totalConfigs} 个配置已缓存`);
    
    if (stats.modifiedWeapons > 0) {
      console.log(`📝 修改标记: ${stats.modifiedWeapons} 个武器待重新计算`);
    }
  }

  // ============================================================
  // 12. 错误处理
  // ============================================================

  showError(message) {
    alert('❌ ' + message);
  }

  // ============================================================
  // 13. 工具方法
  // ============================================================

  getStatus() {
    const stats = this.dataManager?.getStats() || {};
    return {
      initialized: this.isInitialized,
      dataLoaded: this.dataManager?.isLoaded || false,
      weaponCount: stats.weaponCount || 0,
      bulletCount: stats.bulletCount || 0,
      priceCount: stats.priceCount || 0,
      cachedConfigs: stats.cachedConfigs || 0,
      totalConfigs: stats.totalConfigs || 0,
      modifiedWeapons: stats.modifiedWeapons || 0
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
    this._eventHandlerInitialized = false;
  }
}

// ============================================================
// 启动应用
// ============================================================

const app = new App();
app.start();

window.__app__ = app;

export default app;