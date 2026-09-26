// src/core/TTKIndexedDB.js
//
// IndexedDB 封装（基于 idb 库）
//
// 职责：
// - 提供简单的 get / set / delete / clear / getAllKeys / count API
// - 用于持久化 TTK 矩阵（攻击侧 TTK / 防御侧 TTK）
// - 持久化配装面板状态（假想敌列表 + 预算）
// - 纯前端部署（如 GitHub Pages）可用，数据保存在浏览器 origin 下
//
// 存储结构：
//   数据库：df-ttk
//   版本：2
//   ObjectStore：
//     1) ttk-matrix（keyPath: id）
//        - 存 TTK 矩阵
//     2) rec-panel-state（keyPath: id）
//        - 存配装面板状态（假想敌 + 预算）
//
// ttk-matrix 记录结构：
//   {
//     id: string,          // 唯一 ID
//     ttk: number,         // TTK（ms）
//     shots: number,       // 期望射击数
//     hits: number,        // 期望命中数
//     meta: object,        // 附加信息（可选，已精简）
//     cachedAt: number,    // 缓存时间戳（ms）
//   }
//
// rec-panel-state 记录结构：
//   {
//     id: 'default',       // 固定单条记录
//     version: 1,          // 数据结构版本号
//     enemies: Array,      // 假想敌列表
//     budget: number,      // 全局预算（万）
//     savedAt: number,     // 保存时间戳（ms）
//   }
//
// ⭐ v3 改动（问题 18：批量事务分片）：
//   - setMatrixEntries 从"200 条一个事务"改为"分片事务"
//   - 每片 BATCH_TX_SIZE = 50 条，失败只影响单批
//   - 新增 deleteMatrixEntriesByIds：批量删除（用于缓存失效）
//   - 新增 deleteMatrixEntriesByPrefix：按前缀批量删除（用于武器级清理）
//
// ⭐ v2 已有：
//   - 持久化配装面板状态
//
// 使用：
//   import { setMatrixEntry, getMatrixEntry, clearMatrix } from './TTKIndexedDB.js'
//   import { saveRecPanelState, loadRecPanelState, clearRecPanelState } from './TTKIndexedDB.js'
//
//   await setMatrixEntry(id, { ttk, shots, hits, meta })
//   const entry = await getMatrixEntry(id)
//   await deleteMatrixEntriesByPrefix('atk_41_')
//   await saveRecPanelState({ enemies, budget })
//   const state = await loadRecPanelState()

import { openDB } from 'idb'

// ============================================================
// 常量
// ============================================================

const DB_NAME = 'df-ttk'
const DB_VERSION = 2
const STORE_NAME = 'ttk-matrix'
const REC_PANEL_STORE_NAME = 'rec-panel-state'

// rec-panel-state 的数据结构版本（未来改字段时递增）
const REC_PANEL_STATE_VERSION = 1

// rec-panel-state 固定记录的 id
const REC_PANEL_STATE_ID = 'default'

// ⭐ v3：批量写入的事务分片大小
//   - 之前一次性事务写 200 条，失败全回滚
//   - 现在分片事务，每片 50 条，失败只影响单批
const BATCH_TX_SIZE = 50

// ⭐ v3：批量删除的分片大小
const DELETE_TX_SIZE = 50

// ============================================================
// 内部：获取数据库连接（惰性 + 单例）
// ============================================================

let dbPromise = null

function getDB() {
  if (dbPromise) return dbPromise

  dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // 首次创建 / 升级时，创建 ObjectStore
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(REC_PANEL_STORE_NAME)) {
        db.createObjectStore(REC_PANEL_STORE_NAME, { keyPath: 'id' })
      }
    },
  })

  return dbPromise
}

// ============================================================
// 对外 API：TTK 矩阵 - 读
// ============================================================

/**
 * 读取单条矩阵记录
 *
 * @param {string} id
 * @returns {Promise<Object|null>} { id, ttk, shots, hits, meta, cachedAt } 或 null
 */
export async function getMatrixEntry(id) {
  try {
    const db = await getDB()
    const entry = await db.get(STORE_NAME, id)
    return entry || null
  } catch (e) {
    console.warn('⚠️ TTKIndexedDB.getMatrixEntry 失败:', e)
    return null
  }
}

/**
 * 获取所有矩阵 ID
 *
 * @returns {Promise<Array<string>>}
 */
export async function getAllMatrixIds() {
  try {
    const db = await getDB()
    return await db.getAllKeys(STORE_NAME)
  } catch (e) {
    console.warn('⚠️ TTKIndexedDB.getAllMatrixIds 失败:', e)
    return []
  }
}

/**
 * 获取所有矩阵记录（慎用，数据可能很大）
 *
 * @returns {Promise<Array>}
 */
export async function getAllMatrixEntries() {
  try {
    const db = await getDB()
    return await db.getAll(STORE_NAME)
  } catch (e) {
    console.warn('⚠️ TTKIndexedDB.getAllMatrixEntries 失败:', e)
    return []
  }
}

/**
 * 获取矩阵记录数
 *
 * @returns {Promise<number>}
 */
export async function getMatrixCount() {
  try {
    const db = await getDB()
    return await db.count(STORE_NAME)
  } catch (e) {
    console.warn('⚠️ TTKIndexedDB.getMatrixCount 失败:', e)
    return 0
  }
}

/**
 * 获取统计信息（记录数 + 估算大小）
 *
 * @returns {Promise<Object>} { count, sizeKB, sizeMB }
 */
export async function getMatrixStats() {
  try {
    const db = await getDB()
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
    console.warn('⚠️ TTKIndexedDB.getMatrixStats 失败:', e)
    return { count: 0, sizeKB: 0, sizeMB: 0 }
  }
}

