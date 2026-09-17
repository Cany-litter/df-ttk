// src/core/DataManager.js
/**
 * 数据管理器
 * 负责数据的加载、保存、导入、导出和查询
 *
 * 数据流向：
 * 1. 从 data.json 加载原始数据
 * 2. 数据存储在 this.data 中
 * 3. 导出时序列化 this.data（排序后导出，不影响内存数据）
 * 4. 导入时替换 this.data
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
 * - armors: 按 type → level 排序
 *
 * ⭐ 子弹 ID 规范（v2）：
 * - 格式：${caliber}#${序号}
 * - 序号：口径内递增，按 level 升序 + name 字典序分配
 * - 稳定：序号一旦分配，不随 level/name 变化
 * - 禁止修改 caliber / id
 *
 * ⭐ 子弹字段（v2）：
 * - partMult: { head, chest, stomach, limbs } 各部位肉伤比例
 * - isDefault: 同 caliber+level 唯一，用于全局等级匹配
 * - enabled: 是否启用（默认 true）
 * - 已废弃：base / stMult
 *
 * ⭐ 护甲/头盔字段（v2）：
 * - enabled: 是否启用（默认 true）
 *
 * ⭐ 配置字段（v3）：
 * - aimSpeed: 开镜时间（ms），默认 0，影响评分（不影响 TTK）
 * - enabled: 是否启用（默认 true）
 *
 * ⭐ 统一缓存（v2）：
 * - 所有 TTK 缓存统一走 ttkCache（四层嵌套）
 * - 旧的 config.cache 已废弃，加载时自动删除
 * - 由 TtkCacheManager 管理
 *
 * ⭐ 已删除的旧 API：
 * - setCacheManager / getCacheManager
 * - getConfigCache / saveConfigCache
 * - clearWeaponCache / clearAllCache / getCacheStats
 */

// ============================================================
// 简化版性能监控（原 utils/performance.js 内联）
// DataManager 只用到了 mark()，其他方法（report / getDuration 等）没被引用
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

export class DataManager {
  constructor() {
    this.data = {
      weapons: [],
      bullets: [],
      prices: [],
      armors: [],
      // ⭐ 多维 TTK 缓存（唯一缓存，由 TtkCacheManager 管理）
      ttkCache: { v1: {} }
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

    // ⭐ 多维缓存管理器（由外部注入）
    this._ttkCacheManager = null;
  }

  // ============================================================
  // 0. 缓存管理器注入
  // ============================================================

  // ⭐ 多维缓存管理器
  setTtkCacheManager(mgr) {
    this._ttkCacheManager = mgr;
  }

  getTtkCacheManager() {
    return this._ttkCacheManager;
  }

  // ⭐ 多维缓存读写
  getTtkCache() {
    if (!this.data.ttkCache) {
      this.data.ttkCache = { v1: {} };
    }
    if (!this.data.ttkCache.v1) {
      this.data.ttkCache.v1 = {};
    }
    return this.data.ttkCache;
  }

  setTtkCache(cache) {
    this.data.ttkCache = cache || { v1: {} };
  }

  // ============================================================
  // 1. 数据加载
  // ============================================================

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

      this.data = this.normalizeData(rawData);
      this.originalData = JSON.parse(JSON.stringify(this.data));
      this.originalMuzzles = JSON.parse(JSON.stringify(this.muzzles));
      this.isLoaded = true;

      this.modifiedWeaponIds.clear();

      perf.mark('dataLoadDone', '数据加载完成');
      const ttkStats = this.getTtkCacheStats();
      console.log(
        `✅ DataManager: 加载了 ${this.data.weapons.length} 把武器, ` +
        `${this.data.bullets.length} 种子弹, ` +
        `${this.data.prices.length} 条价格配置, ` +
        `${this.data.armors.length} 条护甲数据, ` +
        `TTK缓存 ${ttkStats.entryCount} 条`
      );
      return this.data;

    } catch (error) {
      console.error('❌ DataManager: 加载数据失败:', error);
      throw error;
    }
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

    // ⭐ ttkCache 可选，校验存在时是对象
    if (data.ttkCache !== undefined && typeof data.ttkCache !== 'object') {
      console.warn('⚠️ ttkCache 格式无效，将重置为空');
    }

