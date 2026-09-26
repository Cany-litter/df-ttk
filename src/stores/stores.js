// src/stores/stores.js
//
// 统一状态管理（dataStore + paramsStore + appStore + equipStore）
//
// ⭐ 四个 store 的可写性差异（不要统一）：
//   - dataStore.state   → reactive（可写）
//   - paramsStore.state → readonly，只通过 update() / updateAll() 改
//   - appStore.state    → readonly，只通过方法改
//   - equipStore.state  → readonly，只通过方法改
//
// ⭐ dataStore 依赖 DataManager 单例，在模块顶层获取
//
// ⭐ 参数导出/导入（v3）：
//   - exportData(extra) 支持 extra 参数，把 params 一起导出
//   - importData(jsonStr) 返回 { data, params, equipState }
//
// ⭐ 其他物品（v5）：
//   - dataState.otherItems + refreshOtherItems()
//
// ⭐ 装备双模式（v7）：
//   - equipStore：mode + calcEquip（单套）+ scoreEquips（多套）
//
// ⭐ v7.1 修复进度条 850/0：
//   - updateCalcProgress 支持接收 total
//   - 新增 setCalcProgressTitle 方法
//
// ⭐ v7.3 增量导入：
//   - importData(jsonStr, options) 支持 options.mode
//   - 新增 clearImportMarks() 方法
//
// ⭐ v7.5 支持编辑配置 ID：
//   - 新增 updateConfigId(weaponId, oldConfigId, newConfigId)
//
// ⭐ v8 改动（全问题修复）：
//   - 问题 1：新增 hasModifiedWeapons / getModifiedWeaponIds（转发）
//   - 问题 2 / 12：updateConfigId 改为 async（转发到 DataManager 的异步版本）
//   - 问题 3 / 15：appStore 新增 weaponScoresGlobalRange 字段
//     用于单武器重算时的"全局分档对齐"
//   - 问题 8：无改动（App.vue 里处理）
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
  armors: [],
  otherItems: [],
  isLoaded: false,
  loadingError: null,

  modifiedVersion: 0
})

