// src/stores/dataStore.js
import { reactive } from 'vue'
import { getDataManager } from '@/core/DataManager'

const dm = getDataManager()

const state = reactive({
  weapons: [],
  bullets: [],
  prices: [],
  isLoaded: false,
  loadingError: null
})

export const dataStore = {
  // ⭐ 对外暴露可写 state（配合 UI 层的 v-model）
  // 说明：所有持久化写入仍走 dm.xxx + refreshXxx，
  //      UI 的 v-model 只改"内存里的临时副本"，
  //      最终由 DataManager 落库。
  state,

  // ============================================================
  // 数据加载
  // ============================================================
  async loadData() {
    try {
      if (!dm.isLoaded) {
        await dm.loadFromJSON('./data.json')
      }
      state.weapons = [...dm.getWeapons()]
      state.bullets = [...dm.getBullets()]
      state.prices = [...dm.getPrices()]
      state.isLoaded = true
      state.loadingError = null
      console.log(`✅ 数据加载完成: ${state.weapons.length} 把武器, ${state.bullets.length} 种子弹, ${state.prices.length} 条价格配置`)
    } catch (error) {
      state.loadingError = error.message
      console.error('❌ 数据加载失败:', error)
      throw error
    }
  },

  // ============================================================
  // 刷新数据（⭐ 使用新数组引用触发响应式）
  // ============================================================
  refreshPrices() {
    state.prices = [...dm.getPrices()]
  },

  refreshWeapons() {
    state.weapons = [...dm.getWeapons()]
  },

  refreshBullets() {
    state.bullets = [...dm.getBullets()]
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
  // ============================================================
  markWeaponModified(weaponId) {
    dm.markWeaponModified(weaponId)
  },

  clearWeaponModified(weaponId) {
    dm.clearWeaponModified(weaponId)
  },

  // ============================================================
  // 缓存
  // ============================================================
  getCacheStats() {
    return dm.getCacheStats()
  },

  clearAllCache() {
    return dm.clearAllCache()
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
    state.weapons = [...dm.getWeapons()]
    state.bullets = [...dm.getBullets()]
    state.prices = [...dm.getPrices()]
  },

  resetData() {
    dm.resetToOriginal()
    state.weapons = [...dm.getWeapons()]
    state.bullets = [...dm.getBullets()]
    state.prices = [...dm.getPrices()]
  }
}