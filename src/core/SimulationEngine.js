// src/core/SimulationEngine.js

import { SIMULATION_CONFIG } from './config.js';
import { DistanceDecayCalculator } from './CombatUtils.js';
import { BulletStrategyFactory } from './BulletStrategy.js';
import {
  getCaliberData,
  getBulletLevelData,
  getSpecialBulletData,
  isSpecialBullet,
  isRipBullet,
  isDoubleBullet,
  calculatePenetrationMultiplier,
} from './bullets.js';
import { seededRandom } from '../utils/rng.js';
import { calculateHitRate } from '../utils/hitRateUtils.js';

/**
 * 模拟引擎 - 负责计算击杀所需时间（TTK）
 * 
 * 适配新的子弹数据结构:
 * - bulletType: 口径名称 (如 '5.45x39') 或 特殊子弹名称 (如 '9x19-RIP')
 * - bulletLevel: 子弹等级 (1-5)，常规口径需要，特殊子弹使用固定等级
 * - 从 bulletData 中读取: base, armorDamage, penLevels
 * - 使用 calculatePenetrationMultiplier 计算穿透修正
 */
export class SimulationEngine {
  /**
   * 模拟一次击杀过程
   * 
   * @param {Object} weapon - 武器对象
   * @param {Object} params - 游戏参数 (距离、护甲等级等)
   * @param {Object} bulletStrategy - 子弹策略
   * @param {Object} config - 改枪配置 (包含 hitRatePoints)
   * @param {number} defaultHitRate - 统一命中率
   * @param {string} bulletType - 口径或特殊子弹名称
   * @param {number} bulletLevel - 子弹等级
   * @returns {Object} { time, shots, hits, burstIntervalTime }
   */
  static simulateOneTTK(
    weapon,
    params,
    bulletStrategy,
    config = null,
    defaultHitRate = 0.80,
    bulletType = null,
    bulletLevel = null
  ) {
    // 初始化状态
    let health = params.healthValue || 100;
    let armorState = {
      armorVal: params.armorValue,
      helmetVal: params.helmetValue,
    };

    // 获取参数
    const { distance, hitProb, armorLevel, helmetLevel } = params;

    // 获取子弹数据
    const bData = this.getBulletData(bulletType, bulletLevel);
    if (!bData) {
      // 如果子弹数据不存在，返回一个空结果
      return { time: Infinity, shots: 0, hits: 0, burstIntervalTime: 0 };
    }

    // 计算命中率 - 从 config 读取
    let hitRate;
    if (config && config.hitRatePoints && Array.isArray(config.hitRatePoints)) {
      hitRate = calculateHitRate(config.hitRatePoints, distance, defaultHitRate);
    } else {
      hitRate = defaultHitRate;
    }

    // 计算射击间隔
    const isBurstMode = weapon.fireMode === 'burst' && weapon.burstCount && weapon.burstInternalROF;
    const shotInterval = this._calculateShotInterval(weapon, isBurstMode);
    const decay = DistanceDecayCalculator.calculate(distance, weapon);

    // 统计变量
    let shots = 0;
    let hits = 0;
    let burstStats = { count: 0, totalTime: 0 };

    // 主循环：射击直到目标死亡
    while (health > 0) {
      shots++;

      // 连发模式：检查是否需要添加连发间隔
      if (isBurstMode) {
        this._updateBurstInterval(weapon, shots, burstStats);
      }

      // 命中率判断
      if (seededRandom() > hitRate) {
        continue;
      }

      // 命中：计算伤害
      hits++;
      const result = bulletStrategy.calculateHitDamage(
        weapon,
        params,
        bData,
        decay,
        hitProb,
        armorState,
        bulletLevel || 4,
        armorLevel,
        helmetLevel
      );

      health -= result.damage;
      armorState = result.newArmorState;
    }

    // 计算总时间
    const flightTime = distance / weapon.velocity;
    const totalTime = this._calculateTotalTime(
      flightTime,
      shotInterval,
      shots,
      isBurstMode,
      burstStats
    );

    return {
      time: totalTime,
      shots,
      hits,
      burstIntervalTime: burstStats.totalTime,
    };
  }

  /**
   * 获取子弹数据
   * @param {string} bulletType - 口径或特殊子弹名称
   * @param {number} bulletLevel - 子弹等级
   * @returns {Object|null} 子弹数据对象
   */
  static getBulletData(bulletType, bulletLevel) {
    if (!bulletType) return null;

    // 检查是否为特殊子弹
    if (isSpecialBullet(bulletType)) {
      return getSpecialBulletData(bulletType);
    }

    // 常规口径
    if (bulletLevel !== null && bulletLevel !== undefined) {
      return getBulletLevelData(bulletType, bulletLevel);
    }

    return null;
  }

