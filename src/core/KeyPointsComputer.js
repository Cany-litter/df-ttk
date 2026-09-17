// src/core/KeyPointsComputer.js
/**
 * KeyPoints 计算器（统一缓存入口）
 *
 * 职责：
 * 1. 根据 (武器+附件, 子弹, 甲头, 场景) 生成四层缓存 key
 * 2. 查 ttkCache，命中则直接返回
 * 3. 未命中则调 SimulationEngine 计算 keyPoints，并写入 ttkCache
 * 4. 返回 { keyPoints, avgBurstInterval, fromCache }
 *
 * 不负责：
 * - 缓存的管理（由 TtkCacheManager 负责）
 * - 数据查询（由 DataManager 负责）
 * - UI（由组件负责）
 *
 * ⭐ 被谁调用：
 * - App.vue 的 handleCalculate / handleDistanceChart / updateSingleWeaponTTK
 * - RecEngine 的 _computeAttackTTKs / _computeDefenseTTKs
 *
 * ⭐ 统一缓存后：
 * - 所有"算 keyPoints"的地方都走这里
 * - 只有这里读写 ttkCache
 * - 未来加"异步化 / Web Worker"只改这一处
 */

import { SimulationEngine } from './SimulationEngine.js';
import { BulletStrategyFactory, CHART_CONFIG, SIMULATION_CONFIG } from './CombatCore.js';

/**
 * 生成关键距离点
 *
 * 规则：
 * - 起点 0m
 * - 各射程分段点（r1 / r2 / r3 / r4）及其前 1m（r-1）
 * - 终点 100m
 *
 * @param {Array} ranges - 武器射程数组（含 Infinity）
 * @param {number} maxDistance - 最大距离（默认 100）
 * @returns {Array<number>} 排序去重后的关键距离
 */
export function getKeyDistances(ranges, maxDistance = 100) {
  const validRanges = (ranges || []).filter(r => r !== Infinity && r <= maxDistance);

  const keyDistances = [0];

  for (const range of validRanges) {
    const before = Math.max(0, range - 1);
    if (before > 0 && !keyDistances.includes(before)) {
      keyDistances.push(before);
    }
    if (!keyDistances.includes(range)) {
      keyDistances.push(range);
    }
  }

  if (!keyDistances.includes(maxDistance)) {
    keyDistances.push(maxDistance);
  }

  return [...new Set(keyDistances)].sort((a, b) => a - b);
}

/**
 * 计算某武器配置 + 子弹 + 甲头 + 场景下的 keyPoints
 *
 * ⭐ 缓存策略：
 * - 先查 ttkCache
 * - 命中 → 直接返回
 * - 未命中 → 计算 → 写入 ttkCache → 返回
 *
 * @param {Object} options
 * @param {Object} options.armedWeapon - 应用附件后的武器对象（含 _current）
 * @param {Object} options.attachment - 附件信息 { weaponId, configId, barrelIndex, muzzleIndex, precision, bulletType, hitRateMap }
 * @param {string} options.bulletId - 实际使用的子弹 ID
 * @param {Object} options.params - 战斗参数 { hitRateMap, hitProb, triggerDelayEnable, healthValue, armorLevel, armorValue, helmetLevel, helmetValue, ... }
 * @param {DataManager} options.dataManager - DataManager 实例
 * @param {TtkCacheManager} options.ttkCacheManager - TtkCacheManager 实例
 * @param {Function} [options.onProgress] - 进度回调 (current, total) => void
 * @param {Object} [options.signal] - 取消信号 { cancelled: boolean }
 * @returns {Promise<Object|null>} { keyPoints, avgBurstInterval, fromCache } 或 null
 */
export async function computeKeyPoints({
  armedWeapon,
  attachment,
  bulletId,
  params,
  dataManager,
  ttkCacheManager,
  onProgress,
  signal
}) {
  if (!armedWeapon) return null;

  const bulletData = dataManager.getBulletById(bulletId);
  if (!bulletData) return null;

  // ============================================================
  // 1. 生成四层 key
  // ============================================================

  const weaponKey = ttkCacheManager.makeWeaponKey(
    armedWeapon.id,
    attachment.configId,
    attachment.barrelIndex,
    attachment.muzzleIndex,
    attachment.precision
  );

  const defenderKey = ttkCacheManager.makeDefenderKey(
    params.armorLevel,
    params.armorValue,
    params.helmetLevel,
    params.helmetValue
  );

  const scenarioKey = ttkCacheManager.makeScenarioKey(
    params.hitRateMap || attachment.hitRateMap,
    params.hitProb,
    params.triggerDelayEnable,
    params.healthValue
  );

  // ============================================================
  // 2. 查缓存
  // ============================================================

  const cached = ttkCacheManager.getFull(weaponKey, bulletId, defenderKey, scenarioKey);

  if (cached && cached.keyPoints && cached.keyPoints.length > 0) {
    return {
      keyPoints: cached.keyPoints,
      avgBurstInterval: cached.avgBurstInterval || 0,
      fromCache: true
    };
  }

  // ============================================================
  // 3. 未命中 → 计算
  // ============================================================

  const strategy = BulletStrategyFactory.getStrategy(bulletId, bulletData);

  const keyDistances = getKeyDistances(
    armedWeapon.ranges || [40, 70, Infinity, Infinity],
    CHART_CONFIG.MAX_DISTANCE || 100
  );

  const keyPoints = [];
  let burstIntervalSum = 0;

  for (let i = 0; i < keyDistances.length; i++) {
    if (signal?.cancelled) break;

    const distance = keyDistances[i];

    const hitRate = dataManager.getHitRateFromMap(
      attachment.hitRateMap || params.hitRateMap || [],
      distance,
      0.85
    );

    const simParams = {
      ...params,
      distance,
      hitRate
    };

    const result = SimulationEngine.calculateSinglePoint(
      armedWeapon,
      simParams,
      SIMULATION_CONFIG.DISTANCE_SIM_COUNT,
      strategy,
      bulletData
    );

    const trigger = params.triggerDelayEnable !== false
      ? (armedWeapon.triggerDelay || 0) / 1000
      : 0;

    const totalTimeMs = (result.avgTime + trigger) * 1000;

    keyPoints.push({
      d: distance,
      t: totalTimeMs,
      shots: result.avgShots,
      bulletPrice: bulletData.price || 0
    });

    burstIntervalSum += (result.avgBurstInterval || 0);

    if (typeof onProgress === 'function') {
      onProgress(i + 1, keyDistances.length);
    }
  }

  if (keyPoints.length === 0) return null;

  const avgBurstInterval = keyDistances.length > 0
    ? burstIntervalSum / keyDistances.length
    : 0;

  // ============================================================
  // 4. 写缓存
  // ============================================================

  ttkCacheManager.set(
    weaponKey,
    bulletId,
    defenderKey,
    scenarioKey,
    keyPoints,
    avgBurstInterval
  );

  return {
    keyPoints,
    avgBurstInterval,
    fromCache: false
  };
}