// src/core/BulletStrategy.js

import {
  getBulletLevelData,
  getSpecialBulletData,
  isRipBullet,
  isDoubleBullet,
  getArmorDamageForLevel,
  getPenLevelForLevel,
} from './bullets.js';
import { BaseDamageCalculator, HitPartSelector, ArmorDamageCalculator } from './CombatUtils.js';

/**
 * 标准子弹策略
 * 
 * 适用于常规口径子弹 (1-5级)
 * 使用穿透机制: 根据 penLevels 数组决定肉体伤害留存比例
 */
export class StandardBulletStrategy {
  /**
   * 计算单次命中伤害
   * @param {Object} weapon - 武器对象
   * @param {Object} params - 游戏参数 { armorLevel, helmetLevel, distance, hitProb, bulletLevel }
   * @param {Object} bulletData - 子弹等级数据 { base, armorDamage, penLevels }
   * @param {number} decay - 距离衰减
   * @param {Object} hitProb - 命中概率对象
   * @param {Object} armorState - 护甲状态 { armorVal, helmetVal }
   * @param {number} bulletLevel - 子弹等级
   * @param {number} armorLevel - 护甲等级 (用于穿透计算)
   * @param {number} helmetLevel - 头盔等级 (用于穿透计算)
   * @returns {Object} { damage, newArmorState, hitPart }
   */
  static calculateHitDamage(
    weapon,
    params,
    bulletData,
    decay,
    hitProb,
    armorState,
    bulletLevel,
    armorLevel,
    helmetLevel
  ) {
    const { armorVal, helmetVal } = armorState;

    // 选择命中部位
    const hitPart = HitPartSelector.select(hitProb);

    // 计算基础伤害
    const pureDamage = BaseDamageCalculator.calculate(weapon, bulletData, hitPart, decay);

    // 确定使用护甲等级还是头盔等级
    let targetArmorLevel = armorLevel;
    let targetArmorVal = armorVal;

    if (hitPart === 'head') {
      targetArmorLevel = helmetLevel;
      targetArmorVal = helmetVal;
    }

    // 获取护甲伤害衰减 (子弹对护甲的消耗系数)
    const armorDamageMult = getArmorDamageForLevel(
      params.bulletType || '5.56x45',
      bulletLevel,
      targetArmorLevel
    );

    // 获取护甲穿透水平 (肉体伤害留存比例)
    const penLevelValue = getPenLevelForLevel(
      params.bulletType || '5.56x45',
      bulletLevel,
      targetArmorLevel
    );

    let finalDamage;
    let newArmorState = { ...armorState };

    if (hitPart === 'limbs') {
      // 四肢：直接纯肉伤，无护甲减伤
      finalDamage = pureDamage;
    } else if (hitPart === 'head') {
      // 头部：走头盔减伤逻辑
      if (helmetVal <= 0) {
        finalDamage = pureDamage;
      } else {
        // 护甲伤害 = 武器护甲伤害 × 护甲伤害衰减
        const armorD = weapon.armor * armorDamageMult;
        // 穿透伤害 = 纯肉伤 × 护甲穿透水平
        const penF = pureDamage * penLevelValue;
        const result = ArmorDamageCalculator.calculate(pureDamage, penF, armorD, helmetVal);
        finalDamage = result.finalDamage;
        newArmorState.helmetVal = result.remainingArmor;
      }
    } else {
      // 胸部和腹部：走护甲减伤逻辑
      if (armorVal <= 0) {
        finalDamage = pureDamage;
      } else {
        const armorD = weapon.armor * armorDamageMult;
        const penF = pureDamage * penLevelValue;
        const result = ArmorDamageCalculator.calculate(pureDamage, penF, armorD, armorVal);
        finalDamage = result.finalDamage;
        newArmorState.armorVal = result.remainingArmor;
      }
    }

    return { damage: finalDamage, newArmorState, hitPart };
  }
}

