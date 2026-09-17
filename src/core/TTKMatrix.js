// src/core/TTKMatrix.js
//
// TTK 矩阵预计算 + IndexedDB 持久化
//
// 职责：
// - 枚举攻击侧（武器配置 × 子弹等级）× 敌人 → AttackMatrix
// - 枚举防御侧（护甲 × 头盔）× 敌人 → DefenseMatrix
// - 调 computeTTKWithDP 算每条 TTK
// - 写 IndexedDB 持久化（增量计算）
//
// 关键：
// - 每条 TTK 用 DP 算（< 10ms），不用蒙特卡洛
// - 改攻击侧/防御侧/敌人时，只算差异部分（利用 IndexedDB 缓存）
//
// ⭐ 版本号（MATRIX_VERSION）：
//   参与 scenarioHash 计算。改伤害公式 / DP 时间公式 / 缓存 key 结构时递增，
//   让 IndexedDB 里的旧缓存自动失效。
//
//   v1 → v2：修复 DP 连发间隔重复计算 bug（新连发首多算了 50ms 连发内间隔）
//   v2 → v3：修复 DP 分段射速边界 bug（rofStages 的"第 N 个间隔"被错算为 +0）
//
// 用法：
//   import { buildAttackMatrix, buildDefenseMatrix, buildAllMatrix, getMatrixStats, clearMatrixCache } from './TTKMatrix.js'
//
//   const result = await buildAllMatrix({ attacks, defenses, enemies, scenario, dataManager, onProgress })
//   // result = { attackCount, defenseCount, fromCache, computed, timeMs }

import { computeTTKWithDP } from './TTKDP.js'
import { calculateCurrentValues } from '../utils/weaponCalc.js'
import {
  getMatrixEntry,
  setMatrixEntries,
  getMatrixStats as idbGetMatrixStats,
  clearMatrix as idbClearMatrix,
} from './TTKIndexedDB.js'

// ============================================================
// 常量
// ============================================================

// 每个场景哈希的当前版本（改公式时递增，让旧缓存失效）
// v1 → v2：修复 DP 连发间隔重复计算 bug
// v2 → v3：修复 DP 分段射速边界 bug
const MATRIX_VERSION = 3

// 批量写入大小（每 N 条写一次 IndexedDB）
const BATCH_SIZE = 200

// ============================================================
// 对外 API
// ============================================================

/**
 * 构建完整矩阵（攻击侧 + 防御侧）
 *
 * @param {Object} options
 * @param {Array} options.attacks - 攻击侧列表（来自 RecEngine._buildAttackSide）
 * @param {Array} options.defenses - 防御侧列表（来自 RecEngine._buildDefenseSide）
 * @param {Array} options.enemies - 敌人列表
 * @param {Object} options.scenario - 场景参数 { hitRateMap, hitProb, triggerDelayEnable, healthValue }
 * @param {DataManager} options.dataManager
 * @param {Function} [options.onProgress] - (phase, current, total) => void
 * @param {Object} [options.signal] - { cancelled: boolean }
 * @returns {Promise<Object>} 统计信息
 */
export async function buildAllMatrix({
  attacks,
  defenses,
  enemies,
  scenario,
  dataManager,
  onProgress,
  signal,
}) {
  const t0 = performance.now()

  const scenarioHash = makeScenarioHash(scenario)

  let totalComputed = 0
  let totalFromCache = 0

  // ---------- 1. 攻击侧矩阵 ----------
  const attackResult = await buildAttackMatrix({
    attacks,
    enemies,
    scenario,
    scenarioHash,
    dataManager,
    onProgress: onProgress
      ? (cur, total) => onProgress('attack', cur, total)
      : null,
    signal,
  })
  totalComputed += attackResult.computed
  totalFromCache += attackResult.fromCache

  if (signal?.cancelled) {
    return {
      attackCount: attackResult.total,
      defenseCount: 0,
      fromCache: totalFromCache,
      computed: totalComputed,
      timeMs: Math.round(performance.now() - t0),
      cancelled: true,
    }
  }

  // ---------- 2. 防御侧矩阵 ----------
  const defenseResult = await buildDefenseMatrix({
    defenses,
    enemies,
    scenario,
    scenarioHash,
    dataManager,
    onProgress: onProgress
      ? (cur, total) => onProgress('defense', cur, total)
      : null,
    signal,
  })
  totalComputed += defenseResult.computed
  totalFromCache += defenseResult.fromCache

  return {
    attackCount: attackResult.total,
    defenseCount: defenseResult.total,
    fromCache: totalFromCache,
    computed: totalComputed,
    timeMs: Math.round(performance.now() - t0),
    cancelled: false,
  }
}

