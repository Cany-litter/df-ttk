// src/core/FastTTK.js
//
// TTK 计算统一入口
//
// 职责：
// - 对外提供统一的 TTK 计算 API（computeTTK / computeTTKMatrix / 缓存管理）
// - 提供"关键点 + 插值"的完整序列计算
// - 提供"武装武器"构建
// - 提供距离加权平均
//
// 两种模式：
// - 'fast'    → 用 DP（< 10ms，精度 < 0.01%）
// - 'precise' → 用蒙特卡洛（~700ms，精度 ~1%）
//
// 关键点算法（getKeyDistances）：
// - 端点：minDistance / maxDistance
// - 命中率节点：config.distance[i] ± 1
// - 射程衰减节点：weapon.ranges[i] ± 1（有限值）
//
// 距离权重曲线（固定，不随切片拉伸）：
//   w(d) = 1.5 - (d / 100) × 1.0
//   0m → 1.5，50m → 1.0，100m → 0.5
//
// 依赖：
// - TTKMatrix（DP 引擎 + 矩阵 + IndexedDB）
// - SimulationEngine（子弹反查 + 蒙特卡洛）
// - weaponCalc（附件计算）

import {
  // DP 引擎
  computeTTKWithDP,
  // 矩阵
  buildAllMatrix,
  getAttackTTK,
  getDefenseTTK,
  getMatrixStats,
  clearMatrixCache,
} from './TTKMatrix.js'

import { calculateCurrentValues } from '../utils/weaponCalc.js'

// ============================================================
// 常量
// ============================================================

const DEFAULT_MODE = 'fast'

/** 权重曲线的参考满量程（100m → 权重 0.5） */
const WEIGHT_FULL_RANGE = 100

/** 权重曲线 起点（0m → 1.5） */
const WEIGHT_BASE = 1.5

/** 权重曲线 满量程衰减量（100m 时减 1.0 → 0.5） */
const WEIGHT_DECAY = 1.0

// ============================================================
// ============ 统一计算入口 =================================
// ============================================================

/**
 * 计算单次 TTK（统一入口）
 *
 * @param {Object} options
 * @param {Object} options.weapon       - 应用附件后的武器
 * @param {Object} options.bulletData   - 子弹对象
 * @param {Object} options.defender     - { armorLevel, armorValue, helmetLevel, helmetValue }
 * @param {Object} options.scenario     - { hitRate, hitProb, triggerDelayEnable, healthValue }
 * @param {number} options.distance     - 距离
 * @param {string} [options.mode]       - 'fast' | 'precise'（默认 'fast'）
 * @param {Object} [options.strategy]   - 精算模式必传：子弹策略
 * @returns {Promise<Object>} { ttk, shots, hits, mode, debug? }
 */
export async function computeTTK(options) {
  const mode = options.mode || DEFAULT_MODE

  if (mode === 'precise') {
    return await computeTTKPrecise(options)
  }

  return computeTTKFast(options)
}

/**
 * 快速模式（DP）
 */
export function computeTTKFast(options) {
  const result = computeTTKWithDP({
    weapon: options.weapon,
    bulletData: options.bulletData,
    defender: options.defender,
    scenario: options.scenario,
    distance: options.distance,
  })

  return {
    ttk: result.ttk,
    shots: result.shots,
    hits: result.hits,
    mode: 'fast',
    debug: result.debug,
  }
}

/**
 * 精算模式（蒙特卡洛）
 *
 * ⚠️ 注意：主链路已不再调用此模式。此函数保留仅供未来扩展或对照验证。
 *          当前所有 UI 都走 'fast'（DP）。
 */
export async function computeTTKPrecise(options) {
  const {
    weapon,
    bulletData,
    defender,
    scenario,
    distance,
    strategy,
    simCount = 20000,
  } = options

  // 延迟 import，避免主链路打包时把 SimulationEngine 拉进来
  const { SimulationEngine } = await import('./SimulationEngine.js')

  const simParams = {
    distance,
    hitRate: scenario.hitRate ?? 0.85,
    hitProb: scenario.hitProb || { head: 0.1, chest: 0.3, stomach: 0.3, limbs: 0.3 },
    armorLevel: defender.armorLevel ?? 4,
    armorValue: defender.armorValue ?? 0,
    helmetLevel: defender.helmetLevel ?? 4,
    helmetValue: defender.helmetValue ?? 0,
    healthValue: scenario.healthValue ?? 100,
    triggerDelayEnable: scenario.triggerDelayEnable !== false,
  }

  const result = SimulationEngine.calculateSinglePoint(
    weapon,
    simParams,
    simCount,
    strategy,
    bulletData
  )

  const velocity = weapon._current?.velocity ?? weapon.velocity ?? 575
  const flightTime = (distance / velocity) * 1000
  const triggerMs = scenario.triggerDelayEnable !== false ? (weapon.triggerDelay || 0) : 0

  const ttk = (result.avgTime * 1000) + flightTime + triggerMs

  return {
    ttk,
    shots: result.avgShots,
    hits: result.avgShots * (scenario.hitRate ?? 0.85),
    mode: 'precise',
    debug: {
      flightTime,
      triggerMs,
      shootingTime: result.avgTime * 1000,
      avgMisses: result.avgMisses,
      avgBurstInterval: result.avgBurstInterval,
    },
  }
}

