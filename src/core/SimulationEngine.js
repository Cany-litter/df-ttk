// src/core/SimulationEngine.js
//
// 模拟引擎（含 CombatCore）
//
// ⭐ v2 改动（合并优化）：
//   - CombatCore.js 已被合并进本文件
//   - 所有 CombatCore 的导出（常量 / RNG / 计算器 / 策略）现在都在本文件里
//   - 对外 API 完全不变（SimulationEngine / 各类计算器 / BulletStrategyFactory / setSeed 等）
//
// ⭐ v3 改动（死代码清理）：
//   - 删除常量：HIT_KEYS / HIT_PROB_TOLERANCE / CHART_CONFIG /
//              MUZZLE_PRECISION_BONUS / TIME_UNITS / CHART_COLORS / RANK_COLORS
//   - 删除函数：resetSeed
//   - 删除类：BaseDamageCalculator（全文无引用）
//   - simulateOneTTK 去掉 verbose 参数
//
// ⭐ 合并来源：
//   - CombatCore.js（常量 + RNG + 计算器 + 策略）
//   - SimulationEngine.js（蒙特卡洛引擎）
//
// ⭐ 对外导出（保持与原 CombatCore.js 兼容）：
//   常量：SIMULATION_CONFIG
//   RNG： setSeed / seededRandom
//   计算器：DistanceDecayCalculator / ArmorDamageCalculator / HitPartSelector
//   策略：  RIPBulletStrategy / StandardBulletStrategy / BulletStrategyFactory
//
//   ⭐ 另外还导出（原 SimulationEngine.js）：
//   SimulationEngine 类 / getDecay

// ============================================================
// ============ 第一部分：CombatCore（原 CombatCore.js）======
// ============================================================
//
// 战斗计算核心（CombatUtils + BulletStrategy + config + rng 合并）

// ---------- 区块 1：常量 ----------

// 模拟配置
export const SIMULATION_CONFIG = {
  DEFAULT_SIM_COUNT: 20000,
  DISTANCE_SIM_COUNT: 20000
};

// ---------- 区块 2：种子随机数 ----------
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
 * 生成带种子的随机数
 * @returns {number} 0-1之间的随机数
 */
export function seededRandom() {
  currentSeed = (1664525 * currentSeed + 1013904223) % Math.pow(2, 32);
  return currentSeed / Math.pow(2, 32);
}

// ---------- 区块 3：战斗工具类 ----------
//
// 包含所有战斗相关的计算公式和工具方法

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
 * 护甲减伤计算器
 */
export class ArmorDamageCalculator {
  /**
   * 计算护甲减伤后的伤害
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
    const direction = seededRandom() < 0.5 ? -1 : 1;
    let newIndex = partIndex + direction;

    // 边界检查：如果越界，则向反方向偏移
    if (newIndex < 0) {
      newIndex = 1;
    } else if (newIndex >= parts.length) {
      newIndex = parts.length - 2;
    }

    if (newIndex === partIndex) {
      return referencePart;
    }

    return parts[newIndex];
  }
}

// ---------- 区块 4：子弹策略 ----------
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

// ============================================================
// ============ 第二部分：SimulationEngine（原文件）==========
// ============================================================
//
// 模拟引擎 - 负责计算击杀所需时间（TTK）
//
// 数据依赖：通过 dataManager 获取子弹数据
// 不直接依赖 bullets.js 或 data.json
//
// ⭐ 子弹启用机制：
// - getRealBulletKey 会过滤 enabled === false 的子弹
// - 如果指定了子弹 ID 但该子弹被禁用，仍然使用它（假想敌场景）
// - 如果没有指定子弹，按口径+等级查找时只查启用的
//
// ⭐ 连发间隔语义（与 TTKDP 对齐）：
//   新连发首（shots % burstCount === 1 且 shots > burstCount）的间隔 = burstInterval
//   —— 连发间隔【取代】连发内间隔，不是叠加

export class SimulationEngine {
  /**
   * 设置 DataManager 实例（由外部注入）
   * @param {DataManager} dataManager - DataManager 实例
   */
  static setDataManager(dataManager) {
    this._dataManager = dataManager;
  }

  /**
   * 获取 DataManager 实例
   * @returns {DataManager} DataManager 实例
   */
  static getDataManager() {
    if (!this._dataManager) {
      throw new Error('SimulationEngine: DataManager 未设置，请调用 setDataManager()');
    }
    return this._dataManager;
  }

