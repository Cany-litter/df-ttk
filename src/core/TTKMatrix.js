// src/core/TTKMatrix.js
//
// TTK 矩阵 + DP 引擎 + IndexedDB 封装（合并文件）
//
// ⭐ 本文件合并自：
//   - TTKDP.js（DP 引擎，computeTTKWithDP）
//   - TTKIndexedDB.js（IndexedDB 封装）
//   - TTKMatrix.js（矩阵预计算 + 场景哈希 + ID 生成）
//
// ⭐ 为什么合并：
//   三者是"一个完整的缓存系统"：
//     - DP 引擎算单条 TTK
//     - IDB 存储 TTK
//     - 矩阵枚举所有组合、写缓存、读缓存
//   分成三个文件时，改一处要跳三个地方。
//   合并后一个文件搞定，逻辑内聚。
//
// ⭐ v2 改动（死代码清理）：
//   - 删除 getAllMatrixEntries（无引用）
//   - 删除 closeDB（无引用）
//
// ⭐ 对外 API（保持与原文件一致）：
//
//   —— DP ——
//   computeTTKWithDP({ weapon, bulletData, defender, scenario, distance })
//
//   —— 矩阵 ——
//   buildAllMatrix({ attacks, defenses, enemies, scenario, dataManager, onProgress, signal })
//   buildAttackMatrix(...)
//   buildDefenseMatrix(...)
//   getAttackTTK({ weaponId, configId, bulletId, enemy, scenarioHash })
//   getDefenseTTK({ enemyWeaponId, ..., distance, hitRate, scenarioHash })
//   makeAttackId({ weaponId, configId, bulletId, enemy, scenarioHash })
//   makeDefenseId({ ... })
//   makeScenarioHash(scenario)
//   getDebugEntry(id) / clearDebugMap()
//
//   —— IndexedDB ——
//   getMatrixEntry / setMatrixEntry / setMatrixEntries
//   deleteMatrixEntry / deleteMatrixEntriesByIds / deleteMatrixEntriesByPrefix
//   getAllMatrixIds / getMatrixCount / getMatrixStats
//   clearMatrix
//   saveRecPanelState / loadRecPanelState / clearRecPanelState
//   requestPersistentStorage
//
// ⭐ MATRIX_VERSION：递增会让所有缓存失效
//   v1 → v2：修复 DP 连发间隔重复计算 bug
//   v2 → v3：修复 DP 分段射速边界 bug
//   v3 → v4：修复 RecEngine 未按名字反查 barrelId 的 bug
//   v4 → v5：修复攻击侧命中率用错假想敌的 bug
//   v5 → v6：修复防御侧缓存 ID 未含 distance / hitRate 的 bug
//
// ⭐ debug 收集（不持久化）：
//   每次「新算」一条 TTK，把输入/输出存到 _debugMap
//   命中缓存的不收集（无 debug 数据）
//   供 __recDebug() 在控制台查询

import { openDB } from 'idb'

// ============================================================
// ============ 第一部分：DP 引擎（原 TTKDP.js）===============
// ============================================================
//
// ⭐ 调试开关（通过 window 变量控制）：
//   window.__DEBUG_DP = true              打开调试
//   window.__DEBUG_DP_TARGET = 'MK4'      只输出武器名包含 MK4 的日志
//   window.__DEBUG_DP_ONCE = true         每个武器只输出一次（推荐）
//
// 默认：无日志
//
// ⭐ 连发间隔语义（v2 修复）：
//   新连发首（burstPos === 0 且 shotIndex > 0）的间隔 = burstInterval
//   —— 连发间隔【取代】连发内间隔，不是叠加
//
// ⭐ 分段射速语义（v3 修复）：
//   rofStages: [{ untilShot: N, rofAdd: X }, { rofAdd: 0 }]
//   表示"前 N 个射击间隔射速 +X，之后 +0"。
//   判断条件：shotIndex <= untilShot

const PART_HEAD = 0
const PART_CHEST = 1
const PART_STOMACH = 2
const PART_LIMBS = 3

const MAX_STATES = 3_000_000

// ⭐ 已输出的武器集合（用于 __DEBUG_DP_ONCE）
const _debugPrinted = new Set()