  /**
   * 获取真实子弹类型和等级
   * @param {string} selectedBulletType - 用户选择的子弹类型
   * @param {number} selectedBulletLevel - 用户选择的子弹等级
   * @param {Object} weapon - 武器对象
   * @param {Object} params - 游戏参数
   * @param {Object} config - 改枪配置
   * @returns {Object} { bulletType, bulletLevel }
   */
  static getRealBulletInfo(selectedBulletType, selectedBulletLevel, weapon, params, config = null) {
    // 1. 从 config 读取
    let bulletType = config?.bulletType || selectedBulletType || params.bulletLevel;
    let bulletLevel = config?.bulletLevel !== undefined ? config.bulletLevel : (selectedBulletLevel || params.bulletLevel || 4);

    // 2. 检查武器是否允许该口径
    const allowedBullets = weapon.allowedBullets || [];
    if (!allowedBullets.includes(bulletType)) {
      // 如果不允许，使用第一个允许的口径
      if (allowedBullets.length > 0) {
        bulletType = allowedBullets[0];
        // 使用 params 中的等级
        bulletLevel = params.bulletLevel || 4;
      } else {
        // 如果没有允许的口径，使用 params
        bulletType = params.bulletLevel;
        bulletLevel = params.bulletLevel || 4;
      }
    }

    // 3. 检查是否为特殊子弹 (特殊子弹不使用等级)
    if (isSpecialBullet(bulletType)) {
      const specialData = getSpecialBulletData(bulletType);
      if (specialData) {
        bulletLevel = specialData.level || 4;
      }
    }

    return { bulletType, bulletLevel };
  }

  /**
   * 计算射击间隔（秒）
   * @private
   */
  static _calculateShotInterval(weapon, isBurstMode) {
    if (isBurstMode) {
      return 60 / weapon.burstInternalROF;
    } else {
      return 60 / weapon.rof;
    }
  }

  /**
   * 更新连发间隔统计
   * @private
   */
  static _updateBurstInterval(weapon, currentShot, burstStats) {
    if (currentShot <= weapon.burstCount) return;
    if (currentShot % weapon.burstCount === 1) {
      burstStats.count += 1;
      burstStats.totalTime += weapon.burstInterval;
    }
  }

  /**
   * 计算总击杀时间
   * @private
   */
  static _calculateTotalTime(flightTime, shotInterval, totalShots, isBurstMode, burstStats) {
    const burstIntervalCount = burstStats.count;
    const shootingIntervalTime = shotInterval * (totalShots - 1 - burstIntervalCount);
    return flightTime + shootingIntervalTime + burstStats.totalTime;
  }

  /**
   * 计算平均TTK统计
   * 
   * @param {Object} weapon - 武器对象
   * @param {Object} params - 游戏参数
   * @param {number} times - 模拟次数
   * @param {Object} bulletStrategy - 子弹策略
   * @param {Object} config - 改枪配置
   * @param {number} defaultHitRate - 统一命中率
   * @param {string} bulletType - 口径或特殊子弹名称
   * @param {number} bulletLevel - 子弹等级
   * @returns {Object} { weapon, avgTime, avgShots, avgMisses, avgBurstInterval }
   */
  static calculateAvgStats(
    weapon,
    params,
    times = SIMULATION_CONFIG.DEFAULT_SIM_COUNT,
    bulletStrategy,
    config = null,
    defaultHitRate = 0.80,
    bulletType = null,
    bulletLevel = null
  ) {
    let totalTime = 0;
    let totalShots = 0;
    let totalMisses = 0;
    let totalBurstInterval = 0;

    for (let i = 0; i < times; i++) {
      const result = this.simulateOneTTK(
        weapon,
        params,
        bulletStrategy,
        config,
        defaultHitRate,
        bulletType,
        bulletLevel
      );

      totalTime += result.time;
      totalShots += result.shots;
      totalMisses += (result.shots - result.hits);
      totalBurstInterval += (result.burstIntervalTime || 0);
    }

    return {
      weapon: { ...weapon },
      avgTime: totalTime / times,
      avgShots: totalShots / times,
      avgMisses: totalMisses / times,
      avgBurstInterval: totalBurstInterval / times,
    };
  }