  // ============================================================
  // 0. 射速间隔计算（支持分段射速）
  // ============================================================

  /**
   * 计算"第 shot 发之后到第 shot+1 发之前"的间隔时长（秒）
   *
   * 语义：间隔归属"起点发"。
   *   - shot = 1 → 第 1→2 发之间的间隔
   *   - shot = 3 → 第 3→4 发之间的间隔
   *   - 最后一发没有后续间隔（不调用）
   *
   * ⭐ 分段射速（rofStages）：
   *   - 枪管可携带 rofStages 数组，形如：
   *       [{ untilShot: 3, rofAdd: 100 }, { rofAdd: 0 }]
   *     表示"第 1~3 个间隔射速 +100，之后 +0"
   *   - 无 rofStages → 全程基础射速（向后兼容）
   *   - 连发模式（burst）→ 用 burstInternalROF，忽略 rofStages
   *
   * ⭐ 边界语义（与 TTKDP 对齐）：
   *   shot <= untilShot 表示"第 shot 个间隔"属于该阶段。
   *
   * @param {Object} weapon - 武器对象（含 _current 或原始值）
   * @param {number} shot - 起点发序号（从 1 开始）
   * @param {boolean} isBurstMode - 是否连发模式
   * @returns {number} 间隔时长（秒）
   * @private
   */
  static _getIntervalAfterShot(weapon, shot, isBurstMode) {
    // 连发模式：保持原逻辑（连发内部射速固定）
    if (isBurstMode) {
      return 60 / weapon.burstInternalROF;
    }

    // 基础射速（优先用应用附件后的当前值）
    const baseRof = weapon._current?.rof ?? weapon.rof ?? 600;

    // 分段射速（优先用应用附件后的当前值）
    const stages = weapon._current?.rofStages ?? weapon.rofStages;

    // 无分段 → 固定基础射速
    if (!stages || !Array.isArray(stages) || stages.length === 0) {
      return 60 / baseRof;
    }

    // 找到该间隔所属的阶段
    let rofAdd = 0;
    for (const stage of stages) {
      if (stage.untilShot === undefined || stage.untilShot === null || shot <= stage.untilShot) {
        rofAdd = stage.rofAdd || 0;
        break;
      }
    }

    const effectiveRof = baseRof + rofAdd;
    if (!isFinite(effectiveRof) || effectiveRof <= 0) {
      return 60 / baseRof;
    }
    return 60 / effectiveRof;
  }

  /**
   * 计算"整个击杀过程中所有射击间隔之和"（秒）
   *
   * 逐发累加：第 1 发之后到第 2 发之前…直到第 (shots-1) 发之后
   *
   * ⭐ 连发模式下，用"连发内间隔数 × 连发内间隔 + 连发间隔数 × 连发间隔"表达
   */
  static _calculateShootingIntervalTotal(weapon, totalShots, isBurstMode, burstStats) {
    if (totalShots <= 1) return 0;

    if (isBurstMode) {
      // 连发模式：连发内间隔数 = 总间隔数 - 连发间隔数
      const burstIntervalCount = burstStats.count;
      const shotInterval = 60 / weapon.burstInternalROF;
      return shotInterval * (totalShots - 1 - burstIntervalCount);
    }

    // 全自动/单发：逐发累加（支持分段射速）
    let total = 0;
    for (let shot = 1; shot < totalShots; shot++) {
      total += this._getIntervalAfterShot(weapon, shot, false);
    }
    return total;
  }

  // ============================================================
  // 1. 单次模拟（核心）
  // ============================================================

