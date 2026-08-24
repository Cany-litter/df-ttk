/**
 * DOM 控制器
 * 
 * 负责协调三个表格组件、DataManager 和 UI 交互
 * 
 * 职责：
 * 1. 初始化三个表格（武器、价格、子弹）
 * 2. Tab 切换管理
 * 3. 读取页面参数
 * 4. 数据变更时同步到 DataManager 并刷新表格
 * 5. 导入/导出功能
 * 6. 操作按钮（添加副本、编辑枪管、新增/删除行）
 * 7. 获取价格表格中启用的配置（供柱状图使用）
 */
import { getDataManager } from '../core/DataManager.js';
import WeaponTable from './WeaponTable.js';
import PriceTable from './PriceTable.js';
import BulletTable from './BulletTable.js';

// 默认命中率映射（10米100%命中率，更符合实际）
const DEFAULT_HIT_RATE_MAP = '10:1.0,30:0.9,50:0.8,100:0.7,150:0.6';

export default class DOMController {
  constructor() {
    this.dataManager = getDataManager();
    this.currentTab = 'weapon';
    this.weaponTableInstance = null;
    this.priceTableInstance = null;
    this.bulletTableInstance = null;
    this.muzzleOptions = this.dataManager.getMuzzleNames();
    
    this.weaponAttachments = {};
    this.weaponPrecisions = {};
    this.isRefreshing = false;
    this._refreshTimer = null;
  }

  // ============================================================
  // 1. 初始化
  // ============================================================

