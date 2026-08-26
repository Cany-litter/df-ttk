/**
 * 数据管理器
 * 负责数据的加载、保存、导入、导出和查询
 * 
 * 数据流向：
 * 1. 从 data.json 加载原始数据
 * 2. 数据存储在 this.data 中
 * 3. 导出时序列化 this.data
 * 4. 导入时替换 this.data
 * 5. 重置时恢复 this.originalData
 * 
 * 修改追踪：
 * - modifiedWeaponIds: 记录被修改的武器 ID
 * - 用于增量计算，只重新计算被修改的武器
 */
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
  }

  // ============================================================
  // 1. 数据加载
  // ============================================================

  /**
   * 从 JSON 文件加载所有数据
   * @param {string} url - data.json 的路径
   * @returns {Promise<Object>} 加载的数据对象
   */
  async loadFromJSON(url = './data.json') {
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
      
      // 加载完成后清空修改标记
      this.modifiedWeaponIds.clear();
      
      console.log(`✅ DataManager: 加载了 ${this.data.weapons.length} 把武器, ${this.data.bullets.length} 种子弹, ${this.data.prices.length} 条价格配置`);
      return this.data;
      
    } catch (error) {
      console.error('❌ DataManager: 加载数据失败:', error);
      throw error;
    }
  }

  /**
   * 验证数据格式
   */
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
   * 将 JSON 中的 "Infinity" 和 null 转换为 Infinity
   */
  normalizeData(data) {
    const normalized = JSON.parse(JSON.stringify(data));
    
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

  getBulletByCaliberAndLevel(caliber, level) {
    return this.data.bullets.find(b => 
      b.caliber === caliber && b.level === level
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
   * ⭐ 包含 enabled 字段和 cache 字段
   */
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
      if (config.bullet) {
        const bullet = this.getBulletById(config.bullet);
        if (bullet) {
          bulletDisplay = `${bullet.caliber} Lv.${bullet.level}`;
        }
      }
      
      return {
        weaponName: weapon.name,
        // ⭐ 确保 configId 是字符串格式 "#1", "#2", "#3"
        configId: config.id || '#1',
        barrel: barrelName,
        barrelId: barrelId,
        muzzle: muzzleName,
        muzzleId: muzzleId,
        buildCode: config.buildCode || '-',
        price: config.price || 0,
        distance: config.distance || [],
        hitRate: config.hitRate || [],
        bulletDisplay: bulletDisplay,
        bulletId: config.bullet || '',
        enabled: config.enabled !== undefined ? config.enabled : true,
        _weaponId: weaponId,
        _rawConfig: config,
        // ⭐ 直接引用 config.cache（原始引用，不是副本）
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

    // 距离小于最近的点
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

    // 距离大于最远的点
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

    // 线性插值
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

  /**
   * 获取下一个配置 ID（使用 #1, #2, #3 格式）
   */
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
    
    if (updates.armorMult !== undefined || updates.pen !== undefined) {
      const newArmorMult = updates.armorMult ?? bullet.armorMult;
      const newPen = updates.pen ?? bullet.pen;
      if (bullet.armorData) {
        for (let i = 1; i <= 6; i++) {
          if (bullet.armorData[i]) {
            if (updates.armorMult !== undefined) {
              bullet.armorData[i].armorMult = newArmorMult;
            }
            if (updates.pen !== undefined) {
              bullet.armorData[i].pen = newPen;
            }
          }
        }
      }
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
  // 9. 数据更新 - 价格（含修改追踪）
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
    
    // 判断哪些字段影响 TTK 计算
    const ttkAffectingKeys = ['barrelId', 'muzzleId', 'bullet', 'distance', 'hitRate'];
    const hasTtkAffectingChange = Object.keys(updates).some(key => 
      ttkAffectingKeys.includes(key)
    );
    
    Object.assign(config, updates);
    
    if (hasTtkAffectingChange) {
      this.markWeaponModified(weaponId);
    }
    
    return true;
  }

  addPriceConfig(weaponId, configData) {
    const price = this.getPriceByWeaponId(weaponId);
    if (!price) return false;
    
    if (configData.enabled === undefined) {
      configData.enabled = true;
    }
    
    const existing = price.configs.find(c => c.id === configData.id);
    if (existing) {
      console.warn(`配置 ${configData.id} 已存在`);
      return false;
    }
    
    price.configs.push(configData);
    this.markWeaponModified(weaponId);
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
  // 12. 数据序列化
  // ============================================================

  /**
   * 序列化数据（将 Infinity 转为 "Infinity"）
   */
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
   * 导出 JSON（含缓存）
   * @param {boolean} includeCache - 是否包含缓存数据
   * @returns {string} JSON 字符串
   */
  exportToJSON(includeCache = true) {
    try {
      const dataToExport = this.serializeData(this.data);
      
      // 如果不包含缓存，清除所有 cache 字段
      if (!includeCache) {
        for (const price of dataToExport.prices || []) {
          for (const config of price.configs || []) {
            delete config.cache;
          }
        }
      }
      
      // 正常序列化
      let json = JSON.stringify(dataToExport, null, 2);
      
      // 压缩 armorData：将多行压缩为单行
      json = this._compressArmorData(json);
      
      // 压缩 keyPoints 数组
      json = this._compressKeyPoints(json);
      
      return json;
    } catch (error) {
      console.error('导出 JSON 失败:', error);
      throw error;
    }
  }

  /**
   * 压缩 armorData 格式
   * 将多行压缩为单行：{ "armorMult": 0.6, "pen": 0.5 }
   */
  _compressArmorData(json) {
    // 匹配 armorData 对象中的所有等级条目
    return json.replace(
      /"(\d+)":\s*\{\s*\n\s*"armorMult":\s*([\d.]+),\s*\n\s*"pen":\s*([\d.]+)\s*\n\s*\}/g,
      (match, level, armorMult, pen) => {
        return `"${level}": { "armorMult": ${armorMult}, "pen": ${pen} }`;
      }
    );
  }

  /**
   * 压缩 keyPoints 数组
   * 将多行 keyPoints 压缩为单行：[{ "d": 0, "t": 123.45 }, { "d": 100, "t": 234.56 }]
   */
  _compressKeyPoints(json) {
    // 匹配 keyPoints 数组并压缩
    return json.replace(
      /"keyPoints":\s*\[\s*\n\s*((?:\{[^}]*\},\s*\n\s*)*\{[^}]*\})\s*\n\s*\]/g,
      (match, content) => {
        // 提取所有点 {"d": 0, "t": 123.45}
        const points = content.match(/\{\s*"d":\s*([\d.]+),\s*"t":\s*([\d.]+)\s*\}/g);
        if (!points) return match;
        
        // 压缩为单行数组
        const compressed = points.map(p => p.replace(/\s+/g, ' ').trim());
        return `"keyPoints": [${compressed.join(', ')}]`;
      }
    );
  }

  /**
   * 导出到文件
   * @param {string} filename - 文件名
   * @param {boolean} includeCache - 是否包含缓存
   */
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

  /**
   * 从 JSON 字符串导入数据
   */
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
      
      // 导入后清空修改标记
      this.clearAllModified();
      
      console.log(`✅ DataManager: 导入了 ${this.data.weapons.length} 把武器, ${this.data.bullets.length} 种子弹`);
      return this.data;
      
    } catch (error) {
      console.error('导入 JSON 失败:', error);
      throw error;
    }
  }

  /**
   * 从文件导入
   */
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
    if (!bulletDisplay || bulletDisplay === '-') return null;
    
    const match = bulletDisplay.match(/^(.+?)\s+Lv\.(.+)$/);
    if (!match) return null;
    
    const caliber = match[1];
    const level = match[2];
    
    const bullet = this.getBulletByCaliberAndLevel(caliber, level);
    return bullet ? bullet.id : null;
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