/**
 * 矩阵预计算（攻击侧 + 防御侧）
 */
export async function computeTTKMatrix(options) {
  return await buildAllMatrix(options)
}

// ============================================================
// ============ 缓存管理（转发） =============================
// ============================================================

export async function queryAttackTTK(options) {
  return await getAttackTTK(options)
}

export async function queryDefenseTTK(options) {
  return await getDefenseTTK(options)
}

export async function clearMatrix() {
  return await clearMatrixCache()
}

// ============================================================
// ============ 模式说明 =====================================
// ============================================================

export function getModeDescription(mode) {
  switch (mode) {
    case 'fast':
      return '快速（DP，< 10ms，精度 < 0.01%）'
    case 'precise':
      return '精算（蒙特卡洛 20000 次，~700ms，精度 ~1%）'
    default:
      return '未知模式'
  }
}

export function getDefaultMode() {
  return DEFAULT_MODE
}

// ============================================================
// ============ 单点 TTK 计算 ================================
// ============================================================

/**
 * 计算单条 TTK（DP 快速模式）
 *
 * @param {Object} armedWeapon - 武装武器（含 _current）
 * @param {Object} attachment - { bulletType, hitRateMap, configId }
 * @param {Object} params - {
 *   distance, bulletLevel,
 *   armorLevel, armorValue, helmetLevel, helmetValue,
 *   healthValue, hitProb, triggerDelayEnable, hitRateMap
 * }
 * @param {DataManager} dm
 * @returns {Promise<Object|null>} { ttk, shots, hits } 或 null
 */
export async function computeSingleTTK(armedWeapon, attachment, params, dm) {
  const realBulletKey = dm.getRealBulletKey(
    attachment.bulletType,
    armedWeapon,
    params
  )
  if (!realBulletKey) {
    console.warn(`⚠️ computeSingleTTK: 未匹配子弹 ${armedWeapon._displayName || armedWeapon.name}`)
    return null
  }

  const bulletData = dm.getBulletById(realBulletKey)
  if (!bulletData) {
    console.warn(`⚠️ computeSingleTTK: 子弹不存在 ${realBulletKey} (${armedWeapon._displayName || armedWeapon.name})`)
    return null
  }

  // 命中率（配置的 hitRateMap 优先）
  let hitRate = params.hitRate ?? 0.85
  const map = attachment.hitRateMap || params.hitRateMap || []
  if (map.length > 0) {
    hitRate = dm.getHitRateFromMap(map, params.distance, hitRate)
  }

  try {
    const result = await computeTTK({
      weapon: armedWeapon,
      bulletData,
      defender: {
        armorLevel: params.armorLevel,
        armorValue: params.armorValue,
        helmetLevel: params.helmetLevel,
        helmetValue: params.helmetValue,
      },
      scenario: {
        hitRate,
        hitProb: params.hitProb,
        triggerDelayEnable: params.triggerDelayEnable,
        healthValue: params.healthValue,
      },
      distance: params.distance,
      mode: 'fast',
    })

    return {
      ttk: result.ttk,
      shots: result.shots,
      hits: result.hits,
    }
  } catch (e) {
    console.error(`❌ computeSingleTTK 异常: ${armedWeapon._displayName || armedWeapon.name}`)
    console.error('   武器:', armedWeapon.name, '子弹:', realBulletKey)
    console.error('   距离:', params.distance)
    console.error('   错误消息:', e && e.message)
    return null
  }
}

// ============================================================
// ============ 关键点算法 ===================================
// ============================================================

/**
 * 生成关键距离点
 *
 * 包含：
 * - 端点：minDistance, maxDistance
 * - 命中率节点：config.distance 每个点 ±1（落在区间内才加）
 * - 射程衰减节点：weapon.ranges 每个有限值 ±1（落在区间内才加）
 *
 * @param {Object} weapon - 武器（含 _current）
 * @param {Object} config - 价格配置（含 distance）
 * @param {number} [maxDistance=100] - 最远距离
 * @param {number} [minDistance=0] - 最近距离
 * @returns {Array<number>} 升序关键点
 */
