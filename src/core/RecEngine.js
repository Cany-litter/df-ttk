// src/core/RecEngine.js
//
// 配装推荐引擎（矩阵驱动）
//
// 职责：
// 1. 枚举攻击侧（武器配置 × 子弹等级）
// 2. 枚举防御侧（护甲 × 头盔）
// 3. 准备敌人（含 _enemyArmed）
// 4. 调 computeTTKMatrix 预计算矩阵（增量，走 IndexedDB）
// 5. 从 IndexedDB 读回，组合 + 排序 + 去重
// 6. 记录日志 + 导出
//
// 关键变化（相比旧版）：
// - 不再用 computeKeyPoints（已删除）
// - 不再用 ttkCache（已删除）
// - 改用 TTKMatrix + IndexedDB
// - 攻击侧/防御侧 TTK 都是精确值（DP，< 0.01% 误差）
//
// ⭐ 场景哈希（_makeScenarioHash）：
//   必须与 TTKMatrix.makeScenarioHash 保持完全一致。
//   任何一处改动（字段、顺序、版本号）都要同步另一处。
//
//   v1 → v2：同步 TTKMatrix.MATRIX_VERSION = 2
//           （修复 DP 连发间隔重复计算 bug）
//   v2 → v3：同步 TTKMatrix.MATRIX_VERSION = 3
//           （修复 DP 分段射速边界 bug）
//
// ⭐ 去重规则（v2 新增）：
//   同一武器配置（weaponId + configId）只保留一条，取胜率最高的。
//   防御侧（护甲/头盔）不参与去重 —— 保留胜率最高的甲头组合。
//
//   目的：避免 Top 10 被同一把武器的不同甲头组合刷屏。
//
// ⭐ 评分：单敌人胜率（v3 重构）
//
//   旧逻辑：ratio = defenseTTK / attackTTK，取 min
//           → "最差情况"主导，容易被单个短板拖垮
//
//   新逻辑：
//     1. 对每个敌人算胜率（Logistic 曲线）：
//          winRate_i = 1 / (1 + exp(-(defenseTTK - attackTTK) / K))
//        K 控制曲线陡峭程度（默认 100ms）
//
//     2. 综合胜率 = 所有敌人胜率的聚合
//          支持 avg / min / geo / harmonic（默认 avg）
//
//   排序：按综合胜率降序
//
// ⭐ 输出结构（v4 扩展）：
//   - rest 从 slice(3, 10) → slice(3, 30)，支持"加载更多到 Top 30"
//   - gear.bullet / gear.armor / gear.helmet 输出 id（供"添加为假想敌"用）
//
// ⭐ 成本口径（两个指标）：
//   1. 单局消耗（cost.total）：
//        枪价 × (1 - 撤离率) + 子弹消耗
//        —— 打一局平均亏多少
//
//   2. 总价（cost.gearTotal）：
//        枪价 + 甲价 + 头价 + 子弹成本
//        —— 买齐这套要花多少
//
//     其中 子弹成本 = 子弹单价 × 携带数量
//          携带数量 = (KD × 5 × avgShots + extraCost) × 2

import { computeTTKMatrix, queryAttackTTK, queryDefenseTTK } from './FastTTK.js'
import { calculateCurrentValues } from '../utils/weaponCalc.js'

// ============================================================
// 评分参数
// ============================================================

/**
 * 胜率曲线的陡峭程度（ms）
 *
 *   K 越小 → 曲线越陡 → 微小时间差导致胜率大幅变化
 *   K 越大 → 曲线越平 → 胜率对时间差不敏感
 *
 * 默认 100ms：
 *   时间差 +100ms → 胜率 ~73%
 *   时间差 +200ms → 胜率 ~88%
 *   时间差 +400ms → 胜率 ~98%
 */
const WIN_RATE_K = 100

/**
 * 综合胜率的聚合方式
 *
 *   'avg'      → 算术平均（推荐）
 *   'min'      → 最小值（保守）
 *   'geo'      → 几何平均
 *   'harmonic' → 调和平均
 */
