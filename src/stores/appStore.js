// src/stores/appStore.js
import { reactive, readonly } from 'vue'

const state = reactive({
  // ⭐ 主 Tab：'weapon'（枪械数据） | 'items'（弹甲数据）
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
  state: readonly(state),

  // ============================================================
  // 主 Tab 切换
  // ⭐ 白名单：'weapon' | 'items'
  // ============================================================
  switchTab(tab) {
    if (['weapon', 'items'].includes(tab)) {
      state.currentTab = tab
    }
  },

  // ============================================================
  // ⭐ 子 Tab 切换（弹甲数据内部）
  // 白名单：'bullet' | 'armor' | 'helmet'
  // ============================================================
  switchSubTab(sub) {
    if (['bullet', 'armor', 'helmet'].includes(sub)) {
      state.currentSubTab = sub
    }
  },

  // ============================================================
  // TTK 结果
  // ============================================================
  setTtkResults(results) {
    state.ttkResults = results
  },

  // ============================================================
  // 哈弗币消耗
  // ============================================================
  setHavocCosts(costs) {
    state.havocCosts = costs
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
    state.scores = scores || {}
  },

  /**
   * ⭐ 获取单个配置的评分原始数据
   * @param {number|string} weaponId
   * @param {string} configId
   * @returns {{ ttk: number, aim: number } | null}
   */
  getScore(weaponId, configId) {
    const key = `${weaponId}_${configId}`
    return state.scores[key] || null
  },

  // ============================================================
  // 加载状态
  // ============================================================
  setLoading(loading) {
    state.isLoading = loading
  },

  // ============================================================
  // 枪管编辑器
  // ============================================================
  openBarrelEditor(weaponId) {
    state.editingWeaponId = weaponId
    state.showBarrelEditor = true
  },

  closeBarrelEditor() {
    state.showBarrelEditor = false
    state.editingWeaponId = null
  },

  // ============================================================
  // 基础属性编辑器
  // ============================================================
  openBaseEditor(weaponId) {
    state.editingBaseWeaponId = weaponId
    state.showBaseEditor = true
  },

  closeBaseEditor() {
    state.showBaseEditor = false
    state.editingBaseWeaponId = null
  },

  // ============================================================
  // 显示全部武器
  // ============================================================
  toggleShowAllWeapons() {
    state.showAllWeapons = !state.showAllWeapons
  },

  setShowAllWeapons(show) {
    state.showAllWeapons = show
  },

  // ============================================================
  // 高亮武器
  // ============================================================
  setHighlightWeapon(weaponName) {
    state.highlightWeapon = weaponName
  },

  clearHighlightWeapon() {
    state.highlightWeapon = null
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
    state.calcProgress.visible = true
    state.calcProgress.percent = 0
    state.calcProgress.current = 0
    state.calcProgress.total = total
    state.calcProgress.title = title || '计算中...'
  },

  /**
   * 更新计算进度
   * @param {number} current - 当前已完成数
   */
  updateCalcProgress(current) {
    state.calcProgress.current = current
    const total = state.calcProgress.total
    state.calcProgress.percent = total > 0
      ? Math.round((current / total) * 100)
      : 0
  },

  /**
   * 隐藏计算进度遮罩
   */
  hideCalcProgress() {
    state.calcProgress.visible = false
    state.calcProgress.percent = 0
    state.calcProgress.current = 0
    state.calcProgress.total = 0
    state.calcProgress.title = '计算中...'
  }
}