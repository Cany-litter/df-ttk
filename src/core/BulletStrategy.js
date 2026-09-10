import { BaseDamageCalculator, HitPartSelector, ArmorDamageCalculator } from './CombatUtils.js';

/**
 * RIP子弹策略 - 命中全部算四肢，命中率用用户/全局设置
 */
export class RIPBulletStrategy {
  /**
   * ⭐ 原有方法（保持兼容）
   */
  static calculateHitDamage(weapon, params, bulletData, decay, hitProb, armorState, debug = false) {
    const hitPart = 'limbs'; // RIP子弹固定命中四肢
    return this.calculateHitDamageWithPart(weapon, params, bulletData, decay, hitPart, armorState, debug);
  }

  /**
   * ⭐ 新增：使用指定的 hitPart 计算伤害
   * 
   * @param {boolean} collectDebug - 是否收集中间计算值（供伤害详情弹窗使用）
   */
  static calculateHitDamageWithPart(weapon, params, bulletData, decay, hitPart, armorState, collectDebug = false) {
    // RIP子弹固定命中四肢，忽略传入的 hitPart
    const fixedHitPart = 'limbs';
    const mult = weapon.mult[fixedHitPart] || 1;
    const baseF = weapon.flesh * bulletData.base * mult;
    const pureDamage = baseF * decay;

    const result = {
      damage: pureDamage,
      newArmorState: { ...armorState },
      hitPart: fixedHitPart
    };

    if (collectDebug) {
      result.debug = {
        hitPart: fixedHitPart,
        mult,
        bulletBase: bulletData.base,
        weaponFlesh: weapon.flesh,
        baseDamage: baseF,
        decay,
        pureDamage,
        pen: null,
        penDamage: null,
        armorDamage: null,
        armorBefore: null,
        armorAfter: null,
        armorBroken: false,
        ignoreArmor: true
      };
    }

    return result;
  }
}

/**
 * 双头弹策略 - 肉伤固定为74，甲伤固定为11，依然受射程衰减影响
 */
export class DoubleBulletStrategy {
  /**
   * ⭐ 原有方法（保持兼容）
   */
  static calculateHitDamage(weapon, params, bulletData, decay, hitProb, armorState, debug = false) {
    const hitPart = HitPartSelector.select(hitProb);
    return this.calculateHitDamageWithPart(weapon, params, bulletData, decay, hitPart, armorState, debug);
  }

  /**
   * ⭐ 新增：使用指定的 hitPart 计算伤害
   * 
   * @param {boolean} collectDebug - 是否收集中间计算值
   */
  static calculateHitDamageWithPart(weapon, params, bulletData, decay, hitPart, armorState, collectDebug = false) {
    const { armorLevel, helmetLevel } = params;
    const { armorVal, helmetVal } = armorState;
    
    const fixedFleshDamage = 74;
    const fixedArmorDamage = 11;
    
    const mult = weapon.mult[hitPart] || 1;
    const baseF = fixedFleshDamage * mult;
    const pureDamage = baseF * decay;
    
    const armorData = bulletData?.armorData || {};
    const armorLevelStr = String(armorLevel);
    const helmetLevelStr = String(helmetLevel);
    const armorLevelData = armorData[armorLevelStr] || { pen: 0 };
    const helmetLevelData = armorData[helmetLevelStr] || { pen: 0 };
    
    const pen = hitPart === 'head' ? helmetLevelData.pen : armorLevelData.pen;
    const penDamage = pureDamage * pen;
    const armorMult = hitPart === 'head' ? helmetLevelData.armorMult : armorLevelData.armorMult;
    
    let finalDamage;
    let newArmorState = { ...armorState };
    let armorBefore = null;
    let armorAfter = null;
    let armorBroken = false;
    let armorDamage = null;
    
    if (hitPart === 'limbs') {
      finalDamage = pureDamage;
    } else if (hitPart === 'head') {
      if (helmetVal <= 0) {
        finalDamage = pureDamage;
        armorBefore = helmetVal;
        armorAfter = 0;
      } else {
        const aMultHelmet = armorMult || 1;
        const helmetD = fixedArmorDamage * aMultHelmet;
        armorBefore = helmetVal;
        armorDamage = helmetD;
        const result = ArmorDamageCalculator.calculate(pureDamage, penDamage, helmetD, helmetVal, false);
        finalDamage = result.finalDamage;
        newArmorState.helmetVal = result.remainingArmor;
        armorAfter = result.remainingArmor;
        armorBroken = result.remainingArmor <= 0 && helmetD >= helmetVal;
      }
    } else {
      if (armorVal <= 0) {
        finalDamage = pureDamage;
        armorBefore = armorVal;
        armorAfter = 0;
      } else {
        const aMultArmor = armorMult || 1;
        const armorD = fixedArmorDamage * aMultArmor;
        armorBefore = armorVal;
        armorDamage = armorD;
        const result = ArmorDamageCalculator.calculate(pureDamage, penDamage, armorD, armorVal, false);
        finalDamage = result.finalDamage;
        newArmorState.armorVal = result.remainingArmor;
        armorAfter = result.remainingArmor;
        armorBroken = result.remainingArmor <= 0 && armorD >= armorVal;
      }
    }
    
    const response = { damage: finalDamage, newArmorState, hitPart };

    if (collectDebug) {
      response.debug = {
        hitPart,
        mult,
        bulletBase: null,
        weaponFlesh: fixedFleshDamage,
        baseDamage: baseF,
        decay,
        pureDamage,
        pen,
        penDamage,
        armorDamage,
        armorBefore,
        armorAfter,
        armorBroken,
        ignoreArmor: hitPart === 'limbs'
      };
    }

    return response;
  }
}