const WIN_RATE_AGG_METHOD = 'avg'

// ============================================================
// 评分工具
// ============================================================

/**
 * 单敌人胜率（Logistic 曲线）
 *
 *   diff = defenseTTK - attackTTK
 *     正数 → 我方击杀更快 → 胜率 > 50%
 *     负数 → 敌方击杀更快 → 胜率 < 50%
 *
 * @param {number} attackTTK  - 我方击杀敌人的时间（ms）
 * @param {number} defenseTTK - 敌人击杀我方的时间（ms）
 * @param {number} K          - 曲线陡峭度（ms）
 * @returns {number} 胜率 [0, 1]
 */
function calcWinRate(attackTTK, defenseTTK, K = WIN_RATE_K) {
  if (!isFinite(attackTTK) || !isFinite(defenseTTK)) return 0.5
  if (attackTTK <= 0 || defenseTTK <= 0) return 0.5

  const diff = defenseTTK - attackTTK
  return 1 / (1 + Math.exp(-diff / K))
}

/**
 * 综合胜率（多个敌人胜率的聚合）
 *
 * @param {Array<number>} rates
 * @param {string} method - 'avg' | 'min' | 'geo' | 'harmonic'
 * @returns {number}
 */
function aggregateWinRates(rates, method = WIN_RATE_AGG_METHOD) {
  if (!Array.isArray(rates) || rates.length === 0) return 0

  switch (method) {
    case 'min':
      return Math.min(...rates)

    case 'geo':
      return Math.pow(
        rates.reduce((a, b) => a * b, 1),
        1 / rates.length
      )

    case 'harmonic': {
      const denom = rates.reduce((s, r) => s + 1 / Math.max(r, 0.001), 0)
      return rates.length / denom
    }

    case 'avg':
    default:
      return rates.reduce((a, b) => a + b, 0) / rates.length
  }
}

// ============================================================
// RecEngine
// ============================================================

export class RecEngine {
  /**
   * @param {DataManager} dataManager
   */
  constructor(dataManager) {
    this.dm = dataManager
  }

  // ============================================================
  // 1. 主入口
  // ============================================================

  /**
   * 执行推荐
   *
   * @param {Object} input - {
   *   budget: number,        // 采购成本上限（万）
   *   enemies: Array,        // 1~3 个假想敌
   *   params: Object,        // 全局参数
   *   kdRatio: number,       // KD（默认 1.0）
   *   extraCost: number,     // 其他消耗发数（默认 30）
   * }
   * @param {Object} options - {
   *   recordLog: boolean,
   *   onProgress: Function,
   *   signal: { cancelled: boolean },
   * }
   * @returns {Promise<Object>} { recommendations, log }
   */
  async recommend(input, options = {}) {
    const t0 = performance.now()

    const log = this._createLog(input, options)
    const budgetW = input.budget || 100

    try {
      // ============================================================
      // 阶段 1：枚举
      // ============================================================
      if (options.onProgress) options.onProgress(0, 1, 'enumerating')

      const attacks = this._buildAttackSide()
      const defenses = this._buildDefenseSide()
      const enemies = this._prepareEnemies(input.enemies)

      log.enumeration = {
        attackCount: attacks.length,
        defenseCount: defenses.length,
        enemyCount: enemies.length
      }

      console.log(`📋 枚举完成: 攻击侧 ${attacks.length} 个, 防御侧 ${defenses.length} 个, 假想敌 ${enemies.length} 个`)

      // ============================================================
      // 阶段 2：矩阵预计算（增量，走 IndexedDB）
      // ============================================================
      const scenario = {
        hitRateMap: input.params?.hitRateMap || [],
        hitProb: input.params?.hitProb || { head: 0.1, chest: 0.3, stomach: 0.3, limbs: 0.3 },
        triggerDelayEnable: input.params?.triggerDelayEnable !== false,
        healthValue: input.params?.healthValue ?? 100,
      }

      const matrixResult = await computeTTKMatrix({
        attacks,
        defenses,
        enemies,
        scenario,
        dataManager: this.dm,
        onProgress: (phase, current, total) => {
          if (options.onProgress) {
            options.onProgress(current, total, phase)
          }
        },
        signal: options.signal,
      })

      log.matrix = matrixResult

      if (options.signal?.cancelled) {
        throw new Error('用户取消')
      }

      console.log(`✅ 矩阵预计算完成: 攻击侧 ${matrixResult.attackCount}, 防御侧 ${matrixResult.defenseCount}, 命中 ${matrixResult.fromCache}, 新算 ${matrixResult.computed}, 耗时 ${matrixResult.timeMs}ms`)

      // ============================================================
      // 阶段 3：组合推荐（从 IndexedDB 读）
      // ============================================================
      const recommendations = await this._buildRecommendationsFromMatrix(
        attacks,
        defenses,
        enemies,
        scenario,
        budgetW,
        input,
        log,
        options
      )

      // ============================================================
      // 收尾
      // ============================================================
      log.totalTimeMs = Math.round(performance.now() - t0)
      log.completedAt = new Date().toISOString()

      console.log(`✅ 推荐完成: ${log.totalTimeMs}ms, Top ${recommendations.topN.length} + ${recommendations.rest.length}`)

      return { recommendations, log }

    } catch (error) {
      log.totalTimeMs = Math.round(performance.now() - t0)
      log.error = error.message
      console.error('❌ 推荐失败:', error)
      throw error
    }
  }

