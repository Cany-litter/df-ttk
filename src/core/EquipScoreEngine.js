// src/core/EquipScoreEngine.js
//
// 综合评分引擎
//
// 职责：
// - 对每个武器配置 × 每套装备，算"综合评分"（含开镜权重）
// - 多套装备等权平均 → 最终评分
// - 所有配置排序 → 分档 A/B/C/D
//
// ⭐ 评分算法（两层加权）：
//
//   第一层（单套装备内）：
//     对第 i 套装备：
//       avgTTK_i = Σ_d ( ttk_i(d) × w(d) ) / Σ_d w(d)
//       其中 w(d) = 1.5 - (d / maxDist) * 1.0    // 0m→1.5，100m→0.5
//
//       score_i = avgTTK_i + aimWeight × aimSpeed_i
//       其中 aimSpeed_i 是该配置的开镜时间（ms）
//            aimWeight 来自 baseParams.aimWeight（默认 0.4）
//
//   第二层（多套装备之间，等权平均）：
//     综合评分 = Σ_i score_i / N
//
// ⭐ 分档规则（v8：分位数法）：
//   把所有有效评分排序，按位置切 4 段：
//     前 25% → A
//     25%~50% → B
//     50%~75% → C
//     后 25% → D
//
//   ⭐ 为什么用分位数而不是线性 t？
//     - 线性 t 在配置数少时分布不均（比如 3 个配置）
//     - 分位数保证每档数量接近 25%（更符合"相对优劣"直觉）
//
// ⭐ v9 改动（修复 v8 的分档 bug）：
//   - computeScores 新增 skipGrades 参数
//     · skipGrades = false（默认）：返回 { key: { score, grade } }（已分档）
//     · skipGrades = true：返回 { key: number }（未分档的原始评分）
//   - computeScoresForWeapon 调用 computeScores 时传 skipGrades: true
//     · 拿到 rawScores（{ key: number }）
//     · 有 globalRange → 用 _applyGradesWithGlobalRange 分档
//     · 无 globalRange → 用 _applyGrades 做"当前武器相对分档"
//
//   ⚠️ v8 的 bug：
//     computeScoresForWeapon 把 computeScores 的返回值（已分档的 { key: {score, grade} }）
//     当作 rawScores 传给 _applyGradesWithGlobalRange，
//     导致 _applyGradesWithGlobalRange 里 `s` 是对象，isFinite(s) 为 false，
//     全部归 D 档，且 result[k].score 是对象，最终 WeaponTable 渲染时崩溃。
//
// ⭐ v8 已有：
//   - 问题 3 / 15：新增 _applyGradesWithGlobalRange，单武器分档与全量对齐
//   - 问题 4：computeScoresForWeapon 返回结构变化（带 empty / reason）
//   - 问题 7：constructor 加 dataManager 校验
//   - 问题 9：分档改为分位数法
//   - 问题 10：非法 weaponId 检查
//   - 问题 11：meta 用 v2 精简版
//
// ⭐ v6.1 已有：
//   - totalSteps 精确计算（进度条）
// ⭐ v6.2 已有：
//   - onProgress 前检查 signal.cancelled
// ⭐ v6.3 已有：
//   - 单套评分加上 aimWeight × aimSpeed
//
// ⭐ 依赖：
// - TTKCalculator：computeSingleTTK / getKeyDistances / interpolateKeyPoints
//                 / buildArmedWeapons / computeDistanceWeightedAvg
// - EquipScoreCache：makeScoreCacheId / makeScoreScenarioHash
//                   / getScoreEntry / ScoreCacheScheduler / makeScoreCacheMeta

import {
  computeSingleTTK,
  getKeyDistances,
  interpolateKeyPoints,
  buildArmedWeapons,
  computeDistanceWeightedAvg,
} from './TTKCalculator.js'

import {
  makeScoreCacheId,
  makeScoreScenarioHash,
  getScoreEntry,
  ScoreCacheScheduler,
  makeScoreCacheMeta,
} from './EquipScoreCache.js'

// ============================================================
// 常量
// ============================================================

/** 默认最大距离 */
const DEFAULT_MAX_DISTANCE = 100

/** 默认开镜权重（与 paramsStore 的 DEFAULT_PARAMS.aimWeight 一致） */
const DEFAULT_AIM_WEIGHT = 0.4

/** 分位数阈值（v8：用分位数代替线性 t） */
const GRADE_QUANTILES = [0.25, 0.50, 0.75]

/** 让出主线程的节奏（每算 N 个关键点 await 一次） */
const YIELD_EVERY_N_POINTS = 50