/**
 * 用 DP 引擎计算单次 TTK（快速模式）
 *
 * @param {Object} options
 * @param {Object} options.weapon      - 应用附件后的武器
 * @param {Object} options.bulletData  - 子弹对象
 * @param {Object} options.defender    - { armorLevel, armorValue, helmetLevel, helmetValue }
 * @param {Object} options.scenario    - { hitRate, hitProb, triggerDelayEnable, healthValue }
 * @param {number} options.distance    - 距离
 * @returns {Object} { ttk, shots, hits, debug? }
 */
export function computeTTKWithDP({
  weapon,
  bulletData,
  defender,
  scenario,
  distance,
}) {
  const current = weapon._current || weapon
  const flesh = current.flesh
  const armor = current.armor
  const mult = current.mult
  const ranges = current.ranges
  const decays = current.decays
  const rof = current.rof
  const velocity = current.velocity
  const triggerDelay = weapon.triggerDelay || 0
  const fireMode = current.fireMode || null
  const burstCount = current.burstCount || null
  const burstInternalROF = current.burstInternalROF || null
  const burstInterval = current.burstInterval || null
  const rofStages = current.rofStages || null

  const partMult = bulletData.partMult || { head: 1, chest: 1, stomach: 1, limbs: 1 }
  const armorData = bulletData.armorData || {}

  const armorLevel = defender.armorLevel ?? 4
  const armorValue = defender.armorValue ?? 0
  const helmetLevel = defender.helmetLevel ?? 4
  const helmetValue = defender.helmetValue ?? 0

  const armorLevelData = armorData[String(armorLevel)] || { pen: 0, armorMult: 1 }
  const helmetLevelData = armorData[String(helmetLevel)] || { pen: 0, armorMult: 1 }

  const healthValue = scenario.healthValue ?? 100
  const hitRate = scenario.hitRate ?? 0.85
  const hitProb = scenario.hitProb || { head: 0.1, chest: 0.3, stomach: 0.3, limbs: 0.3 }
  const triggerEnabled = scenario.triggerDelayEnable !== false

  const decay = _dpCalcDecay(distance, ranges, decays)

  const pureDamage = {
    head: flesh * (partMult.head ?? 1) * (mult.head ?? 1) * decay,
    chest: flesh * (partMult.chest ?? 1) * (mult.chest ?? 1) * decay,
    stomach: flesh * (partMult.stomach ?? 1) * (mult.stomach ?? 1) * decay,
    limbs: flesh * (partMult.limbs ?? 1) * (mult.limbs ?? 1) * decay,
  }

  const armorDamage = {
    head: armor * (helmetLevelData.armorMult ?? 1),
    chest: armor * (armorLevelData.armorMult ?? 1),
    stomach: armor * (armorLevelData.armorMult ?? 1),
    limbs: 0,
  }

  const pen = {
    head: helmetLevelData.pen ?? 0,
    chest: armorLevelData.pen ?? 0,
    stomach: armorLevelData.pen ?? 0,
    limbs: 1,
  }

  // ---------- 调试判断 ----------
  const debugEnabled = (typeof window !== 'undefined') && window.__DEBUG_DP === true
  const debugTarget = (typeof window !== 'undefined') ? window.__DEBUG_DP_TARGET : null
  const debugOnce = (typeof window !== 'undefined') && window.__DEBUG_DP_ONCE === true
  const weaponName = current._displayName || weapon.name || '(unknown)'

  let shouldDebug = false
  if (debugEnabled) {
    if (!debugTarget || weaponName.includes(debugTarget)) {
      if (debugOnce) {
        const key = `${weaponName}`
        if (!_debugPrinted.has(key)) {
          _debugPrinted.add(key)
          shouldDebug = true
        }
      } else {
        shouldDebug = true
      }
    }
  }

  if (shouldDebug) {
    console.log(`═══ [DP] ${weaponName} @ ${distance}m ═══`)
    console.log(`  fireMode=${fireMode} burstCount=${burstCount} burstInternalROF=${burstInternalROF} burstInterval=${burstInterval}`)
    console.log(`  rof=${rof} rofStages=${JSON.stringify(rofStages)}`)
    console.log(`  flesh=${flesh} armor=${armor} mult=${JSON.stringify(mult)}`)
    console.log(`  子弹=${bulletData.id}`)
    console.log(`  护甲 Lv${armorLevel} 值${armorValue} | 头盔 Lv${helmetLevel} 值${helmetValue}`)
    console.log(`  decay=${decay} 命中率=${hitRate}`)
    console.log(`  pureDamage=${JSON.stringify(pureDamage)}`)
    console.log(`  armorDamage=${JSON.stringify(armorDamage)}`)
    console.log(`  pen=${JSON.stringify(pen)}`)
  }

  const dpResult = _runDP({
    pureDamage,
    armorDamage,
    pen,
    hitRate,
    hitProb,
    healthValue,
    armorValue,
    helmetValue,
    fireMode,
    burstCount,
    burstInternalROF,
    burstInterval,
    rof,
    rofStages,
    velocity,
    distance,
    triggerDelay,
    triggerEnabled,
  })

  const flightTime = (distance / velocity) * 1000
  const triggerMs = triggerEnabled ? triggerDelay : 0
  const ttk = flightTime + triggerMs + dpResult.expectedTimeMs

  if (shouldDebug) {
    console.log(`─── [DP] 结果 ───`)
    console.log(`  期望射击数=${dpResult.expectedShots.toFixed(3)}`)
    console.log(`  期望命中数=${dpResult.expectedHits.toFixed(3)}`)
    console.log(`  射击时间=${dpResult.expectedTimeMs.toFixed(1)}ms`)
    console.log(`  飞行时间=${flightTime.toFixed(2)}ms`)
    console.log(`  扳机=${triggerMs}ms`)
    console.log(`  总TTK=${ttk.toFixed(1)}ms`)
    console.log(`  状态数=${dpResult.stateCount}`)
    console.log(`══════════════════════════`)
  }

  return {
    ttk,
    shots: dpResult.expectedShots,
    hits: dpResult.expectedHits,
    debug: {
      flightTime,
      triggerMs,
      shootingTime: dpResult.expectedTimeMs,
      pureDamage,
      armorDamage,
      pen,
      decay,
      stateCount: dpResult.stateCount,
    },
  }
}

