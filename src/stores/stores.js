// src/stores/stores.js
//
// 统一状态管理（dataStore + paramsStore + appStore 合并）
//
// ⭐ 三个 store 的可写性差异（不要统一）：
//   - dataStore.state   → reactive（可写），因为 WeaponTable 等组件有 v-model 直接改字段
//   - paramsStore.state → readonly，只通过 update() / updateAll() 改
//   - appStore.state    → readonly，只通过方法改
//
// ⭐ dataStore 依赖 DataManager 单例，在模块顶层获取
//
// 本文件由原 dataStore.js / paramsStore.js / appStore.js 合并而来。

import { reactive, readonly } from 'vue'
import { getDataManager } from '@/core/DataManager'

// ============================================================
// DataManager 单例（dataStore 用）
// ============================================================
const dm = getDataManager()

// ============================================================
// 1. dataStore
// ============================================================

const dataState = reactive({
  weapons: [],
  bullets: [],
  prices: [],
  armors: [],       // ⭐ 护甲/头盔数据
  isLoaded: false,
  loadingError: null,

  // ⭐ 修改追踪版本号
  // 每次 markWeaponModified / clearWeaponModified 时 +1，
  // 用于让组件感知"脏标记"变化（因为 modifiedWeaponIds 是 Set，非响应式）
  modifiedVersion: 0
})