  initialize(options = {}) {
    const { onBarrelEdit = null } = options;

    this.setupTabs();
    this.initWeaponTable(onBarrelEdit);
    this.initPriceTable();
    this.initBulletTable();
    this.bindControlEvents();
    this.bindImportExportEvents();

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
    
    return {
      bulletLevel: toNum('bulletLevel') || 4,
      armorLevel: toNum('armorLevel') || 4,
      armorValue: toNum('armorValue') || 80,
      helmetLevel: toNum('helmetLevel') || 4,
      helmetValue: toNum('helmetValue') || 35,
      distance: distance,
      healthValue: toNum('healthValue') || 100,
      hitRateMap: hitRateMap,
      hitRate: hitRate,
      hitRateRaw: hitRateRaw,
      triggerDelayEnable: document.getElementById('triggerDelayEnable')?.checked ?? true,
      hitProb: {
        head: toFloat('pHead') || 0.18,
        chest: toFloat('pChest') || 0.30,
        stomach: toFloat('pStomach') || 0.22,
        limbs: toFloat('pLimbs') || 0.30
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
  // 3. Tab 切换
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

    if (tab === 'weapon') {
      this.refreshWeaponTable();
    } else if (tab === 'price') {
      this.refreshPriceTable();
    } else if (tab === 'bullet') {
      this.refreshBulletTable();
    }
  }

  // ============================================================
  // 4. 武器表格
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
        if (onBarrelEdit) {
          const row = this.weaponTableInstance?.getData()?.[rowIndex];
          if (row) {
            onBarrelEdit(row.id);
          }
        }
      }
    });

    container.innerHTML = this.weaponTableInstance.getHTML();
    this.weaponTableInstance.bindEdit();

    console.log(`✅ 武器表格初始化完成，${rowData.length} 把武器`);
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
        onEditBarrel: (rowIndex) => {}
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
        console.warn('getBarrelOptions: 缺少 weaponId', row);
        return ['无'];
      }
      
      const weapon = this.dataManager.getWeaponById(weaponId);
      if (!weapon) {
        console.warn(`getBarrelOptions: 未找到武器 ${weaponId}`);
        return ['无'];
      }
      
      if (!Array.isArray(weapon.barrels) || weapon.barrels.length === 0) {
        return ['无'];
      }
      
      const options = weapon.barrels
        .map(b => b.name?.trim())
        .filter(name => name && name.length > 0);
      
      const uniqueOptions = [...new Set(options)];
      
      if (uniqueOptions.length > 0) {
        console.log(`🔫 [${weapon.name}] 价格表格枪管选项:`, uniqueOptions);
      }
      
      return uniqueOptions.length > 0 ? ['无', ...uniqueOptions] : ['无'];
    };

    const getBulletOptions = (row) => {
      const weapon = this.dataManager.getWeaponById(row._weaponId);
      if (!weapon) return [];
      const bullets = this.dataManager.getBulletsByCaliber(weapon.allowedBullet);
      return bullets.map(b => `${b.caliber} Lv.${b.level}`);
    };

    this.priceTableInstance = PriceTable.render({
      data: rowData,
      muzzleOptions: this.muzzleOptions,
      getBarrelOptions: getBarrelOptions,
      getBulletOptions: getBulletOptions,
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
        // ⭐ 不再刷新整个表格，只更新计数
        if (this.priceTableInstance) {
          const tableData = this.priceTableInstance.getData();
          if (tableData && tableData[rowIndex]) {
            tableData[rowIndex].enabled = enabled;
          }
          // ⭐ 同时更新 _currentData
          if (this.priceTableInstance._currentData && this.priceTableInstance._currentData[rowIndex]) {
            this.priceTableInstance._currentData[rowIndex].enabled = enabled;
          }
          // ⭐ 同时更新 _data
          if (this.priceTableInstance._data && this.priceTableInstance._data[rowIndex]) {
            this.priceTableInstance._data[rowIndex].enabled = enabled;
          }
          const container = document.getElementById('tab-price');
          if (container) {
            PriceTable.updateEnabledCount(container, tableData);
          }
        }
        
        // ⭐ 保存到 DataManager（持久化到 data.json）
        const weaponId = row._weaponId;
        const configId = row._configId;
        if (weaponId && configId) {
          this.dataManager.updatePriceConfig(weaponId, configId, { enabled: enabled });
        }
        
        // 不触发折线图
        // document.dispatchEvent(new CustomEvent('calculate-distance'));
      }
    });

    container.innerHTML = this.priceTableInstance.getHTML();
    this.priceTableInstance.bindEdit();

    console.log(`✅ 价格表格初始化完成，${rowData.length} 条配置`);
  }

  buildPriceRows(priceRows) {
    return priceRows.map((row, index) => {
      const weaponId = row._weaponId ?? row.weaponId;
      if (!weaponId) {
        console.warn(`buildPriceRows: 第 ${index} 行缺少 weaponId`, row);
        return null;
      }
      
      let barrelId = row.barrelId;
      let barrel = row.barrel;
      
      if (barrelId === -1 || barrelId === undefined || barrelId === null) {
        if (barrel && barrel !== '无') {
          const foundIndex = this.dataManager.findBarrelIdByName(weaponId, barrel);
          if (foundIndex >= 0) {
            barrelId = foundIndex;
          }
        }
      }
      
      if (barrelId === -1 || barrelId === undefined || barrelId === null) {
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
      
      // 直接使用 configId（data.json 中已经是 #1, #2, #3 格式）
      const configId = row.configId || '#1';
      
      const data = PriceTable.buildRowData({
        ...row,
        configId: configId,
        barrelId: barrelId,
        barrel: barrel,
        _weaponId: weaponId
      });
      
      if (row.muzzleId !== undefined && row.muzzleId >= 0 && this.muzzleOptions[row.muzzleId]) {
        data.muzzle = this.muzzleOptions[row.muzzleId];
      }
      if (row.muzzle && row.muzzle !== '无') {
        data.muzzle = row.muzzle;
      }
      
      // ⭐ 保留 enabled 状态（从 DataManager 读取的）
      if (row.enabled !== undefined) {
        data.enabled = row.enabled;
      }
      
      return data;
    }).filter(row => row !== null);
  }

  refreshPriceTable() {
    if (this.isRefreshing) return;
    this.isRefreshing = true;

    try {
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
        if (!weapon) return [];
        const bullets = this.dataManager.getBulletsByCaliber(weapon.allowedBullet);
        return bullets.map(b => `${b.caliber} Lv.${b.level}`);
      };

      const processedData = PriceTable.update(container, rowData, {
        muzzleOptions: this.muzzleOptions,
        getBarrelOptions: getBarrelOptions,
        getBulletOptions: getBulletOptions,
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
          // ⭐ 不再刷新整个表格，只更新计数
          if (this.priceTableInstance) {
            const tableData = this.priceTableInstance.getData();
            if (tableData && tableData[rowIndex]) {
              tableData[rowIndex].enabled = enabled;
            }
            // ⭐ 同时更新 _currentData
            if (this.priceTableInstance._currentData && this.priceTableInstance._currentData[rowIndex]) {
              this.priceTableInstance._currentData[rowIndex].enabled = enabled;
            }
            // ⭐ 同时更新 _data
            if (this.priceTableInstance._data && this.priceTableInstance._data[rowIndex]) {
              this.priceTableInstance._data[rowIndex].enabled = enabled;
            }
            const container = document.getElementById('tab-price');
            if (container) {
              PriceTable.updateEnabledCount(container, tableData);
            }
          }
          
          // ⭐ 保存到 DataManager（持久化到 data.json）
          const weaponId = row._weaponId;
          const configId = row._configId;
          if (weaponId && configId) {
            this.dataManager.updatePriceConfig(weaponId, configId, { enabled: enabled });
          }
          
          // 不触发折线图
          // document.dispatchEvent(new CustomEvent('calculate-distance'));
        }
      });

      if (this.priceTableInstance && processedData) {
        this.priceTableInstance._data = processedData;
        this.priceTableInstance._currentData = processedData;
      }

    } catch (error) {
      console.error('刷新价格表格失败:', error);
    } finally {
      this.isRefreshing = false;
    }
  }

  handlePriceCellChange(rowIndex, key, value, row) {
    const weaponId = row._weaponId;
    const configId = row._configId;

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
    } else if (key === 'price') {
      this.dataManager.updatePriceConfig(weaponId, configId, { price: parseFloat(value) || 0 });
    } else if (key === 'hitRateRaw') {
      const parsed = PriceTable.parseHitRateRaw(value);
      this.dataManager.updatePriceConfig(weaponId, configId, {
        distance: parsed.distance,
        hitRate: parsed.hitRate
      });
    } else if (key === 'bulletDisplay') {
      const bulletId = this.dataManager.findBulletIdByDisplay(value);
      if (bulletId) {
        this.dataManager.updatePriceConfig(weaponId, configId, { bullet: bulletId });
      }
    }

    this.scheduleRefresh('price');
  }

  handlePriceAddRow(rowIndex, rowData) {
    const weaponId = rowData._weaponId;
    const nextConfigId = this.dataManager.getNextConfigId(weaponId);

    const bestBarrelIndex = this.dataManager.findBestBarrelIndex(weaponId);

    const newConfig = {
      id: nextConfigId,
      barrelId: bestBarrelIndex >= 0 ? bestBarrelIndex : -1,
      muzzleId: 0,
      muzzle: '无',
      buildCode: '',
      price: 0,
      distance: [],
      hitRate: [],
      bullet: '',
      enabled: true  // ⭐ 新增配置默认启用
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
  // 6. 子弹表格
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
  // 7. 价格配置读取（供柱状图使用）
  // ============================================================

  /**
   * 获取所有启用的价格配置（展开为独立条目）
   * 供柱状图按价格配置维度计算 TTK
   * 
   * @param {Array} weapons - 武器数据数组（可选，不传则从 DataManager 获取）
   * @param {Object} params - 页面参数（包含 distance 等）
   * @returns {Array} 启用的价格配置列表
   */
  getEnabledPriceConfigs(weapons, params) {
    // 优先从 priceTableInstance 获取最新数据
    let priceRows = [];
    if (this.priceTableInstance && this.priceTableInstance._data) {
      priceRows = this.priceTableInstance._data;
    } else if (this.priceTableInstance && this.priceTableInstance._currentData) {
      priceRows = this.priceTableInstance._currentData;
    } else {
      // 降级：从 DataManager 获取
      priceRows = this.dataManager.getPriceRows();
    }
    
    // 使用 PriceTable.getEnabledData() 过滤启用的配置
    const enabledRows = PriceTable.getEnabledData(priceRows);
    
    if (!enabledRows || enabledRows.length === 0) {
      console.log('📋 没有启用的价格配置');
      return [];
    }
    
    // 如果没有传入 weapons，从 DataManager 获取
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
      
      // ---- 1. 查找枪管 ----
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
      
      // ---- 2. 查找枪口 ----
      let muzzleId = 0;
      if (row.muzzle && row.muzzle !== '无') {
        const idx = muzzleOptions.indexOf(row.muzzle);
        if (idx >= 0) muzzleId = idx;
      }
      
      // ---- 3. 构建命中率映射 ----
      const hitRateMap = (row._distance || []).map((d, i) => ({
        distance: d,
        rate: row._hitRate[i] !== undefined ? row._hitRate[i] : 0.85
      }));
      
      // ---- 4. 计算当前距离的命中率 ----
      let hitRate = params?.hitRate || 0.85;
      if (hitRateMap.length > 0) {
        hitRate = this.dataManager.getHitRateFromMap(
          hitRateMap, 
          params?.distance || 30, 
          0.85
        );
      }
      
      // ---- 5. 生成显示名称：武器名 + 序号（直接使用 configId） ----
      const displayName = `${weapon.name} ${row.configId || ''}`;
      
      // ---- 6. 组装配置对象 ----
      configs.push({
        weapon: weapon,
        weaponId: weaponId,
        configId: row._rawConfigId || row._configId || '#1',
        displayName: displayName.trim(),
        configIndex: row._rowIndex,
        barrel: barrel,
        barrelIndex: barrelIndex,
        barrelName: row.barrel || '无',
        muzzleId: muzzleId,
        muzzleName: row.muzzle || '无',
        bulletId: row._bulletId || null,
        bulletDisplay: row.bulletDisplay || '-',
        hitRateMap: hitRateMap,
        hitRate: hitRate,
        buildCode: row.buildCode || '-',
        price: row.price || 0,
        _rawRow: row
      });
    }
    
    console.log(`📋 启用的价格配置: ${configs.length} 个`);
    if (configs.length > 0) {
      console.log('  配置列表:', configs.map(c => c.displayName).join(', '));
    }
    
    return configs;
  }

  // ============================================================
  // 8. 延迟刷新
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
  // 9. 控制按钮事件
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
  }

  // ============================================================
  // 10. 导入/导出事件
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
      this.dataManager.exportToFile();
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
  // 11. 公共方法
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
    this.weaponTableInstance = null;
    this.priceTableInstance = null;
    this.bulletTableInstance = null;
  }
}