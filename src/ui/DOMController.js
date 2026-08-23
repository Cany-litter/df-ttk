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
 */
import { getDataManager } from '../core/DataManager.js';
import WeaponTable from './WeaponTable.js';
import PriceTable from './PriceTable.js';
import BulletTable from './BulletTable.js';

export default class DOMController {
  constructor() {
    this.dataManager = getDataManager();
    this.currentTab = 'weapon';
    this.weaponTableInstance = null;
    this.priceTableInstance = null;
    this.bulletTableInstance = null;
    // 🔥 枪口选项从 DataManager 获取
    this.muzzleOptions = this.dataManager.getMuzzleNames();
    
    this.weaponAttachments = {};
    this.weaponPrecisions = {};
    this.isRefreshing = false;
    this._refreshTimer = null;
  }

  // ============================================================
  // 1. 初始化
  // ============================================================

  /**
   * 初始化 DOM 控制器
   * @param {Object} options - 配置选项
   * @param {Function} options.onBarrelEdit - 打开枪管编辑器回调
   */
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

  /**
   * 🔥 解析距离-命中率映射字符串
   * @param {string} str - 格式 "30:0.85,50:0.8,100:0.7"
   * @returns {Array} [{ distance, rate }, ...] 或空数组
   */
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

  /**
   * 读取页面参数
   * @returns {Object} 页面参数对象
   */
  readPageParams() {
    const toNum = (id) => {
      const el = document.getElementById(id);
      return el ? Number(el.value) || 0 : 0;
    };
    
    const toFloat = (id) => {
      const el = document.getElementById(id);
      return el ? Number(el.value) || 0 : 0;
    };
    
    // 🔥 获取全局命中率映射
    const hitRateInput = document.getElementById('hitRate');
    const hitRateRaw = hitRateInput ? hitRateInput.value : '30:0.85,50:0.8,100:0.7,150:0.6';
    const hitRateMap = this.parseHitRateMap(hitRateRaw);
    
    // 🔥 获取当前距离下的命中率（用于兼容旧代码）
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
      // 🔥 全局命中率映射
      hitRateMap: hitRateMap,
      hitRate: hitRate,  // 兼容旧代码：当前距离下的命中率
      hitRateRaw: hitRateRaw,  // 原始输入字符串
      triggerDelayEnable: document.getElementById('triggerDelayEnable')?.checked ?? true,
      hitProb: {
        head: toFloat('pHead') || 0.18,
        chest: toFloat('pChest') || 0.30,
        stomach: toFloat('pStomach') || 0.22,
        limbs: toFloat('pLimbs') || 0.30
      }
    };
  }

  /**
   * 🔥 从命中率映射中获取指定距离的命中率
   * @param {Array} hitRateMap - [{ distance, rate }, ...]
   * @param {number} distance - 当前距离
   * @param {number} fallback - 默认值
   * @returns {number} 命中率
   */
  getHitRateFromMap(hitRateMap, distance, fallback = 0.85) {
    if (!hitRateMap || hitRateMap.length === 0) return fallback;
    
    // 按距离排序
    const sorted = [...hitRateMap].sort((a, b) => a.distance - b.distance);
    
    // 查找第一个 distance >= 当前距离 的条目
    for (const entry of sorted) {
      if (distance <= entry.distance) {
        return entry.rate;
      }
    }
    
    // 如果超出最大距离，使用最后一个
    return sorted[sorted.length - 1]?.rate || fallback;
  }

  /**
   * 获取武器的子弹类型
   * @param {number} weaponIndex - 武器索引
   * @returns {string|null} 子弹类型
   */
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

  /**
   * 设置 Tab 切换事件
   */
  setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });
  }

  /**
   * 切换 Tab
   * @param {string} tab - tab 名称 (weapon / price / bullet)
   */
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

  /**
   * 初始化武器表格
   * @param {Function} onBarrelEdit - 打开枪管编辑器回调
   */
  initWeaponTable(onBarrelEdit) {
    const container = document.getElementById('tab-weapon');
    if (!container) {
      console.warn('武器表格容器 #tab-weapon 不存在');
      return;
    }

    const weapons = this.dataManager.getWeapons();
    
    // 🔥 初始化武器附件配置（使用最佳枪管）
    this.initWeaponAttachments(weapons);
    
    const rowData = this.buildWeaponRows(weapons);

    // 🔥 修复：getBarrelOptions 始终返回包含 '无' 的选项列表
    // 格式：['无', '枪管1', '枪管2', ...]
    const getBarrelOptions = (row) => {
      const weapon = this.dataManager.getWeaponById(row.id);
      if (!weapon || !Array.isArray(weapon.barrels) || weapon.barrels.length === 0) {
        return ['无'];
      }
      const options = weapon.barrels.map(b => b.name || '无');
      // 确保 '无' 在第一位
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

  /**
   * 🔥 初始化武器附件配置（使用最佳枪管）
   * @param {Array} weapons - 武器数据数组
   */
  initWeaponAttachments(weapons) {
    weapons.forEach(weapon => {
      // 如果已经有选择（用户之前选过），保留
      // 否则使用最佳枪管
      const existing = this.weaponAttachments[weapon.id];
      if (existing && existing.barrelId !== undefined && existing.barrelId !== -1) {
        // 已有选择，保留
        return;
      }
      
      // 🔥 查找射程最长的枪管
      const bestBarrelIndex = this.dataManager.findBestBarrelIndex(weapon.id);
      
      this.weaponAttachments[weapon.id] = {
        barrelId: bestBarrelIndex,
        muzzleId: 0,
        precision: 0.09
      };
      this.weaponPrecisions[weapon.id] = 0.09;
      
      if (weapon.id === 2 && bestBarrelIndex >= 0) {
        const barrelName = weapon.barrels[bestBarrelIndex]?.name || '未知';
        console.log(`🔧 武器 ${weapon.name} 默认使用最佳枪管: ${barrelName} (索引: ${bestBarrelIndex})`);
      }

    });
  }

  /**
   * 构建武器行数据
   * @param {Array} weapons - 武器数据
   * @returns {Array} 行数据
   */
  buildWeaponRows(weapons) {
    return weapons.map(weapon => {
      const attachment = this.weaponAttachments[weapon.id] || {
        barrelId: -1,
        muzzleId: 0,
        precision: 0.09
      };
      // 🔥 确保附件值类型正确
      const cleanAttachment = {
        barrelId: typeof attachment.barrelId === 'string' ? parseInt(attachment.barrelId) : attachment.barrelId,
        muzzleId: typeof attachment.muzzleId === 'string' ? parseInt(attachment.muzzleId) : attachment.muzzleId,
        precision: typeof attachment.precision === 'string' ? parseFloat(attachment.precision) : attachment.precision
      };
      return WeaponTable.buildRowData(weapon, cleanAttachment, this.muzzleOptions);
    });
  }

  /**
   * 刷新武器表格
   */
  refreshWeaponTable() {
    if (this.isRefreshing) return;
    this.isRefreshing = true;

    try {
      const container = document.getElementById('tab-weapon');
      if (!container) return;

      const weapons = this.dataManager.getWeapons();
      const rowData = this.buildWeaponRows(weapons);

      // 🔥 修复：getBarrelOptions 始终返回包含 '无' 的选项列表
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

  /**
   * 处理武器单元格变更
   */
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

  /**
   * 处理武器附件变更（枪管/枪口选择）
   */
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

    // 🔥 确保值是数字
    const numValue = typeof value === 'string' ? parseInt(value) : value;
    
    if (type === 'barrel') {
      this.weaponAttachments[weaponId].barrelId = isNaN(numValue) ? -1 : numValue;
      console.log(`🔧 武器 ${weaponId} (${row.name}) 枪管变更为: ${numValue}`);
    } else if (type === 'muzzle') {
      this.weaponAttachments[weaponId].muzzleId = isNaN(numValue) ? 0 : numValue;
      console.log(`🔧 武器 ${weaponId} (${row.name}) 枪口变更为: ${numValue}`);
    }

    // 🔥 触发刷新，重新计算当前值
    this.scheduleRefresh('weapon');
  }

  /**
   * 处理武器精校变更
   */
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

  /**
   * 处理添加副本
   */
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

  /**
   * 处理删除副本
   */
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

  /**
   * 初始化价格表格
   */
  initPriceTable() {
    const container = document.getElementById('tab-price');
    if (!container) {
      console.warn('价格表格容器 #tab-price 不存在');
      return;
    }

    // 🔥 获取价格行数据并构建行数据
    const priceRows = this.dataManager.getPriceRows();
    const rowData = this.buildPriceRows(priceRows);

    // 🔥 定义 getBarrelOptions 函数
    const getBarrelOptions = (row) => {
      const weaponId = row._weaponId;
      const weapon = this.dataManager.getWeaponById(weaponId);
      if (!weapon) {
        return ['无'];
      }
      
      if (!Array.isArray(weapon.barrels) || weapon.barrels.length === 0) {
        return ['无'];
      }
      
      const options = weapon.barrels.map(b => b.name || '无');
      return ['无', ...options];
    };

    // 🔥 定义 getBulletOptions 函数
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
      }
    });

    container.innerHTML = this.priceTableInstance.getHTML();
    this.priceTableInstance.bindEdit();

    console.log(`✅ 价格表格初始化完成，${rowData.length} 条配置`);
  }

  /**
   * 🔥 构建价格行数据（自动修复 barrelId 和 barrel 名称的同步）
   * @param {Array} priceRows - DataManager.getPriceRows() 返回的数据
   * @returns {Array} 行数据
   */
  buildPriceRows(priceRows) {
    return priceRows.map(row => {
      // 🔥 确保 barrelId 和 barrel 名称同步
      let barrelId = row.barrelId;
      let barrel = row.barrel;
      
      // 如果 barrelId 无效（-1 或 undefined），尝试从名称查找
      if (barrelId === -1 || barrelId === undefined || barrelId === null) {
        if (barrel && barrel !== '无') {
          // 尝试从武器数据中查找名称对应的 ID
          const foundIndex = this.dataManager.findBarrelIdByName(row._weaponId, barrel);
          if (foundIndex >= 0) {
            barrelId = foundIndex;
            console.log(`🔧 buildPriceRows: ${row.weaponName} 从名称 "${barrel}" 修复 barrelId = ${barrelId}`);
          }
        }
      }
      
      // 如果还是无效，自动使用最佳枪管
      if (barrelId === -1 || barrelId === undefined || barrelId === null) {
        const bestIndex = this.dataManager.findBestBarrelIndex(row._weaponId);
        if (bestIndex >= 0) {
          barrelId = bestIndex;
          const weapon = this.dataManager.getWeaponById(row._weaponId);
          if (weapon && weapon.barrels && weapon.barrels[bestIndex]) {
            barrel = weapon.barrels[bestIndex].name || '无';
            console.log(`🔧 buildPriceRows: ${row.weaponName} 自动使用最佳枪管: ${barrel} (索引: ${bestIndex})`);
          }
        } else {
          barrel = '无';
        }
      }
      
      // 如果 barrelId 有效但 barrel 名称不匹配，从武器数据中获取名称
      if (barrelId >= 0 && (!barrel || barrel === '无')) {
        const weapon = this.dataManager.getWeaponById(row._weaponId);
        if (weapon && weapon.barrels && weapon.barrels[barrelId]) {
          barrel = weapon.barrels[barrelId].name || '无';
        }
      }
      
      const data = PriceTable.buildRowData({
        ...row,
        barrelId: barrelId,
        barrel: barrel
      });
      
      // 🔥 修复：根据 muzzleId 获取显示名称
      if (row.muzzleId !== undefined && row.muzzleId >= 0 && this.muzzleOptions[row.muzzleId]) {
        data.muzzle = this.muzzleOptions[row.muzzleId];
      }
      // 🔥 如果 row 中有 muzzle 字段，优先使用
      if (row.muzzle && row.muzzle !== '无') {
        data.muzzle = row.muzzle;
      }
      return data;
    });
  }

  /**
   * 刷新价格表格
   */
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

      // 🔥 定义 getBarrelOptions 函数
      const getBarrelOptions = (row) => {
        const weaponId = row._weaponId;
        const weapon = this.dataManager.getWeaponById(weaponId);
        if (!weapon) {
          return ['无'];
        }
        
        if (!Array.isArray(weapon.barrels) || weapon.barrels.length === 0) {
          return ['无'];
        }
        
        const options = weapon.barrels.map(b => b.name || '无');
        return ['无', ...options];
      };

      const getBulletOptions = (row) => {
        const weapon = this.dataManager.getWeaponById(row._weaponId);
        if (!weapon) return [];
        const bullets = this.dataManager.getBulletsByCaliber(weapon.allowedBullet);
        return bullets.map(b => `${b.caliber} Lv.${b.level}`);
      };

      // 🔥 调用 PriceTable.update 更新 DOM，并接收处理后的数据
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
        }
      });

      // 🔥 使用 PriceTable.update 返回的处理后数据更新实例缓存
      if (this.priceTableInstance && processedData) {
        // 直接更新内部数据，不触发重新渲染
        this.priceTableInstance._data = processedData;
        // 同时更新当前数据引用
        this.priceTableInstance._currentData = processedData;
      }

    } catch (error) {
      console.error('刷新价格表格失败:', error);
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * 处理价格单元格变更
   */
  handlePriceCellChange(rowIndex, key, value, row) {
    console.log(`🔍 [价格表格] handlePriceCellChange: 行 ${rowIndex}, key: ${key}, value: "${value}"`);
    console.log(`  - 武器: ${row.weaponName}, _weaponId: ${row._weaponId}, _configId: ${row._configId}`);
    
    const weaponId = row._weaponId;
    const configId = row._configId;

    if (key === 'barrel') {
      // 🔥 查找枪管 ID
      const barrelId = this.dataManager.findBarrelIdByName(weaponId, value);
      console.log(`  - findBarrelIdByName(${weaponId}, "${value}") = ${barrelId}`);
      
      if (barrelId >= 0) {
        const result = this.dataManager.updatePriceConfig(weaponId, configId, { barrelId });
        console.log(`  - updatePriceConfig 结果: ${result ? '✅ 成功' : '❌ 失败'}`);
        if (result) {
          console.log(`  - ✅ 枪管已更新: ${value} (barrelId: ${barrelId})`);
        }
      } else {
        console.log(`  - ⚠️ 未找到枪管 "${value}"，尝试直接保存名称`);
        // 如果找不到 barrelId，尝试通过名称匹配
        const weapon = this.dataManager.getWeaponById(weaponId);
        if (weapon && weapon.barrels) {
          const idx = weapon.barrels.findIndex(b => b.name === value);
          if (idx >= 0) {
            const result = this.dataManager.updatePriceConfig(weaponId, configId, { barrelId: idx });
            console.log(`  - 通过名称匹配找到索引 ${idx}, 更新结果: ${result ? '✅ 成功' : '❌ 失败'}`);
          } else {
            console.log(`  - ❌ 武器 ${weapon?.name} 中没有名为 "${value}" 的枪管`);
          }
        }
      }
    } else if (key === 'muzzle') {
      // 🔥 修复：查找枪口 ID
      const muzzleId = this.muzzleOptions.indexOf(value);
      console.log(`  - muzzleId: ${muzzleId}`);
      
      if (muzzleId >= 0) {
        // 🔥 同时更新 muzzleId 和 muzzle 显示名称
        const result = this.dataManager.updatePriceConfig(weaponId, configId, { 
          muzzleId: muzzleId,
          muzzle: value  // 🔥 直接保存显示名称，方便读取
        });
        console.log(`  - updatePriceConfig 结果: ${result ? '✅ 成功' : '❌ 失败'}`);
        if (result) {
          console.log(`  - ✅ 枪口已更新: ${value} (muzzleId: ${muzzleId})`);
        }
      } else {
        console.log(`  - ⚠️ 未找到枪口 "${value}"`);
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

  /**
   * 处理价格新增行
   */
  handlePriceAddRow(rowIndex, rowData) {
    const weaponId = rowData._weaponId;
    const nextConfigId = this.dataManager.getNextConfigId(weaponId);

    // 🔥 新增配置时自动使用最佳枪管
    const bestBarrelIndex = this.dataManager.findBestBarrelIndex(weaponId);
    const weapon = this.dataManager.getWeaponById(weaponId);
    const bestBarrelName = (weapon && weapon.barrels && weapon.barrels[bestBarrelIndex]) 
      ? weapon.barrels[bestBarrelIndex].name 
      : '无';

    const newConfig = {
      id: nextConfigId,
      barrelId: bestBarrelIndex >= 0 ? bestBarrelIndex : -1,
      muzzleId: 0,
      muzzle: '无',
      buildCode: '',
      price: 0,
      distance: [],
      hitRate: [],
      bullet: ''
    };

    console.log(`🔧 新增价格配置 ${weapon?.name || '未知武器'} 使用最佳枪管: ${bestBarrelName} (索引: ${bestBarrelIndex})`);

    this.dataManager.addPriceConfig(weaponId, newConfig);
    this.scheduleRefresh('price');
  }

  /**
   * 处理价格删除行
   */
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

  /**
   * 初始化子弹表格
   */
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

  /**
   * 刷新子弹表格
   */
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

  /**
   * 处理子弹单元格变更
   */
  handleBulletCellChange(rowIndex, key, value, row) {
    const bulletId = row._bulletId;
    
    if (key === 'base' || key === 'armorMult' || key === 'pen' || key === 'price') {
      this.dataManager.updateBullet(bulletId, { [key]: parseFloat(value) || 0 });
    }

    this.scheduleRefresh('bullet');
  }

  /**
   * 处理子弹新增行
   */
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

  /**
   * 处理子弹删除行
   */
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

  /**
   * 获取口径选项列表
   */
  getCaliberOptions() {
    const calibers = new Set();
    this.dataManager.getBullets().forEach(b => {
      if (b.caliber) calibers.add(b.caliber);
    });
    return Array.from(calibers).sort();
  }

  // ============================================================
  // 7. 延迟刷新
  // ============================================================

  /**
   * 延迟刷新表格（防抖）
   * @param {string} tab - 要刷新的 tab
   */
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
  // 8. 控制按钮事件
  // ============================================================

  /**
   * 绑定控制按钮事件（计算 TTK、距离折线图）
   */
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
  // 9. 导入/导出事件
  // ============================================================

  /**
   * 绑定导入/导出事件
   */
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

  /**
   * 导出数据
   */
  exportData() {
    try {
      this.dataManager.exportToFile();
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败: ' + error.message);
    }
  }

  /**
   * 导入数据
   */
  importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        await this.dataManager.importFromFile(file);
        // 🔥 重置附件配置
        this.weaponAttachments = {};
        this.weaponPrecisions = {};
        // 🔥 重新加载枪口选项
        this.muzzleOptions = this.dataManager.getMuzzleNames();
        // 🔥 重新初始化武器附件（使用最佳枪管）
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

  /**
   * 重置数据
   */
  resetData() {
    if (!confirm('⚠️ 确定要重置所有数据为默认值吗？\n（当前修改将丢失！）')) {
      return;
    }

    try {
      this.dataManager.resetToOriginal();
      this.weaponAttachments = {};
      this.weaponPrecisions = {};
      // 🔥 重新加载枪口选项
      this.muzzleOptions = this.dataManager.getMuzzleNames();
      // 🔥 重新初始化武器附件（使用最佳枪管）
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
  // 10. 公共方法
  // ============================================================

  /**
   * 获取当前 Tab
   * @returns {string} 当前 Tab 名称
   */
  getCurrentTab() {
    return this.currentTab;
  }

  /**
   * 获取武器附件配置
   * @param {number} weaponId - 武器 ID
   * @returns {Object} 附件配置
   */
  getWeaponAttachment(weaponId) {
    return this.weaponAttachments[weaponId] || { barrelId: -1, muzzleId: 0, precision: 0.09 };
  }

  /**
   * 获取武器精校值
   * @param {number} weaponId - 武器 ID
   * @returns {number} 精校值
   */
  getWeaponPrecision(weaponId) {
    return this.weaponPrecisions[weaponId] || 0.09;
  }

  /**
   * 刷新所有表格
   */
  refreshAll() {
    this.refreshWeaponTable();
    this.refreshPriceTable();
    this.refreshBulletTable();
  }

  /**
   * 销毁控制器
   */
  destroy() {
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
    this.weaponTableInstance = null;
    this.priceTableInstance = null;
    this.bulletTableInstance = null;
    console.log('DOMController 已销毁');
  }
}