// ============================================================
// 评分引擎
// ============================================================

export class EquipScoreEngine {
  constructor(dataManager) {
    // ⭐ v8：问题 7 - dataManager 校验
    if (!dataManager) {
      throw new Error('EquipScoreEngine: dataManager 不能为空')
    }
    this.dm = dataManager
  }

  /**
   * 计算综合评分（全量：所有 configs × equips）
   *
   * ⭐ v9：新增 skipGrades 参数
   *
   * @param {Object} options
   * @param {Array} options.configs - 启用的配置
   * @param {Array} options.equips - selectedEquips
   * @param {Object} options.baseParams - paramsStore.state（含 aimWeight）
   * @param {Array<number>} options.distances - 全量距离
   * @param {Function} [options.onProgress] - (current, total) => void
   * @param {Object} [options.signal] - { cancelled: boolean }
   * @param {boolean} [options.skipGrades=false] - ⭐ v9：是否跳过分档
   *   - false（默认）：返回 { "weaponId_configId": { score, grade } }
   *   - true：返回 { "weaponId_configId": number }（未分档的原始评分）
   * @returns {Promise<Object>}
   */
  async computeScores({
    configs,
    equips,
    baseParams,
    distances,
    onProgress,
    signal,
    skipGrades = false,   // ⭐ v9
  }) {
    // ---------- 0. 边界处理 ----------
    if (!Array.isArray(configs) || configs.length === 0) {
      return {}
    }
    if (!Array.isArray(equips) || equips.length === 0) {
      return {}
    }

    const fullDistances = Array.isArray(distances) && distances.length > 0
      ? distances
      : Array.from({ length: 101 }, (_, i) => i)

    const maxDistance = fullDistances[fullDistances.length - 1] || DEFAULT_MAX_DISTANCE

    const aimWeight = (typeof baseParams.aimWeight === 'number')
      ? baseParams.aimWeight
      : DEFAULT_AIM_WEIGHT

    // ---------- 1. 场景哈希 ----------
    const scenarioHash = makeScoreScenarioHash({
      hitRateMap: baseParams.hitRateMap || [],
      hitProb: baseParams.hitProb || { head: 0.1, chest: 0.3, stomach: 0.3, limbs: 0.3 },
      triggerDelayEnable: baseParams.triggerDelayEnable !== false,
      healthValue: baseParams.healthValue ?? 100,
    })

    // ---------- 2. 武装武器 ----------
    const { armed, attachments } = buildArmedWeapons(configs, this.dm)

    if (armed.length === 0) {
      console.warn('⚠️ EquipScoreEngine: buildArmedWeapons 返回空')
      return {}
    }

    // ---------- 3. 预计算 keyDistances + totalSteps ----------
    const keyDistancesCache = []
    const rawConfigCache = []
    let totalSteps = 0

    for (let ci = 0; ci < armed.length; ci++) {
      const weapon = armed[ci]
      const configId = weapon._configId || '#1'
      const price = this.dm.getPriceByWeaponId(weapon.id)
      const rawConfig = price?.configs.find(c => c.id === configId)
      const keyDistances = getKeyDistances(weapon, rawConfig, maxDistance)

      keyDistancesCache.push(keyDistances)
      rawConfigCache.push(rawConfig)
      totalSteps += keyDistances.length * equips.length
    }

    console.log(`📊 EquipScoreEngine: totalSteps=${totalSteps} (${armed.length} configs × ${equips.length} equips, aimWeight=${aimWeight})`)

    let currentStep = 0

    // ---------- 4. 缓存调度器 ----------
    const scheduler = new ScoreCacheScheduler()

    // ---------- 5. 主循环 ----------
    const rawScores = {}

    for (let ci = 0; ci < armed.length; ci++) {
      if (signal?.cancelled) break

      const weapon = armed[ci]
      const attachment = attachments[ci] || {}
      const configId = weapon._configId || '#1'
      const weaponId = weapon.id
      const scoreKey = `${weaponId}_${configId}`

      const keyDistances = keyDistancesCache[ci] || []
      const rawConfig = rawConfigCache[ci] || null

      const aimSpeed = (rawConfig && typeof rawConfig.aimSpeed === 'number')
        ? rawConfig.aimSpeed
        : 0

      // ---------- 解析子弹 ----------
      const bulletId = this._resolveBulletId(weapon, attachment, baseParams)
      if (!bulletId) {
        console.warn(`⚠️ EquipScoreEngine: 配置 ${scoreKey} 未匹配子弹，跳过`)
        rawScores[scoreKey] = Infinity
        currentStep += keyDistances.length * equips.length
        if (onProgress && !signal?.cancelled) {
          onProgress(currentStep, totalSteps)
        }
        continue
      }

      const bulletData = this.dm.getBulletById(bulletId)
      if (!bulletData) {
        console.warn(`⚠️ EquipScoreEngine: 子弹 ${bulletId} 不存在，跳过 ${scoreKey}`)
        rawScores[scoreKey] = Infinity
        currentStep += keyDistances.length * equips.length
        if (onProgress && !signal?.cancelled) {
          onProgress(currentStep, totalSteps)
        }
        continue
      }

      // ---------- 对每套装备算单套评分 ----------
      const perEquipScores = []

      for (let ei = 0; ei < equips.length; ei++) {
        if (signal?.cancelled) break

        const equip = equips[ei]

        const keyPoints = []

        for (const d of keyDistances) {
          if (signal?.cancelled) break

          const ttkResult = await this._computeKeyPointTTK({
            weapon,
            weaponId,
            configId,
            bulletId,
            bulletData,
            equip,
            distance: d,
            attachment,
            baseParams,
            scenarioHash,
            scheduler,
          })

          if (ttkResult) {
            keyPoints.push({ d, ttk: ttkResult.ttk, shots: ttkResult.shots })
          }

          currentStep++

          if (
            onProgress &&
            currentStep % YIELD_EVERY_N_POINTS === 0 &&
            !signal?.cancelled
          ) {
            onProgress(currentStep, totalSteps)
            await new Promise(resolve => setTimeout(resolve, 0))
          }
        }

        if (keyPoints.length === 0) {
          perEquipScores.push(Infinity)
          continue
        }

        const interpolated = interpolateKeyPoints(keyPoints, fullDistances)
        const times = interpolated.map(p => p.ttk)

        const avgTTK = computeDistanceWeightedAvg(times, fullDistances)

        const score = (isFinite(avgTTK) && avgTTK > 0)
          ? avgTTK + aimWeight * aimSpeed
          : Infinity

        perEquipScores.push(score)
      }

      // ---------- 多套装备等权平均 ----------
      const validScores = perEquipScores.filter(s => isFinite(s) && s > 0)
      if (validScores.length === 0) {
        rawScores[scoreKey] = Infinity
      } else {
        rawScores[scoreKey] = validScores.reduce((a, b) => a + b, 0) / validScores.length
      }
    }

    // ---------- 6. flush 缓存 ----------
    await scheduler.flush()

    // ---------- 7. 缓存统计（v8：可观测）----------
    const cacheStats = scheduler.getStats()
    if (cacheStats.failed > 0) {
      console.warn(
        `⚠️ 评分缓存：加入 ${cacheStats.added}，成功 ${cacheStats.flushed}，失败 ${cacheStats.failed}`
      )
    }

    if (signal?.cancelled) {
      console.log('ℹ️ EquipScoreEngine: 用户取消，返回当前已算结果')
      // ⭐ v9：取消时也尊重 skipGrades
      return skipGrades ? rawScores : this._applyGrades(rawScores)
    }

    // ---------- 8. 进度收尾 ----------
    if (onProgress && !signal?.cancelled) {
      onProgress(totalSteps, totalSteps)
    }

    // ---------- 9. 分档 ----------
    // ⭐ v9：skipGrades = true 时返回原始 { key: number }
    if (skipGrades) {
      return rawScores
    }
    return this._applyGrades(rawScores)
  }

