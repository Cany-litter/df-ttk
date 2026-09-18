// src/core/FastTTK.js
//
// TTK 计算统一入口
//
// 职责：
// - 对外提供统一的 TTK 计算 API
// - 内部屏蔽 DP（快速）和蒙特卡洛（精算）的差异
// - 所有调用方（RecEngine / App.vue / DamageDetailModal）都走这里
//
// 两种模式：
// - 'fast'    → 用 DP（< 10ms，精度 < 0.01%）
// - 'precise' → 用蒙特卡洛（~700ms，精度 ~1%，用于验证或用户要求精确时）
//
// 用法：
//   import { computeTTK, computeTTKMatrix } from './FastTTK.js'
//
//   const result = await computeTTK({
//     weapon, bulletData, defender, scenario, distance,
//     mode: 'fast',  // 或 'precise'
//   })
//
//   const matrixResult = await computeTTKMatrix({
//     attacks, defenses, enemies, scenario, dataManager, onProgress,
//   })

import { computeTTKWithDP } from './TTKDP.js'
import {
  buildAllMatrix,
  getAttackTTK,
  getDefenseTTK,
  getMatrixStats,
  clearMatrixCache,
} from './TTKMatrix.js'

// ============================================================
// 常量
// ============================================================

const DEFAULT_MODE = 'fast'

// ============================================================
// 统一入口
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
 *
 * @param {Object} options
 * @returns {Object} { ttk, shots, hits, mode: 'fast', debug? }
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
 * 动态 import SimulationEngine，避免循环依赖
 *
 * @param {Object} options
 * @returns {Promise<Object>} { ttk, shots, hits, mode: 'precise', debug? }
 */
export async function computeTTKPrecise(options) {
  // 动态 import，避免循环依赖
  const { SimulationEngine } = await import('./SimulationEngine.js')

  const {
    weapon,
    bulletData,
    defender,
    scenario,
    distance,
    strategy,
    simCount = 20000,
  } = options

  // 组装 simParams
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

  // 调蒙特卡洛
  const result = SimulationEngine.calculateSinglePoint(
    weapon,
    simParams,
    simCount,
    strategy,
    bulletData
  )

  // 计算时间（秒 → 毫秒），加上飞行延迟 + 扳机延迟
  const velocity = weapon._current?.velocity ?? weapon.velocity ?? 575
  const flightTime = (distance / velocity) * 1000
  const triggerMs = scenario.triggerDelayEnable !== false ? (weapon.triggerDelay || 0) : 0

  const ttk = (result.avgTime * 1000) + flightTime + triggerMs

  return {
    ttk,
    shots: result.avgShots,
    hits: result.avgShots * (scenario.hitRate ?? 0.85),  // 近似
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
 *
 * 转发到 TTKMatrix.buildAllMatrix
 *
 * @param {Object} options
 * @returns {Promise<Object>} 统计信息
 */
export async function computeTTKMatrix(options) {
  return await buildAllMatrix(options)
}

// ============================================================
// 缓存管理（转发）
// ============================================================

/**
 * 查询攻击侧单条 TTK
 */
export async function queryAttackTTK(options) {
  return await getAttackTTK(options)
}

/**
 * 查询防御侧单条 TTK
 */
export async function queryDefenseTTK(options) {
  return await getDefenseTTK(options)
}

/**
 * 矩阵缓存统计
 */
export async function queryMatrixStats() {
  return await getMatrixStats()
}

/**
 * 清空矩阵缓存
 */
export async function clearMatrix() {
  return await clearMatrixCache()
}

// ============================================================
// 工具：模式说明
// ============================================================

/**
 * 获取模式的中文描述
 */
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

/**
 * 获取默认模式
 */
export function getDefaultMode() {
  return DEFAULT_MODE
}