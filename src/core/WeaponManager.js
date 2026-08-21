// src/core/WeaponManager.js

// 枪口数据 - 直接定义在文件中
const defaultMuzzles = [
  { name: '无', mult: 0 },
  { name: '死寂', mult: 0.24 },
  { name: '先进/轻语/勇火', mult: 0.18 },
  { name: '冲锋枪回声消音器', mult: 0.30 }
];

/**
 * 武器管理器
 * 负责武器的附件应用、属性计算和状态管理
 * 
 * 数据结构说明:
 * - weapons: 武器数组，每个武器包含基础属性和configs数组
 * - configs: 每个武器的改枪配置列表，包含改枪码/命中率/子弹类型/携带数量
 * - selectedBarrel/selectedMuzzle/precision 在 config 级别，每个配置独立
 * - bulletType: 口径名称 (如 '5.45x39') 或特殊子弹名称 (如 '9x19-RIP')
 * - bulletLevel: 子弹等级 (1-5)，常规口径需要
 * - price: 武器价格由 pricingManager 独立管理，configs 中不再存储价格
 */
export class WeaponManager {
  constructor() {
    this.weapons = [];
    this.muzzles = defaultMuzzles;
    this.originalWeapons = [];
    // 引用 pricingManager（在初始化时设置）
    this.pricingManager = null;
  }

  /**
   * 设置 pricingManager 引用
   * @param {Object} pricingManager - pricingManager 实例
   */
  setPricingManager(pricingManager) {
    this.pricingManager = pricingManager;
  }

  /**
   * 从外部加载武器数据
   * @param {Array} data - 武器数据数组
   */
  loadWeapons(data) {
    if (!Array.isArray(data) || data.length === 0) {
      console.warn('加载的武器数据为空或格式不正确');
      return;
    }

    // 处理数据中的 Infinity
    const processedData = data.map(w => this.processWeaponData(w));

    this.weapons = processedData;
    this.originalWeapons = JSON.parse(JSON.stringify(processedData));

    console.log(`✅ 已加载 ${this.weapons.length} 把武器数据`);
  }

  /**
   * 处理单个武器数据，将 null/undefined/'Infinity' 字符串转换为 Infinity
   * @param {Object} weapon - 武器数据
   * @returns {Object} 处理后的武器数据
   */
  processWeaponData(weapon) {
    const processed = { ...weapon };

    // 处理 ranges 中的 null/undefined/'Infinity' 字符串 -> Infinity
    if (Array.isArray(processed.ranges)) {
      processed.ranges = processed.ranges.map(r => {
        if (r === null || r === undefined) return Infinity;
        if (typeof r === 'string') {
          const trimmed = r.trim();
          if (trimmed === 'Infinity' || trimmed === '∞' || trimmed === '') {
            return Infinity;
          }
          const num = parseFloat(trimmed);
          return isNaN(num) ? Infinity : num;
        }
        return r;
      });
    }

    // 处理 decays
    if (Array.isArray(processed.decays)) {
      processed.decays = processed.decays.map(d => {
        if (d === null || d === undefined) return 1.0;
        if (typeof d === 'string') {
          const num = parseFloat(d.trim());
          return isNaN(num) ? 1.0 : num;
        }
        return d;
      });
    }

    // 处理 barrels 中的 ranges 和 decays
    if (Array.isArray(processed.barrels)) {
      processed.barrels = processed.barrels.map(barrel => {
        const b = { ...barrel };
        if (Array.isArray(b.ranges)) {
          b.ranges = b.ranges.map(r => {
            if (r === null || r === undefined) return Infinity;
            if (typeof r === 'string') {
              const trimmed = r.trim();
              if (trimmed === 'Infinity' || trimmed === '∞' || trimmed === '') {
                return Infinity;
              }
              const num = parseFloat(trimmed);
              return isNaN(num) ? Infinity : num;
            }
            return r;
          });
        }
        if (Array.isArray(b.decays)) {
          b.decays = b.decays.map(d => {
            if (d === null || d === undefined) return 1.0;
            if (typeof d === 'string') {
              const num = parseFloat(d.trim());
              return isNaN(num) ? 1.0 : d;
            }
            return d;
          });
        }
        return b;
      });
    }

    // 处理 configs - 确保每个武器都有 configs 数组
    if (!Array.isArray(processed.configs) || processed.configs.length === 0) {
      processed.configs = [this.createDefaultConfig(processed)];
    } else {
      processed.configs = processed.configs.map((c, index) => {
        return {
          id: c.id || `cfg-${index + 1}`,
          code: c.code || `${processed.name}-${String(index + 1).padStart(2, '0')}`,
          selectedBarrel: c.selectedBarrel !== undefined ? c.selectedBarrel : 0,
          selectedMuzzle: c.selectedMuzzle !== undefined ? c.selectedMuzzle : 0,
          precision: c.precision !== undefined ? c.precision : 0.09,
          hitRatePoints: Array.isArray(c.hitRatePoints) ? c.hitRatePoints : [],
          bulletType: c.bulletType !== undefined ? c.bulletType : this.getDefaultBulletType(processed),
          bulletLevel: c.bulletLevel !== undefined ? c.bulletLevel : 4,
          ammoCount: c.ammoCount || this.getDefaultAmmoCount(processed.type)
        };
      });
    }

    // 移除武器级别的旧字段（兼容旧数据）
    delete processed.selectedBarrel;
    delete processed.selectedMuzzle;
    delete processed.precision;
    delete processed.variants;
    delete processed.clonedWeapons;
    // 移除 configs 中的 price（如果还存在）
    if (processed.configs) {
      processed.configs = processed.configs.map(c => {
        const newC = { ...c };
        delete newC.price;
        return newC;
      });
    }

    return processed;
  }

