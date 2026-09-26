// src/core/DataManager.js
/**
 * 数据管理器
 * 负责数据的加载、保存、导入、导出和查询
 *
 * 数据流向：
 * 1. 从 data.json 加载原始数据
 * 2. 数据存储在 this.data 中
 * 3. 导出时序列化 this.data（排序后导出，不影响内存数据）
 * 4. 导入时替换 this.data（或合并）
 * 5. 重置时恢复 this.originalData
 *
 * 修改追踪：
 * - modifiedWeaponIds: 记录被修改的武器 ID
 * - 用于增量计算，只重新计算被修改的武器
 *
 * 导出排序：
 * - weapons: 按类型 → 名称 排序
 * - bullets: 按口径 → 等级 → 默认 排序
 * - prices: 按类型 → 武器名称 → 配置序号 排序
 * - armors: 按 type → level(desc) → value(desc) 排序
 * - otherItems: 按 category → 名称 排序
 *
 * ⭐ 子弹 ID 规范（v2）：
 * - 格式：${caliber}#${序号}
 * - 序号：口径内递增，按 level 升序 + name 字典序分配
 * - 稳定：序号一旦分配，不随 level/name 变化
 * - 禁止修改 caliber / id
 *
 * ⭐ 参数导出/导入（v3）：
 * - exportToJSON / exportToFile 支持 extra 参数
 * - importFromJSON 返回 { data, params, equipState }
 *
 * ⭐ 精校与枪管一致性（v4）：
 * - 无枪管（barrelId === -1）时，精校（precision）必须为 0
 *
 * ⭐ 其他物品（v5）：
 * - data.json 顶层新增 otherItems 数组
 *
 * ⭐ 装备状态（v6 → v7）：
 * - v6：extra.selectedEquips（数组）
 * - v7：extra.equipState（对象 { mode, calcEquip, scoreEquips }）
 *
 * ⭐ v7.1 导出清理废弃字段：
 * - 删除顶层 selectedEquips
 * - 删除 params 里的 armorLevel / armorValue / helmetLevel / helmetValue
 *
 * ⭐ v7.2 导出综合评分（仅导出，不导入）：
 * - exportToJSON / exportToFile 支持 extra.weaponScores + extra.havocCosts
 * - 按 score 升序
 * - 导入时不恢复评分
 *
 * ⭐ v7.3 增量导入（合并模式）：
 * - importFromJSON(jsonStr, options) 支持 options.mode
 *   - 'overwrite'（默认）：原有全量覆盖
 *   - 'merge'：增量合并
 * - 新增 clearImportMarks()：清除所有 `_isImported` 标记
 * - 导出时自动剔除 `_isImported` 字段
 *
 * ⭐ v7.5 支持编辑配置 ID：
 * - 新增 updateConfigId(weaponId, oldConfigId, newConfigId)
 * - 约束：新 ID 必须是 "#数字" 格式，不能重复
 *
 * ⭐ v8 改动（全问题修复）：
 * - 问题 1：改武器属性时标记"脏武器"，配合 App.vue 的"跳缓存"方案
 * - 问题 2 / 12：updateConfigId 成功后调用 _invalidateConfigCache
 * - 问题 16：_buildWeaponScoresForExport 里 Infinity → null
 *
 * ⭐ v9 改动（死代码清理）：
 * - 删除 getEnabledBullets / getDefaultBullet / getBulletRows
 * - 删除 getEnabledArmors / getMuzzleNames
 *
 * ⭐ 已删除的旧 API：
 * - setCacheManager / getCacheManager
 * - getConfigCache / saveConfigCache
 * - clearWeaponCache / clearAllCache / getCacheStats
 * - setTtkCacheManager / getTtkCacheManager
 * - getTtkCache / setTtkCache / getTtkCacheStats
 */

// ============================================================
// 简化版性能监控
// ============================================================
const perf = {
  marks: {},
  startTime: performance.now(),
  mark(name, description = '') {
    this.marks[name] = {
      time: performance.now(),
      description
    }
  }
};

// ============================================================
// 参数中需要清理的废弃字段
// ============================================================
const DEPRECATED_PARAM_KEYS = [
  'armorLevel',
  'armorValue',
  'helmetLevel',
  'helmetValue',
]

export class DataManager {
  constructor() {
    this.data = {
      weapons: [],
      bullets: [],
      prices: [],
      armors: [],
      otherItems: []    // ⭐ v5：其他物品
    };
    this.originalData = null;
    this.isLoaded = false;

    // 枪口数据
    this.muzzles = [
      { id: 0, name: '无', mult: 0 },
      { id: 1, name: '死寂', mult: 0.24 },
      { id: 2, name: '先进/轻语/勇火', mult: 0.18 },
      { id: 3, name: '冲锋枪回声消音器', mult: 0.30 }
    ];
    this.originalMuzzles = null;

    // 修改追踪
    this.modifiedWeaponIds = new Set();

    // ⭐ v8：缓存失效回调（可选）
    //   App.vue 可以注入一个函数，DataManager 在需要清缓存时调用
    //   如果没注入，就只做标记，由调用方自行处理
    this.onCacheInvalidate = null;
  }

  // ============================================================
  // 1. 数据加载
  // ============================================================