/**
 * RIP/CT 子弹策略
 * 
 * 特点:
 * - 所有命中全算四肢 (无视护甲)
 * - 护甲穿透水平全为0
 * - 不受护甲减伤影响
 */
export class RipBulletStrategy {
  /**
   * 计算单次命中伤害
   * @param {Object} weapon - 武器对象
   * @param {Object} params - 游戏参数
   * @param {Object} bulletData - 特殊子弹数据
   * @param {number} decay - 距离衰减
   * @param {Object} hitProb - 命中概率对象 (实际被忽略)
   * @param {Object} armorState - 护甲状态
   * @param {number} bulletLevel - 子弹等级 (未使用)
   * @param {number} armorLevel - 护甲等级 (未使用)
   * @param {number} helmetLevel - 头盔等级 (未使用)
   * @returns {Object} { damage, newArmorState, hitPart }
   */
  static calculateHitDamage(
    weapon,
    params,
    bulletData,
    decay,
    hitProb,
    armorState,
    bulletLevel,
    armorLevel,
    helmetLevel
  ) {
    // RIP/CT 全部命中算四肢
    const hitPart = 'limbs';

    // 计算基础伤害 (使用四肢倍率)
    const mult = weapon.mult[hitPart];
    const baseF = weapon.flesh * bulletData.base * mult;
    const pureDamage = baseF * decay;

    // RIP/CT 无视护甲，直接造成纯肉伤
    return {
      damage: pureDamage,
      newArmorState: { ...armorState },
      hitPart: hitPart,
    };
  }
}

/**
 * 双头弹策略
 * 
 * 特点:
 * - 肉伤固定74，甲伤固定11
 * - 受射程衰减和部位倍率影响
 * - 钝伤机制: 5甲40%肉伤, 6甲30%肉伤
 */
export class DoubleBulletStrategy {
  /**
   * 计算单次命中伤害
   * @param {Object} weapon - 武器对象
   * @param {Object} params - 游戏参数
   * @param {Object} bulletData - 特殊子弹数据 (包含 fixedFleshDamage, fixedArmorDamage, bluntDamage)
   * @param {number} decay - 距离衰减
   * @param {Object} hitProb - 命中概率对象
   * @param {Object} armorState - 护甲状态
   * @param {number} bulletLevel - 子弹等级 (双头弹固定等级4)
   * @param {number} armorLevel - 护甲等级
   * @param {number} helmetLevel - 头盔等级
   * @returns {Object} { damage, newArmorState, hitPart }
   */
  static calculateHitDamage(
    weapon,
    params,
    bulletData,
    decay,
    hitProb,
    armorState,
    bulletLevel,
    armorLevel,
    helmetLevel
  ) {
    const { armorVal, helmetVal } = armorState;

    // 选择命中部位
    const hitPart = HitPartSelector.select(hitProb);

    // 固定伤害值
    const fixedFleshDamage = bulletData.fixedFleshDamage || 74;
    const fixedArmorDamage = bulletData.fixedArmorDamage || 11;

    // 计算受射程衰减和部位倍率影响后的肉伤
    const mult = weapon.mult[hitPart];
    const pureDamage = fixedFleshDamage * mult * decay;

    // 确定使用护甲等级还是头盔等级
    let targetArmorLevel = armorLevel;
    let targetArmorVal = armorVal;

    if (hitPart === 'head') {
      targetArmorLevel = helmetLevel;
      targetArmorVal = helmetVal;
    }

    // 获取护甲穿透水平 (双头弹使用常规穿透机制)
    const penLevelValue = getPenLevelForLevel(
      params.bulletType || '12.7x55',
      bulletLevel,
      targetArmorLevel
    );

    // 钝伤机制: 命中5/6级护甲时造成部分肉体伤害
    const bluntDamage = bulletData.bluntDamage || { 5: 0.40, 6: 0.30 };
    let bluntMultiplier = 1.0;
    if (targetArmorLevel >= 5) {
      bluntMultiplier = bluntDamage[targetArmorLevel] || 0.0;
    }

    let finalDamage;
    let newArmorState = { ...armorState };

    if (hitPart === 'limbs') {
      // 四肢：直接纯肉伤，无护甲减伤
      finalDamage = pureDamage;
    } else if (hitPart === 'head') {
      // 头部：走头盔减伤逻辑，使用固定甲伤
      if (helmetVal <= 0) {
        finalDamage = pureDamage;
      } else {
        // 头盔等级 >= 5 时应用钝伤
        if (helmetLevel >= 5 && bluntMultiplier > 0) {
          // 钝伤: 跳过护甲减伤，直接造成部分肉体伤害
          finalDamage = pureDamage * bluntMultiplier;
          // 同时消耗少量护甲 (钝伤时护甲消耗减半)
          const armorD = fixedArmorDamage * 0.5;
          const newHelmetVal = Math.max(0, helmetVal - armorD);
          newArmorState.helmetVal = newHelmetVal;
        } else {
          // 标准减伤
          const armorD = fixedArmorDamage;
          const penF = pureDamage * penLevelValue;
          const result = ArmorDamageCalculator.calculate(pureDamage, penF, armorD, helmetVal);
          finalDamage = result.finalDamage;
          newArmorState.helmetVal = result.remainingArmor;
        }
      }
    } else {
      // 胸部和腹部：走护甲减伤逻辑，使用固定甲伤
      if (armorVal <= 0) {
        finalDamage = pureDamage;
      } else {
        // 护甲等级 >= 5 时应用钝伤
        if (armorLevel >= 5 && bluntMultiplier > 0) {
          // 钝伤: 跳过护甲减伤，直接造成部分肉体伤害
          finalDamage = pureDamage * bluntMultiplier;
          // 同时消耗少量护甲 (钝伤时护甲消耗减半)
          const armorD = fixedArmorDamage * 0.5;
          const newArmorVal = Math.max(0, armorVal - armorD);
          newArmorState.armorVal = newArmorVal;
        } else {
          // 标准减伤
          const armorD = fixedArmorDamage;
          const penF = pureDamage * penLevelValue;
          const result = ArmorDamageCalculator.calculate(pureDamage, penF, armorD, armorVal);
          finalDamage = result.finalDamage;
          newArmorState.armorVal = result.remainingArmor;
        }
      }
    }

    return { damage: finalDamage, newArmorState, hitPart };
  }
}