  /**
   * 模拟一次击杀过程
   *
   * ⭐ 连发部位偏置：连发第一发完全随机，后续发以 70% 概率命中同一部位，
   *    30% 概率偏移到相邻部位（头部→胸部→腹部→四肢）
   */
  static simulateOneTTK(weapon, params, bulletStrategy, bulletData) {
    // 初始化状态
    let health = params.healthValue || 100;
    let armorState = {
      armorVal: params.armorValue,
      helmetVal: params.helmetValue
    };

    // 获取参数和配置
    const { distance, hitProb } = params;

    // ⭐⭐⭐ 核心修改：优先使用 params.hitRate（由调用方传入）
    const hitRate = (typeof params.hitRate === 'number')
      ? params.hitRate
      : (typeof weapon.hitRate === 'number' ? weapon.hitRate : 0.85);

    // 计算射击间隔相关
    const isBurstMode = weapon.fireMode === 'burst' && weapon.burstCount && weapon.burstInternalROF;
    const decay = DistanceDecayCalculator.calculate(distance, weapon);

    // ⭐ 优先使用 _current.velocity（应用枪管加成后的值）
    const velocity = weapon._current?.velocity ?? weapon.velocity ?? 575;
    const flightTime = distance / velocity;

    // 统计变量
    let shots = 0;  // 总射击次数
    let hits = 0;   // 命中次数
    let burstStats = { count: 0, totalTime: 0 };  // 连发统计

    // ⭐ 连发部位偏置相关变量
    let firstHitPartInBurst = null;  // 当前连发的第一发命中部位
    let burstShots = 0;              // 当前连发内的射击计数

    // ⭐ 连发偏置强度（可配置，默认 70%）
    const BURST_BIAS = 0.7;

    // 主循环：射击直到目标死亡
    while (health > 0) {
      shots++;
      burstShots++;

      // 连发模式：检查是否需要添加连发间隔
      if (isBurstMode) {
        this._updateBurstInterval(weapon, shots, burstStats);
      }

      // 命中率判断
      if (seededRandom() > hitRate) {
        // 未命中：消耗时间但继续下一发
        continue;
      }

      // 命中
      hits++;

      // ============================================================
      // ⭐⭐⭐ 核心修改：连发武器部位偏置逻辑
      // ============================================================
      let hitPart;

      if (isBurstMode) {
        // 检查是否是连发的第一发
        const isBurstStart = (burstShots % weapon.burstCount === 1);

        if (isBurstStart) {
          // 连发开始：第一发完全随机
          firstHitPartInBurst = HitPartSelector.select(hitProb);
          hitPart = firstHitPartInBurst;
        } else {
          // 后续发：以高概率命中同一部位，否则偏移到相邻部位
          hitPart = HitPartSelector.selectWithBias(
            firstHitPartInBurst,
            hitProb,
            BURST_BIAS
          );
        }
      } else {
        // 单发模式：每次完全随机
        hitPart = HitPartSelector.select(hitProb);
      }

      // 使用确定的 hitPart 计算伤害
      const { damage, newArmorState } = bulletStrategy.calculateHitDamageWithPart(
        weapon, params, bulletData, decay, hitPart, armorState, false
      );

      health -= damage;
      armorState = newArmorState;
    }

    // ⭐ 计算总时间（逐发累加间隔，支持分段射速）
    const shootingIntervalTime = this._calculateShootingIntervalTotal(
      weapon,
      shots,
      isBurstMode,
      burstStats
    );
    const totalTime = flightTime + shootingIntervalTime + burstStats.totalTime;

    return {
      time: totalTime,
      shots,
      hits,
      burstIntervalTime: burstStats.totalTime
    };
  }

  // ============================================================
  // ⭐ 1.5 单次模拟（记录模式）—— 供伤害详情弹窗使用
  // ============================================================