export const dataStore = {
  state: dataState,

  // ============================================================
  // 数据加载
  // ============================================================
  async loadData() {
    try {
      if (!dm.isLoaded) {
        const { params, equipState } = await dm.loadFromJSON('./data.json')

        dataState.weapons = [...dm.getWeapons()]
        dataState.bullets = [...dm.getBullets()]
        dataState.prices = [...dm.getPrices()]
        dataState.armors = [...dm.getArmors()]
        dataState.otherItems = [...dm.getOtherItems(true)]
        dataState.isLoaded = true
        dataState.loadingError = null

        console.log(`✅ 数据加载完成: ${dataState.weapons.length} 把武器, ${dataState.bullets.length} 种子弹, ${dataState.prices.length} 条价格配置, ${dataState.armors.length} 条护甲数据, ${dataState.otherItems.length} 条其他物品`)

        return { params, equipState }
      } else {
        dataState.weapons = [...dm.getWeapons()]
        dataState.bullets = [...dm.getBullets()]
        dataState.prices = [...dm.getPrices()]
        dataState.armors = [...dm.getArmors()]
        dataState.otherItems = [...dm.getOtherItems(true)]
        dataState.isLoaded = true
        dataState.loadingError = null

        return { params: null, equipState: null }
      }
    } catch (error) {
      dataState.loadingError = error.message
      console.error('❌ 数据加载失败:', error)
      throw error
    }
  },

  // ============================================================
  // 刷新数据
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

  refreshOtherItems() {
    dataState.otherItems = [...dm.getOtherItems(true)]
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

  // ---------- 护甲数据 ----------
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

  // ---------- 其他物品（v5） ----------
  getOtherItems(includeDisabled = false) {
    return dm.getOtherItems(includeDisabled)
  },

  getOtherItemsByCategory(category, includeDisabled = false) {
    return dm.getOtherItemsByCategory(category, includeDisabled)
  },

  getOtherItemById(id) {
    return dm.getOtherItemById(id)
  },

  getNextOtherItemId() {
    return dm.getNextOtherItemId()
  },

  addOtherItem(itemData) {
    return dm.addOtherItem(itemData)
  },

  updateOtherItem(id, updates) {
    return dm.updateOtherItem(id, updates)
  },

  removeOtherItem(id) {
    return dm.removeOtherItem(id)
  },

  setOtherItemsEnabled(enabled, category = null) {
    return dm.setOtherItemsEnabled(enabled, category)
  },

  getOtherItemCategories() {
    return dm.getOtherItemCategories()
  },

  // ---------- 价格配置 ----------
  addPriceConfig(weaponId, configData) {
    return dm.addPriceConfig(weaponId, configData)
  },

  removePriceConfig(weaponId, configId) {
    return dm.removePriceConfig(weaponId, configId)
  },

  updatePriceConfig(weaponId, configId, updates) {
    return dm.updatePriceConfig(weaponId, configId, updates)
  },

  /**
   * ⭐ v7.5 / v8：修改配置 ID（序号）
   *
   * ⭐ v8：改为 async（因为 DataManager 要清 IndexedDB 缓存）
   *
   * @param {number} weaponId
   * @param {string} oldConfigId
   * @param {string} newConfigId
   * @returns {Promise<{ ok: boolean, error?: string, cacheDeleted?: number }>}
   */
  async updateConfigId(weaponId, oldConfigId, newConfigId) {
    const result = await dm.updateConfigId(weaponId, oldConfigId, newConfigId)

    if (result.ok) {
      // 数据变了，刷新价格列表
      dataState.prices = [...dm.getPrices()]
      dataState.modifiedVersion++
    }

    return result
  },

  // ---------- 子弹 ----------
  addBullet(bulletData) {
    return dm.addBullet(bulletData)
  },

  removeBullet(bulletId) {
    return dm.removeBullet(bulletId)
  },

  updateBullet(bulletId, updates) {
    return dm.updateBullet(bulletId, updates)
  },

  // ---------- 枪管 ----------
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
  // 修改追踪（v8：新增便捷方法）
  // ============================================================
  markWeaponModified(weaponId) {
    dm.markWeaponModified(weaponId)
    dataState.modifiedVersion++
  },

  clearWeaponModified(weaponId) {
    dm.clearWeaponModified(weaponId)
    dataState.modifiedVersion++
  },

  isWeaponModified(weaponId) {
    void dataState.modifiedVersion
    const id = typeof weaponId === 'string' ? parseInt(weaponId) : weaponId
    if (isNaN(id)) return false
    return dm.isWeaponModified(id)
  },

  /**
   * ⭐ v8：问题 1 - 获取所有"脏武器"的 ID 列表
   *
   * 用途：评分引擎在算评分时，跳过这些武器的缓存（强制重算）
   *
   * @returns {Array<number>}
   */
  getModifiedWeaponIds() {
    void dataState.modifiedVersion
    return dm.getModifiedWeaponIds()
  },

  /**
   * ⭐ v8：问题 1 - 是否有任何脏武器
   *
   * @returns {boolean}
   */
  hasModifiedWeapons() {
    void dataState.modifiedVersion
    return dm.hasModifiedWeapons()
  },

  /**
   * ⭐ v8：清空所有"脏"标记
   */
  clearAllModified() {
    dm.clearAllModified()
    dataState.modifiedVersion++
  },

  // ---------- 数据导入导出 ----------
  getDataManager() {
    return dm
  },

  /**
   * ⭐ 导出数据
   */
  exportData(extra = {}) {
    dm.exportToFile(null, extra)
  },

  /**
   * ⭐ 导入数据
   */
  importData(jsonStr, options = {}) {
    const result = dm.importFromJSON(jsonStr, options)

    dataState.weapons = [...dm.getWeapons()]
    dataState.bullets = [...dm.getBullets()]
    dataState.prices = [...dm.getPrices()]
    dataState.armors = [...dm.getArmors()]
    dataState.otherItems = [...dm.getOtherItems(true)]

    return result
  },

  /**
   * ⭐ v7.3：清除所有导入标记
   */
  clearImportMarks() {
    const count = dm.clearImportMarks()

    dataState.weapons = [...dm.getWeapons()]
    dataState.prices = [...dm.getPrices()]

    return count
  },

  resetData() {
    dm.resetToOriginal()
    dataState.weapons = [...dm.getWeapons()]
    dataState.bullets = [...dm.getBullets()]
    dataState.prices = [...dm.getPrices()]
    dataState.armors = [...dm.getArmors()]
    dataState.otherItems = [...dm.getOtherItems(true)]
  }
}

// ============================================================
// 2. paramsStore
// ============================================================

const DEFAULT_PARAMS = {
  bulletLevel: 4,
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

  // 开镜时间权重（0.4 = 开镜时间按 40% 计入评分）
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
// 3. equipStore（v7 双模式）
// ============================================================

function _makeEquip(armor, helmet) {
  return {
    armorId: armor.id,
    helmetId: helmet.id,
    armorName: armor.name,
    helmetName: helmet.name,
    armorLevel: armor.level,
    armorValue: armor.value,
    helmetLevel: helmet.level,
    helmetValue: helmet.value,
  }
}

function _getDefaultCalcEquip() {
  const armors = dm.getArmorsByType('armor', true) || []
  const helmets = dm.getArmorsByType('helmet', true) || []

  const defaultArmor = armors.find(a => a.level === 4 && a.value === 110)
  const defaultHelmet = helmets.find(h => h.level === 4 && h.value === 48)

  if (!defaultArmor || !defaultHelmet) {
    console.warn(
      '⚠️ equipStore: 未找到默认装备（4甲110 + 4头48），calcEquip 初始化为 null'
    )
    return null
  }

  return _makeEquip(defaultArmor, defaultHelmet)
}

function _isValidEquip(eq) {
  if (!eq || typeof eq !== 'object') return false
  if (!eq.armorId || !eq.helmetId) return false
  if (typeof eq.armorLevel !== 'number' || typeof eq.armorValue !== 'number') return false
  if (typeof eq.helmetLevel !== 'number' || typeof eq.helmetValue !== 'number') return false
  return true
}

function _normalizeEquip(eq) {
  return {
    armorId: eq.armorId,
    helmetId: eq.helmetId,
    armorName: eq.armorName || '',
    helmetName: eq.helmetName || '',
    armorLevel: eq.armorLevel,
    armorValue: eq.armorValue,
    helmetLevel: eq.helmetLevel,
    helmetValue: eq.helmetValue,
  }
}

function _makeEquipKey(armorId, helmetId) {
  return `${armorId}|${helmetId}`
}

const _defaultCalcEquip = _getDefaultCalcEquip()

const equipState = reactive({
  mode: 'calc',

  calcEquip: _defaultCalcEquip,

  scoreEquips: _defaultCalcEquip ? [_defaultCalcEquip] : [],
})

export const equipStore = {
  state: readonly(equipState),

  // ============================================================
  // 模式切换
  // ============================================================

  setMode(mode) {
    if (mode !== 'calc' && mode !== 'score') {
      console.warn(`⚠️ equipStore.setMode: 无效模式 ${mode}`)
      return
    }
    equipState.mode = mode
  },

  // ============================================================
  // 计算装备（单套）
  // ============================================================

  setCalcEquip(equip) {
    if (equip === null) {
      equipState.calcEquip = null
      return
    }
    if (!_isValidEquip(equip)) {
      console.warn('⚠️ equipStore.setCalcEquip: 非法项', equip)
      return
    }
    equipState.calcEquip = _normalizeEquip(equip)
  },

  clearCalcEquip() {
    equipState.calcEquip = null
  },

  // ============================================================
  // 评分参考（多套）
  // ============================================================

  setScoreEquips(list) {
    if (!Array.isArray(list)) {
      console.warn('⚠️ equipStore.setScoreEquips: 参数不是数组')
      return
    }

    const seen = new Set()
    const result = []

    for (const eq of list) {
      if (!_isValidEquip(eq)) {
        console.warn('⚠️ equipStore.setScoreEquips: 跳过非法项', eq)
        continue
      }
      const key = _makeEquipKey(eq.armorId, eq.helmetId)
      if (seen.has(key)) continue
      seen.add(key)
      result.push(_normalizeEquip(eq))
    }

    equipState.scoreEquips = result
    console.log(`✅ equipStore: 评分参考已设置 ${result.length} 套`)
  },

  addScoreEquip(equip) {
    if (!_isValidEquip(equip)) {
      console.warn('⚠️ equipStore.addScoreEquip: 非法项', equip)
      return false
    }

    const key = _makeEquipKey(equip.armorId, equip.helmetId)
    const exists = equipState.scoreEquips.some(
      e => _makeEquipKey(e.armorId, e.helmetId) === key
    )
    if (exists) return false

    equipState.scoreEquips = [
      ...equipState.scoreEquips,
      _normalizeEquip(equip),
    ]
    return true
  },

  removeScoreEquip(armorId, helmetId) {
    if (!armorId || !helmetId) return false
    const key = _makeEquipKey(armorId, helmetId)
    const before = equipState.scoreEquips.length
    equipState.scoreEquips = equipState.scoreEquips.filter(
      e => _makeEquipKey(e.armorId, e.helmetId) !== key
    )
    return equipState.scoreEquips.length < before
  },

  clearScoreEquips() {
    equipState.scoreEquips = []
  },

  setEquipsByMode(list) {
    if (equipState.mode === 'calc') {
      const first = Array.isArray(list) && list.length > 0 ? list[0] : null
      this.setCalcEquip(first)
    } else {
      this.setScoreEquips(list)
    }
  },

  getCount() {
    if (equipState.mode === 'calc') {
      return equipState.calcEquip ? 1 : 0
    }
    return equipState.scoreEquips.length
  },

  getCalcEquip() {
    return equipState.calcEquip
  },

  getScoreEquips() {
    return equipState.scoreEquips
  },

  getDefaultCalcEquip() {
    return _getDefaultCalcEquip()
  },

  resetToDefault() {
    const def = _getDefaultCalcEquip()
    equipState.mode = 'calc'
    equipState.calcEquip = def
    equipState.scoreEquips = def ? [def] : []
    console.log('✅ equipStore: 已重置为默认')
  },

  exportState() {
    return {
      mode: equipState.mode,
      calcEquip: equipState.calcEquip ? { ...equipState.calcEquip } : null,
      scoreEquips: equipState.scoreEquips.map(e => ({ ...e })),
    }
  },

  loadFromImported(equipStateRaw) {
    if (!equipStateRaw) return 0

    if (Array.isArray(equipStateRaw)) {
      const result = this._validateAndNormalize(equipStateRaw)
      equipState.mode = 'score'
      equipState.calcEquip = result[0] || null
      equipState.scoreEquips = result
      console.log(`✅ equipStore: 从老格式恢复 ${result.length} 套（当成 scoreEquips）`)
      return result.length
    }

    if (typeof equipStateRaw === 'object') {
      const mode = (equipStateRaw.mode === 'score') ? 'score' : 'calc'

      let calcEquip = null
      if (equipStateRaw.calcEquip && _isValidEquip(equipStateRaw.calcEquip)) {
        const validated = this._validateAndNormalize([equipStateRaw.calcEquip])
        calcEquip = validated[0] || null
      }

      let scoreEquips = []
      if (Array.isArray(equipStateRaw.scoreEquips)) {
        scoreEquips = this._validateAndNormalize(equipStateRaw.scoreEquips)
      }

      equipState.mode = mode
      equipState.calcEquip = calcEquip
      equipState.scoreEquips = scoreEquips

      console.log(`✅ equipStore: 从新格式恢复 mode=${mode}, calcEquip=${calcEquip ? '有' : '无'}, scoreEquips=${scoreEquips.length} 套`)
      return scoreEquips.length
    }

    return 0
  },

  _validateAndNormalize(list) {
    if (!Array.isArray(list)) return []

    const armors = dm.getArmorsByType('armor', true) || []
    const helmets = dm.getArmorsByType('helmet', true) || []
    const armorIds = new Set(armors.map(a => a.id))
    const helmetIds = new Set(helmets.map(h => h.id))

    const seen = new Set()
    const result = []

    for (const eq of list) {
      if (!_isValidEquip(eq)) continue
      if (!armorIds.has(eq.armorId)) continue
      if (!helmetIds.has(eq.helmetId)) continue

      const key = _makeEquipKey(eq.armorId, eq.helmetId)
      if (seen.has(key)) continue
      seen.add(key)

      const armor = armors.find(a => a.id === eq.armorId)
      const helmet = helmets.find(h => h.id === eq.helmetId)

      result.push(_makeEquip(armor, helmet))
    }

    return result
  },
}

// ============================================================
// 4. appStore
//
// ⭐ v8：新增 weaponScoresGlobalRange
//   用于单武器重算时的"全局分档对齐"
// ============================================================

const appState = reactive({
  currentTab: 'weapon',
  currentSubTab: 'bullet',

  ttkResults: [],
  havocCosts: {},

  // ⭐ 综合评分（多套装备）
  // 结构：{ "weaponId_configId": { score, grade } }
  weaponScores: {},

  // ⭐ v8：全局评分范围（用于单武器重算时分档对齐）
  // 结构：{ min, max }（全量算评分后写入）
  weaponScoresGlobalRange: { min: 0, max: 0 },

  isLoading: false,
  isGlobalCalculating: false,
  updatingWeaponIds: [],

  showBarrelEditor: false,
  editingWeaponId: null,

  showBaseEditor: false,
  editingBaseWeaponId: null,

  showAllWeapons: true,
  highlightWeapon: null,

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

  // ---------- Tab ----------
  switchTab(tab) {
    if (['weapon', 'items', 'rec'].includes(tab)) {
      appState.currentTab = tab
    }
  },

  switchSubTab(sub) {
    if (['bullet', 'armor', 'helmet', 'other'].includes(sub)) {
      appState.currentSubTab = sub
    }
  },

  // ---------- 结果 ----------
  setTtkResults(results) {
    appState.ttkResults = results
  },

  setHavocCosts(costs) {
    appState.havocCosts = costs
  },

  // ---------- 综合评分 ----------
  setWeaponScores(scores) {
    appState.weaponScores = scores || {}
  },

  getWeaponScore(weaponId, configId) {
    const key = `${weaponId}_${configId}`
    return appState.weaponScores[key] || null
  },

  /**
   * ⭐ v8：设置全局评分范围
   *
   * @param {{ min: number, max: number }} range
   */
  setWeaponScoresGlobalRange(range) {
    if (range && typeof range.min === 'number' && typeof range.max === 'number') {
      appState.weaponScoresGlobalRange = { min: range.min, max: range.max }
    }
  },

  /**
   * ⭐ v8：获取全局评分范围
   */
  getWeaponScoresGlobalRange() {
    return appState.weaponScoresGlobalRange
  },

  /**
   * ⭐ v8：清空综合评分（连全局范围一起清）
   */
  clearWeaponScores() {
    appState.weaponScores = {}
    appState.weaponScoresGlobalRange = { min: 0, max: 0 }
  },

  // ---------- 全局计算状态 ----------
  setGlobalCalculating(calculating) {
    appState.isGlobalCalculating = !!calculating
  },

  // ---------- 单枪更新状态 ----------
  addUpdatingWeapon(weaponId) {
    const id = typeof weaponId === 'string' ? parseInt(weaponId) : weaponId
    if (isNaN(id)) return
    if (!appState.updatingWeaponIds.includes(id)) {
      appState.updatingWeaponIds.push(id)
    }
  },

  removeUpdatingWeapon(weaponId) {
    const id = typeof weaponId === 'string' ? parseInt(weaponId) : weaponId
    if (isNaN(id)) return
    const idx = appState.updatingWeaponIds.indexOf(id)
    if (idx !== -1) {
      appState.updatingWeaponIds.splice(idx, 1)
    }
  },

  isUpdatingWeapon(weaponId) {
    const id = typeof weaponId === 'string' ? parseInt(weaponId) : weaponId
    if (isNaN(id)) return false
    return appState.updatingWeaponIds.includes(id)
  },

  // ---------- 加载状态 ----------
  setLoading(loading) {
    appState.isLoading = !!loading
  },

  // ---------- 编辑器 ----------
  openBarrelEditor(weaponId) {
    appState.editingWeaponId = weaponId
    appState.showBarrelEditor = true
  },

  closeBarrelEditor() {
    appState.showBarrelEditor = false
    appState.editingWeaponId = null
  },

  openBaseEditor(weaponId) {
    appState.editingBaseWeaponId = weaponId
    appState.showBaseEditor = true
  },

  closeBaseEditor() {
    appState.showBaseEditor = false
    appState.editingBaseWeaponId = null
  },

  toggleShowAllWeapons() {
    appState.showAllWeapons = !appState.showAllWeapons
  },

  setShowAllWeapons(show) {
    appState.showAllWeapons = show
  },

  setHighlightWeapon(weaponName) {
    appState.highlightWeapon = weaponName
  },

  clearHighlightWeapon() {
    appState.highlightWeapon = null
  },

  // ============================================================
  // 进度
  // ============================================================

  showCalcProgress(title, total) {
    appState.calcProgress.visible = true
    appState.calcProgress.percent = 0
    appState.calcProgress.current = 0
    appState.calcProgress.total = (typeof total === 'number' && total > 0) ? total : 0
    appState.calcProgress.title = title || '计算中...'
  },

  updateCalcProgress(current, total) {
    appState.calcProgress.current = current

    if (typeof total === 'number' && total > 0) {
      appState.calcProgress.total = total
    }

    const t = appState.calcProgress.total
    const raw = t > 0 ? (current / t) * 100 : 0
    appState.calcProgress.percent = Math.min(100, Math.round(raw))
  },

  setCalcProgressTitle(title) {
    appState.calcProgress.title = String(title || '计算中...')
  },

  hideCalcProgress() {
    appState.calcProgress.visible = false
    appState.calcProgress.percent = 0
    appState.calcProgress.current = 0
    appState.calcProgress.total = 0
    appState.calcProgress.title = '计算中...'
  }
}

// ============================================================
// 默认导出
// ============================================================
export default {
  dataStore,
  paramsStore,
  appStore,
  equipStore,
}