export function getKeyDistances(weapon, config, maxDistance = 100, minDistance = 0) {
  // 防御：min 不能大于 max
  if (minDistance > maxDistance) {
    [minDistance, maxDistance] = [maxDistance, minDistance]
  }

  const points = new Set([minDistance, maxDistance])

  // 命中率节点
  const configDistances = config?.distance
  if (Array.isArray(configDistances)) {
    for (const d of configDistances) {
      if (
        typeof d === 'number' && isFinite(d) &&
        d > minDistance && d < maxDistance
      ) {
        points.add(Math.max(minDistance, d - 1))
        points.add(d)
        points.add(Math.min(maxDistance, d + 1))
      }
    }
  }

  // 射程衰减节点
  const ranges = weapon?.ranges || weapon?._current?.ranges
  if (Array.isArray(ranges)) {
    for (const r of ranges) {
      if (
        typeof r === 'number' && isFinite(r) &&
        r > minDistance && r < maxDistance
      ) {
        points.add(Math.max(minDistance, r - 1))
        points.add(r)
        points.add(Math.min(maxDistance, r + 1))
      }
    }
  }

  return Array.from(points).sort((a, b) => a - b)
}

// ============================================================
// ============ 插值 =========================================
// ============================================================

/**
 * 线性插值（关键点 → 全量距离点）
 *
 * @param {Array<{d: number, ttk: number, shots: number}>} keyPoints - 关键点（d 升序）
 * @param {Array<number>} fullDistances - 全量距离（如 0~100）
 * @returns {Array<{ttk: number, shots: number}>}
 */
export function interpolateKeyPoints(keyPoints, fullDistances) {
  if (!keyPoints || keyPoints.length === 0) {
    return fullDistances.map(() => ({ ttk: 0, shots: 0 }))
  }

  // 单点：直接用该点的值
  if (keyPoints.length === 1) {
    const p = keyPoints[0]
    return fullDistances.map(() => ({ ttk: p.ttk, shots: p.shots }))
  }

  const result = []
  let kpIdx = 0

  for (const d of fullDistances) {
    // 找到 d 所在的关键点区间
    while (kpIdx < keyPoints.length - 1 && keyPoints[kpIdx + 1].d < d) {
      kpIdx++
    }

    const p1 = keyPoints[kpIdx]
    const p2 = keyPoints[kpIdx + 1] || p1

    if (d === p1.d) {
      result.push({ ttk: p1.ttk, shots: p1.shots })
    } else if (p1.d === p2.d) {
      result.push({ ttk: p1.ttk, shots: p1.shots })
    } else {
      // 线性插值
      const t = (d - p1.d) / (p2.d - p1.d)
      result.push({
        ttk: p1.ttk + t * (p2.ttk - p1.ttk),
        shots: p1.shots + t * (p2.shots - p1.shots),
      })
    }
  }

  return result
}

// ============================================================
// ============ 完整序列计算（关键点 + 插值） ================
// ============================================================

/**
 * 给一个武器 + 配置，算关键点 + 插值
 *
 * @param {Object} weapon - 已应用附件的武器
 * @param {Object} attachment - { bulletType, hitRateMap, configId, ... }
 * @param {Object} config - 价格配置（含 distance / hitRate）
 * @param {Object} params - 全局参数
 * @param {DataManager} dm
 * @param {Array<number>} fullDistances - 全量距离
 * @returns {Promise<{ times: Array<number>, shots: Array<number>, anySuccess: boolean }>}
 */
export async function computeDistanceSeries(weapon, attachment, config, params, dm, fullDistances) {
  const keyDistances = getKeyDistances(weapon, config)

  // 算关键点
  const keyPoints = []
  for (const d of keyDistances) {
    const single = await computeSingleTTK(weapon, attachment, {
      ...params,
      distance: d,
    }, dm)
    if (single) {
      keyPoints.push({ d, ttk: single.ttk, shots: single.shots })
    }
  }

  if (keyPoints.length === 0) {
    return {
      times: fullDistances.map(() => 0),
      shots: fullDistances.map(() => 0),
      anySuccess: false,
    }
  }

  // 插值成全量
  const interpolated = interpolateKeyPoints(keyPoints, fullDistances)

  return {
    times: interpolated.map(p => p.ttk),
    shots: interpolated.map(p => p.shots),
    anySuccess: true,
  }
}

// ============================================================
// ============ 武装武器构建 =================================
// ============================================================

