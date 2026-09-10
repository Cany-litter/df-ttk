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
 * - bullets: 按口径 → 等级 排序
 * - prices: 按类型 → 武器名称 → 配置序号 排序
 */
import perf from '../utils/performance.js';

export class DataManager {
  constructor() {
    this.data = {
      weapons: [],
      bullets: [],
      prices: []
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
      console.log(`✅ DataManager: 加载了 ${this.data.weapons.length} 把武器, ${this.data.bullets.length} 种子弹, ${this.data.prices.length} 条价格配置`);
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
    
    return true;
  }

  /**
   * 规范化数据
   * 
   * ⭐ 统一处理：
   * 1. 武器 ranges：'Infinity' / null → Infinity
   * 2. 子弹 level：数字型字符串 → 数字（如 "4" → 4，保留 "RIP" 等特殊等级为字符串）
   * 
   * 修复目标：避免 getBulletByCaliberAndLevel 因类型不匹配（"4" vs 4）而找不到子弹。
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
    
    // ---------- 2. ⭐ 子弹 level 规范化 ----------
    // "4" / "5" 等纯数字字符串 → 数字
    // "RIP" / "M61" 等特殊等级 → 保持字符串
    if (Array.isArray(normalized.bullets)) {
      normalized.bullets.forEach(bullet => {
        if (typeof bullet.level === 'string' && /^\d+$/.test(bullet.level)) {
          bullet.level = parseInt(bullet.level, 10);
        }
      });
    }
    
    return normalized;
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
   * 按口径 + 等级查找子弹
   * 
   * ⭐ 用 String() 比较，兼容 level 是字符串还是数字的情况
   * （即使数据未经过 normalizeData，也能正确匹配）
   */
  getBulletByCaliberAndLevel(caliber, level) {
    return this.data.bullets.find(b => 
      b.caliber === caliber && String(b.level) === String(level)
    ) || null;
  }

  getBulletsByCaliber(caliber) {
    return this.data.bullets.filter(b => b.caliber === caliber);
  }

  getBulletRows() {
    return this.data.bullets.map(bullet => ({
      caliber: bullet.caliber || '-',
      level: bullet.level || '-',
      base: bullet.base || 1.0,
      armorMult: bullet.armorMult || 1.0,
      pen: bullet.pen || 0,
      price: bullet.price || 0,
      _bulletId: bullet.id || ''
    }));
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

  /**
   * 获取指定武器的价格行数据
   * ⭐ 包含 enabled 字段、cache 字段、hitRateRaw 字段
   */
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
          bulletDisplay = `${bullet.caliber} Lv.${bullet.level}`;
        }
      }
      
      // ---------- ⭐ 拼命中率字符串 ----------
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
      
      return {
        weaponName: weapon.name,
        configId: config.id || '#1',
        barrel: barrelName,
        barrelId: barrelId,
        muzzle: muzzleName,
        muzzleId: muzzleId,
        buildCode: config.buildCode || '-',
        price: config.price || 0,
        distance: distances,           // 原始数组
        hitRate: hitRates,             // 原始数组
        hitRateRaw: hitRateRaw,        // ⭐ 拼好的字符串
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

  /**
   * 获取所有价格行数据（UI 使用）
   */
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

  /**
   * 从命中率映射中获取指定距离的命中率（支持插值和外推）
   */
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

    // 强制在10米处确保100%命中率
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

  updateBullet(bulletId, updates) {
    const bullet = this.getBulletById(bulletId);
    if (!bullet) return false;
    
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

  addBullet(bulletData) {
    const existing = this.getBulletById(bulletData.id);
    if (existing) {
      console.warn(`子弹 ${bulletData.id} 已存在`);
      return false;
    }
    this.data.bullets.push(bulletData);
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
    
    this.data.bullets.splice(index, 1);
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
    
    const ttkAffectingKeys = ['barrelId', 'muzzleId', 'bullet', 'distance', 'hitRate'];
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
  // 12. 导出排序方法（仅导出时使用，不影响内存数据）
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
      return levelA - levelB;
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
      
      console.log(`✅ DataManager: 导入了 ${this.data.weapons.length} 把武器, ${this.data.bullets.length} 种子弹`);
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
      muzzleCount: this.muzzles.length,
      isLoaded: this.isLoaded,
      hasUnsavedChanges: this.hasUnsavedChanges(),
      modifiedWeapons: this.modifiedWeaponIds.size,
      cachedConfigs: cacheStats.cached,
      totalConfigs: cacheStats.total
    };
  }

  findBulletIdByDisplay(bulletDisplay) {
    if (!bulletDisplay || bulletDisplay === '-' || bulletDisplay === '') return null;
    
    const match = bulletDisplay.match(/^(.+?)\s+Lv\.(.+)$/);
    if (match) {
      const caliber = match[1].trim();
      const level = match[2].trim();
      
      let bullet = this.getBulletByCaliberAndLevel(caliber, level);
      if (bullet) return bullet.id;
      
      const normalizedCaliber = caliber.replace(/mm$/, '').toLowerCase();
      for (const b of this.data.bullets) {
        const bCaliber = b.caliber.replace(/mm$/, '').toLowerCase();
        if (bCaliber === normalizedCaliber && String(b.level) === String(level)) {
          return b.id;
        }
      }
    }
    
    for (const b of this.data.bullets) {
      const display = `${b.caliber} Lv.${b.level}`;
      if (display === bulletDisplay) {
        return b.id;
      }
    }
    
    return null;
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