/**
 * 配装推荐引擎
 * 
 * 职责：
 * 1. 枚举攻击侧配置（武器配置 × 子弹等级）
 * 2. 枚举防御侧配置（护甲 × 头盔）
 * 3. 查询/计算每个组合的 TTK（走 KeyPointsComputer → ttkCache）
 * 4. 基于预算过滤 + 计算比值 + 排序
 * 5. 记录详细日志（用于后续分析优化）
 * 6. 支持导出推荐结果 + 日志（用于离线分析）
 * 
 * 不负责：
 * - UI 渲染（由 RecPanel.vue 等组件负责）
 * - 缓存的底层存储（由 TtkCacheManager 负责）
 * - keyPoints 的计算（由 KeyPointsComputer 负责）
 * 
 * ⭐ 预算口径（采购成本）：
 *   总成本 = 枪价 + 甲价 + 头价 + 子弹单价 × 携带数量
 *   携带数量 = (KD × 5 × avgShots + extraCost) × 2
 * 
 * ⭐ 比值评分：
 *   对每个敌人 i，比值_i = 生存TTK_i / 进攻TTK_i
 *   综合比值 = min(所有敌人的比值_i)  越大越好
 * 
 * ⭐ 枚举范围（启用过滤后）：
 *   - 子弹：Lv.1 ~ Lv.5，且 enabled !== false
 *   - 护甲：Lv.1 ~ Lv.6，且 enabled !== false
 *   - 头盔：Lv.1 ~ Lv.6，且 enabled !== false
 *   - 武器：所有 enabled 的配置
 * 
 * ⭐ 假想敌特殊处理：
 *   - 假想敌的武器/配置/子弹/护甲/头盔不受 enabled 影响
 *   - 因为假想敌是"已知对手"，用户明确指定
 * 
 * ⭐ 日志：
 *   - 每次 TTK 查询记录一条（含输入 key、是否命中、耗时、TTK 值）
 *   - 组合阶段记录 Top 100 详情
 * 
 * ⭐ 统一缓存后：
 *   - keyPoints 的计算/缓存全部交给 computeKeyPoints
 *   - 本引擎不再直接操作 ttkCache
 */

import { computeKeyPoints } from './KeyPointsComputer.js';
import { calculateCurrentValues } from '../utils/weaponCalc.js';

export class RecEngine {
  /**
   * @param {DataManager} dataManager
   * @param {TtkCacheManager} ttkCacheManager
   */
  constructor(dataManager, ttkCacheManager) {
    this.dm = dataManager;
    this.tcm = ttkCacheManager;
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
    const t0 = performance.now();

    const log = this._createLog(input, options);
    const budgetW = input.budget || 100;

    try {
      // ============================================================
      // 阶段 1：枚举
      // ============================================================
      if (options.onProgress) options.onProgress(0, 1, 'enumerating');

      const attacks = this._buildAttackSide();
      const defenses = this._buildDefenseSide();

      log.enumeration = {
        attackCount: attacks.length,
        defenseCount: defenses.length,
        enemyCount: input.enemies.length
      };

      console.log(`📋 枚举完成: 攻击侧 ${attacks.length} 个, 防御侧 ${defenses.length} 个, 假想敌 ${input.enemies.length} 个`);

      // ============================================================
      // 阶段 2：计算攻击侧 TTK
      // ============================================================
      const attackResults = await this._computeAttackTTKs(
        attacks, input.enemies, input, log, options
      );

      if (options.signal?.cancelled) {
        throw new Error('用户取消');
      }

      // ============================================================
      // 阶段 3：计算防御侧 TTK
      // ============================================================
      const defenseResults = await this._computeDefenseTTKs(
        defenses, input.enemies, input, log, options
      );

      if (options.signal?.cancelled) {
        throw new Error('用户取消');
      }

      // ============================================================
      // 阶段 4：组合推荐
      // ============================================================
      const recommendations = this._buildRecommendations(
        attackResults, defenseResults, input.enemies, budgetW, input, log, options
      );

      // ============================================================
      // 收尾
      // ============================================================
      log.totalTimeMs = Math.round(performance.now() - t0);
      log.completedAt = new Date().toISOString();

      console.log(`✅ 推荐完成: ${log.totalTimeMs}ms, Top ${recommendations.topN.length} + ${recommendations.rest.length}`);

      return { recommendations, log };

    } catch (error) {
      log.totalTimeMs = Math.round(performance.now() - t0);
      log.error = error.message;
      console.error('❌ 推荐失败:', error);
      throw error;
    }
  }

