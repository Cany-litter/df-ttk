// src/ui/DOMController.js

import { WeaponManager } from '../core/WeaponManager.js';
import { TabRenderers } from './TabRenderers.js';
import { BulletManagerRenderer } from './BulletManagerRenderer.js';
import { CacheManager } from '../utils/cacheManager.js';
import { BarrelEditor } from './BarrelEditor.js';
import {
  getBulletPrice,
  getBulletPricingData,
  setBulletPricingData,
  getPriceKey,
  initializePrices,
  getPrices,
  importPrices,
  exportPrices,
  downloadPrices,
  uploadPrices,
  resetPrices,
  getBulletPriceStats,
} from '../core/pricingManager.js';
import {
  bulletData,
  getAllCalibers,
  getAllSpecialBullets,
  getBulletLevelData,
  getSpecialBulletData,
  isSpecialBullet,
} from '../core/bullets.js';

/**
 * DOM控制器
 * 负责DOM操作、数据读取和协调其他组件
 * 
 * 重新设计后的三个Tab:
 * - Tab1: 基础属性（纯数据展示，无操作列，双击编辑）
 * - Tab2: 配件数据（树状展开 武器 → 枪管，枪口为下拉选择）
 * - Tab3: 价格数据（树状展开 武器 → 枪管，枪口为下拉选择）
 * 
 * 价格数据现在由 pricingManager 统一管理，不再存储在 configs 中
 */
export class DOMController {
  constructor(weaponManager) {
    this.weaponManager = weaponManager;
    this.tabRenderers = new TabRenderers();
    this.bulletManagerRenderer = new BulletManagerRenderer();
    this.cacheManager = new CacheManager();
    this.isUpdating = false;
    this.barrelEditor = null;
    this.currentTab = 'basic';
    this.muzzles = [];
    this.defaultBulletLevel = 4; // 默认子弹等级

    // 树状展开状态
    this.expandedState = {
      attachment: {},
      price: {}
    };

    this.muzzleState = {};
    this.precisionState = {};
    this.priceMuzzleState = {};
    this.hitRateModalData = null;

    // 价格是否已初始化
    this.pricesInitialized = false;

    // 加载武器数据
    this.loadWeaponData();

    // 初始化价格数据
    this.initializePrices();

    // 延迟加载保存的配置
    setTimeout(() => {
      this.loadSavedConfig();
    }, 0);

    // 设置参数自动保存
    this.setupAutoSave();

    // 延迟初始化枪管编辑器、子弹管理和Tab
    setTimeout(() => {
      this.muzzles = this.weaponManager.getMuzzles() || [];
      this.setupBarrelEditor();
      this.renderBulletManagement();
      this.initTabs();
    }, 150);
  }

  /**
   * 初始化价格数据
   */
  async initializePrices() {
    try {
      await initializePrices();
      this.pricesInitialized = true;
      console.log('✅ 价格数据已初始化');
    } catch (error) {
      console.error('❌ 价格数据初始化失败:', error);
      this.pricesInitialized = false;
    }
  }

  /**
   * 加载武器数据
   */
  loadWeaponData() {
    const weapons = this.weaponManager.getWeapons();
    if (weapons && weapons.length > 0) {
      console.log(`📂 从 WeaponManager 加载了 ${weapons.length} 把武器`);
      return;
    }
    console.error('❌ WeaponManager 中没有武器数据');
    this.showError('武器数据加载失败，请刷新页面重试');
  }

  /**
   * 加载保存的配置
   */
  loadSavedConfig() {
    try {
      const savedConfig = this.cacheManager.loadConfig();
      this.applyConfigToPage(savedConfig);
      if (savedConfig.bulletLevel) {
        this.defaultBulletLevel = savedConfig.bulletLevel;
      }
    } catch (error) {
      console.error('加载配置时出错:', error);
    }
  }

  /**
   * 将配置应用到页面控件
   */
  applyConfigToPage(config) {
    const elements = {
      bulletLevel: document.getElementById('bulletLevel'),
      armorLevel: document.getElementById('armorLevel'),
      armorValue: document.getElementById('armorValue'),
      helmetLevel: document.getElementById('helmetLevel'),
      helmetValue: document.getElementById('helmetValue'),
      distance: document.getElementById('distance'),
      healthValue: document.getElementById('healthValue'),
      hitRate: document.getElementById('hitRate'),
      triggerDelayEnable: document.getElementById('triggerDelayEnable'),
      globalBarrelType: document.getElementById('globalBarrelType')
    };

    if (elements.bulletLevel) elements.bulletLevel.value = config.bulletLevel || 4;
    if (elements.armorLevel) elements.armorLevel.value = config.armorLevel || 4;
    if (elements.armorValue) elements.armorValue.value = config.armorValue || 80;
    if (elements.helmetLevel) elements.helmetLevel.value = config.helmetLevel || 4;
    if (elements.helmetValue) elements.helmetValue.value = config.helmetValue || 35;
    if (elements.distance) elements.distance.value = config.distance || 30;
    if (elements.healthValue) elements.healthValue.value = config.healthValue || 100;
    if (elements.hitRate) elements.hitRate.value = config.hitRate || 0.85;
    if (elements.triggerDelayEnable) elements.triggerDelayEnable.checked = config.triggerDelayEnable !== false;
    if (elements.globalBarrelType) elements.globalBarrelType.value = config.globalBarrelType || 'longest';

    // 同步默认子弹等级
    if (config.bulletLevel) {
      this.defaultBulletLevel = config.bulletLevel;
    }

    const hitKeys = ['head', 'chest', 'stomach', 'limbs'];
    hitKeys.forEach(key => {
      const el = document.getElementById('p' + key.charAt(0).toUpperCase() + key.slice(1));
      if (el && config.hitProb) {
        el.value = config.hitProb[key] || 0.25;
      }
    });
  }

