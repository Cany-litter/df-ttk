// src/core/TTKDP.js
//
// TTK 计算引擎（动态规划）
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
//   例（3 连发，burstInternalROF=1200 → 连发内间隔 50ms，burstInterval=140ms）：
//     第 1 发 → 0ms
//     第 2 发 → +50            （连发内）
//     第 3 发 → +50            （连发内）
//     第 4 发 → +140           （连发间隔，取代连发内间隔）
//     第 5 发 → +50            （连发内）
//     第 6 发 → +50            （连发内）
//     第 7 发 → +140           （连发间隔）
//     ...
//
// ⭐ 分段射速语义（v3 修复）：
//   rofStages: [{ untilShot: N, rofAdd: X }, { rofAdd: 0 }]
//   表示"前 N 个射击间隔射速 +X，之后 +0"。
//
//   shotIndex 是"已命中数"（第 M 发即将打出时 shotIndex = M-1）。
//   本函数返回的是"第 shotIndex 发之后的间隔"（即间隔 shotIndex → shotIndex+1）。
//
//   判断"该间隔是否属于前 N 个"：shotIndex <= untilShot（含边界）。
//     - shotIndex = 0 → 间隔 1→2 → 属于前 N 个（当 N≥1）
//     - shotIndex = 1 → 间隔 2→3 → 属于前 N 个（当 N≥2）
//     - shotIndex = 2 → 间隔 3→4 → 属于前 N 个（当 N≥3）
//     - shotIndex = 3 → 间隔 4→5 → 不属于前 3 个
//
//   ⚠️ v2 及以前用 shotIndex < untilShot，导致"第 N 个间隔"被错算为 +0，
//      造成 SVCH 镀铬枪机等武器每发多算 ~14ms。
//
// ============================================================

const PART_HEAD = 0
const PART_CHEST = 1
const PART_STOMACH = 2
const PART_LIMBS = 3

const MAX_STATES = 3_000_000

// ⭐ 已输出的武器集合（用于 __DEBUG_DP_ONCE）
const _debugPrinted = new Set()