  /**
   * 获取默认子弹类型
   * @param {Object} weapon - 武器对象
   * @returns {string} 默认子弹类型
   */
  getDefaultBulletType(weapon) {
    const allowed = weapon.allowedBullets || [];
    if (allowed.length > 0) {
      return allowed[0];
    }
    return '5.56x45'; // 默认口径
  }

  /**
   * 创建默认改枪配置
   * @param {Object} weapon - 武器对象
   * @returns {Object} 默认配置
   */
  createDefaultConfig(weapon) {
    return {
      id: 'cfg-1',
      code: `${weapon.name}-01`,
      selectedBarrel: 0,
      selectedMuzzle: 0,
      precision: 0.09,
      hitRatePoints: [],
      bulletType: this.getDefaultBulletType(weapon),
      bulletLevel: 4,
      ammoCount: this.getDefaultAmmoCount(weapon.type)
    };
  }

  /**
   * 根据武器类型获取默认携带弹药数量
   * @param {string} type - 武器类型
   * @returns {number} 默认携带数量
   */
  getDefaultAmmoCount(type) {
    if (!type) return 120;
    if (type.includes('手枪')) return 30;
    if (type.includes('冲锋枪')) return 90;
    if (type.includes('精确射手步枪')) return 60;
    if (type.includes('轻机枪') || type.includes('机枪')) return 200;
    return 120;
  }

  // ==================== Configs（改枪配置）管理 ====================

  /**
   * 获取武器的改枪配置列表
   * @param {number} weaponIndex - 武器索引
   * @returns {Array} 配置列表
   */
  getConfigs(weaponIndex) {
    const weapon = this.weapons[weaponIndex];
    if (!weapon) return [];
    return weapon.configs || [];
  }

  /**
   * 获取指定改枪配置
   * @param {number} weaponIndex - 武器索引
   * @param {number} configIndex - 配置索引
   * @returns {Object|null} 配置对象
   */
  getConfig(weaponIndex, configIndex) {
    const weapon = this.weapons[weaponIndex];
    if (!weapon || !weapon.configs) return null;
    return weapon.configs[configIndex] || null;
  }

  /**
   * 获取武器配置的价格（从 pricingManager 读取）
   * @param {number} weaponIndex - 武器索引
   * @param {number} configIndex - 配置索引
   * @returns {number} 价格
   */
  getConfigPrice(weaponIndex, configIndex) {
    const weapon = this.weapons[weaponIndex];
    if (!weapon) return 0;
    const config = this.getConfig(weaponIndex, configIndex);
    if (!config) return 0;
    
    if (this.pricingManager) {
      return this.pricingManager.getWeaponPrice(weapon.name, config.id, 0);
    }
    return 0;
  }

  /**
   * 设置武器配置的价格（通过 pricingManager）
   * @param {number} weaponIndex - 武器索引
   * @param {number} configIndex - 配置索引
   * @param {number} price - 价格
   * @returns {boolean} 是否设置成功
   */
  setConfigPrice(weaponIndex, configIndex, price) {
    const weapon = this.weapons[weaponIndex];
    if (!weapon) return false;
    const config = this.getConfig(weaponIndex, configIndex);
    if (!config) return false;
    
    if (this.pricingManager) {
      this.pricingManager.setWeaponPrice(weapon.name, config.id, price);
      return true;
    }
    return false;
  }

