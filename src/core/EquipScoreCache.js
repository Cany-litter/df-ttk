// src/core/EquipScoreCache.js
//
// 评分缓存（薄封装）
//
// 职责：
// - 为"综合评分"提供单条 TTK 的读写缓存
// - 复用 TTKMatrix 的 makeAttackId（攻击侧 key 结构）
// - 复用 TTKIndexedDB 的 getMatrixEntry / setMatrixEntries
//
// ⭐ 为什么复用攻击侧 key？
//   评分要算的"单条 TTK" = 我方武器打某套装备的 TTK，
//   这与推荐引擎的"攻击侧 TTK"（我方武器 → 敌人）语义完全一致。
//   敌人在这里被抽象为"一套装备"（armorLevel/Value + helmetLevel/Value + distance）。
//   复用 key 后：
//     1. 与推荐引擎共享同一个 IndexedDB，不重复占空间
//     2. 用户跑过推荐后再看评分，大量缓存直接命中
//     3. 评分与推荐用完全一样的缓存失效规则（scenarioHash / MATRIX_VERSION）
//
// ⭐ 缓存 key 结构（复用 makeAttackId）：
//   atk_{weaponId}_{configId}_{bulletId}_a{armorLv}v{armorVal}_h{helmetLv}v{helmetVal}_d{distance}_{scenarioHash}
//
// ⭐ 缓存内容：
//   { id, ttk, shots, hits, meta, cachedAt }
//
// ⭐ 批量写入：
//   复用 TTKIndexedDB 的 setMatrixEntries（分片事务）
//   评分引擎自己控制批量节奏（攒够 N 条 flush 一次）
//
// ⭐ v2 改动（问题 6 / 11）：
//   - ScoreCacheScheduler 加统计（flushed / failed / pending）
//   - 精简 meta（删掉 bulletName / bulletLevel / weaponName 等冗余字段）
//     只保留：type / weaponId / configId / bulletId / armorLevel /
//              armorValue / helmetLevel / helmetValue / distance / scenarioHash
//   - 兼容旧 meta（读到旧字段也不报错）
//
// ⭐ 依赖：
// - TTKMatrix.makeAttackId / makeScenarioHash
// - TTKIndexedDB.getMatrixEntry / setMatrixEntries
//
// ⚠️ 注意：
// - 本文件不直接操作 IndexedDB，只做 key 组装 + 转发
// - 缓存失效由 scenarioHash + MATRIX_VERSION 自动处理
// - 若将来评分 key 结构变化，需要改这里的 makeScoreCacheId

import { getMatrixEntry, setMatrixEntries } from './TTKIndexedDB.js'
import { makeAttackId, makeScenarioHash } from './TTKMatrix.js'

// ============================================================
// 常量
// ============================================================

/** 批量写入阈值（攒够这么多条就 flush 一次） */
export const SCORE_CACHE_BATCH_SIZE = 200

// ============================================================
// key 组装
// ============================================================

/**
 * 生成评分缓存的单条 key
 *
 * ⭐ 复用 makeAttackId：把"一套装备"当作"一个敌人"
 *
 * @param {Object} options
 * @param {number} options.weaponId
 * @param {string} options.configId
 * @param {string} options.bulletId
 * @param {Object} options.equip - { armorLevel, armorValue, helmetLevel, helmetValue }
 * @param {number} options.distance
 * @param {string} options.scenarioHash
 * @returns {string}
 */
export function makeScoreCacheId({
  weaponId,
  configId,
  bulletId,
  equip,
  distance,
  scenarioHash,
}) {
  const fakeEnemy = {
    name: '__score__',   // name 不进 key，给个占位
    armorLevel: equip.armorLevel,
    armorValue: equip.armorValue,
    helmetLevel: equip.helmetLevel,
    helmetValue: equip.helmetValue,
    distance,
  }

  return makeAttackId({
    weaponId,
    configId,
    bulletId,
    enemy: fakeEnemy,
    scenarioHash,
  })
}

/**
 * 生成场景哈希（转发 TTKMatrix.makeScenarioHash）
 *
 * @param {Object} scenario
 * @returns {string}
 */
export function makeScoreScenarioHash(scenario) {
  return makeScenarioHash(scenario)
}

// ============================================================
// 读缓存
// ============================================================

/**
 * 读取单条评分缓存
 *
 * @param {string} id
 * @returns {Promise<Object|null>} { id, ttk, shots, hits, meta, cachedAt } 或 null
 */
export async function getScoreEntry(id) {
  return await getMatrixEntry(id)
}

/**
 * 批量读取评分缓存
 *
 * ⭐ TTKIndexedDB 没有暴露批量 get，这里用 Promise.all 并发。
 *   IndexedDB 单条 get 很快（内存索引），并发 200 条不会卡。
 *
 * @param {Array<string>} ids
 * @returns {Promise<Map<string, Object>>} id → entry（未命中的 id 不在 Map 里）
 */
export async function getScoreEntries(ids) {
  const result = new Map()
  if (!Array.isArray(ids) || ids.length === 0) return result

  const entries = await Promise.all(
    ids.map(async (id) => {
      try {
        const entry = await getMatrixEntry(id)
        return { id, entry }
      } catch (e) {
        return { id, entry: null }
      }
    })
  )

  for (const { id, entry } of entries) {
    if (entry) result.set(id, entry)
  }

  return result
}

// ============================================================
// 写缓存
// ============================================================

/**
 * 批量写入评分缓存
 *
 * ⭐ 转发 TTKIndexedDB.setMatrixEntries（内部已分片事务）
 *
 * @param {Array<{id, ttk, shots, hits, meta}>} entries
 * @returns {Promise<number>} 成功写入数
 */