    return true;
  }

  /**
   * 规范化数据
   *
   * ⭐ 统一处理：
   * 1. 武器 ranges：'Infinity' / null → Infinity
   * 2. 子弹 level：数字型字符串 → 数字
   * 3. 子弹 name：缺失时补空字符串
   * 4. 子弹 partMult：缺失时补默认 { head:1, chest:1, stomach:1, limbs:1 }
   * 5. 子弹 isDefault：缺失时补 false
   * 6. 子弹 enabled：缺失时补 true
   * 7. 子弹 isDefault 唯一性校验
   * 8. 配置 precision：缺失时补默认值 0.09
   * 9. 配置 aimSpeed：缺失时补默认值 0
   * 10. 配置 enabled：缺失时补 true
   * 11. 护甲 armors：缺失时补空数组
   * 12. 护甲 enabled：缺失时补 true
   * 13. ⭐ ttkCache：缺失时补 { v1: {} }
   * 14. ⭐ config.cache：删除（旧缓存已废弃）
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

        if (bullet.isDefault === undefined) {
          bullet.isDefault = false;
        }

        // ⭐ 新增：enabled 默认 true
        if (bullet.enabled === undefined) {
          bullet.enabled = true;
        }

        if (bullet.default !== undefined) {
          if (bullet.default === true) {
            bullet.isDefault = true;
          }
          delete bullet.default;
        }

        if (bullet.base !== undefined) {
          delete bullet.base;
        }
        if (bullet.stMult !== undefined) {
          delete bullet.stMult;
        }
      });

      this._enforceDefaultUniqueness(normalized.bullets);
    }

    // ---------- 3. 配置规范化（precision + aimSpeed + enabled + ⭐ 删除旧缓存） ----------
    if (Array.isArray(normalized.prices)) {
      normalized.prices.forEach(price => {
        if (Array.isArray(price.configs)) {
          price.configs.forEach(config => {
            // precision
            if (typeof config.precision !== 'number' || isNaN(config.precision)) {
              config.precision = 0.09;
            }
            // aimSpeed
            if (typeof config.aimSpeed !== 'number' || isNaN(config.aimSpeed) || config.aimSpeed < 0) {
              config.aimSpeed = 0;
            }
            // ⭐ enabled 默认 true
            if (config.enabled === undefined) {
              config.enabled = true;
            }
            // ⭐ 删除旧缓存 config.cache（已废弃）
            if (config.cache !== undefined) {
              delete config.cache;
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
        if (!armor.type) {
          armor.type = 'armor';
        }
        if (typeof armor.level === 'string') {
          armor.level = parseInt(armor.level, 10) || 1;
        }
        if (typeof armor.value === 'string') {
          armor.value = parseFloat(armor.value) || 0;
        }
        if (typeof armor.price === 'string') {
          armor.price = parseFloat(armor.price) || 0;
        }
        // ⭐ 新增：enabled 默认 true
        if (armor.enabled === undefined) {
          armor.enabled = true;
        }
      });
    }

    // ---------- 5. ⭐ ttkCache 规范化 ----------
    if (!normalized.ttkCache || typeof normalized.ttkCache !== 'object') {
      normalized.ttkCache = { v1: {} };
    }
    if (!normalized.ttkCache.v1 || typeof normalized.ttkCache.v1 !== 'object') {
      normalized.ttkCache.v1 = {};
    }

    return normalized;
  }

  /**
   * 强制 isDefault 唯一性（同 caliber+level 只保留一个）
   */
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

  /**
   * 获取所有启用的子弹（enabled !== false）
   *
   * @returns {Array}
   */
  getEnabledBullets() {
    return (this.data.bullets || []).filter(b => b.enabled !== false);
  }

  getBulletById(id) {
    return this.data.bullets.find(b => b.id === id) || null;
  }

  /**
   * 按口径 + 等级查子弹
   *
   * ⭐ 默认只返回启用的子弹（enabled !== false）
   *
   * @param {string} caliber
   * @param {number} level
   * @param {boolean} [includeDisabled=false] - 是否包含禁用的
   * @returns {Object|null}
   */
  getBulletByCaliberAndLevel(caliber, level, includeDisabled = false) {
    let candidates = this.data.bullets.filter(b =>
      b.caliber === caliber && String(b.level) === String(level)
    );

    // ⭐ 过滤禁用的（除非显式要求包含）
    if (!includeDisabled) {
      candidates = candidates.filter(b => b.enabled !== false);
    }

    if (candidates.length === 0) return null;

    const defaultBullet = candidates.find(b => b.isDefault === true);
    if (defaultBullet) return defaultBullet;

    return candidates[0];
  }

  /**
   * 按口径查子弹
   *
   * ⭐ 默认只返回启用的子弹
   *
   * @param {string} caliber
   * @param {boolean} [includeDisabled=false]
   * @returns {Array}
   */
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

  getDefaultBullet(caliber, level) {
    const candidates = this.data.bullets.filter(b =>
      b.caliber === caliber && String(b.level) === String(level)
    );
    if (candidates.length === 0) return null;

    const defaultBullet = candidates.find(b => b.isDefault === true);
    return defaultBullet || candidates[0];
  }

  getBulletRows() {
    return this.data.bullets.map(bullet => ({
      caliber: bullet.caliber || '-',
      level: bullet.level || '-',
      name: bullet.name || '',
      partMult: bullet.partMult || { head: 1, chest: 1, stomach: 1, limbs: 1 },
      isDefault: bullet.isDefault === true,
      enabled: bullet.enabled !== false,
      armorMult: bullet.armorMult || 1.0,
      pen: bullet.pen || 0,
      price: bullet.price || 0,
      _bulletId: bullet.id || ''
    }));
  }

  // ============================================================
  // 3.5. 数据获取 - 护甲 / 头盔
  // ============================================================

  getArmors() {
    return this.data.armors || [];
  }

  /**
   * 按类型获取护甲/头盔
   *
   * ⭐ 默认只返回启用的
   *
   * @param {string} type - 'armor' | 'helmet'
   * @param {boolean} [includeDisabled=false]
   * @returns {Array}
   */
  getArmorsByType(type, includeDisabled = false) {
    let armors = (this.data.armors || []).filter(a => a.type === type);
    if (!includeDisabled) {
      armors = armors.filter(a => a.enabled !== false);
    }
    return armors;
  }

  /**
   * 获取所有启用的护甲/头盔
   *
   * @returns {Array}
   */
  getEnabledArmors() {
    return (this.data.armors || []).filter(a => a.enabled !== false);
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

  /**
   * ⭐ 批量启用/禁用护甲
   *
   * @param {string} type - 'armor' | 'helmet'
   * @param {boolean} enabled
   * @returns {number} 影响的条目数
   */
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

  getMuzzleNames() {
    return this.muzzles.map(m => m.name);
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
      // ---------- 解析枪管 ----------
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

      // ---------- 解析枪口 ----------
      let muzzleName = '无';
      const muzzleId = config.muzzleId !== undefined ? config.muzzleId : 0;
      const muzzle = this.getMuzzleById(muzzleId);
      if (muzzle) {
        muzzleName = muzzle.name;
      }
      if (config.muzzle && config.muzzle !== '无') {
        muzzleName = config.muzzle;
      }

      // ---------- 解析子弹 ----------
      let bulletDisplay = '-';
      let bulletId = config.bullet || '';
      if (bulletId) {
        const bullet = this.getBulletById(bulletId);
        if (bullet) {
          bulletDisplay = this.getBulletDisplay(bullet);
        }
      }

      // ---------- 拼装命中率字符串 ----------
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

      // ---------- 精校 ----------
      const precision = (typeof config.precision === 'number' && !isNaN(config.precision))
        ? config.precision
        : 0.09;

      // 开镜速度
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
    if (!weapon) {
      return -1;
    }

    if (!Array.isArray(weapon.barrels) || weapon.barrels.length === 0) {
      return -1;
    }

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
      console.warn(`⚠️ 禁止修改子弹口径（${bullet.caliber} → ${updates.caliber}）。如需更改，请删除后重建。`);
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

    console.log(`⭐ 设置默认子弹: ${bulletId} (${bullet.name} Lv.${level})，同组取消 ${changed} 个`);
    return true;
  }

  /**
   * ⭐ 批量启用/禁用子弹
   *
   * @param {boolean} enabled
   * @param {string} [caliber] - 可选，只操作某口径
   * @returns {number} 影响的条目数
   */
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
    console.log('📝 已清除所有修改标记');
  }

  // ============================================================
  // 11. 导出排序方法（仅导出时使用）
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

    if (typeof level === 'number' && level >= 1 && level <= 5) {
      return level;
    }
    if (typeof level === 'string' && /^[1-5]$/.test(level)) {
      return parseInt(level);
    }

    const specialLevels = ['AP', 'BT+P', 'CT', 'Double', 'M61', 'RIP', 'ST4', 'ST5', 'SUPER'];
    const index = specialLevels.indexOf(String(level));
    if (index !== -1) {
      return 100 + index;
    }

    return 999;
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

  exportToJSON(includeCache = true) {
    try {
      const dataToExport = JSON.parse(JSON.stringify(this.data));

      if (Array.isArray(dataToExport.weapons)) {
        dataToExport.weapons = dataToExport.weapons.filter(w => !w._isNewRow);
      }

      this._sortWeaponsForExport(dataToExport.weapons);
      this._sortBulletsForExport(dataToExport.bullets);
      this._sortArmorsForExport(dataToExport.armors);

      const weaponsMap = new Map();
      if (Array.isArray(dataToExport.weapons)) {
        dataToExport.weapons.forEach(w => weaponsMap.set(w.id, w));
      }

      this._sortPricesForExport(dataToExport.prices, weaponsMap);

      if (!includeCache) {
        // ⭐ 清空 ttkCache
        if (dataToExport.ttkCache) {
          dataToExport.ttkCache = { v1: {} };
        }
      }

      const serialized = this.serializeData(dataToExport);

      let json = JSON.stringify(serialized, null, 2);
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

  exportToFile(filename = null, includeCache = true) {
    const jsonStr = this.exportToJSON(includeCache);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `ttk_data_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`✅ 数据已导出到: ${a.download}${includeCache ? ' (含缓存)' : ' (不含缓存)'}`);
  }

  importFromJSON(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!this.validateData(parsed)) {
        throw new Error('无效的数据格式');
      }

      const normalized = this.normalizeData(parsed);
      this.data = normalized;
      this.originalData = JSON.parse(JSON.stringify(normalized));
      this.isLoaded = true;

      this.clearAllModified();

      const ttkStats = this.getTtkCacheStats();
      console.log(
        `✅ DataManager: 导入了 ${this.data.weapons.length} 把武器, ` +
        `${this.data.bullets.length} 种子弹, ` +
        `${this.data.armors.length} 条护甲数据, ` +
        `TTK缓存 ${ttkStats.entryCount} 条`
      );
      return this.data;

    } catch (error) {
      console.error('导入 JSON 失败:', error);
      throw error;
    }
  }

  importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = this.importFromJSON(event.target.result);
          resolve(data);
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
    const ttkStats = this.getTtkCacheStats();
    return {
      weaponCount: this.data.weapons.length,
      bulletCount: this.data.bullets.length,
      priceCount: this.data.prices.length,
      armorCount: this.data.armors.length,
      muzzleCount: this.muzzles.length,
      isLoaded: this.isLoaded,
      hasUnsavedChanges: this.hasUnsavedChanges(),
      modifiedWeapons: this.modifiedWeaponIds.size,
      ttkCacheEntries: ttkStats.entryCount || 0
    };
  }

  /**
   * ⭐ 获取 ttkCache 统计（通过 TtkCacheManager）
   */
  getTtkCacheStats() {
    if (this._ttkCacheManager) {
      return this._ttkCacheManager.getStats();
    }
    // 降级：直接读数据结构
    const cache = this.getTtkCache();
    if (!cache?.v1) return { weaponCount: 0, bulletCount: 0, entryCount: 0, sizeKB: 0 };

    let entryCount = 0;
    const weaponKeys = Object.keys(cache.v1);
    for (const wk of weaponKeys) {
      const bullets = Object.keys(cache.v1[wk]);
      for (const bid of bullets) {
        const defenders = Object.keys(cache.v1[wk][bid]);
        for (const dk of defenders) {
          entryCount += Object.keys(cache.v1[wk][bid][dk]).length;
        }
      }
    }
    return { weaponCount: weaponKeys.length, entryCount };
  }

  /**
   * 从显示字符串反查子弹 ID
   */
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