  /**
   * 设置自动保存功能
   */
  setupAutoSave() {
    const paramElements = [
      'bulletLevel', 'armorLevel', 'armorValue', 'helmetLevel', 'helmetValue',
      'distance', 'healthValue', 'hitRate', 'triggerDelayEnable',
      'globalBarrelType', 'pHead', 'pChest', 'pStomach', 'pLimbs'
    ];

    paramElements.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('change', () => {
          this.saveCurrentConfig();
        });
        if (element.type === 'number') {
          element.addEventListener('input', () => {
            this.saveCurrentConfig();
          });
        }
      }
    });
  }

  /**
   * 保存当前配置
   */
  saveCurrentConfig() {
    const currentConfig = this.readPageParams();
    this.cacheManager.saveConfig(currentConfig);
  }

  /**
   * 读取页面参数
   */
  readPageParams() {
    const toNum = id => Number(document.getElementById(id)?.value || 0);
    const params = {
      bulletLevel: toNum('bulletLevel'),
      armorLevel: toNum('armorLevel'),
      armorValue: toNum('armorValue'),
      helmetLevel: toNum('helmetLevel'),
      helmetValue: toNum('helmetValue'),
      distance: toNum('distance'),
      healthValue: toNum('healthValue'),
      hitProb: {},
      hitRate: toNum('hitRate'),
      triggerDelayEnable: document.getElementById('triggerDelayEnable')?.checked ?? true,
      globalBarrelType: document.getElementById('globalBarrelType')?.value || 'longest'
    };

    // 同步默认子弹等级
    this.defaultBulletLevel = params.bulletLevel;

    const hitKeys = ['head', 'chest', 'stomach', 'limbs'];
    hitKeys.forEach(key => {
      const el = document.getElementById('p' + key.charAt(0).toUpperCase() + key.slice(1));
      params.hitProb[key] = Number(el?.value || 0);
    });

    return params;
  }

  // ==================== Tab切换 ====================

  /**
   * 初始化Tab切换
   */
  initTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        if (tabName) {
          this.switchTab(tabName);
        }
      });
    });
    this.switchTab('basic');
  }

  /**
   * 切换到指定Tab
   */
  switchTab(tabName) {
    this.currentTab = tabName;

    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    const container = document.getElementById('tabContentContainer');
    if (!container) return;

    switch (tabName) {
      case 'basic':
        this.renderBasicTab(container);
        break;
      case 'attachment':
        this.renderAttachmentTab(container);
        break;
      case 'price':
        this.renderPriceTab(container);
        break;
      default:
        container.innerHTML = '<p style="color:#999;text-align:center;padding:20px 0;">未知Tab</p>';
    }
  }

  /**
   * 刷新当前Tab
   */
  refreshCurrentTab() {
    const container = document.getElementById('tabContentContainer');
    if (!container) return;
    this.switchTab(this.currentTab);
  }

  // ==================== Tab1: 基础属性 ====================

  renderBasicTab(container) {
    const weapons = this.weaponManager.getWeapons();
    const html = this.tabRenderers.renderBasicTab(weapons);
    container.innerHTML = html;
    this.bindBasicTabEvents();
  }

  bindBasicTabEvents() {
    this.tabRenderers.bindBasicTabEvents((weaponIndex, property, value) => {
      this.handleWeaponEdit(weaponIndex, property, value);
    });
  }

  // ==================== Tab2: 配件数据 ====================

  renderAttachmentTab(container) {
    const weapons = this.weaponManager.getWeapons();
    const muzzles = this.weaponManager.getMuzzles() || [];
    const params = this.readPageParams();
    const expandState = this.expandedState.attachment || {};

    const html = this.tabRenderers.renderAttachmentTab(
      weapons, muzzles, params,
      (weaponIdx, barrelIdx, muzzleIdx) => {
        this.handleMuzzleChange(weaponIdx, barrelIdx, muzzleIdx);
      },
      (weaponIdx, barrelIdx, value) => {
        this.handlePrecisionChange(weaponIdx, barrelIdx, value);
      },
      (weaponIdx) => {
        this.handleEditBarrel(weaponIdx);
      },
      (weaponIdx, barrelIdx, type) => {
        this.handleAttachmentTreeToggle(weaponIdx, barrelIdx, type);
      },
      expandState,
      this.muzzleState,
      this.precisionState
    );
    container.innerHTML = html;
    this.bindAttachmentTabEvents();
  }

  bindAttachmentTabEvents() {
    this.tabRenderers.bindAttachmentTabEvents(
      (weaponIdx, barrelIdx, muzzleIdx) => {
        this.handleMuzzleChange(weaponIdx, barrelIdx, muzzleIdx);
      },
      (weaponIdx, barrelIdx, value) => {
        this.handlePrecisionChange(weaponIdx, barrelIdx, value);
      },
      (weaponIdx) => {
        this.handleEditBarrel(weaponIdx);
      },
      (weaponIdx, barrelIdx, type) => {
        this.handleAttachmentTreeToggle(weaponIdx, barrelIdx, type);
      }
    );
  }

  handleAttachmentTreeToggle(weaponIdx, barrelIdx, type) {
    const key = `weapon_${weaponIdx}`;
    const current = this.expandedState.attachment[key] === true;
    this.expandedState.attachment[key] = !current;
    this.refreshCurrentTab();
  }

  handleMuzzleChange(weaponIdx, barrelIdx, muzzleIdx) {
    const key = `${weaponIdx}_${barrelIdx}`;
    this.muzzleState[key] = muzzleIdx;
    this.refreshCurrentTab();
    console.log(`🔧 更新枪口 [${weaponIdx}][${barrelIdx}] = ${muzzleIdx}`);
  }

  handlePrecisionChange(weaponIdx, barrelIdx, value) {
    const key = `${weaponIdx}_${barrelIdx}`;
    this.precisionState[key] = value;
    this.refreshCurrentTab();
    console.log(`🔧 更新精校 [${weaponIdx}][${barrelIdx}] = ${value}`);
  }

  handleEditBarrel(weaponIdx) {
    if (this.barrelEditor) {
      this.barrelEditor.openEditor(weaponIdx);
    }
  }

  // ==================== Tab3: 价格数据 ====================

  renderPriceTab(container) {
    const weapons = this.weaponManager.getWeapons();
    const muzzles = this.weaponManager.getMuzzles() || [];
    const params = this.readPageParams();
    const defaultHitRate = params.hitRate || 0.80;
    const expandState = this.expandedState.price || {};

    const html = this.tabRenderers.renderPriceTab(
      weapons, muzzles, params, defaultHitRate,
      (weaponIdx, configIdx, property, value) => {
        this.handleConfigEdit(weaponIdx, configIdx, property, value);
      },
      (weaponIdx, sourceConfigIdx) => {
        this.handleAddConfig(weaponIdx, sourceConfigIdx);
      },
      (weaponIdx, configIdx) => {
        this.handleRemoveConfig(weaponIdx, configIdx);
      },
      (weaponIdx, configIdx) => {
        this.handleCopyCode(weaponIdx, configIdx);
      },
      (weaponIdx, configIdx) => {
        this.handleEditHitRate(weaponIdx, configIdx);
      },
      (weaponIdx, barrelIdx, muzzleIdx, type) => {
        this.handlePriceTreeToggle(weaponIdx, barrelIdx, muzzleIdx, type);
      },
      (weaponIdx, configIdx, value, level) => {
        this.handleBulletChange(weaponIdx, configIdx, value, level);
      },
      (weaponIdx, barrelIdx, muzzleIdx) => {
        this.handlePriceMuzzleChange(weaponIdx, barrelIdx, muzzleIdx);
      },
      expandState,
      this.priceMuzzleState,
      // 传入 pricingManager 的武器价格获取方法
      (weaponName, configId) => {
        return this.weaponManager.getConfigPrice(
          this.weaponManager.getWeapons().findIndex(w => w.name === weaponName),
          this.weaponManager.getWeapons().find(w => w.name === weaponName)?.configs?.findIndex(c => c.id === configId) || 0
        );
      }
    );
    container.innerHTML = html;
    this.bindPriceTabEvents();
    this.bindGlobalAddConfigButton();
  }

  bindPriceTabEvents() {
    this.tabRenderers.bindPriceTabEvents(
      (weaponIdx, configIdx, property, value) => {
        this.handleConfigEdit(weaponIdx, configIdx, property, value);
      },
      (weaponIdx, sourceConfigIdx) => {
        this.handleAddConfig(weaponIdx, sourceConfigIdx);
      },
      (weaponIdx, configIdx) => {
        this.handleRemoveConfig(weaponIdx, configIdx);
      },
      (weaponIdx, configIdx) => {
        this.handleCopyCode(weaponIdx, configIdx);
      },
      (weaponIdx, configIdx) => {
        this.handleEditHitRate(weaponIdx, configIdx);
      },
      (weaponIdx, barrelIdx, muzzleIdx, type) => {
        this.handlePriceTreeToggle(weaponIdx, barrelIdx, muzzleIdx, type);
      },
      (weaponIdx, configIdx, value, level) => {
        this.handleBulletChange(weaponIdx, configIdx, value, level);
      },
      (weaponIdx, barrelIdx, muzzleIdx) => {
        this.handlePriceMuzzleChange(weaponIdx, barrelIdx, muzzleIdx);
      }
    );
  }

  bindGlobalAddConfigButton() {
    const globalBtn = document.getElementById('addConfigGlobalBtn');
    if (globalBtn) {
      const newBtn = globalBtn.cloneNode(true);
      globalBtn.parentNode.replaceChild(newBtn, globalBtn);
      newBtn.addEventListener('click', () => {
        const weapons = this.weaponManager.getWeapons();
        for (let i = 0; i < weapons.length; i++) {
          if (weapons[i].configs && weapons[i].configs.length > 0) {
            const lastIdx = weapons[i].configs.length - 1;
            this.handleAddConfig(i, lastIdx);
            return;
          }
        }
        this.showError('没有可用的武器');
      });
    }
  }

  handlePriceTreeToggle(weaponIdx, barrelIdx, muzzleIdx, type) {
    let key;
    switch (type) {
      case 'price-weapon':
        key = `price_weapon_${weaponIdx}`;
        break;
      case 'price-barrel':
        key = `price_barrel_${weaponIdx}_${barrelIdx}`;
        break;
      case 'price-muzzle':
        key = `price_muzzle_${weaponIdx}_${barrelIdx}_${muzzleIdx}`;
        break;
      default:
        return;
    }
    const current = this.expandedState.price[key] === true;
    this.expandedState.price[key] = !current;
    this.refreshCurrentTab();
  }

  handlePriceMuzzleChange(weaponIdx, barrelIdx, muzzleIdx) {
    const key = `${weaponIdx}_${barrelIdx}`;
    this.priceMuzzleState[key] = muzzleIdx;
    this.refreshCurrentTab();
    console.log(`💰 更新价格Tab枪口 [${weaponIdx}][${barrelIdx}] = ${muzzleIdx}`);
  }

  handleConfigEdit(weaponIdx, configIdx, property, value) {
    // 如果属性是 price，使用 pricingManager
    if (property === 'price') {
      const success = this.weaponManager.setConfigPrice(weaponIdx, configIdx, value);
      if (success) {
        this.refreshCurrentTab();
        console.log(`💰 更新武器价格 [${weaponIdx}][${configIdx}] = ${value}`);
      } else {
        console.warn(`⚠️ 更新价格失败: [${weaponIdx}][${configIdx}] ${property} = ${value}`);
      }
      return;
    }

    const success = this.weaponManager.updateConfigProperty(weaponIdx, configIdx, property, value);
    if (success) {
      this.refreshCurrentTab();
      console.log(`✏️ 更新配置 [${weaponIdx}][${configIdx}] ${property} = ${value}`);
    } else {
      console.warn(`⚠️ 更新配置属性失败: [${weaponIdx}][${configIdx}] ${property} = ${value}`);
    }
  }

  handleAddConfig(weaponIdx, sourceConfigIdx) {
    const sourceConfig = this.weaponManager.getConfig(weaponIdx, sourceConfigIdx);
    if (!sourceConfig) {
      this.showError('源配置不存在');
      return;
    }

    const newConfig = this.weaponManager.addConfig(weaponIdx, sourceConfig, sourceConfigIdx);
    if (newConfig) {
      console.log(`✅ 新增改枪配置: ${newConfig.code}`);
      this.refreshCurrentTab();
      setTimeout(() => {
        const rows = document.querySelectorAll('#priceTabContent .price-config-row');
        const lastRow = rows[rows.length - 1];
        if (lastRow) {
          lastRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          lastRow.style.backgroundColor = '#e8f5e9';
          setTimeout(() => {
            lastRow.style.backgroundColor = '';
          }, 2000);
        }
      }, 100);
    } else {
      this.showError('新增改枪配置失败');
    }
  }

  handleRemoveConfig(weaponIdx, configIdx) {
    if (!confirm('确定要删除这个改枪配置吗？')) {
      return;
    }
    const success = this.weaponManager.removeConfig(weaponIdx, configIdx);
    if (success) {
      console.log(`✅ 删除改枪配置 [${weaponIdx}][${configIdx}]`);
      this.refreshCurrentTab();
    } else {
      this.showError('至少保留一个改枪配置');
    }
  }

  handleCopyCode(weaponIdx, configIdx) {
    const config = this.weaponManager.getConfig(weaponIdx, configIdx);
    if (!config || !config.code) {
      this.showError('改枪码为空');
      return;
    }
    navigator.clipboard.writeText(config.code).then(() => {
      const btn = document.querySelector(`.copy-code-btn[data-weapon="${weaponIdx}"][data-config="${configIdx}"]`);
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = '✅';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 1500);
      }
      console.log(`📋 复制改枪码: ${config.code}`);
    }).catch(() => {
      const input = document.createElement('input');
      input.value = config.code;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      const btn = document.querySelector(`.copy-code-btn[data-weapon="${weaponIdx}"][data-config="${configIdx}"]`);
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = '✅';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 1500);
      }
      console.log(`📋 复制改枪码: ${config.code}`);
    });
  }

  handleEditHitRate(weaponIdx, configIdx) {
    this.openHitRateModal(weaponIdx, configIdx);
  }

  handleBulletChange(weaponIdx, configIdx, bulletType, bulletLevel) {
    // 更新子弹类型和等级
    if (bulletType !== undefined) {
      this.weaponManager.updateConfigProperty(weaponIdx, configIdx, 'bulletType', bulletType);
    }
    if (bulletLevel !== undefined && bulletLevel !== null) {
      this.weaponManager.updateConfigProperty(weaponIdx, configIdx, 'bulletLevel', bulletLevel);
    }
    // 刷新当前Tab以更新价格显示
    this.refreshCurrentTab();
    console.log(`🔫 切换子弹 [${weaponIdx}][${configIdx}] -> ${bulletType} Lv.${bulletLevel}`);
  }

  // ==================== 子弹管理 ====================

  /**
   * 渲染子弹管理模块
   */
  renderBulletManagement() {
    const params = this.readPageParams();
    this.defaultBulletLevel = params.bulletLevel || 4;

    // 存储回调供刷新使用
    window._bulletCallbacks = {
      onEdit: (key, field, value) => {
        this.handleBulletEdit(key, field, value);
      },
      onDelete: (key, info) => {
        this.handleBulletDelete(key, info);
      },
      onAdd: (caliber, level, data, price) => {
        this.handleBulletAdd(caliber, level, data, price);
      }
    };

    this.bulletManagerRenderer.renderBulletManagement(
      window._bulletCallbacks.onEdit,
      window._bulletCallbacks.onDelete,
      window._bulletCallbacks.onAdd,
      this.defaultBulletLevel,
      false  // 首次渲染不保留状态（默认折叠）
    );
  }

  /**
   * 刷新子弹管理（保留折叠状态）
   */
  refreshBulletManagement() {
    const params = this.readPageParams();
    this.defaultBulletLevel = params.bulletLevel || 4;
    // 调用渲染器的刷新方法，会自动保留折叠状态
    this.bulletManagerRenderer.refreshBulletTable(this.defaultBulletLevel);
  }

  /**
   * 处理子弹编辑
   */
  handleBulletEdit(key, field, value) {
    if (field === 'price') {
      // 使用 pricingManager 的 setBulletPrice
      const { setBulletPrice } = require('../core/pricingManager.js');
      const success = setBulletPrice(key, value);
      if (success) {
        // 使用保留状态的刷新方法
        this.bulletManagerRenderer.refreshBulletTable(this.defaultBulletLevel);
        console.log(`✅ 更新子弹 ${key} 价格 = ${value}`);
      } else {
        this.showError(`更新子弹 ${key} 失败`);
      }
    }
  }

  /**
   * 处理子弹删除
   */
  handleBulletDelete(key, info) {
    const weapons = this.weaponManager.getWeapons();
    let isReferenced = false;
    let referencedBy = [];

    // 检查是否被武器配置引用
    for (const weapon of weapons) {
      if (Array.isArray(weapon.configs)) {
        for (const config of weapon.configs) {
          let configKey = config.bulletType;
          // 如果是常规口径，需要加上等级
          if (config.bulletType && !isSpecialBullet(config.bulletType) && config.bulletLevel !== undefined) {
            configKey = `${config.bulletType}_${config.bulletLevel}`;
          }
          if (configKey === key) {
            isReferenced = true;
            referencedBy.push(weapon.name);
            break;
          }
        }
      }
    }

    if (isReferenced) {
      const weaponNames = [...new Set(referencedBy)].join('、');
      this.showError(`子弹 "${key}" 正在被 "${weaponNames}" 使用，无法删除`);
      return;
    }

    if (!confirm(`确定要删除子弹 "${key}" 吗？\n该操作不可撤销。`)) {
      return;
    }

    // 从 pricingManager 中删除
    const { bulletPrices } = require('../core/pricingManager.js');
    // 注意：bulletPrices 是模块内部变量，需要通过方法访问
    // 使用 pricingManager 的导入功能来更新
    const currentData = getPrices();
    if (currentData.bulletPrices[key] !== undefined) {
      delete currentData.bulletPrices[key];
      importPrices(currentData);
      this.bulletManagerRenderer.refreshBulletTable(this.defaultBulletLevel);
      console.log(`✅ 删除子弹: ${key}`);
    } else {
      this.showError(`删除子弹 ${key} 失败`);
    }
  }

  /**
   * 处理子弹新增
   */
  handleBulletAdd(caliber, level, data, price) {
    if (!caliber) {
      this.showError('请输入口径名称');
      return;
    }

    // 检查是否为新增口径（常规口径）
    if (level !== null && level !== undefined) {
      // 新增常规口径的等级
      const { bulletData: bd } = require('../core/bullets.js');
      const { setBulletPrice } = require('../core/pricingManager.js');

      // 检查口径是否存在
      if (!bd[caliber]) {
        // 创建新口径
        bd[caliber] = {
          name: caliber,
          levels: {}
        };
      }

      // 检查等级是否已存在
      if (bd[caliber].levels[level]) {
        this.showError(`口径 "${caliber}" 的 Lv.${level} 已存在`);
        return;
      }

      // 添加等级数据
      bd[caliber].levels[level] = {
        base: data.base || 1.0,
        armorDamage: data.armorDamage || 1.0,
        penLevels: data.penLevels || [1.0, 1.0, 1.0, 1.0, 1.0, 1.0]
      };

      // 添加价格
      const priceKey = `${caliber}_${level}`;
      setBulletPrice(priceKey, price || 0);

      this.bulletManagerRenderer.refreshBulletTable(this.defaultBulletLevel);
      console.log(`✅ 新增子弹: ${caliber} Lv.${level}`);
    } else {
      // 新增特殊子弹
      const { bulletData: bd } = require('../core/bullets.js');
      const { setBulletPrice } = require('../core/pricingManager.js');

      // 检查是否已存在
      if (bd[caliber]) {
        this.showError(`特殊子弹 "${caliber}" 已存在`);
        return;
      }

      // 创建特殊子弹数据
      bd[caliber] = {
        name: data.name || caliber,
        type: data.type || 'highPen',
        level: data.level || 4,
        base: data.base || 1.0,
        armorDamage: data.armorDamage || 1.0,
        penLevels: data.penLevels || [1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
        specialNote: data.specialNote || ''
      };

      // 添加价格
      setBulletPrice(caliber, price || 0);

      this.bulletManagerRenderer.refreshBulletTable(this.defaultBulletLevel);
      console.log(`✅ 新增特殊子弹: ${caliber}`);
    }
  }

  /**
   * 获取子弹价格数据（用于导出）
   */
  getBulletPricingData() {
    return this.bulletManagerRenderer.getBulletPricingData();
  }

  /**
   * 设置子弹价格数据（用于导入）
   */
  setBulletPricingData(data) {
    this.bulletManagerRenderer.setBulletPricingData(data);
  }

  // ==================== 价格导入导出 ====================

  /**
   * 导出所有价格数据
   */
  exportPrices() {
    try {
      const jsonStr = exportPrices();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ttk_prices_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      console.log('✅ 价格数据已导出');
    } catch (error) {
      console.error('导出价格失败:', error);
      this.showError('导出价格失败: ' + error.message);
    }
  }

  /**
   * 导入所有价格数据
   */
  importPrices() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const success = importPrices(text);
        if (success) {
          this.refreshCurrentTab();
          this.refreshBulletManagement();
          console.log('✅ 价格数据已导入');
          alert('✅ 价格数据导入成功！');
        } else {
          this.showError('价格数据导入失败：数据格式无效');
        }
      } catch (error) {
        console.error('导入价格失败:', error);
        this.showError('导入价格失败: ' + error.message);
      }
    };
    input.click();
  }

  /**
   * 重置价格为默认值
   */
  async resetPrices() {
    if (!confirm('⚠️ 确定要重置所有价格为默认值吗？\n（当前修改将丢失！）')) {
      return;
    }
    try {
      const success = await resetPrices();
      if (success) {
        this.refreshCurrentTab();
        this.refreshBulletManagement();
        console.log('✅ 价格已重置为默认值');
        alert('✅ 价格已重置为默认值！');
      } else {
        this.showError('重置价格失败');
      }
    } catch (error) {
      console.error('重置价格失败:', error);
      this.showError('重置价格失败: ' + error.message);
    }
  }

  // ==================== 命中率配置弹窗 ====================

  openHitRateModal(weaponIdx, configIdx) {
    const weapon = this.weaponManager.getWeapon(weaponIdx);
    const config = this.weaponManager.getConfig(weaponIdx, configIdx);
    if (!weapon || !config) {
      this.showError('数据不存在');
      return;
    }

    const params = this.readPageParams();
    const defaultHitRate = params.hitRate || 0.80;

    this.hitRateModalData = {
      weaponIndex: weaponIdx,
      configIndex: configIdx,
      weaponName: weapon.name,
      configId: config.id || config.code,
      points: config.hitRatePoints ? JSON.parse(JSON.stringify(config.hitRatePoints)) : [],
      defaultHitRate
    };

    const modal = document.getElementById('hitRateModal');
    if (!modal) {
      this.showError('命中率弹窗不存在');
      return;
    }

    const container = document.getElementById('hitRateModalContainer');
    if (!container) {
      this.showError('弹窗容器不存在');
      return;
    }

    const html = this.bulletManagerRenderer.renderHitRateModal(
      weapon.name,
      config.id || config.code,
      config.hitRatePoints || [],
      defaultHitRate
    );
    container.innerHTML = html;

    modal.style.display = 'flex';

    this.bindHitRateModalEvents(modal);

    setTimeout(() => {
      const canvas = document.getElementById('hitratePreviewCanvas');
      if (canvas) {
        const points = config.hitRatePoints || [];
        this.bulletManagerRenderer.drawHitRatePreview(canvas, points, defaultHitRate);
      }
    }, 50);
  }

  bindHitRateModalEvents(modal) {
    const closeBtn = document.getElementById('hitrateModalClose');
    if (closeBtn) {
      closeBtn.onclick = () => {
        modal.style.display = 'none';
      };
    }

    const cancelBtn = document.getElementById('hitrateCancelBtn');
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        modal.style.display = 'none';
      };
    }

    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    };

    const escHandler = (e) => {
      if (e.key === 'Escape' && modal.style.display === 'flex') {
        modal.style.display = 'none';
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    const addBtn = document.getElementById('hitrateAddPointBtn');
    if (addBtn) {
      addBtn.onclick = () => {
        const tbody = document.getElementById('hitratePointsBody');
        if (!tbody) return;

        const currentRows = tbody.querySelectorAll('tr:not(.hitrate-empty-row)');
        if (currentRows.length >= 3) {
          this.showError('最多配置3个点');
          return;
        }

        let defaultDistance = 50;
        const existingPoints = this.hitRateModalData?.points || [];
        if (existingPoints.length > 0) {
          const maxDist = Math.max(...existingPoints.map(p => p.distance));
          defaultDistance = Math.min(maxDist + 25, 150);
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="number" class="hitrate-distance-input" value="${defaultDistance}" min="0" step="5" style="width:70px;border:1px solid #ddd;border-radius:3px;padding:2px 4px;text-align:center;" /></td>
          <td><input type="number" class="hitrate-rate-input" value="80" min="0" max="100" step="1" style="width:70px;border:1px solid #ddd;border-radius:3px;padding:2px 4px;text-align:center;" /></td>
          <td><button class="hitrate-remove-point-btn" style="background:#f44336;color:#fff;border:none;border-radius:3px;padding:2px 8px;cursor:pointer;">删除</button></td>
        `;

        const emptyRow = tbody.querySelector('.hitrate-empty-row');
        if (emptyRow) {
          emptyRow.remove();
        }

        tbody.appendChild(tr);

        const removeBtn = tr.querySelector('.hitrate-remove-point-btn');
        removeBtn.onclick = () => {
          tr.remove();
          if (tbody.querySelectorAll('tr').length === 0) {
            tbody.innerHTML = `
              <tr class="hitrate-empty-row">
                <td colspan="3" style="text-align:center;color:#999;padding:20px 0;">
                  暂无配置，将使用统一命中率 ${Math.round((this.hitRateModalData?.defaultHitRate || 0.80) * 100)}%
                </td>
              </tr>
            `;
          }
          this.updateHitRatePreview();
          this.updateAddButtonState();
        };

        tr.querySelectorAll('input').forEach(input => {
          input.addEventListener('input', () => {
            this.updateHitRatePreview();
          });
        });

        this.updateHitRatePreview();
        this.updateAddButtonState();
      };
    }

    const clearBtn = document.getElementById('hitrateClearBtn');
    if (clearBtn) {
      clearBtn.onclick = () => {
        if (confirm('确定清空所有命中率配置，使用统一命中率吗？')) {
          const tbody = document.getElementById('hitratePointsBody');
          if (tbody) {
            tbody.innerHTML = `
              <tr class="hitrate-empty-row">
                <td colspan="3" style="text-align:center;color:#999;padding:20px 0;">
                  暂无配置，将使用统一命中率 ${Math.round((this.hitRateModalData?.defaultHitRate || 0.80) * 100)}%
                </td>
              </tr>
            `;
          }
          this.updateHitRatePreview();
          this.updateAddButtonState();
        }
      };
    }

    const saveBtn = document.getElementById('hitrateSaveBtn');
    if (saveBtn) {
      saveBtn.onclick = () => {
        const container = document.getElementById('hitRateModalContainer');
        if (!container) return;

        const points = this.bulletManagerRenderer.parseHitRatePointsFromModal(container);

        if (points.length > 3) {
          this.showError('最多配置3个命中率点');
          return;
        }

        const { weaponIndex, configIndex } = this.hitRateModalData;
        this.weaponManager.updateConfigProperty(weaponIndex, configIndex, 'hitRatePoints', points);

        modal.style.display = 'none';
        this.refreshCurrentTab();
        console.log(`✅ 更新命中率曲线: ${points.length} 个点`);
      };
    }
  }

  updateHitRatePreview() {
    const container = document.getElementById('hitRateModalContainer');
    if (!container) return;

    const points = this.bulletManagerRenderer.parseHitRatePointsFromModal(container);
    const defaultHitRate = this.hitRateModalData?.defaultHitRate || 0.80;

    const canvas = document.getElementById('hitratePreviewCanvas');
    if (canvas) {
      this.bulletManagerRenderer.drawHitRatePreview(canvas, points, defaultHitRate);
    }
  }

  updateAddButtonState() {
    const tbody = document.getElementById('hitratePointsBody');
    const addBtn = document.getElementById('hitrateAddPointBtn');
    if (!tbody || !addBtn) return;

    const rows = tbody.querySelectorAll('tr:not(.hitrate-empty-row)');
    if (rows.length >= 3) {
      addBtn.disabled = true;
      addBtn.textContent = '+ 添加点 (3/3)';
    } else {
      addBtn.disabled = false;
      addBtn.textContent = `+ 添加点 (${rows.length}/3)`;
    }
  }

  // ==================== 武器属性编辑 ====================

  handleWeaponEdit(index, property, value) {
    const success = this.weaponManager.updateWeaponProperty(index, property, value);

    if (success) {
      this.refreshCurrentTab();
      console.log(`✏️ 更新武器 [${index}] ${property} = ${value}`);
    } else {
      console.warn(`⚠️ 更新武器属性失败: [${index}] ${property} = ${value}`);
    }
  }

  // ==================== 武器数据读取（兼容 main.js） ====================

  /**
   * 读取每把枪的子弹类型选择
   * 从第一个 config 读取
   * @returns {Array<{bulletType: string, bulletLevel: number}>}
   */
  readWeaponBullets(weaponIndex = null) {
    const weapons = this.weaponManager.getWeapons();
    if (weaponIndex !== null) {
      const weapon = weapons[weaponIndex];
      if (weapon && weapon.configs && weapon.configs.length > 0) {
        const config = weapon.configs[0];
        return {
          bulletType: config.bulletType || null,
          bulletLevel: config.bulletLevel || 4
        };
      }
      return { bulletType: null, bulletLevel: 4 };
    }
    return weapons.map(w => {
      if (w.configs && w.configs.length > 0) {
        const config = w.configs[0];
        return {
          bulletType: config.bulletType || null,
          bulletLevel: config.bulletLevel || 4
        };
      }
      return { bulletType: null, bulletLevel: 4 };
    });
  }

  /**
   * 收集附件选择数据
   * 从 configs 读取
   */
  collectAttachmentData() {
    const weapons = this.weaponManager.getWeapons();
    const muzzles = this.weaponManager.getMuzzles() || [];

    const barrelValues = weapons.map((w, idx) => {
      const config = w.configs && w.configs.length > 0 ? w.configs[0] : null;
      const idx_val = config ? config.selectedBarrel || 0 : 0;
      if (idx_val > 0 && w.barrels && w.barrels[idx_val - 1]) {
        return `${w.barrels[idx_val - 1].name}|${idx_val}`;
      }
      return '无|-1';
    });

    const muzzleValues = weapons.map((w, idx) => {
      const config = w.configs && w.configs.length > 0 ? w.configs[0] : null;
      const idx_val = config ? config.selectedMuzzle || 0 : 0;
      if (idx_val > 0 && muzzles[idx_val]) {
        return `${muzzles[idx_val].name}|${idx_val}`;
      }
      return '无|-1';
    });

    const hitRateValues = weapons.map((w, idx) => {
      const config = w.configs && w.configs.length > 0 ? w.configs[0] : null;
      if (config) {
        const rate = config.hitRate;
        if (rate !== undefined && rate !== null && rate !== '') {
          return rate;
        }
      }
      return '';
    });

    return { barrelValues, muzzleValues, hitRateValues };
  }

  // ==================== 新增枪械 ====================

  renderAttachmentTable() {
    const weapons = this.weaponManager.getWeapons();
    const muzzles = this.weaponManager.getMuzzles();

    const container = document.getElementById('attachmentTableWrapper');
    if (!container) return;

    let html = `
      <table id="attachmentTable">
        <thead>
          <tr>
            <th>武器</th>
            <th>类型</th>
            <th>射速</th>
            <th>初速</th>
            <th>射程</th>
            <th>基础伤害</th>
            <th>护甲伤害</th>
            <th>伤害衰减</th>
            <th>部位倍率</th>
            <th>部位伤害</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
    `;

    weapons.forEach((w, idx) => {
      html += this.renderAttachmentTableRow(w, idx);
    });

    html += this.tabRenderers.renderAddWeaponRow();
    html += `
        </tbody>
      </table>
    `;
    container.innerHTML = html;
    this.setupAddWeaponListeners();
  }

  renderAttachmentTableRow(weapon, idx) {
    const configCount = (weapon.configs && Array.isArray(weapon.configs)) ? weapon.configs.length : 1;
    const partDamage = this.tabRenderers.formatPartDamage(weapon.flesh, weapon.mult);

    return `
      <tr data-weapon-index="${idx}">
        <td class="weapon-name-cell">
          <span class="weapon-name-display" data-weapon="${idx}">${this.tabRenderers.escapeHtml(weapon.name)}</span>
          <span class="config-count-badge">[${configCount}]</span>
        </td>
        <td><span class="weapon-type-display" data-weapon="${idx}">${this.tabRenderers.escapeHtml(weapon.type || '')}</span></td>
        <td><span class="weapon-rof-display" data-weapon="${idx}">${Math.round(weapon.rof)}</span></td>
        <td><span class="weapon-velocity-display" data-weapon="${idx}">${Math.round(weapon.velocity)}</span></td>
        <td><span class="weapon-ranges-display" data-weapon="${idx}">${this.tabRenderers.formatRangesForDisplay(weapon.ranges)}</span></td>
        <td><span class="weapon-flesh-display" data-weapon="${idx}">${Math.round(weapon.flesh)}</span></td>
        <td><span class="weapon-armor-display" data-weapon="${idx}">${Math.round(weapon.armor)}</span></td>
        <td><span class="weapon-decays-display" data-weapon="${idx}">${this.tabRenderers.formatDecaysForDisplay(weapon.decays)}</span></td>
        <td><span class="weapon-mult-display" data-weapon="${idx}">${this.tabRenderers.formatMultipliersForDisplay(weapon.mult)}</span></td>
        <td class="part-damage-cell">${partDamage}</td>
        <td>
          <button class="edit-weapon-btn" data-weapon="${idx}" title="编辑枪管">🔧</button>
        </td>
      </tr>
    `;
  }

  setupAddWeaponListeners() {
    const confirmBtn = document.getElementById('confirmAddWeapon');
    if (confirmBtn) {
      const newConfirmBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
      newConfirmBtn.addEventListener('click', () => {
        this.handleAddWeapon();
      });
    }

    const cancelBtn = document.getElementById('cancelAddWeapon');
    if (cancelBtn) {
      const newCancelBtn = cancelBtn.cloneNode(true);
      cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
      newCancelBtn.addEventListener('click', () => {
        this.bulletManagerRenderer.clearNewWeaponInputs();
      });
    }
  }

  handleAddWeapon() {
    try {
      const weaponData = this.bulletManagerRenderer.readNewWeaponData();
      if (!weaponData) return;

      const weapons = this.weaponManager.getWeapons();
      weapons.push(weaponData);

      this.refreshCurrentTab();
      this.renderAttachmentTable();

      console.log(`✅ 已添加新武器: ${weaponData.name}`);

      setTimeout(() => {
        const addRow = document.getElementById('addWeaponRow');
        if (addRow) {
          addRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);

    } catch (error) {
      console.error('添加武器失败:', error);
      this.showError('添加武器失败: ' + error.message);
    }
  }

  // ==================== 枪管编辑器 ====================

  setupBarrelEditor() {
    if (this.barrelEditor) return;

    this.barrelEditor = new BarrelEditor(
      this.weaponManager,
      this.tabRenderers,
      () => {
        this.refreshCurrentTab();
        this.renderAttachmentTable();
        this.muzzles = this.weaponManager.getMuzzles() || [];
      }
    );
    console.log('🔧 枪管编辑器已初始化');
  }

  // ==================== 全局枪管设置 ====================

  getGlobalBarrelType() {
    return document.getElementById('globalBarrelType')?.value || 'none';
  }

  updateGlobalBarrelSelections() {
    const globalBarrelType = this.getGlobalBarrelType();
    const weapons = this.weaponManager.getWeapons();

    if (globalBarrelType === 'none') {
      weapons.forEach((w, idx) => {
        if (w.configs) {
          w.configs.forEach((config, cIdx) => {
            this.weaponManager.updateConfigProperty(idx, cIdx, 'selectedBarrel', 0);
          });
        }
      });
    } else if (globalBarrelType === 'longest') {
      weapons.forEach((w, idx) => {
        if (w.barrels && w.barrels.length > 0) {
          const longestIndex = this.tabRenderers.getLongestBarrelIndex(w);
          if (w.configs) {
            w.configs.forEach((config, cIdx) => {
              this.weaponManager.updateConfigProperty(idx, cIdx, 'selectedBarrel', longestIndex);
            });
          }
        } else {
          if (w.configs) {
            w.configs.forEach((config, cIdx) => {
              this.weaponManager.updateConfigProperty(idx, cIdx, 'selectedBarrel', 0);
            });
          }
        }
      });
    }

    // 直接刷新当前Tab（比分别调用 refreshAttachmentTab/refreshPriceTab 更简洁）
    this.refreshCurrentTab();
    console.log('🌍 已应用全局枪管设置:', globalBarrelType);
  }

  // ==================== 通用方法 ====================

  showError(message) {
    alert('❌ ' + message);
  }

  getChartContext(chartId) {
    const canvas = document.getElementById(chartId);
    if (!canvas) return null;
    return canvas.getContext('2d');
  }

  resetWeaponsToDefault(defaultData) {
    if (!defaultData || defaultData.length === 0) {
      console.warn('默认武器数据为空，无法重置');
      return;
    }
    this.weaponManager.loadWeapons(defaultData);
    this.muzzles = this.weaponManager.getMuzzles() || [];
    this.expandedState.attachment = {};
    this.muzzleState = {};
    this.precisionState = {};
    this.expandedState.price = {};
    this.priceMuzzleState = {};
    this.refreshCurrentTab();
    this.renderAttachmentTable();
    console.log('✅ 已重置为默认武器数据');
  }

  getWeaponsData() {
    return this.weaponManager.getWeapons();
  }

  getWeaponManager() {
    return this.weaponManager;
  }
}