export async function setScoreEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return 0
  return await setMatrixEntries(entries)
}

// ============================================================
// 缓存元信息组装（v2：精简）
// ============================================================

/**
 * ⭐ v2：组装单条缓存记录的 meta 字段（精简版）
 *
 * 精简原则：
 *   - 只保留"参与 key 计算"或"排查必须"的字段
 *   - 删掉所有名字字段（weaponName / bulletName / bulletLevel）
 *
 * 保留字段：
 *   - type:          "score"（区别于推荐引擎的 "attack" / "defense"）
 *   - weaponId:      武器 ID
 *   - configId:      配置 ID
 *   - bulletId:      子弹 ID
 *   - armorLevel:    护甲等级
 *   - armorValue:    护甲值
 *   - helmetLevel:   头盔等级
 *   - helmetValue:   头盔值
 *   - distance:      距离
 *   - scenarioHash:  场景哈希
 *
 * 相比旧版：每条 meta 从 ~200 字节降到 ~80 字节（省 60%）
 *
 * @param {Object} options
 * @param {Object} options.weaponMeta - { weaponId, configId }（weaponName 可选，会被忽略）
 * @param {Object} options.bulletMeta - { bulletId }（bulletName / bulletLevel 会被忽略）
 * @param {Object} options.equip - { armorLevel, armorValue, helmetLevel, helmetValue }
 * @param {number} options.distance
 * @param {string} options.scenarioHash
 * @returns {Object}
 */
export function makeScoreCacheMeta({
  weaponMeta,
  bulletMeta,
  equip,
  distance,
  scenarioHash,
}) {
  return {
    type: 'score',
    weaponId: weaponMeta.weaponId,
    configId: weaponMeta.configId,
    bulletId: bulletMeta.bulletId,
    armorLevel: equip.armorLevel,
    armorValue: equip.armorValue,
    helmetLevel: equip.helmetLevel,
    helmetValue: equip.helmetValue,
    distance,
    scenarioHash,
  }
}

// ============================================================
// 批量调度器（v2：加统计）
// ============================================================

/**
 * 批量写入调度器
 *
 * ⭐ 用途：
 *   评分引擎在循环里调用 add()，攒够 BATCH_SIZE 条自动 flush，
 *   循环结束后调用 flush() 把剩余写入。
 *   避免在循环里手动判断"攒够没"。
 *
 * ⭐ 用法：
 *   const scheduler = new ScoreCacheScheduler()
 *   ...
 *   scheduler.add({ id, ttk, shots, hits, meta })
 *   ...
 *   await scheduler.flush()
 *
 * ⭐ v2 新增：
 *   - 记录 totalFlushed / totalFailed / totalAdded
 *   - getStats() 返回统计信息
 *   - flush 失败时不抛异常，只记录
 *
 * ⭐ 注意：
 *   - add() 不 await，是同步的（只 push 到内部数组）
 *   - flush() 是 async，真正写 IndexedDB
 *   - 同一个 scheduler 实例不要并发 flush（内部没有锁）
 */
export class ScoreCacheScheduler {
  constructor(batchSize = SCORE_CACHE_BATCH_SIZE) {
    this.batchSize = batchSize
    this.buffer = []

    // ⭐ v2：统计
    this.totalAdded = 0      // 累计加入的条数
    this.totalFlushed = 0    // 累计成功写入的条数
    this.totalFailed = 0     // 累计写入失败的条数
    this.flushCount = 0      // flush 调用次数
  }

  /**
   * 添加一条记录（同步）
   *
   * @param {Object} entry - { id, ttk, shots, hits, meta }
   * @returns {Promise<boolean>} 是否触发了 flush（true 表示这次 add 触发了批量写）
   */
  add(entry) {
    if (!entry || !entry.id) return Promise.resolve(false)

    this.buffer.push(entry)
    this.totalAdded++

    if (this.buffer.length >= this.batchSize) {
      return this.flush().then(() => true)
    }
    return Promise.resolve(false)
  }

  /**
   * 立即写入当前缓冲区（async）
   *
   * ⭐ v2：失败时记录到 totalFailed，不抛异常
   *
   * @returns {Promise<number>} 本次成功写入条数
   */
  async flush() {
    if (this.buffer.length === 0) return 0

    const batch = this.buffer
    this.buffer = []
    this.flushCount++

    try {
      const written = await setScoreEntries(batch)
      const failed = batch.length - written

      this.totalFlushed += written
      this.totalFailed += failed

      if (failed > 0) {
        console.warn(
          `⚠️ ScoreCacheScheduler.flush: 本批 ${batch.length} 条，成功 ${written}，失败 ${failed}`
        )
      }

      return written
    } catch (e) {
      // 整体失败：全部计入失败
      this.totalFailed += batch.length
      console.warn(`⚠️ ScoreCacheScheduler.flush 异常: ${e}`)
      return 0
    }
  }

  /**
   * 当前缓冲区条数（用于进度显示）
   */
  get pendingCount() {
    return this.buffer.length
  }

  /**
   * 累计已写入条数
   */
  get flushedCount() {
    return this.totalFlushed
  }

  /**
   * ⭐ v2：获取完整统计
   *
   * @returns {Object} { added, flushed, failed, pending, flushCount }
   */
  getStats() {
    return {
      added: this.totalAdded,
      flushed: this.totalFlushed,
      failed: this.totalFailed,
      pending: this.buffer.length,
      flushCount: this.flushCount,
    }
  }
}