// ============================================================
// 对外 API：TTK 矩阵 - 写
// ============================================================

/**
 * 写入单条矩阵记录（覆盖）
 *
 * @param {string} id
 * @param {Object} data - { ttk, shots, hits, meta }
 * @returns {Promise<boolean>} 是否成功
 */
export async function setMatrixEntry(id, data) {
  try {
    const db = await getDB()
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
    console.warn('⚠️ TTKIndexedDB.setMatrixEntry 失败:', e)
    return false
  }
}

/**
 * ⭐ v3：批量写入矩阵（分片事务）
 *
 * 之前：一次性事务写 N 条，失败全回滚
 * 现在：按 BATCH_TX_SIZE（50）分片，失败只影响单批
 *
 * @param {Array<{id: string, ttk: number, shots: number, hits: number, meta: object}>} entries
 * @returns {Promise<number>} 成功写入数
 */
export async function setMatrixEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return 0

  try {
    const db = await getDB()
    const now = Date.now()
    let totalWritten = 0

    // 分片
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
        // 单批失败，继续下一批
        console.warn(`⚠️ TTKIndexedDB.setMatrixEntries 单批失败（${chunk.length} 条）:`, e)
      }
    }

    return totalWritten
  } catch (e) {
    console.warn('⚠️ TTKIndexedDB.setMatrixEntries 失败:', e)
    return 0
  }
}

// ============================================================
// 对外 API：TTK 矩阵 - 删
// ============================================================

/**
 * 删除单条矩阵记录
 *
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteMatrixEntry(id) {
  try {
    const db = await getDB()
    await db.delete(STORE_NAME, id)
    return true
  } catch (e) {
    console.warn('⚠️ TTKIndexedDB.deleteMatrixEntry 失败:', e)
    return false
  }
}

/**
 * ⭐ v3：批量删除（分片事务）
 *
 * @param {Array<string>} ids
 * @returns {Promise<number>} 成功删除数
 */
export async function deleteMatrixEntriesByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return 0

  try {
    const db = await getDB()
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
        console.warn(`⚠️ TTKIndexedDB.deleteMatrixEntriesByIds 单批失败（${chunk.length} 条）:`, e)
      }
    }

    return totalDeleted
  } catch (e) {
    console.warn('⚠️ TTKIndexedDB.deleteMatrixEntriesByIds 失败:', e)
    return 0
  }
}

/**
 * ⭐ v3：按前缀批量删除
 *
 * 用途：清空某武器的所有缓存（缓存 key 都以 `atk_{weaponId}_` 开头）
 *
 * @param {string} prefix - 前缀（如 "atk_41_"）
 * @returns {Promise<number>} 删除的数量
 */
export async function deleteMatrixEntriesByPrefix(prefix) {
  if (!prefix) return 0

  try {
    const db = await getDB()
    const allKeys = await db.getAllKeys(STORE_NAME)

    const matched = allKeys.filter(k => String(k).startsWith(prefix))
    if (matched.length === 0) return 0

    return await deleteMatrixEntriesByIds(matched)
  } catch (e) {
    console.warn('⚠️ TTKIndexedDB.deleteMatrixEntriesByPrefix 失败:', e)
    return 0
  }
}

/**
 * 清空所有矩阵记录
 *
 * @returns {Promise<boolean>}
 */
export async function clearMatrix() {
  try {
    const db = await getDB()
    await db.clear(STORE_NAME)
    return true
  } catch (e) {
    console.warn('⚠️ TTKIndexedDB.clearMatrix 失败:', e)
    return false
  }
}

// ============================================================
// 对外 API：配装面板状态
// ============================================================

/**
 * 保存配装面板状态
 *
 * @param {Object} state - { enemies: Array, budget: number }
 * @returns {Promise<boolean>}
 */
export async function saveRecPanelState(state) {
  if (!state || typeof state !== 'object') {
    console.warn('⚠️ saveRecPanelState: state 无效')
    return false
  }

  try {
    const db = await getDB()
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
    console.warn('⚠️ TTKIndexedDB.saveRecPanelState 失败:', e)
    return false
  }
}

/**
 * 读取配装面板状态
 *
 * @returns {Promise<Object|null>} { enemies, budget, savedAt } 或 null
 */
export async function loadRecPanelState() {
  try {
    const db = await getDB()
    const entry = await db.get(REC_PANEL_STORE_NAME, REC_PANEL_STATE_ID)
    if (!entry) return null

    // 版本校验：不匹配就丢弃
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
    console.warn('⚠️ TTKIndexedDB.loadRecPanelState 失败:', e)
    return null
  }
}

/**
 * 清空配装面板状态
 *
 * @returns {Promise<boolean>}
 */
export async function clearRecPanelState() {
  try {
    const db = await getDB()
    await db.delete(REC_PANEL_STORE_NAME, REC_PANEL_STATE_ID)
    return true
  } catch (e) {
    console.warn('⚠️ TTKIndexedDB.clearRecPanelState 失败:', e)
    return false
  }
}

// ============================================================
// 对外 API：通用
// ============================================================

/**
 * 请求持久化存储权限（可选）
 *
 * @returns {Promise<boolean>}
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
    console.warn('⚠️ TTKIndexedDB.requestPersistentStorage 失败:', e)
    return false
  }
}

/**
 * 关闭数据库连接（用于测试或重置）
 */
export async function closeDB() {
  try {
    if (dbPromise) {
      const db = await dbPromise
      db.close()
      dbPromise = null
    }
  } catch (e) {
    console.warn('⚠️ TTKIndexedDB.closeDB 失败:', e)
  }
}