  // ============================================================
  // 2. 枚举攻击侧
  // ============================================================

  /**
   * 构建攻击侧列表
   *
   * 每条攻击侧 = 一个 (武器配置, 子弹等级) 组合
   *
   * @returns {Array} [{
   *   weaponId, configId, bulletId, bullet,
   *   weapon, config,
   *   _armed,        // 应用附件后的武器对象（含 _current）
   *   _attachment,   // 附件信息
   *   _price,        // 配置价格
   *   meta: { weaponId, weaponName, configId, buildCode, bulletId, bulletName, bulletLevel, bulletPrice }
   * }]
   */
  _buildAttackSide() {
    const attacks = []
    const weapons = this.dm.getWeapons()

    for (const weapon of weapons) {
      const price = this.dm.getPriceByWeaponId(weapon.id)
      if (!price) continue

      for (const config of price.configs) {
        // 只枚举 enabled
        if (config.enabled === false) continue

        // 解析附件
        const barrelId = config.barrelId ?? -1
        const muzzleId = config.muzzleId ?? 0
        const precision = config.precision ?? 0.09

        // 应用附件后的武器（用于计算）
        let barrel = null
        if (barrelId >= 0 && weapon.barrels && weapon.barrels[barrelId]) {
          barrel = weapon.barrels[barrelId]
        }
        const current = calculateCurrentValues(weapon, barrel, muzzleId, precision)
        const armedWeapon = {
          ...weapon,
          ...current,
          _current: current,
          _displayName: `${weapon.name} ${config.id}`.trim(),
          _configId: config.id || '#1',
        }

        // 附件信息（用于 hitRateMap）
        let hitRateMap = []
        if (config.distance && config.hitRate &&
            Array.isArray(config.distance) && Array.isArray(config.hitRate) &&
            config.distance.length > 0 && config.hitRate.length > 0) {
          const len = Math.min(config.distance.length, config.hitRate.length)
          for (let i = 0; i < len; i++) {
            hitRateMap.push({
              distance: config.distance[i],
              rate: config.hitRate[i]
            })
          }
        }

        const attachment = {
          weaponId: weapon.id,
          configId: config.id || '#1',
          barrelIndex: barrelId,
          muzzleIndex: muzzleId,
          precision,
          bulletType: config.bullet || null,
          hitRateMap,
          displayName: armedWeapon._displayName
        }

        // 枚举子弹等级 Lv.1 ~ Lv.5
        for (let level = 1; level <= 5; level++) {
          const bullet = this.dm.getBulletByCaliberAndLevel(weapon.allowedBullet, level)
          if (!bullet) continue

          attacks.push({
            weaponId: weapon.id,
            configId: config.id,
            bulletId: bullet.id,
            bullet,
            weapon,
            config,
            _armed: armedWeapon,
            _attachment: attachment,
            _price: config.price || 0,
            _hitRateMap: hitRateMap,
            meta: {
              weaponId: weapon.id,
              weaponName: weapon.name,
              configId: config.id,
              buildCode: config.buildCode || '',
              bulletId: bullet.id,
              bulletName: bullet.name,
              bulletLevel: level,
              bulletPrice: bullet.price
            }
          })
        }
      }
    }

    return attacks
  }