  // ============================================================
  // 2. 枚举攻击侧
  // ============================================================

  /**
   * 构建攻击侧配置列表
   * 
   * ⭐ 启用过滤：
   * - 武器配置：config.enabled !== false
   * - 子弹：bullet.enabled !== false（通过 getBulletByCaliberAndLevel 过滤）
   * 
   * @returns {Array} [{
   *   weaponId, configId, weaponKey,
   *   bulletId, bullet, bulletLevel,
   *   weapon, config,
   *   _armed,           // 应用附件后的武器对象（用于计算）
   *   _attachment,      // 附件信息（用于计算）
   *   meta: { weaponId, weaponKey, weaponName, configId, bulletId, bulletName, bulletLevel, bulletPrice }
   * }]
   */
  _buildAttackSide() {
    const attacks = [];
    const weapons = this.dm.getWeapons();

    for (const weapon of weapons) {
      const price = this.dm.getPriceByWeaponId(weapon.id);
      if (!price) continue;

      for (const config of price.configs) {
        // 只枚举 enabled
        if (config.enabled === false) continue;

        // 解析附件
        const barrelId = config.barrelId ?? -1;
        const muzzleId = config.muzzleId ?? 0;
        const precision = config.precision ?? 0.09;

        // 生成 weaponKey
        const weaponKey = this.tcm.makeWeaponKey(
          weapon.id, config.id, barrelId, muzzleId, precision
        );

        // 应用附件后的武器（用于计算）
        let barrel = null;
        if (barrelId >= 0 && weapon.barrels && weapon.barrels[barrelId]) {
          barrel = weapon.barrels[barrelId];
        }
        const current = calculateCurrentValues(weapon, barrel, muzzleId, precision);
        const armedWeapon = {
          ...weapon,
          ...current,
          _current: current,
          _displayName: `${weapon.name} ${config.id}`.trim(),
          _configId: config.id || '#1'
        };

        // 附件信息（用于 hitRateMap）
        let hitRateMap = [];
        if (config.distance && config.hitRate &&
            Array.isArray(config.distance) && Array.isArray(config.hitRate) &&
            config.distance.length > 0 && config.hitRate.length > 0) {
          const len = Math.min(config.distance.length, config.hitRate.length);
          for (let i = 0; i < len; i++) {
            hitRateMap.push({
              distance: config.distance[i],
              rate: config.hitRate[i]
            });
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
        };

        // ⭐ 枚举子弹等级 Lv.1 ~ Lv.5
        // getBulletByCaliberAndLevel 内部已过滤 enabled === false
        for (let level = 1; level <= 5; level++) {
          const bullet = this.dm.getBulletByCaliberAndLevel(weapon.allowedBullet, level);
          if (!bullet) continue;

          attacks.push({
            weaponId: weapon.id,
            configId: config.id,
            weaponKey,
            bulletId: bullet.id,
            bullet,
            bulletLevel: level,
            weapon,
            config,
            _armed: armedWeapon,
            _attachment: attachment,
            _price: config.price || 0,
            meta: {
              weaponId: weapon.id,
              weaponKey,
              weaponName: weapon.name,
              configId: config.id,
              bulletId: bullet.id,
              bulletName: bullet.name,
              bulletLevel: level,
              bulletPrice: bullet.price
            }
          });
        }
      }
    }

    return attacks;
  }

  // ============================================================
  // 3. 枚举防御侧
  // ============================================================

  /**
   * 构建防御侧配置列表（全枚举护甲 × 头盔）
   * 
   * ⭐ 启用过滤：
   * - getArmorsByType 内部已过滤 enabled === false
   * 
   * @returns {Array} [{
   *   armor, helmet,
   *   defenderKey,
   *   meta: { armorId, armorName, armorLevel, armorValue, armorPrice,
   *           helmetId, helmetName, helmetLevel, helmetValue, helmetPrice }
   * }]
   */
  _buildDefenseSide() {
    const defenses = [];
    // ⭐ getArmorsByType 内部已过滤 enabled === false
    const armors = this.dm.getArmorsByType('armor');
    const helmets = this.dm.getArmorsByType('helmet');

    for (const armor of armors) {
      for (const helmet of helmets) {
        const defenderKey = this.tcm.makeDefenderKey(
          armor.level, armor.value,
          helmet.level, helmet.value
        );

        defenses.push({
          armor,
          helmet,
          defenderKey,
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
        });
      }
    }

    return defenses;
  }

  // ============================================================
  // 4. 计算攻击侧 TTK
  // ============================================================

  /**
   * 计算所有攻击侧配置对每个假想敌的 TTK
   * 
   * ⭐ 缓存/计算全部走 computeKeyPoints
   */
  async _computeAttackTTKs(attacks, enemies, input, log, options) {
    const results = [];
    const params = input.params || {};

    const total = attacks.length * enemies.length;
    let processed = 0;

    log.attack = {
      totalQueries: total,
      cacheHits: 0,
      cacheMisses: 0,
      computeTimeMs: 0,
      cacheTimeMs: 0,
      details: options.recordLog !== false ? [] : null
    };

    for (let ai = 0; ai < attacks.length; ai++) {
      const attack = attacks[ai];

      if (options.signal?.cancelled) break;

      for (let ei = 0; ei < enemies.length; ei++) {
        const enemy = enemies[ei];

        const t0 = performance.now();

        // ⭐ 统一走 computeKeyPoints（内部查缓存 + 未命中算 + 写缓存）
        const kp = await computeKeyPoints({
          armedWeapon: attack._armed,
          attachment: attack._attachment,
          bulletId: attack.bulletId,
          params: {
            ...params,
            armorLevel: enemy.armorLevel,
            armorValue: enemy.armorValue,
            helmetLevel: enemy.helmetLevel,
            helmetValue: enemy.helmetValue
          },
          dataManager: this.dm,
          ttkCacheManager: this.tcm,
          signal: options.signal
        });

        const elapsed = performance.now() - t0;

        if (kp?.fromCache) {
          log.attack.cacheHits++;
          log.attack.cacheTimeMs += elapsed;
        } else {
          log.attack.cacheMisses++;
          log.attack.computeTimeMs += elapsed;
        }

        const keyPoints = kp?.keyPoints || null;
        const ttkAtDistance = keyPoints
          ? this.tcm.interpolateTTK(keyPoints, enemy.distance)
          : 0;

        results.push({
          attackIndex: ai,
          attackMeta: attack.meta,
          enemyIndex: ei,
          enemyName: enemy.name,
          ttkAtDistance,
          keyPoints,
          fromCache: !!kp?.fromCache
        });

        if (log.attack.details) {
          log.attack.details.push({
            type: 'attack',
            weaponKey: attack.weaponKey,
            bulletId: attack.bulletId,
            enemyName: enemy.name,
            weaponName: attack.meta.weaponName,
            configId: attack.meta.configId,
            bulletName: attack.meta.bulletName,
            bulletLevel: attack.meta.bulletLevel,
            enemyArmorLevel: enemy.armorLevel,
            enemyHelmetLevel: enemy.helmetLevel,
            distance: enemy.distance,
            hit: !!kp?.fromCache,
            ttkAtDistance,
            keyPointsCount: keyPoints ? keyPoints.length : 0
          });
        }

        processed++;
        if (processed % 10 === 0 && options.onProgress) {
          options.onProgress(processed, total, 'attack');
        }
      }
    }

    if (options.onProgress) {
      options.onProgress(total, total, 'attack');
    }

    console.log(`📊 攻击侧: ${log.attack.cacheHits} 命中 / ${log.attack.cacheMisses} 未命中`);

    return results;
  }

  // ============================================================
  // 5. 计算防御侧 TTK
  // ============================================================

  /**
   * 计算每个我方甲头组合被每个假想敌打的 TTK
   * 
   * ⭐ 缓存/计算全部走 computeKeyPoints
   * ⭐ 假想敌的武器/子弹不受 enabled 影响（在 _buildEnemyArmed 里处理）
   */
  async _computeDefenseTTKs(defenses, enemies, input, log, options) {
    const results = [];
    const params = input.params || {};

    const total = defenses.length * enemies.length;
    let processed = 0;

    log.defense = {
      totalQueries: total,
      cacheHits: 0,
      cacheMisses: 0,
      computeTimeMs: 0,
      cacheTimeMs: 0,
      details: options.recordLog !== false ? [] : null
    };

    // 预构建每个敌人的"武装后武器 + 附件"
    const enemyArmed = enemies.map(e => this._buildEnemyArmed(e));

    for (let di = 0; di < defenses.length; di++) {
      const defense = defenses[di];

      if (options.signal?.cancelled) break;

      for (let ei = 0; ei < enemies.length; ei++) {
        const enemy = enemies[ei];
        const enemyInfo = enemyArmed[ei];

        if (!enemyInfo) continue;

        const t0 = performance.now();

        // ⭐ 统一走 computeKeyPoints
        const kp = await computeKeyPoints({
          armedWeapon: enemyInfo.armed,
          attachment: enemyInfo.attachment,
          bulletId: enemy.bulletId,
          params: {
            ...params,
            armorLevel: defense.armor.level,
            armorValue: defense.armor.value,
            helmetLevel: defense.helmet.level,
            helmetValue: defense.helmet.value
          },
          dataManager: this.dm,
          ttkCacheManager: this.tcm,
          signal: options.signal
        });

        const elapsed = performance.now() - t0;

        if (kp?.fromCache) {
          log.defense.cacheHits++;
          log.defense.cacheTimeMs += elapsed;
        } else {
          log.defense.cacheMisses++;
          log.defense.computeTimeMs += elapsed;
        }

        const keyPoints = kp?.keyPoints || null;
        const ttkAtDistance = keyPoints
          ? this.tcm.interpolateTTK(keyPoints, enemy.distance)
          : 0;

        results.push({
          defenseIndex: di,
          defenseMeta: defense.meta,
          enemyIndex: ei,
          enemyName: enemy.name,
          ttkAtDistance,
          keyPoints,
          fromCache: !!kp?.fromCache
        });

        if (log.defense.details) {
          log.defense.details.push({
            type: 'defense',
            enemyWeaponKey: enemyInfo.weaponKey,
            bulletId: enemy.bulletId,
            defenderKey: defense.defenderKey,
            enemyName: enemy.name,
            armorName: defense.meta.armorName,
            armorLevel: defense.meta.armorLevel,
            helmetName: defense.meta.helmetName,
            helmetLevel: defense.meta.helmetLevel,
            distance: enemy.distance,
            hit: !!kp?.fromCache,
            ttkAtDistance,
            keyPointsCount: keyPoints ? keyPoints.length : 0
          });
        }

        processed++;
        if (processed % 10 === 0 && options.onProgress) {
          options.onProgress(processed, total, 'defense');
        }
      }
    }

    if (options.onProgress) {
      options.onProgress(total, total, 'defense');
    }

    console.log(`📊 防御侧: ${log.defense.cacheHits} 命中 / ${log.defense.cacheMisses} 未命中`);

    return results;
  }

  /**
   * 构建敌人的"武装后武器 + 附件"
   * 
   * ⭐ 假想敌特殊处理：
   * - 武器配置：不检查 enabled（假想敌是"已知对手"，用户明确指定）
   * - 子弹：直接用 enemy.bulletId（不检查 enabled）
   * - 护甲/头盔：直接用 enemy.armorLevel/Value 等（不检查 enabled）
   */
  _buildEnemyArmed(enemy) {
    const weapon = this.dm.getWeaponById(enemy.weaponId);
    if (!weapon) {
      console.warn(`⚠️ 敌人武器不存在: ${enemy.weaponId}`);
      return null;
    }

    const price = this.dm.getPriceByWeaponId(enemy.weaponId);
    // ⭐ 不检查 config.enabled（假想敌明确指定了该配置）
    const config = price?.configs.find(c => c.id === enemy.configId);
    if (!config) {
      console.warn(`⚠️ 敌人配置不存在: ${enemy.weaponId} ${enemy.configId}`);
      return null;
    }

    const barrelId = config.barrelId ?? -1;
    const muzzleId = config.muzzleId ?? 0;
    const precision = config.precision ?? 0.09;

    let barrel = null;
    if (barrelId >= 0 && weapon.barrels && weapon.barrels[barrelId]) {
      barrel = weapon.barrels[barrelId];
    }

    const current = calculateCurrentValues(weapon, barrel, muzzleId, precision);
    const armed = {
      ...weapon,
      ...current,
      _current: current,
      _displayName: `${weapon.name} ${config.id}`.trim(),
      _configId: config.id || '#1'
    };

    let hitRateMap = [];
    if (config.distance && config.hitRate &&
        Array.isArray(config.distance) && Array.isArray(config.hitRate)) {
      const len = Math.min(config.distance.length, config.hitRate.length);
      for (let i = 0; i < len; i++) {
        hitRateMap.push({ distance: config.distance[i], rate: config.hitRate[i] });
      }
    }

    const attachment = {
      weaponId: weapon.id,
      configId: config.id || '#1',
      barrelIndex: barrelId,
      muzzleIndex: muzzleId,
      precision,
      // ⭐ 假想敌的子弹直接用（不检查 enabled）
      bulletType: enemy.bulletId || null,
      hitRateMap,
      displayName: armed._displayName
    };

    const weaponKey = this.tcm.makeWeaponKey(
      weapon.id, config.id, barrelId, muzzleId, precision
    );

    return { armed, attachment, weaponKey, bulletId: enemy.bulletId };
  }

  // ============================================================
  // 6. 组合推荐
  // ============================================================

  /**
   * 遍历所有 (攻击侧 + 防御侧) 组合，过滤 + 计算比值 + 排序
   */
  _buildRecommendations(attackResults, defenseResults, enemies, budgetW, input, log, options) {
    const kdRatio = input.kdRatio ?? 1.0;
    const extraCost = input.extraCost ?? 30;

    // ============================================================
    // 6.1 索引化攻击侧结果
    // ============================================================
    const attackMap = new Map();
    for (const r of attackResults) {
      if (!attackMap.has(r.attackIndex)) {
        attackMap.set(r.attackIndex, {
          meta: r.attackMeta,
          perEnemy: {}
        });
      }
      attackMap.get(r.attackIndex).perEnemy[r.enemyName] = {
        ttk: r.ttkAtDistance,
        keyPoints: r.keyPoints
      };
    }

    // ============================================================
    // 6.2 索引化防御侧结果
    // ============================================================
    const defenseMap = new Map();
    for (const r of defenseResults) {
      if (!defenseMap.has(r.defenseIndex)) {
        defenseMap.set(r.defenseIndex, {
          meta: r.defenseMeta,
          perEnemy: {}
        });
      }
      defenseMap.get(r.defenseIndex).perEnemy[r.enemyName] = {
        ttk: r.ttkAtDistance
      };
    }

    // ============================================================
    // 6.3 预计算攻击侧成本（枪价 + 子弹成本）
    // ============================================================
    const attackCosts = new Map();
    for (const [ai, attackData] of attackMap.entries()) {
      const firstEnemy = Object.values(attackData.perEnemy)[0];
      if (!firstEnemy || !firstEnemy.keyPoints) continue;

      const avgShots = this.tcm.averageShots(firstEnemy.keyPoints);
      const bulletPrice = this.tcm.getBulletPrice(firstEnemy.keyPoints);

      const bulletCost = this._calcBulletCost(bulletPrice, avgShots, kdRatio, extraCost);

      const weaponId = attackData.meta.weaponId;
      const configId = attackData.meta.configId;
      const price = weaponId ? this.dm.getPriceByWeaponId(weaponId) : null;
      const config = price?.configs.find(c => c.id === configId);
      const gunPrice = config?.price || 0;

      attackCosts.set(ai, {
        gunPrice,
        bulletCost,
        bulletPrice,
        avgShots,
        totalCost: gunPrice + bulletCost
      });
    }

    // ============================================================
    // 6.4 预计算防御侧成本（甲价 + 头价）
    // ============================================================
    const defenseCosts = new Map();
    for (const [di, defenseData] of defenseMap.entries()) {
      const armorPrice = defenseData.meta.armorPrice || 0;
      const helmetPrice = defenseData.meta.helmetPrice || 0;
      defenseCosts.set(di, {
        armorPrice,
        helmetPrice,
        totalCost: armorPrice + helmetPrice
      });
    }

    // ============================================================
    // 6.5 遍历所有组合
    // ============================================================
    const budgetYuan = budgetW * 10000;

    const allCombos = [];
    let withinBudget = 0;
    let overBudget = 0;

    for (const [ai, attackData] of attackMap.entries()) {
      const attackCost = attackCosts.get(ai);
      if (!attackCost) continue;

      for (const [di, defenseData] of defenseMap.entries()) {
        const defenseCost = defenseCosts.get(di);
        if (!defenseCost) continue;

        const totalCost = attackCost.totalCost + defenseCost.totalCost;

        if (totalCost > budgetYuan) {
          overBudget++;
          continue;
        }

        withinBudget++;

        // 计算每个敌人的比值
        let minRatio = Infinity;
        const perEnemyRatios = {};
        let valid = true;

        for (const enemy of enemies) {
          const atk = attackData.perEnemy[enemy.name];
          const def = defenseData.perEnemy[enemy.name];

          if (!atk || !def || atk.ttk <= 0 || def.ttk <= 0) {
            valid = false;
            break;
          }

          const ratio = def.ttk / atk.ttk;
          perEnemyRatios[enemy.name] = ratio;
          minRatio = Math.min(minRatio, ratio);
        }

        if (!valid) continue;

        allCombos.push({
          attackIndex: ai,
          defenseIndex: di,
          attackMeta: attackData.meta,
          defenseMeta: defenseData.meta,
          attackPerEnemy: attackData.perEnemy,
          defensePerEnemy: defenseData.perEnemy,
          perEnemyRatios,
          ratio: minRatio,
          cost: {
            gunPrice: attackCost.gunPrice,
            bulletPrice: attackCost.bulletPrice,
            bulletCost: attackCost.bulletCost,
            avgShots: attackCost.avgShots,
            armorPrice: defenseCost.armorPrice,
            helmetPrice: defenseCost.helmetPrice,
            total: totalCost
          }
        });
      }
    }

    // ============================================================
    // 6.6 排序
    // ============================================================
    allCombos.sort((a, b) => {
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      return a.cost.total - b.cost.total;
    });

    log.combinations = {
      total: attackMap.size * defenseMap.size,
      withinBudget,
      overBudget,
      top100: options.recordLog !== false
        ? allCombos.slice(0, 100).map(c => ({
            ratio: c.ratio,
            perEnemyRatios: c.perEnemyRatios,
            cost: c.cost,
            weaponName: c.attackMeta.weaponName,
            configId: c.attackMeta.configId,
            bulletName: c.attackMeta.bulletName,
            bulletLevel: c.attackMeta.bulletLevel,
            armorName: c.defenseMeta.armorName,
            armorLevel: c.defenseMeta.armorLevel,
            helmetName: c.defenseMeta.helmetName,
            helmetLevel: c.defenseMeta.helmetLevel
          }))
        : null
    };

    console.log(`📊 组合: ${withinBudget} 预算内 / ${overBudget} 超预算`);

    // ============================================================
    // 6.7 构建推荐输出
    // ============================================================
    const formatCombo = (combo, rank) => ({
      rank,
      gear: {
        weapon: {
          id: combo.attackMeta.weaponId,
          configId: combo.attackMeta.configId,
          name: combo.attackMeta.weaponName,
          price: combo.cost.gunPrice
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
          name: combo.defenseMeta.armorName,
          level: combo.defenseMeta.armorLevel,
          value: combo.defenseMeta.armorValue,
          price: combo.cost.armorPrice
        },
        helmet: {
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
        ratio: combo.perEnemyRatios[e.name] || 0
      })),
      ratio: combo.ratio,
      cost: {
        gunPrice: combo.cost.gunPrice,
        bulletCost: combo.cost.bulletCost,
        armorPrice: combo.cost.armorPrice,
        helmetPrice: combo.cost.helmetPrice,
        total: combo.cost.total,
        totalW: combo.cost.total / 10000
      }
    });

    const topN = allCombos.slice(0, 3).map((c, i) => formatCombo(c, i + 1));
    const rest = allCombos.slice(3, 10).map((c, i) => formatCombo(c, i + 4));

    return {
      topN,
      rest,
      allCount: allCombos.length
    };
  }

