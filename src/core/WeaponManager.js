import { muzzles as defaultMuzzles } from '../data/weapons.js';

/**
 * 武器管理器
 * 负责武器的附件应用、属性计算和状态管理
 */
export class WeaponManager {
  constructor() {
    this.weapons = [];
    this.muzzles = defaultMuzzles;
    this.clonedWeapons = [];
    this.maxClones = 5;
    this.originalWeapons = [];
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
    
    // 处理数据中的 Infinity（JSON 中使用 null 表示 Infinity）
    const processedData = data.map(w => this.processWeaponData(w));
    
    this.weapons = processedData;
    this.originalWeapons = JSON.parse(JSON.stringify(processedData));
    this.clonedWeapons = [];
    
    console.log(`✅ 已加载 ${this.weapons.length} 把武器数据`);
  }

  /**
   * 处理单个武器数据，将 null 转换为 Infinity
   * @param {Object} weapon - 武器数据
   * @returns {Object} 处理后的武器数据
   */
  processWeaponData(weapon) {
    const processed = { ...weapon };
    
    // 处理 ranges 中的 null -> Infinity
    if (Array.isArray(processed.ranges)) {
      processed.ranges = processed.ranges.map(r => 
        r === null || r === undefined ? Infinity : r
      );
    }
    
    // 处理 barrels 中的 ranges（如果有）
    if (Array.isArray(processed.barrels)) {
      processed.barrels = processed.barrels.map(barrel => {
        const b = { ...barrel };
        if (Array.isArray(b.ranges)) {
          b.ranges = b.ranges.map(r => 
            r === null || r === undefined ? Infinity : r
          );
        }
        return b;
      });
    }
    
    return processed;
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
    this.clonedWeapons = [];
    
    console.log(`✅ 已重置为默认武器数据 (${this.weapons.length} 把武器)`);
  }

