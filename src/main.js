// src/main.js

import { SimulationEngine } from './core/SimulationEngine.js';
import { WeaponManager } from './core/WeaponManager.js';
import { BulletStrategyFactory } from './core/BulletStrategy.js';
import { ChartManager } from './ui/ChartManager.js';
import { DOMController } from './ui/DOMController.js';
import { EventHandler } from './ui/EventHandler.js';
import { validateHitProb, validateWeaponHitRates, validatePageParams } from './utils/validators.js';
import { resetSeed } from './utils/rng.js';
import { isSpecialBullet } from './core/bullets.js';
import { initializePrices, getPrices, getBulletPrice, setBulletPrice } from './core/pricingManager.js';

/**
 * 应用主控制器
 * 负责协调各个模块，处理用户交互和业务逻辑
 * 
 * 适配新的 configs 结构：
 * - 从 configs 读取命中率曲线、子弹类型、携带数量
 * - 每个武器可以有多个 configs，计算时使用第一个或当前选中的 config
 * - bulletType 为口径名称 (如 '5.45x39')，bulletLevel 为等级 (1-5)
 * 
 * 价格数据分离：
 * - 子弹价格和武器价格由 pricingManager 统一管理
 * - 价格数据存储在 localStorage 中，支持导入/导出
 */
