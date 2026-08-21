import { seededRandom } from '../utils/rng.js';

/**
 * 战斗工具类
 * 包含所有战斗相关的计算公式和工具方法
 * 
 * 适配新的 configs 结构：
 * - 战斗计算不直接依赖 configs
 * - configs 中的命中率曲线在 SimulationEngine 中处理
 */

/**
 * 距离衰减计算器
 */
export class DistanceDecayCalculator {
  /**
   * 计算距离对应的衰减倍率
   * @param {number} distance - 距离
   * @param {Object} weapon - 武器对象
   * @returns {number} 衰减倍率
   */
  static calculate(distance, weapon) {
    const { ranges, decays } = weapon;
    // ranges: [r1, r2, r3, r4]
    // 正确的射程段划分：[0, r1), [r1, r2), [r2, r3), [r3, r4), [r4, Infinity)
    // 使用 < 而不是 <= 来确保边界正确
    if (distance < ranges[0]) return decays[0];
    if (distance < ranges[1]) return decays[1];
    if (distance < ranges[2]) return decays[2];
    if (distance < ranges[3]) return decays[3];
    return decays[4];
  }
}

/**
 * 基础伤害计算器
 */
export class BaseDamageCalculator {
  /**
   * 计算基础肉伤
   * @param {Object} weapon - 武器对象
   * @param {Object} bulletData - 子弹数据
   * @param {string} hitPart - 命中部位
   * @param {number} decay - 距离衰减
   * @returns {number} 基础肉伤
   */
  static calculate(weapon, bulletData, hitPart, decay) {
    const mult = weapon.mult[hitPart];
    const baseF = weapon.flesh * bulletData.base * mult;
    return baseF * decay;
  }
}

/**
 * 护甲减伤计算器
 */
export class ArmorDamageCalculator {
  /**
   * 计算护甲减伤后的伤害
   * @param {number} pureDamage - 纯肉伤
   * @param {number} penDamage - 穿透伤害
   * @param {number} armorDamage - 护甲伤害
   * @param {number} armorValue - 护甲值
   * @returns {Object} { finalDamage, remainingArmor }
   */
  static calculate(pureDamage, penDamage, armorDamage, armorValue) {
    if (armorDamage >= armorValue) {
      const frac = armorValue / armorDamage;
      const finalDamage = frac * penDamage + (1 - frac) * pureDamage;
      return { finalDamage, remainingArmor: 0 };
    } else {
      return { finalDamage: penDamage, remainingArmor: armorValue - armorDamage };
    }
  }
}

/**
 * 命中部位选择器
 */
export class HitPartSelector {
  /**
   * 根据命中概率随机选择命中部位
   * @param {Object} hitProb - 命中概率对象
   * @returns {string} 命中部位
   */
  static select(hitProb) {
    const rnd = seededRandom();
    let sum = 0;
    for (let key of ['head', 'chest', 'stomach', 'limbs']) {
      sum += hitProb[key];
      if (rnd <= sum) return key;
    }
    return 'chest'; // 默认值
  }
}

/**
 * 伤害计算工具类（整合版）
 * 提供一站式伤害计算
 */
export class DamageCalculator {
  /**
   * 计算单次命中的完整伤害
   * @param {Object} weapon - 武器对象
   * @param {Object} bulletData - 子弹数据
   * @param {Object} params - 游戏参数
   * @param {number} distance - 交战距离
   * @param {Object} hitProb - 命中概率
   * @param {Object} armorState - 护甲状态 { armorVal, helmetVal }
   * @param {string} hitPart - 可选，指定命中部位（不指定则随机）
   * @returns {Object} { damage, newArmorState, hitPart }
   */
  static calculateHit(weapon, bulletData, params, distance, hitProb, armorState, hitPart = null) {
    const { armorLevel, helmetLevel } = params;
    const { armorVal, helmetVal } = armorState;
    
    // 选择命中部位
    const selectedPart = hitPart || HitPartSelector.select(hitProb);
    
    // 计算衰减
    const decay = DistanceDecayCalculator.calculate(distance, weapon);
    
    // 计算基础伤害
    const pureDamage = BaseDamageCalculator.calculate(weapon, bulletData, selectedPart, decay);
    
    // 计算穿透伤害
    const penArmor = bulletData.armor[armorLevel].pen;
    const penHelmet = bulletData.armor[helmetLevel].pen;
    const penF = pureDamage * (selectedPart === 'head' ? penHelmet : penArmor);
    
    let finalDamage;
    let newArmorState = { ...armorState };
    
    if (selectedPart === 'limbs') {
      // 四肢：直接纯肉伤，无护甲减伤
      finalDamage = pureDamage;
    } else if (selectedPart === 'head') {
      // 头部：走头盔减伤逻辑
      if (helmetVal <= 0) {
        finalDamage = pureDamage;
      } else {
        const aMultHelmet = bulletData.armor[helmetLevel].armorMult;
        const helmetD = weapon.armor * aMultHelmet;
        const result = ArmorDamageCalculator.calculate(pureDamage, penF, helmetD, helmetVal);
        finalDamage = result.finalDamage;
        newArmorState.helmetVal = result.remainingArmor;
      }
    } else {
      // 胸部和腹部：走护甲减伤逻辑
      if (armorVal <= 0) {
        finalDamage = pureDamage;
      } else {
        const aMultArmor = bulletData.armor[armorLevel].armorMult;
        const armorD = weapon.armor * aMultArmor;
        const result = ArmorDamageCalculator.calculate(pureDamage, penF, armorD, armorVal);
        finalDamage = result.finalDamage;
        newArmorState.armorVal = result.remainingArmor;
      }
    }
    
    return {
      damage: finalDamage,
      newArmorState,
      hitPart: selectedPart,
      pureDamage,
      decay
    };
  }

  /**
   * 检查是否击杀
   * @param {number} health - 当前生命值
   * @param {number} damage - 造成伤害
   * @returns {boolean} 是否击杀
   */
  static isKill(health, damage) {
    return health - damage <= 0;
  }

  /**
   * 计算击杀所需命中次数（理论值）
   * @param {number} health - 目标生命值
   * @param {number} damagePerHit - 每次命中伤害
   * @returns {number} 所需命中次数（向上取整）
   */
  static hitsToKill(health, damagePerHit) {
    if (damagePerHit <= 0) return Infinity;
    return Math.ceil(health / damagePerHit);
  }
}

// 向后兼容的导出
export const getDecay = DistanceDecayCalculator.calculate;