// ---------- DP 主循环 ----------

function _runDP({
  pureDamage,
  armorDamage,
  pen,
  hitRate,
  hitProb,
  healthValue,
  armorValue,
  helmetValue,
  fireMode,
  burstCount,
  burstInternalROF,
  burstInterval,
  rof,
  rofStages,
  velocity,
  distance,
  triggerDelay,
  triggerEnabled,
}) {
  const isBurstMode = fireMode === 'burst' && burstCount && burstInternalROF

  const dp = new Map()

  const initialState = {
    health: healthValue,
    headHits: 0,
    bodyHits: 0,
    limbHits: 0,
    burstPos: 0,
    lastPart: -1,
  }

  let baseHead = hitProb.head ?? 0.1
  let baseChest = hitProb.chest ?? 0.3
  let baseStomach = hitProb.stomach ?? 0.3
  let baseLimbs = hitProb.limbs ?? 0.3

  const sumBase = baseHead + baseChest + baseStomach + baseLimbs
  if (sumBase > 0) {
    baseHead /= sumBase
    baseChest /= sumBase
    baseStomach /= sumBase
    baseLimbs /= sumBase
  }

  const getDP = (state) => {
    if (state.health <= 0) {
      return { time: 0, shots: 0, hits: 0 }
    }

    const key = _stateKey(state)
    if (dp.has(key)) return dp.get(key)

    if (dp.size > MAX_STATES) {
      throw new Error(`TTKDP: 状态数超过上限 ${MAX_STATES}`)
    }

    if (!isFinite(state.health)) {
      throw new Error(`TTKDP: state.health 是 NaN (state=${JSON.stringify(state)})`)
    }

    const shotIndex = state.headHits + state.bodyHits + state.limbHits
    const isFirstShot = (shotIndex === 0)

    const intervalMs = _getShotIntervalMs({
      shotIndex,
      isBurstMode,
      burstInternalROF,
      rof,
      rofStages,
    })

    let burstGapMs = 0
    if (isBurstMode) {
      if (state.burstPos === 0 && shotIndex > 0) {
        burstGapMs = burstInterval * 1000
      }
    }

    // ⭐ v2 核心修复：连发模式下，新连发首的间隔 = burstGapMs
    const currentIntervalMs = (isBurstMode && burstGapMs > 0)
      ? burstGapMs
      : intervalMs

    let headProb = baseHead
    let chestProb = baseChest
    let stomachProb = baseStomach
    let limbsProb = baseLimbs

    if (isBurstMode && state.burstPos > 0 && state.lastPart >= 0) {
      const biased = _applyBurstBias(state.lastPart, 0.7)
      headProb = biased.head
      chestProb = biased.chest
      stomachProb = biased.stomach
      limbsProb = biased.limbs
    }

    const sumProb = headProb + chestProb + stomachProb + limbsProb
    if (sumProb > 0) {
      headProb /= sumProb
      chestProb /= sumProb
      stomachProb /= sumProb
      limbsProb /= sumProb
    }

    const p = Math.max(0.0001, hitRate)

    let expectedTime
    if (isFirstShot) {
      expectedTime = (1 - p) * currentIntervalMs / p
    } else {
      expectedTime = currentIntervalMs / p
    }

    let expectedShots = 1 / p
    let expectedHits = 1

    if (headProb > 0) {
      const dmg = _calcDamage({
        hitPart: PART_HEAD,
        pureDamage: pureDamage.head,
        pen: pen.head,
        armorValue: helmetValue,
        cumulativeArmorDamage: state.headHits * armorDamage.head,
        armorDamage: armorDamage.head,
      })
      const next = {
        ...state,
        health: state.health - dmg,
        headHits: state.headHits + 1,
        burstPos: isBurstMode ? (state.burstPos + 1) % burstCount : 0,
        lastPart: PART_HEAD,
      }
      const sub = getDP(next)
      expectedTime += headProb * sub.time
      expectedShots += headProb * sub.shots
      expectedHits += headProb * sub.hits
    }

    if (chestProb > 0) {
      const dmg = _calcDamage({
        hitPart: PART_CHEST,
        pureDamage: pureDamage.chest,
        pen: pen.chest,
        armorValue: armorValue,
        cumulativeArmorDamage: state.bodyHits * armorDamage.chest,
        armorDamage: armorDamage.chest,
      })
      const next = {
        ...state,
        health: state.health - dmg,
        bodyHits: state.bodyHits + 1,
        burstPos: isBurstMode ? (state.burstPos + 1) % burstCount : 0,
        lastPart: PART_CHEST,
      }
      const sub = getDP(next)
      expectedTime += chestProb * sub.time
      expectedShots += chestProb * sub.shots
      expectedHits += chestProb * sub.hits
    }

    if (stomachProb > 0) {
      const dmg = _calcDamage({
        hitPart: PART_STOMACH,
        pureDamage: pureDamage.stomach,
        pen: pen.stomach,
        armorValue: armorValue,
        cumulativeArmorDamage: state.bodyHits * armorDamage.stomach,
        armorDamage: armorDamage.stomach,
      })
      const next = {
        ...state,
        health: state.health - dmg,
        bodyHits: state.bodyHits + 1,
        burstPos: isBurstMode ? (state.burstPos + 1) % burstCount : 0,
        lastPart: PART_STOMACH,
      }
      const sub = getDP(next)
      expectedTime += stomachProb * sub.time
      expectedShots += stomachProb * sub.shots
      expectedHits += stomachProb * sub.hits
    }

    if (limbsProb > 0) {
      const dmg = _calcDamage({
        hitPart: PART_LIMBS,
        pureDamage: pureDamage.limbs,
        pen: 1,
        armorValue: 0,
        cumulativeArmorDamage: 0,
        armorDamage: 0,
      })
      const next = {
        ...state,
        health: state.health - dmg,
        limbHits: state.limbHits + 1,
        burstPos: isBurstMode ? (state.burstPos + 1) % burstCount : 0,
        lastPart: PART_LIMBS,
      }
      const sub = getDP(next)
      expectedTime += limbsProb * sub.time
      expectedShots += limbsProb * sub.shots
      expectedHits += limbsProb * sub.hits
    }

    const result = {
      time: expectedTime,
      shots: expectedShots,
      hits: expectedHits,
    }
    dp.set(key, result)
    return result
  }

  const final = getDP(initialState)

  return {
    expectedTimeMs: final.time,
    expectedShots: final.shots,
    expectedHits: final.hits,
    stateCount: dp.size,
  }
}

