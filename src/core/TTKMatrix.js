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
//   v2 → v3：修复 DP 分段射速边界 bug
//   v3 → v4：修复 RecEngine 未按名字反查 barrelId 的 bug
//             （旧缓存里勇士等武器的 rangeMult 未应用，TTK 偏高）
//   v4 → v5：修复攻击侧命中率用错假想敌的 bug
//             （攻击侧应使用「我方配置的 hitRateMap」，不是「敌人的 hitRate」）
//
// ⭐ 命中率（v5 修复）：
//   - 攻击侧：用「我方攻击配置的 hitRateMap」按距离插值
//   - 防御侧：用「敌人的 hitRate」（敌人自己的命中率）
//
// ⭐ debug 收集（不持久化）：
//   - 每次「新算」一条 TTK，把输入 / 输出存到模块级 _debugMap
//   - 命中缓存的不收集（无 debug 数据）
//   - 供 __recDebug() 在控制台查询
//   - 用 clearDebugMap() 清空

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
// v3 → v4：修复 RecEngine 未按名字反查 barrelId 的 bug
// v4 → v5：修复攻击侧命中率用错假想敌的 bug
const MATRIX_VERSION = 5

// 批量写入大小（每 N 条写一次 IndexedDB）
const BATCH_SIZE = 200

// ============================================================
// ⭐ 模块级 debug Map（不持久化）
// ============================================================

const _debugMap = new Map()

/**
 * 读取某条 debug 记录
 */
export function getDebugEntry(id) {
  return _debugMap.get(id) || null
}

/**
 * 清空 debug Map
 */
export function clearDebugMap() {
  _debugMap.clear()
}

// ============================================================
// ⭐ 内部工具：计算某条攻击侧在指定距离的命中率
// ============================================================

/**
 * 攻击侧命中率
 *
 * 优先用「我方攻击配置的 hitRateMap」按距离插值；
 * 没有 hitRateMap 时回退到「敌人的 hitRate」或「scenario.hitRate」。
 *
 * ⚠️ v5 修复：
 *   旧代码直接用 enemy.hitRate（假想敌的命中率），
 *   导致攻击侧 TTK 偏乐观（命中率偏高）。
 *
 * @param {Object} attack
 * @param {Object} enemy
 * @param {Object} scenario
 * @param {DataManager} dataManager
 * @returns {number} 命中率 [0, 1]
 */
function getAttackHitRate(attack, enemy, scenario, dataManager) {
  const map = attack._attachment?.hitRateMap

  if (Array.isArray(map) && map.length > 0 && dataManager?.getHitRateFromMap) {
    return dataManager.getHitRateFromMap(map, enemy.distance, 0.85)
  }

  // 回退
  return enemy.hitRate ?? scenario.hitRate ?? 0.85
}

// ============================================================
// 对外 API：完整矩阵
// ============================================================

/**
 * 构建完整矩阵（攻击侧 + 防御侧）
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
 * ⭐ v5 修复：命中率用「我方配置的 hitRateMap」按距离插值
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

      // ---------- ⭐ 计算命中率（我方配置的 hitRateMap） ----------
      const hitRate = getAttackHitRate(attack, enemy, scenario, dataManager)

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
            hitRate,
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

        // ⭐ 收集 debug（不持久化）
        _debugMap.set(id, {
          type: 'attack',
          input: {
            weaponId: attack.weaponId,
            configId: attack.configId,
            weaponName: attack.meta.weaponName,
            bulletId: attack.bulletId,
            bulletName: attack.bullet.name,
            bulletLevel: attack.bullet.level,
            _current: attack._armed._current,
            hitRateMap: attack._attachment?.hitRateMap || [],
            defender: {
              armorLevel: enemy.armorLevel,
              armorValue: enemy.armorValue,
              helmetLevel: enemy.helmetLevel,
              helmetValue: enemy.helmetValue,
            },
            hitRate,                     // ⭐ 实际传入 DP 的值
            hitProb: scenario.hitProb,
            triggerDelayEnable: scenario.triggerDelayEnable,
            healthValue: scenario.healthValue,
            distance: enemy.distance,
          },
          output: {
            ttk: result.ttk,
            shots: result.shots,
            hits: result.hits,
            debug: result.debug,
          },
        })

        computed++

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
 * ⭐ 防御侧命中率 = enemy.hitRate（敌人自己的命中率）
 *   —— 不需要改，因为防御侧本来就是「敌人打我方」，用敌人命中率是对的。
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
      const hitRate = enemy.hitRate ?? scenario.hitRate ?? 0.85

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
            hitRate,
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

        // ⭐ 收集 debug（不持久化）
        _debugMap.set(id, {
          type: 'defense',
          input: {
            enemyWeaponId: enemy.weaponId,
            enemyConfigId: enemy.configId,
            enemyWeaponName: enemyInfo.armed.name,
            enemyBulletId: enemy.bulletId,
            enemyBulletName: enemyInfo.bulletData.name,
            enemyBulletLevel: enemyInfo.bulletData.level,
            enemy_current: enemyInfo.armed._current,
            enemyHitRate: enemy.hitRate,
            defender: {
              armorLevel: defense.armor.level,
              armorValue: defense.armor.value,
              helmetLevel: defense.helmet.level,
              helmetValue: defense.helmet.value,
              armorName: defense.meta.armorName,
              helmetName: defense.meta.helmetName,
            },
            hitRate,
            hitProb: scenario.hitProb,
            triggerDelayEnable: scenario.triggerDelayEnable,
            healthValue: scenario.healthValue,
            distance: enemy.distance,
          },
          output: {
            ttk: result.ttk,
            shots: result.shots,
            hits: result.hits,
            debug: result.debug,
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

export async function getMatrixStats() {
  return await idbGetMatrixStats()
}

export async function clearMatrixCache() {
  return await idbClearMatrix()
}

// ============================================================
// ⭐ ID 生成（导出，供 RecEngine 查询 debug 用）
// ============================================================

export function makeAttackId({ weaponId, configId, bulletId, enemy, scenarioHash }) {
  const cid = (configId || '#1').replace('#', '')
  const armorKey = `a${enemy.armorLevel ?? 4}v${enemy.armorValue ?? 0}`
  const helmetKey = `h${enemy.helmetLevel ?? 4}v${enemy.helmetValue ?? 0}`
  const distKey = `d${Math.round(enemy.distance ?? 30)}`
  return `atk_${weaponId}_${cid}_${bulletId}_${armorKey}_${helmetKey}_${distKey}_${scenarioHash}`
}

export function makeDefenseId({
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

export function makeScenarioHash(scenario) {
  const parts = []

  const hrMap = (scenario.hitRateMap || [])
    .slice()
    .sort((a, b) => a.distance - b.distance)
    .map(p => `${p.distance}:${p.rate}`)
    .join(':')
  parts.push(hrMap || 'def')

  const hp = scenario.hitProb || { head: 0.1, chest: 0.3, stomach: 0.3, limbs: 0.3 }
  parts.push(`${hp.head}:${hp.chest}:${hp.stomach}:${hp.limbs}`)

  parts.push(scenario.triggerDelayEnable !== false ? '1' : '0')
  parts.push(String(scenario.healthValue ?? 100))
  parts.push(`v${MATRIX_VERSION}`)

  return simpleHash(parts.join('|'))
}

function simpleHash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i)
    h = h & h
  }
  return Math.abs(h).toString(36)
}