  /**
   * 模拟一次击杀过程，并记录每一发的详细状态
   */
  static simulateOneTTKWithDetail(weapon, params, bulletStrategy, bulletData) {
    // 初始化状态
    let health = params.healthValue || 100;
    let armorState = {
      armorVal: params.armorValue,
      helmetVal: params.helmetValue
    };

    const { distance, hitProb } = params;

    // 命中率（与 simulateOneTTK 一致）
    const hitRate = (typeof params.hitRate === 'number')
      ? params.hitRate
      : (typeof weapon.hitRate === 'number' ? weapon.hitRate : 0.85);

    // 连发模式
    const isBurstMode = weapon.fireMode === 'burst' && weapon.burstCount && weapon.burstInternalROF;
    const decay = DistanceDecayCalculator.calculate(distance, weapon);

    // 飞行时间
    const velocity = weapon._current?.velocity ?? weapon.velocity ?? 575;
    const flightTime = distance / velocity;

    // 统计变量
    let shots = 0;
    let hits = 0;
    let burstStats = { count: 0, totalTime: 0 };

    // 连发部位偏置
    let firstHitPartInBurst = null;
    let burstShots = 0;
    const BURST_BIAS = 0.7;

    // ⭐ 逐发明细数组
    const steps = [];

    // ⭐ 逐发累加射击间隔总时间（用于最终校验）
    let shootingIntervalTotal = 0;

    // 主循环
    while (health > 0) {
      shots++;
      burstShots++;

      // ============================================================
      // ⭐ 判断本发之前是否插入了连发间隔
      // ============================================================
      let burstGapBefore = 0;
      if (isBurstMode) {
        const isNewBurstStart = (shots > weapon.burstCount) && (shots % weapon.burstCount === 1);
        if (isNewBurstStart) {
          burstGapBefore = weapon.burstInterval;
        }
        this._updateBurstInterval(weapon, shots, burstStats);
      }

      // ============================================================
      // ⭐ 计算本发之前的射击间隔（由上一发所属阶段决定）
      // ============================================================
      let shotIntervalBefore = 0;
      if (shots > 1 && burstGapBefore === 0) {
        shotIntervalBefore = this._getIntervalAfterShot(weapon, shots - 1, isBurstMode);
        if (!isBurstMode) {
          shootingIntervalTotal += shotIntervalBefore;
        }
      }

      // ============================================================
      // 命中率判断
      // ============================================================
      if (seededRandom() > hitRate) {
        steps.push({
          shot: shots,
          hit: false,
          hitPart: null,
          finalDamage: 0,
          health,
          armorVal: armorState.armorVal,
          helmetVal: armorState.helmetVal,
          burstGapBefore,
          shotIntervalBefore,
          debug: null
        });
        continue;
      }

      // 命中
      hits++;

      // 部位选择（与 simulateOneTTK 一致）
      let hitPart;
      if (isBurstMode) {
        const isBurstStart = (burstShots % weapon.burstCount === 1);
        if (isBurstStart) {
          firstHitPartInBurst = HitPartSelector.select(hitProb);
          hitPart = firstHitPartInBurst;
        } else {
          hitPart = HitPartSelector.selectWithBias(
            firstHitPartInBurst,
            hitProb,
            BURST_BIAS
          );
        }
      } else {
        hitPart = HitPartSelector.select(hitProb);
      }

      // ⭐ 调用策略时传 collectDebug = true
      const { damage, newArmorState, debug } = bulletStrategy.calculateHitDamageWithPart(
        weapon, params, bulletData, decay, hitPart, armorState, true
      );

      health -= damage;
      if (health < 0) health = 0;
      armorState = newArmorState;

      // ⭐ 记录这一发
      steps.push({
        shot: shots,
        hit: true,
        hitPart,
        finalDamage: damage,
        health,
        armorVal: armorState.armorVal,
        helmetVal: armorState.helmetVal,
        burstGapBefore,
        shotIntervalBefore,
        debug
      });
    }

    // 总时间
    let shootingIntervalTime;
    if (isBurstMode) {
      shootingIntervalTime = this._calculateShootingIntervalTotal(
        weapon,
        shots,
        true,
        burstStats
      );
    } else {
      shootingIntervalTime = shootingIntervalTotal;
    }

    const totalTime = flightTime + shootingIntervalTime + burstStats.totalTime;

    return {
      steps,
      totalTime,
      totalTimeMs: totalTime * 1000,
      shots,
      hits,
      misses: shots - hits,
      finalHealth: health,
      finalArmorVal: armorState.armorVal,
      finalHelmetVal: armorState.helmetVal,
      isBurstMode,
      flightTime,
      shotInterval: shots > 1 ? shootingIntervalTime / (shots - 1) : 0,
      burstInterval: isBurstMode ? weapon.burstInterval : 0,
      burstIntervalCount: burstStats.count,
      burstIntervalTotal: burstStats.totalTime,
      shootingIntervalTime
    };
  }

  /**
   * 更新连发间隔统计
   * @private
   */
  static _updateBurstInterval(weapon, currentShot, burstStats) {
    // 第一个连发不需要间隔
    if (currentShot <= weapon.burstCount) {
      return;
    }

    // 检查是否开始新连发
    if (currentShot % weapon.burstCount === 1) {
      burstStats.count += 1;
      burstStats.totalTime += weapon.burstInterval;
    }
  }

  // ============================================================
  // 2. 批量模拟（多次求平均）
  // ============================================================