// ---------- DP 辅助函数 ----------

function _stateKey(s) {
  return `${s.health}|${s.headHits}|${s.bodyHits}|${s.limbHits}|${s.burstPos}|${s.lastPart}`
}

function _getShotIntervalMs({
  shotIndex,
  isBurstMode,
  burstInternalROF,
  rof,
  rofStages,
}) {
  if (isBurstMode) {
    return 60000 / burstInternalROF
  }

  if (!rofStages || !Array.isArray(rofStages) || rofStages.length === 0) {
    return 60000 / rof
  }

  // ⭐ v3 修复：边界从 `<` 改为 `<=`
  let rofAdd = 0
  for (const stage of rofStages) {
    if (stage.untilShot === undefined || stage.untilShot === null || shotIndex <= stage.untilShot) {
      rofAdd = stage.rofAdd || 0
      break
    }
  }

  const effectiveRof = rof + rofAdd
  if (!isFinite(effectiveRof) || effectiveRof <= 0) {
    return 60000 / rof
  }
  return 60000 / effectiveRof
}

function _calcDamage({
  hitPart,
  pureDamage,
  pen,
  armorValue,
  cumulativeArmorDamage,
  armorDamage,
}) {
  if (hitPart === PART_LIMBS) {
    return pureDamage
  }

  const remainingArmor = armorValue - cumulativeArmorDamage

  if (remainingArmor <= 0) {
    return pureDamage
  }

  if (armorDamage >= remainingArmor) {
    const frac = remainingArmor / armorDamage
    return frac * (pureDamage * pen) + (1 - frac) * pureDamage
  }

  return pureDamage * pen
}