/**
 * 构建攻击侧矩阵
 *
 * 每个 (attack, enemy) → attackTTK
 *
 * @param {Object} options
 * @param {Array} options.attacks
 * @param {Array} options.enemies
 * @param {Object} options.scenario
 * @param {string} options.scenarioHash
 * @param {DataManager} options.dataManager
 * @param {Function} [options.onProgress] - (current, total) => void
 * @param {Object} [options.signal]
 * @returns {Promise<Object>} { total, computed, fromCache, errors }
 */
export async function buildAttackMatrix({
  attacks,
  enemies,
  scenario,
  scenarioHash,
  dataManager,
  onProgress,
  signal,
}) {
  const total = attacks.length * enemies.length
  let processed = 0
  let computed = 0
  let fromCache = 0
  let errors = 0

  const pendingBatch = []

  for (let ai = 0; ai < attacks.length; ai++) {
    const attack = attacks[ai]

    for (let ei = 0; ei < enemies.length; ei++) {
      if (signal?.cancelled) break

      const enemy = enemies[ei]

      const id = makeAttackId({
        weaponId: attack.weaponId,
        configId: attack.configId,
        bulletId: attack.bulletId,
        enemy,
        scenarioHash,
      })

      // ---------- 查缓存 ----------
      const cached = await getMatrixEntry(id)
      if (cached) {
        fromCache++
        processed++
        if (onProgress && processed % 20 === 0) onProgress(processed, total)
        continue
      }

      // ---------- 未命中：算 ----------
      try {
        const result = computeTTKWithDP({
          weapon: attack._armed,
          bulletData: attack.bullet,
          defender: {
            armorLevel: enemy.armorLevel,
            armorValue: enemy.armorValue,
            helmetLevel: enemy.helmetLevel,
            helmetValue: enemy.helmetValue,
          },
          scenario: {
            hitRate: enemy.hitRate ?? scenario.hitRate ?? 0.85,
            hitProb: scenario.hitProb,
            triggerDelayEnable: scenario.triggerDelayEnable,
            healthValue: scenario.healthValue,
          },
          distance: enemy.distance,
        })

        pendingBatch.push({
          id,
          ttk: result.ttk,
          shots: result.shots,
          hits: result.hits,
          meta: {
            type: 'attack',
            weaponId: attack.weaponId,
            configId: attack.configId,
            bulletId: attack.bulletId,
            enemyName: enemy.name,
            weaponName: attack.meta.weaponName,
            configIdDisplay: attack.meta.configId,
            bulletName: attack.meta.bulletName,
            bulletLevel: attack.meta.bulletLevel,
            enemyArmorLevel: enemy.armorLevel,
            enemyHelmetLevel: enemy.helmetLevel,
            distance: enemy.distance,
            scenarioHash,
            matrixVersion: MATRIX_VERSION,
          },
        })

        computed++

        // 批量写
        if (pendingBatch.length >= BATCH_SIZE) {
          await setMatrixEntries(pendingBatch)
          pendingBatch.length = 0
        }
      } catch (e) {
        errors++
        console.warn(`⚠️ TTKMatrix: 攻击侧计算失败 (${attack.weaponId}/${attack.configId}/${attack.bulletId} vs ${enemy.name}):`, e)
      }

      processed++
      if (onProgress && processed % 20 === 0) {
        onProgress(processed, total)
      }
    }

    if (signal?.cancelled) break
  }

  // 写入剩余
  if (pendingBatch.length > 0) {
    await setMatrixEntries(pendingBatch)
    pendingBatch.length = 0
  }

  if (onProgress) onProgress(processed, total)

  return { total, computed, fromCache, errors }
}

/**
 * 构建防御侧矩阵
 *
 * 每个 (defense, enemy) → defenseTTK
 * （即：敌人打我方甲头组合的 TTK）
 *
 * @param {Object} options
 * @param {Array} options.defenses
 * @param {Array} options.enemies
 * @param {Object} options.scenario
 * @param {string} options.scenarioHash
 * @param {DataManager} options.dataManager
 * @param {Function} [options.onProgress]
 * @param {Object} [options.signal]
 * @returns {Promise<Object>} { total, computed, fromCache, errors }
 */