  // ============================================================
  // 7. 工具方法
  // ============================================================

  /**
   * 计算子弹成本（采购成本口径）
   * 
   * 公式：携带数量 = (KD × 5 × avgShots + extraCost) × 2
   *      子弹成本 = 单价 × 携带数量
   */
  _calcBulletCost(bulletPrice, avgShots, kdRatio, extraCost) {
    const avgConsumption = kdRatio * 5 * avgShots + extraCost;
    const carryCount = avgConsumption * 2;
    return Math.round(bulletPrice * carryCount);
  }

  /**
   * 创建日志对象
   */
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
      attack: null,
      defense: null,
      combinations: null,
      error: null
    };
  }

  // ============================================================
  // 8. 导出推荐结果（用于离线分析）
  // ============================================================

  /**
   * 导出推荐结果 + 日志 + 缓存快照为 JSON 文件
   * 
   * @param {Object} result - recommend() 的返回值
   * @param {Object} input - 原始输入（会被一起打包）
   * @param {Object} options - {
   *   includeCache: boolean,    // 是否包含 ttkCache 快照（默认 true）
   *   filename: string,         // 自定义文件名
   * }
   */
  exportResult(result, input = null, options = {}) {
    const includeCache = options.includeCache !== false;

    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      input: input || result.log?.input || null,
      recommendations: result.recommendations,
      log: result.log,
      cacheSnapshot: null
    };

    if (includeCache) {
      try {
        const cache = this.dm.getTtkCache();
        data.cacheSnapshot = cache;
      } catch (e) {
        console.warn('⚠️ 无法获取缓存快照:', e);
      }
    }

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_');
    const filename = options.filename || `rec_result_${timestamp}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`✅ 推荐结果已导出: ${filename} (${(json.length / 1024).toFixed(1)} KB)`);
  }

  /**
   * 打印推荐结果到控制台（简洁版）
   */
  printResult(result) {
    const { recommendations, log } = result;

    console.log('\n═══════════════════════════════════════');
    console.log('🏆 配装推荐 Top 3');
    console.log('═══════════════════════════════════════');

    recommendations.topN.forEach(rec => {
      console.log(`\n【#${rec.rank}】比值 ${rec.ratio.toFixed(3)}  成本 ${rec.cost.totalW.toFixed(1)}W`);
      console.log(`  武器: ${rec.gear.weapon.name} ${rec.gear.weapon.configId} (${(rec.gear.weapon.price / 10000).toFixed(1)}W)`);
      console.log(`  子弹: ${rec.gear.bullet.name} Lv.${rec.gear.bullet.level} × ${rec.gear.bullet.carryCount} 发 (${(rec.cost.bulletCost / 10000).toFixed(1)}W)`);
      console.log(`  护甲: ${rec.gear.armor.name} Lv.${rec.gear.armor.level} (${(rec.gear.armor.price / 10000).toFixed(1)}W)`);
      console.log(`  头盔: ${rec.gear.helmet.name} Lv.${rec.gear.helmet.level} (${(rec.gear.helmet.price / 10000).toFixed(1)}W)`);
      console.log(`  对敌:`);
      rec.perEnemy.forEach(e => {
        console.log(`    vs ${e.name}: 攻 ${e.attackTTK.toFixed(0)}ms / 守 ${e.defenseTTK.toFixed(0)}ms / 比值 ${e.ratio.toFixed(2)}`);
      });
    });

    console.log('\n───────────────────────────────────────');
    console.log('📊 日志摘要');
    console.log('───────────────────────────────────────');
    console.log(`总耗时: ${log.totalTimeMs} ms`);
    console.log(`攻击侧: ${log.attack.cacheHits} 命中 / ${log.attack.cacheMisses} 未命中 (${log.attack.totalQueries} 次)`);
    console.log(`防御侧: ${log.defense.cacheHits} 命中 / ${log.defense.cacheMisses} 未命中 (${log.defense.totalQueries} 次)`);
    console.log(`组合: ${log.combinations.withinBudget} 预算内 / ${log.combinations.overBudget} 超预算`);
    console.log('═══════════════════════════════════════\n');
  }
}

// ============================================================
// 导出单例
// ============================================================

let instance = null;

export function getRecEngine(dataManager, ttkCacheManager) {
  if (!instance) {
    instance = new RecEngine(dataManager, ttkCacheManager);
  }
  return instance;
}

export default RecEngine;