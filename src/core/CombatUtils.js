/**
 * 战斗工具类
 * 包含所有战斗相关的计算公式和工具方法
 * 
 * ⭐ v2 变化：
 * - BaseDamageCalculator 改用 bullet.partMult[hitPart]（不再用 bullet.base）
 */

import { seededRandom } from '../utils/rng.js';

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
 * 
 * ⭐ v2：用 bullet.partMult[hitPart] 替代 bullet.base
 */
export class BaseDamageCalculator {
  /**
   * 计算基础肉伤
   * 
   * ⭐ 公式（v2）：
   *   基础肉伤 = weapon.flesh × bullet.partMult[hitPart] × weapon.mult[hitPart]
   * 
   * 说明：
   * - weapon.flesh：武器肉伤
   * - bullet.partMult[hitPart]：子弹该部位的倍率
   * - weapon.mult[hitPart]：武器该部位的倍率
   * 
   * @param {Object} weapon - 武器对象
   * @param {Object} bulletData - 子弹数据
   * @param {string} hitPart - 命中部位（head / chest / stomach / limbs）
   * @param {number} decay - 距离衰减
   * @returns {number} 基础肉伤（已乘衰减）
   */
  static calculate(weapon, bulletData, hitPart, decay) {
    const weaponMult = weapon.mult[hitPart] || 1;
    const partMult = this._getPartMult(bulletData, hitPart);
    const baseF = weapon.flesh * partMult * weaponMult;
    return baseF * decay;
  }

  /**
   * ⭐ 获取子弹该部位的倍率（带默认值兜底）
   * 
   * @param {Object} bulletData 
   * @param {string} hitPart 
   * @returns {number}
   * @private
   */
  static _getPartMult(bulletData, hitPart) {
    const pm = bulletData?.partMult;
    if (!pm || typeof pm !== 'object') return 1;
    const v = pm[hitPart];
    return (typeof v === 'number' && isFinite(v)) ? v : 1;
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
   * @param {boolean} debug - 是否打印调试日志（已弃用，不再使用）
   * @returns {Object} { finalDamage, remainingArmor }
   */
  static calculate(pureDamage, penDamage, armorDamage, armorValue, debug = false) {
    let finalDamage;
    let remainingArmor;
    
    if (armorDamage >= armorValue) {
      // 护甲被击穿
      const frac = armorValue / armorDamage;
      finalDamage = frac * penDamage + (1 - frac) * pureDamage;
      remainingArmor = 0;
    } else {
      // 护甲未被击穿
      finalDamage = penDamage;
      remainingArmor = armorValue - armorDamage;
    }
    
    return { finalDamage, remainingArmor };
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

  /**
   * ⭐ 基于参考部位选择相邻部位（用于连发武器）
   * 连发内第一发完全随机，后续发以较高概率命中同一部位，
   * 否则偏移到相邻部位（向上或向下）
   * 
   * @param {string} referencePart - 参考部位（连发第一发命中的部位）
   * @param {Object} hitProb - 命中概率分布（用于第一发随机选择）
   * @param {number} biasStrength - 偏置强度 (0-1)，默认 0.7
   *   表示 70% 概率保持同一部位，30% 概率偏移到相邻部位
   * @returns {string} 选择的部位
   */
  static selectWithBias(referencePart, hitProb, biasStrength = 0.7) {
    // 部位层级（从上到下）
    const parts = ['head', 'chest', 'stomach', 'limbs'];
    const partIndex = parts.indexOf(referencePart);
    
    // 如果参考部位无效，回退到完全随机
    if (partIndex === -1) {
      return this.select(hitProb);
    }
    
    // ⭐ 以 biasStrength 概率保持同一部位
    if (seededRandom() < biasStrength) {
      return referencePart;
    }
    
    // ⭐ 否则偏移到相邻部位（向上或向下随机）
    // 但不能越界
    const direction = seededRandom() < 0.5 ? -1 : 1;
    let newIndex = partIndex + direction;
    
    // 边界检查：如果越界，则向反方向偏移
    if (newIndex < 0) {
      newIndex = 1; // 向下偏移一个
    } else if (newIndex >= parts.length) {
      newIndex = parts.length - 2; // 向上偏移一个
    }
    
    // 如果偏移后还是原部位（边界情况，理论上不会发生），返回原部位
    if (newIndex === partIndex) {
      return referencePart;
    }
    
    return parts[newIndex];
  }
}