/**
 * ST子弹策略 (Special Target)
 * 特点：头部、胸部伤害 1.25 倍，腹部、四肢伤害 0.9 倍
 * 命中部位由命中概率随机决定
 * 支持 ST、ST4、ST5 等变体
 */
export class STBulletStrategy {
  /**
   * ⭐ 原有方法（保持兼容）
   */
  static calculateHitDamage(weapon, params, bulletData, decay, hitProb, armorState, debug = false) {
    const hitPart = HitPartSelector.select(hitProb);
    return this.calculateHitDamageWithPart(weapon, params, bulletData, decay, hitPart, armorState, debug);
  }

  /**
   * ⭐ 新增：使用指定的 hitPart 计算伤害
   * 
   * @param {boolean} collectDebug - 是否收集中间计算值
   */
  static calculateHitDamageWithPart(weapon, params, bulletData, decay, hitPart, armorState, collectDebug = false) {
    const { armorLevel, helmetLevel } = params;
    const { armorVal, helmetVal } = armorState;
    
    // ⭐ 获取 ST 子弹的部位倍率修正
    // 优先使用子弹数据中的 stMult 字段，如果没有则使用默认值
    const stMult = bulletData?.stMult || {
      head: 1.25,
      chest: 1.25,
      stomach: 0.9,
      limbs: 0.9
    };
    
    // 计算基础伤害：武器肉伤 × 子弹base × 武器部位倍率 × ST部位修正 × 衰减
    const weaponMult = weapon.mult[hitPart] || 1;
    const stPartMult = stMult[hitPart] || 1;
    const baseF = weapon.flesh * bulletData.base * weaponMult * stPartMult;
    const pureDamage = baseF * decay;
    
    const armorData = bulletData?.armorData || {};
    const armorLevelStr = String(armorLevel);
    const helmetLevelStr = String(helmetLevel);
    const armorLevelData = armorData[armorLevelStr] || { pen: 0 };
    const helmetLevelData = armorData[helmetLevelStr] || { pen: 0 };
    
    const pen = hitPart === 'head' ? helmetLevelData.pen : armorLevelData.pen;
    const armorMult = hitPart === 'head' ? helmetLevelData.armorMult : armorLevelData.armorMult;
    const penDamage = pureDamage * pen;
    
    let finalDamage;
    let newArmorState = { ...armorState };
    let armorBefore = null;
    let armorAfter = null;
    let armorBroken = false;
    let armorDamage = null;
    
    if (hitPart === 'limbs') {
      // 四肢：无护甲减伤
      finalDamage = pureDamage;
    } else if (hitPart === 'head') {
      if (helmetVal <= 0) {
        finalDamage = pureDamage;
        armorBefore = helmetVal;
        armorAfter = 0;
      } else {
        const helmetD = weapon.armor * (armorMult || 1);
        armorBefore = helmetVal;
        armorDamage = helmetD;
        const result = ArmorDamageCalculator.calculate(pureDamage, penDamage, helmetD, helmetVal, false);
        finalDamage = result.finalDamage;
        newArmorState.helmetVal = result.remainingArmor;
        armorAfter = result.remainingArmor;
        armorBroken = result.remainingArmor <= 0 && helmetD >= helmetVal;
      }
    } else {
      // 胸部或腹部
      if (armorVal <= 0) {
        finalDamage = pureDamage;
        armorBefore = armorVal;
        armorAfter = 0;
      } else {
        const armorD = weapon.armor * (armorMult || 1);
        armorBefore = armorVal;
        armorDamage = armorD;
        const result = ArmorDamageCalculator.calculate(pureDamage, penDamage, armorD, armorVal, false);
        finalDamage = result.finalDamage;
        newArmorState.armorVal = result.remainingArmor;
        armorAfter = result.remainingArmor;
        armorBroken = result.remainingArmor <= 0 && armorD >= armorVal;
      }
    }
    
    const response = { damage: finalDamage, newArmorState, hitPart };

    if (collectDebug) {
      response.debug = {
        hitPart,
        mult: weaponMult,
        stPartMult,
        bulletBase: bulletData.base,
        weaponFlesh: weapon.flesh,
        baseDamage: baseF,
        decay,
        pureDamage,
        pen,
        penDamage,
        armorDamage,
        armorBefore,
        armorAfter,
        armorBroken,
        ignoreArmor: hitPart === 'limbs'
      };
    }

    return response;
  }
}