  /**
   * 计算平均TTK统计
   */
  static calculateAvgStats(weapon, params, times = SIMULATION_CONFIG.DEFAULT_SIM_COUNT, bulletStrategy, bulletData) {
    let totalTime = 0;
    let totalShots = 0;
    let totalMisses = 0;
    let totalBurstInterval = 0;

    for (let i = 0; i < times; i++) {
      const result = this.simulateOneTTK(
        weapon,
        params,
        bulletStrategy,
        bulletData
      );

      totalTime += result.time;
      totalShots += result.shots;
      totalMisses += (result.shots - result.hits);
      totalBurstInterval += (result.burstIntervalTime || 0);
    }

    const avgTime = totalTime / times;
    const avgShots = totalShots / times;
    const avgMisses = totalMisses / times;
    const avgBurstInterval = totalBurstInterval / times;

    return {
      weapon: { ...weapon },
      avgTime,
      avgShots,
      avgMisses,
      avgBurstInterval
    };
  }

  /**
   * 计算单个距离点的 TTK 统计（用于折线图）
   */
  static calculateSinglePoint(weapon, params, times = SIMULATION_CONFIG.DEFAULT_SIM_COUNT, bulletStrategy, bulletData) {
    let totalTime = 0;
    let totalShots = 0;
    let totalMisses = 0;
    let totalBurstInterval = 0;

    for (let i = 0; i < times; i++) {
      const result = this.simulateOneTTK(
        weapon,
        params,
        bulletStrategy,
        bulletData
      );

      totalTime += result.time;
      totalShots += result.shots;
      totalMisses += (result.shots - result.hits);
      totalBurstInterval += (result.burstIntervalTime || 0);
    }

    return {
      avgTime: totalTime / times,
      avgShots: totalShots / times,
      avgMisses: totalMisses / times,
      avgBurstInterval: totalBurstInterval / times
    };
  }

  // ============================================================
  // 3. 批量计算（多武器）
  // ============================================================

  /**
   * 批量计算多个武器的TTK
   */
  static calculateWeaponsTTK(weapons, attachments, params, dataManager) {
    if (dataManager) {
      this.setDataManager(dataManager);
    }

    const dm = this.getDataManager();

    const results = weapons
      .map((weapon, idx) => {
        const attachment = attachments[idx] || {};
        const realBulletKey = this.getRealBulletKey(attachment.bulletType, weapon, params, dm);

        if (!realBulletKey) {
          console.warn(`武器 ${weapon.name} 没有匹配的子弹`);
          return null;
        }

        const bulletData = dm.getBulletById(realBulletKey);
        if (!bulletData) {
          console.warn(`武器 ${weapon.name} 的子弹 ${realBulletKey} 不存在`);
          return null;
        }

        let hitRate = params.hitRate;
        if (weapon.id && attachment.configId) {
          const priceHitRate = dm.getHitRateForDistance(
            weapon.id,
            attachment.configId || '#1',
            params.distance,
            params.hitRate
          );
          if (priceHitRate !== undefined) {
            hitRate = priceHitRate;
          }
        }

        const simParams = { ...params, hitRate };
        // ⭐ 传入 bulletData，优先用 name 匹配策略
        const strategy = BulletStrategyFactory.getStrategy(realBulletKey, bulletData);

        const stat = this.calculateAvgStats(weapon, simParams, undefined, strategy, bulletData);
        return { ...stat, weapon, name: weapon.name };
      })
      .filter(Boolean)
      .sort((a, b) => a.avgTime - b.avgTime);

    return results;
  }

  // ============================================================
  // 4. 工具方法
  // ============================================================

  /**
   * 获取真实子弹类型
   */
  static getRealBulletKey(selectedBulletType, weapon, params, dataManager) {
    const dm = dataManager || this.getDataManager();

    // ⭐ 显式指定子弹：直接用（不检查 enabled，假想敌场景）
    if (selectedBulletType) return selectedBulletType;

    const caliber = weapon.allowedBullet;
    if (!caliber) {
      console.warn(`武器 ${weapon.name} 没有指定口径 (allowedBullet)`);
      return null;
    }

    // ⭐ 按口径 + 等级查找，只查启用的子弹
    const bullet = dm.getBulletByCaliberAndLevel(caliber, params.bulletLevel);
    return bullet ? bullet.id : null;
  }
}

// 向后兼容的导出
export const getDecay = DistanceDecayCalculator.calculate;