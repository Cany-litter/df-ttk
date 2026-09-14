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
 * - 已废弃：base / stMult
 */
import perf from '../utils/performance.js';

export class DataManager {
  constructor() {
    this.data = {
      weapons: [],
      bullets: [],
      prices: [],
      armors: []   // ⭐ 新增：护甲/头盔数据
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
    
    // 缓存管理器（由外部注入）
    this._cacheManager = null;
  }

  // ============================================================
  // 0. 缓存管理器注入
  // ============================================================

  setCacheManager(cacheManager) {
    this._cacheManager = cacheManager;
  }

  getCacheManager() {
    return this._cacheManager;
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
      console.log(`✅ DataManager: 加载了 ${this.data.weapons.length} 把武器, ${this.data.bullets.length} 种子弹, ${this.data.prices.length} 条价格配置, ${this.data.armors.length} 条护甲数据`);
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
    // armors 可以为空数组或不存在
    
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
   * 
   * ⭐ 统一处理：
   * 1. 武器 ranges：'Infinity' / null → Infinity
   * 2. 子弹 level：数字型字符串 → 数字
   * 3. 子弹 name：缺失时补空字符串
   * 4. 子弹 partMult：缺失时补默认 { head:1, chest:1, stomach:1, limbs:1 }
   * 5. 子弹 isDefault：缺失时补 false
   * 6. 子弹 isDefault 唯一性校验（同 caliber+level 只保留序号最小的）
   * 7. 配置 precision：缺失时补默认值 0.09
   * 8. 护甲 armors：缺失时补空数组
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
    
    // ---------- 2. ⭐ 子弹规范化 ----------
    if (Array.isArray(normalized.bullets)) {
      normalized.bullets.forEach(bullet => {
        // level 数字字符串 → 数字
        if (typeof bullet.level === 'string' && /^\d+$/.test(bullet.level)) {
          bullet.level = parseInt(bullet.level, 10);
        }

        // name 缺失补空
        if (bullet.name === undefined || bullet.name === null) {
          bullet.name = '';
        }

        // ⭐ partMult 缺失补默认
        if (!bullet.partMult || typeof bullet.partMult !== 'object') {
          bullet.partMult = { head: 1, chest: 1, stomach: 1, limbs: 1 };
        } else {
          // 规范化每个部位
          const pm = bullet.partMult;
          const fallback = { head: 1, chest: 1, stomach: 1, limbs: 1 };
          for (const key of ['head', 'chest', 'stomach', 'limbs']) {
            if (typeof pm[key] !== 'number' || !isFinite(pm[key])) {
              pm[key] = fallback[key];
            }
          }
        }

        // ⭐ isDefault 缺失补 false
        if (bullet.isDefault === undefined) {
          bullet.isDefault = false;
        }

        // ⭐ 兼容旧字段名 default
        if (bullet.default !== undefined) {
          if (bullet.default === true) {
            bullet.isDefault = true;
          }
          delete bullet.default;
        }

        // ⭐ 删除已废弃字段
        if (bullet.base !== undefined) {
          delete bullet.base;
        }
        if (bullet.stMult !== undefined) {
          delete bullet.stMult;
        }
      });

      // ⭐ isDefault 唯一性校验（同 caliber+level 只保留序号最小的）
      this._enforceDefaultUniqueness(normalized.bullets);
    }

    // ---------- 3. ⭐ 配置 precision 规范化 ----------
    if (Array.isArray(normalized.prices)) {
      normalized.prices.forEach(price => {
        if (Array.isArray(price.configs)) {
          price.configs.forEach(config => {
            if (typeof config.precision !== 'number' || isNaN(config.precision)) {
              config.precision = 0.09;
            }
          });
        }
      });
    }

    // ---------- 4. ⭐ 护甲 armors 规范化 ----------
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
      });
    }
    
    return normalized;
  }

  /**
   * ⭐ 强制 isDefault 唯一性（同 caliber+level 只保留一个）
   * 
   * 规则：
   * - 优先保留第一个 isDefault: true 的
   * - 如果都没有，取序号最小的
   * - 其他全部设为 false
   * 
   * @param {Array} bullets 
   * @private
   */
  _enforceDefaultUniqueness(bullets) {
    if (!Array.isArray(bullets)) return;

    // 按 caliber + level 分组
    const groups = new Map();
    for (const bullet of bullets) {
      const key = `${bullet.caliber}|${bullet.level}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(bullet);
    }

    let fixedCount = 0;

    for (const [key, group] of groups.entries()) {
      if (group.length <= 1) {
        // 只有一颗，确保它是默认
        if (group[0] && group[0].isDefault !== true) {
          group[0].isDefault = true;
        }
        continue;
      }

      // 按 ID 序号排序
      group.sort((a, b) => {
        const idxA = this._extractIndexFromId(a.id);
        const idxB = this._extractIndexFromId(b.id);
        return idxA - idxB;
      });

      // 找第一个 isDefault: true 的
      let firstDefault = group.find(b => b.isDefault === true);

      // 如果都没有，取序号最小的
      if (!firstDefault) {
        firstDefault = group[0];
        firstDefault.isDefault = true;
        fixedCount++;
      }

      // 其他全部取消
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

  /**
   * 从 ID 里提取序号
   * @private
   */
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

  getBulletById(id) {
    return this.data.bullets.find(b => b.id === id) || null;
  }

  /**
   * ⭐ 按口径+等级查找子弹
   * 
   * 同口径同等级有多颗时：
   * 1. 优先返回 isDefault === true 的
   * 2. 否则返回第一颗
   */
  getBulletByCaliberAndLevel(caliber, level) {
    const candidates = this.data.bullets.filter(b => 
      b.caliber === caliber && String(b.level) === String(level)
    );

    if (candidates.length === 0) return null;

    // ⭐ 优先返回默认子弹
    const defaultBullet = candidates.find(b => b.isDefault === true);
    if (defaultBullet) return defaultBullet;

    return candidates[0];
  }

  getBulletsByCaliber(caliber) {
    return this.data.bullets.filter(b => b.caliber === caliber);
  }

  /**
   * ⭐ 生成下一个子弹 ID（口径#序号）
   * 
   * 规则：
   * - 同口径内，找最大序号 + 1
   * - 如果该口径没有子弹，从 1 开始
   * - 序号一旦分配，永不变（稳定）
   * 
   * @param {string} caliber - 口径
   * @returns {string} 新 ID，如 "5.56x45mm#6"
   */
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

  /**
   * ⭐ 生成子弹的标准显示字符串
   * 格式：caliber Lv.level name
   * 
   * @param {Object} bullet 
   * @returns {string}
   */
  getBulletDisplay(bullet) {
    if (!bullet) return '-'
    const parts = [bullet.caliber, `Lv.${bullet.level}`]
    if (bullet.name) parts.push(bullet.name)
    return parts.join(' ')
  }

  /**
   * ⭐ 获取指定口径+等级的默认子弹
   * @param {string} caliber 
   * @param {number|string} level 
   * @returns {Object|null}
   */
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
      armorMult: bullet.armorMult || 1.0,
      pen: bullet.pen || 0,
      price: bullet.price || 0,
      _bulletId: bullet.id || ''
    }));
  }

  // ============================================================
  // 3.5. ⭐ 数据获取 - 护甲 / 头盔
  // ============================================================

  getArmors() {
    return this.data.armors || [];
  }

  getArmorsByType(type) {
    return (this.data.armors || []).filter(a => a.type === type);
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
      price: armorData.price || 0
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
      
      // ---------- ⭐ 解析子弹 ----------
      let bulletDisplay = '-';
      let bulletId = config.bullet || '';
      if (bulletId) {
        const bullet = this.getBulletById(bulletId);
        if (bullet) {
          bulletDisplay = this.getBulletDisplay(bullet);
        }
      }
      
      // ---------- 拼命中率字符串 ----------
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
      
      return {
        weaponName: weapon.name,
        configId: config.id || '#1',
        barrel: barrelName,
        barrelId: barrelId,
        muzzle: muzzleName,
        muzzleId: muzzleId,
        precision: precision,
        buildCode: config.buildCode || '-',
        price: config.price || 0,
        distance: distances,
        hitRate: hitRates,
        hitRateRaw: hitRateRaw,
        bulletDisplay: bulletDisplay,
        bulletId: bulletId,
        enabled: config.enabled !== undefined ? config.enabled : true,
        _weaponId: weaponId,
        _rawConfig: config,
        cache: config.cache || null,
        _cache: config.cache || null
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
  // 7. 数据更新 - 武器（含修改追踪）
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

  /**
   * ⭐ 新增子弹
   * - 如果没传 id，自动生成（口径#序号）
   * - 补 partMult / isDefault 默认值
   * - 同组没有默认时，自动设为默认
   */
  addBullet(bulletData) {
    if (!bulletData) return false;

    // 自动生成 ID
    if (!bulletData.id) {
      if (!bulletData.caliber) {
        console.warn('⚠️ addBullet: 缺少 caliber，无法生成 ID');
        return false;
      }
      bulletData.id = this.getNextBulletId(bulletData.caliber);
    }

    // 校验唯一性
    const existing = this.getBulletById(bulletData.id);
    if (existing) {
      console.warn(`⚠️ 子弹 ${bulletData.id} 已存在`);
      return false;
    }

    // 补默认值
    if (bulletData.level === undefined) bulletData.level = 4;
    if (bulletData.name === undefined) bulletData.name = '';
    if (bulletData.price === undefined) bulletData.price = 0;

    // ⭐ 补 partMult
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

    // ⭐ 处理 isDefault
    const sameGroup = this.data.bullets.filter(b =>
      b.caliber === bulletData.caliber && String(b.level) === String(bulletData.level)
    );
    const hasDefault = sameGroup.some(b => b.isDefault === true);

    if (bulletData.isDefault === undefined) {
      bulletData.isDefault = !hasDefault;   // 同组没默认 → 自动设为默认
    }

    if (bulletData.isDefault === true) {
      // 同组其他取消默认
      for (const b of sameGroup) {
        b.isDefault = false;
      }
    }

    this.data.bullets.push(bulletData);
    return true;
  }

  /**
   * ⭐ 更新子弹
   * - 禁止修改 caliber / id / isDefault（isDefault 走 setDefaultBullet）
   * - 支持 partMult
   * - 支持 armorMult / pen 数组形式
   */
  updateBullet(bulletId, updates) {
    const bullet = this.getBulletById(bulletId);
    if (!bullet) return false;

    // ⭐ 禁止修改 caliber
    if (updates.caliber !== undefined && updates.caliber !== bullet.caliber) {
      console.warn(`⚠️ 禁止修改子弹口径（${bullet.caliber} → ${updates.caliber}）。如需更改，请删除后重建。`);
      delete updates.caliber;
    }

    // ⭐ 禁止直接修改 id
    if (updates.id !== undefined && updates.id !== bullet.id) {
      console.warn(`⚠️ 禁止修改子弹 ID`);
      delete updates.id;
    }

    // ⭐ 禁止直接修改 isDefault（应该走 setDefaultBullet）
    if (updates.isDefault !== undefined) {
      console.warn(`⚠️ 请使用 setDefaultBullet() 设置默认子弹`);
      delete updates.isDefault;
    }

    // ⭐ 处理 partMult
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

    // armorMult 数组
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

    // pen 数组
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

    // ⭐ 记录被删子弹的组信息
    const removedBullet = this.data.bullets[index];
    const caliber = removedBullet.caliber;
    const level = removedBullet.level;
    const wasDefault = removedBullet.isDefault === true;
    
    this.data.bullets.splice(index, 1);

    // ⭐ 如果删除的是默认子弹，同组挑一颗补上
    if (wasDefault) {
      const remaining = this.data.bullets.filter(b =>
        b.caliber === caliber && String(b.level) === String(level)
      );
      if (remaining.length > 0) {
        // 按 ID 序号排序，取序号最小的
        remaining.sort((a, b) => this._extractIndexFromId(a.id) - this._extractIndexFromId(b.id));
        remaining[0].isDefault = true;
        console.log(`⭐ 删除默认子弹后，${remaining[0].id} 自动成为默认`);
      }
    }

    return true;
  }

  /**
   * ⭐ 设置子弹为默认
   * 
   * 规则：
   * - 同口径+同等级下，只能有一个默认
   * - 设置某颗为默认时，同组其他子弹的 isDefault 自动设为 false
   * 
   * @param {string} bulletId - 子弹 ID
   * @returns {boolean} 是否成功
   */
  setDefaultBullet(bulletId) {
    const bullet = this.getBulletById(bulletId);
    if (!bullet) {
      console.warn(`⚠️ setDefaultBullet: 子弹 ${bulletId} 不存在`);
      return false;
    }

    const caliber = bullet.caliber;
    const level = bullet.level;

    // 同组其他子弹取消默认
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
  // 11. 缓存管理
  // ============================================================

  getConfigCache(weaponId, configId) {
    const price = this.getPriceByWeaponId(weaponId);
    if (!price) return null;
    const config = price.configs.find(c => c.id === configId);
    return config?.cache || null;
  }

  saveConfigCache(weaponId, configId, cacheData) {
    const price = this.getPriceByWeaponId(weaponId);
    if (!price) return false;
    const config = price.configs.find(c => c.id === configId);
    if (!config) return false;
    
    config.cache = {
      keyPoints: cacheData.keyPoints,
      hash: cacheData.hash,
      cachedAt: new Date().toISOString()
    };
    return true;
  }

  clearWeaponCache(weaponId) {
    const price = this.getPriceByWeaponId(weaponId);
    if (!price) return 0;
    let count = 0;
    for (const config of price.configs) {
      if (config.cache) {
        delete config.cache;
        count++;
      }
    }
    if (count > 0) {
      console.log(`🗑️ 清除武器 ${weaponId} 的 ${count} 个缓存`);
    }
    return count;
  }

  clearAllCache() {
    let count = 0;
    for (const price of this.data.prices) {
      for (const config of price.configs) {
        if (config.cache) {
          delete config.cache;
          count++;
        }
      }
    }
    console.log(`🗑️ 清除所有缓存，共 ${count} 个`);
    return count;
  }

  getCacheStats() {
    let total = 0;
    let cached = 0;
    for (const price of this.data.prices) {
      for (const config of price.configs) {
        total++;
        if (config.cache) cached++;
      }
    }
    return { total, cached, modified: this.modifiedWeaponIds.size };
  }

  // ============================================================
  // 12. 导出排序方法（仅导出时使用）
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

  /**
   * ⭐ 子弹导出排序
   * 口径 → 等级 → isDefault（默认优先）→ ID 序号
   */
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

      // ⭐ 同口径同等级，默认排前面
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      
      // ⭐ 再按 ID 序号排序
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
  // 13. 数据序列化
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
  // 14. 数据导出/导入
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
        for (const price of dataToExport.prices || []) {
          for (const config of price.configs || []) {
            delete config.cache;
          }
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
        const points = content.match(/\{\s*"d":\s*([\d.]+),\s*"t":\s*([\d.]+)\s*\}/g);
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
      
      console.log(`✅ DataManager: 导入了 ${this.data.weapons.length} 把武器, ${this.data.bullets.length} 种子弹, ${this.data.armors.length} 条护甲数据`);
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
  // 15. 数据重置
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
  // 16. 工具方法
  // ============================================================

  getStats() {
    const cacheStats = this.getCacheStats();
    return {
      weaponCount: this.data.weapons.length,
      bulletCount: this.data.bullets.length,
      priceCount: this.data.prices.length,
      armorCount: this.data.armors.length,
      muzzleCount: this.muzzles.length,
      isLoaded: this.isLoaded,
      hasUnsavedChanges: this.hasUnsavedChanges(),
      modifiedWeapons: this.modifiedWeaponIds.size,
      cachedConfigs: cacheStats.cached,
      totalConfigs: cacheStats.total
    };
  }

  /**
   * ⭐ 从显示字符串反查子弹 ID
   * 
   * 支持的显示格式：
   *   1. "5.56x45mm#5"                      （纯 ID）
   *   2. "5.56x45mm Lv.4 M995"              （口径 + 等级 + 名称）
   *   3. "5.56x45mm Lv.4"                   （口径 + 等级，兼容旧格式）
   *   4. "5.56x45mm Lv.4 M995 (5.56x45mm#5)"（带 ID 括号）
   */
  findBulletIdByDisplay(bulletDisplay) {
    if (!bulletDisplay || bulletDisplay === '-' || bulletDisplay === '') return null;

    const str = String(bulletDisplay).trim();

    // 1. 纯 ID
    if (this.getBulletById(str)) return str;

    // 2. 尝试从括号里提取 ID
    const idInParens = str.match(/\(([^()]+)\)$/)
    if (idInParens) {
      const maybeId = idInParens[1].trim()
      if (this.getBulletById(maybeId)) return maybeId
    }

    // 3. 解析 "caliber Lv.level name" 或 "caliber Lv.level"
    const match = str.match(/^(.+?)\s+Lv\.(\S+)(?:\s+(.+))?$/)
    if (match) {
      const caliber = match[1].trim()
      const level = match[2].trim()
      const name = match[3] ? match[3].trim() : null

      // 3a. 精确匹配 caliber + level + name
      if (name) {
        const exact = this.data.bullets.find(b =>
          b.caliber === caliber &&
          String(b.level) === level &&
          (b.name || '') === name
        )
        if (exact) return exact.id
      }

      // 3b. 匹配 caliber + level（优先默认子弹）
      const candidates = this.data.bullets.filter(b =>
        b.caliber === caliber && String(b.level) === level
      )
      if (candidates.length > 0) {
        const defaultBullet = candidates.find(b => b.isDefault === true)
        return (defaultBullet || candidates[0]).id
      }

      // 3c. 规范化 caliber（去掉 mm 后缀）再试
      const normalizedCaliber = caliber.replace(/mm$/i, '').toLowerCase()
      const byNormalized = this.data.bullets.find(b => {
        const bCal = String(b.caliber).replace(/mm$/i, '').toLowerCase()
        return bCal === normalizedCaliber && String(b.level) === level
      })
      if (byNormalized) return byNormalized.id
    }

    // 4. 兜底：遍历所有子弹，匹配 display
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