function _applyBurstBias(lastPart, biasStrength = 0.7) {
  const result = { head: 0, chest: 0, stomach: 0, limbs: 0 }
  const partKeys = ['head', 'chest', 'stomach', 'limbs']

  if (lastPart < 0 || lastPart >= partKeys.length) {
    return { head: 0.25, chest: 0.25, stomach: 0.25, limbs: 0.25 }
  }

  const lastKey = partKeys[lastPart]
  const bias = 1 - biasStrength

  result[lastKey] += biasStrength

  const adjMap = {
    0: { 1: 1.0 },
    1: { 0: 0.5, 2: 0.5 },
    2: { 1: 0.5, 3: 0.5 },
    3: { 2: 1.0 },
  }

  const adj = adjMap[lastPart] || {}
  for (const [idx, prob] of Object.entries(adj)) {
    result[partKeys[parseInt(idx, 10)]] += bias * prob
  }

  return result
}

function _dpCalcDecay(distance, ranges, decays) {
  if (distance < ranges[0]) return decays[0]
  if (distance < ranges[1]) return decays[1]
  if (distance < ranges[2]) return decays[2]
  if (distance < ranges[3]) return decays[3]
  return decays[4]
}

// ============================================================
// ============ 第二部分：IndexedDB 封装 =====================
// ============================================================
//
// ⭐ 存储结构：
//   数据库：df-ttk
//   版本：2
//   ObjectStore：
//     1) ttk-matrix（keyPath: id）
//     2) rec-panel-state（keyPath: id）

const DB_NAME = 'df-ttk'
const DB_VERSION = 2
const STORE_NAME = 'ttk-matrix'
const REC_PANEL_STORE_NAME = 'rec-panel-state'

const REC_PANEL_STATE_VERSION = 1
const REC_PANEL_STATE_ID = 'default'

// 批量写入的事务分片大小（每片独立事务，单批失败不影响其他批）
const BATCH_TX_SIZE = 50
const DELETE_TX_SIZE = 50

// ---------- 内部：数据库连接（惰性 + 单例） ----------

let _dbPromise = null

function _getDB() {
  if (_dbPromise) return _dbPromise

  _dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(REC_PANEL_STORE_NAME)) {
        db.createObjectStore(REC_PANEL_STORE_NAME, { keyPath: 'id' })
      }
    },
  })

  return _dbPromise
}

// ---------- 读 ----------

/**
 * 读取单条矩阵记录
 * @returns {Promise<Object|null>} { id, ttk, shots, hits, meta, cachedAt } 或 null
 */
export async function getMatrixEntry(id) {
  try {
    const db = await _getDB()
    const entry = await db.get(STORE_NAME, id)
    return entry || null
  } catch (e) {
    console.warn('⚠️ TTKMatrix.getMatrixEntry 失败:', e)
    return null
  }
}

/**
 * 获取所有矩阵 ID
 */