class AppController {
  constructor() {
    // 等待 DOM 完全加载后再初始化
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.waitForLibraries());
    } else {
      this.waitForLibraries();
    }
  }

  waitForLibraries() {
    // 检查必要的库是否已加载
    if (typeof Chart === 'undefined') {
      console.log('等待 Chart.js 加载...');
      setTimeout(() => this.waitForLibraries(), 100);
      return;
    }
    
    if (typeof ChartDataLabels === 'undefined') {
      console.log('等待 ChartDataLabels 插件加载...');
      setTimeout(() => this.waitForLibraries(), 100);
      return;
    }
    
    console.log('所有库已加载完成，开始初始化应用');
    this.initialize();
  }

  /**
   * 初始化应用
   */
  async initialize() {
    try {
      console.log('开始初始化应用...');
      
      // 1. 创建 WeaponManager
      this.weaponManager = new WeaponManager();
      
      // 2. 初始化价格数据（在加载武器数据之前）
      await this.initializePricing();
      
      // 3. 加载武器数据
      await this.loadWeaponsFromJSON();
      
      // 4. 将 pricingManager 注入到 WeaponManager
      this.weaponManager.setPricingManager({
        getWeaponPrice: (weaponName, configId, defaultPrice) => {
          // 从 pricingManager 获取武器价格
          const prices = getPrices();
          const weaponPrice = prices.weaponPrices[weaponName];
          if (weaponPrice && weaponPrice[configId] !== undefined) {
            return weaponPrice[configId];
          }
          return defaultPrice || 0;
        },
        setWeaponPrice: (weaponName, configId, price) => {
          // 使用 pricingManager 设置武器价格
          const prices = getPrices();
          if (!prices.weaponPrices[weaponName]) {
            prices.weaponPrices[weaponName] = {};
          }
          prices.weaponPrices[weaponName][configId] = price;
          // 保存到 localStorage
          const { savePricesToStorage } = require('./core/pricingManager.js');
          savePricesToStorage(prices);
        }
      });
      
      // 5. 创建 DOMController（此时 WeaponManager 中已有数据）
      this.domController = new DOMController(this.weaponManager);
      
      // 6. 创建 ChartManager 和 EventHandler
      this.chartManager = new ChartManager();
      this.eventHandler = new EventHandler();

      // 7. 初始化 UI（使用已加载的数据）
      this.domController.renderAttachmentTable();
      
      // 8. 应用全局枪管类型设置
      this.domController.updateGlobalBarrelSelections();
      
      // 9. 绑定事件处理器
      this.eventHandler.bindEventHandlers(
        () => this.handleCalculate(),
        () => this.handleDistanceChart(),
        () => this.domController.updateGlobalBarrelSelections()
      );

      // 10. 添加控制按钮（重置、导出、导入）
      this.addControlButtons();

      // 11. 添加价格管理按钮
      this.addPriceManagementButtons();

      console.log('应用初始化完成');
    } catch (error) {
      console.error('应用初始化失败:', error);
      // 注意：此时 domController 可能还未创建，需要单独处理错误
      if (this.domController) {
        this.domController.showError('应用初始化失败: ' + error.message);
      } else {
        alert('应用初始化失败: ' + error.message);
      }
    }
  }

  /**
   * 初始化价格数据
   * 从 localStorage 或 prices.json 加载
   */
  async initializePricing() {
    try {
      console.log('正在初始化价格数据...');
      const data = await initializePrices();
      console.log(`✅ 价格数据初始化完成，子弹价格: ${Object.keys(data.bulletPrices || {}).length} 项，武器价格: ${Object.keys(data.weaponPrices || {}).length} 项`);
    } catch (error) {
      console.error('❌ 价格数据初始化失败:', error);
      throw new Error('价格数据初始化失败: ' + error.message);
    }
  }

  /**
   * 直接从 weapons.json 加载数据
   * 如果加载失败，页面显示错误，不再使用备用数据
   */
  async loadWeaponsFromJSON() {
    try {
      console.log('正在从 weapons.json 加载武器数据...');
      
      const response = await fetch('./weapons.json');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('数据格式无效或为空');
      }
      
      // 加载数据到 WeaponManager
      this.weaponManager.loadWeapons(data);
      
      console.log(`✅ 从 weapons.json 加载了 ${data.length} 把武器数据`);
      
    } catch (error) {
      console.error(`❌ 加载 weapons.json 失败: ${error.message}`);
      // 显示错误信息给用户
      const errorMsg = `无法加载武器数据: ${error.message}\n请确保 weapons.json 文件存在且格式正确。`;
      alert(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * 添加控制按钮（重置、导出、导入）
   */
  addControlButtons() {
    const buttonsContainer = document.querySelector('.buttons-container');
    if (!buttonsContainer) return;
    
    // 添加分隔符
    const separator = document.createElement('span');
    separator.style.margin = '0 8px';
    separator.textContent = '|';
    buttonsContainer.appendChild(separator);
    
    // 添加重置按钮（重置为 weapons.json 的默认数据）
    const resetBtn = document.createElement('button');
    resetBtn.id = 'resetDataBtn';
    resetBtn.textContent = '🔄 重置为默认';
    resetBtn.style.backgroundColor = '#ff9800';
    resetBtn.style.color = '#fff';
    resetBtn.addEventListener('click', () => {
      this.resetToDefault();
    });
    buttonsContainer.appendChild(resetBtn);
    
    // 添加导出按钮
    const exportBtn = document.createElement('button');
    exportBtn.id = 'exportDataBtn';
    exportBtn.textContent = '📤 导出数据';
    exportBtn.style.backgroundColor = '#9c27b0';
    exportBtn.style.color = '#fff';
    exportBtn.addEventListener('click', () => {
      this.exportWeaponData();
    });
    buttonsContainer.appendChild(exportBtn);
    
    // 添加导入按钮
    const importBtn = document.createElement('button');
    importBtn.id = 'importDataBtn';
    importBtn.textContent = '📥 导入数据';
    importBtn.style.backgroundColor = '#607d8b';
    importBtn.style.color = '#fff';
    importBtn.addEventListener('click', () => {
      this.importWeaponData();
    });
    buttonsContainer.appendChild(importBtn);
  }

  /**
   * 添加价格管理按钮
   */
  addPriceManagementButtons() {
    const buttonsContainer = document.querySelector('.buttons-container');
    if (!buttonsContainer) return;
    
    // 添加分隔符
    const separator = document.createElement('span');
    separator.style.margin = '0 8px';
    separator.textContent = '|';
    buttonsContainer.appendChild(separator);
    
    // 添加导出价格按钮
    const exportPriceBtn = document.createElement('button');
    exportPriceBtn.id = 'exportPriceBtn';
    exportPriceBtn.textContent = '💰 导出价格';
    exportPriceBtn.style.backgroundColor = '#2e7d32';
    exportPriceBtn.style.color = '#fff';
    exportPriceBtn.addEventListener('click', () => {
      if (this.domController) {
        this.domController.exportPrices();
      }
    });
    buttonsContainer.appendChild(exportPriceBtn);
    
    // 添加导入价格按钮
    const importPriceBtn = document.createElement('button');
    importPriceBtn.id = 'importPriceBtn';
    importPriceBtn.textContent = '💰 导入价格';
    importPriceBtn.style.backgroundColor = '#00695c';
    importPriceBtn.style.color = '#fff';
    importPriceBtn.addEventListener('click', () => {
      if (this.domController) {
        this.domController.importPrices();
      }
    });
    buttonsContainer.appendChild(importPriceBtn);
    
    // 添加重置价格按钮
    const resetPriceBtn = document.createElement('button');
    resetPriceBtn.id = 'resetPriceBtn';
    resetPriceBtn.textContent = '💰 重置价格';
    resetPriceBtn.style.backgroundColor = '#e65100';
    resetPriceBtn.style.color = '#fff';
    resetPriceBtn.addEventListener('click', () => {
      if (this.domController) {
        this.domController.resetPrices();
      }
    });
    buttonsContainer.appendChild(resetPriceBtn);
  }

  /**
   * 重置为 weapons.json 的默认数据
   */
  async resetToDefault() {
    if (!confirm('⚠️ 确定要重置所有武器数据为默认值吗？\n（当前修改将丢失！）')) {
      return;
    }
    
    try {
      // 重新从 weapons.json 加载
      const response = await fetch('./weapons.json');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('数据格式无效或为空');
      }
      
      // 加载数据到 WeaponManager
      this.weaponManager.loadWeapons(data);
      
      // 重新渲染表格
      this.domController.renderAttachmentTable();
      
      // 重新应用全局枪管设置
      this.domController.updateGlobalBarrelSelections();
      
      // 刷新当前Tab
      this.domController.refreshCurrentTab();
      
      // 刷新子弹管理
      this.domController.refreshBulletManagement();
      
      console.log('✅ 已重置为 weapons.json 的默认数据');
      alert('✅ 已重置为默认数据！');
      
    } catch (error) {
      console.error('重置失败:', error);
      alert(`❌ 重置失败: ${error.message}\n请检查 weapons.json 文件是否存在且格式正确。`);
    }
  }

  /**
   * 导出武器数据为JSON文件
   */
  exportWeaponData() {
    try {
      const weapons = this.weaponManager.getWeapons();
      // 导出时清理 configs 中的 price 字段（价格由 pricingManager 管理）
      const cleanWeapons = weapons.map(w => {
        const clean = { ...w };
        if (clean.configs) {
          clean.configs = clean.configs.map(c => {
            const cleanC = { ...c };
            delete cleanC.price;
            return cleanC;
          });
        }
        return clean;
      });
      
      const jsonStr = JSON.stringify(cleanWeapons, (key, value) => {
        // 处理 Infinity
        if (value === Infinity) return 'Infinity';
        return value;
      }, 2);
      
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `ttk_weapons_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      alert('✅ 武器数据已导出！');
    } catch (error) {
      console.error('导出失败:', error);
      alert('❌ 导出失败: ' + error.message);
    }
  }

  /**
   * 导入武器数据
   */
  importWeaponData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const importedData = JSON.parse(event.target.result);
          if (!Array.isArray(importedData) || importedData.length === 0) {
            throw new Error('无效的数据格式');
          }
          
          // 处理 Infinity 和价格字段
          const processedData = importedData.map(w => {
            // 处理 ranges
            if (w.ranges) {
              w.ranges = w.ranges.map(r => r === 'Infinity' ? Infinity : r);
            }
            // 处理 barrels 中的 ranges
            if (w.barrels) {
              w.barrels = w.barrels.map(b => {
                if (b.ranges) {
                  b.ranges = b.ranges.map(r => r === 'Infinity' ? Infinity : r);
                }
                if (b.decays) {
                  b.decays = b.decays.map(d => d === 'Infinity' ? Infinity : d);
                }
                return b;
              });
            }
            if (w.decays) {
              w.decays = w.decays.map(d => d === 'Infinity' ? Infinity : d);
            }
            // 确保 bulletLevel 字段存在
            if (w.configs) {
              w.configs = w.configs.map(c => {
                if (c.bulletLevel === undefined) {
                  c.bulletLevel = 4;
                }
                // 如果导入的数据包含价格，尝试导入到 pricingManager
                if (c.price !== undefined && c.price !== null) {
                  try {
                    const { setWeaponPrice } = require('./core/pricingManager.js');
                    const configId = c.id || 'cfg-1';
                    // 导入武器价格到 pricingManager
                    // 注意：这里需要异步处理，但我们先存储，后续通过 WeaponManager 处理
                    console.log(`导入武器价格: ${w.name} ${configId} = ${c.price}`);
                  } catch (err) {
                    console.warn('导入武器价格失败:', err);
                  }
                }
                // 移除 price 字段（价格由 pricingManager 管理）
                const cleanC = { ...c };
                delete cleanC.price;
                return cleanC;
              });
            }
            return w;
          });
          
          if (confirm(`⚠️ 确定要导入 ${processedData.length} 把武器的数据吗？\n这将覆盖当前所有武器数据！`)) {
            // 加载数据到 WeaponManager
            this.weaponManager.loadWeapons(processedData);
            
            // 重新渲染表格
            this.domController.renderAttachmentTable();
            
            // 重新应用全局枪管设置
            this.domController.updateGlobalBarrelSelections();
            
            // 刷新当前Tab
            this.domController.refreshCurrentTab();
            
            // 刷新子弹管理
            this.domController.refreshBulletManagement();
            
            alert(`✅ 成功导入 ${processedData.length} 把武器的数据！`);
          }
        } catch (error) {
          console.error('导入失败:', error);
          alert('❌ 导入失败: ' + error.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  /**
   * 处理计算按钮点击
   */
  handleCalculate() {
    try {
      const { params, armed, attachments, configs } = this.prepareWeaponData();
      resetSeed();
      const results = SimulationEngine.calculateWeaponsTTK(armed, attachments, params, configs);
      this.chartManager.updateTtkChart(results, params);
    } catch (error) {
      this.handleError('计算失败', error);
    }
  }

  /**
   * 处理距离图表按钮点击
   */
  handleDistanceChart() {
    try {
      const { params, armed, attachments, configs } = this.prepareWeaponData();
      this.chartManager.updateDistanceChart(armed, attachments, params);
    } catch (error) {
      this.handleError('距离图表生成失败', error);
    }
  }

  /**
   * 准备武器数据的公共方法
   * @returns {Object} { params, armed, attachments, configs }
   */
  prepareWeaponData() {
    // 1. 读取和验证参数
    const params = this.domController.readPageParams();
    validatePageParams(params);
    validateHitProb(params);

    // 2. 读取武器配置
    const bulletInfoList = this.domController.readWeaponBullets();
    const { barrelValues, muzzleValues, hitRateValues } = this.domController.collectAttachmentData();
    
    // 3. 应用附件
    // 注意：readAttachmentsWithBullet 现在返回包含 bulletType 和 bulletLevel 的对象
    const attachmentConfigs = this.weaponManager.readAttachmentsWithBullet(
      barrelValues, 
      muzzleValues, 
      bulletInfoList
    );
    
    // 验证命中率
    const weapons = this.weaponManager.getWeapons();
    validateWeaponHitRates(attachmentConfigs, weapons);
    
    // 获取每个武器的 configs（用于 SimulationEngine）
    const configs = weapons.map((w, idx) => {
      // 使用第一个 config
      if (w.configs && w.configs.length > 0) {
        return w.configs[0];
      }
      return null;
    });
    
    // 应用附件，传入 configs 以便读取精校值等
    const armed = this.weaponManager.applyAttachments(attachmentConfigs, params, configs);
    const allAttachments = this.buildCompleteAttachments(armed, attachmentConfigs);

    return { params, armed, attachments: allAttachments, configs };
  }

  /**
   * 构建完整的附件配置数组（包含副本武器）
   * @param {Array} allWeapons - 所有武器数组
   * @param {Array} originalAttachments - 原始武器附件配置
   * @returns {Array} 完整的附件配置数组
   */
  buildCompleteAttachments(allWeapons, originalAttachments) {
    const allAttachments = [...originalAttachments];
    
    allWeapons.slice(originalAttachments.length).forEach((clone) => {
      allAttachments.push(clone.attachmentConfig);
    });
    
    return allAttachments;
  }

  /**
   * 统一错误处理方法
   * @param {string} operation - 操作名称
   * @param {Error} error - 错误对象
   */
  handleError(operation, error) {
    if (this.domController) {
      this.domController.showError(error.message);
    } else {
      alert('❌ ' + error.message);
    }
    console.error(`${operation}:`, error);
  }
}

// 启动应用
const app = new AppController();

// 导出应用实例（用于调试）
window.app = app;