  /**
   * 只计算单把武器的评分
   *
   * ⭐ v9 改动：
   *   - 调用 computeScores 时传 skipGrades: true，拿到原始 { key: number }
   *   - 无 globalRange 时正确退回"当前武器相对分档"（用 _applyGrades）
   *   - 修掉了 v8 里"把已分档结果当 rawScores 用"的 bug
   *
   * ⭐ v8 已有：
   *   - 问题 4：返回结构变化：{ scores, empty, reason }
   *   - 问题 3 / 15：接受 globalRange，用全局 min/max 分档
   *   - 问题 10：非法 weaponId 检查
   *
   * @param {Object} options
   * @param {number|string} options.weaponId
   * @param {Array} options.configs
   * @param {Array} options.equips
   * @param {Object} options.baseParams
   * @param {Array<number>} options.distances
   * @param {Object} [options.globalRange] - { min, max } 全局分档范围
   * @param {Function} [options.onProgress]
   * @param {Object} [options.signal]
   * @returns {Promise<Object>} { scores: {...}, empty?: boolean, reason?: string }
   */
  async computeScoresForWeapon({
    weaponId,
    configs,
    equips,
    baseParams,
    distances,
    globalRange = null,
    onProgress,
    signal,
  }) {
    // ⭐ v8：问题 10 - 非法 weaponId 检查
    const targetId = typeof weaponId === 'string' ? parseInt(weaponId, 10) : weaponId
    if (!weaponId || isNaN(targetId)) {
      console.warn(`⚠️ computeScoresForWeapon: 非法 weaponId "${weaponId}"`)
      return { scores: {}, empty: true, reason: 'invalid_weapon_id' }
    }

    // ⭐ v8：问题 4 - 空装备反馈
    if (!Array.isArray(equips) || equips.length === 0) {
      return { scores: {}, empty: true, reason: 'no_equips' }
    }

    // 过滤出该武器的配置
    const weaponConfigs = (configs || []).filter(c => {
      const cid = typeof c._weaponId === 'string' ? parseInt(c._weaponId, 10) : c._weaponId
      return cid === targetId
    })

    // ⭐ v8：问题 4 - 无配置反馈
    if (weaponConfigs.length === 0) {
      console.warn(`⚠️ computeScoresForWeapon: 武器 ${weaponId} 没有启用的配置`)
      return { scores: {}, empty: true, reason: 'no_configs' }
    }

    console.log(`📊 computeScoresForWeapon: 武器 ${weaponId}, ${weaponConfigs.length} 个配置`)

    // ⭐ v9：复用 computeScores 的计算逻辑，但不分档
    const rawScores = await this.computeScores({
      configs: weaponConfigs,
      equips,
      baseParams,
      distances,
      onProgress,
      signal,
      skipGrades: true,   // ⭐ 关键：拿到原始 { key: number }
    })

    // ⭐ v8：如果提供了 globalRange，用全局范围重新分档
    if (globalRange && isFinite(globalRange.min) && isFinite(globalRange.max)) {
      const scores = this._applyGradesWithGlobalRange(
        rawScores,
        globalRange.min,
        globalRange.max
      )
      return { scores, empty: false }
    }

    // ⭐ v9：退回相对分档（用当前武器的 rawScores 做分位数分档）
    return { scores: this._applyGrades(rawScores), empty: false }
  }

