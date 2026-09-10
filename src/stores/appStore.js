// src/stores/appStore.js
import { reactive, readonly } from 'vue'

const state = reactive({
  currentTab: 'price',
  ttkResults: [],
  havocCosts: {},
  isLoading: false,
  showBarrelEditor: false,
  editingWeaponId: null,
  showAllWeapons: true,
  highlightWeapon: null,

  // ⭐ 计算进度状态
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
  // Tab 切换
  // ============================================================
  switchTab(tab) {
    if (['price', 'weapon', 'bullet'].includes(tab)) {
      state.currentTab = tab
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
  // ⭐ 计算进度管理
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