export async function buildDefenseMatrix({
  defenses,
  enemies,
  scenario,
  scenarioHash,
  dataManager,
  onProgress,
  signal,
}) {
  const total = defenses.length * enemies.length
  let processed = 0
  let computed = 0
  let fromCache = 0
  let errors = 0

  const pendingBatch = []

  for (let di = 0; di < defenses.length; di++) {
    const defense = defenses[di]

    for (let ei = 0; ei < enemies.length; ei++) {
      if (signal?.cancelled) break

      const enemy = enemies[ei]

      // 敌人打我方甲头组合
      // 敌人用 enemy 的武器 + 子弹；我方用 defense 的甲头
      const enemyInfo = enemy._enemyArmed
      if (!enemyInfo) {
        errors++
        continue
      }

      const id = makeDefenseId({
        enemyWeaponId: enemy.weaponId,
        enemyConfigId: enemy.configId,
        enemyBulletId: enemy.bulletId,
        ourArmorLevel: defense.armor.level,
        ourArmorValue: defense.armor.value,
        ourHelmetLevel: defense.helmet.level,
        ourHelmetValue: defense.helmet.value,
        scenarioHash,
      })

      // ---------- 查缓存 ----------
      const cached = await getMatrixEntry(id)
      if (cached) {
        fromCache++
        processed++
        if (onProgress && processed % 20 === 0) onProgress(processed, total)
        continue
      }

      // ---------- 未命中：算 ----------
      try {
        const result = computeTTKWithDP({
          weapon: enemyInfo.armed,
          bulletData: enemyInfo.bulletData,
          defender: {
            armorLevel: defense.armor.level,
            armorValue: defense.armor.value,
            helmetLevel: defense.helmet.level,
            helmetValue: defense.helmet.value,
          },
          scenario: {
            hitRate: enemy.hitRate ?? scenario.hitRate ?? 0.85,
            hitProb: scenario.hitProb,
            triggerDelayEnable: scenario.triggerDelayEnable,
            healthValue: scenario.healthValue,
          },
          distance: enemy.distance,
        })

        pendingBatch.push({
          id,
          ttk: result.ttk,
          shots: result.shots,
          hits: result.hits,
          meta: {
            type: 'defense',
            enemyWeaponId: enemy.weaponId,
            enemyConfigId: enemy.configId,
            enemyBulletId: enemy.bulletId,
            enemyName: enemy.name,
            enemyWeaponName: enemyInfo.armed.name,
            ourArmorName: defense.meta.armorName,
            ourArmorLevel: defense.meta.armorLevel,
            ourHelmetName: defense.meta.helmetName,
            ourHelmetLevel: defense.meta.helmetLevel,
            distance: enemy.distance,
            scenarioHash,
            matrixVersion: MATRIX_VERSION,
          },
        })

        computed++

        if (pendingBatch.length >= BATCH_SIZE) {
          await setMatrixEntries(pendingBatch)
          pendingBatch.length = 0
        }
      } catch (e) {
        errors++
        console.warn(`⚠️ TTKMatrix: 防御侧计算失败 (${enemy.name} vs ${defense.meta.armorName}):`, e)
      }

      processed++
      if (onProgress && processed % 20 === 0) {
        onProgress(processed, total)
      }
    }

    if (signal?.cancelled) break
  }

  if (pendingBatch.length > 0) {
    await setMatrixEntries(pendingBatch)
    pendingBatch.length = 0
  }

  if (onProgress) onProgress(processed, total)

  return { total, computed, fromCache, errors }
}

// ============================================================
// 查询 API（用于组合阶段）
// ============================================================

/**
 * 查询攻击侧 TTK
 *
 * @param {Object} options
 * @param {number} options.weaponId
 * @param {string} options.configId
 * @param {string} options.bulletId
 * @param {Object} options.enemy
 * @param {string} options.scenarioHash
 * @returns {Promise<Object|null>} { ttk, shots, hits, meta } 或 null
 */
export async function getAttackTTK({
  weaponId,
  configId,
  bulletId,
  enemy,
  scenarioHash,
}) {
  const id = makeAttackId({ weaponId, configId, bulletId, enemy, scenarioHash })
  return await getMatrixEntry(id)
}

