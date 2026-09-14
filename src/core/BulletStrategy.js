import { BaseDamageCalculator, HitPartSelector, ArmorDamageCalculator } from './CombatUtils.js';

/**
 * ⭐ 子弹策略 v4
 * 
 * 字段：
 * - partMult: { head, chest, stomach, limbs } 各部位肉伤比例
 * - armorData: { 1~6: { pen, armorMult } } 各护甲等级穿透/倍率
 * 
 * 策略（2 个）：
 * - Standard: 默认策略，用 partMult[hitPart]
 * - RIP:      固定命中四肢，无视护甲
 * 
 * ⭐ v4 变化：
 * - 删除 STBulletStrategy（ST 子弹用 partMult 表达）
 * - 删除 DoubleBulletStrategy（双头弹走 Standard）
 */

/**
 * 获取子弹的 partMult（带默认值兜底）
 */
function getPartMult(bulletData, hitPart) {
  const pm = bulletData?.partMult;
  if (!pm || typeof pm !== 'object') return 1;
  const v = pm[hitPart];
  return (typeof v === 'number' && isFinite(v)) ? v : 1;
}

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
   * 使用指定的 hitPart 计算伤害
   * 
   * @param {boolean} collectDebug - 是否收集中间计算值
   */
  static calculateHitDamageWithPart(weapon, params, bulletData, decay, hitPart, armorState, collectDebug = false) {
    // RIP子弹固定命中四肢，忽略传入的 hitPart
    const fixedHitPart = 'limbs';
    const partMult = getPartMult(bulletData, fixedHitPart);
    const weaponMult = weapon.mult[fixedHitPart] || 1;
    const baseF = weapon.flesh * partMult * weaponMult;
    const pureDamage = baseF * decay;

    const result = {
      damage: pureDamage,
      newArmorState: { ...armorState },
      hitPart: fixedHitPart
    };

    if (collectDebug) {
      result.debug = {
        hitPart: fixedHitPart,
        mult: weaponMult,
        partMult,
        bulletBase: null,
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
 * 标准子弹策略
 * 
 * ⭐ v4：ST 子弹、双头弹都用此策略
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
   * 使用指定的 hitPart 计算伤害
   * 
   * @param {boolean} collectDebug - 是否收集中间计算值
   */
  static calculateHitDamageWithPart(weapon, params, bulletData, decay, hitPart, armorState, collectDebug = false) {
    const { armorLevel, helmetLevel } = params;
    const { armorVal, helmetVal } = armorState;
    
    // 用 partMult 替代 base
    const partMult = getPartMult(bulletData, hitPart);
    const weaponMult = weapon.mult[hitPart] || 1;
    const baseF = weapon.flesh * partMult * weaponMult;
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
        partMult,
        bulletBase: null,
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
 * 
 * ⭐ v4 匹配规则：
 * - 优先用 bulletData.name 匹配
 * - 回退到 bulletType 字符串匹配
 * 
 * 匹配：
 * 1. RIP / CT（包含）→ RIPBulletStrategy
 * 2. 默认 → StandardBulletStrategy
 * 
 * ⭐ 注意：
 * - 不再匹配 ST（ST 子弹走 Standard，partMult 携带 ST 倍率）
 * - 不再匹配 Double（双头弹走 Standard）
 * - CT 仍走 RIP 策略（⚠️ 待确认是否是误判）
 */
export class BulletStrategyFactory {
  /**
   * 获取子弹策略
   * 
   * @param {string} bulletType - 子弹 ID
   * @param {Object} [bulletData] - 子弹数据（推荐传，用 name 匹配）
   * @returns {Function} 策略类
   */
  static getStrategy(bulletType, bulletData = null) {
    const key = String(bulletData?.name || bulletType || '');

    // RIP / CT：包含匹配
    if (/RIP|CT/i.test(key)) {
      return RIPBulletStrategy;
    }

    // 默认：Standard
    return StandardBulletStrategy;
  }
}