  /**
   * 新增改枪配置
   * @param {number} weaponIndex - 武器索引
   * @param {Object} sourceConfig - 源配置数据（继承用）
   * @param {number} insertAfterIndex - 插入位置
   * @returns {Object} 新增的配置
   */
  addConfig(weaponIndex, sourceConfig = null, insertAfterIndex = null) {
    const weapon = this.weapons[weaponIndex];
    if (!weapon) {
      console.warn(`武器索引 ${weaponIndex} 不存在`);
      return null;
    }

    if (!Array.isArray(weapon.configs)) {
      weapon.configs = [];
    }

    let insertIndex;
    if (insertAfterIndex !== null && insertAfterIndex >= 0 && insertAfterIndex < weapon.configs.length) {
      insertIndex = insertAfterIndex + 1;
    } else {
      insertIndex = weapon.configs.length;
    }

    const newSequence = weapon.configs.length + 1;
    const newConfig = {
      id: `cfg-${newSequence}`,
      code: `${weapon.name}-${String(newSequence).padStart(2, '0')}`,
      selectedBarrel: 0,
      selectedMuzzle: 0,
      precision: 0.09,
      hitRatePoints: [],
      bulletType: this.getDefaultBulletType(weapon),
      bulletLevel: 4,
      ammoCount: this.getDefaultAmmoCount(weapon.type)
    };

    if (sourceConfig) {
      newConfig.code = sourceConfig.code || newConfig.code;
      newConfig.selectedBarrel = sourceConfig.selectedBarrel || 0;
      newConfig.selectedMuzzle = sourceConfig.selectedMuzzle || 0;
      newConfig.precision = sourceConfig.precision !== undefined ? sourceConfig.precision : 0.09;
      newConfig.hitRatePoints = sourceConfig.hitRatePoints ? 
        JSON.parse(JSON.stringify(sourceConfig.hitRatePoints)) : [];
      newConfig.bulletType = sourceConfig.bulletType !== undefined ? 
        sourceConfig.bulletType : this.getDefaultBulletType(weapon);
      newConfig.bulletLevel = sourceConfig.bulletLevel !== undefined ? 
        sourceConfig.bulletLevel : 4;
      newConfig.ammoCount = sourceConfig.ammoCount || this.getDefaultAmmoCount(weapon.type);
      
      if (sourceConfig.price !== undefined && this.pricingManager) {
        this.pricingManager.setWeaponPrice(weapon.name, newConfig.id, sourceConfig.price);
      }
    }

    weapon.configs.splice(insertIndex, 0, newConfig);
    this.renumberConfigs(weaponIndex);

    console.log(`✅ 为 ${weapon.name} 新增改枪配置，当前共 ${weapon.configs.length} 个配置`);
    return newConfig;
  }

  /**
   * 删除改枪配置
   * @param {number} weaponIndex - 武器索引
   * @param {number} configIndex - 配置索引
   * @returns {boolean} 是否删除成功
   */
  removeConfig(weaponIndex, configIndex) {
    const weapon = this.weapons[weaponIndex];
    if (!weapon || !Array.isArray(weapon.configs)) {
      return false;
    }

    if (weapon.configs.length <= 1) {
      console.warn(`⚠️ ${weapon.name} 至少保留一个改枪配置`);
      return false;
    }

    if (configIndex < 0 || configIndex >= weapon.configs.length) {
      return false;
    }

    const removedConfig = weapon.configs[configIndex];
    weapon.configs.splice(configIndex, 1);
    this.renumberConfigs(weaponIndex);

    if (removedConfig && this.pricingManager) {
      console.log(`✅ 删除 ${weapon.name} 的配置 ${removedConfig.id}，价格数据保留在 pricingManager 中`);
    }

    console.log(`✅ 删除 ${weapon.name} 的改枪配置，剩余 ${weapon.configs.length} 个`);
    return true;
  }

  /**
   * 重新编号改枪配置
   * @param {number} weaponIndex - 武器索引
   */
  renumberConfigs(weaponIndex) {
    const weapon = this.weapons[weaponIndex];
    if (!weapon || !Array.isArray(weapon.configs)) return;

    weapon.configs.forEach((config, index) => {
      const seq = index + 1;
      const oldId = config.id;
      config.id = `cfg-${seq}`;
      const autoCodePattern = new RegExp(`^${weapon.name}-\\d{2}$`);
      if (config.code && autoCodePattern.test(config.code)) {
        config.code = `${weapon.name}-${String(seq).padStart(2, '0')}`;
      }
      
      if (oldId !== config.id && this.pricingManager) {
        const oldPrice = this.pricingManager.getWeaponPrice(weapon.name, oldId, null);
        if (oldPrice !== null) {
          this.pricingManager.setWeaponPrice(weapon.name, config.id, oldPrice);
        }
      }
    });
  }