export async function getAllMatrixIds() {
  try {
    const db = await _getDB()
    return await db.getAllKeys(STORE_NAME)
  } catch (e) {
    console.warn('⚠️ TTKMatrix.getAllMatrixIds 失败:', e)
    return []
  }
}

/**
 * 获取矩阵记录数
 */
export async function getMatrixCount() {
  try {
    const db = await _getDB()
    return await db.count(STORE_NAME)
  } catch (e) {
    console.warn('⚠️ TTKMatrix.getMatrixCount 失败:', e)
    return 0
  }
}

/**
 * 获取统计信息（记录数 + 估算大小）
 * @returns {Promise<Object>} { count, sizeKB, sizeMB }
 */
export async function getMatrixStats() {
  try {
    const db = await _getDB()
    const count = await db.count(STORE_NAME)

    let sizeKB = 0
    let sizeMB = 0
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate()
      sizeKB = Math.round((estimate.usage || 0) / 1024)
      sizeMB = Math.round((sizeKB / 1024) * 100) / 100
    }

    return { count, sizeKB, sizeMB }
  } catch (e) {
    console.warn('⚠️ TTKMatrix.getMatrixStats 失败:', e)
    return { count: 0, sizeKB: 0, sizeMB: 0 }
  }
}

// ---------- 写 ----------

/**
 * 写入单条矩阵记录（覆盖）
 * @returns {Promise<boolean>}
 */
export async function setMatrixEntry(id, data) {
  try {
    const db = await _getDB()
    const entry = {
      id,
      ttk: data.ttk ?? 0,
      shots: data.shots ?? 0,
      hits: data.hits ?? 0,
      meta: data.meta ?? {},
      cachedAt: Date.now(),
    }
    await db.put(STORE_NAME, entry)
    return true
  } catch (e) {
    console.warn('⚠️ TTKMatrix.setMatrixEntry 失败:', e)
    return false
  }
}

/**
 * ⭐ 批量写入矩阵（分片事务）
 *
 * 之前：一次性事务写 N 条，失败全回滚
 * 现在：按 BATCH_TX_SIZE（50）分片，失败只影响单批
 *
 * @returns {Promise<number>} 成功写入数
 */
export async function setMatrixEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return 0

  try {
    const db = await _getDB()
    const now = Date.now()
    let totalWritten = 0

    for (let i = 0; i < entries.length; i += BATCH_TX_SIZE) {
      const chunk = entries.slice(i, i + BATCH_TX_SIZE)

      try {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)

        let chunkCount = 0
        for (const e of chunk) {
          if (!e || !e.id) continue
          store.put({
            id: e.id,
            ttk: e.ttk ?? 0,
            shots: e.shots ?? 0,
            hits: e.hits ?? 0,
            meta: e.meta ?? {},
            cachedAt: now,
          })
          chunkCount++
        }

        await tx.done
        totalWritten += chunkCount
      } catch (e) {
        console.warn(`⚠️ TTKMatrix.setMatrixEntries 单批失败（${chunk.length} 条）:`, e)
      }
    }

    return totalWritten
  } catch (e) {
    console.warn('⚠️ TTKMatrix.setMatrixEntries 失败:', e)
    return 0
  }
}

// ---------- 删 ----------

/**
 * 删除单条矩阵记录
 */
export async function deleteMatrixEntry(id) {
  try {
    const db = await _getDB()
    await db.delete(STORE_NAME, id)
    return true
  } catch (e) {
    console.warn('⚠️ TTKMatrix.deleteMatrixEntry 失败:', e)
    return false
  }
}

/**
 * ⭐ 批量删除（分片事务）
 *
 * @param {Array<string>} ids
 * @returns {Promise<number>} 成功删除数
 */
export async function deleteMatrixEntriesByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return 0

  try {
    const db = await _getDB()
    let totalDeleted = 0

    for (let i = 0; i < ids.length; i += DELETE_TX_SIZE) {
      const chunk = ids.slice(i, i + DELETE_TX_SIZE)

      try {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)

        let chunkCount = 0
        for (const id of chunk) {
          if (!id) continue
          store.delete(id)
          chunkCount++
        }

        await tx.done
        totalDeleted += chunkCount
      } catch (e) {
        console.warn(`⚠️ TTKMatrix.deleteMatrixEntriesByIds 单批失败（${chunk.length} 条）:`, e)
      }
    }

    return totalDeleted
  } catch (e) {
    console.warn('⚠️ TTKMatrix.deleteMatrixEntriesByIds 失败:', e)
    return 0
  }
}

