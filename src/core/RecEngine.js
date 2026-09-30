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
// 6. 记录日志 + 打印结果
//
// ⭐ v2 改动（死代码清理）：
//   - 删除 _makeScenarioHash 方法（纯转发，无调用）
//   - 删除 exportResult 方法（无调用）
//
// ⭐ v6 改动（维修包成本）：
//   - 新增 _getRepairPriceMap：从 data.json 的 otherItems 读维修包价格
//   - 4/5/6 级护甲/头盔配对应维修包：
//       4甲 → 标准护甲维修包
//       5甲 → 精密护甲维修包
//       6甲 → 高级护甲维修组合
//       4头 → 标准头盔维修包
//       5头 → 精密头盔维修包
//       6头 → 高级头盔维修组合
//     1~3 级不配
//   - 维修包价格计入 cost.total（影响预算过滤）
//   - 同时单独输出 cost.repairCost 供 UI 展示
//   - 名字匹配不上时静默跳过（成本 0）+ 控制台警告
//   - 按 1 个算（不做消耗分摊）
//
// ⭐ 关键变化（相比旧版）：
// - 不再用 computeKeyPoints（已删除）
// - 不再用 ttkCache（已删除）
// - 改用 TTKMatrix + IndexedDB
// - 攻击侧/防御侧 TTK 都是精确值（DP，< 0.01% 误差）
//
// ⭐ 附件解析（v6 修复）：
//   config.barrelId 可能是 -1 / undefined，但 config.barrel 有名字。
//   改用 getPriceRowsForWeapon（内部已按名字反查 barrelId）→ 保证枪管正确应用。
//
// ⭐ 去重规则（v2 新增）：
//   同一武器配置（weaponId + configId）只保留一条，取胜率最高的。
//
// ⭐ 评分：单敌人胜率（v3 重构）
//   1. 对每个敌人算胜率（Logistic 曲线）：
//        winRate_i = 1 / (1 + exp(-(defenseTTK - attackTTK) / K))
//      K 控制曲线陡峭程度（默认 100ms）
//   2. 综合胜率 = 所有敌人胜率的聚合（默认 avg）
//
// ⭐ debug 收集（v5 新增）：
//   - recommend() 返回 _debug 字段（含每个 combo 的详细输入/输出）
//   - 数据来自 TTKMatrix 的模块级 _debugMap（不持久化）

import {
  computeTTKMatrix,
  queryAttackTTK,
  queryDefenseTTK,
} from './FastTTK.js'
import {
  getDebugEntry,
  makeAttackId,
  makeDefenseId,
  makeScenarioHash,
} from './TTKMatrix.js'
import { calculateCurrentValues } from '../utils/weaponCalc.js'

// ============================================================
// 评分参数
// ============================================================

const WIN_RATE_K = 100
const WIN_RATE_AGG_METHOD = 'avg'

// ============================================================
// ⭐ v6：维修包配置
// ============================================================
//
// 4/5/6 级护甲/头盔 → 对应维修包名字（必须与 data.json 的 otherItems 里完全一致）
// 1~3 级 → null（不配维修包）
//
// 名字对照（data.json 实际值）：
//   护甲：4 → "标准护甲维修包"，5 → "精密护甲维修包"，6 → "高级护甲维修组合"
//   头盔：4 → "标准头盔维修包"，5 → "精密头盔维修包"，6 → "高级头盔维修组合"

const REPAIR_ARMOR_NAMES = {
  4: '标准护甲维修包',
  5: '精密护甲维修包',
  6: '高级护甲维修组合',
}

const REPAIR_HELMET_NAMES = {
  4: '标准头盔维修包',
  5: '精密头盔维修包',
  6: '高级头盔维修组合',
}

// ============================================================
// 评分工具
// ============================================================