  // ============================================================
  // 内部：算单个关键点的 TTK（带缓存）
  // ============================================================

  async _computeKeyPointTTK({
    weapon,
    weaponId,
    configId,
    bulletId,
    bulletData,
    equip,
    distance,
    attachment,
    baseParams,
    scenarioHash,
    scheduler,
  }) {
    // ---------- 1. 缓存 key ----------
    const cacheId = makeScoreCacheId({
      weaponId,
      configId,
      bulletId,
      equip,
      distance,
      scenarioHash,
    })

    // ---------- 2. 查缓存 ----------
    try {
      const cached = await getScoreEntry(cacheId)
      if (cached && isFinite(cached.ttk)) {
        return {
          ttk: cached.ttk,
          shots: cached.shots || 0,
          hits: cached.hits || 0,
        }
      }
    } catch (e) {
      console.warn('⚠️ EquipScoreEngine: 读缓存失败', cacheId, e)
    }

    // ---------- 3. 未命中 → 算 DP ----------
    const paramsWithEquip = {
      ...baseParams,
      distance,
      armorLevel: equip.armorLevel,
      armorValue: equip.armorValue,
      helmetLevel: equip.helmetLevel,
      helmetValue: equip.helmetValue,
    }

    const result = await computeSingleTTK(
      weapon,
      attachment,
      paramsWithEquip,
      this.dm
    )

    if (!result) return null

    // ---------- 4. 写缓存（v8：用精简 meta）----------
    const meta = makeScoreCacheMeta({
      weaponMeta: {
        weaponId,
        configId,
      },
      bulletMeta: {
        bulletId,
      },
      equip,
      distance,
      scenarioHash,
    })

    scheduler.add({
      id: cacheId,
      ttk: result.ttk,
      shots: result.shots,
      hits: result.hits,
      meta,
    })

    return result
  }

  // ============================================================
  // 内部：解析子弹 ID
  // ============================================================

  _resolveBulletId(weapon, attachment, baseParams) {
    if (attachment.bulletType) return attachment.bulletType

    const caliber = weapon.allowedBullet
    if (!caliber) return null

    const bullet = this.dm.getBulletByCaliberAndLevel(caliber, baseParams.bulletLevel)
    return bullet ? bullet.id : null
  }

  // ============================================================
  // 内部：分档
  // ============================================================