/**
 * ⭐ 按前缀批量删除
 *
 * 用途：清空某武器的所有缓存（缓存 key 都以 `atk_{weaponId}_` 开头）
 *
 * ⚠️ 已知限制：
 *   如果两个 cid 存在"前缀关系"（如 1 和 10），
 *   清一个会误伤另一个（因为它俩的 key 前几个字符相同）。
 *   用户下次算评分时会自动重算（损失只是多算一次）。
 *
 * @param {string} prefix
 * @returns {Promise<number>} 删除的数量
 */
export async function deleteMatrixEntriesByPrefix(prefix) {
  if (!prefix) return 0

  try {
    const db = await _getDB()
    const allKeys = await db.getAllKeys(STORE_NAME)

    const matched = allKeys.filter(k => String(k).startsWith(prefix))
    if (matched.length === 0) return 0

    return await deleteMatrixEntriesByIds(matched)
  } catch (e) {
    console.warn('⚠️ TTKMatrix.deleteMatrixEntriesByPrefix 失败:', e)
    return 0
  }
}

/**
 * 清空所有矩阵记录
 */
export async function clearMatrix() {
  try {
    const db = await _getDB()
    await db.clear(STORE_NAME)
    return true
  } catch (e) {
    console.warn('⚠️ TTKMatrix.clearMatrix 失败:', e)
    return false
  }
}

// ---------- 配装面板状态 ----------

/**
 * 保存配装面板状态
 * @param {Object} state - { enemies: Array, budget: number }
 */
export async function saveRecPanelState(state) {
  if (!state || typeof state !== 'object') {
    console.warn('⚠️ saveRecPanelState: state 无效')
    return false
  }

  try {
    const db = await _getDB()
    const entry = {
      id: REC_PANEL_STATE_ID,
      version: REC_PANEL_STATE_VERSION,
      enemies: Array.isArray(state.enemies) ? state.enemies : [],
      budget: typeof state.budget === 'number' ? state.budget : 100,
      savedAt: Date.now(),
    }
    await db.put(REC_PANEL_STORE_NAME, entry)
    return true
  } catch (e) {
    console.warn('⚠️ TTKMatrix.saveRecPanelState 失败:', e)
    return false
  }
}

/**
 * 读取配装面板状态
 * @returns {Promise<Object|null>} { enemies, budget, savedAt } 或 null
 */
export async function loadRecPanelState() {
  try {
    const db = await _getDB()
    const entry = await db.get(REC_PANEL_STORE_NAME, REC_PANEL_STATE_ID)
    if (!entry) return null

    if (entry.version !== REC_PANEL_STATE_VERSION) {
      console.warn(
        `⚠️ rec-panel-state 版本不匹配（缓存 v${entry.version}，当前 v${REC_PANEL_STATE_VERSION}），已丢弃`
      )
      await clearRecPanelState()
      return null
    }

    return {
      enemies: Array.isArray(entry.enemies) ? entry.enemies : [],
      budget: typeof entry.budget === 'number' ? entry.budget : 100,
      savedAt: entry.savedAt || 0,
    }
  } catch (e) {
    console.warn('⚠️ TTKMatrix.loadRecPanelState 失败:', e)
    return null
  }
}

/**
 * 清空配装面板状态
 */
export async function clearRecPanelState() {
  try {
    const db = await _getDB()
    await db.delete(REC_PANEL_STORE_NAME, REC_PANEL_STATE_ID)
    return true
  } catch (e) {
    console.warn('⚠️ TTKMatrix.clearRecPanelState 失败:', e)
    return false
  }
}

// ---------- 通用 ----------

/**
 * 请求持久化存储权限（可选）
 */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const granted = await navigator.storage.persisted()
      if (granted) return true
      return await navigator.storage.persist()
    }
    return false
  } catch (e) {
    console.warn('⚠️ TTKMatrix.requestPersistentStorage 失败:', e)
    return false
  }
}

// ============================================================
// ============ 第三部分：矩阵预计算 =========================
// ============================================================

// ⭐ 版本号：改伤害公式 / DP 时间公式 / 缓存 key 结构时递增
const MATRIX_VERSION = 6

// 批量写入大小（每 N 条写一次 IndexedDB）
const BATCH_SIZE = 200

