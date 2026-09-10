import { SIMULATION_CONFIG } from './config.js';
import { DistanceDecayCalculator, HitPartSelector } from './CombatUtils.js';
import { BulletStrategyFactory } from './BulletStrategy.js';
import { seededRandom } from '../utils/rng.js';

/**
 * 模拟引擎 - 负责计算击杀所需时间（TTK）
 * 
 * 数据依赖：通过 dataManager 获取子弹数据
 * 不直接依赖 bullets.js 或 data.json
 */
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
  // 1. 单次模拟（核心）⭐ 修改命中率取值逻辑 + 连发部位偏置
  // ============================================================

  /**
   * 模拟一次击杀过程
   * 
   * 核心逻辑：
   * 1. 循环射击直到目标死亡
   * 2. 每次射击有命中率判断
   * 3. 命中后根据部位计算伤害
   * 4. 连发模式下需要计算连发间隔
   * 
   * ⭐ 连发部位偏置：连发第一发完全随机，后续发以 70% 概率命中同一部位，
   *    30% 概率偏移到相邻部位（头部→胸部→腹部→四肢）
   * 
   * @param {Object} weapon - 武器对象（已包含原始值和当前值）
   * @param {Object} params - 游戏参数（距离、命中率、护甲等级等）
   * @param {Object} bulletStrategy - 子弹策略（控制伤害计算）
   * @param {Object} bulletData - 子弹数据（从 DataManager 获取）
   * @param {boolean} verbose - 是否打印详细日志（已弃用，不再使用）
   * @returns {Object} { time: 总时间(秒), shots: 总射击数, hits: 命中数, burstIntervalTime: 连发间隔时间 }
   */
  static simulateOneTTK(weapon, params, bulletStrategy, bulletData, verbose = false) {
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
    
    // 计算射击间隔（连发模式使用内部射速，全自动模式使用平均射速）
    const isBurstMode = weapon.fireMode === 'burst' && weapon.burstCount && weapon.burstInternalROF;
    const shotInterval = this._calculateShotInterval(weapon, isBurstMode);
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
        // 每 burstCount 发为一个连发周期
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
    
    // 计算总时间
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
      burstIntervalTime: burstStats.totalTime 
    };
  }

  // ============================================================
  // ⭐ 1.5 单次模拟（记录模式）—— 供伤害详情弹窗使用
  // ============================================================

  /**
   * 模拟一次击杀过程，并记录每一发的详细状态
   * 
   * 与 simulateOneTTK 的区别：
   * - 返回逐发明细数组 steps[]
   * - 每发携带 debug 中间值（纯伤害、穿透伤害、护甲变化等）
   * - 每发携带 burstGapBefore（该发之前插入的连发间隔时长，秒）
   * - 调用策略时传 collectDebug = true
   * - 结果用于弹窗展示，不参与批量统计
   * 
   * ⭐ 连发间隔标记：
   *   - 每个连发周期第一发（shot % burstCount === 1 且 shot > 1）之前，
   *     插入一个连发间隔，时长 = weapon.burstInterval（秒）
   *   - 该时长写入该发 step 的 burstGapBefore 字段
   *   - 非连发武器 / 连发周期内其他发 → burstGapBefore = 0
   * 
   * ⭐ 种子控制：本方法不做种子处理，由调用方在调用前通过 setSeed() 控制。
   * 
   * @param {Object} weapon - 武器对象
   * @param {Object} params - 游戏参数
   * @param {Object} bulletStrategy - 子弹策略
   * @param {Object} bulletData - 子弹数据
   * @returns {Object} {
   *   steps: Array,               // 逐发明细
   *   totalTime: number,          // 总时间（秒）
   *   totalTimeMs: number,        // 总时间（毫秒）
   *   shots: number,              // 总射击数
   *   hits: number,               // 命中数
   *   misses: number,             // 未命中数
   *   finalHealth: number,        // 结束血量（0）
   *   finalArmorVal: number,      // 结束护甲
   *   finalHelmetVal: number,     // 结束头盔
   *   isBurstMode: boolean,
   *   flightTime: number,             // 飞行时间（秒）
   *   shotInterval: number,           // 射击间隔（秒）
   *   burstInterval: number,          // 单次连发间隔时长（秒）—— 保留兼容
   *   burstIntervalCount: number,     // 连发次数
   *   burstIntervalTotal: number,     // 连发间隔总时间（秒）
   *   shootingIntervalTime: number,   // 射击延迟部分（秒）
   * }
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
    
    // 射击间隔
    const isBurstMode = weapon.fireMode === 'burst' && weapon.burstCount && weapon.burstInternalROF;
    const shotInterval = this._calculateShotInterval(weapon, isBurstMode);
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
    
    // 主循环
    while (health > 0) {
      shots++;
      burstShots++;
      
      // ============================================================
      // ⭐ 判断本发之前是否插入了连发间隔
      // ============================================================
      // 连发间隔的判定与 _updateBurstInterval 保持一致：
      // - 第 1 个连发（shots <= burstCount）不需要间隔
      // - 之后的每个连发周期开始（shots % burstCount === 1）插入一个间隔
      let burstGapBefore = 0;
      if (isBurstMode) {
        const isNewBurstStart = (shots > weapon.burstCount) && (shots % weapon.burstCount === 1);
        if (isNewBurstStart) {
          burstGapBefore = weapon.burstInterval;
        }
        // 累计到 burstStats（与 simulateOneTTK 一致）
        this._updateBurstInterval(weapon, shots, burstStats);
      }
      
      // ============================================================
      // 命中率判断
      // ============================================================
      if (seededRandom() > hitRate) {
        // 未命中：记录一行
        steps.push({
          shot: shots,
          hit: false,
          hitPart: null,
          finalDamage: 0,
          health,
          armorVal: armorState.armorVal,
          helmetVal: armorState.helmetVal,
          burstGapBefore,
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
        debug  // 中间计算值
      });
    }
    
    // 总时间
    const totalTime = this._calculateTotalTime(
      flightTime, 
      shotInterval, 
      shots, 
      isBurstMode, 
      burstStats
    );
    
    // ⭐ 射击延迟部分 = 总时间 - 飞行时间 - 连发间隔总时间
    const shootingIntervalTime = totalTime - flightTime - burstStats.totalTime;
    
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
      shotInterval,
      burstInterval: isBurstMode ? weapon.burstInterval : 0,
      burstIntervalCount: burstStats.count,        // ⭐ 连发次数
      burstIntervalTotal: burstStats.totalTime,    // ⭐ 连发间隔总时间（秒）
      shootingIntervalTime                         // ⭐ 射击延迟部分（秒）
    };
  }

  /**
   * 计算射击间隔（秒）
   * @private
   */
  static _calculateShotInterval(weapon, isBurstMode) {
    if (isBurstMode) {
      // 连发模式：使用内部射速（连发内部的射速）
      return 60 / weapon.burstInternalROF;
    } else {
      // 全自动模式：使用平均射速
      // ⭐ 优先使用 _current.rof（应用枪管加成后的值）
      const rof = weapon._current?.rof ?? weapon.rof ?? 600;
      return 60 / rof;
    }
  }

  /**
   * 更新连发间隔统计
   * 
   * 连发间隔只在开始新连发时计算。
   * 例如三连发：第1-3发是第一个连发，第4发开始第二个连发时需要加上第一个连发的间隔。
   * 
   * @private
   */
  static _updateBurstInterval(weapon, currentShot, burstStats) {
    // 第一个连发不需要间隔
    if (currentShot <= weapon.burstCount) {
      return;
    }
    
    // 检查是否开始新连发：shots % burstCount === 1 表示开始新连发
    // 例如：三连发，第4发时 4 % 3 = 1，说明开始第二个连发
    if (currentShot % weapon.burstCount === 1) {
      burstStats.count += 1;
      burstStats.totalTime += weapon.burstInterval;
    }
  }

  /**
   * 计算总击杀时间
   * 
   * 公式：总时间 = 飞行时间 + 射击间隔时间 + 连发间隔时间
   * 
   * @private
   */
  static _calculateTotalTime(flightTime, shotInterval, totalShots, isBurstMode, burstStats) {
    // 射击间隔时间 = 间隔 × (总射击数 - 1 - 连发间隔数)
    // 说明：最后一发不需要等待间隔，连发间隔已单独计算
    const burstIntervalCount = burstStats.count;
    const shootingIntervalTime = shotInterval * (totalShots - 1 - burstIntervalCount);
    
    return flightTime + shootingIntervalTime + burstStats.totalTime;
  }

  // ============================================================
  // 2. 批量模拟（多次求平均）
  // ============================================================

  /**
   * 计算平均TTK统计
   * 
   * 通过多次模拟计算平均值，以获得更稳定的TTK估算值。
   * 
   * @param {Object} weapon - 武器对象
   * @param {Object} params - 游戏参数
   * @param {number} times - 模拟次数（默认使用配置值）
   * @param {Object} bulletStrategy - 子弹策略
   * @param {Object} bulletData - 子弹数据
   * @returns {Object} {
   *   weapon: 武器对象,
   *   avgTime: 平均击杀时间(秒),
   *   avgShots: 平均射击次数,
   *   avgMisses: 平均未命中次数,
   *   avgBurstInterval: 平均连发间隔时间(秒)
   * }
   */
  static calculateAvgStats(weapon, params, times = SIMULATION_CONFIG.DEFAULT_SIM_COUNT, bulletStrategy, bulletData) {
    // 累计所有模拟结果
    let totalTime = 0;
    let totalShots = 0;
    let totalMisses = 0;
    let totalBurstInterval = 0;
    
    // 执行多次模拟
    for (let i = 0; i < times; i++) {
      const result = this.simulateOneTTK(
        weapon, 
        params, 
        bulletStrategy, 
        bulletData, 
        false
      );
      
      totalTime += result.time;
      totalShots += result.shots;
      totalMisses += (result.shots - result.hits);
      totalBurstInterval += (result.burstIntervalTime || 0);
    }
    
    // 计算平均值
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
   * ✅ 新增：计算单个距离点的 TTK 统计（用于折线图）
   * 
   * 与 calculateAvgStats 的区别：
   * - 返回格式更简洁，包含 avgTime 和 avgShots
   * - 用于折线图的逐点计算
   * 
   * ⭐ 修改：返回完整统计信息，而不仅仅是 avgTime
   * 
   * @param {Object} weapon - 武器对象
   * @param {Object} params - 游戏参数
   * @param {number} times - 模拟次数
   * @param {Object} bulletStrategy - 子弹策略
   * @param {Object} bulletData - 子弹数据
   * @returns {Object} { avgTime, avgShots, avgMisses, avgBurstInterval }
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
        bulletData, 
        false
      );
      
      totalTime += result.time;
      totalShots += result.shots;
      totalMisses += (result.shots - result.hits);
      totalBurstInterval += (result.burstIntervalTime || 0);
    }
    
    // ⭐ 返回完整统计数据，而不仅仅是平均时间
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
   * @param {Array} weapons - 武器数组（已应用附件）
   * @param {Array} attachments - 附件配置数组
   * @param {Object} params - 游戏参数
   * @param {DataManager} dataManager - DataManager 实例
   * @returns {Array} 按TTK排序的结果数组
   */
  static calculateWeaponsTTK(weapons, attachments, params, dataManager) {
    // 确保 DataManager 已设置
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
        
        // 获取子弹数据
        const bulletData = dm.getBulletById(realBulletKey);
        if (!bulletData) {
          console.warn(`武器 ${weapon.name} 的子弹 ${realBulletKey} 不存在`);
          return null;
        }
        
        // ⭐ 获取命中率（优先使用价格配置中的距离-命中率）
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
        
        // ⭐ 重要：将命中率放入 params 中，而不是 weapon 上
        // 这样 simulateOneTTK 会优先使用 params.hitRate
        const simParams = { ...params, hitRate };
        const strategy = BulletStrategyFactory.getStrategy(realBulletKey);
        
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
   * @param {string|null} selectedBulletType - 用户选择的子弹类型
   * @param {Object} weapon - 武器对象
   * @param {Object} params - 游戏参数
   * @param {DataManager} dataManager - DataManager 实例
   * @returns {string|null} 真实子弹类型（bullet id）
   */
  static getRealBulletKey(selectedBulletType, weapon, params, dataManager) {
    const dm = dataManager || this.getDataManager();
    
    // 如果用户指定了子弹类型，直接使用
    if (selectedBulletType) return selectedBulletType;
    
    // 否则根据武器口径和参数中的子弹等级查找
    const caliber = weapon.allowedBullet;
    if (!caliber) {
      console.warn(`武器 ${weapon.name} 没有指定口径 (allowedBullet)`);
      return null;
    }
    
    const bullet = dm.getBulletByCaliberAndLevel(caliber, params.bulletLevel);
    return bullet ? bullet.id : null;
  }
}

// 向后兼容的导出
export const getDecay = DistanceDecayCalculator.calculate;