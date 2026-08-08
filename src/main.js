import { SimulationEngine } from './core/SimulationEngine.js';
import { WeaponManager } from './core/WeaponManager.js';
import { BulletStrategyFactory } from './core/BulletStrategy.js';
import { ChartManager } from './ui/ChartManager.js';
import { DOMController } from './ui/DOMController.js';
import { EventHandler } from './ui/EventHandler.js';
import { validateHitProb, validateWeaponHitRates, validatePageParams } from './utils/validators.js';
import { resetSeed } from './utils/rng.js';

/**
 * 应用主控制器
 * 负责协调各个模块，处理用户交互和业务逻辑
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
      
      // 2. 先加载武器数据（await 确保数据加载完成）
      await this.loadWeaponsFromJSON();
      
      // 3. 再创建 DOMController（此时 WeaponManager 中已有数据）
      this.domController = new DOMController(this.weaponManager);
      
      // 4. 创建 ChartManager 和 EventHandler
      this.chartManager = new ChartManager();
      this.eventHandler = new EventHandler();

      // 5. 初始化 UI（使用已加载的数据）
      this.domController.renderAttachmentTable();
      
      // 6. 应用全局枪管类型设置
      this.domController.updateGlobalBarrelSelections();
      
      // 7. 绑定事件处理器
      this.eventHandler.bindEventHandlers(
        () => this.handleCalculate(),
        () => this.handleDistanceChart(),
        () => this.domController.updateGlobalBarrelSelections()
      );

      // 8. 添加控制按钮（重置、导出、导入）
      this.addControlButtons();

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
      const jsonStr = JSON.stringify(weapons, (key, value) => {
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
          
          // 处理 Infinity
          const processedData = importedData.map(w => {
            if (w.ranges) {
              w.ranges = w.ranges.map(r => r === 'Infinity' ? Infinity : r);
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
      const { params, armed, attachments } = this.prepareWeaponData();
      resetSeed();
      const results = SimulationEngine.calculateWeaponsTTK(armed, attachments, params);
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
      const { params, armed, attachments } = this.prepareWeaponData();
      this.chartManager.updateDistanceChart(armed, attachments, params);
    } catch (error) {
      this.handleError('距离图表生成失败', error);
    }
  }

  /**
   * 准备武器数据的公共方法
   * @returns {Object} { params, armed, attachments }
   */
  prepareWeaponData() {
    // 1. 读取和验证参数
    const params = this.domController.readPageParams();
    validatePageParams(params);
    validateHitProb(params);

    // 2. 读取武器配置
    const bulletTypes = this.domController.readWeaponBullets();
    const { barrelValues, muzzleValues, hitRateValues } = this.domController.collectAttachmentData();
    
    // 3. 应用附件
    const attachmentConfigs = this.weaponManager.readAttachmentsWithBullet(
      barrelValues, 
      muzzleValues, 
      hitRateValues, 
      bulletTypes
    );
    
    // 验证命中率
    const weapons = this.weaponManager.getWeapons();
    validateWeaponHitRates(attachmentConfigs, weapons);
    
    const armed = this.weaponManager.applyAttachments(attachmentConfigs, params);
    const allAttachments = this.buildCompleteAttachments(armed, attachmentConfigs);

    return { params, armed, attachments: allAttachments };
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
    this.domController.showError(error.message);
    console.error(`${operation}:`, error);
  }
}

// 启动应用
const app = new AppController();

// 导出应用实例（用于调试）
window.app = app;