  /**
   * 更新改枪配置属性
   * @param {number} weaponIndex - 武器索引
   * @param {number} configIndex - 配置索引
   * @param {string} property - 属性名
   * @param {*} value - 新值
   * @returns {boolean} 是否更新成功
   */
  updateConfigProperty(weaponIndex, configIndex, property, value) {
    const weapon = this.weapons[weaponIndex];
    if (!weapon || !Array.isArray(weapon.configs)) return false;
    if (configIndex < 0 || configIndex >= weapon.configs.length) return false;

    const config = weapon.configs[configIndex];

    switch (property) {
      case 'price':
        const priceNum = parseFloat(value);
        if (isNaN(priceNum) || priceNum < 0) return false;
        if (this.pricingManager) {
          this.pricingManager.setWeaponPrice(weapon.name, config.id, priceNum);
          return true;
        }
        return false;
      case 'code':
        config.code = String(value);
        break;
      case 'selectedBarrel':
        const barrelIdx = parseInt(value);
        if (!isNaN(barrelIdx) && barrelIdx >= 0) {
          config.selectedBarrel = barrelIdx;
        } else {
          config.selectedBarrel = 0;
        }
        break;
      case 'selectedMuzzle':
        const muzzleIdx = parseInt(value);
        if (!isNaN(muzzleIdx) && muzzleIdx >= 0) {
          config.selectedMuzzle = muzzleIdx;
        } else {
          config.selectedMuzzle = 0;
        }
        break;
      case 'precision':
        const precisionVal = parseFloat(value);
        if (!isNaN(precisionVal) && precisionVal >= -0.09 && precisionVal <= 0.09) {
          config.precision = precisionVal;
        } else {
          return false;
        }
        break;
      case 'hitRatePoints':
        if (!Array.isArray(value)) return false;
        config.hitRatePoints = JSON.parse(JSON.stringify(value));
        break;
      case 'bulletType':
        config.bulletType = value;
        break;
      case 'bulletLevel':
        const levelNum = parseInt(value);
        if (isNaN(levelNum) || levelNum < 1 || levelNum > 5) return false;
        config.bulletLevel = levelNum;
        break;
      case 'ammoCount':
        const ammoNum = parseFloat(value);
        if (isNaN(ammoNum) || ammoNum < 0) return false;
        config.ammoCount = ammoNum;
        break;
      default:
        config[property] = value;
    }

    return true;
  }

  /**
   * 获取所有改枪配置（扁平数组）
   * @returns {Array<{weaponIndex: number, configIndex: number, config: Object, weaponName: string}>}
   */
  getAllConfigs() {
    const result = [];
    this.weapons.forEach((weapon, weaponIndex) => {
      if (Array.isArray(weapon.configs)) {
        weapon.configs.forEach((config, configIndex) => {
          result.push({
            weaponIndex,
            configIndex,
            config,
            weaponName: weapon.name,
            weaponType: weapon.type
          });
        });
      }
    });
    return result;
  }

  // ==================== 武器属性管理 ====================

  /**
   * 获取所有武器数据
   * @returns {Array} 武器数据数组
   */
  getWeapons() {
    return this.weapons;
  }

  /**
   * 获取指定武器
   * @param {number} index - 武器索引
   * @returns {Object|null} 武器对象
   */
  getWeapon(index) {
    if (index >= 0 && index < this.weapons.length) {
      return this.weapons[index];
    }
    return null;
  }

  /**
   * 获取枪口数据
   * @returns {Array} 枪口数据数组
   */
  getMuzzles() {
    return this.muzzles;
  }

  /**
   * 获取指定武器的枪管列表
   * @param {number} index - 武器索引
   * @returns {Array} 枪管列表
   */
  getBarrels(index) {
    const weapon = this.weapons[index];
    if (!weapon) return [];
    return weapon.barrels || [];
  }

  /**
   * 获取指定武器指定配置选中的枪管
   * @param {number} weaponIndex - 武器索引
   * @param {number} configIndex - 配置索引
   * @returns {Object|null} 选中的枪管
   */
  getSelectedBarrel(weaponIndex, configIndex) {
    const weapon = this.weapons[weaponIndex];
    if (!weapon) return null;
    const config = this.getConfig(weaponIndex, configIndex);
    if (!config) return null;
    const barrelIndex = config.selectedBarrel || 0;
    if (barrelIndex === 0 || !weapon.barrels || barrelIndex > weapon.barrels.length) {
      return null;
    }
    return weapon.barrels[barrelIndex - 1] || null;
  }

  /**
   * 获取指定武器指定配置选中的枪口
   * @param {number} weaponIndex - 武器索引
   * @param {number} configIndex - 配置索引
   * @returns {Object|null} 选中的枪口
   */
  getSelectedMuzzle(weaponIndex, configIndex) {
    const weapon = this.weapons[weaponIndex];
    if (!weapon) return null;
    const config = this.getConfig(weaponIndex, configIndex);
    if (!config) return null;
    const muzzleIndex = config.selectedMuzzle || 0;
    if (muzzleIndex === 0 || muzzleIndex >= this.muzzles.length) {
      return null;
    }
    return this.muzzles[muzzleIndex] || null;
  }