  // ============================================================
  // 3. 枚举防御侧
  // ============================================================

  /**
   * 构建防御侧列表（全枚举护甲 × 头盔）
   *
   * @returns {Array} [{
   *   armor, helmet,
   *   meta: { armorId, armorName, armorLevel, armorValue, armorPrice,
   *           helmetId, helmetName, helmetLevel, helmetValue, helmetPrice }
   * }]
   */
  _buildDefenseSide() {
    const defenses = []
    const armors = this.dm.getArmorsByType('armor')
    const helmets = this.dm.getArmorsByType('helmet')

    for (const armor of armors) {
      for (const helmet of helmets) {
        defenses.push({
          armor,
          helmet,
          meta: {
            armorId: armor.id,
            armorName: armor.name,
            armorLevel: armor.level,
            armorValue: armor.value,
            armorPrice: armor.price,
            helmetId: helmet.id,
            helmetName: helmet.name,
            helmetLevel: helmet.level,
            helmetValue: helmet.value,
            helmetPrice: helmet.price
          }
        })
      }
    }

    return defenses
  }

  // ============================================================
  // 4. 准备敌人
  // ============================================================

  /**
   * 准备敌人列表（含 _enemyArmed）
   *
   * 敌人的武器/子弹不受 enabled 影响（假想敌明确指定）
   *
   * @param {Array} enemyInputs - UI 输入的敌人列表
   * @returns {Array} [{ ..., _enemyArmed: { armed, bulletData, weaponKey } }]
   */
  _prepareEnemies(enemyInputs) {
    return enemyInputs.map(e => {
      const weapon = this.dm.getWeaponById(e.weaponId)
      if (!weapon) {
        console.warn(`⚠️ 敌人武器不存在: ${e.weaponId}`)
        return null
      }

      const price = this.dm.getPriceByWeaponId(e.weaponId)
      const config = price?.configs.find(c => c.id === e.configId)
      if (!config) {
        console.warn(`⚠️ 敌人配置不存在: ${e.weaponId} ${e.configId}`)
        return null
      }

      const barrelId = config.barrelId ?? -1
      const muzzleId = config.muzzleId ?? 0
      const precision = config.precision ?? 0.09

      let barrel = null
      if (barrelId >= 0 && weapon.barrels && weapon.barrels[barrelId]) {
        barrel = weapon.barrels[barrelId]
      }

      const current = calculateCurrentValues(weapon, barrel, muzzleId, precision)
      const armed = {
        ...weapon,
        ...current,
        _current: current,
        _displayName: `${weapon.name} ${config.id}`.trim(),
        _configId: config.id || '#1',
      }

      const bulletData = this.dm.getBulletById(e.bulletId)
      if (!bulletData) {
        console.warn(`⚠️ 敌人子弹不存在: ${e.bulletId}`)
        return null
      }

      // 敌人自己的命中率（可选）
      let hitRate = null
      if (config.distance && config.hitRate &&
          Array.isArray(config.distance) && Array.isArray(config.hitRate)) {
        const map = config.distance.map((d, i) => ({ distance: d, rate: config.hitRate[i] }))
        hitRate = this.dm.getHitRateFromMap(map, e.distance, 0.85)
      }

      return {
        name: e.name || '假想敌',
        weaponId: e.weaponId,
        configId: e.configId,
        bulletId: e.bulletId,
        armorLevel: e.armorLevel,
        armorValue: e.armorValue,
        helmetLevel: e.helmetLevel,
        helmetValue: e.helmetValue,
        distance: e.distance,
        hitRate,
        _enemyArmed: {
          armed,
          bulletData,
        },
      }
    }).filter(Boolean)
  }