/**
 * 子弹策略工厂
 * 
 * 根据子弹类型返回对应的策略类
 */
export class BulletStrategyFactory {
  /**
   * 获取子弹策略
   * @param {string} bulletKey - 子弹key (口径 或 特殊子弹名称)
   * @param {number} level - 子弹等级
   * @returns {Object} 策略类
   */
  static getStrategy(bulletKey, level = null) {
    // 检查是否为双头弹
    if (isDoubleBullet(bulletKey)) {
      return DoubleBulletStrategy;
    }

    // 检查是否为RIP/CT
    if (isRipBullet(bulletKey)) {
      return RipBulletStrategy;
    }

    // 默认使用标准策略
    return StandardBulletStrategy;
  }

  /**
   * 获取策略名称
   * @param {string} bulletKey - 子弹key
   * @returns {string} 策略名称
   */
  static getStrategyName(bulletKey) {
    if (isDoubleBullet(bulletKey)) return '双头弹策略';
    if (isRipBullet(bulletKey)) return 'RIP/CT策略';
    return '标准策略';
  }

  /**
   * 获取策略描述
   * @param {string} bulletKey - 子弹key
   * @returns {string} 策略描述
   */
  static getStrategyDescription(bulletKey) {
    if (isDoubleBullet(bulletKey)) {
      return '双头弹: 固定肉伤74，甲伤11，钝伤机制(5甲40%,6甲30%)';
    }
    if (isRipBullet(bulletKey)) {
      return 'RIP/CT: 全算四肢，无视护甲';
    }
    return '标准策略: 根据护甲穿透水平计算伤害';
  }
}

// 向后兼容的导出
export const getStrategy = BulletStrategyFactory.getStrategy;