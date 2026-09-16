// src/stores/dataStore.js
import { reactive } from 'vue'
import { getDataManager } from '@/core/DataManager'

const dm = getDataManager()

const state = reactive({
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
      state.armors = [...dm.getArmors()]
      state.isLoaded = true
      state.loadingError = null
      console.log(`✅ 数据加载完成: ${state.weapons.length} 把武器, ${state.bullets.length} 种子弹, ${state.prices.length} 条价格配置, ${state.armors.length} 条护甲数据`)
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

  refreshArmors() {
    state.armors = [...dm.getArmors()]
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
    state.modifiedVersion++
  },

  clearWeaponModified(weaponId) {
    dm.clearWeaponModified(weaponId)
    state.modifiedVersion++
  },

  /**
   * ⭐ 判断某把武器是否被修改（脏标记）
   * @param {number|string} weaponId
   * @returns {boolean}
   */
  isWeaponModified(weaponId) {
    void state.modifiedVersion   // 依赖收集，让组件能响应
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
    state.weapons = [...dm.getWeapons()]
    state.bullets = [...dm.getBullets()]
    state.prices = [...dm.getPrices()]
    state.armors = [...dm.getArmors()]
  },

  resetData() {
    dm.resetToOriginal()
    state.weapons = [...dm.getWeapons()]
    state.bullets = [...dm.getBullets()]
    state.prices = [...dm.getPrices()]
    state.armors = [...dm.getArmors()]
  }
}