  // ============================================================
  // 5. 组合推荐（从 IndexedDB 读）
  // ============================================================

  /**
   * 从 IndexedDB 读回矩阵，组合推荐
   */
  async _buildRecommendationsFromMatrix(
    attacks,
    defenses,
    enemies,
    scenario,
    budgetW,
    input,
    log,
    options
  ) {
    const kdRatio = input.kdRatio ?? 1.0
    const extraCost = input.extraCost ?? 30

    // 计算 scenario hash（和 TTKMatrix 里一致）
    const scenarioHash = this._makeScenarioHash(scenario)

    // ============================================================
    // 5.1 读攻击侧矩阵
    // ============================================================
    const attackMap = new Map()

    for (let ai = 0; ai < attacks.length; ai++) {
      const attack = attacks[ai]
      const perEnemy = {}

      for (const enemy of enemies) {
        const entry = await queryAttackTTK({
          weaponId: attack.weaponId,
          configId: attack.configId,
          bulletId: attack.bulletId,
          enemy,
          scenarioHash,
        })

        if (entry) {
          perEnemy[enemy.name] = {
            ttk: entry.ttk,
            shots: entry.shots,
            hits: entry.hits,
          }
        }
      }

      attackMap.set(ai, {
        meta: attack.meta,
        _price: attack._price,
        perEnemy,
      })
    }

    // ============================================================
    // 5.2 读防御侧矩阵
    // ============================================================
    const defenseMap = new Map()

    for (let di = 0; di < defenses.length; di++) {
      const defense = defenses[di]
      const perEnemy = {}

      for (const enemy of enemies) {
        const entry = await queryDefenseTTK({
          enemyWeaponId: enemy.weaponId,
          enemyConfigId: enemy.configId,
          enemyBulletId: enemy.bulletId,
          ourArmorLevel: defense.armor.level,
          ourArmorValue: defense.armor.value,
          ourHelmetLevel: defense.helmet.level,
          ourHelmetValue: defense.helmet.value,
          scenarioHash,
        })

        if (entry) {
          perEnemy[enemy.name] = {
            ttk: entry.ttk,
            shots: entry.shots,
          }
        }
      }

      defenseMap.set(di, {
        meta: defense.meta,
        perEnemy,
      })
    }

    // ============================================================
    // 5.3 预计算攻击侧成本
    // ============================================================
    const attackCosts = new Map()

    for (const [ai, attackData] of attackMap.entries()) {
      const firstEnemy = Object.values(attackData.perEnemy)[0]
      if (!firstEnemy) continue

      const avgShots = firstEnemy.shots
      const bulletPrice = attackData.meta.bulletPrice || 0

      // 子弹成本：携带数量 = (KD × 5 × avgShots + extraCost) × 2
      const avgConsumption = kdRatio * 5 * avgShots + extraCost
      const carryCount = avgConsumption * 2
      const bulletCost = Math.round(bulletPrice * carryCount)

      const gunPrice = attackData._price || 0

      attackCosts.set(ai, {
        gunPrice,
        bulletCost,
        bulletPrice,
        avgShots,
        carryCount,
        totalCost: gunPrice + bulletCost,
      })
    }

    // ============================================================
    // 5.4 预计算防御侧成本
    // ============================================================
    const defenseCosts = new Map()

    for (const [di, defenseData] of defenseMap.entries()) {
      const armorPrice = defenseData.meta.armorPrice || 0
      const helmetPrice = defenseData.meta.helmetPrice || 0
      defenseCosts.set(di, {
        armorPrice,
        helmetPrice,
        totalCost: armorPrice + helmetPrice,
      })
    }

    // ============================================================
    // 5.5 遍历所有组合
    // ============================================================
    const budgetYuan = budgetW * 10000

    const allCombos = []
    let withinBudget = 0
    let overBudget = 0

    for (const [ai, attackData] of attackMap.entries()) {
      const attackCost = attackCosts.get(ai)
      if (!attackCost) continue

      for (const [di, defenseData] of defenseMap.entries()) {
        const defenseCost = defenseCosts.get(di)
        if (!defenseCost) continue

        const totalCost = attackCost.totalCost + defenseCost.totalCost

        if (totalCost > budgetYuan) {
          overBudget++
          continue
        }

        withinBudget++

        // ============================================================
        // ⭐ 计算每个敌人的胜率 + 综合胜率
        // ============================================================
        let valid = true
        const perEnemyWinRates = {}
        const winRates = []

        for (const enemy of enemies) {
          const atk = attackData.perEnemy[enemy.name]
          const def = defenseData.perEnemy[enemy.name]

          if (!atk || !def || atk.ttk <= 0 || def.ttk <= 0) {
            valid = false
            break
          }

          const winRate = calcWinRate(atk.ttk, def.ttk)
          perEnemyWinRates[enemy.name] = winRate
          winRates.push(winRate)
        }

        if (!valid) continue

        const combinedWinRate = aggregateWinRates(winRates, WIN_RATE_AGG_METHOD)

        allCombos.push({
          attackIndex: ai,
          defenseIndex: di,
          attackMeta: attackData.meta,
          defenseMeta: defenseData.meta,
          attackPerEnemy: attackData.perEnemy,
          defensePerEnemy: defenseData.perEnemy,
          perEnemyWinRates,
          winRate: combinedWinRate,
          cost: {
            gunPrice: attackCost.gunPrice,
            bulletPrice: attackCost.bulletPrice,
            bulletCost: attackCost.bulletCost,
            carryCount: attackCost.carryCount,
            avgShots: attackCost.avgShots,
            armorPrice: defenseCost.armorPrice,
            helmetPrice: defenseCost.helmetPrice,
            total: totalCost,
          }
        })
      }
    }

    // ============================================================
    // 5.6 排序（按综合胜率降序）
    // ============================================================
    allCombos.sort((a, b) => {
      if (b.winRate !== a.winRate) return b.winRate - a.winRate
      return a.cost.total - b.cost.total
    })

    log.combinations = {
      total: attackMap.size * defenseMap.size,
      withinBudget,
      overBudget,
      winRateK: WIN_RATE_K,
      winRateAggMethod: WIN_RATE_AGG_METHOD,
    }

    console.log(`📊 组合: ${withinBudget} 预算内 / ${overBudget} 超预算`)
    console.log(`📐 评分: K=${WIN_RATE_K}ms, 聚合=${WIN_RATE_AGG_METHOD}`)

    // ============================================================
    // ⭐ 5.6.1 去重：同一武器配置只出现一次
    //
    //   - 去重键：weaponId + configId
    //   - 保留：每组第一条（即 allCombos 已按综合胜率排序后的最高胜率）
    //   - 防御侧不参与去重（保留胜率最高的甲头组合）
    // ============================================================
    const seenWeaponConfig = new Set()
    const dedupedCombos = []
    for (const combo of allCombos) {
      const key = `${combo.attackMeta.weaponId}_${combo.attackMeta.configId}`
      if (seenWeaponConfig.has(key)) continue
      seenWeaponConfig.add(key)
      dedupedCombos.push(combo)
    }

    log.combinations.deduped = dedupedCombos.length

    console.log(`🔍 去重后: ${dedupedCombos.length} 套（同一武器配置只保留一次）`)

    // ============================================================
    // 5.7 构建推荐输出
    // ============================================================
    const formatCombo = (combo, rank) => {
      // ⭐ 总价 = 枪价 + 甲价 + 头价 + 子弹成本（携带数量口径）
      const gearTotal =
        combo.cost.gunPrice +
        combo.cost.bulletCost +
        combo.cost.armorPrice +
        combo.cost.helmetPrice

      return {
        rank,
        gear: {
          weapon: {
            id: combo.attackMeta.weaponId,
            configId: combo.attackMeta.configId,
            name: combo.attackMeta.weaponName,
            price: combo.cost.gunPrice,
            buildCode: combo.attackMeta.buildCode || '',
          },
          bullet: {
            id: combo.attackMeta.bulletId,          // ⭐ 新增（供"添加为假想敌"用）
            name: combo.attackMeta.bulletName,
            level: combo.attackMeta.bulletLevel,
            price: combo.cost.bulletPrice,
            avgShots: combo.cost.avgShots,
            carryCount: combo.cost.bulletPrice > 0
              ? Math.round(combo.cost.bulletCost / combo.cost.bulletPrice)
              : 0
          },
          armor: {
            id: combo.defenseMeta.armorId,          // ⭐ 新增
            name: combo.defenseMeta.armorName,
            level: combo.defenseMeta.armorLevel,
            value: combo.defenseMeta.armorValue,
            price: combo.cost.armorPrice
          },
          helmet: {
            id: combo.defenseMeta.helmetId,         // ⭐ 新增
            name: combo.defenseMeta.helmetName,
            level: combo.defenseMeta.helmetLevel,
            value: combo.defenseMeta.helmetValue,
            price: combo.cost.helmetPrice
          }
        },
        perEnemy: enemies.map(e => ({
          name: e.name,
          attackTTK: combo.attackPerEnemy[e.name]?.ttk || 0,
          defenseTTK: combo.defensePerEnemy[e.name]?.ttk || 0,
          winRate: combo.perEnemyWinRates[e.name] || 0,
        })),
        winRate: combo.winRate,
        cost: {
          gunPrice: combo.cost.gunPrice,
          bulletCost: combo.cost.bulletCost,
          armorPrice: combo.cost.armorPrice,
          helmetPrice: combo.cost.helmetPrice,
          total: combo.cost.total,
          totalW: combo.cost.total / 10000,
          gearTotal,
          gearTotalW: gearTotal / 10000
        }
      }
    }

    // ⭐ 从 dedupedCombos 取
    //    - Top 3 → 卡片
    //    - 第 4~30 → 表格（支持"加载更多"）
    const topN = dedupedCombos.slice(0, 3).map((c, i) => formatCombo(c, i + 1))
    const rest = dedupedCombos.slice(3, 30).map((c, i) => formatCombo(c, i + 4))

    return {
      topN,
      rest,
      allCount: dedupedCombos.length
    }
  }

