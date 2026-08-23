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
    
    // 🔥 枪口数据 - 从 WeaponManager 迁移
    this.muzzles = [
      { id: 0, name: '无', mult: 0 },
      { id: 1, name: '死寂', mult: 0.24 },
      { id: 2, name: '先进/轻语/勇火', mult: 0.18 },
      { id: 3, name: '冲锋枪回声消音器', mult: 0.30 }
    ];
    this.originalMuzzles = null;
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
      
      // 验证数据结构
      if (!this.validateData(rawData)) {
        throw new Error('数据格式无效，请检查 data.json 文件');
      }
      
      // 规范化数据（处理 Infinity 等）
      this.data = this.normalizeData(rawData);
      // 保存原始数据副本（用于重置）
      this.originalData = JSON.parse(JSON.stringify(this.data));
      // 🔥 保存枪口数据副本
      this.originalMuzzles = JSON.parse(JSON.stringify(this.muzzles));
      this.isLoaded = true;
      
      console.log(`✅ DataManager: 加载了 ${this.data.weapons.length} 把武器, ${this.data.bullets.length} 种子弹, ${this.data.prices.length} 条价格配置`);
      console.log(`✅ DataManager: 加载了 ${this.muzzles.length} 个枪口配置`);
      return this.data;
      
    } catch (error) {
      console.error('❌ DataManager: 加载数据失败:', error);
      throw error;
    }
  }

  /**
   * 验证数据格式
   * @param {Object} data - 待验证的数据
   * @returns {boolean} 是否有效
   */
  validateData(data) {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.weapons) || data.weapons.length === 0) return false;
    if (!Array.isArray(data.bullets) || data.bullets.length === 0) return false;
    if (!Array.isArray(data.prices)) return false;
    
    // 验证每把武器是否有 id 和 allowedBullet
    for (const weapon of data.weapons) {
      if (!weapon.id || !weapon.name || !weapon.allowedBullet) {
        console.warn('⚠️ 武器数据缺失必要字段:', weapon);
        return false;
      }
    }
    
    return true;
  }

  /**
   * 规范化数据（处理 Infinity、字符串转换等）
   * @param {Object} data - 原始数据
   * @returns {Object} 规范化后的数据
   */
  normalizeData(data) {
    const normalized = JSON.parse(JSON.stringify(data));
    
    // 处理 weapons 中的 ranges
    if (Array.isArray(normalized.weapons)) {
      normalized.weapons.forEach(weapon => {
        if (Array.isArray(weapon.ranges)) {
          weapon.ranges = weapon.ranges.map(r => 
            r === 'Infinity' || r === '∞' ? Infinity : Number(r)
          );
        }
        // 处理 barrels 中的 ranges
        if (Array.isArray(weapon.barrels)) {
          weapon.barrels.forEach((barrel) => {
            if (Array.isArray(barrel.ranges)) {
              barrel.ranges = barrel.ranges.map(r => 
                r === 'Infinity' || r === '∞' ? Infinity : Number(r)
              );
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

  /**
   * 获取所有武器
   * @returns {Array} 武器数组
   */
  getWeapons() {
    return this.data.weapons || [];
  }

  /**
   * 根据 ID 获取武器
   * @param {number} id - 武器 ID
   * @returns {Object|null} 武器对象
   */
  getWeaponById(id) {
    // 处理 id 可能是字符串的情况
    const targetId = typeof id === 'string' ? parseInt(id) : id;
    return this.data.weapons.find(w => w.id === targetId) || null;
  }

  // ============================================================
  // 3. 数据获取 - 子弹
  // ============================================================

  /**
   * 获取所有子弹
   * @returns {Array} 子弹数组
   */
  getBullets() {
    return this.data.bullets || [];
  }

  /**
   * 根据 ID 获取子弹
   * @param {string} id - 子弹 ID
   * @returns {Object|null} 子弹对象
   */
  getBulletById(id) {
    return this.data.bullets.find(b => b.id === id) || null;
  }

  /**
   * 根据口径和等级获取子弹
   * @param {string} caliber - 子弹口径
   * @param {string|number} level - 子弹等级
   * @returns {Object|null} 子弹对象
   */
  getBulletByCaliberAndLevel(caliber, level) {
    return this.data.bullets.find(b => 
      b.caliber === caliber && b.level === level
    ) || null;
  }

  /**
   * 获取武器的可用子弹列表（根据口径）
   * @param {string} caliber - 武器口径
   * @returns {Array} 子弹数组
   */
  getBulletsByCaliber(caliber) {
    return this.data.bullets.filter(b => b.caliber === caliber);
  }

  /**
   * 获取子弹的表格数据（用于子弹 Tab 展示）
   * @returns {Array} 子弹行数据数组
   */
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

  /**
   * 获取所有枪口
   * @returns {Array} 枪口数组
   */
  getMuzzles() {
    return this.muzzles || [];
  }

  /**
   * 根据 ID 获取枪口
   * @param {number} id - 枪口 ID
   * @returns {Object|null} 枪口对象
   */
  getMuzzleById(id) {
    const targetId = typeof id === 'string' ? parseInt(id) : id;
    return this.muzzles.find(m => m.id === targetId) || null;
  }

  /**
   * 获取枪口的属性加成
   * @param {number} muzzleId - 枪口 ID
   * @returns {Object} 枪口加成 { rangeMult, velocityMult }
   */
  getMuzzleBonuses(muzzleId) {
    const muzzle = this.getMuzzleById(muzzleId);
    if (!muzzle) {
      return { rangeMult: 0, velocityMult: 1.0 };
    }
    // mult 是射程倍率加成（百分比），例如 0.24 表示 +24%
    return {
      rangeMult: muzzle.mult || 0,
      velocityMult: 1.0 + (muzzle.mult || 0)  // 初速倍率 = 1 + 射程加成
    };
  }

  /**
   * 获取枪口显示名称列表（用于下拉选择）
   * @returns {Array} 枪口名称数组
   */
  getMuzzleNames() {
    return this.muzzles.map(m => m.name);
  }

  // ============================================================
  // 5. 数据获取 - 价格
  // ============================================================

  /**
   * 获取所有价格配置
   * @returns {Array} 价格配置数组
   */
  getPrices() {
    return this.data.prices || [];
  }

  /**
   * 根据武器 ID 获取价格配置
   * @param {number} weaponId - 武器 ID
   * @returns {Object|null} 价格配置对象
   */
  getPriceByWeaponId(weaponId) {
    return this.data.prices.find(p => p.weaponId === weaponId) || null;
  }

  /**
   * 🔥 根据武器ID和枪管名称查找 barrelId
   * @param {number} weaponId - 武器 ID
   * @param {string} barrelName - 枪管名称
   * @returns {number} barrelId，未找到返回 -1
   */
  findBarrelIdByName(weaponId, barrelName) {
    if (weaponId === undefined || weaponId === null) {
      return -1;
    }
    
    const weapon = this.getWeaponById(weaponId);
    if (!weapon || !Array.isArray(weapon.barrels) || weapon.barrels.length === 0) {
      return -1;
    }
    
    const index = weapon.barrels.findIndex(b => b.name === barrelName);
    return index;
  }

  /**
   * 🔥 获取武器的价格信息（用于价格 Tab 展示）
   * 修复：如果 config.barrelId 无效，从 config.barrel 名称反向查找
   * @param {number} weaponId - 武器 ID
   * @returns {Array} 价格配置列表（展开后的行数据）
   */
  getPriceRowsForWeapon(weaponId) {
    const weapon = this.getWeaponById(weaponId);
    const price = this.getPriceByWeaponId(weaponId);
    
    if (!weapon || !price) return [];
    
    return price.configs.map(config => {
      // 🔥 修复：获取枪管 ID
      let barrelId = config.barrelId !== undefined ? config.barrelId : -1;
      let barrelName = '无';
      
      // 如果 barrelId 无效（-1 或 undefined），尝试从 barrel 名称反向查找
      if (barrelId === -1 || barrelId === undefined) {
        // 如果 config 中有 barrel 名称，尝试查找
        if (config.barrel && config.barrel !== '无') {
          const foundIndex = this.findBarrelIdByName(weaponId, config.barrel);
          if (foundIndex >= 0) {
            barrelId = foundIndex;
            barrelName = config.barrel;
          }
        }
      } else if (barrelId >= 0 && weapon.barrels && weapon.barrels[barrelId]) {
        // barrelId 有效，从武器中获取名称
        barrelName = weapon.barrels[barrelId].name || '无';
      }
      
      // 如果还是无效，使用空枪管
      if (barrelId === -1 || barrelId === undefined) {
        barrelName = '无';
      }
      
      // 🔥 获取枪口显示名称
      let muzzleName = '无';
      const muzzleId = config.muzzleId !== undefined ? config.muzzleId : 0;
      const muzzle = this.getMuzzleById(muzzleId);
      if (muzzle) {
        muzzleName = muzzle.name;
      }
      // 如果 config 中直接保存了 muzzle 名称，优先使用
      if (config.muzzle && config.muzzle !== '无') {
        muzzleName = config.muzzle;
      }
      
      // 获取子弹显示名称
      let bulletDisplay = '-';
      if (config.bullet) {
        const bullet = this.getBulletById(config.bullet);
        if (bullet) {
          bulletDisplay = `${bullet.caliber} Lv.${bullet.level}`;
        }
      }
      
      return {
        weaponName: weapon.name,
        configId: config.id,
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
        _weaponId: weaponId,
        _rawConfig: config
      };
    });
  }

  /**
   * 构建价格的完整数据（用于价格 Tab 展示）
   * @returns {Array} 价格行数据数组
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

  /**
   * 获取武器在指定距离的命中率
   * @param {number} weaponId - 武器 ID
   * @param {string} configId - 配置 ID (cfg-1, cfg-2, ...)
   * @param {number} distance - 距离 (米)
   * @param {Array|number} fallback - 后备命中率映射或单个值
   * @returns {number} 命中率
   */
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
    
    // 检查是否有 distance 和 hitRate 配置
    if (!config.distance || !config.hitRate || 
        !Array.isArray(config.distance) || !Array.isArray(config.hitRate) ||
        config.distance.length === 0 || config.hitRate.length === 0) {
      if (Array.isArray(fallback) && fallback.length > 0) {
        return this.getHitRateFromMap(fallback, distance, 0.85);
      }
      return typeof fallback === 'number' ? fallback : 0.85;
    }
    
    // 根据距离查找对应的命中率
    for (let i = 0; i < config.distance.length; i++) {
      if (distance <= config.distance[i]) {
        return config.hitRate[i];
      }
    }
    
    // 超出最大距离，使用最后一个
    return config.hitRate[config.hitRate.length - 1];
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
   * 获取下一个可用的配置 ID
   * @param {number} weaponId - 武器 ID
   * @returns {string} 下一个配置 ID
   */
  getNextConfigId(weaponId) {
    const price = this.getPriceByWeaponId(weaponId);
    if (!price || !price.configs || price.configs.length === 0) {
      return 'cfg-1';
    }
    const ids = price.configs.map(c => {
      const num = parseInt(c.id.replace('cfg-', ''));
      return isNaN(num) ? 0 : num;
    });
    const maxId = Math.max(...ids);
    return `cfg-${maxId + 1}`;
  }

  // ============================================================
  // 6. 工具方法 - 枪管
  // ============================================================

  /**
   * 🔥 查找射程最长的枪管索引（只对 AKM 打印日志）
   * @param {number} weaponId - 武器 ID
   * @returns {number} 最佳枪管索引，如果没有枪管则返回 -1
   */
  findBestBarrelIndex(weaponId) {
    const weapon = this.getWeaponById(weaponId);
    if (!weapon) {
      // 🔥 只在武器是 AKM (ID: 2) 时打印警告
      if (weaponId === 2) {
        console.warn(`⚠️ findBestBarrelIndex: 未找到武器 ID ${weaponId}`);
      }
      return -1;
    }
    
    if (!Array.isArray(weapon.barrels) || weapon.barrels.length === 0) {
      // 🔥 只在武器是 AKM (ID: 2) 时打印日志
      if (weaponId === 2) {
        console.log(`ℹ️ findBestBarrelIndex: 武器 ${weapon.name} 没有枪管`);
      }
      return -1;
    }
    
    let bestIndex = -1;
    let bestScore = -Infinity;
    
    weapon.barrels.forEach((barrel, index) => {
      // 计算射程评分
      let score = 0;
      
      // 1. 如果有自定义 ranges，使用 ranges 的第一个值作为评分
      if (Array.isArray(barrel.ranges) && barrel.ranges.length > 0) {
        const firstRange = barrel.ranges[0];
        if (firstRange === Infinity) {
          score = 10000; // Infinity 视为最大
        } else if (typeof firstRange === 'number') {
          score = firstRange;
        }
      }
      
      // 2. 如果有 rangeMult，乘以 100 作为基础分
      if (barrel.rangeMult !== undefined && barrel.rangeMult !== null) {
        score = Math.max(score, (barrel.rangeMult || 1.0) * 100);
      }
      
      // 3. 如果有 rangeAdd，额外加分（作为辅助）
      if (barrel.rangeAdd !== undefined && barrel.rangeAdd !== null) {
        score += (barrel.rangeAdd || 0) * 0.5;
      }
      
      // 4. 如果枪管有名称包含"长"或"超长"，额外加分（备用）
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
    
    // 🔥 只在武器是 AKM (ID: 2) 时打印日志
    if (weaponId === 2) {
      console.log(`🔍 findBestBarrelIndex: 武器 ${weapon.name} (ID: ${weaponId}) 最佳枪管索引 = ${bestIndex}, 评分 = ${bestScore}`);
      if (bestIndex >= 0 && weapon.barrels[bestIndex]) {
        console.log(`  枪管名称: ${weapon.barrels[bestIndex].name}`);
      }
    }
    
    return bestIndex;
  }

  /**
   * 🔥 查找射程最长的枪管名称（只对 AKM 打印日志）
   * @param {number} weaponId - 武器 ID
   * @returns {string} 最佳枪管名称，如果没有枪管则返回 '无'
   */
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

  /**
   * 更新武器数据
   * @param {number} weaponId - 武器 ID
   * @param {Object} updates - 更新的字段
   * @returns {boolean} 是否更新成功
   */
  updateWeapon(weaponId, updates) {
    const weapon = this.getWeaponById(weaponId);
    if (!weapon) return false;
    
    Object.assign(weapon, updates);
    return true;
  }

  /**
   * 更新武器枪管数据
   * @param {number} weaponId - 武器 ID
   * @param {number} barrelIndex - 枪管索引
   * @param {Object} updates - 更新的字段
   * @returns {boolean} 是否更新成功
   */
  updateWeaponBarrel(weaponId, barrelIndex, updates) {
    const weapon = this.getWeaponById(weaponId);
    if (!weapon || !Array.isArray(weapon.barrels)) return false;
    if (barrelIndex < 0 || barrelIndex >= weapon.barrels.length) return false;
    
    Object.assign(weapon.barrels[barrelIndex], updates);
    return true;
  }

  /**
   * 添加新枪管到武器
   * @param {number} weaponId - 武器 ID
   * @param {Object} barrelData - 枪管数据
   * @returns {number} 新枪管的索引
   */
  addWeaponBarrel(weaponId, barrelData) {
    const weapon = this.getWeaponById(weaponId);
    if (!weapon) return -1;
    if (!Array.isArray(weapon.barrels)) {
      weapon.barrels = [];
    }
    weapon.barrels.push(barrelData);
    return weapon.barrels.length - 1;
  }

  /**
   * 删除武器枪管
   * @param {number} weaponId - 武器 ID
   * @param {number} barrelIndex - 枪管索引
   * @returns {boolean} 是否删除成功
   */
  removeWeaponBarrel(weaponId, barrelIndex) {
    const weapon = this.getWeaponById(weaponId);
    if (!weapon || !Array.isArray(weapon.barrels)) return false;
    if (barrelIndex < 0 || barrelIndex >= weapon.barrels.length) return false;
    
    // 同时更新 prices 中引用该枪管的配置
    const price = this.getPriceByWeaponId(weaponId);
    if (price && Array.isArray(price.configs)) {
      price.configs.forEach(config => {
        if (config.barrelId === barrelIndex) {
          config.barrelId = -1; // 设为无
        } else if (config.barrelId > barrelIndex) {
          config.barrelId--; // 索引前移
        }
      });
    }
    
    weapon.barrels.splice(barrelIndex, 1);
    return true;
  }

  // ============================================================
  // 8. 数据更新 - 子弹
  // ============================================================

  /**
   * 更新子弹数据
   * @param {string} bulletId - 子弹 ID
   * @param {Object} updates - 更新的字段
   * @returns {boolean} 是否更新成功
   */
  updateBullet(bulletId, updates) {
    const bullet = this.getBulletById(bulletId);
    if (!bullet) return false;
    
    // 如果更新了 armorMult 或 pen，同步更新 armorData
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
    return true;
  }

  /**
   * 添加子弹
   * @param {Object} bulletData - 子弹数据
   * @returns {boolean} 是否添加成功
   */
  addBullet(bulletData) {
    // 检查是否已存在
    const existing = this.getBulletById(bulletData.id);
    if (existing) {
      console.warn(`子弹 ${bulletData.id} 已存在`);
      return false;
    }
    
    this.data.bullets.push(bulletData);
    return true;
  }

  /**
   * 删除子弹
   * @param {string} bulletId - 子弹 ID
   * @returns {boolean} 是否删除成功
   */
  removeBullet(bulletId) {
    const index = this.data.bullets.findIndex(b => b.id === bulletId);
    if (index === -1) return false;
    
    // 检查是否有价格配置引用了该子弹
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

  /**
   * 更新价格配置
   * @param {number} weaponId - 武器 ID
   * @param {string} configId - 配置 ID
   * @param {Object} updates - 更新的字段
   * @returns {boolean} 是否更新成功
   */
  updatePriceConfig(weaponId, configId, updates) {
    console.log(`📝 DataManager.updatePriceConfig: weaponId=${weaponId}, configId=${configId}`, updates);
    
    const price = this.getPriceByWeaponId(weaponId);
    if (!price) {
      console.warn(`⚠️ DataManager.updatePriceConfig: 未找到 weaponId ${weaponId} 的价格配置`);
      return false;
    }
    
    const config = price.configs.find(c => c.id === configId);
    if (!config) {
      console.warn(`⚠️ DataManager.updatePriceConfig: 未找到 configId ${configId}`);
      return false;
    }
    
    Object.assign(config, updates);
    console.log(`✅ DataManager.updatePriceConfig: 更新成功`, config);
    return true;
  }

  /**
   * 添加价格配置
   * @param {number} weaponId - 武器 ID
   * @param {Object} configData - 配置数据
   * @returns {boolean} 是否添加成功
   */
  addPriceConfig(weaponId, configData) {
    const price = this.getPriceByWeaponId(weaponId);
    if (!price) return false;
    
    // 检查是否已存在同 ID 的配置
    const existing = price.configs.find(c => c.id === configData.id);
    if (existing) {
      console.warn(`配置 ${configData.id} 已存在`);
      return false;
    }
    
    price.configs.push(configData);
    return true;
  }

  /**
   * 删除价格配置
   * @param {number} weaponId - 武器 ID
   * @param {string} configId - 配置 ID
   * @returns {boolean} 是否删除成功
   */
  removePriceConfig(weaponId, configId) {
    const price = this.getPriceByWeaponId(weaponId);
    if (!price) return false;
    
    const index = price.configs.findIndex(c => c.id === configId);
    if (index === -1) return false;
    
    // 如果只剩一个配置，不允许删除
    if (price.configs.length <= 1) {
      console.warn('每个武器至少保留一个价格配置');
      return false;
    }
    
    price.configs.splice(index, 1);
    return true;
  }

  // ============================================================
  // 10. 数据导出/导入
  // ============================================================

  /**
   * 导出数据为 JSON 字符串
   * @returns {string} JSON 字符串
   */
  exportToJSON() {
    try {
      // 序列化时处理 Infinity
      const serialized = this.serializeData(this.data);
      return JSON.stringify(serialized, null, 2);
    } catch (error) {
      console.error('导出 JSON 失败:', error);
      throw error;
    }
  }

  /**
   * 序列化数据（处理 Infinity 等特殊值）
   * @param {Object} data - 数据对象
   * @returns {Object} 序列化后的数据
   */
  serializeData(data) {
    const serialized = JSON.parse(JSON.stringify(data));
    
    // 处理 weapons 中的 ranges
    if (Array.isArray(serialized.weapons)) {
      serialized.weapons.forEach(weapon => {
        if (Array.isArray(weapon.ranges)) {
          weapon.ranges = weapon.ranges.map(r => 
            r === Infinity ? 'Infinity' : r
          );
        }
        if (Array.isArray(weapon.barrels)) {
          weapon.barrels.forEach(barrel => {
            if (Array.isArray(barrel.ranges)) {
              barrel.ranges = barrel.ranges.map(r => 
                r === Infinity ? 'Infinity' : r
              );
            }
          });
        }
      });
    }
    
    return serialized;
  }

  /**
   * 从 JSON 字符串导入数据
   * @param {string} jsonStr - JSON 字符串
   * @returns {Object} 导入的数据对象
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
      
      console.log(`✅ DataManager: 导入了 ${this.data.weapons.length} 把武器, ${this.data.bullets.length} 种子弹`);
      return this.data;
      
    } catch (error) {
      console.error('导入 JSON 失败:', error);
      throw error;
    }
  }

  /**
   * 导出数据为 JSON 文件（下载）
   * @param {string} filename - 文件名
   */
  exportToFile(filename = null) {
    const jsonStr = this.exportToJSON();
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
   * 从文件导入数据（上传）
   * @param {File} file - 文件对象
   * @returns {Promise<Object>} 导入的数据
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
  // 11. 数据重置
  // ============================================================

  /**
   * 重置为原始数据（从 data.json 加载的初始状态）
   * @returns {Object} 重置后的数据
   */
  resetToOriginal() {
    if (!this.originalData) {
      console.warn('没有原始数据可重置');
      return this.data;
    }
    
    this.data = JSON.parse(JSON.stringify(this.originalData));
    // 🔥 重置枪口数据
    if (this.originalMuzzles) {
      this.muzzles = JSON.parse(JSON.stringify(this.originalMuzzles));
    }
    console.log('✅ 数据已重置为初始状态');
    return this.data;
  }

  /**
   * 检查是否有未保存的修改
   * @returns {boolean} 是否有修改
   */
  hasUnsavedChanges() {
    if (!this.originalData) return false;
    
    const current = JSON.stringify(this.serializeData(this.data));
    const original = JSON.stringify(this.serializeData(this.originalData));
    return current !== original;
  }

  // ============================================================
  // 12. 工具方法
  // ============================================================

  /**
   * 获取数据状态信息
   * @returns {Object} 状态信息
   */
  getStats() {
    return {
      weaponCount: this.data.weapons.length,
      bulletCount: this.data.bullets.length,
      priceCount: this.data.prices.length,
      muzzleCount: this.muzzles.length,
      isLoaded: this.isLoaded,
      hasUnsavedChanges: this.hasUnsavedChanges()
    };
  }

  /**
   * 根据子弹显示名称查找 bulletId
   * @param {string} bulletDisplay - 子弹显示名称（如 "5.45x39mm Lv.4"）
   * @returns {string|null} bulletId，未找到返回 null
   */
  findBulletIdByDisplay(bulletDisplay) {
    if (!bulletDisplay || bulletDisplay === '-') return null;
    
    // 解析显示名称
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

/**
 * 获取 DataManager 单例
 * @returns {DataManager} DataManager 实例
 */
export function getDataManager() {
  if (!dataManagerInstance) {
    dataManagerInstance = new DataManager();
  }
  return dataManagerInstance;
}

// 导出默认
export default DataManager;