  /**
   * 批量计算多个武器的TTK
   * 
   * @param {Array} weapons - 武器数组
   * @param {Array} attachments - 附件配置数组 (阶段一简化)
   * @param {Object} params - 游戏参数
   * @param {Array} configs - 改枪配置数组 (每个武器对应的配置)
   * @param {number} defaultHitRate - 统一命中率
   * @returns {Array} 按TTK排序的结果数组
   */
  static calculateWeaponsTTK(weapons, attachments, params, configs = null, defaultHitRate = 0.80) {
    const results = weapons
      .map((weapon, idx) => {
        // 获取改枪配置
        let config = null;
        if (configs && configs[idx]) {
          config = configs[idx];
        } else if (weapon.configs && weapon.configs.length > 0) {
          config = weapon.configs[0];
        }

        // 获取子弹信息和数据
        const bulletInfo = this.getRealBulletInfo(
          null,
          null,
          weapon,
          params,
          config
        );
        const { bulletType, bulletLevel } = bulletInfo;

        const bData = this.getBulletData(bulletType, bulletLevel);
        if (!bData) return null;

        const strategy = BulletStrategyFactory.getStrategy(bulletType, bulletLevel);
        const simParams = { ...params };

        const stat = this.calculateAvgStats(
          weapon,
          simParams,
          SIMULATION_CONFIG.DEFAULT_SIM_COUNT,
          strategy,
          config,
          defaultHitRate,
          bulletType,
          bulletLevel
        );
        return { ...stat, weapon, name: weapon.name, config, bulletType, bulletLevel };
      })
      .filter(Boolean)
      .sort((a, b) => a.avgTime - b.avgTime);

    return results;
  }

  /**
   * 计算距离统计数据（用于距离图表）
   * @param {Array} armed - 应用附件后的武器数据
   * @param {Array} attachments - 附件配置
   * @param {Object} params - 游戏参数
   * @param {Array} distances - 距离数组
   * @param {Array} configs - 改枪配置数组
   * @param {number} defaultHitRate - 统一命中率
   * @returns {Array} 距离统计数据
   */
  static calculateDistanceStats(armed, attachments, params, distances, configs = null, defaultHitRate = 0.80) {
    return armed
      .map((w, idx) => {
        const attachment = attachments ? attachments[idx] : null;
        const config = (configs && configs[idx]) ? configs[idx] : null;

        // 获取子弹信息
        const bulletInfo = this.getRealBulletInfo(
          null,
          null,
          w,
          params,
          config
        );
        const { bulletType, bulletLevel } = bulletInfo;

        const bData = this.getBulletData(bulletType, bulletLevel);
        if (!bData) return null;

        const strategy = BulletStrategyFactory.getStrategy(bulletType, bulletLevel);
        const validRanges = w.ranges.filter(r => r !== Infinity && r <= 100);
        const keyDistances = [0, ...validRanges];

        const simulationCache = new Map();

        keyDistances.forEach(distance => {
          const simParams = { ...params, distance };
          const { avgTime } = this.calculateAvgStats(
            w,
            simParams,
            SIMULATION_CONFIG.DISTANCE_SIM_COUNT,
            strategy,
            config,
            defaultHitRate,
            bulletType,
            bulletLevel
          );
          const trigger = params.triggerDelayEnable ? w.triggerDelay / 1000 : 0;
          simulationCache.set(distance, avgTime + trigger);
        });

        const times = distances.map(d => {
          if (simulationCache.has(d)) {
            return simulationCache.get(d);
          } else {
            return this.calculateTTKByFormula(w, d, params, strategy, simulationCache);
          }
        });

        const cutoff = distances.findIndex(d => d > 35);
        const slice = cutoff === -1 ? times : times.slice(0, cutoff);
        const avg35 = slice.reduce((s, t) => s + t, 0) / slice.length;

        return { weapon: w, times, avg35 };
      })
      .filter(Boolean);
  }

  /**
   * 使用公式计算TTK（用于距离图表外推）
   */
  static calculateTTKByFormula(weapon, distance, params, strategy, simulationCache) {
    const keys = Array.from(simulationCache.keys()).filter(k => k <= distance);
    const startDistance = keys.length ? Math.max(...keys) : 0;
    const startTTK = simulationCache.get(startDistance);

    if (!startTTK) return 0;
    if (distance === startDistance) return startTTK;

    const flightTimeDiff = (distance - startDistance) / weapon.velocity;
    return startTTK + flightTimeDiff;
  }
}

// 向后兼容的导出
export const getDecay = DistanceDecayCalculator.calculate;
export const simulateOneTTK = SimulationEngine.simulateOneTTK.bind(SimulationEngine);