  /**
   * 分档（v8：分位数法）
   *
   * 把所有有效评分排序，按位置切成 4 段：
   *   前 25% → A
   *   25%~50% → B
   *   50%~75% → C
   *   后 25% → D
   *
   * @param {Object} rawScores - { key: number }
   * @returns {Object} { key: { score, grade } }
   */
  _applyGrades(rawScores) {
    const keys = Object.keys(rawScores)
    if (keys.length === 0) return {}

    // 分离有效 / 无效（Infinity / NaN / 非正数）
    const validEntries = []
    const invalidKeys = []
    for (const k of keys) {
      const s = rawScores[k]
      if (isFinite(s) && s > 0) {
        validEntries.push({ key: k, score: s })
      } else {
        invalidKeys.push(k)
      }
    }

    const result = {}

    // 无效的归 D
    for (const k of invalidKeys) {
      result[k] = { score: rawScores[k], grade: 'D' }
    }

    if (validEntries.length === 0) return result

    // 按分数升序（越小越好）
    validEntries.sort((a, b) => a.score - b.score)

    // 计算分位边界
    const n = validEntries.length
    const q1 = Math.floor(n * GRADE_QUANTILES[0])
    const q2 = Math.floor(n * GRADE_QUANTILES[1])
    const q3 = Math.floor(n * GRADE_QUANTILES[2])

    // 逐条赋档
    for (let i = 0; i < n; i++) {
      const { key, score } = validEntries[i]
      let grade

      if (n === 1) {
        // 只有 1 条 → A
        grade = 'A'
      } else if (i < q1) {
        grade = 'A'
      } else if (i < q2) {
        grade = 'B'
      } else if (i < q3) {
        grade = 'C'
      } else {
        grade = 'D'
      }

      result[key] = { score, grade }
    }

    return result
  }

  /**
   * ⭐ v8：用全局 min/max 重新分档
   *
   * 用于"单武器更新评分"时，与全量分档对齐。
   *
   * 注意：这里用线性 t（因为要对齐全量的"全局 min/max"语义），
   *      而不是分位数法（分位数需要知道全量分布）。
   *
   * 结果：score 落在 [min, max] 的哪个位置
   *   t < 0.25 → A
   *   t < 0.50 → B
   *   t < 0.75 → C
   *   else     → D
   *
   * ⚠️ v9 注意：调用方必须传 { key: number }（未分档的 rawScores），
   *   不能传 { key: { score, grade } }。
   *
   * @param {Object} rawScores - { key: number }
   * @param {number} globalMin
   * @param {number} globalMax
   * @returns {Object} { key: { score, grade } }
   */
  _applyGradesWithGlobalRange(rawScores, globalMin, globalMax) {
    const keys = Object.keys(rawScores)
    if (keys.length === 0) return {}

    const range = globalMax - globalMin
    const result = {}

    for (const k of keys) {
      const s = rawScores[k]

      // ⭐ v9：s 现在一定是 number（因为调用方传的是 skipGrades: true 的结果）
      //   但保留防御性检查，避免将来误用
      if (typeof s !== 'number' || !isFinite(s) || s <= 0) {
        result[k] = { score: s, grade: 'D' }
        continue
      }

      if (range <= 0) {
        // 全局只有一个值 → A
        result[k] = { score: s, grade: 'A' }
        continue
      }

      const t = (s - globalMin) / range

      let grade
      if (t < GRADE_QUANTILES[0]) grade = 'A'
      else if (t < GRADE_QUANTILES[1]) grade = 'B'
      else if (t < GRADE_QUANTILES[2]) grade = 'C'
      else grade = 'D'

      result[k] = { score: s, grade }
    }

    return result
  }

  /**
   * ⭐ v8：从一组 scores 中提取全局 min/max
   *
   * 用于全量计算后，把 min/max 存到 appStore，
   * 单武器重算时用同一对 min/max 分档。
   *
   * @param {Object} scores - { key: { score, grade } }
   * @returns {Object} { min, max }
   */
  static extractGlobalRange(scores) {
    if (!scores || typeof scores !== 'object') {
      return { min: 0, max: 0 }
    }

    let min = Infinity
    let max = -Infinity
    for (const k of Object.keys(scores)) {
      const s = scores[k]?.score
      if (isFinite(s) && s > 0) {
        if (s < min) min = s
        if (s > max) max = s
      }
    }

    if (!isFinite(min) || !isFinite(max)) {
      return { min: 0, max: 0 }
    }

    return { min, max }
  }
}

// ============================================================
// 导出单例
// ============================================================

let _instance = null

export function getEquipScoreEngine(dataManager) {
  if (!_instance) {
    _instance = new EquipScoreEngine(dataManager)
  }
  return _instance
}

export default EquipScoreEngine