export const dataStore = {
  // ⭐ 对外暴露可写 state（配合 UI 层的 v-model）
  state: dataState,

  // ============================================================
  // 数据加载
  // ============================================================
  async loadData() {
    try {
      if (!dm.isLoaded) {
        await dm.loadFromJSON('./data.json')
      }
      dataState.weapons = [...dm.getWeapons()]
      dataState.bullets = [...dm.getBullets()]
      dataState.prices = [...dm.getPrices()]
      dataState.armors = [...dm.getArmors()]
      dataState.isLoaded = true
      dataState.loadingError = null
      console.log(`✅ 数据加载完成: ${dataState.weapons.length} 把武器, ${dataState.bullets.length} 种子弹, ${dataState.prices.length} 条价格配置, ${dataState.armors.length} 条护甲数据`)
    } catch (error) {
      dataState.loadingError = error.message
      console.error('❌ 数据加载失败:', error)
      throw error
    }
  },

  // ============================================================
  // 刷新数据（⭐ 使用新数组引用触发响应式）
  // ============================================================
  refreshPrices() {
    dataState.prices = [...dm.getPrices()]
  },

  refreshWeapons() {
    dataState.weapons = [...dm.getWeapons()]
  },

  refreshBullets() {
    dataState.bullets = [...dm.getBullets()]
  },

  refreshArmors() {
    dataState.armors = [...dm.getArmors()]
  },

  // ============================================================
  // 获取数据
  // ============================================================
  getPriceRows() {
    return dm.getPriceRows()
  },

  getPriceRowsForWeapon(weaponId) {
    return dm.getPriceRowsForWeapon(weaponId)
  },

  getWeaponById(id) {
    return dm.getWeaponById(id)
  },

  getWeapons() {
    return dm.getWeapons()
  },

  getBullets() {
    return dm.getBullets()
  },

  getPriceByWeaponId(weaponId) {
    return dm.getPriceByWeaponId(weaponId)
  },

  getBulletById(id) {
    return dm.getBulletById(id)
  },

  getBulletsByCaliber(caliber) {
    return dm.getBulletsByCaliber(caliber)
  },

  getBulletByCaliberAndLevel(caliber, level) {
    return dm.getBulletByCaliberAndLevel(caliber, level)
  },

  findBarrelIdByName(weaponId, barrelName) {
    return dm.findBarrelIdByName(weaponId, barrelName)
  },

  findBestBarrelIndex(weaponId) {
    return dm.findBestBarrelIndex(weaponId)
  },

  findBestBarrelName(weaponId) {
    return dm.findBestBarrelName(weaponId)
  },

  getNextConfigId(weaponId) {
    return dm.getNextConfigId(weaponId)
  },

  getMuzzles() {
    return dm.getMuzzles()
  },

  getMuzzleById(id) {
    return dm.getMuzzleById(id)
  },

  getMuzzleBonuses(muzzleId) {
    return dm.getMuzzleBonuses(muzzleId)
  },

  getMuzzleNames() {
    return dm.getMuzzleNames()
  },

  getHitRateFromMap(hitRateMap, distance, fallback = 0.85) {
    return dm.getHitRateFromMap(hitRateMap, distance, fallback)
  },

  getPrices() {
    return dm.getPrices()
  },

  // ============================================================
  // ⭐ 护甲数据
  // ============================================================
  getArmors() {
    return dm.getArmors()
  },

  getArmorsByType(type) {
    return dm.getArmorsByType(type)
  },

  getArmorById(id) {
    return dm.getArmorById(id)
  },

  addArmor(armorData) {
    return dm.addArmor(armorData)
  },

  updateArmor(id, updates) {
    return dm.updateArmor(id, updates)
  },

  removeArmor(id) {
    return dm.removeArmor(id)
  },

  // ============================================================
  // 价格配置管理
  // ============================================================
  addPriceConfig(weaponId, configData) {
    return dm.addPriceConfig(weaponId, configData)
  },

  removePriceConfig(weaponId, configId) {
    return dm.removePriceConfig(weaponId, configId)
  },

  updatePriceConfig(weaponId, configId, updates) {
    return dm.updatePriceConfig(weaponId, configId, updates)
  },

  // ============================================================
  // 子弹管理
  // ============================================================
  addBullet(bulletData) {
    return dm.addBullet(bulletData)
  },

  removeBullet(bulletId) {
    return dm.removeBullet(bulletId)
  },

  updateBullet(bulletId, updates) {
    return dm.updateBullet(bulletId, updates)
  },

  // ============================================================
  // 枪管管理
  // ============================================================
  addWeaponBarrel(weaponId, barrelData) {
    return dm.addWeaponBarrel(weaponId, barrelData)
  },

  removeWeaponBarrel(weaponId, barrelIndex) {
    return dm.removeWeaponBarrel(weaponId, barrelIndex)
  },

  updateWeaponBarrel(weaponId, barrelIndex, updates) {
    return dm.updateWeaponBarrel(weaponId, barrelIndex, updates)
  },

  // ============================================================
  // 修改追踪
  // ⭐ 每次 mark / clear 后 modifiedVersion 自增，
  //    让依赖 state.modifiedVersion 的组件重新渲染
  // ============================================================

  markWeaponModified(weaponId) {
    dm.markWeaponModified(weaponId)
    dataState.modifiedVersion++
  },

  clearWeaponModified(weaponId) {
    dm.clearWeaponModified(weaponId)
    dataState.modifiedVersion++
  },

  /**
   * ⭐ 判断某把武器是否被修改（脏标记）
   * @param {number|string} weaponId
   * @returns {boolean}
   */
  isWeaponModified(weaponId) {
    void dataState.modifiedVersion   // 依赖收集，让组件能响应
    const id = typeof weaponId === 'string' ? parseInt(weaponId) : weaponId
    if (isNaN(id)) return false
    return dm.isWeaponModified(id)
  },

  // ============================================================
  // 数据导入导出
  // ============================================================
  getDataManager() {
    return dm
  },

  exportData(includeCache = true) {
    dm.exportToFile(null, includeCache)
  },

  importData(jsonStr) {
    dm.importFromJSON(jsonStr)
    dataState.weapons = [...dm.getWeapons()]
    dataState.bullets = [...dm.getBullets()]
    dataState.prices = [...dm.getPrices()]
    dataState.armors = [...dm.getArmors()]
  },

  resetData() {
    dm.resetToOriginal()
    dataState.weapons = [...dm.getWeapons()]
    dataState.bullets = [...dm.getBullets()]
    dataState.prices = [...dm.getPrices()]
    dataState.armors = [...dm.getArmors()]
  }
}

// ============================================================
// 2. paramsStore
// ============================================================

const DEFAULT_PARAMS = {
  bulletLevel: 4,
  armorLevel: 4,
  armorValue: 110,
  helmetLevel: 4,
  helmetValue: 48,
  healthValue: 100,
  distance: 30,
  hitRateMap: [
    { distance: 30, rate: 1.0 },
    { distance: 50, rate: 0.9 },
    { distance: 100, rate: 0.6 }
  ],
  hitProb: {
    head: 0.1,
    chest: 0.3,
    stomach: 0.3,
    limbs: 0.3
  },
  triggerDelayEnable: true,
  kdRatio: 1.0,
  extractRate: 0.5,
  extraCost: 30,

  // ⭐ 开镜时间权重（0.4 = 开镜时间按 40% 计入假 TTK）
  aimWeight: 0.4
}

const paramsState = reactive({ ...DEFAULT_PARAMS })