function calcWinRate(attackTTK, defenseTTK, K = WIN_RATE_K) {
  if (!isFinite(attackTTK) || !isFinite(defenseTTK)) return 0.5
  if (attackTTK <= 0 || defenseTTK <= 0) return 0.5

  const diff = defenseTTK - attackTTK
  return 1 / (1 + Math.exp(-diff / K))
}

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
  constructor(dataManager) {
    this.dm = dataManager

    // ⭐ v6：维修包价格缓存（懒加载）
    // Map<"armor_4" | "helmet_6", price>
    this._repairPriceCache = null
  }

  // ============================================================
  // 0. ⭐ 辅助：查"已反查 barrelId"的配置 row
  // ============================================================

  /**
   * 用 getPriceRowsForWeapon 返回的 row（含反查后的 barrelId / muzzleId / precision）
   *
   * ⚠️ 为什么不用 price.configs.find(...)？
   *   - data.json 里 config.barrelId 可能是 -1 或 undefined
   *   - 但 config.barrel 有名字（如 "勇士海狸枪管"）
   *   - getPriceRowsForWeapon 内部会按名字反查 barrelId
   *
   * 直接 price.configs.find 会拿到 barrelId = -1 或 undefined
   * → barrel = null → 枪管 rangeMult 没应用
   *
   * @param {number} weaponId
   * @param {string} configId
   * @returns {Object|null}
   */
  _findRowForConfig(weaponId, configId) {
    const rows = this.dm.getPriceRowsForWeapon(weaponId) || []
    return rows.find(r => r.configId === configId) || null
  }

  // ============================================================
  // 0.5 ⭐ v6：维修包价格查询
  // ============================================================

  /**
   * 懒加载维修包价格表
   *
   * 从 data.json 的 otherItems 里找 category === '维修' 的项，
   * 按名字建索引。
   *
   * 只包含 enabled !== false 的项。
   *
   * @returns {Map<string, number>} 名字 → 价格
   */
  _getRepairPriceMap() {
    if (this._repairPriceCache) return this._repairPriceCache

    const map = new Map()
    const items = this.dm.getOtherItems(true) || []

    for (const item of items) {
      if (item.category !== '维修') continue
      if (item.enabled === false) continue
      if (!item.name) continue

      map.set(item.name, item.price || 0)
    }

    this._repairPriceCache = map
    return map
  }

  /**
   * 按等级取维修包价格
   *
   * @param {number} level - 护甲/头盔等级（1~6）
   * @param {'armor' | 'helmet'} type
   * @returns {number} 维修包价格（0 = 不配或找不到）
   */
  _getRepairPrice(level, type) {
    if (level !== 4 && level !== 5 && level !== 6) {
      return 0
    }

    const nameMap = type === 'armor' ? REPAIR_ARMOR_NAMES : REPAIR_HELMET_NAMES
    const targetName = nameMap[level]
    if (!targetName) return 0

    const priceMap = this._getRepairPriceMap()
    const price = priceMap.get(targetName)

    if (price === undefined) {
      // ⭐ 名字匹配不上：静默跳过 + 控制台警告
      console.warn(
        `⚠️ RecEngine: 未在 otherItems（category=维修）里找到 "${targetName}"，` +
        `${type} Lv.${level} 的维修包成本记为 0`
      )
      return 0
    }

    return price
  }

  // ============================================================
  // 1. 主入口
  // ============================================================

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

      return {
        recommendations,
        log,
        _debug: recommendations._debug,
      }

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

  _buildAttackSide() {
    const attacks = []
    const weapons = this.dm.getWeapons()

    for (const weapon of weapons) {
      const price = this.dm.getPriceByWeaponId(weapon.id)
      if (!price) continue

      for (const config of price.configs) {
        if (config.enabled === false) continue

        // ⭐ 用 getPriceRowsForWeapon 返回的 row（已反查 barrelId / muzzleId / precision）
        const row = this._findRowForConfig(weapon.id, config.id)
        if (!row) continue

        const barrelId = row.barrelId ?? -1
        const muzzleId = row.muzzleId ?? 0
        const precision = row.precision ?? 0.09

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

        // hitRateMap（从 row 里拿，跟 getPriceRowsForWeapon 一致）
        let hitRateMap = []
        if (row.distance && row.hitRate &&
            Array.isArray(row.distance) && Array.isArray(row.hitRate) &&
            row.distance.length > 0 && row.hitRate.length > 0) {
          const len = Math.min(row.distance.length, row.hitRate.length)
          for (let i = 0; i < len; i++) {
            hitRateMap.push({
              distance: row.distance[i],
              rate: row.hitRate[i]
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

  _prepareEnemies(enemyInputs) {
    return enemyInputs.map(e => {
      const weapon = this.dm.getWeaponById(e.weaponId)
      if (!weapon) {
        console.warn(`⚠️ 敌人武器不存在: ${e.weaponId}`)
        return null
      }

      // ⭐ 用 getPriceRowsForWeapon 返回的 row
      const row = this._findRowForConfig(e.weaponId, e.configId)
      if (!row) {
        console.warn(`⚠️ 敌人配置不存在: ${e.weaponId} ${e.configId}`)
        return null
      }

      const barrelId = row.barrelId ?? -1
      const muzzleId = row.muzzleId ?? 0
      const precision = row.precision ?? 0.09

      let barrel = null
      if (barrelId >= 0 && weapon.barrels && weapon.barrels[barrelId]) {
        barrel = weapon.barrels[barrelId]
      }

      const current = calculateCurrentValues(weapon, barrel, muzzleId, precision)
      const armed = {
        ...weapon,
        ...current,
        _current: current,
        _displayName: `${weapon.name} ${e.configId}`.trim(),
        _configId: e.configId || '#1',
      }

      const bulletData = this.dm.getBulletById(e.bulletId)
      if (!bulletData) {
        console.warn(`⚠️ 敌人子弹不存在: ${e.bulletId}`)
        return null
      }

      // 敌人自己的命中率（从 row 拿）
      let hitRate = null
      if (row.distance && row.hitRate &&
          Array.isArray(row.distance) && Array.isArray(row.hitRate)) {
        const map = row.distance.map((d, i) => ({ distance: d, rate: row.hitRate[i] }))
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

    const scenarioHash = makeScenarioHash(scenario)

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
    //
    // ⭐ v6：查询时必须传 distance + hitRate，与 buildDefenseMatrix 一致
    // ============================================================
    const defenseMap = new Map()

    for (let di = 0; di < defenses.length; di++) {
      const defense = defenses[di]
      const perEnemy = {}

      for (const enemy of enemies) {
        // ⭐ 防御侧命中率 = 敌人自己的命中率（与 TTKMatrix.getDefenseHitRate 一致）
        const hitRate = enemy.hitRate ?? scenario.hitRate ?? 0.85

        const entry = await queryDefenseTTK({
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
    //
    // ⭐ v6：新增维修包成本
    //   - 4/5/6 级护甲/头盔配对应维修包
    //   - 1~3 级不配
    //   - 名字匹配不上时，_getRepairPrice 返回 0（+ 控制台警告）
    // ============================================================
    const defenseCosts = new Map()

    for (const [di, defenseData] of defenseMap.entries()) {
      const armorPrice = defenseData.meta.armorPrice || 0
      const helmetPrice = defenseData.meta.helmetPrice || 0

      const armorLevel = defenseData.meta.armorLevel
      const helmetLevel = defenseData.meta.helmetLevel

      const armorRepairPrice = this._getRepairPrice(armorLevel, 'armor')
      const helmetRepairPrice = this._getRepairPrice(helmetLevel, 'helmet')
      const repairCost = armorRepairPrice + helmetRepairPrice

      defenseCosts.set(di, {
        armorPrice,
        helmetPrice,
        armorRepairPrice,
        helmetRepairPrice,
        repairCost,
        totalCost: armorPrice + helmetPrice + repairCost,
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
            // ⭐ v6：维修包成本
            armorRepairPrice: defenseCost.armorRepairPrice,
            helmetRepairPrice: defenseCost.helmetRepairPrice,
            repairCost: defenseCost.repairCost,
            total: totalCost,
          }
        })
      }
    }

    // ============================================================
    // 5.6 排序
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
    // 5.6.1 去重
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
      const gearTotal =
        combo.cost.gunPrice +
        combo.cost.bulletCost +
        combo.cost.armorPrice +
        combo.cost.helmetPrice +
        combo.cost.repairCost   // ⭐ v6

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
            id: combo.attackMeta.bulletId,
            name: combo.attackMeta.bulletName,
            level: combo.attackMeta.bulletLevel,
            price: combo.cost.bulletPrice,
            avgShots: combo.cost.avgShots,
            carryCount: combo.cost.bulletPrice > 0
              ? Math.round(combo.cost.bulletCost / combo.cost.bulletPrice)
              : 0
          },
          armor: {
            id: combo.defenseMeta.armorId,
            name: combo.defenseMeta.armorName,
            level: combo.defenseMeta.armorLevel,
            value: combo.defenseMeta.armorValue,
            price: combo.cost.armorPrice
          },
          helmet: {
            id: combo.defenseMeta.helmetId,
            name: combo.defenseMeta.helmetName,
            level: combo.defenseMeta.helmetLevel,
            value: combo.defenseMeta.helmetValue,
            price: combo.cost.helmetPrice
          },
          // ⭐ v6：维修包信息
          repair: {
            armorRepairPrice: combo.cost.armorRepairPrice,
            helmetRepairPrice: combo.cost.helmetRepairPrice,
            repairCost: combo.cost.repairCost,
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
          // ⭐ v6：维修包成本（供 UI 单独显示）
          armorRepairPrice: combo.cost.armorRepairPrice,
          helmetRepairPrice: combo.cost.helmetRepairPrice,
          repairCost: combo.cost.repairCost,
          // 总价（含维修包）
          total: combo.cost.total,
          totalW: combo.cost.total / 10000,
          // 装备总价（不含子弹，但含维修包）
          gearTotal,
          gearTotalW: gearTotal / 10000,
        }
      }
    }

    const topN = dedupedCombos.slice(0, 3).map((c, i) => formatCombo(c, i + 1))
    const rest = dedupedCombos.slice(3, 30).map((c, i) => formatCombo(c, i + 4))

    // ============================================================
    // 5.8 ⭐ 收集 debug 数据（每个 combo）
    // ============================================================
    const debugCombos = dedupedCombos.slice(0, 30).map((combo, i) => {
      const rank = i + 1

      const perEnemy = enemies.map(enemy => {
        const attackId = makeAttackId({
          weaponId: combo.attackMeta.weaponId,
          configId: combo.attackMeta.configId,
          bulletId: combo.attackMeta.bulletId,
          enemy,
          scenarioHash,
        })

        // ⭐ v6：防御侧 ID 含 distance + hitRate
        const defenseHitRate = enemy.hitRate ?? scenario.hitRate ?? 0.85

        const defenseId = makeDefenseId({
          enemyWeaponId: enemy.weaponId,
          enemyConfigId: enemy.configId,
          enemyBulletId: enemy.bulletId,
          ourArmorLevel: combo.defenseMeta.armorLevel,
          ourArmorValue: combo.defenseMeta.armorValue,
          ourHelmetLevel: combo.defenseMeta.helmetLevel,
          ourHelmetValue: combo.defenseMeta.helmetValue,
          distance: enemy.distance,
          hitRate: defenseHitRate,
          scenarioHash,
        })

        const attackDebug = getDebugEntry(attackId)
        const defenseDebug = getDebugEntry(defenseId)

        const attackTTK = combo.attackPerEnemy[enemy.name]?.ttk || 0
        const defenseTTK = combo.defensePerEnemy[enemy.name]?.ttk || 0
        const winRate = combo.perEnemyWinRates[enemy.name] || 0

        return {
          enemyName: enemy.name,
          attackId,
          defenseId,
          attackTTK,
          defenseTTK,
          diff: defenseTTK - attackTTK,
          winRate,
          attackDebug,
          defenseDebug,
        }
      })

      return {
        rank,
        attackMeta: combo.attackMeta,
        defenseMeta: combo.defenseMeta,
        combinedWinRate: combo.winRate,
        cost: combo.cost,
        perEnemy,
      }
    })

    return {
      topN,
      rest,
      allCount: dedupedCombos.length,
      _debug: {
        scenarioHash,
        winRateK: WIN_RATE_K,
        winRateAggMethod: WIN_RATE_AGG_METHOD,
        enemyCount: enemies.length,
        combos: debugCombos,
      },
    }
  }

  // ============================================================
  // 6. 工具：日志
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
  // 7. 打印推荐结果
  // ============================================================

  printResult(result) {
    const { recommendations, log } = result

    console.log('\n═══════════════════════════════════════')
    console.log('🏆 配装推荐 Top 3')
    console.log('═══════════════════════════════════════')

    recommendations.topN.forEach(rec => {
      const winRatePct = (rec.winRate * 100).toFixed(1)
      console.log(`\n【#${rec.rank}】综合胜率 ${winRatePct}%  总价 ${rec.cost.totalW.toFixed(1)}W`)
      console.log(`  武器: ${rec.gear.weapon.name} ${rec.gear.weapon.configId} (${(rec.gear.weapon.price / 10000).toFixed(1)}W)`)
      if (rec.gear.weapon.buildCode) {
        console.log(`        改枪码: ${rec.gear.weapon.buildCode}`)
      }
      console.log(`  子弹: ${rec.gear.bullet.name} Lv.${rec.gear.bullet.level} × ${rec.gear.bullet.carryCount} 发 (${(rec.cost.bulletCost / 10000).toFixed(1)}W)`)
      console.log(`  护甲: ${rec.gear.armor.name} Lv.${rec.gear.armor.level} (${(rec.gear.armor.price / 10000).toFixed(1)}W)`)
      console.log(`  头盔: ${rec.gear.helmet.name} Lv.${rec.gear.helmet.level} (${(rec.gear.helmet.price / 10000).toFixed(1)}W)`)
      if (rec.cost.repairCost > 0) {
        console.log(`  维修: 甲修 ${(rec.cost.armorRepairPrice / 10000).toFixed(1)}W + 头修 ${(rec.cost.helmetRepairPrice / 10000).toFixed(1)}W = ${(rec.cost.repairCost / 10000).toFixed(1)}W`)
      }
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