/**
 * DOM 控制器
 * 
 * 负责协调三个表格组件、DataManager 和 UI 交互
 * 
 * 职责：
 * 1. 初始化三个表格（价格、武器、子弹）
 * 2. Tab 切换管理
 * 3. 读取页面参数（含经济参数）
 * 4. 数据变更时同步到 DataManager 并刷新表格
 * 5. 数据变更时标记武器为已修改（触发缓存失效）
 * 6. 导入/导出功能
 * 7. 操作按钮（添加副本、编辑枪管、新增/删除行）
 * 8. 获取价格表格中启用的配置（供柱状图使用）⭐ 包含 hitRateMap
 * 9. 更新哈弗币消耗数据
 * 10. 新增价格配置
 */
import { getDataManager } from '../core/DataManager.js';
import WeaponTable from './WeaponTable.js';
import PriceTable from './PriceTable.js';
import BulletTable from './BulletTable.js';

// 默认命中率映射（30米100%命中率）
const DEFAULT_HIT_RATE_MAP = '30:1.0,50:0.9,100:0.6';

export default class DOMController {
  constructor() {
    this.dataManager = getDataManager();
    this.currentTab = 'price';
    this.weaponTableInstance = null;
    this.priceTableInstance = null;
    this.bulletTableInstance = null;
    this.muzzleOptions = this.dataManager.getMuzzleNames();
    
    this.weaponAttachments = {};
    this.weaponPrecisions = {};
    this.isRefreshing = false;
    this._refreshTimer = null;
    
    this._onBarrelEdit = null;
    
    this.havocCosts = {};
    this._pendingHavocUpdate = false;

    this._handleAddConfig = this._handleAddConfig.bind(this);
  }

  // ============================================================
  // 1. 初始化
  // ============================================================

  initialize(options = {}) {
    const { onBarrelEdit = null } = options;

    this._onBarrelEdit = onBarrelEdit;

    this.setupTabs();
    this.initPriceTable();
    this.initWeaponTable(onBarrelEdit);
    this.initBulletTable();
    this.bindControlEvents();
    this.bindImportExportEvents();

    document.addEventListener('price-add-config', this._handleAddConfig);

    console.log('✅ DOMController 初始化完成');
  }

  // ============================================================
  // 2. 读取页面参数
  // ============================================================

  parseHitRateMap(str) {
    if (!str || str.trim() === '') return [];
    
    try {
      const parts = str.split(',').map(p => p.trim());
      const result = [];
      for (const part of parts) {
        const [dist, rate] = part.split(':');
        if (dist && rate) {
          const distance = parseFloat(dist);
          const hitRate = parseFloat(rate);
          if (!isNaN(distance) && !isNaN(hitRate) && distance >= 0 && hitRate >= 0 && hitRate <= 1) {
            result.push({ distance, rate: hitRate });
          }
        }
      }
      return result;
    } catch (e) {
      console.warn('解析命中率映射失败:', e);
      return [];
    }
  }

  readPageParams() {
    const toNum = (id) => {
      const el = document.getElementById(id);
      return el ? Number(el.value) || 0 : 0;
    };
    
    const toFloat = (id) => {
      const el = document.getElementById(id);
      return el ? Number(el.value) || 0 : 0;
    };
    
    const hitRateInput = document.getElementById('hitRate');
    const hitRateRaw = hitRateInput ? hitRateInput.value : DEFAULT_HIT_RATE_MAP;
    const hitRateMap = this.parseHitRateMap(hitRateRaw);
    
    const distance = toNum('distance') || 30;
    const hitRate = this.getHitRateFromMap(hitRateMap, distance, 0.85);
    
    const extractRatePercent = toFloat('extractRate') || 50;
    const extractRate = Math.max(0, Math.min(1, extractRatePercent / 100));
    
    return {
      bulletLevel: toNum('bulletLevel') || 4,
      armorLevel: toNum('armorLevel') || 4,
      armorValue: toNum('armorValue') || 110,
      helmetLevel: toNum('helmetLevel') || 4,
      helmetValue: toNum('helmetValue') || 48,
      distance: distance,
      healthValue: toNum('healthValue') || 100,
      hitRateMap: hitRateMap,
      hitRate: hitRate,
      hitRateRaw: hitRateRaw,
      triggerDelayEnable: document.getElementById('triggerDelayEnable')?.checked ?? true,
      
      kdRatio: toFloat('kdRatio') || 1.0,
      extractRate: extractRate,
      extraCost: toFloat('extraCost') || 30,
      
      hitProb: {
        head: toFloat('pHead') || 0.1,
        chest: toFloat('pChest') || 0.3,
        stomach: toFloat('pStomach') || 0.3,
        limbs: toFloat('pLimbs') || 0.3
      }
    };
  }

  getHitRateFromMap(hitRateMap, distance, fallback = 0.85) {
    if (!hitRateMap || hitRateMap.length === 0) return fallback;
    return this.dataManager.getHitRateFromMap(hitRateMap, distance, fallback);
  }

  getWeaponBulletType(weaponIndex) {
    const select = document.querySelector(`.bulletSel[data-weapon="${weaponIndex}"]`);
    if (select) {
      return select.value || null;
    }
    return null;
  }

  // ============================================================
  // 3. 哈弗币消耗数据更新
  // ============================================================

  updateHavocCosts(havocCosts) {
    this.havocCosts = havocCosts || {};
    
    if (this.currentTab === 'price') {
      console.log(`💰 哈弗币消耗数据已更新 (${Object.keys(this.havocCosts).length} 个配置)`);
      this.refreshPriceTable();
    } else {
      this._pendingHavocUpdate = true;
    }
  }

  getHavocCosts() {
    return this.havocCosts;
  }

  // ============================================================
  // 4. Tab 切换
  // ============================================================

  setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });
  }

  switchTab(tab) {
    this.currentTab = tab;

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tab}`);
    });

    if (tab === 'price') {
      if (this._pendingHavocUpdate) {
        this.refreshPriceTable();
        this._pendingHavocUpdate = false;
      } else {
        this.refreshPriceTable();
      }
    } else if (tab === 'weapon') {
      this.refreshWeaponTable();
    } else if (tab === 'bullet') {
      this.refreshBulletTable();
    }
  }

  // ============================================================
  // 5. 价格表格
  // ============================================================

  initPriceTable() {
    const container = document.getElementById('tab-price');
    if (!container) {
      console.warn('价格表格容器 #tab-price 不存在');
      return;
    }

    const priceRows = this.dataManager.getPriceRows();
    const rowData = this.buildPriceRows(priceRows);

    const getBarrelOptions = (row) => {
      const weaponId = row._weaponId ?? row.weaponId;
      if (!weaponId) {
        return ['无'];
      }
      
      const weapon = this.dataManager.getWeaponById(weaponId);
      if (!weapon) {
        return ['无'];
      }
      
      if (!Array.isArray(weapon.barrels) || weapon.barrels.length === 0) {
        return ['无'];
      }
      
      const options = weapon.barrels
        .map(b => b.name?.trim())
        .filter(name => name && name.length > 0);
      
      const uniqueOptions = [...new Set(options)];
      
      return uniqueOptions.length > 0 ? ['无', ...uniqueOptions] : ['无'];
    };

    const getBulletOptions = (row) => {
      const weapon = this.dataManager.getWeaponById(row._weaponId);
      if (!weapon) return ['无'];
      const bullets = this.dataManager.getBulletsByCaliber(weapon.allowedBullet);
      const options = bullets.map(b => `${b.caliber} Lv.${b.level}`);
      return ['无', ...options];
    };

    this.priceTableInstance = PriceTable.render({
      data: rowData,
      muzzleOptions: this.muzzleOptions,
      getBarrelOptions: getBarrelOptions,
      getBulletOptions: getBulletOptions,
      havocCosts: this.havocCosts,
      onCellChange: (rowIndex, key, value, row) => {
        this.handlePriceCellChange(rowIndex, key, value, row);
      },
      onAddRow: (rowIndex, rowData) => {
        this.handlePriceAddRow(rowIndex, rowData);
      },
      onDeleteRow: (rowIndex, weaponId, configId, isCancelled) => {
        this.handlePriceDeleteRow(rowIndex, weaponId, configId, isCancelled);
      },
      onEnabledChange: (rowIndex, enabled, row) => {
        if (this.priceTableInstance) {
          const tableData = this.priceTableInstance.getData();
          if (tableData && tableData[rowIndex]) {
            tableData[rowIndex].enabled = enabled;
          }
          if (this.priceTableInstance._currentData && this.priceTableInstance._currentData[rowIndex]) {
            this.priceTableInstance._currentData[rowIndex].enabled = enabled;
          }
          if (this.priceTableInstance._data && this.priceTableInstance._data[rowIndex]) {
            this.priceTableInstance._data[rowIndex].enabled = enabled;
          }
          const container = document.getElementById('tab-price');
          if (container) {
            PriceTable.updateEnabledCount(container, tableData);
          }
        }
        
        const weaponId = row._weaponId;
        const configId = row._configId;
        if (weaponId && configId) {
          this.dataManager.updatePriceConfig(weaponId, configId, { enabled: enabled });
        }
      }
    });

    container.innerHTML = this.priceTableInstance.getHTML();
    this.priceTableInstance.bindEdit();

    console.log(`✅ 价格表格初始化完成，${rowData.length} 条配置`);
  }

  // ============================================================
  // 6. 武器表格
  // ============================================================

  initWeaponTable(onBarrelEdit) {
    const container = document.getElementById('tab-weapon');
    if (!container) {
      console.warn('武器表格容器 #tab-weapon 不存在');
      return;
    }

    const weapons = this.dataManager.getWeapons();
    this.initWeaponAttachments(weapons);
    const rowData = this.buildWeaponRows(weapons);

    const getBarrelOptions = (row) => {
      const weapon = this.dataManager.getWeaponById(row.id);
      if (!weapon || !Array.isArray(weapon.barrels) || weapon.barrels.length === 0) {
        return ['无'];
      }
      const options = weapon.barrels.map(b => b.name || '无');
      return ['无', ...options];
    };

    const editCallback = onBarrelEdit || this._onBarrelEdit;

    this.weaponTableInstance = WeaponTable.render({
      data: rowData,
      muzzleOptions: this.muzzleOptions,
      getBarrelOptions: getBarrelOptions,
      getDataManager: () => this.dataManager,
      onCellChange: (rowIndex, key, value, row) => {
        this.handleWeaponCellChange(rowIndex, key, value, row);
      },
      onAttachmentChange: (rowIndex, type, value) => {
        this.handleWeaponAttachmentChange(rowIndex, type, value);
      },
      onPrecisionChange: (rowIndex, value) => {
        this.handleWeaponPrecisionChange(rowIndex, value);
      },
      onAddClone: (rowIndex, isDelete) => {
        if (isDelete) {
          this.handleRemoveClone(rowIndex);
        } else {
          this.handleAddClone(rowIndex);
        }
      },
      onEditBarrel: (rowIndex) => {
        if (editCallback) {
          const row = this.weaponTableInstance?.getData()?.[rowIndex];
          if (row) {
            editCallback(row.id);
          }
        } else {
          console.warn('⚠️ onBarrelEdit 回调未设置');
        }
      }
    });

    container.innerHTML = this.weaponTableInstance.getHTML();
    this.weaponTableInstance.bindEdit();

    this._bindEditBarrelButtons(onBarrelEdit || this._onBarrelEdit);

    console.log(`✅ 武器表格初始化完成，${rowData.length} 把武器`);
  }

  _bindEditBarrelButtons(onBarrelEdit) {
    if (!onBarrelEdit) {
      return;
    }

    const container = document.getElementById('tab-weapon');
    if (!container) return;

    container.addEventListener('click', function(e) {
      const editBtn = e.target.closest('.edit-barrel-btn');
      if (!editBtn) return;

      e.stopPropagation();
      e.preventDefault();

      const weaponId = parseInt(editBtn.dataset.weaponId);
      onBarrelEdit(weaponId);
    }, true);
  }

  initWeaponAttachments(weapons) {
    weapons.forEach(weapon => {
      const existing = this.weaponAttachments[weapon.id];
      if (existing && existing.barrelId !== undefined && existing.barrelId !== -1) {
        return;
      }
      
      const bestBarrelIndex = this.dataManager.findBestBarrelIndex(weapon.id);
      
      this.weaponAttachments[weapon.id] = {
        barrelId: bestBarrelIndex,
        muzzleId: 0,
        precision: 0.09
      };
      this.weaponPrecisions[weapon.id] = 0.09;
    });
  }

  buildWeaponRows(weapons) {
    return weapons.map(weapon => {
      const attachment = this.weaponAttachments[weapon.id] || {
        barrelId: -1,
        muzzleId: 0,
        precision: 0.09
      };
      const cleanAttachment = {
        barrelId: typeof attachment.barrelId === 'string' ? parseInt(attachment.barrelId) : attachment.barrelId,
        muzzleId: typeof attachment.muzzleId === 'string' ? parseInt(attachment.muzzleId) : attachment.muzzleId,
        precision: typeof attachment.precision === 'string' ? parseFloat(attachment.precision) : attachment.precision
      };
      return WeaponTable.buildRowData(weapon, cleanAttachment, this.muzzleOptions);
    });
  }

  refreshWeaponTable() {
    if (this.isRefreshing) return;
    this.isRefreshing = true;

    try {
      const container = document.getElementById('tab-weapon');
      if (!container) return;

      const weapons = this.dataManager.getWeapons();
      const rowData = this.buildWeaponRows(weapons);

      const getBarrelOptions = (row) => {
        const weapon = this.dataManager.getWeaponById(row.id);
        if (!weapon || !Array.isArray(weapon.barrels) || weapon.barrels.length === 0) {
          return ['无'];
        }
        const options = weapon.barrels.map(b => b.name || '无');
        return ['无', ...options];
      };

      WeaponTable.update(container, rowData, {
        muzzleOptions: this.muzzleOptions,
        getBarrelOptions: getBarrelOptions,
        getDataManager: () => this.dataManager,
        onCellChange: (rowIndex, key, value, row) => {
          this.handleWeaponCellChange(rowIndex, key, value, row);
        },
        onAttachmentChange: (rowIndex, type, value) => {
          this.handleWeaponAttachmentChange(rowIndex, type, value);
        },
        onPrecisionChange: (rowIndex, value) => {
          this.handleWeaponPrecisionChange(rowIndex, value);
        },
        onAddClone: (rowIndex, isDelete) => {
          if (isDelete) {
            this.handleRemoveClone(rowIndex);
          } else {
            this.handleAddClone(rowIndex);
          }
        },
        onEditBarrel: (rowIndex) => {
          if (this._onBarrelEdit) {
            const row = this.weaponTableInstance?.getData()?.[rowIndex];
            if (row) {
              this._onBarrelEdit(row.id);
            }
          }
        }
      });

      if (this.weaponTableInstance) {
        this.weaponTableInstance.setData(rowData);
      }

    } catch (error) {
      console.error('刷新武器表格失败:', error);
    } finally {
      this.isRefreshing = false;
    }
  }

  handleWeaponCellChange(rowIndex, key, value, row) {
    const weaponId = row.id;
    let updateData = {};

    if (key === 'name' || key === 'type') {
      updateData[key] = value;
    } else if (key === 'rof' || key === 'velocity' || key === 'flesh' || key === 'armor') {
      updateData[key] = parseFloat(value) || 0;
    } else if (key === 'ranges') {
      const ranges = value.split(',').map(v => {
        const trimmed = v.trim();
        if (trimmed === '∞' || trimmed === 'Infinity' || trimmed === '') return Infinity;
        return parseFloat(trimmed) || 40;
      });
      updateData.ranges = ranges;
    } else if (key === 'mult') {
      const parts = value.split(',').map(v => parseFloat(v.trim()) || 1);
      updateData.mult = {
        head: parts[0] || 1.9,
        chest: parts[1] || 1,
        stomach: parts[2] || 0.9,
        limbs: parts[3] || 0.4
      };
    } else {
      updateData[key] = value;
    }

    if (Object.keys(updateData).length > 0) {
      this.dataManager.updateWeapon(weaponId, updateData);
    }

    this.scheduleRefresh('weapon');
  }

  handleWeaponAttachmentChange(rowIndex, type, value) {
    const row = this.weaponTableInstance?.getData()?.[rowIndex];
    if (!row) {
      console.warn('handleWeaponAttachmentChange: 未找到行数据', rowIndex);
      return;
    }

    const weaponId = row.id;
    
    if (!this.weaponAttachments[weaponId]) {
      this.weaponAttachments[weaponId] = { barrelId: -1, muzzleId: 0, precision: 0.09 };
    }

    const numValue = typeof value === 'string' ? parseInt(value) : value;
    
    if (type === 'barrel') {
      this.weaponAttachments[weaponId].barrelId = isNaN(numValue) ? -1 : numValue;
    } else if (type === 'muzzle') {
      this.weaponAttachments[weaponId].muzzleId = isNaN(numValue) ? 0 : numValue;
    }

    this.dataManager.markWeaponModified(weaponId);
    this.scheduleRefresh('weapon');
  }

  handleWeaponPrecisionChange(rowIndex, value) {
    const row = this.weaponTableInstance?.getData()?.[rowIndex];
    if (!row) return;

    const weaponId = row.id;
    
    if (!this.weaponAttachments[weaponId]) {
      this.weaponAttachments[weaponId] = { barrelId: -1, muzzleId: 0, precision: 0.09 };
    }
    
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    this.weaponAttachments[weaponId].precision = isNaN(numValue) ? 0.09 : numValue;
    this.weaponPrecisions[weaponId] = this.weaponAttachments[weaponId].precision;

    this.dataManager.markWeaponModified(weaponId);
    this.scheduleRefresh('weapon');
  }

  handleAddClone(rowIndex) {
    const row = this.weaponTableInstance?.getData()?.[rowIndex];
    if (!row) return;

    const weapon = this.dataManager.getWeaponById(row.id);
    if (!weapon) return;

    const clone = {
      ...weapon,
      id: `clone_${Date.now()}_${row.id}`,
      name: `${weapon.name} [副本]`,
      isClone: true,
      originalId: row.id
    };

    this.dataManager.data.weapons.push(clone);
    this.scheduleRefresh('weapon');
  }

  handleRemoveClone(rowIndex) {
    const row = this.weaponTableInstance?.getData()?.[rowIndex];
    if (!row) return;

    const weaponId = row.id;
    const weapons = this.dataManager.data.weapons;
    const index = weapons.findIndex(w => w.id === weaponId);
    if (index !== -1 && weapons[index].isClone) {
      weapons.splice(index, 1);
    }

    this.scheduleRefresh('weapon');
  }

  // ============================================================
  // 7. 价格表格数据处理
  // ============================================================

  buildPriceRows(priceRows) {
    return priceRows.map((row, index) => {
      const weaponId = row._weaponId ?? row.weaponId;
      if (!weaponId) {
        return null;
      }
      
      let barrelId = row.barrelId;
      let barrel = row.barrel;
      
      if ((!barrel || barrel === '无') && barrelId !== undefined && barrelId >= 0) {
        const weapon = this.dataManager.getWeaponById(weaponId);
        if (weapon && weapon.barrels && weapon.barrels[barrelId]) {
          barrel = weapon.barrels[barrelId].name || '无';
        } else {
          barrel = '无';
        }
      }
      
      if ((barrelId === -1 || barrelId === undefined || barrelId === null) && barrel && barrel !== '无') {
        const foundIndex = this.dataManager.findBarrelIdByName(weaponId, barrel);
        if (foundIndex >= 0) {
          barrelId = foundIndex;
        }
      }
      
      if ((barrelId === -1 || barrelId === undefined || barrelId === null) && (!barrel || barrel === '无')) {
        const bestIndex = this.dataManager.findBestBarrelIndex(weaponId);
        if (bestIndex >= 0) {
          barrelId = bestIndex;
          const weapon = this.dataManager.getWeaponById(weaponId);
          if (weapon && weapon.barrels && weapon.barrels[bestIndex]) {
            barrel = weapon.barrels[bestIndex].name || '无';
          }
        } else {
          barrel = '无';
        }
      }
      
      if (barrelId >= 0 && (!barrel || barrel === '无')) {
        const weapon = this.dataManager.getWeaponById(weaponId);
        if (weapon && weapon.barrels && weapon.barrels[barrelId]) {
          barrel = weapon.barrels[barrelId].name || '无';
        }
      }
      
      const configId = row.configId || '#1';
      
      let bulletDisplay = '-';
      let bulletId = row.bulletId || '';
      if (bulletId) {
        const bullet = this.dataManager.getBulletById(bulletId);
        if (bullet) {
          bulletDisplay = `${bullet.caliber} Lv.${bullet.level}`;
        }
      }
      
      const data = PriceTable.buildRowData({
        ...row,
        configId: configId,
        barrelId: barrelId !== undefined ? barrelId : -1,
        barrel: barrel || '无',
        bulletId: bulletId,
        bulletDisplay: bulletDisplay,
        _weaponId: weaponId,
        _cache: row._cache || row.cache || null
      });
      
      if (row.muzzleId !== undefined && row.muzzleId >= 0 && this.muzzleOptions[row.muzzleId]) {
        data.muzzle = this.muzzleOptions[row.muzzleId];
      }
      if (row.muzzle && row.muzzle !== '无') {
        data.muzzle = row.muzzle;
      }
      
      if (row.enabled !== undefined) {
        data.enabled = row.enabled;
      }
      
      return data;
    }).filter(row => row !== null);
  }

  // ============================================================
  // 8. 刷新价格表格 ⭐ 确保 havocCosts 被传递
  // ============================================================

  refreshPriceTable() {
    if (this.isRefreshing) return;
    this.isRefreshing = true;

    try {
      const container = document.getElementById('tab-price');
      if (!container) {
        return;
      }

      const priceRows = this.dataManager.getPriceRows();
      const rowData = this.buildPriceRows(priceRows);

      const getBarrelOptions = (row) => {
        const weaponId = row._weaponId ?? row.weaponId;
        if (!weaponId) {
          return ['无'];
        }
        
        const weapon = this.dataManager.getWeaponById(weaponId);
        if (!weapon) {
          return ['无'];
        }
        
        if (!Array.isArray(weapon.barrels) || weapon.barrels.length === 0) {
          return ['无'];
        }
        
        const options = weapon.barrels
          .map(b => b.name?.trim())
          .filter(name => name && name.length > 0);
        
        const uniqueOptions = [...new Set(options)];
        
        return uniqueOptions.length > 0 ? ['无', ...uniqueOptions] : ['无'];
      };

      const getBulletOptions = (row) => {
        const weapon = this.dataManager.getWeaponById(row._weaponId);
        if (!weapon) return ['无'];
        const bullets = this.dataManager.getBulletsByCaliber(weapon.allowedBullet);
        const options = bullets.map(b => `${b.caliber} Lv.${b.level}`);
        return ['无', ...options];
      };

      const processedData = PriceTable.update(container, rowData, {
        muzzleOptions: this.muzzleOptions,
        getBarrelOptions: getBarrelOptions,
        getBulletOptions: getBulletOptions,
        havocCosts: this.havocCosts,
        onCellChange: (rowIndex, key, value, row) => {
          this.handlePriceCellChange(rowIndex, key, value, row);
        },
        onAddRow: (rowIndex, rowData) => {
          this.handlePriceAddRow(rowIndex, rowData);
        },
        onDeleteRow: (rowIndex, weaponId, configId, isCancelled) => {
          this.handlePriceDeleteRow(rowIndex, weaponId, configId, isCancelled);
        },
        onEnabledChange: (rowIndex, enabled, row) => {
          if (this.priceTableInstance) {
            const tableData = this.priceTableInstance.getData();
            if (tableData && tableData[rowIndex]) {
              tableData[rowIndex].enabled = enabled;
            }
            if (this.priceTableInstance._currentData && this.priceTableInstance._currentData[rowIndex]) {
              this.priceTableInstance._currentData[rowIndex].enabled = enabled;
            }
            if (this.priceTableInstance._data && this.priceTableInstance._data[rowIndex]) {
              this.priceTableInstance._data[rowIndex].enabled = enabled;
            }
            const container = document.getElementById('tab-price');
            if (container) {
              PriceTable.updateEnabledCount(container, tableData);
            }
          }
          
          const weaponId = row._weaponId;
          const configId = row._configId;
          if (weaponId && configId) {
            this.dataManager.updatePriceConfig(weaponId, configId, { enabled: enabled });
          }
        }
      });

      if (this.priceTableInstance && processedData) {
        this.priceTableInstance._data = processedData;
        this.priceTableInstance._currentData = processedData;
      }

      this._pendingHavocUpdate = false;

    } catch (error) {
      console.error('刷新价格表格失败:', error);
    } finally {
      this.isRefreshing = false;
    }
  }

  // ⭐ 核心修复：使用 weaponId + configId 定位
  handlePriceCellChange(rowIndex, key, value, row) {
    // 使用 weaponId 和 configId 定位，而不是 rowIndex
    const weaponId = row._weaponId;
    const configId = row._configId;
    
    if (!weaponId || !configId) {
      console.warn('handlePriceCellChange: 缺少 weaponId 或 configId', row);
      return;
    }

    const ttkAffectingKeys = ['barrel', 'muzzle', 'bulletDisplay', 'hitRateRaw'];
    const affectsTTK = ttkAffectingKeys.includes(key);

    if (key === 'barrel') {
      const barrelId = this.dataManager.findBarrelIdByName(weaponId, value);
      if (barrelId >= 0) {
        this.dataManager.updatePriceConfig(weaponId, configId, { barrelId });
      } else {
        const weapon = this.dataManager.getWeaponById(weaponId);
        if (weapon && weapon.barrels) {
          const idx = weapon.barrels.findIndex(b => b.name === value);
          if (idx >= 0) {
            this.dataManager.updatePriceConfig(weaponId, configId, { barrelId: idx });
          }
        }
      }
    } else if (key === 'muzzle') {
      const muzzleId = this.muzzleOptions.indexOf(value);
      if (muzzleId >= 0) {
        this.dataManager.updatePriceConfig(weaponId, configId, { 
          muzzleId: muzzleId,
          muzzle: value
        });
      }
    } else if (key === 'buildCode') {
      this.dataManager.updatePriceConfig(weaponId, configId, { buildCode: value });
      this.scheduleRefresh('price');
      return;
    } else if (key === 'price') {
      const priceInput = parseFloat(value);
      if (!isNaN(priceInput) && priceInput >= 0) {
        // ⭐ 判断输入值是否已经是元（大于 10000 表示已经是元）
        let priceToSave;
        if (priceInput > 10000) {
          // 已经是元，直接使用
          priceToSave = priceInput;
        } else {
          // 用户输入的是万，乘以 10000
          priceToSave = priceInput * 10000;
        }
        this.dataManager.updatePriceConfig(weaponId, configId, { price: priceToSave });
      }
      this.scheduleRefresh('price');
      return;
    } else if (key === 'hitRateRaw') {
      const parsed = PriceTable.parseHitRateRaw(value);
      this.dataManager.updatePriceConfig(weaponId, configId, {
        distance: parsed.distance,
        hitRate: parsed.hitRate
      });
    } else if (key === 'bulletDisplay') {
      if (value === '无') {
        this.dataManager.updatePriceConfig(weaponId, configId, { bullet: '' });
        console.log(`🔫 子弹已清空: ${weaponId} ${configId}`);
      } else {
        const bulletId = this.dataManager.findBulletIdByDisplay(value);
        if (bulletId) {
          this.dataManager.updatePriceConfig(weaponId, configId, { bullet: bulletId });
          console.log(`🔫 子弹已更新: ${weaponId} ${configId} -> ${bulletId}`);
        } else {
          console.warn('⚠️ 未找到匹配的子弹:', value);
        }
      }
      this.scheduleRefresh('price');
      return;
    }

    if (affectsTTK && weaponId) {
      this.dataManager.markWeaponModified(weaponId);
    }

    this.scheduleRefresh('price');
  }

  handlePriceAddRow(rowIndex, rowData) {
    const weaponId = rowData._weaponId;
    const nextConfigId = this.dataManager.getNextConfigId(weaponId);

    const bestBarrelIndex = this.dataManager.findBestBarrelIndex(weaponId);
    const weapon = this.dataManager.getWeaponById(weaponId);

    const barrel = rowData.barrel || '无';
    const muzzle = rowData.muzzle || '无';
    const buildCode = rowData.buildCode || '';
    const price = rowData.price || 0;
    const hitRateRaw = rowData.hitRateRaw || '';
    const bulletDisplay = rowData.bulletDisplay || '-';
    
    const parsed = PriceTable.parseHitRateRaw(hitRateRaw);
    
    let bulletId = '';
    if (bulletDisplay && bulletDisplay !== '-') {
      const found = this.dataManager.findBulletIdByDisplay(bulletDisplay);
      if (found) bulletId = found;
    }

    let barrelId = -1;
    if (barrel && barrel !== '无') {
      const found = this.dataManager.findBarrelIdByName(weaponId, barrel);
      if (found >= 0) barrelId = found;
    }
    if (barrelId === -1) {
      barrelId = bestBarrelIndex >= 0 ? bestBarrelIndex : -1;
    }

    let muzzleId = 0;
    if (muzzle && muzzle !== '无') {
      const idx = this.muzzleOptions.indexOf(muzzle);
      if (idx >= 0) muzzleId = idx;
    }

    const newConfig = {
      id: nextConfigId,
      barrelId: barrelId,
      barrel: barrel,
      muzzleId: muzzleId,
      muzzle: muzzle,
      buildCode: buildCode,
      price: price,
      distance: parsed.distance.length > 0 ? parsed.distance : [30, 50, 100],
      hitRate: parsed.hitRate.length > 0 ? parsed.hitRate : [1.0, 0.9, 0.6],
      bullet: bulletId,
      enabled: true
    };

    this.dataManager.addPriceConfig(weaponId, newConfig);
    this.scheduleRefresh('price');
  }

  handlePriceDeleteRow(rowIndex, weaponId, configId, isCancelled) {
    if (isCancelled) {
      this.scheduleRefresh('price');
      return;
    }

    if (weaponId && configId) {
      this.dataManager.removePriceConfig(weaponId, configId);
      this.scheduleRefresh('price');
    }
  }

  // ============================================================
  // 9. 子弹表格
  // ============================================================

  initBulletTable() {
    const container = document.getElementById('tab-bullet');
    if (!container) {
      console.warn('子弹表格容器 #tab-bullet 不存在');
      return;
    }

    const bullets = this.dataManager.getBullets();
    const rowData = bullets.map(b => BulletTable.buildRowData(b));

    this.bulletTableInstance = BulletTable.render({
      data: rowData,
      caliberOptions: this.getCaliberOptions(),
      levelOptions: ['1', '2', '3', '4', '5', 'RIP', 'M61', 'BT+P', 'Double', 'SUPER', 'AP', 'CT'],
      onCellChange: (rowIndex, key, value, row) => {
        this.handleBulletCellChange(rowIndex, key, value, row);
      },
      onAddRow: (rowIndex, rowData) => {
        this.handleBulletAddRow(rowIndex, rowData);
      },
      onDeleteRow: (rowIndex, bulletId, isCancelled) => {
        this.handleBulletDeleteRow(rowIndex, bulletId, isCancelled);
      }
    });

    container.innerHTML = this.bulletTableInstance.getHTML();
    this.bulletTableInstance.bindEdit();

    console.log(`✅ 子弹表格初始化完成，${rowData.length} 种子弹`);
  }

  refreshBulletTable() {
    if (this.isRefreshing) return;
    this.isRefreshing = true;

    try {
      const container = document.getElementById('tab-bullet');
      if (!container) return;

      const bullets = this.dataManager.getBullets();
      const rowData = bullets.map(b => BulletTable.buildRowData(b));

      BulletTable.update(container, rowData, {
        caliberOptions: this.getCaliberOptions(),
        levelOptions: ['1', '2', '3', '4', '5', 'RIP', 'M61', 'BT+P', 'Double', 'SUPER', 'AP', 'CT'],
        onCellChange: (rowIndex, key, value, row) => {
          this.handleBulletCellChange(rowIndex, key, value, row);
        },
        onAddRow: (rowIndex, rowData) => {
          this.handleBulletAddRow(rowIndex, rowData);
        },
        onDeleteRow: (rowIndex, bulletId, isCancelled) => {
          this.handleBulletDeleteRow(rowIndex, bulletId, isCancelled);
        }
      });

      if (this.bulletTableInstance) {
        this.bulletTableInstance.setData(rowData);
      }

    } catch (error) {
      console.error('刷新子弹表格失败:', error);
    } finally {
      this.isRefreshing = false;
    }
  }

  handleBulletCellChange(rowIndex, key, value, row) {
    const bulletId = row._bulletId;
    
    if (key === 'base' || key === 'armorMult' || key === 'pen' || key === 'price') {
      this.dataManager.updateBullet(bulletId, { [key]: parseFloat(value) || 0 });
    }

    this.scheduleRefresh('bullet');
  }

  handleBulletAddRow(rowIndex, rowData) {
    const caliber = rowData.caliber || '';
    const level = rowData.level || '1';
    const bulletId = `${caliber}_${level}`;

    const armorData = {};
    for (let i = 1; i <= 6; i++) {
      armorData[i] = {
        armorMult: rowData.armorMult || 1.0,
        pen: rowData.pen || 0.5
      };
    }

    const newBullet = {
      id: bulletId,
      caliber: caliber,
      level: level,
      base: rowData.base || 1.0,
      armorMult: rowData.armorMult || 1.0,
      pen: rowData.pen || 0.5,
      price: rowData.price || 0,
      armorData: armorData
    };

    this.dataManager.addBullet(newBullet);
    this.scheduleRefresh('bullet');
  }

  handleBulletDeleteRow(rowIndex, bulletId, isCancelled) {
    if (isCancelled) {
      this.scheduleRefresh('bullet');
      return;
    }

    if (bulletId) {
      this.dataManager.removeBullet(bulletId);
      this.scheduleRefresh('bullet');
    }
  }

  getCaliberOptions() {
    const calibers = new Set();
    this.dataManager.getBullets().forEach(b => {
      if (b.caliber) calibers.add(b.caliber);
    });
    return Array.from(calibers).sort();
  }

  // ============================================================
  // 10. 价格配置读取（供柱状图使用）⭐ 精简日志
  // ============================================================

  /**
   * 获取启用的价格配置
   * ⭐ 核心修改：确保每个配置都包含自己的 hitRateMap
   * 
   * @param {Array} weapons - 武器列表
   * @param {Object} params - 页面参数（包含距离等）
   * @returns {Array} 配置数组，每个配置包含 hitRateMap
   */
  getEnabledPriceConfigs(weapons, params) {
    const priceRows = this.dataManager.getPriceRows();
    const enabledRows = PriceTable.getEnabledData(priceRows);
    
    if (!enabledRows || enabledRows.length === 0) {
      console.log('📋 没有启用的价格配置');
      return [];
    }
    
    const weaponList = weapons || this.dataManager.getWeapons();
    const muzzleOptions = this.muzzleOptions;
    const configs = [];
    
    for (const row of enabledRows) {
      const weaponId = row._weaponId;
      const weapon = this.dataManager.getWeaponById(weaponId);
      
      if (!weapon) {
        console.warn(`⚠️ 未找到武器 ID: ${weaponId}，跳过该配置`);
        continue;
      }
      
      let barrel = null;
      let barrelIndex = -1;
      
      if (row.barrel && row.barrel !== '无') {
        const idx = weapon.barrels?.findIndex(b => b.name === row.barrel);
        if (idx !== undefined && idx >= 0) {
          barrel = weapon.barrels[idx];
          barrelIndex = idx;
        } else {
          const id = row.barrelId;
          if (id !== undefined && id >= 0 && id < weapon.barrels?.length) {
            barrel = weapon.barrels[id];
            barrelIndex = id;
          }
        }
      }
      
      if (!barrel) {
        const bestIndex = this.dataManager.findBestBarrelIndex(weaponId);
        if (bestIndex >= 0 && weapon.barrels && weapon.barrels[bestIndex]) {
          barrel = weapon.barrels[bestIndex];
          barrelIndex = bestIndex;
        }
      }
      
      let muzzleId = 0;
      if (row.muzzle && row.muzzle !== '无') {
        const idx = muzzleOptions.indexOf(row.muzzle);
        if (idx >= 0) muzzleId = idx;
      }
      
      let bulletId = row._bulletId || row.bulletId || null;
      if (bulletId === '') {
        bulletId = null;
      }
      
      // ⭐ 构建配置自己的命中率映射
      let hitRateMap = [];
      if (row._distance && row._hitRate && 
          Array.isArray(row._distance) && Array.isArray(row._hitRate) &&
          row._distance.length > 0 && row._hitRate.length > 0) {
        const len = Math.min(row._distance.length, row._hitRate.length);
        for (let i = 0; i < len; i++) {
          hitRateMap.push({
            distance: row._distance[i],
            rate: row._hitRate[i]
          });
        }
      }
      
      // 如果没有配置自己的映射，尝试从 row.distance 和 row.hitRate 读取
      if (hitRateMap.length === 0 && row.distance && row.hitRate &&
          Array.isArray(row.distance) && Array.isArray(row.hitRate) &&
          row.distance.length > 0 && row.hitRate.length > 0) {
        const len = Math.min(row.distance.length, row.hitRate.length);
        for (let i = 0; i < len; i++) {
          hitRateMap.push({
            distance: row.distance[i],
            rate: row.hitRate[i]
          });
        }
      }
      
      // ⭐ 计算当前距离下的命中率（用于柱状图）
      let hitRate = params?.hitRate || 0.85;
      if (hitRateMap.length > 0) {
        hitRate = this.dataManager.getHitRateFromMap(
          hitRateMap, 
          params?.distance || 30, 
          0.85
        );
      }
      
      const displayName = `${weapon.name} ${row.configId || ''}`;
      const configId = row.configId || '#1';
      
      // ⭐ 不再逐条打印命中率映射
      
      configs.push({
        weapon: weapon,
        weaponId: weaponId,
        configId: configId,
        displayName: displayName.trim(),
        configIndex: row._rowIndex,
        barrel: barrel,
        barrelIndex: barrelIndex,
        barrelName: row.barrel || '无',
        muzzleId: muzzleId,
        muzzleName: row.muzzle || '无',
        bulletId: bulletId,
        bulletDisplay: row.bulletDisplay || '-',
        hitRateMap: hitRateMap,
        hitRate: hitRate,
        buildCode: row.buildCode || '-',
        price: row.price || 0,
        _rawRow: row
      });
    }
    
    // ⭐ 精简日志：只打印配置数量
    console.log(`📋 启用的价格配置: ${configs.length} 个`);
    
    return configs;
  }

  // ============================================================
  // 11. 新增配置功能
  // ============================================================

  _handleAddConfig(e) {
    const tableData = this.priceTableInstance?.getData();
    if (!tableData || tableData.length === 0) {
      alert('⚠️ 没有可用的价格配置数据');
      return;
    }

    const weapons = this.dataManager.getWeapons();
    if (!weapons || weapons.length === 0) {
      alert('⚠️ 没有可用的武器数据');
      return;
    }

    const weaponsWithPrice = weapons.filter(w => {
      const price = this.dataManager.getPriceByWeaponId(w.id);
      return price && price.configs && price.configs.length > 0;
    });

    if (weaponsWithPrice.length === 0) {
      alert('⚠️ 没有可用的武器价格配置，请先为武器创建价格配置');
      return;
    }

    this._showAddConfigDialog(weaponsWithPrice);
  }

  _showAddConfigDialog(weapons) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.4);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      backdrop-filter: blur(2px);
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: #fff;
      border-radius: 12px;
      padding: 24px 32px 20px;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      animation: modalSlideIn 0.25s ease;
    `;

    let optionsHtml = weapons.map(w => {
      const price = this.dataManager.getPriceByWeaponId(w.id);
      const configCount = price?.configs?.length || 0;
      return `<option value="${w.id}">${w.name} (已有 ${configCount} 个配置)</option>`;
    }).join('');

    dialog.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="font-size:16px;font-weight:600;color:#1a1a2e;">➕ 新增价格配置</h3>
        <button id="addConfigCloseBtn" style="background:none;border:none;font-size:22px;color:#999;cursor:pointer;padding:0 4px;border-radius:4px;">&times;</button>
      </div>
      <div style="margin-bottom:16px;">
        <label style="font-size:13px;font-weight:500;color:#555;display:block;margin-bottom:4px;">选择武器</label>
        <select id="addConfigWeaponSelect" style="width:100%;padding:8px 10px;border:1px solid #d0d0d0;border-radius:4px;font-size:13px;background:#fafafa;">
          ${optionsHtml}
        </select>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="addConfigCancelBtn" style="padding:6px 20px;border:1px solid #d0d0d0;border-radius:4px;font-size:13px;cursor:pointer;background:#f5f5f5;color:#555;">取消</button>
        <button id="addConfigConfirmBtn" style="padding:6px 20px;border:none;border-radius:4px;font-size:13px;font-weight:500;cursor:pointer;background:#4caf50;color:#fff;">✅ 确认添加</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const closeDialog = () => {
      overlay.remove();
    };

    document.getElementById('addConfigCloseBtn').addEventListener('click', closeDialog);
    document.getElementById('addConfigCancelBtn').addEventListener('click', closeDialog);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDialog();
    });

    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeDialog();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    document.getElementById('addConfigConfirmBtn').addEventListener('click', () => {
      const select = document.getElementById('addConfigWeaponSelect');
      const weaponId = parseInt(select.value);
      if (isNaN(weaponId) || weaponId <= 0) {
        alert('请选择有效的武器');
        return;
      }

      const nextConfigId = this.dataManager.getNextConfigId(weaponId);
      const bestBarrelIndex = this.dataManager.findBestBarrelIndex(weaponId);
      const weapon = this.dataManager.getWeaponById(weaponId);

      const price = this.dataManager.getPriceByWeaponId(weaponId);
      if (price && price.configs && price.configs.length >= 10) {
        if (!confirm(`⚠️ ${weapon?.name} 已有 ${price.configs.length} 个配置，继续添加吗？`)) {
          return;
        }
      }

      let barrelName = '无';
      let barrelId = bestBarrelIndex >= 0 ? bestBarrelIndex : -1;
      if (bestBarrelIndex >= 0 && weapon?.barrels && weapon.barrels[bestBarrelIndex]) {
        barrelName = weapon.barrels[bestBarrelIndex].name || '无';
      }

      let bulletId = '';
      if (weapon?.allowedBullet) {
        let defaultBullet = this.dataManager.getBulletByCaliberAndLevel(weapon.allowedBullet, 4);
        if (!defaultBullet) {
          const bullets = this.dataManager.getBulletsByCaliber(weapon.allowedBullet);
          if (bullets && bullets.length > 0) {
            defaultBullet = bullets[0];
          }
        }
        if (defaultBullet) {
          bulletId = defaultBullet.id;
        }
      }

      const newConfig = {
        id: nextConfigId,
        barrelId: barrelId,
        barrel: barrelName,
        muzzleId: 0,
        muzzle: '无',
        buildCode: '',
        price: 0,
        distance: [30, 50, 100],
        hitRate: [1.0, 0.9, 0.6],
        bullet: bulletId || '',
        enabled: true
      };

      this.dataManager.addPriceConfig(weaponId, newConfig);
      closeDialog();

      this.refreshPriceTable();
      console.log(`✅ 已为 ${weapon?.name || weaponId} 添加配置 ${nextConfigId}`);
    });
  }

  // ============================================================
  // 12. 延迟刷新
  // ============================================================

  scheduleRefresh(tab) {
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
    }
    this._refreshTimer = setTimeout(() => {
      if (tab === 'weapon') {
        this.refreshWeaponTable();
      } else if (tab === 'price') {
        this.refreshPriceTable();
      } else if (tab === 'bullet') {
        this.refreshBulletTable();
      }
      this._refreshTimer = null;
    }, 50);
  }

  // ============================================================
  // 13. 控制按钮事件
  // ============================================================

  bindControlEvents() {
    const calcBtn = document.getElementById('calcBtn');
    const distChartBtn = document.getElementById('distChartBtn');

    if (calcBtn) {
      calcBtn.addEventListener('click', () => {
        const event = new CustomEvent('calculate-ttk', {
          detail: { dataManager: this.dataManager }
        });
        document.dispatchEvent(event);
      });
    }

    if (distChartBtn) {
      distChartBtn.addEventListener('click', () => {
        const event = new CustomEvent('calculate-distance', {
          detail: { dataManager: this.dataManager }
        });
        document.dispatchEvent(event);
      });
    }

    const highlightSelect = document.getElementById('highlightWeaponSelect');
    if (highlightSelect) {
      highlightSelect.addEventListener('change', () => {
        const event = new CustomEvent('calculate-distance', {
          detail: { dataManager: this.dataManager }
        });
        document.dispatchEvent(event);
      });
    }
  }

  // ============================================================
  // 14. 导入/导出事件
  // ============================================================

  bindImportExportEvents() {
    const exportBtn = document.getElementById('exportDataBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.exportData();
      });
    }

    const importBtn = document.getElementById('importDataBtn');
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        this.importData();
      });
    }

    const resetBtn = document.getElementById('resetDataBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.resetData();
      });
    }
  }

  exportData() {
    try {
      const includeCacheCheckbox = document.getElementById('includeCacheCheckbox');
      const includeCache = includeCacheCheckbox ? includeCacheCheckbox.checked : true;
      
      this.dataManager.exportToFile(null, includeCache);
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败: ' + error.message);
    }
  }

  importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        await this.dataManager.importFromFile(file);
        
        this.weaponAttachments = {};
        this.weaponPrecisions = {};
        this.muzzleOptions = this.dataManager.getMuzzleNames();
        const weapons = this.dataManager.getWeapons();
        this.initWeaponAttachments(weapons);
        this.refreshWeaponTable();
        this.refreshPriceTable();
        this.refreshBulletTable();
        alert('✅ 数据导入成功！');
      } catch (error) {
        console.error('导入失败:', error);
        alert('❌ 导入失败: ' + error.message);
      }
    };
    input.click();
  }

  resetData() {
    if (!confirm('⚠️ 确定要重置所有数据为默认值吗？\n（当前修改将丢失！）')) {
      return;
    }

    try {
      this.dataManager.resetToOriginal();
      
      this.weaponAttachments = {};
      this.weaponPrecisions = {};
      this.muzzleOptions = this.dataManager.getMuzzleNames();
      const weapons = this.dataManager.getWeapons();
      this.initWeaponAttachments(weapons);
      this.refreshWeaponTable();
      this.refreshPriceTable();
      this.refreshBulletTable();
      alert('✅ 数据已重置为默认值！');
    } catch (error) {
      console.error('重置失败:', error);
      alert('❌ 重置失败: ' + error.message);
    }
  }

  // ============================================================
  // 15. 公共方法
  // ============================================================

  getCurrentTab() {
    return this.currentTab;
  }

  getWeaponAttachment(weaponId) {
    return this.weaponAttachments[weaponId] || { barrelId: -1, muzzleId: 0, precision: 0.09 };
  }

  getWeaponPrecision(weaponId) {
    return this.weaponPrecisions[weaponId] || 0.09;
  }

  refreshAll() {
    this.refreshWeaponTable();
    this.refreshPriceTable();
    this.refreshBulletTable();
  }

  destroy() {
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
    document.removeEventListener('price-add-config', this._handleAddConfig);
    this.weaponTableInstance = null;
    this.priceTableInstance = null;
    this.bulletTableInstance = null;
  }
}