function getHitRateFromMap(map, distance) {
  if (!map || map.length === 0) return 0.85
  const sorted = [...map].sort((a, b) => a.distance - b.distance)
  if (distance <= sorted[0].distance) return Math.min(1, sorted[0].rate)
  if (distance >= sorted[sorted.length - 1].distance) return sorted[sorted.length - 1].rate
  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i], p2 = sorted[i + 1]
    if (distance >= p1.distance && distance < p2.distance) {
      const t = (distance - p1.distance) / (p2.distance - p1.distance)
      return p1.rate + t * (p2.rate - p1.rate)
    }
  }
  return sorted[sorted.length - 1].rate
}

export const paramsStore = {
  state: readonly(paramsState),

  get hitRate() {
    return getHitRateFromMap(paramsState.hitRateMap, paramsState.distance)
  },

  update(key, value) {
    if (key in paramsState) paramsState[key] = value
  },

  updateAll(newParams) {
    Object.assign(paramsState, newParams)
  },

  updateHitRateMap(raw) {
    if (!raw || raw.trim() === '') {
      paramsState.hitRateMap = []
      return
    }
    try {
      const parts = raw.split(',').map(p => p.trim())
      const map = []
      for (const part of parts) {
        const [dist, rate] = part.split(':')
        if (dist && rate) {
          const distance = parseFloat(dist)
          const hitRate = parseFloat(rate)
          if (!isNaN(distance) && !isNaN(hitRate) && hitRate >= 0 && hitRate <= 1) {
            map.push({ distance, rate: hitRate })
          }
        }
      }
      paramsState.hitRateMap = map
    } catch (e) {
      console.warn('解析命中率映射失败:', e)
    }
  },

  reset() {
    Object.assign(paramsState, DEFAULT_PARAMS)
  }
}

// ============================================================
// 3. appStore
// ============================================================

const appState = reactive({
  // ⭐ 主 Tab：'weapon'（枪械数据） | 'items'（弹甲数据） | 'rec'（配装推荐）
  currentTab: 'weapon',

  // ⭐ 子 Tab（仅用于 items）：'bullet' | 'armor' | 'helmet'
  currentSubTab: 'bullet',

  ttkResults: [],
  havocCosts: {},

  // ⭐ 评分原始数据
  // 结构：{ "weaponId_configId": { ttk: 420.5, aim: 350 } }
  // - ttk: 加权平均 TTK（ms）
  // - aim: 开镜时间（ms）
  //
  // 综合评分（假 TTK）在组件层实时计算：
  //   假TTK = 1 × ttk + aimWeight × aim
  scores: {},

  isLoading: false,

  // ⭐ 全局计算中状态（用于互斥判断）
  // - true 时：单枪「更新 TTK」按钮禁用
  isGlobalCalculating: false,

  // ⭐ 单枪更新中的武器 ID 列表（响应式，用于按钮 loading 状态）
  // - 非空时：全局「计算 TTK」「生成折线图」按钮禁用
  updatingWeaponIds: [],

  // 枪管编辑器
  showBarrelEditor: false,
  editingWeaponId: null,

  // 基础属性编辑器
  showBaseEditor: false,
  editingBaseWeaponId: null,

  showAllWeapons: true,
  highlightWeapon: null,

  // 计算进度状态
  calcProgress: {
    visible: false,
    percent: 0,
    current: 0,
    total: 0,
    title: '计算中...'
  }
})