  /**
   * 获取原始武器数据（深度副本）- 用于"重置为默认"功能
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
    
    // 根据属性类型处理值
    switch (property) {
      case 'name':
      case 'type':
        weapon[property] = String(value);
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
          weapon.ranges = value.map(r => 
            r === null || r === undefined || r === 'Infinity' || r === '∞' ? Infinity : Number(r)
          );
        } else {
          console.warn(`无效的 ranges 值: ${value}`);
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
        // 其他属性直接赋值
        weapon[property] = value;
    }
    
    return true;
  }

  /**
   * 解析射程字符串
   * @param {string} str - 射程字符串，如 "40,70,∞,∞"
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
   * 解析倍率字符串
   * @param {string} str - 倍率字符串，如 "1.9,1,0.9,0.4"
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

  /**
   * 添加新武器到武器列表
   * @param {Object} weaponData - 新武器数据
   * @returns {number} 新武器的索引
   */
  addWeapon(weaponData) {
    if (!weaponData.name || !weaponData.type) {
      throw new Error('武器名称和类型是必填字段');
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
      allowedBullets: [1, 2, 3, 4, 5],
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
      this.weapons.splice(index, 1);
      this.originalWeapons.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 添加武器副本
   * @param {number} originalIndex - 原始武器索引
   * @param {Object} attachmentConfig - 当前附件配置
   * @param {Object} currentState - 当前武器状态（已应用附件）
   * @returns {boolean} 是否添加成功
   */
  addClone(originalIndex, attachmentConfig, currentState) {
    if (this.clonedWeapons.length >= this.maxClones) {
      return false;
    }

    const originalWeapon = this.weapons[originalIndex];
    const cloneNumber = this.getNextCloneNumber(originalIndex);
    
    const slider = document.querySelector(`.velocity-precision-slider[data-weapon="${originalIndex}"]`);
    const currentPrecision = slider ? parseFloat(slider.value) : 0;
    
    const clonedWeapon = {
      ...originalWeapon,
      name: `${originalWeapon.name} [副本${cloneNumber}]`,
      isClone: true,
      originalIndex: originalIndex,
      cloneNumber: cloneNumber,
      attachmentConfig: { 
        ...attachmentConfig,
        velocityPrecision: currentPrecision
      }
    };

    this.clonedWeapons.push(clonedWeapon);
    return true;
  }

  /**
   * 删除武器副本
   * @param {number} cloneIndex - 副本在clonedWeapons数组中的索引
   */
  removeClone(cloneIndex) {
    if (cloneIndex >= 0 && cloneIndex < this.clonedWeapons.length) {
      this.clonedWeapons.splice(cloneIndex, 1);
      this.renumberClones();
    }
  }

  /**
   * 获取下一个副本编号
   * @param {number} originalIndex - 原始武器索引
   * @returns {number} 下一个副本编号
   */
  getNextCloneNumber(originalIndex) {
    const existingClones = this.clonedWeapons.filter(
      clone => clone.originalIndex === originalIndex
    );
    return existingClones.length + 1;
  }

  /**
   * 重新编号副本
   */
  renumberClones() {
    const cloneGroups = {};
    this.clonedWeapons.forEach(clone => {
      if (!cloneGroups[clone.originalIndex]) {
        cloneGroups[clone.originalIndex] = [];
      }
      cloneGroups[clone.originalIndex].push(clone);
    });

    Object.values(cloneGroups).forEach(clones => {
      clones.forEach((clone, index) => {
        clone.cloneNumber = index + 1;
        clone.name = `${this.weapons[clone.originalIndex].name} [副本${clone.cloneNumber}]`;
      });
    });
  }

  /**
   * 获取所有武器（原始+副本）
   * @returns {Array} 所有武器数组
   */
  getAllWeapons() {
    return [...this.weapons, ...this.clonedWeapons];
  }

  /**
   * 获取武器的枪口初速精校值
   * @param {number} weaponIndex - 武器索引
   * @param {boolean} isClone - 是否为副本
   * @param {Object} params - 游戏参数
   * @returns {number} 精校值（-0.09到0.09）
   */
  getWeaponVelocityPrecision(weaponIndex, isClone, params) {
    if (isClone) {
      const clone = this.clonedWeapons[weaponIndex];
      if (clone && clone.attachmentConfig && clone.attachmentConfig.velocityPrecision !== undefined) {
        return clone.attachmentConfig.velocityPrecision;
      }
    } else {
      const slider = document.querySelector(`.velocity-precision-slider[data-weapon="${weaponIndex}"]`);
      if (slider) {
        return parseFloat(slider.value);
      }
    }
    return 0;
  }

  /**
   * 获取副本武器
   * @returns {Array} 副本武器数组
   */
  getClonedWeapons() {
    return this.clonedWeapons;
  }

  /**
   * 检查是否可以添加更多副本
   * @returns {boolean} 是否可以添加
   */
  canAddClone() {
    return this.clonedWeapons.length < this.maxClones;
  }

  /**
   * 读取附件配置（包含子弹类型）
   * @param {Array} barrelValues - 枪管选择值数组
   * @param {Array} muzzleValues - 枪口选择值数组
   * @param {Array} hitRateValues - 命中率数组
   * @param {Array} bulletTypes - 子弹类型数组
   * @returns {Array} 附件配置数组
   */
  readAttachmentsWithBullet(barrelValues, muzzleValues, hitRateValues, bulletTypes) {
    return this.weapons.map((w, i) => {
      const barrelValue = barrelValues[i] || '';
      const muzzleValue = muzzleValues[i] || '';
      
      const [, barrelIndex] = barrelValue.split('|').map(Number);
      const [, muzzleIndex] = muzzleValue.split('|').map(Number);
      const hitRate = hitRateValues[i] === '' ? null : Number(hitRateValues[i]);
      const bulletType = bulletTypes ? bulletTypes[i] : null;
      
      const normalizedBarrelIndex = barrelIndex === -1 ? 0 : barrelIndex;
      const normalizedMuzzleIndex = muzzleIndex === -1 ? 0 : muzzleIndex;
      
      return { barrelIndex: normalizedBarrelIndex, muzzleIndex: normalizedMuzzleIndex, hitRate, bulletType };
    });
  }

  /**
   * 应用附件到武器，返回计算后的完整武器数据
   * 
   * 数据流向说明：
   * - this.weapons: 用户当前编辑的数据（原始值），是唯一数据源
   * - this.originalWeapons: 初始备份数据，仅用于"重置为默认"功能
   * 
   * 返回结构：
   * - _original: 用户当前编辑的原始值（来自 this.weapons），显示在"原始"列
   * - _current: 应用附件后的计算值，显示在"当前"列
   * 
   * @param {Array} attachments - 附件配置数组
   * @param {Object} params - 游戏参数
   * @returns {Array} 包含原始值和计算值的武器数据数组
   */
  applyAttachments(attachments, params) {
    // 使用 this.weapons 作为数据源（包含用户编辑的值）
    const baseWeapons = this.weapons;
    
    // 处理原始武器
    const armedOriginalWeapons = baseWeapons.map((w, idx) => {
      const { barrelIndex, muzzleIndex, hitRate } = attachments[idx] || {};
      
      const barrel = barrelIndex > 0 ? w.barrels[barrelIndex - 1] : null;
      const muzzle = muzzleIndex > 0 ? this.muzzles[muzzleIndex] : null;
      
      let rangeMult = 1.0;
      {
        const hasRangeAdd = barrel && typeof barrel.rangeAdd === 'number';
        const barrelRange = hasRangeAdd ? 1.0 : (barrel ? barrel.rangeMult : 1.0);
        const muzzleAdd = muzzle ? muzzle.mult : 0.0;
        rangeMult *= (barrelRange + muzzleAdd);
      }
      
      let velocityMult = rangeMult;
      const precisionValue = this.getWeaponVelocityPrecision(idx, false, params);
      velocityMult *= (1 + precisionValue);
      
      let rofMult = barrel ? barrel.rofMult : 1.0;
      let damageBonus = barrel && barrel.damageBonus !== undefined ? barrel.damageBonus : 0;
      let armorDamageBonus = barrel && barrel.armorDamageBonus !== undefined ? barrel.armorDamageBonus : 0;
      
      const partAdd = barrel && barrel.partMultAdd ? barrel.partMultAdd : null;
      const newMult = { ...w.mult };
      if (partAdd) {
        for (const k in partAdd) newMult[k] = (newMult[k] ?? 1) + partAdd[k];
      }
      const baseTrigger = w.triggerDelay || 0;
      const delayDelta = barrel && typeof barrel.triggerDelayDelta === 'number' ? barrel.triggerDelayDelta : 0;
      const newTriggerDelay = Math.max(0, Math.round(baseTrigger + delayDelta));
      
      let newRanges;
      if (barrel && Array.isArray(barrel.ranges) && barrel.ranges.length > 0) {
        newRanges = barrel.ranges;
      } else {
        const hasRangeAdd = barrel && typeof barrel.rangeAdd === 'number';
        newRanges = hasRangeAdd
          ? w.ranges.map(r => (r === Infinity ? Infinity : Math.round(r * rangeMult + barrel.rangeAdd)))
          : w.ranges.map(r => {
              if (r === Infinity) return Infinity;
              return Math.round(r * rangeMult);
            });
      }
      
      const newDecays = (barrel && Array.isArray(barrel.decays) && barrel.decays.length > 0)
        ? barrel.decays
        : w.decays;
      
      const hasVelocityAdd = barrel && typeof barrel.velocityAdd === 'number';
      const newVelocity = hasVelocityAdd
        ? Math.round((w.velocity + barrel.velocityAdd) * velocityMult)
        : Math.round(w.velocity * velocityMult);

      let fireMode = w.fireMode || null;
      if (barrel && barrel.fireMode !== undefined) {
        fireMode = barrel.fireMode;
      }
      
      let burstCount = (barrel && barrel.burstCount !== undefined) ? barrel.burstCount : w.burstCount;
      let burstInternalROF = (barrel && barrel.burstInternalROF !== undefined) ? barrel.burstInternalROF : w.burstInternalROF;
      let burstInterval = (barrel && barrel.burstInterval !== undefined) ? barrel.burstInterval : w.burstInterval;
      
      if (fireMode === 'auto') {
        burstCount = undefined;
        burstInternalROF = undefined;
        burstInterval = undefined;
      }

      // 【核心修复】_original 直接使用 w（this.weapons 中的值，即用户编辑后的值）
      // 这样"原始"列显示的是用户当前编辑的值，而不是永远不变的初始值
      return {
        _original: {
          name: w.name,
          type: w.type,
          rof: w.rof,
          velocity: w.velocity,
          ranges: w.ranges,
          flesh: w.flesh,
          armor: w.armor,
          mult: w.mult,
          triggerDelay: w.triggerDelay,
          barrels: w.barrels,
          allowedBullets: w.allowedBullets,
          decays: w.decays,
          fireMode: w.fireMode,
          burstCount: w.burstCount,
          burstInternalROF: w.burstInternalROF,
          burstInterval: w.burstInterval
        },
        _current: {
          rof: Math.round(w.rof * rofMult * 100) / 100,
          velocity: newVelocity,
          ranges: newRanges,
          flesh: w.flesh + damageBonus,
          armor: w.armor + armorDamageBonus,
          mult: newMult,
          triggerDelay: newTriggerDelay,
          decays: newDecays,
          fireMode: fireMode,
          burstCount: burstCount,
          burstInternalROF: burstInternalROF,
          burstInterval: burstInterval
        },
        _attachments: {
          barrel: barrel,
          muzzle: muzzle,
          hitRate: hitRate,
          rangeMult: rangeMult,
          velocityMult: velocityMult,
          rofMult: rofMult,
          damageBonus: damageBonus,
          armorDamageBonus: armorDamageBonus
        },
        isClone: false,
        originalIndex: idx,
        name: w.name,
        type: w.type,
        rof: Math.round(w.rof * rofMult * 100) / 100,
        velocity: newVelocity,
        ranges: newRanges,
        flesh: w.flesh + damageBonus,
        armor: w.armor + armorDamageBonus,
        mult: newMult,
        triggerDelay: newTriggerDelay,
        decays: newDecays,
        fireMode: fireMode,
        burstCount: burstCount,
        burstInternalROF: burstInternalROF,
        burstInterval: burstInterval,
        hitRate: hitRate != null ? hitRate : w.hitRate,
        barrels: w.barrels,
        allowedBullets: w.allowedBullets
      };
    });

    // 处理副本武器（副本基于 clone 自身数据，逻辑不变）
    const armedClonedWeapons = this.clonedWeapons.map((clone, cloneIdx) => {   
      const { barrelIndex, muzzleIndex, hitRate } = clone.attachmentConfig;
      
      const barrel = barrelIndex > 0 ? clone.barrels[barrelIndex - 1] : null;
      const muzzle = muzzleIndex > 0 ? this.muzzles[muzzleIndex] : null;
      
      let rangeMult = 1.0;
      {
        const hasRangeAdd = barrel && typeof barrel.rangeAdd === 'number';
        const barrelRange = hasRangeAdd ? 1.0 : (barrel ? barrel.rangeMult : 1.0);
        const muzzleAdd = muzzle ? muzzle.mult : 0.0;
        rangeMult *= (barrelRange + muzzleAdd);
      }
      
      let velocityMult = rangeMult;
      const precisionValue = this.getWeaponVelocityPrecision(cloneIdx, true, params);
      velocityMult *= (1 + precisionValue);
      
      let rofMult = barrel ? barrel.rofMult : 1.0;
      let damageBonus = barrel && barrel.damageBonus !== undefined ? barrel.damageBonus : 0;
      let armorDamageBonus = barrel && barrel.armorDamageBonus !== undefined ? barrel.armorDamageBonus : 0;
      
      const partAdd = barrel && barrel.partMultAdd ? barrel.partMultAdd : null;
      const newMult = { ...clone.mult };
      if (partAdd) {
        for (const k in partAdd) newMult[k] = (newMult[k] ?? 1) + partAdd[k];
      }
      const baseTrigger = clone.triggerDelay || 0;
      const delayDelta = barrel && typeof barrel.triggerDelayDelta === 'number' ? barrel.triggerDelayDelta : 0;
      const newTriggerDelay = Math.max(0, Math.round(baseTrigger + delayDelta));
      
      let newRanges;
      if (barrel && Array.isArray(barrel.ranges) && barrel.ranges.length > 0) {
        newRanges = barrel.ranges;
      } else {
        const hasRangeAdd = barrel && typeof barrel.rangeAdd === 'number';
        newRanges = hasRangeAdd
          ? clone.ranges.map(r => (r === Infinity ? Infinity : Math.round(r * rangeMult + barrel.rangeAdd)))
          : clone.ranges.map(r => {
              if (r === Infinity) return Infinity;
              return Math.round(r * rangeMult);
            });
      }
      
      const newDecays = (barrel && Array.isArray(barrel.decays) && barrel.decays.length > 0)
        ? barrel.decays
        : clone.decays;
      
      const hasVelocityAdd = barrel && typeof barrel.velocityAdd === 'number';
      const newVelocity = hasVelocityAdd
        ? Math.round((clone.velocity + barrel.velocityAdd) * velocityMult)
        : Math.round(clone.velocity * velocityMult);

      let fireMode = clone.fireMode || null;
      if (barrel && barrel.fireMode !== undefined) {
        fireMode = barrel.fireMode;
      }
      
      let burstCount = (barrel && barrel.burstCount !== undefined) ? barrel.burstCount : clone.burstCount;
      let burstInternalROF = (barrel && barrel.burstInternalROF !== undefined) ? barrel.burstInternalROF : clone.burstInternalROF;
      let burstInterval = (barrel && barrel.burstInterval !== undefined) ? barrel.burstInterval : clone.burstInterval;
      
      if (fireMode === 'auto') {
        burstCount = undefined;
        burstInternalROF = undefined;
        burstInterval = undefined;
      }

      return {
        _original: {
          name: clone.name,
          type: clone.type,
          rof: clone.rof,
          velocity: clone.velocity,
          ranges: clone.ranges,
          flesh: clone.flesh,
          armor: clone.armor,
          mult: clone.mult,
          triggerDelay: clone.triggerDelay,
          barrels: clone.barrels,
          allowedBullets: clone.allowedBullets,
          decays: clone.decays,
          fireMode: clone.fireMode,
          burstCount: clone.burstCount,
          burstInternalROF: clone.burstInternalROF,
          burstInterval: clone.burstInterval
        },
        _current: {
          rof: Math.round(clone.rof * rofMult * 100) / 100,
          velocity: newVelocity,
          ranges: newRanges,
          flesh: clone.flesh + damageBonus,
          armor: clone.armor + armorDamageBonus,
          mult: newMult,
          triggerDelay: newTriggerDelay,
          decays: newDecays,
          fireMode: fireMode,
          burstCount: burstCount,
          burstInternalROF: burstInternalROF,
          burstInterval: burstInterval
        },
        _attachments: {
          barrel: barrel,
          muzzle: muzzle,
          hitRate: hitRate,
          rangeMult: rangeMult,
          velocityMult: velocityMult,
          rofMult: rofMult,
          damageBonus: damageBonus,
          armorDamageBonus: armorDamageBonus
        },
        isClone: true,
        originalIndex: clone.originalIndex,
        cloneIndex: cloneIdx,
        cloneNumber: clone.cloneNumber,
        attachmentConfig: clone.attachmentConfig,
        name: clone.name,
        type: clone.type,
        rof: Math.round(clone.rof * rofMult * 100) / 100,
        velocity: newVelocity,
        ranges: newRanges,
        flesh: clone.flesh + damageBonus,
        armor: clone.armor + armorDamageBonus,
        mult: newMult,
        triggerDelay: newTriggerDelay,
        decays: newDecays,
        fireMode: fireMode,
        burstCount: burstCount,
        burstInternalROF: burstInternalROF,
        burstInterval: burstInterval,
        hitRate: hitRate != null ? hitRate : clone.hitRate,
        barrels: clone.barrels,
        allowedBullets: clone.allowedBullets
      };
    });

    return [...armedOriginalWeapons, ...armedClonedWeapons];
  }

  /**
   * 获取武器数据
   * @returns {Array} 武器数据数组
   */
  getWeapons() {
    return this.weapons;
  }

  /**
   * 获取枪口数据
   * @returns {Array} 枪口数据数组
   */
  getMuzzles() {
    return this.muzzles;
  }

  /**
   * 验证武器命中率是否在有效范围内
   * @param {Array} attachments - 武器附件配置数组
   * @returns {boolean} 验证是否通过
   * @throws {Error} 当命中率超出范围时抛出错误
   */
  validateWeaponHitRates(attachments) {
    for (let i = 0; i < attachments.length; i++) {
      const { hitRate } = attachments[i];
      if (hitRate != null && (hitRate < 0 || hitRate > 1)) {
        throw new Error(`武器 ${i + 1} 的命中率必须在 0 到 1 之间`);
      }
    }
    return true;
  }

  /**
   * 计算副本武器的显示数据
   * @param {Object} clone - 副本武器对象
   * @param {Object} params - 游戏参数
   * @returns {Object} 计算后的显示数据
   */
  calculateCloneDisplayData(clone, params = {}) {
    const { barrelIndex, muzzleIndex, hitRate } = clone.attachmentConfig;
    
    const barrel = barrelIndex > 0 ? clone.barrels[barrelIndex - 1] : null;
    const muzzle = muzzleIndex > 0 ? this.muzzles[muzzleIndex] : null;
    
    let rangeMult = 1.0;
    {
      const hasRangeAdd = barrel && typeof barrel.rangeAdd === 'number';
      const barrelRange = hasRangeAdd ? 1.0 : (barrel ? barrel.rangeMult : 1.0);
      const muzzleAdd = muzzle ? muzzle.mult : 0.0;
      rangeMult *= (barrelRange + muzzleAdd);
    }
    
    let velocityMult = rangeMult;
    const precisionValue = this.getWeaponVelocityPrecision(clone.cloneIndex || 0, true, params);
    velocityMult *= (1 + precisionValue);
    
    let rofMult = barrel ? barrel.rofMult : 1.0;
    let damageBonus = barrel && barrel.damageBonus !== undefined ? barrel.damageBonus : 0;
    let armorDamageBonus = barrel && barrel.armorDamageBonus !== undefined ? barrel.armorDamageBonus : 0;
    
    const partAdd = barrel && barrel.partMultAdd ? barrel.partMultAdd : null;
    const displayMult = { ...clone.mult };
    if (partAdd) {
      for (const k in partAdd) displayMult[k] = (displayMult[k] ?? 1) + partAdd[k];
    }
    const baseTrigger = clone.triggerDelay || 0;
    const delayDelta = barrel && typeof barrel.triggerDelayDelta === 'number' ? barrel.triggerDelayDelta : 0;
    const displayTriggerDelay = Math.max(0, Math.round(baseTrigger + delayDelta));

    let displayRanges;
    if (barrel && Array.isArray(barrel.ranges) && barrel.ranges.length > 0) {
      displayRanges = barrel.ranges;
    } else {
      const hasRangeAdd = barrel && typeof barrel.rangeAdd === 'number';
      displayRanges = hasRangeAdd
        ? clone.ranges.map(r => (r === Infinity ? Infinity : Math.round(r * rangeMult + barrel.rangeAdd)))
        : clone.ranges.map(r => {
            if (r === Infinity) return Infinity;
            return Math.round(r * rangeMult);
          });
    }
    
    const displayDecays = (barrel && Array.isArray(barrel.decays) && barrel.decays.length > 0)
      ? barrel.decays
      : clone.decays;
    
    const hasVelocityAdd = barrel && typeof barrel.velocityAdd === 'number';
    const displayVelocity = hasVelocityAdd
      ? Math.round((clone.velocity + barrel.velocityAdd) * velocityMult)
      : Math.round(clone.velocity * velocityMult);

    return {
      velocity: displayVelocity,
      ranges: displayRanges,
      decays: displayDecays,
      rof: Math.round(clone.rof * rofMult * 100) / 100, 
      flesh: Math.round(clone.flesh + damageBonus),
      armor: Math.round(clone.armor + armorDamageBonus),
      hitRate: hitRate != null ? hitRate : clone.hitRate,
      mult: displayMult,
      triggerDelay: displayTriggerDelay
    };
  }
}