  /**
   * 更新单个武器属性
   * @param {number} index - 武器索引
   * @param {string} property - 属性名
   * @param {*} value - 新值
   * @returns {boolean} 是否更新成功
   */
  updateWeaponProperty(index, property, value) {
    if (index < 0 || index >= this.weapons.length) {
      console.warn(`武器索引 ${index} 超出范围`);
      return false;
    }

    const weapon = this.weapons[index];

    switch (property) {
      case 'name':
      case 'type':
        weapon[property] = String(value);
        if (property === 'name') {
          this.renumberConfigs(index);
        }
        break;
      case 'rof':
      case 'velocity':
      case 'flesh':
      case 'armor':
      case 'triggerDelay':
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue >= 0) {
          weapon[property] = numValue;
        } else {
          console.warn(`无效的 ${property} 值: ${value}`);
          return false;
        }
        break;
      case 'ranges':
        if (typeof value === 'string') {
          weapon.ranges = this.parseRangesString(value);
        } else if (Array.isArray(value)) {
          weapon.ranges = value.map(r => {
            if (r === null || r === undefined || r === 'Infinity' || r === '∞') {
              return Infinity;
            }
            return Number(r);
          });
        } else {
          console.warn(`无效的 ranges 值: ${value}`);
          return false;
        }
        break;
      case 'decays':
        if (typeof value === 'string') {
          weapon.decays = this.parseDecaysString(value);
        } else if (Array.isArray(value)) {
          weapon.decays = value.map(d => {
            if (d === null || d === undefined) return 1.0;
            return Number(d);
          });
        } else {
          console.warn(`无效的 decays 值: ${value}`);
          return false;
        }
        break;
      case 'mult':
        if (typeof value === 'string') {
          weapon.mult = this.parseMultString(value);
        } else if (typeof value === 'object' && value !== null) {
          weapon.mult = { ...value };
        } else {
          console.warn(`无效的 mult 值: ${value}`);
          return false;
        }
        break;
      default:
        weapon[property] = value;
    }

