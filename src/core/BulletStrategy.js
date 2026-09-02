import { BaseDamageCalculator, HitPartSelector, ArmorDamageCalculator } from './CombatUtils.js';

/**
 * RIP子弹策略 - 命中全部算四肢，命中率用用户/全局设置
 */
export class RIPBulletStrategy {
  static calculateHitDamage(weapon, params, bulletData, decay, hitProb, armorState, debug = false) {
    const hitPart = 'limbs'; // RIP子弹固定命中四肢
    const pureDamage = BaseDamageCalculator.calculate(weapon, bulletData, hitPart, decay);
    
    return { damage: pureDamage, newArmorState: { ...armorState }, hitPart };
  }
}

/**
 * 双头弹策略 - 肉伤固定为74，甲伤固定为11，依然受射程衰减影响
 */
export class DoubleBulletStrategy {
  static calculateHitDamage(weapon, params, bulletData, decay, hitProb, armorState, debug = false) {
    const { armorLevel, helmetLevel } = params;
    const { armorVal, helmetVal } = armorState;
    
    const hitPart = HitPartSelector.select(hitProb);
    
    const fixedFleshDamage = 74;
    const fixedArmorDamage = 11;
    
    const mult = weapon.mult[hitPart] || 1;
    const pureDamage = fixedFleshDamage * mult * decay;
    
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
    
    if (hitPart === 'limbs') {
      finalDamage = pureDamage;
    } else if (hitPart === 'head') {
      if (helmetVal <= 0) {
        finalDamage = pureDamage;
      } else {
        const aMultHelmet = armorMult || 1;
        const helmetD = fixedArmorDamage * aMultHelmet;
        const result = ArmorDamageCalculator.calculate(pureDamage, penDamage, helmetD, helmetVal, false);
        finalDamage = result.finalDamage;
        newArmorState.helmetVal = result.remainingArmor;
      }
    } else {
      if (armorVal <= 0) {
        finalDamage = pureDamage;
      } else {
        const aMultArmor = armorMult || 1;
        const armorD = fixedArmorDamage * aMultArmor;
        const result = ArmorDamageCalculator.calculate(pureDamage, penDamage, armorD, armorVal, false);
        finalDamage = result.finalDamage;
        newArmorState.armorVal = result.remainingArmor;
      }
    }
    
    return { damage: finalDamage, newArmorState, hitPart };
  }
}

/**
 * 标准子弹策略
 */
export class StandardBulletStrategy {
  static calculateHitDamage(weapon, params, bulletData, decay, hitProb, armorState, debug = false) {
    const { armorLevel, helmetLevel } = params;
    const { armorVal, helmetVal } = armorState;
    
    const hitPart = HitPartSelector.select(hitProb);
    const pureDamage = BaseDamageCalculator.calculate(weapon, bulletData, hitPart, decay);
    
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
    
    if (hitPart === 'limbs') {
      // 四肢：无护甲减伤
      finalDamage = pureDamage;
    } else if (hitPart === 'head') {
      if (helmetVal <= 0) {
        finalDamage = pureDamage;
      } else {
        const helmetD = weapon.armor * (armorMult || 1);
        const result = ArmorDamageCalculator.calculate(pureDamage, penDamage, helmetD, helmetVal, false);
        finalDamage = result.finalDamage;
        newArmorState.helmetVal = result.remainingArmor;
      }
    } else {
      // 胸部或腹部
      if (armorVal <= 0) {
        finalDamage = pureDamage;
      } else {
        const armorD = weapon.armor * (armorMult || 1);
        const result = ArmorDamageCalculator.calculate(pureDamage, penDamage, armorD, armorVal, false);
        finalDamage = result.finalDamage;
        newArmorState.armorVal = result.remainingArmor;
      }
    }
    
    return { damage: finalDamage, newArmorState, hitPart };
  }
}

/**
 * 子弹策略工厂
 */
export class BulletStrategyFactory {
  static getStrategy(bulletType) {
    if (bulletType && /RIP|CT/i.test(bulletType)) {
      return RIPBulletStrategy;
    }
    if (bulletType === 'Double') {
      return DoubleBulletStrategy;
    }
    return StandardBulletStrategy;
  }
}