// ============================================================
// 主入口
// ============================================================

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

  const decay = calcDecay(distance, ranges, decays)

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

  // ============================================================
  // ⭐ 调试判断
  // ============================================================
  const debugEnabled = (typeof window !== 'undefined') && window.__DEBUG_DP === true
  const debugTarget = (typeof window !== 'undefined') ? window.__DEBUG_DP_TARGET : null
  const debugOnce = (typeof window !== 'undefined') && window.__DEBUG_DP_ONCE === true
  const weaponName = current._displayName || weapon.name || '(unknown)'

  let shouldDebug = false
  if (debugEnabled) {
    if (!debugTarget || weaponName.includes(debugTarget)) {
      if (debugOnce) {
        // 同武器名只输出一次
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

  const dpResult = runDP({
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

// ============================================================
// DP 主循环
// ============================================================

function runDP({
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

    const key = stateKey(state)
    if (dp.has(key)) return dp.get(key)

    if (dp.size > MAX_STATES) {
      throw new Error(`TTKDP: 状态数超过上限 ${MAX_STATES}`)
    }

    if (!isFinite(state.health)) {
      throw new Error(`TTKDP: state.health 是 NaN (state=${JSON.stringify(state)})`)
    }

    const shotIndex = state.headHits + state.bodyHits + state.limbHits
    const isFirstShot = (shotIndex === 0)

    const intervalMs = getShotIntervalMs({
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

    // ============================================================
    // ⭐ v2 核心修复：连发模式下，新连发首的间隔 = burstGapMs
    //    —— 连发间隔【取代】连发内间隔，不是叠加
    //
    //    旧代码：currentIntervalMs = intervalMs + burstGapMs
    //            新连发首时多算了 50ms（连发内间隔），导致 TTK 偏高
    //
    //    新代码：新连发首 → 用 burstGapMs
    //            普通发   → 用 intervalMs
    // ============================================================
    const currentIntervalMs = (isBurstMode && burstGapMs > 0)
      ? burstGapMs
      : intervalMs

    let headProb = baseHead
    let chestProb = baseChest
    let stomachProb = baseStomach
    let limbsProb = baseLimbs

    if (isBurstMode && state.burstPos > 0 && state.lastPart >= 0) {
      const biased = applyBurstBias(state.lastPart, 0.7)
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
      const dmg = calcDamage({
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
      const dmg = calcDamage({
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
      const dmg = calcDamage({
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
      const dmg = calcDamage({
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

// ============================================================
// 辅助函数
// ============================================================

function stateKey(s) {
  return `${s.health}|${s.headHits}|${s.bodyHits}|${s.limbHits}|${s.burstPos}|${s.lastPart}`
}

function getShotIntervalMs({
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

  // ============================================================
  // ⭐ v3 修复：边界从 `<` 改为 `<=`
  //
  //   shotIndex = 已命中数（第 M 发即将打出时 shotIndex = M-1）
  //   本函数返回"第 shotIndex 发之后的间隔"（间隔 shotIndex → shotIndex+1）
  //
  //   "前 N 个间隔用 +X" 对应 shotIndex ∈ {0, 1, ..., N-1}，
  //   即 shotIndex <= N-1，等价于 shotIndex < N。
  //
  //   ⚠️ 等等——为什么是 `<=` 而不是 `<`？
  //
  //   重新核对：
  //     shotIndex = 0 → 间隔 1→2（第 1 个间隔）
  //     shotIndex = 1 → 间隔 2→3（第 2 个间隔）
  //     shotIndex = 2 → 间隔 3→4（第 3 个间隔）
  //     shotIndex = 3 → 间隔 4→5（第 4 个间隔）
  //
  //   "前 3 个间隔用 +100" → shotIndex ∈ {0, 1, 2} → shotIndex < 3
  //   即 shotIndex < untilShot（untilShot = 3）
  //
  //   ⚠️ 但这样 S4（shotIndex=3）会用 +0，导致间隔 3→4 被错算！
  //
  //   问题在于：S4 的 currentIntervalMs 是"从第 3 发到第 4 发的间隔"，
  //   即"第 3 发之后的间隔" = 间隔 3→4。
  //   而 S4 的 shotIndex = 3（已命中 3 发）。
  //   所以"S4 用 shotIndex=3 算间隔 3→4"，不是"间隔 4→5"。
  //
  //   实际上 DP 的语义是：
  //     状态 S 的 currentIntervalMs = "从上一发到当前这一发的间隔"
  //     S_N（第 N 发即将打出）的 currentIntervalMs = "第 N-1 发之后的间隔"
  //     S_N 的 shotIndex = N-1
  //     所以 getShotIntervalMs 返回"第 shotIndex 发之后的间隔"
  //     = 间隔 shotIndex → shotIndex+1
  //
  //   S_N 用 shotIndex = N-1 算间隔 N-1 → N。这是对的。
  //
  //   S4（shotIndex=3）算间隔 3→4（"第 3 个间隔"）→ 应该 +100
  //   S5（shotIndex=4）算间隔 4→5（"第 4 个间隔"）→ 应该 +0
  //
  //   所以判断条件应该是：shotIndex <= untilShot - 1，即 shotIndex < untilShot。
  //   ... 但这跟 v2 的写法一样啊！
  //
  //   ⚠️ 关键：untilShot 的语义是什么？
  //
  //   数据里写的是：
  //     rofStages: [{ untilShot: 3, rofAdd: 100 }, { rofAdd: 0 }]
  //   用户的描述："提升前 4 发子弹【3 个射击间隔】的射速"
  //
  //   "前 3 个射击间隔" = 间隔 1→2、2→3、3→4
  //   对应 shotIndex ∈ {0, 1, 2}
  //
  //   但按 stateKey 语义，S_N 的 shotIndex = N-1：
  //     S1 → shotIndex=0 → 间隔 1→2 ✅
  //     S2 → shotIndex=1 → 间隔 2→3 ✅
  //     S3 → shotIndex=2 → 间隔 3→4 ✅
  //     S4 → shotIndex=3 → 间隔 4→5 ❌ 不该用 +100
  //
  //   等等！我搞混了！
  //
  //   S4 的 currentIntervalMs 是"从第 3 发到第 4 发的间隔" = 间隔 3→4，
  //   而不是"从第 4 发到第 5 发的间隔"！
  //
  //   因为：S4 是"第 4 发即将打出"的状态，
  //        它的 currentIntervalMs 是"进入 S4 时等待的时间"，
  //        即"从上一发（第 3 发）到当前（第 4 发）"的间隔 = 间隔 3→4。
  //
  //   所以：
  //     S1（shotIndex=0）→ 间隔 "第 0 发之后" → 无意义（被 isFirstShot 修正为 0）
  //     S2（shotIndex=1）→ 间隔 "第 1 发之后" → 间隔 1→2
  //     S3（shotIndex=2）→ 间隔 "第 2 发之后" → 间隔 2→3
  //     S4（shotIndex=3）→ 间隔 "第 3 发之后" → 间隔 3→4
  //     S5（shotIndex=4）→ 间隔 "第 4 发之后" → 间隔 4→5
  //
  //   "第 K 个间隔" = 间隔 K→(K+1) = "第 K 发之后的间隔"
  //   对应 shotIndex = K
  //
  //   "前 3 个间隔" = K ∈ {1, 2, 3} → shotIndex ∈ {1, 2, 3}
  //
  //   哇，这是关键！shotIndex 从 1 开始对应"第 1 个间隔"，不是从 0！
  //   shotIndex = 0 对应"第 0 个间隔"（不存在）。
  //
  //   所以判断条件应该是：shotIndex >= 1 && shotIndex <= untilShot
  //
  //   简化：shotIndex <= untilShot，且 shotIndex >= 1。
  //   但 shotIndex = 0 时 isFirstShot = true，expectedTime 会被强制为 0，
  //   所以 shotIndex = 0 时用什么 rof 都无所谓。
  //
  //   所以等价于：shotIndex <= untilShot。
  //
  //   验证：
  //     shotIndex = 0 → 0 <= 3 ✓ +100（第 0 个间隔，被忽略）
  //     shotIndex = 1 → 1 <= 3 ✓ +100（第 1 个间隔）✅
  //     shotIndex = 2 → 2 <= 3 ✓ +100（第 2 个间隔）✅
  //     shotIndex = 3 → 3 <= 3 ✓ +100（第 3 个间隔）✅
  //     shotIndex = 4 → 4 <= 3 ✗ +0  （第 4 个间隔）✅
  //
  //   正确！
  // ============================================================
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

function calcDamage({
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

function applyBurstBias(lastPart, biasStrength = 0.7) {
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

function calcDecay(distance, ranges, decays) {
  if (distance < ranges[0]) return decays[0]
  if (distance < ranges[1]) return decays[1]
  if (distance < ranges[2]) return decays[2]
  if (distance < ranges[3]) return decays[3]
  return decays[4]
}