    return true;
  }

  /**
   * 添加新武器
   * @param {Object} weaponData - 新武器数据
   * @returns {number} 新武器的索引
   */
  addWeapon(weaponData) {
    if (!weaponData.name) {
      throw new Error('武器名称是必填字段');
    }

    const newWeapon = {
      ranges: [40, 70, Infinity, Infinity],
      decays: [1.0, 0.85, 0.7, 0.7, 0.7],
      velocity: 575,
      flesh: 30,
      armor: 35,
      rof: 600,
      triggerDelay: 0,
      barrels: [],
      mult: { head: 1.9, chest: 1, stomach: 0.9, limbs: 0.4 },
      allowedBullets: ['5.56x45'],
      ...weaponData
    };

    if (!Array.isArray(newWeapon.ranges) || newWeapon.ranges.length !== 4) {
      newWeapon.ranges = [40, 70, Infinity, Infinity];
    }
    if (!Array.isArray(newWeapon.decays) || newWeapon.decays.length !== 5) {
      newWeapon.decays = [1.0, 0.85, 0.7, 0.7, 0.7];
    }
    if (!newWeapon.mult.head) newWeapon.mult.head = 1.9;
    if (!newWeapon.mult.chest) newWeapon.mult.chest = 1;
    if (!newWeapon.mult.stomach) newWeapon.mult.stomach = 0.9;
    if (!newWeapon.mult.limbs) newWeapon.mult.limbs = 0.4;

    newWeapon.configs = [this.createDefaultConfig(newWeapon)];

    this.weapons.push(newWeapon);
    this.originalWeapons.push(JSON.parse(JSON.stringify(newWeapon)));

    return this.weapons.length - 1;
  }

  /**
   * 删除武器
   * @param {number} index - 武器索引
   * @returns {boolean} 是否删除成功
   */
  removeWeapon(index) {
    if (index >= 0 && index < this.weapons.length) {
      if (this.weapons.length <= 1) {
        throw new Error('至少保留一把武器');
      }
      const weapon = this.weapons[index];
      if (weapon && this.pricingManager) {
        console.log(`武器 ${weapon.name} 的价格数据保留在 pricingManager 中`);
      }
      this.weapons.splice(index, 1);
      this.originalWeapons.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 重置为默认武器数据
   * @param {Array} defaultData - 默认武器数据
   */
  resetToDefaults(defaultData) {
    if (!Array.isArray(defaultData) || defaultData.length === 0) {
      console.warn('默认武器数据为空，无法重置');
      return;
    }

    const processedData = defaultData.map(w => this.processWeaponData(w));
    this.weapons = JSON.parse(JSON.stringify(processedData));
    this.originalWeapons = JSON.parse(JSON.stringify(processedData));

    console.log(`✅ 已重置为默认武器数据 (${this.weapons.length} 把武器)`);
  }

  /**
   * 获取原始武器数据（深度副本）
   * @returns {Array} 原始武器数据数组
   */
  getOriginalWeapons() {
    return JSON.parse(JSON.stringify(this.originalWeapons));
  }

  /**
   * 获取指定武器的原始数据
   * @param {number} index - 武器索引
   * @returns {Object|null} 原始武器数据
   */
  getOriginalWeapon(index) {
    if (index >= 0 && index < this.originalWeapons.length) {
      return JSON.parse(JSON.stringify(this.originalWeapons[index]));
    }
    return null;
  }

  // ==================== 配件应用 ====================

  /**
   * 读取附件配置（包含子弹类型）
   * @param {Array} barrelValues - 枪管选择值数组
   * @param {Array} muzzleValues - 枪口选择值数组
   * @param {Array} bulletTypes - 子弹类型数组（已废弃，使用config中的值）
   * @returns {Array} 附件配置数组
   */
  readAttachmentsWithBullet(barrelValues, muzzleValues, bulletTypes) {
    return this.weapons.map((w, i) => {
      const barrelValue = barrelValues[i] || '';
      const muzzleValue = muzzleValues[i] || '';

      const [, barrelIndex] = barrelValue.split('|').map(Number);
      const [, muzzleIndex] = muzzleValue.split('|').map(Number);

      const config = w.configs && w.configs[0] ? w.configs[0] : null;
      const bulletType = config?.bulletType || null;
      const bulletLevel = config?.bulletLevel || 4;

      const normalizedBarrelIndex = barrelIndex === -1 ? 0 : barrelIndex;
      const normalizedMuzzleIndex = muzzleIndex === -1 ? 0 : muzzleIndex;

      return {
        barrelIndex: normalizedBarrelIndex,
        muzzleIndex: normalizedMuzzleIndex,
        bulletType,
        bulletLevel
      };
    });
  }

  /**
   * 应用附件到武器，返回计算后的完整武器数据
   * @param {Array} attachments - 附件配置数组
   * @param {Object} params - 游戏参数
   * @param {Array} configs - 每个武器对应的改枪配置（用于读取精校等）
   * @returns {Array} 包含原始值和计算值的武器数据数组
   */
  applyAttachments(attachments, params, configs = null) {
    const baseWeapons = this.weapons;

    return baseWeapons.map((w, idx) => {
      const attachment = attachments[idx] || {};
      const config = (configs && configs[idx]) ? configs[idx] : null;

      let barrelIndex = attachment.barrelIndex || 0;
      let muzzleIndex = attachment.muzzleIndex || 0;

      if (config) {
        barrelIndex = config.selectedBarrel !== undefined ? config.selectedBarrel : barrelIndex;
        muzzleIndex = config.selectedMuzzle !== undefined ? config.selectedMuzzle : muzzleIndex;
      }

      const barrel = barrelIndex > 0 ? w.barrels[barrelIndex - 1] : null;
      const muzzle = muzzleIndex > 0 ? this.muzzles[muzzleIndex] : null;
      const precision = config && config.precision !== undefined ? config.precision : 0.09;

      return this._applyAttachmentsToWeapon(w, barrel, muzzle, precision, params, config);
    });
  }

  /**
   * 为单个武器应用附件（不依赖武器数组）
   * 用于TTK排行榜中为每个config独立生成条目
   * 
   * @param {Object} weapon - 武器对象
   * @param {number} barrelIndex - 枪管索引
   * @param {number} muzzleIndex - 枪口索引
   * @param {number} precision - 精校值
   * @param {Object} params - 游戏参数
   * @param {Object} config - 改枪配置
   * @param {number} configIndex - 配置索引（用于生成显示名称）
   * @returns {Object} 应用附件后的武器数据
   */
  applyAttachmentsForSingle(weapon, barrelIndex, muzzleIndex, precision, params, config, configIndex = 0) {
    const barrel = barrelIndex > 0 && weapon.barrels ? weapon.barrels[barrelIndex - 1] : null;
    const muzzle = muzzleIndex > 0 ? this.muzzles[muzzleIndex] : null;
    
    const result = this._applyAttachmentsToWeapon(weapon, barrel, muzzle, precision, params, config);
    
    // 添加额外的元数据
    result._configIndex = configIndex;
    result._displayName = config ? `${weapon.name}-${configIndex + 1}` : weapon.name;
    result._weaponName = weapon.name;
    
    return result;
  }

  /**
   * 内部方法：将附件应用到单个武器
   * @param {Object} weapon - 武器对象
   * @param {Object|null} barrel - 枪管对象
   * @param {Object|null} muzzle - 枪口对象
   * @param {number} precision - 精校值
   * @param {Object} params - 游戏参数
   * @param {Object} config - 改枪配置
   * @returns {Object} 应用附件后的武器数据
   * @private
   */
  _applyAttachmentsToWeapon(weapon, barrel, muzzle, precision, params, config) {
    // 计算射程倍率
    let rangeMult = 1.0;
    const hasRangeAdd = barrel && typeof barrel.rangeAdd === 'number';
    const barrelRange = hasRangeAdd ? 1.0 : (barrel ? barrel.rangeMult : 1.0);
    const muzzleAdd = muzzle ? muzzle.mult : 0.0;
    rangeMult *= (barrelRange + muzzleAdd);

    // 计算初速倍率（包含精校）
    let velocityMult = rangeMult;
    velocityMult *= (1 + precision);

    // 射速倍率
    let rofMult = barrel ? barrel.rofMult : 1.0;

    // 伤害加成
    let damageBonus = barrel && barrel.damageBonus !== undefined ? barrel.damageBonus : 0;
    let armorDamageBonus = barrel && barrel.armorDamageBonus !== undefined ? barrel.armorDamageBonus : 0;

    // 部位倍率加成
    const partAdd = barrel && barrel.partMultAdd ? barrel.partMultAdd : null;
    const newMult = { ...weapon.mult };
    if (partAdd) {
      for (const k in partAdd) {
        newMult[k] = (newMult[k] ?? 1) + partAdd[k];
      }
    }

    // 扳机延迟
    const baseTrigger = weapon.triggerDelay || 0;
    const delayDelta = barrel && typeof barrel.triggerDelayDelta === 'number' ? barrel.triggerDelayDelta : 0;
    const newTriggerDelay = Math.max(0, Math.round(baseTrigger + delayDelta));

    // 计算射程
    let newRanges;
    if (barrel && Array.isArray(barrel.ranges) && barrel.ranges.length > 0) {
      newRanges = barrel.ranges;
    } else {
      const hasRangeAddLocal = barrel && typeof barrel.rangeAdd === 'number';
      newRanges = hasRangeAddLocal
        ? weapon.ranges.map(r => (r === Infinity ? Infinity : Math.round(r * rangeMult + barrel.rangeAdd)))
        : weapon.ranges.map(r => {
            if (r === Infinity) return Infinity;
            return Math.round(r * rangeMult);
          });
    }

    // 计算衰减
    const newDecays = (barrel && Array.isArray(barrel.decays) && barrel.decays.length > 0)
      ? barrel.decays
      : weapon.decays;

    // 计算初速
    const hasVelocityAdd = barrel && typeof barrel.velocityAdd === 'number';
    const newVelocity = hasVelocityAdd
      ? Math.round((weapon.velocity + barrel.velocityAdd) * velocityMult)
      : Math.round(weapon.velocity * velocityMult);

    // 开火模式
    let fireMode = weapon.fireMode || null;
    if (barrel && barrel.fireMode !== undefined) {
      fireMode = barrel.fireMode;
    }

    let burstCount = (barrel && barrel.burstCount !== undefined) ? barrel.burstCount : weapon.burstCount;
    let burstInternalROF = (barrel && barrel.burstInternalROF !== undefined) ? barrel.burstInternalROF : weapon.burstInternalROF;
    let burstInterval = (barrel && barrel.burstInterval !== undefined) ? barrel.burstInterval : weapon.burstInterval;

    if (fireMode === 'auto') {
      burstCount = undefined;
      burstInternalROF = undefined;
      burstInterval = undefined;
    }

    // 子弹信息
    const bulletType = config && config.bulletType !== undefined ? config.bulletType : (params.bulletType || '5.56x45');
    const bulletLevel = config && config.bulletLevel !== undefined ? config.bulletLevel : (params.bulletLevel || 4);

    return {
      _original: {
        name: weapon.name,
        type: weapon.type,
        rof: weapon.rof,
        velocity: weapon.velocity,
        ranges: weapon.ranges,
        decays: weapon.decays,
        flesh: weapon.flesh,
        armor: weapon.armor,
        mult: weapon.mult,
        triggerDelay: weapon.triggerDelay,
        barrels: weapon.barrels,
        allowedBullets: weapon.allowedBullets,
        fireMode: weapon.fireMode,
        burstCount: weapon.burstCount,
        burstInternalROF: weapon.burstInternalROF,
        burstInterval: weapon.burstInterval
      },
      _current: {
        rof: Math.round(weapon.rof * rofMult * 100) / 100,
        velocity: newVelocity,
        ranges: newRanges,
        decays: newDecays,
        flesh: weapon.flesh + damageBonus,
        armor: weapon.armor + armorDamageBonus,
        mult: newMult,
        triggerDelay: newTriggerDelay,
        fireMode: fireMode,
        burstCount: burstCount,
        burstInternalROF: burstInternalROF,
        burstInterval: burstInterval
      },
      _attachments: {
        barrel: barrel,
        muzzle: muzzle,
        rangeMult: rangeMult,
        velocityMult: velocityMult,
        rofMult: rofMult,
        damageBonus: damageBonus,
        armorDamageBonus: armorDamageBonus
      },
      isClone: false,
      originalIndex: 0,
      name: weapon.name,
      type: weapon.type,
      rof: Math.round(weapon.rof * rofMult * 100) / 100,
      velocity: newVelocity,
      ranges: newRanges,
      decays: newDecays,
      flesh: weapon.flesh + damageBonus,
      armor: weapon.armor + armorDamageBonus,
      mult: newMult,
      triggerDelay: newTriggerDelay,
      fireMode: fireMode,
      burstCount: burstCount,
      burstInternalROF: burstInternalROF,
      burstInterval: burstInterval,
      barrels: weapon.barrels,
      allowedBullets: weapon.allowedBullets,
      configs: weapon.configs,
      _configIndex: config ? this.getConfigIndex(weapon, config) : 0,
      _bulletType: bulletType,
      _bulletLevel: bulletLevel
    };
  }

  /**
   * 获取配置在武器 configs 中的索引
   * @param {Object} weapon - 武器对象
   * @param {Object} config - 配置对象
   * @returns {number} 索引
   */
  getConfigIndex(weapon, config) {
    if (!weapon.configs || !config) return 0;
    const index = weapon.configs.findIndex(c => c.id === config.id);
    return index >= 0 ? index : 0;
  }

  // ==================== 工具方法 ====================

  /**
   * 解析射程字符串
   * @param {string} str - 射程字符串
   * @returns {Array} 射程数组
   */
  parseRangesString(str) {
    if (!str) return [40, 70, Infinity, Infinity];
    return str.split(',').map(v => {
      const trimmed = v.trim();
      if (trimmed === '∞' || trimmed === 'Infinity' || trimmed === 'null' || trimmed === '') {
        return Infinity;
      }
      const num = parseFloat(trimmed);
      return isNaN(num) ? 40 : num;
    });
  }

  /**
   * 解析衰减字符串
   * @param {string} str - 衰减字符串
   * @returns {Array} 衰减数组
   */
  parseDecaysString(str) {
    if (!str) return [1.0, 1.0, 1.0, 1.0, 1.0];
    const parts = str.split(',').map(v => parseFloat(v.trim()));
    while (parts.length < 5) {
      parts.push(1.0);
    }
    return parts.slice(0, 5).map(d => isNaN(d) ? 1.0 : d);
  }

  /**
   * 解析倍率字符串
   * @param {string} str - 倍率字符串
   * @returns {Object} 倍率对象
   */
  parseMultString(str) {
    if (!str) return { head: 1.9, chest: 1, stomach: 0.9, limbs: 0.4 };
    const parts = str.split(',').map(v => parseFloat(v.trim()) || 1);
    return {
      head: parts[0] || 1.9,
      chest: parts[1] || 1,
      stomach: parts[2] || 0.9,
      limbs: parts[3] || 0.4
    };
  }

  // ==================== 兼容性方法 ====================

  /**
   * @deprecated 使用 getConfigs 替代
   */
  getVariants(weaponIndex) {
    console.warn('⚠️ getVariants 已废弃，请使用 getConfigs');
    return this.getConfigs(weaponIndex);
  }

  /**
   * @deprecated 使用 getConfig 替代
   */
  getVariant(weaponIndex, variantIndex) {
    console.warn('⚠️ getVariant 已废弃，请使用 getConfig');
    return this.getConfig(weaponIndex, variantIndex);
  }

  /**
   * @deprecated 使用 addConfig 替代
   */
  addVariant(weaponIndex, sourceVariant = null, insertAfterIndex = null) {
    console.warn('⚠️ addVariant 已废弃，请使用 addConfig');
    return this.addConfig(weaponIndex, sourceVariant, insertAfterIndex);
  }

  /**
   * @deprecated 使用 removeConfig 替代
   */
  removeVariant(weaponIndex, variantIndex) {
    console.warn('⚠️ removeVariant 已废弃，请使用 removeConfig');
    return this.removeConfig(weaponIndex, variantIndex);
  }

  /**
   * @deprecated 使用 updateConfigProperty 替代
   */
  updateVariantProperty(weaponIndex, variantIndex, property, value) {
    console.warn('⚠️ updateVariantProperty 已废弃，请使用 updateConfigProperty');
    return this.updateConfigProperty(weaponIndex, variantIndex, property, value);
  }

  /**
   * @deprecated 使用 getAllConfigs 替代
   */
  getAllVariants() {
    console.warn('⚠️ getAllVariants 已废弃，请使用 getAllConfigs');
    return this.getAllConfigs();
  }

  /**
   * @deprecated 使用 getSelectedBarrel 替代（需要传入 configIndex）
   */
  getSelectedBarrelOld(weaponIndex) {
    console.warn('⚠️ getSelectedBarrel 已废弃，请使用 getSelectedBarrel(weaponIndex, configIndex)');
    const weapon = this.weapons[weaponIndex];
    if (!weapon) return null;
    const config = weapon.configs && weapon.configs[0] ? weapon.configs[0] : null;
    if (!config) return null;
    const barrelIndex = config.selectedBarrel || 0;
    if (barrelIndex === 0 || !weapon.barrels || barrelIndex > weapon.barrels.length) {
      return null;
    }
    return weapon.barrels[barrelIndex - 1] || null;
  }

  /**
   * @deprecated 使用 getSelectedMuzzle 替代（需要传入 configIndex）
   */
  getSelectedMuzzleOld(weaponIndex) {
    console.warn('⚠️ getSelectedMuzzle 已废弃，请使用 getSelectedMuzzle(weaponIndex, configIndex)');
    const weapon = this.weapons[weaponIndex];
    if (!weapon) return null;
    const config = weapon.configs && weapon.configs[0] ? weapon.configs[0] : null;
    if (!config) return null;
    const muzzleIndex = config.selectedMuzzle || 0;
    if (muzzleIndex === 0 || muzzleIndex >= this.muzzles.length) {
      return null;
    }
    return this.muzzles[muzzleIndex] || null;
  }
}