/**
 * 标准子弹策略
 */
export class StandardBulletStrategy {
  /**
   * ⭐ 原有方法（保持兼容）
   */
  static calculateHitDamage(weapon, params, bulletData, decay, hitProb, armorState, debug = false) {
    const hitPart = HitPartSelector.select(hitProb);
    return this.calculateHitDamageWithPart(weapon, params, bulletData, decay, hitPart, armorState, debug);
  }

  /**
   * ⭐ 新增：使用指定的 hitPart 计算伤害
   * 
   * @param {boolean} collectDebug - 是否收集中间计算值
   */
  static calculateHitDamageWithPart(weapon, params, bulletData, decay, hitPart, armorState, collectDebug = false) {
    const { armorLevel, helmetLevel } = params;
    const { armorVal, helmetVal } = armorState;
    
    const mult = weapon.mult[hitPart] || 1;
    const baseF = weapon.flesh * bulletData.base * mult;
    const pureDamage = baseF * decay;
    
    const armorData = bulletData?.armorData || {};
    const armorLevelStr = String(armorLevel);
    const helmetLevelStr = String(helmetLevel);
    const armorLevelData = armorData[armorLevelStr] || { pen: 0 };
    const helmetLevelData = armorData[helmetLevelStr] || { pen: 0 };
    
    const pen = hitPart === 'head' ? helmetLevelData.pen : armorLevelData.pen;
    const armorMult = hitPart === 'head' ? helmetLevelData.armorMult : armorLevelData.armorMult;
    const penDamage = pureDamage * pen;
    
    let finalDamage;
    let newArmorState = { ...armorState };
    let armorBefore = null;
    let armorAfter = null;
    let armorBroken = false;
    let armorDamage = null;
    
    if (hitPart === 'limbs') {
      // 四肢：无护甲减伤
      finalDamage = pureDamage;
    } else if (hitPart === 'head') {
      if (helmetVal <= 0) {
        finalDamage = pureDamage;
        armorBefore = helmetVal;
        armorAfter = 0;
      } else {
        const helmetD = weapon.armor * (armorMult || 1);
        armorBefore = helmetVal;
        armorDamage = helmetD;
        const result = ArmorDamageCalculator.calculate(pureDamage, penDamage, helmetD, helmetVal, false);
        finalDamage = result.finalDamage;
        newArmorState.helmetVal = result.remainingArmor;
        armorAfter = result.remainingArmor;
        armorBroken = result.remainingArmor <= 0 && helmetD >= helmetVal;
      }
    } else {
      // 胸部或腹部
      if (armorVal <= 0) {
        finalDamage = pureDamage;
        armorBefore = armorVal;
        armorAfter = 0;
      } else {
        const armorD = weapon.armor * (armorMult || 1);
        armorBefore = armorVal;
        armorDamage = armorD;
        const result = ArmorDamageCalculator.calculate(pureDamage, penDamage, armorD, armorVal, false);
        finalDamage = result.finalDamage;
        newArmorState.armorVal = result.remainingArmor;
        armorAfter = result.remainingArmor;
        armorBroken = result.remainingArmor <= 0 && armorD >= armorVal;
      }
    }
    
    const response = { damage: finalDamage, newArmorState, hitPart };

    if (collectDebug) {
      response.debug = {
        hitPart,
        mult,
        bulletBase: bulletData.base,
        weaponFlesh: weapon.flesh,
        baseDamage: baseF,
        decay,
        pureDamage,
        pen,
        penDamage,
        armorDamage,
        armorBefore,
        armorAfter,
        armorBroken,
        ignoreArmor: hitPart === 'limbs'
      };
    }

    return response;
  }
}

/**
 * 子弹策略工厂
 */
export class BulletStrategyFactory {
  static getStrategy(bulletType) {
    // ⭐ ST 子弹检测（支持 ST、ST4、ST5 等变体）
    if (bulletType && /ST\d?/i.test(bulletType)) {
      return STBulletStrategy;
    }
    if (bulletType && /RIP|CT/i.test(bulletType)) {
      return RIPBulletStrategy;
    }
    if (bulletType === 'Double') {
      return DoubleBulletStrategy;
    }
    return StandardBulletStrategy;
  }
}