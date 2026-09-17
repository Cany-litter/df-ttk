// src/core/TTKIndexedDB.js
//
// IndexedDB 封装（基于 idb 库）
//
// 职责：
// - 提供简单的 get / set / delete / clear / getAllKeys / count API
// - 用于持久化 TTK 矩阵（攻击侧 TTK / 防御侧 TTK）
// - 纯前端部署（如 GitHub Pages）可用，数据保存在浏览器 origin 下
//
// 存储结构：
//   数据库：df-ttk
//   版本：1
//   ObjectStore：ttk-matrix（keyPath: id）
//
// 记录结构：
//   {
//     id: string,          // 唯一 ID，如 "w41#1_b5.8#3_d4v110h4v48"
//     ttk: number,         // TTK（ms）
//     shots: number,       // 期望射击数
//     hits: number,        // 期望命中数
//     meta: object,        // 附加信息（武器 / 子弹 / 防御侧 / 场景等）
//     cachedAt: number,    // 缓存时间戳（ms）
//   }
//
// 使用：
//   import { setMatrixEntry, getMatrixEntry, clearMatrix, getMatrixStats } from './TTKIndexedDB.js'
//
//   await setMatrixEntry(id, { ttk, shots, hits, meta })
//   const entry = await getMatrixEntry(id)
//   await clearMatrix()
//   const stats = await getMatrixStats()

import { openDB } from 'idb'

// ============================================================
// 常量
// ============================================================

const DB_NAME = 'df-ttk'
const DB_VERSION = 1
const STORE_NAME = 'ttk-matrix'

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
    },
  })

  return dbPromise
}

// ============================================================
// 对外 API
// ============================================================

/**
 * 读取单条记录
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
 * 写入单条记录（覆盖）
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
 * 批量写入（事务内，更快）
 *
 * @param {Array<{id: string, ttk: number, shots: number, hits: number, meta: object}>} entries
 * @returns {Promise<number>} 成功写入数
 */
export async function setMatrixEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return 0

  try {
    const db = await getDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    let count = 0
    for (const e of entries) {
      if (!e || !e.id) continue
      store.put({
        id: e.id,
        ttk: e.ttk ?? 0,
        shots: e.shots ?? 0,
        hits: e.hits ?? 0,
        meta: e.meta ?? {},
        cachedAt: Date.now(),
      })
      count++
    }

    await tx.done
    return count
  } catch (e) {
    console.warn('⚠️ TTKIndexedDB.setMatrixEntries 失败:', e)
    return 0
  }
}

/**
 * 删除单条记录
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
 * 清空所有记录
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

/**
 * 获取所有 ID
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
 * 获取所有记录（慎用，数据可能很大）
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
 * 获取记录数
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

    // 估算大小：从 Navigator Storage API 获取
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

/**
 * 请求持久化存储权限（可选）
 *
 * 如果用户允许，浏览器在磁盘空间紧张时也不会清理数据。
 *
 * @returns {Promise<boolean>} 是否已获得持久化权限
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