  /**
   * ⭐ 从 URL 加载数据
   *
   * ⭐ v7：返回值 { data, params, equipState }
   *
   * @param {string} url
   * @returns {Promise<{ data: Object, params: Object|null, equipState: Object|null }>}
   */
  async loadFromJSON(url = './data.json') {
    perf.mark('dataLoadStart', '数据加载开始');

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const rawData = await response.json();

      if (!this.validateData(rawData)) {
        throw new Error('数据格式无效，请检查 data.json 文件');
      }

      // ⭐ 提取 params（在 normalizeData 之前）
      let params = null;
      if (rawData.params && typeof rawData.params === 'object') {
        params = this._cleanParams(rawData.params);
      }

      // ⭐ v7：提取 equipState
      let equipState = null;
      if (rawData.equipState && typeof rawData.equipState === 'object') {
        equipState = this._validateEquipState(rawData.equipState);
      } else if (Array.isArray(rawData.selectedEquips)) {
        equipState = this._validateEquipState({ scoreEquips: rawData.selectedEquips });
        console.log('⚠️ 检测到老格式 selectedEquips，已兼容处理为 equipState');
      }

      this.data = this.normalizeData(rawData);
      this.originalData = JSON.parse(JSON.stringify(this.data));
      this.originalMuzzles = JSON.parse(JSON.stringify(this.muzzles));
      this.isLoaded = true;

      this.modifiedWeaponIds.clear();

      perf.mark('dataLoadDone', '数据加载完成');
      console.log(
        `✅ DataManager: 加载了 ${this.data.weapons.length} 把武器, ` +
        `${this.data.bullets.length} 种子弹, ` +
        `${this.data.prices.length} 条价格配置, ` +
        `${this.data.armors.length} 条护甲数据, ` +
        `${this.data.otherItems.length} 条其他物品` +
        (params ? `, 含参数快照` : '') +
        (equipState ? `, 含装备状态` : '')
      );

      return { data: this.data, params, equipState };

    } catch (error) {
      console.error('❌ DataManager: 加载数据失败:', error);
      throw error;
    }
  }

  /**
   * ⭐ 清理 params 里的废弃字段
   */
  _cleanParams(params) {
    const cleaned = JSON.parse(JSON.stringify(params));
    for (const key of DEPRECATED_PARAM_KEYS) {
      if (cleaned[key] !== undefined) {
        delete cleaned[key];
      }
    }
    return cleaned;
  }

  validateData(data) {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.weapons) || data.weapons.length === 0) return false;
    if (!Array.isArray(data.bullets) || data.bullets.length === 0) return false;
    if (!Array.isArray(data.prices)) return false;

    for (const weapon of data.weapons) {
      if (!weapon.id || !weapon.name || !weapon.allowedBullet) {
        console.warn('⚠️ 武器数据缺失必要字段:', weapon);
        return false;
      }
    }

    return true;
  }

  /**
   * 规范化数据
   */
  normalizeData(data) {
    const normalized = JSON.parse(JSON.stringify(data));

    // ---------- 1. 武器 ranges 规范化 ----------
    if (Array.isArray(normalized.weapons)) {
      normalized.weapons.forEach(weapon => {
        if (Array.isArray(weapon.ranges)) {
          weapon.ranges = weapon.ranges.map(r => {
            if (r === 'Infinity' || r === '∞' || r === null || r === undefined) {
              return Infinity;
            }
            return Number(r);
          });
        }
        if (Array.isArray(weapon.barrels)) {
          weapon.barrels.forEach((barrel) => {
            if (Array.isArray(barrel.ranges)) {
              barrel.ranges = barrel.ranges.map(r => {
                if (r === 'Infinity' || r === '∞' || r === null || r === undefined) {
                  return Infinity;
                }
                return Number(r);
              });
            }
          });
        }
      });
    }

    // ---------- 2. 子弹规范化 ----------
    if (Array.isArray(normalized.bullets)) {
      normalized.bullets.forEach(bullet => {
        if (typeof bullet.level === 'string' && /^\d+$/.test(bullet.level)) {
          bullet.level = parseInt(bullet.level, 10);
        }
        if (bullet.name === undefined || bullet.name === null) {
          bullet.name = '';
        }
        if (!bullet.partMult || typeof bullet.partMult !== 'object') {
          bullet.partMult = { head: 1, chest: 1, stomach: 1, limbs: 1 };
        } else {
          const pm = bullet.partMult;
          const fallback = { head: 1, chest: 1, stomach: 1, limbs: 1 };
          for (const key of ['head', 'chest', 'stomach', 'limbs']) {
            if (typeof pm[key] !== 'number' || !isFinite(pm[key])) {
              pm[key] = fallback[key];
            }
          }
        }
        if (bullet.isDefault === undefined) bullet.isDefault = false;
        if (bullet.enabled === undefined) bullet.enabled = true;

        if (bullet.default !== undefined) {
          if (bullet.default === true) bullet.isDefault = true;
          delete bullet.default;
        }
        if (bullet.base !== undefined) delete bullet.base;
        if (bullet.stMult !== undefined) delete bullet.stMult;
      });

      this._enforceDefaultUniqueness(normalized.bullets);
    }

    // ---------- 3. 配置规范化 ----------
    if (Array.isArray(normalized.prices)) {
      normalized.prices.forEach(price => {
        if (Array.isArray(price.configs)) {
          price.configs.forEach(config => {
            if (typeof config.precision !== 'number' || isNaN(config.precision)) {
              config.precision = 0.09;
            }
            if (typeof config.aimSpeed !== 'number' || isNaN(config.aimSpeed) || config.aimSpeed < 0) {
              config.aimSpeed = 0;
            }
            if (config.enabled === undefined) {
              config.enabled = true;
            }
            if (config.cache !== undefined) {
              delete config.cache;
            }

            const barrelId = (config.barrelId !== undefined) ? config.barrelId : -1;
            if (barrelId === -1 && config.precision !== 0) {
              config.precision = 0;
            }
          });
        }
      });
    }

    // ---------- 4. 护甲 armors 规范化 ----------
    if (!Array.isArray(normalized.armors)) {
      normalized.armors = [];
    } else {
      normalized.armors.forEach(armor => {
        if (!armor.type) armor.type = 'armor';
        if (typeof armor.level === 'string') {
          armor.level = parseInt(armor.level, 10) || 1;
        }
        if (typeof armor.value === 'string') {
          armor.value = parseFloat(armor.value) || 0;
        }
        if (typeof armor.price === 'string') {
          armor.price = parseFloat(armor.price) || 0;
        }
        if (armor.enabled === undefined) armor.enabled = true;
      });
    }

    // ---------- 5. 其他物品 otherItems 规范化 ----------
    if (!Array.isArray(normalized.otherItems)) {
      normalized.otherItems = [];
    } else {
      normalized.otherItems.forEach((item, idx) => {
        if (!item.id) item.id = `other_${Date.now()}_${idx}`;
        if (item.name === undefined || item.name === null) item.name = '';
        if (typeof item.category !== 'string' || item.category.trim() === '') {
          item.category = '其他';
        }
        if (typeof item.price === 'string') {
          item.price = parseFloat(item.price) || 0;
        }
        if (typeof item.price !== 'number' || !isFinite(item.price) || item.price < 0) {
          item.price = 0;
        }
        if (item.description === undefined || item.description === null) {
          item.description = '';
        }
        if (item.enabled === undefined) item.enabled = true;
      });
    }

    // ---------- 6. 删除旧 ttkCache 字段 ----------
    if (normalized.ttkCache !== undefined) {
      delete normalized.ttkCache;
    }

    return normalized;
  }

  _enforceDefaultUniqueness(bullets) {
    if (!Array.isArray(bullets)) return;

    const groups = new Map();
    for (const bullet of bullets) {
      const key = `${bullet.caliber}|${bullet.level}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(bullet);
    }

    let fixedCount = 0;

    for (const [key, group] of groups.entries()) {
      if (group.length <= 1) {
        if (group[0] && group[0].isDefault !== true) {
          group[0].isDefault = true;
        }
        continue;
      }

      group.sort((a, b) => {
        const idxA = this._extractIndexFromId(a.id);
        const idxB = this._extractIndexFromId(b.id);
        return idxA - idxB;
      });

      let firstDefault = group.find(b => b.isDefault === true);
      if (!firstDefault) {
        firstDefault = group[0];
        firstDefault.isDefault = true;
        fixedCount++;
      }

      for (const b of group) {
        if (b !== firstDefault && b.isDefault === true) {
          b.isDefault = false;
          fixedCount++;
        }
      }
    }

    if (fixedCount > 0) {
      console.warn(`⚠️ isDefault 唯一性校验：修正了 ${fixedCount} 颗子弹`);
    }
  }

  _extractIndexFromId(id) {
    const match = String(id || '').match(/#(\d+)$/);
    return match ? parseInt(match[1], 10) : 999999;
  }

  // ============================================================
  // 1.5. 装备状态校验 / 排序
  // ============================================================

  _isValidEquip(eq) {
    if (!eq || typeof eq !== 'object') return false;
    if (!eq.armorId || !eq.helmetId) return false;
    if (typeof eq.armorLevel !== 'number' || typeof eq.armorValue !== 'number') return false;
    if (typeof eq.helmetLevel !== 'number' || typeof eq.helmetValue !== 'number') return false;
    return true;
  }

  _normalizeEquip(eq) {
    return {
      armorId: eq.armorId,
      helmetId: eq.helmetId,
      armorName: eq.armorName || '',
      helmetName: eq.helmetName || '',
      armorLevel: eq.armorLevel,
      armorValue: eq.armorValue,
      helmetLevel: eq.helmetLevel,
      helmetValue: eq.helmetValue,
    };
  }

  _validateEquipState(equipState) {
    if (Array.isArray(equipState)) {
      return {
        mode: 'score',
        calcEquip: null,
        scoreEquips: this._validateEquipList(equipState),
      };
    }

    if (!equipState || typeof equipState !== 'object') {
      return { mode: 'calc', calcEquip: null, scoreEquips: [] };
    }

    const mode = (equipState.mode === 'score') ? 'score' : 'calc';

    let calcEquip = null;
    if (this._isValidEquip(equipState.calcEquip)) {
      calcEquip = this._normalizeEquip(equipState.calcEquip);
    }

    let scoreEquips = [];
    if (Array.isArray(equipState.scoreEquips)) {
      scoreEquips = this._validateEquipList(equipState.scoreEquips);
    }

    return { mode, calcEquip, scoreEquips };
  }

  _validateEquipList(list) {
    if (!Array.isArray(list)) return [];

    const seen = new Set();
    const result = [];

    for (const eq of list) {
      if (!this._isValidEquip(eq)) continue;

      const key = `${eq.armorId}|${eq.helmetId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      result.push(this._normalizeEquip(eq));
    }

    return result;
  }

  _sortEquipListForExport(equips) {
    if (!Array.isArray(equips) || equips.length === 0) return;

    equips.sort((a, b) => {
      if (b.armorLevel !== a.armorLevel) return b.armorLevel - a.armorLevel;
      if (b.helmetLevel !== a.helmetLevel) return b.helmetLevel - a.helmetLevel;
      if (b.armorValue !== a.armorValue) return b.armorValue - a.armorValue;
      return b.helmetValue - a.helmetValue;
    });
  }

  _sortEquipStateForExport(equipState) {
    if (!equipState || typeof equipState !== 'object') return;

    if (Array.isArray(equipState.scoreEquips)) {
      this._sortEquipListForExport(equipState.scoreEquips);
    }
  }

  // ============================================================
  // 2. 数据获取 - 武器
  // ============================================================

  getWeapons() {
    return this.data.weapons || [];
  }

  getWeaponById(id) {
    const targetId = typeof id === 'string' ? parseInt(id) : id;
    return this.data.weapons.find(w => w.id === targetId) || null;
  }

  // ============================================================
  // 3. 数据获取 - 子弹
  // ============================================================

  getBullets() {
    return this.data.bullets || [];
  }

  getBulletById(id) {
    return this.data.bullets.find(b => b.id === id) || null;
  }

  getBulletByCaliberAndLevel(caliber, level, includeDisabled = false) {
    let candidates = this.data.bullets.filter(b =>
      b.caliber === caliber && String(b.level) === String(level)
    );

    if (!includeDisabled) {
      candidates = candidates.filter(b => b.enabled !== false);
    }

    if (candidates.length === 0) return null;

    const defaultBullet = candidates.find(b => b.isDefault === true);
    if (defaultBullet) return defaultBullet;

    return candidates[0];
  }

  getBulletsByCaliber(caliber, includeDisabled = false) {
    let bullets = this.data.bullets.filter(b => b.caliber === caliber);
    if (!includeDisabled) {
      bullets = bullets.filter(b => b.enabled !== false);
    }
    return bullets;
  }

  getNextBulletId(caliber) {
    if (!caliber) return ''

    const sameCaliber = this.data.bullets.filter(b => b.caliber === caliber)
    if (sameCaliber.length === 0) {
      return `${caliber}#1`
    }

    let maxIndex = 0
    for (const b of sameCaliber) {
      const match = String(b.id).match(/#(\d+)$/)
      if (match) {
        const n = parseInt(match[1], 10)
        if (!isNaN(n) && n > maxIndex) maxIndex = n
      }
    }

    return `${caliber}#${maxIndex + 1}`
  }

  getBulletDisplay(bullet) {
    if (!bullet) return '-'
    const parts = [bullet.caliber, `Lv.${bullet.level}`]
    if (bullet.name) parts.push(bullet.name)
    return parts.join(' ')
  }

  // ============================================================
  // 3.5. 数据获取 - 护甲 / 头盔
  // ============================================================

  getArmors() {
    return this.data.armors || [];
  }

  getArmorsByType(type, includeDisabled = false) {
    let armors = (this.data.armors || []).filter(a => a.type === type);
    if (!includeDisabled) {
      armors = armors.filter(a => a.enabled !== false);
    }
    return armors;
  }

  getArmorById(id) {
    return (this.data.armors || []).find(a => a.id === id) || null;
  }

  addArmor(armorData) {
    if (!armorData || !armorData.id) {
      console.warn('⚠️ addArmor: 缺少 id');
      return false;
    }
    const existing = this.getArmorById(armorData.id);
    if (existing) {
      console.warn(`⚠️ 护甲 ${armorData.id} 已存在`);
      return false;
    }

    const armor = {
      id: armorData.id,
      type: armorData.type || 'armor',
      name: armorData.name || '未命名',
      level: armorData.level || 1,
      value: armorData.value || 0,
      price: armorData.price || 0,
      enabled: armorData.enabled !== false
    };

    if (!Array.isArray(this.data.armors)) {
      this.data.armors = [];
    }
    this.data.armors.push(armor);
    return true;
  }

  updateArmor(id, updates) {
    const armor = this.getArmorById(id);
    if (!armor) {
      console.warn(`⚠️ 未找到护甲 ${id}`);
      return false;
    }
    Object.assign(armor, updates);
    return true;
  }

  removeArmor(id) {
    const idx = (this.data.armors || []).findIndex(a => a.id === id);
    if (idx === -1) return false;
    this.data.armors.splice(idx, 1);
    return true;
  }

  setArmorsEnabledByType(type, enabled) {
    let count = 0;
    for (const armor of this.data.armors) {
      if (armor.type === type && armor.enabled !== enabled) {
        armor.enabled = enabled;
        count++;
      }
    }
    return count;
  }

  // ============================================================
  // 3.7. 数据获取 - 其他物品
  // ============================================================

  getOtherItems(includeDisabled = false) {
    let items = this.data.otherItems || [];
    if (!includeDisabled) {
      items = items.filter(item => item.enabled !== false);
    }
    return items;
  }

  getOtherItemsByCategory(category, includeDisabled = false) {
    let items = (this.data.otherItems || []).filter(item => item.category === category);
    if (!includeDisabled) {
      items = items.filter(item => item.enabled !== false);
    }
    return items;
  }

  getOtherItemById(id) {
    return (this.data.otherItems || []).find(item => item.id === id) || null;
  }

  getNextOtherItemId() {
    const items = this.data.otherItems || [];
    let maxIndex = 0;

    for (const item of items) {
      const match = String(item.id || '').match(/^other_(\d+)$/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n) && n > maxIndex) maxIndex = n;
      }
    }

    return `other_${maxIndex + 1}`;
  }

  addOtherItem(itemData) {
    if (!itemData) return false;

    if (!itemData.id) {
      itemData.id = this.getNextOtherItemId();
    }

    const existing = this.getOtherItemById(itemData.id);
    if (existing) {
      console.warn(`⚠️ 其他物品 ${itemData.id} 已存在`);
      return false;
    }

    const item = {
      id: itemData.id,
      name: itemData.name || '未命名',
      category: itemData.category || '其他',
      price: (typeof itemData.price === 'number' && isFinite(itemData.price) && itemData.price >= 0)
        ? itemData.price
        : 0,
      description: itemData.description || '',
      enabled: itemData.enabled !== false
    };

    if (!Array.isArray(this.data.otherItems)) {
      this.data.otherItems = [];
    }
    this.data.otherItems.push(item);
    return true;
  }

  updateOtherItem(id, updates) {
    const item = this.getOtherItemById(id);
    if (!item) {
      console.warn(`⚠️ 未找到其他物品 ${id}`);
      return false;
    }

    if (updates.id !== undefined && updates.id !== item.id) {
      console.warn(`⚠️ 禁止修改其他物品 ID`);
      delete updates.id;
    }

    if (updates.price !== undefined) {
      if (typeof updates.price === 'string') {
        updates.price = parseFloat(updates.price) || 0;
      }
      if (typeof updates.price !== 'number' || !isFinite(updates.price) || updates.price < 0) {
        delete updates.price;
      }
    }

    if (updates.category !== undefined && (typeof updates.category !== 'string' || updates.category.trim() === '')) {
      updates.category = '其他';
    }

    Object.assign(item, updates);
    return true;
  }

  removeOtherItem(id) {
    const idx = (this.data.otherItems || []).findIndex(item => item.id === id);
    if (idx === -1) return false;
    this.data.otherItems.splice(idx, 1);
    return true;
  }

  setOtherItemsEnabled(enabled, category = null) {
    let count = 0;
    for (const item of this.data.otherItems) {
      if (category && item.category !== category) continue;
      if (item.enabled !== enabled) {
        item.enabled = enabled;
        count++;
      }
    }
    return count;
  }

  getOtherItemCategories() {
    return ['背包', '胸挂', '治疗', '维修', '其他'];
  }

  // ============================================================
  // 4. 数据获取 - 枪口
  // ============================================================

  getMuzzles() {
    return this.muzzles || [];
  }

  getMuzzleById(id) {
    const targetId = typeof id === 'string' ? parseInt(id) : id;
    return this.muzzles.find(m => m.id === targetId) || null;
  }

  getMuzzleBonuses(muzzleId) {
    const muzzle = this.getMuzzleById(muzzleId);
    if (!muzzle) {
      return { rangeMult: 0, velocityMult: 1.0 };
    }
    return {
      rangeMult: muzzle.mult || 0,
      velocityMult: 1.0 + (muzzle.mult || 0)
    };
  }

  // ============================================================
  // 5. 数据获取 - 价格
  // ============================================================

  getPrices() {
    return this.data.prices || [];
  }

  getPriceByWeaponId(weaponId) {
    return this.data.prices.find(p => p.weaponId === weaponId) || null;
  }

  findBarrelIdByName(weaponId, barrelName) {
    if (weaponId === undefined || weaponId === null) {
      return -1;
    }

    const weapon = this.getWeaponById(weaponId);
    if (!weapon || !Array.isArray(weapon.barrels) || weapon.barrels.length === 0) {
      return -1;
    }

    return weapon.barrels.findIndex(b => b.name === barrelName);
  }

  getPriceRowsForWeapon(weaponId) {
    const weapon = this.getWeaponById(weaponId);
    const price = this.getPriceByWeaponId(weaponId);

    if (!weapon || !price) return [];

    return price.configs.map(config => {
      let barrelId = config.barrelId !== undefined ? config.barrelId : -1;
      let barrelName = '无';

      if (barrelId === -1 || barrelId === undefined) {
        if (config.barrel && config.barrel !== '无') {
          const foundIndex = this.findBarrelIdByName(weaponId, config.barrel);
          if (foundIndex >= 0) {
            barrelId = foundIndex;
            barrelName = config.barrel;
          }
        }
      } else if (barrelId >= 0 && weapon.barrels && weapon.barrels[barrelId]) {
        barrelName = weapon.barrels[barrelId].name || '无';
      }

      if (barrelId === -1 || barrelId === undefined) {
        barrelName = '无';
      }

      let muzzleName = '无';
      const muzzleId = config.muzzleId !== undefined ? config.muzzleId : 0;
      const muzzle = this.getMuzzleById(muzzleId);
      if (muzzle) {
        muzzleName = muzzle.name;
      }
      if (config.muzzle && config.muzzle !== '无') {
        muzzleName = config.muzzle;
      }

      let bulletDisplay = '-';
      let bulletId = config.bullet || '';
      if (bulletId) {
        const bullet = this.getBulletById(bulletId);
        if (bullet) {
          bulletDisplay = this.getBulletDisplay(bullet);
        }
      }

      let hitRateRaw = '';
      const distances = Array.isArray(config.distance) ? config.distance : [];
      const hitRates = Array.isArray(config.hitRate) ? config.hitRate : [];
      if (distances.length > 0 && hitRates.length > 0) {
        const len = Math.min(distances.length, hitRates.length);
        const parts = [];
        for (let i = 0; i < len; i++) {
          parts.push(`${distances[i]}:${hitRates[i]}`);
        }
        hitRateRaw = parts.join(',');
      }

      let precision = (typeof config.precision === 'number' && !isNaN(config.precision))
        ? config.precision
        : 0.09;

      if (barrelId === -1) {
        precision = 0;
      }

      const aimSpeed = (typeof config.aimSpeed === 'number' && !isNaN(config.aimSpeed))
        ? config.aimSpeed
        : 0;

      return {
        weaponName: weapon.name,
        configId: config.id || '#1',
        barrel: barrelName,
        barrelId: barrelId,
        muzzle: muzzleName,
        muzzleId: muzzleId,
        precision: precision,
        aimSpeed: aimSpeed,
        buildCode: config.buildCode || '-',
        price: config.price || 0,
        distance: distances,
        hitRate: hitRates,
        hitRateRaw: hitRateRaw,
        bulletDisplay: bulletDisplay,
        bulletId: bulletId,
        enabled: config.enabled !== undefined ? config.enabled : true,
        _weaponId: weaponId,
        _isImported: config._isImported === true,
        _rawConfig: config
      };
    });
  }

  getPriceRows() {
    const rows = [];
    const prices = this.getPrices();

    for (const price of prices) {
      const weaponRows = this.getPriceRowsForWeapon(price.weaponId);
      rows.push(...weaponRows);
    }

    return rows;
  }

  getHitRateForDistance(weaponId, configId, distance, fallback = 0.85) {
    const priceConfig = this.getPriceByWeaponId(weaponId);
    if (!priceConfig) {
      if (Array.isArray(fallback) && fallback.length > 0) {
        return this.getHitRateFromMap(fallback, distance, 0.85);
      }
      return typeof fallback === 'number' ? fallback : 0.85;
    }

    const config = priceConfig.configs.find(c => c.id === configId);
    if (!config) {
      if (Array.isArray(fallback) && fallback.length > 0) {
        return this.getHitRateFromMap(fallback, distance, 0.85);
      }
      return typeof fallback === 'number' ? fallback : 0.85;
    }

    if (!config.distance || !config.hitRate ||
        !Array.isArray(config.distance) || !Array.isArray(config.hitRate) ||
        config.distance.length === 0 || config.hitRate.length === 0) {
      if (Array.isArray(fallback) && fallback.length > 0) {
        return this.getHitRateFromMap(fallback, distance, 0.85);
      }
      return typeof fallback === 'number' ? fallback : 0.85;
    }

    const points = config.distance.map((d, i) => ({
      distance: d,
      rate: config.hitRate[i]
    }));

    return this.getHitRateFromMap(points, distance, 0.85);
  }

  getHitRateFromMap(hitRateMap, distance, fallback = 0.85) {
    if (!hitRateMap || hitRateMap.length === 0) {
      return typeof fallback === 'number' ? fallback : 0.85;
    }

    const sorted = [...hitRateMap].sort((a, b) => a.distance - b.distance);

    const validPoints = sorted.filter(p =>
      p.distance >= 0 &&
      p.rate !== undefined &&
      p.rate !== null &&
      !isNaN(p.rate) &&
      p.rate >= 0 &&
      p.rate <= 1
    );

    if (validPoints.length === 0) {
      return typeof fallback === 'number' ? fallback : 0.85;
    }

    const hasNearPoint = validPoints.some(p => p.distance <= 10);
    let points = [...validPoints];
    if (!hasNearPoint) {
      if (points[0].distance > 10) {
        points.unshift({ distance: 10, rate: 1.0 });
      } else {
        const nearPoint = points.find(p => p.distance <= 10);
        if (nearPoint && nearPoint.rate < 0.95) {
          nearPoint.rate = 1.0;
        }
      }
    } else {
      const nearPoint = points.find(p => p.distance <= 10);
      if (nearPoint && nearPoint.rate < 0.95) {
        nearPoint.rate = 1.0;
      }
    }

    points.sort((a, b) => a.distance - b.distance);

    if (distance <= points[0].distance) {
      if (distance <= 0) {
        return Math.min(1.0, points[0].rate);
      }
      const startRate = 1.0;
      const endRate = points[0].rate;
      const t = distance / points[0].distance;
      const rate = startRate + t * (endRate - startRate);
      return Math.max(0, Math.min(1, rate));
    }

    if (distance >= points[points.length - 1].distance) {
      const last = points[points.length - 1];
      const prev = points[points.length - 2] || last;
      const distDiff = last.distance - prev.distance;
      if (distDiff <= 0) {
        return Math.max(0, Math.min(1, last.rate));
      }
      const slope = (last.rate - prev.rate) / distDiff;
      const extrapolated = last.rate + slope * (distance - last.distance);
      return Math.max(0, Math.min(1, extrapolated));
    }

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      if (distance >= p1.distance && distance < p2.distance) {
        const distDiff = p2.distance - p1.distance;
        if (distDiff <= 0) {
          return Math.max(0, Math.min(1, p1.rate));
        }
        const t = (distance - p1.distance) / distDiff;
        const rate = p1.rate + t * (p2.rate - p1.rate);
        return Math.max(0, Math.min(1, rate));
      }
    }

    return Math.max(0, Math.min(1, points[points.length - 1].rate));
  }

  getNextConfigId(weaponId) {
    const price = this.getPriceByWeaponId(weaponId);
    if (!price || !price.configs || price.configs.length === 0) {
      return '#1';
    }
    const ids = price.configs.map(c => {
      const num = parseInt(c.id.replace('#', ''));
      return isNaN(num) ? 0 : num;
    });
    const maxId = Math.max(...ids);
    return `#${maxId + 1}`;
  }

  // ============================================================
  // 6. 工具方法 - 枪管
  // ============================================================

  findBestBarrelIndex(weaponId) {
    const weapon = this.getWeaponById(weaponId);
    if (!weapon) return -1;
    if (!Array.isArray(weapon.barrels) || weapon.barrels.length === 0) return -1;

    let bestIndex = -1;
    let bestScore = -Infinity;

    weapon.barrels.forEach((barrel, index) => {
      let score = 0;

      if (Array.isArray(barrel.ranges) && barrel.ranges.length > 0) {
        const firstRange = barrel.ranges[0];
        if (firstRange === Infinity) {
          score = 10000;
        } else if (typeof firstRange === 'number') {
          score = firstRange;
        }
      }

      if (barrel.rangeMult !== undefined && barrel.rangeMult !== null) {
        score = Math.max(score, (barrel.rangeMult || 1.0) * 100);
      }

      if (barrel.rangeAdd !== undefined && barrel.rangeAdd !== null) {
        score += (barrel.rangeAdd || 0) * 0.5;
      }

      if (barrel.name) {
        if (barrel.name.includes('超长') || barrel.name.includes('长枪管')) {
          score += 5;
        }
        if (barrel.name.includes('精英') || barrel.name.includes('顶级')) {
          score += 3;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    return bestIndex;
  }

  findBestBarrelName(weaponId) {
    const index = this.findBestBarrelIndex(weaponId);
    if (index === -1) return '无';

    const weapon = this.getWeaponById(weaponId);
    if (!weapon || !Array.isArray(weapon.barrels) || index >= weapon.barrels.length) {
      return '无';
    }

    return weapon.barrels[index].name || '无';
  }

  // ============================================================
  // 7. 数据更新 - 武器
  //
  // ⭐ v8：问题 1
  //   所有"改武器属性"的方法都调用 markWeaponModified（已有）
  //   调用方（App.vue）可以通过 modifiedWeaponIds 判断哪些武器"脏"
  //   评分计算时跳过这些武器的缓存（强制重算）
  // ============================================================

  updateWeapon(weaponId, updates) {
    const weapon = this.getWeaponById(weaponId);
    if (!weapon) return false;

    Object.assign(weapon, updates);
    this.markWeaponModified(weaponId);
    return true;
  }

  updateWeaponBarrel(weaponId, barrelIndex, updates) {
    const weapon = this.getWeaponById(weaponId);
    if (!weapon || !Array.isArray(weapon.barrels)) return false;
    if (barrelIndex < 0 || barrelIndex >= weapon.barrels.length) return false;

    Object.assign(weapon.barrels[barrelIndex], updates);
    this.markWeaponModified(weaponId);
    return true;
  }

  addWeaponBarrel(weaponId, barrelData) {
    const weapon = this.getWeaponById(weaponId);
    if (!weapon) return -1;
    if (!Array.isArray(weapon.barrels)) {
      weapon.barrels = [];
    }
    weapon.barrels.push(barrelData);
    this.markWeaponModified(weaponId);
    return weapon.barrels.length - 1;
  }

  removeWeaponBarrel(weaponId, barrelIndex) {
    const weapon = this.getWeaponById(weaponId);
    if (!weapon || !Array.isArray(weapon.barrels)) return false;
    if (barrelIndex < 0 || barrelIndex >= weapon.barrels.length) return false;

    const price = this.getPriceByWeaponId(weaponId);
    if (price && Array.isArray(price.configs)) {
      price.configs.forEach(config => {
        if (config.barrelId === barrelIndex) {
          config.barrelId = -1;
        } else if (config.barrelId > barrelIndex) {
          config.barrelId--;
        }
      });
    }

    weapon.barrels.splice(barrelIndex, 1);
    this.markWeaponModified(weaponId);
    return true;
  }

  // ============================================================
  // 8. 数据更新 - 子弹
  //
  // ⭐ v8：问题 1
  //   改子弹时，用 markWeaponsByBullet 标记"用到该子弹的所有武器"
  // ============================================================

  addBullet(bulletData) {
    if (!bulletData) return false;

    if (!bulletData.id) {
      if (!bulletData.caliber) {
        console.warn('⚠️ addBullet: 缺少 caliber，无法生成 ID');
        return false;
      }
      bulletData.id = this.getNextBulletId(bulletData.caliber);
    }

    const existing = this.getBulletById(bulletData.id);
    if (existing) {
      console.warn(`⚠️ 子弹 ${bulletData.id} 已存在`);
      return false;
    }

    if (bulletData.level === undefined) bulletData.level = 4;
    if (bulletData.name === undefined) bulletData.name = '';
    if (bulletData.price === undefined) bulletData.price = 0;
    if (bulletData.enabled === undefined) bulletData.enabled = true;

    if (!bulletData.partMult || typeof bulletData.partMult !== 'object') {
      bulletData.partMult = { head: 1, chest: 1, stomach: 1, limbs: 1 };
    } else {
      const fallback = { head: 1, chest: 1, stomach: 1, limbs: 1 };
      for (const key of ['head', 'chest', 'stomach', 'limbs']) {
        if (typeof bulletData.partMult[key] !== 'number' || !isFinite(bulletData.partMult[key])) {
          bulletData.partMult[key] = fallback[key];
        }
      }
    }

    const sameGroup = this.data.bullets.filter(b =>
      b.caliber === bulletData.caliber && String(b.level) === String(bulletData.level)
    );
    const hasDefault = sameGroup.some(b => b.isDefault === true);

    if (bulletData.isDefault === undefined) {
      bulletData.isDefault = !hasDefault;
    }

    if (bulletData.isDefault === true) {
      for (const b of sameGroup) {
        b.isDefault = false;
      }
    }

    this.data.bullets.push(bulletData);
    return true;
  }

  updateBullet(bulletId, updates) {
    const bullet = this.getBulletById(bulletId);
    if (!bullet) return false;

    if (updates.caliber !== undefined && updates.caliber !== bullet.caliber) {
      console.warn(`⚠️ 禁止修改子弹口径`);
      delete updates.caliber;
    }

    if (updates.id !== undefined && updates.id !== bullet.id) {
      console.warn(`⚠️ 禁止修改子弹 ID`);
      delete updates.id;
    }

    if (updates.isDefault !== undefined) {
      console.warn(`⚠️ 请使用 setDefaultBullet() 设置默认子弹`);
      delete updates.isDefault;
    }

    if (updates.partMult !== undefined) {
      if (typeof updates.partMult !== 'object' || updates.partMult === null) {
        delete updates.partMult;
      } else {
        const fallback = { head: 1, chest: 1, stomach: 1, limbs: 1 };
        const pm = { ...bullet.partMult };
        for (const key of ['head', 'chest', 'stomach', 'limbs']) {
          if (typeof updates.partMult[key] === 'number' && isFinite(updates.partMult[key])) {
            pm[key] = updates.partMult[key];
          }
        }
        bullet.partMult = pm;
        delete updates.partMult;
      }
    }

    if (updates.armorMult !== undefined && Array.isArray(updates.armorMult)) {
      const values = updates.armorMult;
      if (bullet.armorData) {
        for (let i = 1; i <= 6; i++) {
          if (bullet.armorData[i]) {
            bullet.armorData[i].armorMult = values[i - 1] ?? 1.0;
          }
        }
      }
      bullet.armorMult = values[0] ?? 1.0;
      delete updates.armorMult;
    }

    if (updates.pen !== undefined && Array.isArray(updates.pen)) {
      const values = updates.pen;
      if (bullet.armorData) {
        for (let i = 1; i <= 6; i++) {
          if (bullet.armorData[i]) {
            bullet.armorData[i].pen = values[i - 1] ?? 0;
          }
        }
      }
      bullet.pen = values[0] ?? 0;
      delete updates.pen;
    }

    Object.assign(bullet, updates);
    this.markWeaponsByBullet(bulletId);
    return true;
  }

  removeBullet(bulletId) {
    const index = this.data.bullets.findIndex(b => b.id === bulletId);
    if (index === -1) return false;

    const inUse = this.data.prices.some(p =>
      p.configs.some(c => c.bullet === bulletId)
    );
    if (inUse) {
      console.warn(`子弹 ${bulletId} 正在被价格配置使用，无法删除`);
      return false;
    }

    const removedBullet = this.data.bullets[index];
    const caliber = removedBullet.caliber;
    const level = removedBullet.level;
    const wasDefault = removedBullet.isDefault === true;

    this.data.bullets.splice(index, 1);

    if (wasDefault) {
      const remaining = this.data.bullets.filter(b =>
        b.caliber === caliber && String(b.level) === String(level)
      );
      if (remaining.length > 0) {
        remaining.sort((a, b) => this._extractIndexFromId(a.id) - this._extractIndexFromId(b.id));
        remaining[0].isDefault = true;
        console.log(`⭐ 删除默认子弹后，${remaining[0].id} 自动成为默认`);
      }
    }

    return true;
  }

  setDefaultBullet(bulletId) {
    const bullet = this.getBulletById(bulletId);
    if (!bullet) {
      console.warn(`⚠️ setDefaultBullet: 子弹 ${bulletId} 不存在`);
      return false;
    }

    const caliber = bullet.caliber;
    const level = bullet.level;

    let changed = 0;
    for (const b of this.data.bullets) {
      if (b.caliber === caliber && String(b.level) === String(level)) {
        if (b.id === bulletId) {
          b.isDefault = true;
        } else if (b.isDefault === true) {
          b.isDefault = false;
          changed++;
        }
      }
    }

    console.log(`⭐ 设置默认子弹: ${bulletId}`);
    return true;
  }

  setBulletsEnabled(enabled, caliber = null) {
    let count = 0;
    for (const bullet of this.data.bullets) {
      if (caliber && bullet.caliber !== caliber) continue;
      if (bullet.enabled !== enabled) {
        bullet.enabled = enabled;
        count++;
      }
    }
    return count;
  }

  // ============================================================
  // 9. 数据更新 - 价格
  // ============================================================

  updatePriceConfig(weaponId, configId, updates) {
    const price = this.getPriceByWeaponId(weaponId);
    if (!price) {
      console.warn(`⚠️ 未找到武器 ${weaponId} 的价格配置`);
      return false;
    }

    const config = price.configs.find(c => c.id === configId);
    if (!config) {
      console.warn(`⚠️ 未找到配置 ${configId}`);
      return false;
    }

    const ttkAffectingKeys = ['barrelId', 'muzzleId', 'precision', 'bullet', 'distance', 'hitRate'];
    const hasTtkAffectingChange = Object.keys(updates).some(key =>
      ttkAffectingKeys.includes(key)
    );

    if (updates.barrelId !== undefined) {
      const weapon = this.getWeaponById(weaponId);
      if (weapon && weapon.barrels && weapon.barrels[updates.barrelId]) {
        updates.barrel = weapon.barrels[updates.barrelId].name || '无';
      } else {
        updates.barrel = '无';
      }

      if (updates.barrelId === -1) {
        updates.precision = 0;
      }
    }

    if (updates.muzzleId !== undefined) {
      const muzzle = this.getMuzzleById(updates.muzzleId);
      updates.muzzle = muzzle ? muzzle.name : '无';
    }

    Object.assign(config, updates);

    if (hasTtkAffectingChange) {
      this.markWeaponModified(weaponId);
    }

    return true;
  }

  /**
   * ⭐ v7.5：修改配置的 ID（序号）
   *
   * ⭐ v8：问题 2 / 12
   *   成功后主动清 IndexedDB 里 `atk_{weaponId}_{oldConfigId}_*` 的缓存。
   *   （key 变了，旧缓存成孤儿，主动清掉更干净）
   *
   * @param {number} weaponId
   * @param {string} oldConfigId
   * @param {string} newConfigId
   * @returns {Promise<{ ok: boolean, error?: string, cacheDeleted?: number }>}
   */
  async updateConfigId(weaponId, oldConfigId, newConfigId) {
    // ---------- 1. 基础校验 ----------
    const newId = String(newConfigId || '').trim()

    if (!newId) {
      return { ok: false, error: 'ID 不能为空' }
    }

    if (!/^#\d+$/.test(newId)) {
      return { ok: false, error: 'ID 格式必须是 "#数字"（如 #1、#10）' }
    }

    if (newId === oldConfigId) {
      return { ok: true }
    }

    // ---------- 2. 找价格条目 ----------
    const price = this.getPriceByWeaponId(weaponId)
    if (!price) {
      return { ok: false, error: '未找到该武器的价格配置' }
    }

    const configs = price.configs || []

    // ---------- 3. 找目标配置 ----------
    const targetConfig = configs.find(c => c.id === oldConfigId)
    if (!targetConfig) {
      return { ok: false, error: `未找到配置 ${oldConfigId}` }
    }

    // ---------- 4. 检查重复 ----------
    const duplicate = configs.find(c => c.id === newId && c !== targetConfig)
    if (duplicate) {
      return { ok: false, error: `ID ${newId} 已存在，不能重复` }
    }

    // ---------- 5. 修改 ----------
    targetConfig.id = newId
    this.markWeaponModified(weaponId)

    console.log(`✅ 配置 ID 修改: ${weaponId} ${oldConfigId} → ${newId}`)

    // ---------- 6. ⭐ v8：清 IndexedDB 缓存 ----------
    let cacheDeleted = 0
    try {
      const prefix = `atk_${weaponId}_${String(oldConfigId).replace('#', '')}_`
      cacheDeleted = await this._invalidateCacheByPrefix(prefix)
      if (cacheDeleted > 0) {
        console.log(`🧹 已清除该配置的缓存 ${cacheDeleted} 条（prefix=${prefix}）`)
      }
    } catch (e) {
      console.warn('⚠️ 清缓存失败（不影响功能）:', e)
    }

    return { ok: true, cacheDeleted }
  }

  /**
   * ⭐ v8：清 IndexedDB 缓存（按前缀）
   *
   * 内部调用 TTKMatrix.deleteMatrixEntriesByPrefix
   * 用**动态 import** 避免"DataManager → TTKMatrix → DataManager"循环依赖
   *
   * @param {string} prefix
   * @returns {Promise<number>} 删除的数量
   */
  async _invalidateCacheByPrefix(prefix) {
    if (!prefix) return 0

    try {
      const mod = await import('./TTKMatrix.js')
      if (mod && typeof mod.deleteMatrixEntriesByPrefix === 'function') {
        const count = await mod.deleteMatrixEntriesByPrefix(prefix)
        // 同时回调（如果 App.vue 注入了）
        if (typeof this.onCacheInvalidate === 'function') {
          try {
            this.onCacheInvalidate({ type: 'prefix', prefix, count })
          } catch (e) {
            console.warn('⚠️ onCacheInvalidate 回调失败:', e)
          }
        }
        return count
      }
    } catch (e) {
      console.warn('⚠️ _invalidateCacheByPrefix 失败:', e)
    }
    return 0
  }

  addPriceConfig(weaponId, configData) {
    const price = this.getPriceByWeaponId(weaponId);
    if (!price) {
      console.warn(`⚠️ 未找到武器 ${weaponId} 的价格配置`);
      return false;
    }

    if (configData.enabled === undefined) {
      configData.enabled = true;
    }

    if (configData.barrel === undefined) {
      const weapon = this.getWeaponById(weaponId);
      if (configData.barrelId !== undefined && configData.barrelId >= 0 &&
          weapon?.barrels && weapon.barrels[configData.barrelId]) {
        configData.barrel = weapon.barrels[configData.barrelId].name || '无';
      } else {
        configData.barrel = '无';
      }
    }

    if (configData.barrelId === undefined) {
      configData.barrelId = -1;
    }

    if (configData.muzzle === undefined) {
      configData.muzzle = '无';
    }

    if (configData.muzzleId === undefined) {
      configData.muzzleId = 0;
    }

    if (configData.precision === undefined) {
      configData.precision = 0.09;
    }

    if (configData.barrelId === -1) {
      configData.precision = 0;
    }

    if (configData.aimSpeed === undefined) {
      configData.aimSpeed = 0;
    }

    if (configData.bullet === undefined) {
      configData.bullet = '';
    }

    if (!Array.isArray(configData.distance)) {
      configData.distance = [];
    }
    if (!Array.isArray(configData.hitRate)) {
      configData.hitRate = [];
    }

    if (configData.distance.length === 0) {
      configData.distance = [30, 50, 100];
      configData.hitRate = [1.0, 0.9, 0.6];
    }

    if (configData.buildCode === undefined) {
      configData.buildCode = '';
    }

    if (configData.price === undefined) {
      configData.price = 0;
    }

    const existing = price.configs.find(c => c.id === configData.id);
    if (existing) {
      console.warn(`配置 ${configData.id} 已存在`);
      return false;
    }

    price.configs.push(configData);
    this.markWeaponModified(weaponId);
    console.log(`✅ 已添加配置 ${configData.id} 到武器 ${weaponId}`);
    return true;
  }

  removePriceConfig(weaponId, configId) {
    const price = this.getPriceByWeaponId(weaponId);
    if (!price) return false;

    const index = price.configs.findIndex(c => c.id === configId);
    if (index === -1) return false;

    if (price.configs.length <= 1) {
      console.warn('每个武器至少保留一个价格配置');
      return false;
    }

    price.configs.splice(index, 1);
    this.markWeaponModified(weaponId);
    return true;
  }

  // ============================================================
  // 10. 修改追踪管理
  // ============================================================

  markWeaponModified(weaponId) {
    if (weaponId === undefined || weaponId === null) return;
    const id = typeof weaponId === 'string' ? parseInt(weaponId) : weaponId;
    if (!isNaN(id)) {
      this.modifiedWeaponIds.add(id);
    }
  }

  markWeaponsModified(weaponIds) {
    for (const id of weaponIds) {
      this.markWeaponModified(id);
    }
  }

  markWeaponsByBullet(bulletId) {
    const affectedWeaponIds = [];
    for (const price of this.data.prices) {
      for (const config of price.configs) {
        if (config.bullet === bulletId) {
          affectedWeaponIds.push(price.weaponId);
          break;
        }
      }
    }
    this.markWeaponsModified(affectedWeaponIds);
  }

  isWeaponModified(weaponId) {
    const id = typeof weaponId === 'string' ? parseInt(weaponId) : weaponId;
    return this.modifiedWeaponIds.has(id);
  }

  getModifiedWeaponIds() {
    return Array.from(this.modifiedWeaponIds);
  }

  clearWeaponModified(weaponId) {
    const id = typeof weaponId === 'string' ? parseInt(weaponId) : weaponId;
    this.modifiedWeaponIds.delete(id);
  }

  clearAllModified() {
    this.modifiedWeaponIds.clear();
  }

  hasModifiedWeapons() {
    return this.modifiedWeaponIds.size > 0;
  }

  // ============================================================
  // 11. 导出排序方法
  // ============================================================

  static get TYPE_ORDER() {
    return {
      '步枪': 0,
      '冲锋枪': 1,
      '轻机枪': 2,
      '精确射手步枪': 3,
      '手枪': 4
    };
  }

  static getLevelWeight(level) {
    if (level === undefined || level === null) return 999;
    if (typeof level === 'number' && level >= 1 && level <= 5) return level;
    if (typeof level === 'string' && /^[1-5]$/.test(level)) return parseInt(level);

    const specialLevels = ['AP', 'BT+P', 'CT', 'Double', 'M61', 'RIP', 'ST4', 'ST5', 'SUPER'];
    const index = specialLevels.indexOf(String(level));
    if (index !== -1) return 100 + index;

    return 999;
  }

  static get CATEGORY_ORDER() {
    return {
      '背包': 0,
      '胸挂': 1,
      '治疗': 2,
      '维修': 3,
      '其他': 4
    };
  }

  _sortWeaponsForExport(weapons) {
    if (!weapons || weapons.length === 0) return;

    const typeOrder = DataManager.TYPE_ORDER;

    weapons.sort((a, b) => {
      const typeA = typeOrder[a.type] !== undefined ? typeOrder[a.type] : 99;
      const typeB = typeOrder[b.type] !== undefined ? typeOrder[b.type] : 99;
      if (typeA !== typeB) return typeA - typeB;

      return (a.name || '').localeCompare(b.name || '', 'zh-CN');
    });
  }

  _sortBulletsForExport(bullets) {
    if (!bullets || bullets.length === 0) return;

    bullets.sort((a, b) => {
      const calA = a.caliber || '';
      const calB = b.caliber || '';
      const calCompare = calA.localeCompare(calB);
      if (calCompare !== 0) return calCompare;

      const levelA = DataManager.getLevelWeight(a.level);
      const levelB = DataManager.getLevelWeight(b.level);
      if (levelA !== levelB) return levelA - levelB;

      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;

      const idxA = this._extractIndexFromId(a.id);
      const idxB = this._extractIndexFromId(b.id);
      return idxA - idxB;
    });
  }

  _sortArmorsForExport(armors) {
    if (!armors || armors.length === 0) return;

    const typeOrder = { 'armor': 0, 'helmet': 1 };

    armors.sort((a, b) => {
      const typeA = typeOrder[a.type] !== undefined ? typeOrder[a.type] : 99;
      const typeB = typeOrder[b.type] !== undefined ? typeOrder[b.type] : 99;
      if (typeA !== typeB) return typeA - typeB;

      const levelA = typeof a.level === 'number' ? a.level : parseInt(a.level) || 0;
      const levelB = typeof b.level === 'number' ? b.level : parseInt(b.level) || 0;
      if (levelA !== levelB) return levelB - levelA;

      const valueA = typeof a.value === 'number' ? a.value : parseFloat(a.value) || 0;
      const valueB = typeof b.value === 'number' ? b.value : parseFloat(b.value) || 0;
      if (valueA !== valueB) return valueB - valueA;

      return (a.name || '').localeCompare(b.name || '', 'zh-CN');
    });
  }

  _sortOtherItemsForExport(items) {
    if (!items || items.length === 0) return;

    const categoryOrder = DataManager.CATEGORY_ORDER;

    items.sort((a, b) => {
      const catA = categoryOrder[a.category] !== undefined ? categoryOrder[a.category] : 99;
      const catB = categoryOrder[b.category] !== undefined ? categoryOrder[b.category] : 99;
      if (catA !== catB) return catA - catB;

      return (a.name || '').localeCompare(b.name || '', 'zh-CN');
    });
  }

  _sortPricesForExport(prices, weaponsMap) {
    if (!prices || prices.length === 0) return;

    const typeOrder = DataManager.TYPE_ORDER;

    prices.sort((a, b) => {
      const weaponA = weaponsMap.get(a.weaponId);
      const weaponB = weaponsMap.get(b.weaponId);

      const typeA = weaponA ? (typeOrder[weaponA.type] !== undefined ? typeOrder[weaponA.type] : 99) : 99;
      const typeB = weaponB ? (typeOrder[weaponB.type] !== undefined ? typeOrder[weaponB.type] : 99) : 99;
      if (typeA !== typeB) return typeA - typeB;

      const nameA = weaponA ? weaponA.name || '' : '';
      const nameB = weaponB ? weaponB.name || '' : '';
      const nameCompare = nameA.localeCompare(nameB, 'zh-CN');
      if (nameCompare !== 0) return nameCompare;

      const getConfigNum = (config) => {
        const id = config.id || '';
        const match = id.match(/#(\d+)/);
        return match ? parseInt(match[1]) : 0;
      };
      const numA = getConfigNum(a);
      const numB = getConfigNum(b);
      return numA - numB;
    });
  }

  // ============================================================
  // 12. 数据序列化
  // ============================================================

  serializeData(data) {
    const serialized = JSON.parse(JSON.stringify(data));

    if (Array.isArray(serialized.weapons)) {
      serialized.weapons.forEach(weapon => {
        if (Array.isArray(weapon.ranges)) {
          weapon.ranges = weapon.ranges.map(r => {
            if (r === Infinity || r === null || r === undefined) {
              return 'Infinity';
            }
            return r;
          });
        }
        if (Array.isArray(weapon.barrels)) {
          weapon.barrels.forEach(barrel => {
            if (Array.isArray(barrel.ranges)) {
              barrel.ranges = barrel.ranges.map(r => {
                if (r === Infinity || r === null || r === undefined) {
                  return 'Infinity';
                }
                return r;
              });
            }
          });
        }
      });
    }

    return serialized;
  }

  // ============================================================
  // 13. 数据导出/导入
  // ============================================================

  /**
   * ⭐ 导出为 JSON 字符串
   */
  exportToJSON(extra = {}) {
    try {
      const dataToExport = JSON.parse(JSON.stringify(this.data));

      // ---------- 清理运行时字段 ----------
      if (Array.isArray(dataToExport.weapons)) {
        dataToExport.weapons = dataToExport.weapons
          .filter(w => !w._isNewRow)
          .map(w => {
            if (w._isImported) {
              const { _isImported, ...rest } = w
              return rest
            }
            return w
          })
      }

      if (Array.isArray(dataToExport.prices)) {
        for (const p of dataToExport.prices) {
          if (Array.isArray(p.configs)) {
            p.configs = p.configs.map(c => {
              if (c._isImported) {
                const { _isImported, ...rest } = c
                return rest
              }
              return c
            })
          }
        }
      }

      // ---------- 排序 ----------
      this._sortWeaponsForExport(dataToExport.weapons);
      this._sortBulletsForExport(dataToExport.bullets);
      this._sortArmorsForExport(dataToExport.armors);
      this._sortOtherItemsForExport(dataToExport.otherItems);

      const weaponsMap = new Map();
      if (Array.isArray(dataToExport.weapons)) {
        dataToExport.weapons.forEach(w => weaponsMap.set(w.id, w));
      }

      this._sortPricesForExport(dataToExport.prices, weaponsMap);

      const serialized = this.serializeData(dataToExport);

      const output = {
        ...serialized,
      };

      // ---------- params ----------
      if (extra && extra.params && typeof extra.params === 'object') {
        const cleanedParams = this._cleanParams(extra.params);
        if (Object.keys(cleanedParams).length > 0) {
          output.params = cleanedParams;
        }
      }

      // ---------- equipState ----------
      if (extra && extra.equipState && typeof extra.equipState === 'object') {
        const equipState = this._validateEquipState(
          JSON.parse(JSON.stringify(extra.equipState))
        );
        this._sortEquipStateForExport(equipState);

        if (equipState.calcEquip || equipState.scoreEquips.length > 0) {
          output.equipState = equipState;
        }
      }

      // 显式确保不写 selectedEquips
      if (output.selectedEquips !== undefined) {
        delete output.selectedEquips;
      }

      // ---------- v7.2：综合评分数据 ----------
      if (extra && extra.weaponScores && typeof extra.weaponScores === 'object') {
        const scoreKeys = Object.keys(extra.weaponScores);
        if (scoreKeys.length > 0) {
          output.weaponScores = this._buildWeaponScoresForExport(
            extra.weaponScores,
            extra.havocCosts || {}
          );
        }
      }

      let json = JSON.stringify(output, null, 2);
      json = this._compressArmorData(json);
      json = this._compressKeyPoints(json);

      return json;

    } catch (error) {
      console.error('导出 JSON 失败:', error);
      throw error;
    }
  }

  _compressArmorData(json) {
    return json.replace(
      /"(\d+)":\s*\{\s*\n\s*"armorMult":\s*([\d.]+),\s*\n\s*"pen":\s*([\d.]+)\s*\n\s*\}/g,
      (match, level, armorMult, pen) => {
        return `"${level}": { "armorMult": ${armorMult}, "pen": ${pen} }`;
      }
    );
  }

  _compressKeyPoints(json) {
    if (!json.includes('"keyPoints"')) return json;

    return json.replace(
      /"keyPoints":\s*\[\s*\n\s*((?:\{[^}]*\},\s*\n\s*)*\{[^}]*\})\s*\n\s*\]/g,
      (match, content) => {
        const points = content.match(/\{\s*"d":\s*([\d.]+),\s*"t":\s*([\d.]+)(?:,\s*"shots":\s*([\d.]+))?(?:,\s*"bulletPrice":\s*([\d.]+))?\s*\}/g);
        if (!points) return match;

        const compressed = points.map(p => p.replace(/\s+/g, ' ').trim());
        return `"keyPoints": [${compressed.join(', ')}]`;
      }
    );
  }

  /**
   * ⭐ v7.2：组装综合评分导出数据
   *
   * ⭐ v8：问题 16 - Infinity → null
   */
  _buildWeaponScoresForExport(weaponScores, havocCosts) {
    const result = {}

    const entries = Object.entries(weaponScores).map(([key, val]) => {
      // ⭐ v8：Infinity / NaN 显式转 null
      const rawScore = val?.score
      const score = (typeof rawScore === 'number' && isFinite(rawScore)) ? rawScore : null
      return { key, val, score }
    })

    entries.sort((a, b) => {
      if (a.score === null && b.score === null) return 0
      if (a.score === null) return 1
      if (b.score === null) return -1
      return a.score - b.score
    })

    for (const { key, val } of entries) {
      const underscoreIdx = key.indexOf('_')
      if (underscoreIdx === -1) continue

      const weaponIdStr = key.slice(0, underscoreIdx)
      const configId = key.slice(underscoreIdx + 1)
      const weaponId = parseInt(weaponIdStr, 10)
      if (!isFinite(weaponId)) continue

      const weapon = this.getWeaponById(weaponId)
      const priceRows = this.getPriceRowsForWeapon(weaponId) || []
      const priceRow = priceRows.find(r => r.configId === configId)

      if (!weapon || !priceRow) {
        result[key] = {
          score: val?.score ?? null,
          grade: val?.grade ?? null,
          meta: {
            weaponId,
            configId,
            _missing: true,
          }
        }
        continue
      }

      const bullet = priceRow.bulletId
        ? this.getBulletById(priceRow.bulletId)
        : null

      const havoc = havocCosts[key] || null

      // ⭐ v8：Infinity → null
      const havocCost = (havoc && typeof havoc.totalCost === 'number' && isFinite(havoc.totalCost))
        ? havoc.totalCost
        : null

      result[key] = {
        score: (typeof val?.score === 'number' && isFinite(val.score)) ? val.score : null,
        grade: val?.grade ?? null,
        meta: {
          weaponId: weapon.id,
          weaponName: weapon.name,
          configId: priceRow.configId,
          barrel: priceRow.barrel || '无',
          barrelId: priceRow.barrelId,
          muzzle: priceRow.muzzle || '无',
          muzzleId: priceRow.muzzleId,
          precision: priceRow.precision,
          bulletId: priceRow.bulletId || '',
          bulletName: bullet?.name || '',
          bulletLevel: bullet?.level ?? null,
          bulletPrice: bullet?.price ?? 0,
          buildCode: priceRow.buildCode || '',
          aimSpeed: priceRow.aimSpeed ?? 0,
          price: priceRow.price || 0,
          havocCost,
          enabled: priceRow.enabled !== false,
        }
      }
    }

    return result
  }

  /**
   * ⭐ 导出为文件
   */
  exportToFile(filename = null, extra = {}) {
    const jsonStr = this.exportToJSON(extra);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `ttk_data_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`✅ 数据已导出到: ${a.download}`);
  }

  /**
   * ⭐ v7.3：从 JSON 字符串导入（支持双模式）
   */
  importFromJSON(jsonStr, options = {}) {
    const mode = options.mode === 'merge' ? 'merge' : 'overwrite'

    try {
      const parsed = JSON.parse(jsonStr);
      if (!this.validateData(parsed)) {
        throw new Error('无效的数据格式');
      }

      if (mode === 'merge') {
        return this._importMerge(parsed);
      }

      // ---------- 全量覆盖 ----------
      const normalized = this.normalizeData(parsed);
      this.data = normalized;
      this.originalData = JSON.parse(JSON.stringify(normalized));
      this.isLoaded = true;

      this.clearAllModified();

      let params = null;
      if (parsed.params && typeof parsed.params === 'object') {
        params = this._cleanParams(parsed.params);
      }

      let equipState = null;
      if (parsed.equipState && typeof parsed.equipState === 'object') {
        equipState = this._validateEquipState(parsed.equipState);
      } else if (Array.isArray(parsed.selectedEquips)) {
        equipState = this._validateEquipState({ scoreEquips: parsed.selectedEquips });
        console.log('⚠️ 检测到老格式 selectedEquips，已兼容处理为 equipState');
      }

      if (parsed.weaponScores && typeof parsed.weaponScores === 'object') {
        console.log(
          `ℹ️ 导入文件含 ${Object.keys(parsed.weaponScores).length} 条评分，` +
          `已忽略（导入后会自动重算）`
        );
      }

      console.log(
        `✅ DataManager: 全量导入了 ${this.data.weapons.length} 把武器, ` +
        `${this.data.bullets.length} 种子弹, ` +
        `${this.data.armors.length} 条护甲数据, ` +
        `${this.data.otherItems.length} 条其他物品` +
        (params ? `, 含参数快照` : '') +
        (equipState ? `, 含装备状态` : '')
      );

      return { data: this.data, params, equipState, mode: 'overwrite' };

    } catch (error) {
      console.error('导入 JSON 失败:', error);
      throw error;
    }
  }

  _importMerge(imported) {
    const stats = {
      weapons: { added: 0, updated: 0 },
      bullets: { added: 0, updated: 0 },
      prices: { added: 0, updated: 0, configsAdded: 0, configsUpdated: 0 },
      armors: { added: 0, updated: 0 },
      otherItems: { added: 0, updated: 0 },
    }

    const clone = (x) => JSON.parse(JSON.stringify(x))

    // ---------- 1. 武器 ----------
    const weaponMap = new Map(this.data.weapons.map(w => [w.id, w]))
    for (const impW of imported.weapons || []) {
      const imp = clone(impW)
      if (weaponMap.has(imp.id)) {
        Object.assign(weaponMap.get(imp.id), imp)
        stats.weapons.updated++
      } else {
        this.data.weapons.push({ ...imp, _isImported: true })
        stats.weapons.added++
      }
    }

    // ---------- 2. 子弹 ----------
    const bulletMap = new Map(this.data.bullets.map(b => [b.id, b]))
    for (const impB of imported.bullets || []) {
      const imp = clone(impB)
      if (bulletMap.has(imp.id)) {
        Object.assign(bulletMap.get(imp.id), imp)
        stats.bullets.updated++
      } else {
        this.data.bullets.push(imp)
        stats.bullets.added++
      }
    }

    // ---------- 3. 价格配置 ----------
    const priceMap = new Map(this.data.prices.map(p => [p.weaponId, p]))

    for (const impPrice of imported.prices || []) {
      const wid = impPrice.weaponId
      let localPrice = priceMap.get(wid)

      if (!localPrice) {
        const newPrice = {
          weaponId: wid,
          weaponName: impPrice.weaponName || '',
          configs: (impPrice.configs || []).map(c => ({
            ...clone(c),
            _isImported: true,
          })),
        }
        this.data.prices.push(newPrice)
        priceMap.set(wid, newPrice)
        stats.prices.added++
        stats.prices.configsAdded += newPrice.configs.length
        continue
      }

      const localCfgMap = new Map((localPrice.configs || []).map(c => [c.id, c]))
      for (const impCfg of impPrice.configs || []) {
        const cfgId = impCfg.id
        const imp = clone(impCfg)

        if (localCfgMap.has(cfgId)) {
          Object.assign(localCfgMap.get(cfgId), imp)
          stats.prices.configsUpdated++
        } else {
          localPrice.configs.push({ ...imp, _isImported: true })
          stats.prices.configsAdded++
        }
      }
    }

    // ---------- 4. 护甲 ----------
    const armorMap = new Map(this.data.armors.map(a => [a.id, a]))
    for (const impA of imported.armors || []) {
      const imp = clone(impA)
      if (armorMap.has(imp.id)) {
        Object.assign(armorMap.get(imp.id), imp)
        stats.armors.updated++
      } else {
        this.data.armors.push(imp)
        stats.armors.added++
      }
    }

    // ---------- 5. 其他物品 ----------
    const otherMap = new Map(this.data.otherItems.map(i => [i.id, i]))
    for (const impI of imported.otherItems || []) {
      const imp = clone(impI)
      if (otherMap.has(imp.id)) {
        Object.assign(otherMap.get(imp.id), imp)
        stats.otherItems.updated++
      } else {
        this.data.otherItems.push(imp)
        stats.otherItems.added++
      }
    }

    // ---------- 6. 更新 originalData ----------
    this.originalData = JSON.parse(JSON.stringify(this.data))
    this.isLoaded = true
    this.clearAllModified()

    // ---------- 7. 提取 params / equipState ----------
    let params = null
    if (imported.params && typeof imported.params === 'object') {
      params = this._cleanParams(imported.params)
    }

    let equipState = null
    if (imported.equipState && typeof imported.equipState === 'object') {
      equipState = this._validateEquipState(imported.equipState)
    } else if (Array.isArray(imported.selectedEquips)) {
      equipState = this._validateEquipState({ scoreEquips: imported.selectedEquips })
    }

    console.log(
      `✅ 增量导入完成: ` +
      `武器 +${stats.weapons.added}/~${stats.weapons.updated}, ` +
      `配置 +${stats.prices.configsAdded}/~${stats.prices.configsUpdated}, ` +
      `子弹 +${stats.bullets.added}/~${stats.bullets.updated}, ` +
      `护甲 +${stats.armors.added}/~${stats.armors.updated}`
    )

    return { data: this.data, params, equipState, stats, mode: 'merge' }
  }

  /**
   * ⭐ v7.3：清除所有导入标记
   */
  clearImportMarks() {
    let count = 0

    for (const w of this.data.weapons || []) {
      if (w._isImported) {
        delete w._isImported
        count++
      }
    }

    for (const p of this.data.prices || []) {
      for (const c of p.configs || []) {
        if (c._isImported) {
          delete c._isImported
          count++
        }
      }
    }

    console.log(`🧹 已清除 ${count} 个导入标记`)
    return count
  }

  importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const result = this.importFromJSON(event.target.result);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => {
        reject(new Error('读取文件失败'));
      };
      reader.readAsText(file);
    });
  }

  // ============================================================
  // 14. 数据重置
  // ============================================================

  resetToOriginal() {
    if (!this.originalData) {
      console.warn('没有原始数据可重置');
      return this.data;
    }

    this.data = JSON.parse(JSON.stringify(this.originalData));
    if (this.originalMuzzles) {
      this.muzzles = JSON.parse(JSON.stringify(this.originalMuzzles));
    }

    this.clearAllModified();
    console.log('✅ 数据已重置为初始状态');
    return this.data;
  }

  hasUnsavedChanges() {
    if (!this.originalData) return false;

    const current = JSON.stringify(this.serializeData(this.data));
    const original = JSON.stringify(this.serializeData(this.originalData));
    return current !== original;
  }

  // ============================================================
  // 15. 工具方法
  // ============================================================

  getStats() {
    return {
      weaponCount: this.data.weapons.length,
      bulletCount: this.data.bullets.length,
      priceCount: this.data.prices.length,
      armorCount: this.data.armors.length,
      otherItemCount: this.data.otherItems.length,
      muzzleCount: this.muzzles.length,
      isLoaded: this.isLoaded,
      hasUnsavedChanges: this.hasUnsavedChanges(),
      modifiedWeapons: this.modifiedWeaponIds.size
    };
  }

  findBulletIdByDisplay(bulletDisplay) {
    if (!bulletDisplay || bulletDisplay === '-' || bulletDisplay === '') return null;

    const str = String(bulletDisplay).trim();

    if (this.getBulletById(str)) return str;

    const idInParens = str.match(/\(([^()]+)\)$/)
    if (idInParens) {
      const maybeId = idInParens[1].trim()
      if (this.getBulletById(maybeId)) return maybeId
    }

    const match = str.match(/^(.+?)\s+Lv\.(\S+)(?:\s+(.+))?$/)
    if (match) {
      const caliber = match[1].trim()
      const level = match[2].trim()
      const name = match[3] ? match[3].trim() : null

      if (name) {
        const exact = this.data.bullets.find(b =>
          b.caliber === caliber &&
          String(b.level) === level &&
          (b.name || '') === name
        )
        if (exact) return exact.id
      }

      const candidates = this.data.bullets.filter(b =>
        b.caliber === caliber && String(b.level) === level
      )
      if (candidates.length > 0) {
        const defaultBullet = candidates.find(b => b.isDefault === true)
        return (defaultBullet || candidates[0]).id
      }

      const normalizedCaliber = caliber.replace(/mm$/i, '').toLowerCase()
      const byNormalized = this.data.bullets.find(b => {
        const bCal = String(b.caliber).replace(/mm$/i, '').toLowerCase()
        return bCal === normalizedCaliber && String(b.level) === level
      })
      if (byNormalized) return byNormalized.id
    }

    for (const b of this.data.bullets) {
      const display = this.getBulletDisplay(b)
      if (display === str) return b.id
    }

    return null
  }
}

// 导出单例
let dataManagerInstance = null;

export function getDataManager() {
  if (!dataManagerInstance) {
    dataManagerInstance = new DataManager();
  }
  return dataManagerInstance;
}

export default DataManager;