  // ============================================================
  // 6. 工具：场景哈希
  // ============================================================

  /**
   * 和 TTKMatrix 里保持一致
   *
   * ⚠️ 必须与 TTKMatrix.makeScenarioHash 完全一致：
   *    - 相同的字段
   *    - 相同的顺序
   *    - 相同的版本号（v3）
   *
   * v1 → v2：同步 TTKMatrix.MATRIX_VERSION = 2
   * v2 → v3：同步 TTKMatrix.MATRIX_VERSION = 3
   */
  _makeScenarioHash(scenario) {
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

    // ⭐ 矩阵版本（和 TTKMatrix.MATRIX_VERSION 保持一致）
    parts.push('v3')

    return this._simpleHash(parts.join('|'))
  }

  _simpleHash(str) {
    let h = 0
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i)
      h = h & h
    }
    return Math.abs(h).toString(36)
  }

  // ============================================================
  // 7. 工具：日志
  // ============================================================

  _createLog(input, options) {
    return {
      version: '1.0',
      startedAt: new Date().toISOString(),
      completedAt: null,
      totalTimeMs: 0,
      input: {
        budget: input.budget,
        enemies: JSON.parse(JSON.stringify(input.enemies || [])),
        kdRatio: input.kdRatio ?? 1.0,
        extraCost: input.extraCost ?? 30
      },
      enumeration: null,
      matrix: null,
      combinations: null,
      error: null
    }
  }

  // ============================================================
  // 8. 导出推荐结果
  // ============================================================

  /**
   * 导出推荐结果 + 日志为 JSON 文件
   */
  exportResult(result, input = null, options = {}) {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      input: input || result.log?.input || null,
      recommendations: result.recommendations,
      log: result.log,
    }

    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')
    const filename = options.filename || `rec_result_${timestamp}.json`

    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    console.log(`✅ 推荐结果已导出: ${filename} (${(json.length / 1024).toFixed(1)} KB)`)
  }

  /**
   * 打印推荐结果到控制台
   */
  printResult(result) {
    const { recommendations, log } = result

    console.log('\n═══════════════════════════════════════')
    console.log('🏆 配装推荐 Top 3')
    console.log('═══════════════════════════════════════')

    recommendations.topN.forEach(rec => {
      const winRatePct = (rec.winRate * 100).toFixed(1)
      console.log(`\n【#${rec.rank}】综合胜率 ${winRatePct}%  总价 ${rec.cost.gearTotalW.toFixed(1)}W`)
      console.log(`  武器: ${rec.gear.weapon.name} ${rec.gear.weapon.configId} (${(rec.gear.weapon.price / 10000).toFixed(1)}W)`)
      if (rec.gear.weapon.buildCode) {
        console.log(`        改枪码: ${rec.gear.weapon.buildCode}`)
      }
      console.log(`  子弹: ${rec.gear.bullet.name} Lv.${rec.gear.bullet.level} × ${rec.gear.bullet.carryCount} 发 (${(rec.cost.bulletCost / 10000).toFixed(1)}W)`)
      console.log(`  护甲: ${rec.gear.armor.name} Lv.${rec.gear.armor.level} (${(rec.gear.armor.price / 10000).toFixed(1)}W)`)
      console.log(`  头盔: ${rec.gear.helmet.name} Lv.${rec.gear.helmet.level} (${(rec.gear.helmet.price / 10000).toFixed(1)}W)`)
      console.log(`  对敌:`)
      rec.perEnemy.forEach(e => {
        console.log(`    vs ${e.name}: 攻 ${e.attackTTK.toFixed(0)}ms / 守 ${e.defenseTTK.toFixed(0)}ms / 胜率 ${(e.winRate * 100).toFixed(1)}%`)
      })
    })

    console.log('\n───────────────────────────────────────')
    console.log('📊 日志摘要')
    console.log('───────────────────────────────────────')
    console.log(`总耗时: ${log.totalTimeMs} ms`)
    if (log.matrix) {
      console.log(`矩阵: 攻击侧 ${log.matrix.attackCount} / 防御侧 ${log.matrix.defenseCount}`)
      console.log(`      命中 ${log.matrix.fromCache} / 新算 ${log.matrix.computed} / 耗时 ${log.matrix.timeMs}ms`)
    }
    if (log.combinations) {
      console.log(`组合: ${log.combinations.withinBudget} 预算内 / ${log.combinations.overBudget} 超预算`)
      if (log.combinations.deduped !== undefined) {
        console.log(`      去重后 ${log.combinations.deduped} 套（同一武器配置只保留一次）`)
      }
      if (log.combinations.winRateK !== undefined) {
        console.log(`      评分: K=${log.combinations.winRateK}ms, 聚合=${log.combinations.winRateAggMethod}`)
      }
    }
    console.log('═══════════════════════════════════════\n')
  }
}

// ============================================================
// 导出单例
// ============================================================

let instance = null

export function getRecEngine(dataManager) {
  if (!instance) {
    instance = new RecEngine(dataManager)
  }
  return instance
}

export default RecEngine