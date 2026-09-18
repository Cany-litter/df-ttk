// src/core/CombatCore.js
//
// 战斗计算核心（CombatUtils + BulletStrategy + config + rng 合并）
//
// ⭐ 合并来源：
//   - config.js            → 区块 1（常量）
//   - utils/rng.js         → 区块 2（种子随机数）
//   - CombatUtils.js       → 区块 3（4 个计算器类）
//   - BulletStrategy.js    → 区块 4（3 个策略类 + 工厂）
//
// ⭐ 依赖关系：
//   - 区块 3 依赖 区块 2（seededRandom）
//   - 区块 4 依赖 区块 3（BaseDamageCalculator / HitPartSelector / ArmorDamageCalculator）
//   - 合并后无跨文件依赖
//
// ⭐ 对外导出（保持兼容）：
//   常量：HIT_KEYS / HIT_PROB_TOLERANCE / CHART_CONFIG / SIMULATION_CONFIG /
//         MUZZLE_PRECISION_BONUS / TIME_UNITS / CHART_COLORS / RANK_COLORS
//   RNG： setSeed / resetSeed / seededRandom
//   计算器：DistanceDecayCalculator / BaseDamageCalculator /
//           ArmorDamageCalculator / HitPartSelector
//   策略：  RIPBulletStrategy / StandardBulletStrategy / BulletStrategyFactory

// ============================================================
// 1. 常量（原 config.js）
// ============================================================

// 命中部位常量
export const HIT_KEYS = ['head', 'chest', 'stomach', 'limbs'];

// 命中概率校验容差
export const HIT_PROB_TOLERANCE = 1e-6;

// 图表配置
export const CHART_CONFIG = {
  // 距离图表配置
  MAX_DISTANCE: 100,
  CUTOFF_DISTANCE: 35,
  // 显示配置
  TOP_WEAPONS_COUNT: 10,
  PADDING_TOP: 40
};

// 模拟配置
export const SIMULATION_CONFIG = {
  DEFAULT_SIM_COUNT: 20000,
  DISTANCE_SIM_COUNT: 20000
};

// 枪口精度加成
export const MUZZLE_PRECISION_BONUS = 1.09;

// 时间单位转换
export const TIME_UNITS = {
  SECONDS_TO_MS: 1000,
  MINUTES_TO_SECONDS: 60
};

// 图表颜色配置
export const CHART_COLORS = {
  NO_MISS_FIRE: 'rgba(54, 162, 235, 0.7)',
  EMPTY_DELAY: 'rgba(75, 192, 192, 0.7)',
  FLIGHT_DELAY: 'rgba(255, 159, 64, 0.7)',
  BURST_INTERVAL: 'rgba(255, 99, 132, 0.7)',
  TRIGGER_DELAY: 'rgba(153, 102, 255, 0.7)'
};

// 排名变化颜色
export const RANK_COLORS = {
  NO_CHANGE: '#000000',  // 黑色表示无变化
  RANK_UP: '#ff0000',    // 红色表示排名提升
  RANK_DOWN: '#00ff00'   // 绿色表示排名下降
};

// ============================================================
// 2. 种子随机数（原 utils/rng.js）
// ============================================================
//
// 简单的随机种子管理
// 使用固定种子确保模拟结果的一致性
// LCG 参数：a = 1664525, c = 1013904223, m = 2^32

let currentSeed = 12345; // 固定种子

/**
 * 设置随机种子
 * @param {number} seed - 种子值
 */
export function setSeed(seed) {
  currentSeed = seed;
}

/**
 * 重置到默认种子
 */
export function resetSeed() {
  currentSeed = 12345;
}

/**
 * 生成带种子的随机数
 * @returns {number} 0-1之间的随机数
 */
export function seededRandom() {
  currentSeed = (1664525 * currentSeed + 1013904223) % Math.pow(2, 32);
  return currentSeed / Math.pow(2, 32);
}

// ============================================================
// 3. 战斗工具类（原 CombatUtils.js）
// ============================================================
//
// 包含所有战斗相关的计算公式和工具方法
//
// ⭐ v2 变化：
// - BaseDamageCalculator 改用 bullet.partMult[hitPart]（不再用 bullet.base）

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

// ============================================================
// 4. 子弹策略（原 BulletStrategy.js）
// ============================================================
//
// ⭐ 子弹策略 v4
//
// 字段：
// - partMult: { head, chest, stomach, limbs } 各部位肉伤比例
// - armorData: { 1~6: { pen, armorMult } } 各护甲等级穿透/倍率
//
// 策略（2 个）：
// - Standard: 默认策略，用 partMult[hitPart]
// - RIP:      固定命中四肢，无视护甲
//
// ⭐ v4 变化：
// - 删除 STBulletStrategy（ST 子弹用 partMult 表达）
// - 删除 DoubleBulletStrategy（双头弹走 Standard）

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