// ---------- debug Map（不持久化） ----------

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

// ---------- 命中率工具 ----------

/**
 * 攻击侧命中率
 *
 * 优先用「我方攻击配置的 hitRateMap」按距离插值；
 * 没有 hitRateMap 时回退到「敌人的 hitRate」或「scenario.hitRate」。
 */
function _getAttackHitRate(attack, enemy, scenario, dataManager) {
  const map = attack._attachment?.hitRateMap

  if (Array.isArray(map) && map.length > 0 && dataManager?.getHitRateFromMap) {
    return dataManager.getHitRateFromMap(map, enemy.distance, 0.85)
  }

  return enemy.hitRate ?? scenario.hitRate ?? 0.85
}

/**
 * 防御侧命中率
 *
 * 防御侧是「敌人打我方」，命中率用「敌人自己的命中率」。
 * 必须与 RecEngine._buildRecommendationsFromMatrix 里查询时的算法完全一致。
 */
function _getDefenseHitRate(enemy, scenario) {
  return enemy.hitRate ?? scenario.hitRate ?? 0.85
}

// ---------- 完整矩阵 ----------

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
      const hitRate = _getAttackHitRate(attack, enemy, scenario, dataManager)

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

      // ---------- ⭐ v6：先算 hitRate ----------
      const hitRate = _getDefenseHitRate(enemy, scenario)

      // ---------- ⭐ v6：生成 ID（含 distance + hitRate） ----------
      const id = makeDefenseId({
        enemyWeaponId: enemy.weaponId,
        enemyConfigId: enemy.configId,
        enemyBulletId: enemy.bulletId,
        ourArmorLevel: defense.armor.level,
        ourArmorValue: defense.armor.value,
        ourHelmetLevel: defense.helmet.level,
        ourHelmetValue: defense.helmet.value,
        distance: enemy.distance,
        hitRate,
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

// ---------- 查询 API ----------

/**
 * 查询攻击侧 TTK
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
 */
export async function getDefenseTTK({
  enemyWeaponId,
  enemyConfigId,
  enemyBulletId,
  ourArmorLevel,
  ourArmorValue,
  ourHelmetLevel,
  ourHelmetValue,
  distance,
  hitRate,
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
    distance,
    hitRate,
    scenarioHash,
  })
  return await getMatrixEntry(id)
}

// ---------- 缓存管理（转发 IDB） ----------

export async function clearMatrixCache() {
  return await clearMatrix()
}

// ---------- ID 生成 ----------

/**
 * 生成攻击侧缓存 ID
 */
export function makeAttackId({ weaponId, configId, bulletId, enemy, scenarioHash }) {
  const cid = (configId || '#1').replace('#', '')
  const armorKey = `a${enemy.armorLevel ?? 4}v${enemy.armorValue ?? 0}`
  const helmetKey = `h${enemy.helmetLevel ?? 4}v${enemy.helmetValue ?? 0}`
  const distKey = `d${Math.round(enemy.distance ?? 30)}`
  return `atk_${weaponId}_${cid}_${bulletId}_${armorKey}_${helmetKey}_${distKey}_${scenarioHash}`
}

/**
 * 生成防御侧缓存 ID
 */
export function makeDefenseId({
  enemyWeaponId,
  enemyConfigId,
  enemyBulletId,
  ourArmorLevel,
  ourArmorValue,
  ourHelmetLevel,
  ourHelmetValue,
  distance,
  hitRate,
  scenarioHash,
}) {
  const cid = (enemyConfigId || '#1').replace('#', '')
  const armorKey = `a${ourArmorLevel ?? 4}v${ourArmorValue ?? 0}`
  const helmetKey = `h${ourHelmetLevel ?? 4}v${ourHelmetValue ?? 0}`
  const distKey = `d${Math.round(distance ?? 30)}`
  const hrKey = `hr${(hitRate ?? 0.85).toFixed(4)}`
  return `def_${enemyWeaponId}_${cid}_${enemyBulletId}_${armorKey}_${helmetKey}_${distKey}_${hrKey}_${scenarioHash}`
}

// ---------- 场景哈希 ----------

/**
 * 生成场景哈希
 */
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

  return _simpleHash(parts.join('|'))
}

function _simpleHash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i)
    h = h & h
  }
  return Math.abs(h).toString(36)
}