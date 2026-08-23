import { BaseDamageCalculator, HitPartSelector, ArmorDamageCalculator } from './CombatUtils.js';

/**
 * RIP子弹策略 - 命中全部算四肢，命中率用用户/全局设置
 */
export class RIPBulletStrategy {
  static calculateHitDamage(weapon, params, bulletData, decay, hitProb, armorState, debug = false) {
    const hitPart = 'limbs'; // RIP子弹固定命中四肢
    const pureDamage = BaseDamageCalculator.calculate(weapon, bulletData, hitPart, decay);
    
    if (debug) {
      console.log(`    [RIP子弹] 部位: 四肢, 纯伤害: ${pureDamage.toFixed(2)}`);
    }
    
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
    
    // 添加空值检查
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
    
    if (debug) {
      console.log(`    [双头弹] 部位: ${hitPart}, 纯伤害: ${pureDamage.toFixed(2)}, 穿透率: ${pen}, 穿透伤害: ${penDamage.toFixed(2)}`);
    }
    
    if (hitPart === 'limbs') {
      finalDamage = pureDamage;
    } else if (hitPart === 'head') {
      if (helmetVal <= 0) {
        finalDamage = pureDamage;
        if (debug) console.log(`    [双头弹] 头盔已损坏，全额伤害: ${finalDamage.toFixed(2)}`);
      } else {
        const aMultHelmet = armorMult || 1;
        const helmetD = fixedArmorDamage * aMultHelmet;
        const result = ArmorDamageCalculator.calculate(pureDamage, penDamage, helmetD, helmetVal, debug);
        finalDamage = result.finalDamage;
        newArmorState.helmetVal = result.remainingArmor;
        if (debug) console.log(`    [双头弹] 头盔减伤后伤害: ${finalDamage.toFixed(2)}, 头盔剩余: ${newArmorState.helmetVal}`);
      }
    } else {
      if (armorVal <= 0) {
        finalDamage = pureDamage;
        if (debug) console.log(`    [双头弹] 护甲已损坏，全额伤害: ${finalDamage.toFixed(2)}`);
      } else {
        const aMultArmor = armorMult || 1;
        const armorD = fixedArmorDamage * aMultArmor;
        const result = ArmorDamageCalculator.calculate(pureDamage, penDamage, armorD, armorVal, debug);
        finalDamage = result.finalDamage;
        newArmorState.armorVal = result.remainingArmor;
        if (debug) console.log(`    [双头弹] 护甲减伤后伤害: ${finalDamage.toFixed(2)}, 护甲剩余: ${newArmorState.armorVal}`);
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
    
    // 🔥 记录基础伤害（用于调试）
    const baseFlesh = weapon.flesh;
    const bulletBase = bulletData?.base || 1.0;
    const mult = weapon.mult[hitPart] || 1;
    const rawDamage = baseFlesh * bulletBase * mult * decay;
    
    // 添加空值检查
    const armorData = bulletData?.armorData || {};
    const armorLevelStr = String(armorLevel);
    const helmetLevelStr = String(helmetLevel);
    const armorLevelData = armorData[armorLevelStr] || { pen: 0 };
    const helmetLevelData = armorData[helmetLevelStr] || { pen: 0 };
    
    // 🔥 获取护甲穿透和护甲伤害倍率
    const pen = hitPart === 'head' ? helmetLevelData.pen : armorLevelData.pen;
    const armorMult = hitPart === 'head' ? helmetLevelData.armorMult : armorLevelData.armorMult;
    
    // 🔥 计算穿透伤害
    const penDamage = pureDamage * pen;
    
    // 🔥 调试日志：打印关键数据
    if (debug) {
      console.log(`    [调试] armorLevel: ${armorLevel}, armorLevelStr: ${armorLevelStr}`);
      console.log(`    [调试] armorLevelData:`, armorLevelData);
      console.log(`    [调试] armorLevelData.pen:`, armorLevelData?.pen);
      console.log(`    [调试] hitPart: ${hitPart}, pen: ${pen}`);
    }
    
    // 🔥 计算护甲伤害
    let finalDamage;
    let newArmorState = { ...armorState };
    
    if (debug) {
      console.log(`    [伤害计算] 部位: ${hitPart}, 基础伤害: ${rawDamage.toFixed(2)}, 纯伤害: ${pureDamage.toFixed(2)}, 穿透率: ${pen}, 穿透伤害: ${penDamage.toFixed(2)}`);
    }
    
    if (hitPart === 'limbs') {
      // 四肢：无护甲减伤
      finalDamage = pureDamage;
      if (debug) {
        console.log(`    [护甲] 四肢无护甲，最终伤害: ${finalDamage.toFixed(2)}`);
      }
    } else if (hitPart === 'head') {
      if (helmetVal <= 0) {
        finalDamage = pureDamage;
        if (debug) console.log(`    [护甲] 头盔已损坏，全额伤害: ${finalDamage.toFixed(2)}`);
      } else {
        const helmetD = weapon.armor * (armorMult || 1);
        const result = ArmorDamageCalculator.calculate(pureDamage, penDamage, helmetD, helmetVal, debug);
        finalDamage = result.finalDamage;
        newArmorState.helmetVal = result.remainingArmor;
        if (debug) {
          console.log(`    [护甲] 头盔减伤后伤害: ${finalDamage.toFixed(2)}, 头盔剩余: ${newArmorState.helmetVal}`);
        }
      }
    } else {
      // 胸部或腹部
      if (armorVal <= 0) {
        finalDamage = pureDamage;
        if (debug) console.log(`    [护甲] 护甲已损坏，全额伤害: ${finalDamage.toFixed(2)}`);
      } else {
        const armorD = weapon.armor * (armorMult || 1);
        const result = ArmorDamageCalculator.calculate(pureDamage, penDamage, armorD, armorVal, debug);
        finalDamage = result.finalDamage;
        newArmorState.armorVal = result.remainingArmor;
        if (debug) {
          console.log(`    [护甲] 护甲减伤后伤害: ${finalDamage.toFixed(2)}, 护甲剩余: ${newArmorState.armorVal}`);
        }
      }
    }
    
    if (debug) {
      console.log(`    [最终] 命中 ${hitPart}, 伤害: ${finalDamage.toFixed(2)}`);
    }
    
    return { damage: finalDamage, newArmorState, hitPart };
  }
}

/**
 * 子弹策略工厂
 */
export class BulletStrategyFactory {
  static getStrategy(bulletType) {
    if (bulletType && /RIP/i.test(bulletType)) {
      return RIPBulletStrategy;
    }
    if (bulletType === 'Double') {
      return DoubleBulletStrategy;
    }
    return StandardBulletStrategy;
  }
}