/**
 * 构建"武装后"的武器（应用枪管 / 枪口 / 精校）
 *
 * @param {Array} configs - getEnabledConfigs() 的返回值（含 _weaponId / configId / barrelId 等）
 * @param {DataManager} dm
 * @returns {{ armed: Array, attachments: Array }}
 */
export function buildArmedWeapons(configs, dm) {
  const armed = []
  const attachments = []

  for (const config of configs) {
    const weapon = dm.getWeaponById(config._weaponId)
    if (!weapon) continue

    const displayName = `${weapon.name} ${config.configId || ''}`.trim()

    let barrel = null
    let barrelIndex = -1
    if (
      config.barrelId !== undefined &&
      config.barrelId >= 0 &&
      weapon.barrels &&
      weapon.barrels[config.barrelId]
    ) {
      barrel = weapon.barrels[config.barrelId]
      barrelIndex = config.barrelId
    }

    const precision =
      typeof config.precision === 'number' && !isNaN(config.precision)
        ? config.precision
        : 0.09

    const current = calculateCurrentValues(
      weapon,
      barrel,
      config.muzzleId || 0,
      precision
    )

    const armedWeapon = {
      ...weapon,
      ...current,
      _current: current,
      _displayName: displayName,
      _configId: config.configId || '#1',
      _price: config.price || 0,
      triggerDelay: weapon.triggerDelay || 0,
    }

    armed.push(armedWeapon)

    // 拼 hitRateMap
    let hitRateMap = []
    if (
      config.distance &&
      config.hitRate &&
      Array.isArray(config.distance) &&
      Array.isArray(config.hitRate) &&
      config.distance.length > 0 &&
      config.hitRate.length > 0
    ) {
      const len = Math.min(config.distance.length, config.hitRate.length)
      for (let i = 0; i < len; i++) {
        hitRateMap.push({
          distance: config.distance[i],
          rate: config.hitRate[i],
        })
      }
    }

    attachments.push({
      weaponId: weapon.id,
      configId: config.configId || '#1',
      barrelIndex,
      muzzleIndex: config.muzzleId || 0,
      precision,
      bulletType: config.bulletId || null,
      hitRateMap,
      displayName,
    })
  }

  return { armed, attachments }
}

// ============================================================
// ============ 距离加权平均 =================================
// ============================================================

/**
 * 距离权重（曲线固定，不随切片拉伸）
 *
 *   w(d) = 1.5 - (d / 100) × 1.0
 *
 *   0m   → 1.5
 *   50m  → 1.0
 *   100m → 0.5
 *
 * @param {number} distance
 * @returns {number} 权重
 */
export function getDistanceWeight(distance) {
  const d = Number(distance) || 0
  const w = WEIGHT_BASE - (d / WEIGHT_FULL_RANGE) * WEIGHT_DECAY
  return Math.max(0, w)
}

/**
 * 距离加权平均 TTK
 *
 * 权重曲线固定（0m→1.5，100m→0.5），不随切片范围拉伸。
 * 切片只影响「取哪些点、累加哪些权重」。
 *
 * @param {Array<number>} times - 每个距离点的 TTK（长度 = distances.length）
 * @param {Array<number>} distances - 距离数组
 * @returns {number} 加权平均 TTK（无有效数据时返回 Infinity）
 */
export function computeDistanceWeightedAvg(times, distances) {
  if (!distances || distances.length === 0) return Infinity

  let weightedSum = 0
  let weightSum = 0

  for (let i = 0; i < distances.length; i++) {
    const ttk = times[i]
    if (ttk > 0 && isFinite(ttk)) {
      const d = distances[i]
      const w = getDistanceWeight(d)
      weightedSum += ttk * w
      weightSum += w
    }
  }

  return weightSum > 0 ? weightedSum / weightSum : Infinity
}

/**
 * 距离加权平均 shots（用于哈弗币消耗）
 *
 * 和 computeDistanceWeightedAvg 同款权重，只是作用于 shots 而非 ttk。
 *
 * @param {Array<number>} shotsArr
 * @param {Array<number>} distances
 * @returns {number} 加权平均 shots（无有效数据时返回 0）
 */
export function computeDistanceWeightedAvgShots(shotsArr, distances) {
  if (!distances || distances.length === 0) return 0

  let weightedSum = 0
  let weightSum = 0

  for (let i = 0; i < distances.length; i++) {
    const s = shotsArr[i]
    if (typeof s === 'number' && isFinite(s) && s > 0) {
      const d = distances[i]
      const w = getDistanceWeight(d)
      weightedSum += s * w
      weightSum += w
    }
  }

  return weightSum > 0 ? weightedSum / weightSum : 0
}