export const appStore = {
  state: readonly(appState),

  // ============================================================
  // 主 Tab 切换
  // ⭐ 白名单：'weapon' | 'items' | 'rec'
  // ============================================================
  switchTab(tab) {
    if (['weapon', 'items', 'rec'].includes(tab)) {
      appState.currentTab = tab
    }
  },

  // ============================================================
  // ⭐ 子 Tab 切换（弹甲数据内部）
  // 白名单：'bullet' | 'armor' | 'helmet'
  // ============================================================
  switchSubTab(sub) {
    if (['bullet', 'armor', 'helmet'].includes(sub)) {
      appState.currentSubTab = sub
    }
  },

  // ============================================================
  // TTK 结果
  // ============================================================
  setTtkResults(results) {
    appState.ttkResults = results
  },

  // ============================================================
  // 哈弗币消耗
  // ============================================================
  setHavocCosts(costs) {
    appState.havocCosts = costs
  },

  // ============================================================
  // ⭐ 评分原始数据（ttk + aim）
  //
  // 结构：{ "weaponId_configId": { ttk, aim } }
  // 例：{ "41_#1": { ttk: 420.5, aim: 350 }, "1_#1": { ttk: 500.1, aim: 280 } }
  //
  // ⭐ 综合评分（假 TTK）由组件层通过 paramsStore.state.aimWeight 计算：
  //   假TTK = 1 × ttk + aimWeight × aim
  // ============================================================
  setScores(scores) {
    appState.scores = scores || {}
  },

  /**
   * ⭐ 获取单个配置的评分原始数据
   * @param {number|string} weaponId
   * @param {string} configId
   * @returns {{ ttk: number, aim: number } | null}
   */
  getScore(weaponId, configId) {
    const key = `${weaponId}_${configId}`
    return appState.scores[key] || null
  },

  // ============================================================
  // ⭐ 全局计算状态管理（用于互斥判断）
  // ============================================================

  /**
   * 设置全局计算中状态
   * @param {boolean} calculating
   */
  setGlobalCalculating(calculating) {
    appState.isGlobalCalculating = !!calculating
  },

  // ============================================================
  // ⭐ 单枪更新状态管理
  // 用于「🔄 更新 TTK」按钮的 loading 状态
  // ============================================================

  /**
   * 标记某把武器正在更新中
   * @param {number|string} weaponId
   */
  addUpdatingWeapon(weaponId) {
    const id = typeof weaponId === 'string' ? parseInt(weaponId) : weaponId
    if (isNaN(id)) return
    if (!appState.updatingWeaponIds.includes(id)) {
      appState.updatingWeaponIds.push(id)
    }
  },

  /**
   * 取消某把武器的更新中状态
   * @param {number|string} weaponId
   */
  removeUpdatingWeapon(weaponId) {
    const id = typeof weaponId === 'string' ? parseInt(weaponId) : weaponId
    if (isNaN(id)) return
    const idx = appState.updatingWeaponIds.indexOf(id)
    if (idx !== -1) {
      appState.updatingWeaponIds.splice(idx, 1)
    }
  },

  /**
   * 判断某把武器是否正在更新中
   * @param {number|string} weaponId
   * @returns {boolean}
   */
  isUpdatingWeapon(weaponId) {
    const id = typeof weaponId === 'string' ? parseInt(weaponId) : weaponId
    if (isNaN(id)) return false
    return appState.updatingWeaponIds.includes(id)
  },

  // ============================================================
  // 加载状态
  // ============================================================
  setLoading(loading) {
    appState.isLoading = loading
  },

  // ============================================================
  // 枪管编辑器
  // ============================================================
  openBarrelEditor(weaponId) {
    appState.editingWeaponId = weaponId
    appState.showBarrelEditor = true
  },

  closeBarrelEditor() {
    appState.showBarrelEditor = false
    appState.editingWeaponId = null
  },

  // ============================================================
  // 基础属性编辑器
  // ============================================================
  openBaseEditor(weaponId) {
    appState.editingBaseWeaponId = weaponId
    appState.showBaseEditor = true
  },

  closeBaseEditor() {
    appState.showBaseEditor = false
    appState.editingBaseWeaponId = null
  },

  // ============================================================
  // 显示全部武器
  // ============================================================
  toggleShowAllWeapons() {
    appState.showAllWeapons = !appState.showAllWeapons
  },

  setShowAllWeapons(show) {
    appState.showAllWeapons = show
  },

  // ============================================================
  // 高亮武器
  // ============================================================
  setHighlightWeapon(weaponName) {
    appState.highlightWeapon = weaponName
  },

  clearHighlightWeapon() {
    appState.highlightWeapon = null
  },

  // ============================================================
  // 计算进度管理
  // ============================================================

  /**
   * 显示计算进度遮罩
   * @param {string} title - 进度标题，如 "计算 TTK 中..."
   * @param {number} total - 总任务数
   */
  showCalcProgress(title, total) {
    appState.calcProgress.visible = true
    appState.calcProgress.percent = 0
    appState.calcProgress.current = 0
    appState.calcProgress.total = total
    appState.calcProgress.title = title || '计算中...'
  },

  /**
   * 更新计算进度
   * @param {number} current - 当前已完成数
   */
  updateCalcProgress(current) {
    appState.calcProgress.current = current
    const total = appState.calcProgress.total
    appState.calcProgress.percent = total > 0
      ? Math.round((current / total) * 100)
      : 0
  },

  /**
   * 隐藏计算进度遮罩
   */
  hideCalcProgress() {
    appState.calcProgress.visible = false
    appState.calcProgress.percent = 0
    appState.calcProgress.current = 0
    appState.calcProgress.total = 0
    appState.calcProgress.title = '计算中...'
  }
}

// ============================================================
// 默认导出（可选，方便整体 import）
// ============================================================
export default {
  dataStore,
  paramsStore,
  appStore
}