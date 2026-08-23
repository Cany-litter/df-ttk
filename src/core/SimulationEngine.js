import { SIMULATION_CONFIG } from './config.js';
import { DistanceDecayCalculator } from './CombatUtils.js';
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

  /**
   * 模拟一次击杀过程
   * 
   * 核心逻辑：
   * 1. 循环射击直到目标死亡
   * 2. 每次射击有命中率判断
   * 3. 命中后根据部位计算伤害
   * 4. 连发模式下需要计算连发间隔
   * 
   * @param {Object} weapon - 武器对象（已包含原始值和当前值）
   * @param {Object} params - 游戏参数（距离、命中率、护甲等级等）
   * @param {Object} bulletStrategy - 子弹策略（控制伤害计算）
   * @param {Object} bulletData - 子弹数据（从 DataManager 获取）
   * @param {boolean} verbose - 是否打印详细日志（只用于第一次模拟）
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
    const hitRate = (typeof weapon.hitRate === 'number') ? weapon.hitRate : params.hitRate;
    
    // 计算射击间隔（连发模式使用内部射速，全自动模式使用平均射速）
    const isBurstMode = weapon.fireMode === 'burst' && weapon.burstCount && weapon.burstInternalROF;
    const shotInterval = this._calculateShotInterval(weapon, isBurstMode);
    const decay = DistanceDecayCalculator.calculate(distance, weapon);
    
    // 统计变量
    let shots = 0;  // 总射击次数
    let hits = 0;   // 命中次数
    let burstStats = { count: 0, totalTime: 0 };  // 连发统计
    
    // 🔥 只对 AKM 记录详细伤害日志，且只在 verbose 为 true 时打印
    const isAKM = weapon.name === 'AKM' || weapon.id === 2;
    if (verbose && isAKM) {
      console.log(`  🔫 AKM 单次模拟开始 - 距离: ${distance}m, 命中率: ${hitRate}`);
      console.log(`  初始状态: 生命 ${health}, 护甲 ${armorState.armorVal}, 头盔 ${armorState.helmetVal}`);
    }
    
    // 主循环：射击直到目标死亡
    while (health > 0) {
      shots++;
      
      // 连发模式：检查是否需要添加连发间隔
      if (isBurstMode) {
        this._updateBurstInterval(weapon, shots, burstStats);
      }
      
      // 命中率判断
      if (seededRandom() > hitRate) {
        // 未命中：消耗时间但继续下一发
        continue;
      }
      
      // 命中：计算伤害
      hits++;
      
      // 🔥 传递 verbose && isAKM 作为 debug 参数
      const debug = verbose && isAKM;
      const { damage, newArmorState, hitPart } = bulletStrategy.calculateHitDamage(
        weapon, params, bulletData, decay, hitProb, armorState,
        debug  // 传递 debug 标志
      );
      
      // 🔥 只在 verbose 为 true 时打印每次命中的详细信息（只对 AKM）
      if (verbose && isAKM && hits <= 15) {
        console.log(`    [命中 ${hits}] 部位: ${hitPart || '未知'}, 伤害: ${damage.toFixed(2)}, 剩余生命: ${(health - damage).toFixed(2)}, 护甲剩余: ${newArmorState.armorVal || 0}, 头盔剩余: ${newArmorState.helmetVal || 0}`);
      }
      
      health -= damage;
      armorState = newArmorState;
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
    
    // 🔥 只在 verbose 为 true 时打印本次模拟的总结（只对 AKM）
    if (verbose && isAKM) {
      console.log(`  ✅ 击杀! 总射击: ${shots}, 命中: ${hits}, 时间: ${(totalTime * 1000).toFixed(2)}ms`);
      console.log(`  ----------------------------------------`);
    }
    
    return { 
      time: totalTime, 
      shots, 
      hits, 
      burstIntervalTime: burstStats.totalTime 
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
      return 60 / weapon.rof;
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
    // 🔥 只对 AKM 打印调试信息
    const isAKM = weapon.name === 'AKM' || weapon.id === 2;
    
    if (isAKM) {
      // 🔥 从 _attachments 中读取枪管和枪口信息
      const barrelName = weapon._attachments?.barrel?.name || '无';
      const muzzleName = weapon._attachments?.muzzle?.name || '无';
      
      console.log('🔫 ===== AKM TTK 计算参数 =====');
      console.log(`  武器名称: ${weapon.name} (ID: ${weapon.id})`);
      console.log(`  肉伤: ${weapon.flesh}`);
      console.log(`  甲伤: ${weapon.armor}`);
      console.log(`  射速: ${weapon.rof}`);
      console.log(`  初速: ${weapon.velocity}`);
      console.log(`  射程: ${JSON.stringify(weapon.ranges)}`);
      console.log(`  衰减: ${JSON.stringify(weapon.decays)}`);
      console.log(`  部位倍率: ${JSON.stringify(weapon.mult)}`);
      console.log(`  枪管: ${barrelName}`);
      console.log(`  枪口: ${muzzleName}`);
      console.log(`  距离: ${params.distance}m`);
      console.log(`  命中率: ${params.hitRate}`);
      console.log(`  部位命中率: 头${params.hitProb.head}, 胸${params.hitProb.chest}, 腹${params.hitProb.stomach}, 四肢${params.hitProb.limbs}`);
      console.log(`  子弹型号: ${bulletData?.caliber || '未知'} Lv.${bulletData?.level || '未知'}`);
      console.log(`  目标生命值: ${params.healthValue}`);
      console.log(`  护甲等级: ${params.armorLevel}`);
      console.log(`  护甲值: ${params.armorValue}`);
      console.log(`  头盔等级: ${params.helmetLevel}`);
      console.log(`  头盔值: ${params.helmetValue}`);
      console.log(`  扳机延迟: ${params.triggerDelayEnable ? '启用' : '禁用'}`);
      console.log(`  模拟次数: ${times}`);
      console.log('================================');
      console.log('📊 开始模拟（仅显示第一次模拟的详细过程）...');
    }

    // 累计所有模拟结果
    let totalTime = 0;
    let totalShots = 0;
    let totalMisses = 0;
    let totalBurstInterval = 0;
    
    // 🔥 标记是否为第一次模拟（用于控制日志输出）
    let isFirstSimulation = true;
    
    // 执行多次模拟
    for (let i = 0; i < times; i++) {
      // 🔥 只在第一次模拟时打印详细日志
      const result = this.simulateOneTTK(
        weapon, 
        params, 
        bulletStrategy, 
        bulletData, 
        isAKM && isFirstSimulation  // 只对 AKM 且第一次模拟时打印
      );
      
      // 第一次模拟后，关闭详细日志
      if (isFirstSimulation) {
        isFirstSimulation = false;
      }
      
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
    
    if (isAKM) {
      console.log(`📊 AKM 平均 TTK: ${(avgTime * 1000).toFixed(2)}ms`);
      console.log(`  平均射击次数: ${avgShots.toFixed(2)}`);
      console.log(`  平均未命中次数: ${avgMisses.toFixed(2)}`);
      console.log(`  平均命中次数: ${(avgShots - avgMisses).toFixed(2)}`);
      console.log('================================');
    }
    
    return {
      weapon: { ...weapon },
      avgTime,
      avgShots,
      avgMisses,
      avgBurstInterval
    };
  }

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
        
        // 获取命中率（优先使用价格配置中的距离-命中率）
        let hitRate = params.hitRate;
        if (weapon.id && attachment.configId) {
          const priceHitRate = dm.getHitRateForDistance(
            weapon.id,
            attachment.configId || 'cfg-1',
            params.distance,
            params.hitRate
          );
          if (priceHitRate !== undefined) {
            hitRate = priceHitRate;
          }
        }
        
        const simParams = { ...params, hitRate };
        const strategy = BulletStrategyFactory.getStrategy(realBulletKey);
        
        const stat = this.calculateAvgStats(weapon, simParams, undefined, strategy, bulletData);
        return { ...stat, weapon, name: weapon.name };
      })
      .filter(Boolean)
      .sort((a, b) => a.avgTime - b.avgTime);
    
    return results;
  }

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