/**
 * 查询防御侧 TTK
 *
 * @param {Object} options
 * @param {number} options.enemyWeaponId
 * @param {string} options.enemyConfigId
 * @param {string} options.enemyBulletId
 * @param {number} options.ourArmorLevel
 * @param {number} options.ourArmorValue
 * @param {number} options.ourHelmetLevel
 * @param {number} options.ourHelmetValue
 * @param {string} options.scenarioHash
 * @returns {Promise<Object|null>}
 */
export async function getDefenseTTK({
  enemyWeaponId,
  enemyConfigId,
  enemyBulletId,
  ourArmorLevel,
  ourArmorValue,
  ourHelmetLevel,
  ourHelmetValue,
  scenarioHash,
}) {
  const id = makeDefenseId({
    enemyWeaponId,
    enemyConfigId,
    enemyBulletId,
    ourArmorLevel,
    ourArmorValue,
    ourHelmetLevel,
    ourHelmetValue,
    scenarioHash,
  })
  return await getMatrixEntry(id)
}

// ============================================================
// 缓存管理
// ============================================================

/**
 * 获取矩阵缓存统计
 *
 * @returns {Promise<Object>} { count, sizeKB, sizeMB }
 */
export async function getMatrixStats() {
  return await idbGetMatrixStats()
}

/**
 * 清空矩阵缓存
 *
 * @returns {Promise<boolean>}
 */
export async function clearMatrixCache() {
  return await idbClearMatrix()
}

// ============================================================
// 内部：ID 生成
// ============================================================

function makeAttackId({ weaponId, configId, bulletId, enemy, scenarioHash }) {
  const cid = (configId || '#1').replace('#', '')
  const armorKey = `a${enemy.armorLevel ?? 4}v${enemy.armorValue ?? 0}`
  const helmetKey = `h${enemy.helmetLevel ?? 4}v${enemy.helmetValue ?? 0}`
  const distKey = `d${Math.round(enemy.distance ?? 30)}`
  return `atk_${weaponId}_${cid}_${bulletId}_${armorKey}_${helmetKey}_${distKey}_${scenarioHash}`
}

function makeDefenseId({
  enemyWeaponId,
  enemyConfigId,
  enemyBulletId,
  ourArmorLevel,
  ourArmorValue,
  ourHelmetLevel,
  ourHelmetValue,
  scenarioHash,
}) {
  const cid = (enemyConfigId || '#1').replace('#', '')
  const armorKey = `a${ourArmorLevel ?? 4}v${ourArmorValue ?? 0}`
  const helmetKey = `h${ourHelmetLevel ?? 4}v${ourHelmetValue ?? 0}`
  return `def_${enemyWeaponId}_${cid}_${enemyBulletId}_${armorKey}_${helmetKey}_${scenarioHash}`
}

// ============================================================
// 内部：场景哈希
// ============================================================

/**
 * 把场景参数归一化成短字符串 hash
 *
 * 包含：
 * - hitRateMap（排序后）
 * - hitProb（头/胸/腹/肢）
 * - triggerDelayEnable
 * - healthValue
 * - MATRIX_VERSION
 */
function makeScenarioHash(scenario) {
  const parts = []

  // 命中率映射
  const hrMap = (scenario.hitRateMap || [])
    .slice()
    .sort((a, b) => a.distance - b.distance)
    .map(p => `${p.distance}:${p.rate}`)
    .join(':')
  parts.push(hrMap || 'def')

  // 命中分布
  const hp = scenario.hitProb || { head: 0.1, chest: 0.3, stomach: 0.3, limbs: 0.3 }
  parts.push(`${hp.head}:${hp.chest}:${hp.stomach}:${hp.limbs}`)

  // 扳机开关
  parts.push(scenario.triggerDelayEnable !== false ? '1' : '0')

  // 生命值
  parts.push(String(scenario.healthValue ?? 100))

  // 矩阵版本
  parts.push(`v${MATRIX_VERSION}`)

  // 简单 hash（把字符串转成短码）
  return simpleHash(parts.join('|'))
}

/**
 * 简单字符串 hash（32 位）
 */
function simpleHash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i)
    h = h & h  // 转 32 位整数
  }
  return Math.abs(h).toString(36)
}