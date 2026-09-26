<!-- src/App.vue -->
<!--
  ⚠️ 维护提示：本文件有 3 处"距离点循环"，逻辑相似但用途不同：

    1. handleCalculate() → handleDistanceChart() → buildDistanceStats()
       - ⭐ 主力：算 101 个距离点，生成折线图数据
       - ⭐ v7：装备从 equipStore.calcEquip 读（不再从 paramsStore 读）

    2. computeHavocCosts()
       - ⭐ 用「关键点」求平均 shots（不插值，关键点平均即可）
       - ⭐ v7：装备从 equipStore.calcEquip 读

    3. updateSingleWeaponTTK()
       - ⭐ 「关键点 + 插值」（保留作备用，不主动调用）

  ⭐ 关键点算法（getKeyDistances）：
    - 端点：0 / 100
    - 命中率节点：config.distance[i] ± 1
    - 射程衰减节点：weapon.ranges[i] ± 1（有限值）

  ⭐ 参数导出/导入（v3）：
    - 导出：exportData() 把 paramsStore.state 作为 extra.params 传给 dataStore.exportData
    - 导入：importData() 接收 { data, params, equipState }

  ⭐ 启动时自动加载参数（v3）：
    - onMounted 里 dataStore.loadData() 返回 { params, equipState }
    - data.json 顶层若有 params / equipState 字段，会被提取并返回

  ⭐ 图表布局（v3）：
    - PC 端：两个图表默认并排（grid 1fr 1fr），更矮（16:9 / 260px）
    - 放大按钮（PC only）：点击后该图表铺满整行，另一个 v-show 隐藏
    - 移动端：单列（沿用组件自带样式），隐藏放大按钮

  ⭐ 滚动到顶部/返回（v4）：
    - 右下角悬浮按钮（纯图标 ⬆️ / ⬇️）

  ⭐ 装备双模式（v7）：
    - 折线图/柱状图/TTK列/哈弗币/单次模拟 → 用 equipStore.calcEquip（单套）
    - 综合评分 → 用 equipStore.scoreEquips（多套）
    - 两种模式独立，互不影响

  ⭐ v7.1 修复进度条 850/0：
    - recomputeScores 的 onProgress 改为 appStore.updateCalcProgress(current, total)
    - 单枪更新回调里改标题改用 appStore.setCalcProgressTitle(...)

  ⭐ v7.2 导出综合评分（仅导出，不导入）：
    - exportData 把 appStore.state.weaponScores + havocCosts 传给 DataManager
    - DataManager 组装带 meta 的结构
    - 导入时 DataManager 显式忽略 weaponScores

  ⭐ v7.3 增量导入（双模式）：
    - importData 弹出 ImportModeDialog 让用户选择：
      · 全量覆盖（overwrite）
      · 增量覆盖（merge）
    - 导入后按 mode 显示不同的结果提示

  ⭐ v7.4 更新评分按钮：
    - "更新 TTK"按钮改名为"更新评分"
    - 点击后只重算当前武器下所有配置的评分（不更新折线图/柱状图/哈弗币）
    - onUpdateWeaponTTK 改为只调用 recomputeSingleWeaponScores(weaponId)
    - updateSingleWeaponTTK 函数保留作备用（不再主动调用）

  ⭐ v8 改动（问题 1 / 3 / 4 / 8 / 15）：
    - 问题 1：handleCalculate 开头清理脏武器的 IndexedDB 缓存
      · 通过 dataStore.getModifiedWeaponIds() 取脏武器
      · 对每个脏武器调 deleteMatrixEntriesByPrefix(`atk_{wid}_`)
      · 清完后 dataStore.clearAllModified()
    - 问题 3 / 15：recomputeScores 保存全局 min/max
      · 用 EquipScoreEngine.extractGlobalRange(scores) 提取
      · 存到 appStore.setWeaponScoresGlobalRange(range)
      · 单武器重算时传入 globalRange
    - 问题 4：recomputeSingleWeaponScores 处理 result.empty
      · reason === 'no_configs' → 弹提示
      · reason === 'no_equips' → 清空评分
      · reason === 'invalid_weapon_id' → 弹提示
    - 问题 8：recomputeSingleWeaponScores 空装备时清空该武器评分
-->
<template>
  <div id="app">
    <!-- 布局：Header + 中间内容 + Footer -->
    <AppLayout>
      <!-- 参数面板 -->
      <ParamsPanel
        @calculate="handleCalculate"
        @export-data="exportData"
        @import-data="importData"
        @reset-data="resetData"
        @equip-changed="onEquipChanged"
      />

      <!-- ============ 图表区域 ============ -->
      <div
        class="charts-area"
        :class="{ 'has-expanded': expandedChart !== null }"
      >

        <!-- ---------- 柱状图 ---------- -->
        <div
          class="chart-wrapper"
          v-show="expandedChart !== 'line'"
          :class="{ 'is-expanded': expandedChart === 'bar' }"
        >
          <div class="chart-header">
            <h3 class="chart-title">📊 TTK 对比</h3>
            <div class="chart-controls">
              <label class="display-count-label">
                <span>显示数量:</span>
                <input
                  type="number"
                  v-model.number="barDisplayCount"
                  @blur="onBarDisplayCountBlur"
                  @keydown.enter="onDisplayCountEnter"
                  min="0"
                  step="1"
                  class="display-count-input"
                  title="输入 0 或留空表示显示全部"
                />
                <span>条</span>
                <span class="hint">(0 = 全部)</span>
              </label>

              <button
                v-if="!isMobile"
                class="chart-expand-btn"
                :class="{ active: expandedChart === 'bar' }"
                @click="toggleExpand('bar')"
              >
                {{ expandedChart === 'bar' ? '🔍 还原' : '🔍 放大' }}
              </button>
            </div>
          </div>
          <TTKChart
            ref="barChartRef"
            :results="appStore.state.ttkResults"
            :params="paramsStore.state"
            :display-count="barDisplayCount"
          />
        </div>

        <!-- ---------- 折线图 ---------- -->
        <div
          class="chart-wrapper"
          v-show="expandedChart !== 'bar'"
          :class="{ 'is-expanded': expandedChart === 'line' }"
        >
          <div class="chart-header">
            <h3 class="chart-title">📈 距离 - TTK 折线图</h3>
            <div class="chart-controls">
              <div class="custom-range">
                <span class="range-label">自定义:</span>
                <input
                  type="number"
                  v-model.number="customStart"
                  min="0"
                  max="100"
                  step="1"
                  class="range-input"
                  @keydown.enter="applyCustomRange"
                />
                <span class="range-sep">~</span>
                <input
                  type="number"
                  v-model.number="customEnd"
                  min="0"
                  max="100"
                  step="1"
                  class="range-input"
                  @keydown.enter="applyCustomRange"
                />
                <span class="range-unit">m</span>
                <button
                  class="range-apply-btn"
                  @click="applyCustomRange"
                >
                  应用
                </button>
              </div>

              <label class="display-count-label">
                <span>显示数量:</span>
                <input
                  type="number"
                  v-model.number="displayCount"
                  @blur="onDisplayCountBlur"
                  @keydown.enter="onDisplayCountEnter"
                  min="0"
                  step="1"
                  class="display-count-input"
                  title="输入 0 或留空表示显示全部"
                />
                <span>条</span>
                <span class="hint">(0 = 全部)</span>
              </label>

              <button
                v-if="!isMobile"
                class="chart-expand-btn"
                :class="{ active: expandedChart === 'line' }"
                @click="toggleExpand('line')"
              >
                {{ expandedChart === 'line' ? '🔍 还原' : '🔍 放大' }}
              </button>
            </div>
          </div>
          <DistanceChart
            ref="lineChartRef"
            :stats="distanceStats"
            :distances="distances"
            :highlight-weapon="highlightWeapon"
            :display-count="displayCount"
            :segment="segmentProp"
          />
        </div>

      </div>

      <!-- ============ 表格区域 ============ -->
      <div class="table-section">
        <div class="table-tabs">
          <button
            class="tab-btn"
            :class="{ active: appStore.state.currentTab === 'weapon' }"
            @click="switchTab('weapon')"
          >
            🔫 枪械数据
          </button>
          <button
            class="tab-btn"
            :class="{ active: appStore.state.currentTab === 'items' }"
            @click="switchTab('items')"
          >
            🛡️ 弹甲数据
          </button>
          <button
            class="tab-btn"
            :class="{ active: appStore.state.currentTab === 'rec' }"
            @click="switchTab('rec')"
          >
            🎯 配装推荐
          </button>
        </div>

        <div class="tab-content">
          <!-- 枪械 Tab -->
          <div
            id="tab-weapon"
            v-show="appStore.state.currentTab === 'weapon'"
            class="tab-pane"
          >
            <WeaponTable
              :data="weaponRows"
              :muzzle-options="muzzleOptions"
              :get-barrel-options="getWeaponBarrelOptions"
              :caliber-options="caliberOptions"
              @update="onWeaponUpdate"
              @edit-barrel="openBarrelEditor"
              @add-weapon="onAddWeapon"
              @delete-weapon="onDeleteWeapon"
              @show-damage-detail="onShowDamageDetail"
              @update-ttk="onUpdateWeaponTTK"
            />
          </div>

          <!-- 弹甲 Tab -->
          <div
            id="tab-items"
            v-show="appStore.state.currentTab === 'items'"
            class="tab-pane"
          >
            <ItemsPanel
              :caliber-options="caliberOptions"
              @update="onItemsUpdate"
            />
          </div>

          <!-- 配装推荐 Tab -->
          <div
            id="tab-rec"
            v-show="appStore.state.currentTab === 'rec'"
            class="tab-pane"
          >
            <RecPanel />
          </div>
        </div>
      </div>
    </AppLayout>

    <!-- ============ 弹窗 ============ -->
    <BarrelEditor
      :visible="appStore.state.showBarrelEditor"
      :weapon-id="appStore.state.editingWeaponId"
      @update:visible="onBarrelVisibleChange"
      @saved="onBarrelSaved"
    />

    <WeaponBaseEditor
      :visible="appStore.state.showBaseEditor"
      :weapon-id="appStore.state.editingBaseWeaponId"
      :caliber-options="caliberOptions"
      @update:visible="onBaseVisibleChange"
      @saved="onBaseSaved"
    />

    <DamageDetailModal
      v-model:visible="showDamageDetail"
      :weapon-id="detailWeaponId"
      :config-id="detailConfigId"
      :distance="paramsStore.state.distance"
    />

    <ConfirmDialog
      v-model:visible="confirmState.visible"
      :title="confirmState.title"
      :message="confirmState.message"
      :confirm-text="confirmState.confirmText"
      :cancel-text="confirmState.cancelText"
      :confirm-type="confirmState.confirmType"
      :checkbox-label="confirmState.checkboxLabel"
      :checkbox-default="confirmState.checkboxDefault"
      @confirm="onConfirmResolve"
      @cancel="onConfirmReject"
    />

    <!-- ⭐ v7.3：导入模式选择对话框 -->
    <ImportModeDialog
      v-model:visible="importModeVisible"
      :file-name="importModeFileName"
      @confirm="onImportModeConfirm"
      @cancel="onImportModeCancel"
    />
  </div>

  <!-- 计算进度遮罩 -->
  <Teleport to="body">
    <div v-if="appStore.state.calcProgress.visible" class="calc-progress-overlay">
      <div class="calc-progress-box">
        <div class="calc-progress-icon">⏳</div>
        <div class="calc-progress-title">{{ appStore.state.calcProgress.title }}</div>
        <div class="calc-progress-bar-container">
          <div
            class="calc-progress-bar"
            :style="{ width: appStore.state.calcProgress.percent + '%' }"
          ></div>
        </div>
        <div class="calc-progress-text">
          正在计算 {{ appStore.state.calcProgress.current }} / {{ appStore.state.calcProgress.total }}
        </div>
        <div class="calc-progress-percent">{{ appStore.state.calcProgress.percent }}%</div>
      </div>
    </div>
  </Teleport>

  <!-- 滚动悬浮按钮 -->
  <Teleport to="body">
    <Transition name="scroll-btn-fade">
      <button
        v-if="showScrollBtn"
        class="scroll-float-btn"
        :class="{ 'is-return': canReturn }"
        :title="canReturn ? '回到刚才的位置' : '回到顶部'"
        @click="handleScrollBtnClick"
      >
        {{ canReturn ? '⬇️' : '⬆️' }}
      </button>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, provide, nextTick, watch } from 'vue'
import { dataStore, paramsStore, appStore, equipStore } from '@/stores/stores'
import { SimulationEngine } from '@/core/SimulationEngine'

import {
  computeSingleTTK,
  getKeyDistances,
  interpolateKeyPoints,
  computeDistanceSeries,
  buildArmedWeapons,
  computeDistanceWeightedAvg,
} from '@/core/FastTTK'

import { getEquipScoreEngine, EquipScoreEngine } from '@/core/EquipScoreEngine'

import { calculateCurrentValues } from '@/utils/weaponCalc'

// 导入组件
import AppLayout from '@/components/AppLayout.vue'
import ParamsPanel from '@/components/ParamsPanel.vue'
import TTKChart from '@/components/TTKChart.vue'
import DistanceChart from '@/components/DistanceChart.vue'
import WeaponTable from '@/components/WeaponTable.vue'
import ItemsPanel from '@/components/ItemsPanel.vue'
import BarrelEditor from '@/components/BarrelEditor.vue'
import WeaponBaseEditor from '@/components/WeaponBaseEditor.vue'
import DamageDetailModal from '@/components/DamageDetailModal.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import RecPanel from '@/components/RecPanel.vue'
import ImportModeDialog from '@/components/ImportModeDialog.vue'

// ---------- 状态 ----------
const highlightWeapon = ref(null)
const distances = ref(Array.from({ length: 101 }, (_, i) => i))
const caliberOptions = ref([])

const displayCount = ref(10)
const barDisplayCount = ref(10)

const customStart = ref(0)
const customEnd = ref(100)

const showDamageDetail = ref(false)
const detailWeaponId = ref(null)
const detailConfigId = ref('#1')

// 图表放大
const barChartRef = ref(null)
const lineChartRef = ref(null)
const expandedChart = ref(null)
const isMobile = ref(false)

// ⭐ v7.3：导入模式选择
const importModeVisible = ref(false)
const importModeFileName = ref('')
let _importModeResolve = null
let _pendingImportJson = null

const updateIsMobile = () => {
  isMobile.value = window.innerWidth <= 768
}

// ============================================================
// ⭐ v7：获取当前"计算装备"（含兜底）
// ============================================================
const getCalcEquip = () => {
  const eq = equipStore.state.calcEquip
  if (eq) {
    return {
      armorLevel: eq.armorLevel,
      armorValue: eq.armorValue,
      helmetLevel: eq.helmetLevel,
      helmetValue: eq.helmetValue,
    }
  }
  return {
    armorLevel: 4,
    armorValue: 110,
    helmetLevel: 4,
    helmetValue: 48,
  }
}

// ============================================================
// ⭐ v7：综合评分计算的"取消信号"
// ============================================================
let currentScoreSignal = null

// ============================================================
// 滚动到顶部 / 返回
// ============================================================

const isAtTop = ref(true)
const showScrollBtn = ref(false)
const savedScrollY = ref(null)

const canReturn = computed(() => isAtTop.value && savedScrollY.value !== null)

const SCROLL_THRESHOLD = 400
const TOP_THRESHOLD = 50

const onScroll = () => {
  const y = window.scrollY || window.pageYOffset || 0
  isAtTop.value = y < TOP_THRESHOLD
  showScrollBtn.value = y > SCROLL_THRESHOLD || savedScrollY.value !== null
}

const handleScrollBtnClick = () => {
  if (canReturn.value) {
    const targetY = savedScrollY.value
    savedScrollY.value = null
    window.scrollTo({ top: targetY, behavior: 'smooth' })
  } else {
    savedScrollY.value = window.scrollY || window.pageYOffset || 0
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

// ============================================================
// 图表放大 / 还原
// ============================================================

const toggleExpand = async (which) => {
  expandedChart.value = (expandedChart.value === which) ? null : which

  await nextTick()

  barChartRef.value?.resize?.()
  lineChartRef.value?.resize?.()

  setTimeout(() => {
    barChartRef.value?.resize?.()
    lineChartRef.value?.resize?.()
  }, 300)
}

// ---------- 计算属性 ----------
const weaponRows = computed(() => {
  return dataStore.state.weapons || []
})

const muzzleOptions = ['无', '死寂', '先进/轻语/勇火', '冲锋枪回声消音器']

const distanceStats = ref([])

const segmentProp = computed(() => ({
  start: customStart.value,
  end: customEnd.value
}))

// ============================================================
// 通用确认弹窗
// ============================================================

const confirmState = ref({
  visible: false,
  title: '确认',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  confirmType: 'primary',
  checkboxLabel: '',
  checkboxDefault: false
})

let _confirmResolve = null
let _confirmReject = null

const showConfirm = (options = {}) => {
  return new Promise((resolve, reject) => {
    _confirmResolve = resolve
    _confirmReject = reject

    confirmState.value = {
      visible: true,
      title: options.title || '确认',
      message: options.message || '',
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      confirmType: options.confirmType || 'primary',
      checkboxLabel: options.checkboxLabel || '',
      checkboxDefault: options.checkboxDefault || false
    }
  })
}

const showAlert = async (message, title = '提示') => {
  return showConfirm({
    title,
    message,
    confirmText: '知道了',
    cancelText: '',
    confirmType: 'primary'
  })
}

const onConfirmResolve = ({ checked }) => {
  const resolve = _confirmResolve
  _confirmResolve = null
  _confirmReject = null
  if (resolve) resolve({ confirmed: true, checked })
}

const onConfirmReject = () => {
  const resolve = _confirmResolve
  _confirmResolve = null
  _confirmReject = null
  if (resolve) resolve({ confirmed: false, checked: false })
}

provide('showConfirm', showConfirm)
provide('showAlert', showAlert)

// ---------- 辅助函数 ----------
const getWeaponBarrelOptions = (row) => {
  const weapon = dataStore.getWeaponById(row.id)
  if (!weapon || !weapon.barrels || weapon.barrels.length === 0) return ['无']
  const options = weapon.barrels.map(b => b.name)
  return ['无', ...options]
}

const onDisplayCountBlur = () => {
  if (typeof displayCount.value !== 'number' || isNaN(displayCount.value)) {
    displayCount.value = 10
  }
  if (displayCount.value < 0) {
    displayCount.value = 0
  }
}

const onBarDisplayCountBlur = () => {
  if (typeof barDisplayCount.value !== 'number' || isNaN(barDisplayCount.value)) {
    barDisplayCount.value = 10
  }
  if (barDisplayCount.value < 0) {
    barDisplayCount.value = 0
  }
}

const onDisplayCountEnter = (e) => {
  e.target.blur()
}

// ============================================================
// 应用自定义分段
// ============================================================

const applyCustomRange = () => {
  let s = Number(customStart.value)
  let e = Number(customEnd.value)

  if (isNaN(s) || isNaN(e)) {
    showAlert('⚠️ 请输入有效的起止距离')
    return
  }

  s = Math.max(0, Math.min(100, s))
  e = Math.max(0, Math.min(100, e))

  if (s > e) {
    [s, e] = [e, s]
  }

  if (e - s < 5) {
    showAlert('⚠️ 起止距离至少相差 5m')
    return
  }

  customStart.value = s
  customEnd.value = e
}

// ---------- 事件处理 ----------
const switchTab = (tab) => {
  appStore.switchTab(tab)
}

const onShowDamageDetail = ({ weaponId, configId }) => {
  detailWeaponId.value = weaponId
  detailConfigId.value = configId || '#1'
  showDamageDetail.value = true
}

const onItemsUpdate = () => {
  dataStore.refreshBullets()
  dataStore.refreshArmors()
}

// ============================================================
// ⭐ v7：装备变化事件
// ============================================================
const onEquipChanged = (payload) => {
  console.log(`⭐ 装备已更新: mode=${payload.mode}, 数量=${payload.equips.length}`)
}

// ============================================================
// 折线图数据生成
// ============================================================
const handleDistanceChart = async () => {
  try {
    const enabledConfigs = getEnabledConfigs()
    if (enabledConfigs.length === 0) return []

    const dm = dataStore.getDataManager()
    const { armed, attachments } = buildArmedWeapons(enabledConfigs, dm)

    const stats = await buildDistanceStats(armed, attachments)

    distanceStats.value = stats

    console.log(`✅ 折线图数据生成完成: ${stats.length} 个武器`)

    return stats
  } catch (error) {
    console.error('生成折线图失败:', error)
    return []
  }
}

const getEnabledConfigs = () => {
  const rows = dataStore.getPriceRows()
  return rows.filter(row => row.enabled !== false)
}

// ============================================================
// ⭐ v8：清理脏武器的 IndexedDB 缓存（问题 1）
//
// 用户改了武器基础属性 / 枪管 / 配置 / 子弹后，
// DataManager 会把这些武器标记为"脏"（modifiedWeaponIds）。
// 计算前统一清理这些武器的 IndexedDB 缓存，强制重算。
// ============================================================
const clearDirtyWeaponCaches = async () => {
  const dirtyIds = dataStore.getModifiedWeaponIds()
  if (!dirtyIds || dirtyIds.length === 0) return 0

  console.log(`🧹 检测到 ${dirtyIds.length} 个脏武器，清理缓存: ${dirtyIds.join(', ')}`)

  let totalDeleted = 0
  try {
    const { deleteMatrixEntriesByPrefix } = await import('@/core/TTKMatrix')
    for (const wid of dirtyIds) {
      try {
        const deleted = await deleteMatrixEntriesByPrefix(`atk_${wid}_`)
        totalDeleted += deleted
      } catch (e) {
        console.warn(`⚠️ 清武器 ${wid} 的缓存失败:`, e)
      }
    }
    dataStore.clearAllModified()
    console.log(`🧹 脏武器缓存清理完成: 共删除 ${totalDeleted} 条`)
  } catch (e) {
    console.warn('⚠️ 清理脏武器缓存失败:', e)
  }

  return totalDeleted
}

// ============================================================
// TTK 计算（全局）
// ============================================================
const handleCalculate = async () => {
  if (appStore.state.updatingWeaponIds.length > 0) {
    showAlert('⚠️ 正在更新单枪数据，请稍候')
    return
  }
  if (appStore.state.isGlobalCalculating) {
    return
  }

  appStore.setGlobalCalculating(true)
  appStore.setLoading(true)

  try {
    const enabledConfigs = getEnabledConfigs()
    if (enabledConfigs.length === 0) {
      showAlert('请至少启用一个价格配置')
      return
    }

    const dm = dataStore.getDataManager()
    const params = paramsStore.state

    // ⭐ v8：问题 1 - 清理脏武器的 IndexedDB 缓存
    await clearDirtyWeaponCaches()

    appStore.showCalcProgress('计算 TTK 中...', enabledConfigs.length)

    const stats = await handleDistanceChart()

    if (!stats || stats.length === 0) {
      console.warn('⚠️ 折线图数据为空，跳过柱状图提取')
      return
    }

    // ---------- 从折线图数据提取柱状图数据 ----------
    const distIdx = Math.max(0, Math.min(100, Math.round(params.distance)))

    const results = []
    for (const stat of stats) {
      const weaponArmed = stat.weapon
      const ttkAtDistance = stat.times[distIdx] || 0
      const shotsAtDistance = stat.shots[distIdx] || 0

      const triggerDelay = params.triggerDelayEnable ? (weaponArmed.triggerDelay || 0) : 0
      const velocity = weaponArmed.velocity || 500
      const flight = (params.distance / velocity) * 1000

      const nonShotPart = flight + triggerDelay
      const remaining = Math.max(0, ttkAtDistance - nonShotPart)
      const noMissFireDelay = remaining * (0.5 / 0.7)
      const emptyDelay = remaining * (0.2 / 0.7)

      results.push({
        name: stat.displayName,
        weapon: weaponArmed,
        totalTime: ttkAtDistance || 0,
        noMissFireDelay: noMissFireDelay || 0,
        burstInterval: 0,
        emptyDelay: emptyDelay || 0,
        flight: flight || 0,
        triggerDelay: triggerDelay || 0,
        avgShots: shotsAtDistance || 0,
      })
    }

    results.sort((a, b) => a.totalTime - b.totalTime)
    appStore.setTtkResults(results)

    console.log(`✅ 柱状图数据已从折线图数据提取: ${results.length} 个配置 @ ${params.distance}m`)

    // ---------- 哈弗币消耗 ----------
    await computeHavocCosts(enabledConfigs, dm, params)

  } catch (error) {
    console.error('计算失败:', error)
    showAlert('计算失败: ' + error.message)
  } finally {
    appStore.setGlobalCalculating(false)
    appStore.setLoading(false)
    appStore.hideCalcProgress()
  }
}

// ============================================================
// ⭐ v7：综合评分重算（用 equipStore.scoreEquips，全量）
//
// ⭐ v8 改动：
//   - 问题 3 / 15：算完后保存全局 min/max 到 appStore
// ============================================================
const recomputeScores = async () => {
  const equips = equipStore.state.scoreEquips || []

  if (equips.length === 0) {
    // ⭐ 全量版本：清空评分 + 清空全局范围
    appStore.clearWeaponScores()
    console.log('ℹ️ 未选择评分参考装备，综合评分已清空')
    return
  }

  if (currentScoreSignal) {
    currentScoreSignal.cancelled = true
  }

  const signal = { cancelled: false }
  currentScoreSignal = signal

  const dm = dataStore.getDataManager()
  const engine = getEquipScoreEngine(dm)
  const configs = getEnabledConfigs()

  if (configs.length === 0) {
    appStore.clearWeaponScores()
    return
  }

  appStore.showCalcProgress('计算综合评分中...', 0)

  try {
    const scores = await engine.computeScores({
      configs,
      equips,
      baseParams: paramsStore.state,
      distances: distances.value,
      onProgress: (current, total) => {
        if (signal.cancelled) return
        appStore.updateCalcProgress(current, total)
      },
      signal,
    })

    if (signal.cancelled) {
      console.log('ℹ️ 综合评分计算已被新请求取代，丢弃本次结果')
      return
    }

    appStore.setWeaponScores(scores)

    // ⭐ v8：问题 3 / 15 - 保存全局 min/max
    const range = EquipScoreEngine.extractGlobalRange(scores)
    appStore.setWeaponScoresGlobalRange(range)

    console.log(
      `✅ 综合评分完成: ${Object.keys(scores).length} 条, ` +
      `全局范围 [${range.min.toFixed(1)}, ${range.max.toFixed(1)}]`
    )

  } catch (error) {
    console.error('❌ 综合评分计算失败:', error)
  } finally {
    if (currentScoreSignal === signal) {
      currentScoreSignal = null
    }
    if (!signal.cancelled) {
      appStore.hideCalcProgress()
    }
  }
}

// ============================================================
// ⭐ v7.4 / v8：只重算单把武器的评分（用于"更新评分"按钮）
//
// 与 recomputeScores 的区别：
//   - recomputeScores：重算所有武器（用于评分参考变化时）
//   - recomputeSingleWeaponScores：只重算一把（用于"更新评分"按钮）
//
// ⭐ v8 改动：
//   - 问题 3 / 15：传入 globalRange（用全量算出的全局 min/max）
//   - 问题 4：处理 result.empty（带 reason）
//   - 问题 8：空装备时清空该武器评分
// ============================================================
const recomputeSingleWeaponScores = async (weaponId) => {
  const equips = equipStore.state.scoreEquips || []

  // ⭐ v8：问题 8 - 空装备时清空该武器评分
  if (equips.length === 0) {
    const oldScores = appStore.state.weaponScores || {}
    const newScores = { ...oldScores }
    const prefix = `${weaponId}_`
    let deleted = 0
    for (const key of Object.keys(newScores)) {
      if (key.startsWith(prefix)) {
        delete newScores[key]
        deleted++
      }
    }
    if (deleted > 0) {
      appStore.setWeaponScores(newScores)
      console.log(`ℹ️ 评分参考为空，已清空武器 ${weaponId} 的 ${deleted} 条评分`)
    } else {
      console.log('ℹ️ 未选择评分参考装备，跳过单枪评分')
    }
    return
  }

  const dm = dataStore.getDataManager()
  const engine = getEquipScoreEngine(dm)
  const allConfigs = getEnabledConfigs()

  if (allConfigs.length === 0) {
    console.warn('⚠️ 没有启用的配置，跳过')
    return
  }

  // ⭐ v8：问题 3 / 15 - 传入 globalRange
  const globalRange = appStore.getWeaponScoresGlobalRange()

  const result = await engine.computeScoresForWeapon({
    weaponId,
    configs: allConfigs,
    equips,
    baseParams: paramsStore.state,
    distances: distances.value,
    globalRange,   // ⭐ 传入全局 min/max
  })

  // ⭐ v8：问题 4 - 处理空结果
  if (result.empty) {
    switch (result.reason) {
      case 'no_configs':
        showAlert('⚠️ 该武器没有启用的配置')
        break
      case 'no_equips':
        showAlert('⚠️ 未选择评分参考装备')
        break
      case 'invalid_weapon_id':
        showAlert(`⚠️ 非法的 weaponId: ${weaponId}`)
        break
      default:
        console.warn(`⚠️ computeScoresForWeapon 返回空结果: ${result.reason}`)
    }
    return
  }

  const newScores = result.scores

  // ---------- 合并到现有评分 ----------
  const oldScores = appStore.state.weaponScores || {}
  const mergedScores = { ...oldScores }

  // 先删除该武器的旧评分
  const prefix = `${weaponId}_`
  for (const key of Object.keys(mergedScores)) {
    if (key.startsWith(prefix)) {
      delete mergedScores[key]
    }
  }

  // 合并新评分
  Object.assign(mergedScores, newScores)

  appStore.setWeaponScores(mergedScores)

  const w = dataStore.getWeaponById(weaponId)
  console.log(`✅ 单枪评分更新完成: ${w?.name || weaponId}, ${Object.keys(newScores).length} 条`)
}

// ============================================================
// ⭐ v7：watch 评分参考变化 → 自动重算评分
// ============================================================
let _scoreEquipsDebounceTimer = null
const _EQUIP_DEBOUNCE_MS = 200

watch(
  () => equipStore.state.scoreEquips,
  (newEquips) => {
    clearTimeout(_scoreEquipsDebounceTimer)
    _scoreEquipsDebounceTimer = setTimeout(() => {
      console.log(`🔔 评分参考变化: ${(newEquips || []).length} 套，触发综合评分重算`)
      recomputeScores()
    }, _EQUIP_DEBOUNCE_MS)
  },
  { deep: true }
)

// ⭐ v7：计算装备变化 → 不自动重算，只提示用户手动点"计算 TTK"
let _calcEquipDebounceTimer = null
watch(
  () => equipStore.state.calcEquip,
  () => {
    clearTimeout(_calcEquipDebounceTimer)
    _calcEquipDebounceTimer = setTimeout(() => {
      console.log('🔔 计算装备已变化，请手动点击"计算 TTK"刷新折线图/柱状图/哈弗币')
    }, _EQUIP_DEBOUNCE_MS)
  },
  { deep: true }
)

/**
 * ⭐ v7.4 / v8：更新单把武器的评分
 *
 * 原名 onUpdateWeaponTTK，现改为"更新评分"按钮的处理函数。
 *
 * 职责：
 *   - 只重算当前武器下所有配置的评分
 *   - 不更新折线图 / 柱状图 / 哈弗币（那些由"计算 TTK"按钮负责）
 *
 * ⭐ v8：在重算前，先清理该武器的 IndexedDB 缓存（问题 1）
 *   —— 用户在 WeaponTable 里改了属性 → markWeaponModified
 *   —— 点"更新评分" → 这里清缓存 → recomputeSingleWeaponScores 强制重算
 */
const onUpdateWeaponTTK = async ({ weaponId }) => {
  if (!weaponId) return

  if (appStore.state.isGlobalCalculating) {
    showAlert('⚠️ 正在全局计算，请稍候')
    return
  }

  if (appStore.isUpdatingWeapon(weaponId)) {
    return
  }

  const weapon = dataStore.getWeaponById(weaponId)
  const weaponName = weapon?.name || weaponId

  appStore.addUpdatingWeapon(weaponId)
  appStore.showCalcProgress(`更新 ${weaponName} 的评分中...`, 1)

  try {
    // ⭐ v8：问题 1 - 重算前清理该武器的 IndexedDB 缓存
    if (dataStore.isWeaponModified(weaponId)) {
      try {
        const { deleteMatrixEntriesByPrefix } = await import('@/core/TTKMatrix')
        const deleted = await deleteMatrixEntriesByPrefix(`atk_${weaponId}_`)
        if (deleted > 0) {
          console.log(`🧹 已清空武器 ${weaponId} 的 ${deleted} 条缓存（强制重算）`)
        }
      } catch (e) {
        console.warn('⚠️ 清理武器缓存失败:', e)
      }
    }

    // ⭐ 只重算评分
    await recomputeSingleWeaponScores(weaponId)

    // 清除"脏"标记（数据已同步到评分）
    dataStore.clearWeaponModified(weaponId)

    console.log(`✅ ${weaponName} 评分更新完成`)
  } catch (error) {
    console.error('评分更新失败:', error)
    showAlert('评分更新失败: ' + error.message)
  } finally {
    appStore.removeUpdatingWeapon(weaponId)
    appStore.hideCalcProgress()
  }
}

// ============================================================
// 哈弗币消耗计算（全量）
// ============================================================
const computeHavocCosts = async (enabledConfigs, dm, params) => {
  const havocCosts = {}
  let computed = 0
  let skipped = 0

  const { armed, attachments } = buildArmedWeapons(enabledConfigs, dm)

  for (let i = 0; i < armed.length; i++) {
    const weaponArmed = armed[i]
    const attachment = attachments[i] || {}
    const configId = attachment.configId || '#1'
    const weaponId = weaponArmed.id
    const key = `${weaponId}_${configId}`

    const price = dm.getPriceByWeaponId(weaponId)
    if (!price) {
      skipped++
      continue
    }

    const config = price.configs.find(c => c.id === configId)
    if (!config) {
      skipped++
      continue
    }

    const keyDistances = getKeyDistances(weaponArmed, config)
    const allShots = []

    for (const d of keyDistances) {
      const single = await computeSingleTTK(weaponArmed, attachment, {
        ...params,
        ...getCalcEquip(),
        distance: d,
      }, dm)

      if (single) {
        allShots.push(single.shots)
      }
    }

    if (allShots.length === 0) {
      skipped++
      continue
    }

    let bulletPrice = 0
    const bulletId = SimulationEngine.getRealBulletKey(
      attachment.bulletType,
      weaponArmed,
      params,
      dm
    )
    if (bulletId) {
      const bullet = dm.getBulletById(bulletId)
      bulletPrice = bullet?.price || 0
    }

    const avgShots = allShots.reduce((a, b) => a + b, 0) / allShots.length

    const weaponPrice = config.price || 0
    const kdRatio = params.kdRatio ?? 1.0
    const extractRate = params.extractRate ?? 0.5
    const extraCost = params.extraCost ?? 30

    const weaponLossCost = weaponPrice * (1 - extractRate)
    const effectiveKd = kdRatio * 5
    const effectiveShots = effectiveKd * avgShots + extraCost
    const bulletCost = effectiveShots * bulletPrice
    const totalCost = weaponLossCost + bulletCost

    havocCosts[key] = {
      totalCost,
      weaponLossCost,
      bulletCost,
      weaponPrice,
      avgShots,
      bulletPrice,
      effectiveShots,
      kdRatio,
      extractRate,
      extraCost,
    }
    computed++
  }

  appStore.setHavocCosts(havocCosts)
  console.log(`💰 哈弗币估算完成: ${computed} 条 (跳过 ${skipped})`)
}

// ============================================================
// 折线图数据构建（全量）
// ============================================================
const buildDistanceStats = async (armed, attachments) => {
  const params = paramsStore.state
  const dm = dataStore.getDataManager()
  const stats = []

  for (let idx = 0; idx < armed.length; idx++) {
    const weapon = armed[idx]
    const attachment = attachments[idx] || {}
    const displayName = weapon._displayName || weapon.name

    const weaponId = weapon.id
    const configId = weapon._configId || '#1'
    const price = dm.getPriceByWeaponId(weaponId)
    const config = price?.configs.find(c => c.id === configId)

    const paramsWithEquip = {
      ...params,
      ...getCalcEquip(),
    }

    const { times, shots, anySuccess } = await computeDistanceSeries(
      weapon,
      attachment,
      config,
      paramsWithEquip,
      dm,
      distances.value
    )

    if (!anySuccess) {
      console.log(`⚠️ 折线图跳过 ${displayName}：无法计算`)
      appStore.updateCalcProgress(idx + 1)
      continue
    }

    const weightedAvg = computeDistanceWeightedAvg(times, distances.value)

    stats.push({
      weapon,
      times,
      shots,
      displayName,
      weightedAvg
    })

    appStore.updateCalcProgress(idx + 1)
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  stats.sort((a, b) => a.weightedAvg - b.weightedAvg)
  return stats
}

// ---------- 数据更新事件 ----------
const onWeaponUpdate = (payload) => {
  dataStore.refreshWeapons()
  dataStore.refreshPrices()
  if (payload?.weaponId) {
    dataStore.markWeaponModified(payload.weaponId)
  }
}

// ============================================================
// 数据管理（导出/导入/重置）
// ============================================================

const exportData = async () => {
  try {
    const equipState = equipStore.exportState()
    const scoreCount = Object.keys(appStore.state.weaponScores || {}).length

    const result = await showConfirm({
      title: '📤 导出数据',
      message:
        '确认导出当前所有数据？\n\n' +
        '将下载一个 data.json 文件，包含：\n' +
        '· 武器 / 子弹 / 价格 / 护甲配置\n' +
        '· 页面顶部的参数\n' +
        `· 装备状态（计算装备 + ${equipState.scoreEquips.length} 套评分参考）\n` +
        `· 综合评分 ${scoreCount} 条（含 meta，用于外部数据分析）`,
      confirmText: '导出',
      cancelText: '取消',
      confirmType: 'primary'
    })

    if (result.confirmed) {
      const extra = {
        params: { ...paramsStore.state },
        equipState,
        weaponScores: { ...appStore.state.weaponScores },
        havocCosts: { ...appStore.state.havocCosts },
      }
      dataStore.exportData(extra)
    }
  } catch (error) {
    console.error('导出失败:', error)
    showAlert('导出失败: ' + error.message)
  }
}

// ⭐ v7.3：导入模式选择对话框
const showImportModeDialog = (fileName, jsonStr) => {
  return new Promise((resolve) => {
    _importModeResolve = resolve
    _pendingImportJson = jsonStr
    importModeFileName.value = fileName
    importModeVisible.value = true
  })
}

const onImportModeConfirm = (mode) => {
  const resolve = _importModeResolve
  const jsonStr = _pendingImportJson
  _importModeResolve = null
  _pendingImportJson = null
  if (resolve) resolve({ mode, jsonStr })
}

const onImportModeCancel = () => {
  const resolve = _importModeResolve
  _importModeResolve = null
  _pendingImportJson = null
  if (resolve) resolve(null)
}

// ⭐ v7.3：导入主流程
const importData = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    try {
      const jsonStr = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (event) => resolve(event.target.result)
        reader.onerror = () => reject(new Error('读取文件失败'))
        reader.readAsText(file)
      })

      const choice = await showImportModeDialog(file.name, jsonStr)
      if (!choice) {
        console.log('ℹ️ 用户取消导入')
        return
      }

      const { mode, jsonStr: str } = choice

      const result = dataStore.importData(str, { mode })

      dataStore.refreshWeapons()
      dataStore.refreshBullets()
      dataStore.refreshPrices()
      dataStore.refreshArmors()
      dataStore.refreshOtherItems()

      if (result.params && typeof result.params === 'object') {
        paramsStore.updateAll(result.params)
        console.log('✅ 已恢复页面顶部参数')
      } else {
        console.log('ℹ️ 导入文件不含参数，保留当前参数')
      }

      if (result.equipState) {
        equipStore.loadFromImported(result.equipState)
        console.log('✅ 已恢复装备状态')
      } else {
        console.log('ℹ️ 导入文件不含装备状态，保留当前装备')
      }

      if (mode === 'merge' && result.stats) {
        const s = result.stats
        const msg =
          `✅ 增量导入完成\n\n` +
          `武器：新增 ${s.weapons.added}，更新 ${s.weapons.updated}\n` +
          `配置：新增 ${s.prices.configsAdded}，更新 ${s.prices.configsUpdated}\n` +
          `子弹：新增 ${s.bullets.added}，更新 ${s.bullets.updated}\n` +
          `护甲：新增 ${s.armors.added}，更新 ${s.armors.updated}\n` +
          `其他：新增 ${s.otherItems.added}，更新 ${s.otherItems.updated}\n\n` +
          `🆕 新增的配置已在枪械表中用黄色标记`
        await showAlert(msg)
      } else {
        await showAlert('✅ 全量导入成功！')
      }

      setTimeout(() => {
        handleCalculate()
        recomputeScores()
      }, 300)

    } catch (error) {
      console.error('导入失败:', error)
      showAlert('导入失败: ' + error.message)
    }
  }
  input.click()
}

const resetData = async () => {
  const result = await showConfirm({
    title: '🔄 重置数据',
    message:
      '⚠️ 确定要重置所有数据为默认值吗？\n\n' +
      '当前的所有修改都将丢失！\n' +
      '（同时会清空推荐缓存、假想敌配置、综合评分）',
    confirmText: '重置',
    cancelText: '取消',
    confirmType: 'danger'
  })

  if (!result.confirmed) return

  try {
    dataStore.resetData()
    dataStore.refreshWeapons()
    dataStore.refreshBullets()
    dataStore.refreshPrices()
    dataStore.refreshArmors()

    const { clearMatrix } = await import('@/core/FastTTK')
    await clearMatrix()
    console.log('🗑️ 已清空 TTK 矩阵缓存')

    const { clearRecPanelState } = await import('@/core/TTKMatrix')
    await clearRecPanelState()
    console.log('🗑️ 已清空配装面板状态（假想敌 + 预算）')

    equipStore.resetToDefault()

    // ⭐ v8：用 clearWeaponScores 代替 setWeaponScores({})
    //   —— 同时清空 weaponScoresGlobalRange
    appStore.clearWeaponScores()
    console.log('🗑️ 已重置装备状态 + 清空综合评分 + 清空全局范围')

    setTimeout(() => {
      handleCalculate()
      recomputeScores()
    }, 500)

    await showAlert('✅ 数据已重置为默认值！')
  } catch (error) {
    console.error('重置失败:', error)
    showAlert('重置失败: ' + error.message)
  }
}

// ============================================================
// 武器管理
// ============================================================
const onAddWeapon = (index, rowData) => {
  const dm = dataStore.getDataManager()

  if (index === -1 || rowData === undefined || rowData === null) {
    const existing = dm.data.weapons.find(w => w._isNewRow === true)
    if (existing) {
      showAlert('⚠️ 已有新增行，请先完成或取消当前新增操作')
      return
    }

    const tempWeapon = {
      id: `temp_${Date.now()}`,
      name: '',
      type: '步枪',
      allowedBullet: '',
      ranges: [40, 70, Infinity, Infinity],
      decays: [1, 0.9, 0.75, 0.75, 0.75],
      velocity: 500,
      flesh: 30,
      armor: 35,
      rof: 600,
      triggerDelay: 0,
      barrels: [],
      mult: { head: 1.9, chest: 1, stomach: 0.9, limbs: 0.4 },
      _isNewRow: true
    }

    dm.data.weapons.unshift(tempWeapon)
    dataStore.refreshWeapons()

    console.log('✅ 已插入临时占位武器')
    return
  }

  const weapons = dm.getWeapons()
  let maxId = 0
  for (const w of weapons) {
    if (w._isNewRow) continue
    const id = typeof w.id === 'number' ? w.id : parseInt(w.id)
    if (!isNaN(id) && id > maxId) maxId = id
  }
  const newWeaponId = maxId + 1

  const newWeapon = {
    id: newWeaponId,
    name: rowData.name || '新武器',
    type: rowData.type || '步枪',
    allowedBullet: rowData.allowedBullet || '',
    ranges: rowData.ranges || [40, 70, Infinity, Infinity],
    decays: rowData.decays || [1, 0.9, 0.75, 0.75, 0.75],
    velocity: rowData.velocity || 500,
    flesh: rowData.flesh || 30,
    armor: rowData.armor || 35,
    rof: rowData.rof || 600,
    triggerDelay: 0,
    barrels: [],
    mult: rowData.mult || { head: 1.9, chest: 1, stomach: 0.9, limbs: 0.4 }
  }

  const weaponList = dm.data.weapons
  const tempIndex = weaponList.findIndex(w => w._isNewRow === true)
  if (tempIndex !== -1) {
    weaponList.splice(tempIndex, 1, newWeapon)
  } else {
    weaponList.push(newWeapon)
  }

  const defaultPriceConfig = {
    id: '#1',
    barrelId: -1,
    barrel: '无',
    muzzleId: 0,
    muzzle: '无',
    precision: 0.09,
    aimSpeed: 0,
    buildCode: '',
    price: 0,
    distance: [30, 50, 100],
    hitRate: [1.0, 0.9, 0.6],
    bullet: '',
    enabled: true
  }

  let price = dm.getPriceByWeaponId(newWeaponId)
  if (!price) {
    dm.data.prices.push({
      weaponId: newWeaponId,
      weaponName: rowData.name || '新武器',
      configs: [defaultPriceConfig]
    })
  } else {
    price.configs.push(defaultPriceConfig)
  }

  dataStore.refreshWeapons()
  dataStore.refreshPrices()
  console.log(`✅ 新增枪械: ${rowData.name} (ID: ${newWeaponId})`)
}

const onDeleteWeapon = (index, weaponId, isCancelled) => {
  if (isCancelled) {
    const dm = dataStore.getDataManager()
    const weaponList = dm.data.weapons
    const tempIndex = weaponList.findIndex(w => w._isNewRow === true)
    if (tempIndex !== -1) {
      weaponList.splice(tempIndex, 1)
    }
    dataStore.refreshWeapons()
    console.log('✅ 已取消新增武器')
    return
  }
  showAlert('删除武器功能开发中')
}

// ============================================================
// 枪管编辑器 / 基础属性编辑器
// ============================================================
const openBarrelEditor = (weaponId) => {
  appStore.openBarrelEditor(weaponId)
}

const onBarrelSaved = () => {
  dataStore.refreshWeapons()
  const weaponId = appStore.state.editingWeaponId
  if (weaponId) {
    dataStore.markWeaponModified(weaponId)
  }
  appStore.closeBarrelEditor()
  console.log('✅ 枪管已保存，武器数据已刷新')
}

const onBarrelVisibleChange = (visible) => {
  if (!visible) {
    appStore.closeBarrelEditor()
  }
}

const onBaseVisibleChange = (visible) => {
  if (!visible) {
    appStore.closeBaseEditor()
  }
}

const onBaseSaved = () => {
  dataStore.refreshWeapons()
  dataStore.refreshPrices()
  const weaponId = appStore.state.editingBaseWeaponId
  if (weaponId) {
    dataStore.markWeaponModified(weaponId)
  }
  appStore.closeBaseEditor()
  console.log('✅ 基础属性已保存，武器数据已刷新')
}

// ============================================================
// 生命周期
// ============================================================
onMounted(async () => {
  updateIsMobile()
  window.addEventListener('resize', updateIsMobile)

  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()

  try {
    const { params, equipState } = await dataStore.loadData()

    if (params && typeof params === 'object') {
      paramsStore.updateAll(params)
      console.log('✅ 已从 data.json 恢复页面顶部参数')
    }

    if (equipState) {
      equipStore.loadFromImported(equipState)
      console.log('✅ 已从 data.json 恢复装备状态')
    } else {
      console.log('ℹ️ data.json 里没有装备状态，使用默认')
    }

    const bullets = dataStore.state.bullets
    const calibers = new Set()
    bullets.forEach(b => {
      if (b.caliber) calibers.add(b.caliber)
    })
    caliberOptions.value = Array.from(calibers).sort()

    console.log('=== 初始化调试 ===')
    console.log('weaponRows 长度:', weaponRows.value?.length)
    console.log('bullets 长度:', dataStore.state.bullets?.length)
    console.log('armors 长度:', dataStore.state.armors?.length)
    console.log('mode:', equipStore.state.mode)
    console.log('calcEquip:', equipStore.state.calcEquip ? '已选' : '未选')
    console.log('scoreEquips:', equipStore.state.scoreEquips?.length)
    console.log('=== 调试结束 ===')

    setTimeout(() => {
      handleCalculate()
    }, 500)

    setTimeout(() => {
      recomputeScores()
    }, 800)

  } catch (error) {
    console.error('初始化失败:', error)
    showAlert('数据加载失败，请检查 data.json 文件是否存在')
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateIsMobile)
  window.removeEventListener('scroll', onScroll)

  clearTimeout(_scoreEquipsDebounceTimer)
  clearTimeout(_calcEquipDebounceTimer)

  if (currentScoreSignal) {
    currentScoreSignal.cancelled = true
    currentScoreSignal = null
  }
})
</script>

<style>
/* ============================================================
   App 组件样式（与上一版完全相同，未改动）
   ============================================================ */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: var(--font-family);
  font-size: var(--font-size-md);
  color: var(--color-text);
  background: var(--color-bg);
  line-height: 1.6;
}

#app {
  padding: 8px 24px 20px;
}

.charts-area {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-lg);
  margin: 6px 0;
  transition: grid-template-columns 0.25s ease;
}

.charts-area.has-expanded {
  grid-template-columns: 1fr;
}

.chart-wrapper {
  background: var(--color-bg-white);
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: var(--shadow-sm);
  border: 1px solid #ddd;
  min-width: 0;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.chart-title {
  font-family: var(--font-family);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: #333;
  margin-bottom: 6px;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  flex-wrap: wrap;
  gap: var(--spacing-md);
}

.chart-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.display-count-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-family);
  font-size: var(--font-size-md);
  color: var(--color-text-secondary);
  cursor: pointer;
  white-space: nowrap;
}

.display-count-input {
  width: 60px;
  padding: 3px 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
  font-size: var(--font-size-md);
  background: var(--color-bg-light);
  color: var(--color-text);
  text-align: center;
}

.display-count-input:focus {
  border-color: var(--color-primary);
  outline: none;
  background: var(--color-bg-white);
}

.display-count-label .hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.custom-range {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-white);
}

.range-label {
  font-size: 12px;
  color: #666;
  white-space: nowrap;
}

.range-input {
  width: 48px;
  padding: 3px 6px;
  border: 1px solid var(--color-border-light);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 12px;
  text-align: center;
  background: var(--color-bg-light);
  color: var(--color-text);
  outline: none;
}

.range-input:focus {
  border-color: var(--color-primary);
  background: #fff;
}

.range-input::-webkit-outer-spin-button,
.range-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.range-input {
  -moz-appearance: textfield;
}

.range-sep {
  font-size: 12px;
  color: #999;
}

.range-unit {
  font-size: 11px;
  color: #888;
}

.range-apply-btn {
  padding: 3px 10px;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  background: var(--color-bg-white);
  font-family: var(--font-family);
  font-size: 12px;
  color: #666;
  cursor: pointer;
  transition: all 0.15s;
}

.range-apply-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.chart-expand-btn {
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-white);
  font-family: var(--font-family);
  font-size: 12px;
  color: #666;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.chart-expand-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: #f0f4ff;
}

.chart-expand-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.chart-expand-btn.active:hover {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}

.charts-area .chart-wrapper:not(.is-expanded) .chart-container {
  aspect-ratio: 16 / 9;
  min-height: 260px;
}

.charts-area .chart-wrapper.is-expanded .chart-container {
  aspect-ratio: 2 / 1;
  min-height: 420px;
}

.table-section {
  background: var(--color-bg-white);
  border-radius: var(--radius-lg);
  padding: 8px 14px 10px;
  box-shadow: var(--shadow-sm);
  margin-top: var(--spacing-lg);
}

.table-tabs {
  display: flex;
  gap: var(--spacing-xs);
  border-bottom: 2px solid var(--color-border-light);
  margin-bottom: 6px;
}

.tab-btn {
  padding: 6px 18px;
  border: none;
  background: transparent;
  font-family: var(--font-family);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-medium);
  color: #888;
  cursor: pointer;
  border-bottom: 3px solid transparent;
  transition: all 0.25s ease;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
}

.tab-btn:hover {
  color: var(--color-primary);
  background: #f0f4ff;
}

.tab-btn.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  background: #f0f4ff;
}

.tab-content {
  min-height: 200px;
}

.tab-pane {
  display: block;
  width: 100%;
}

.calc-progress-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 99999;
  backdrop-filter: blur(4px);
}

.calc-progress-box {
  background: #fff;
  border-radius: 12px;
  padding: 24px 32px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  min-width: 320px;
  max-width: 480px;
  text-align: center;
}

.calc-progress-icon {
  font-size: 32px;
  margin-bottom: 12px;
  animation: calc-pulse 1.5s ease-in-out infinite;
}

@keyframes calc-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.15); opacity: 0.8; }
}

.calc-progress-title {
  font-family: var(--font-family);
  font-size: 15px;
  font-weight: 600;
  color: #333;
  margin-bottom: 16px;
}

.calc-progress-bar-container {
  width: 100%;
  height: 8px;
  background: #e8e8e8;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 12px;
}

.calc-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #4a6cf7, #6a8cf7);
  border-radius: 4px;
  transition: width 0.2s ease;
}

.calc-progress-text {
  font-family: var(--font-family);
  font-size: 13px;
  color: #666;
  margin-bottom: 6px;
}

.calc-progress-percent {
  font-family: 'Courier New', monospace;
  font-size: 18px;
  font-weight: 600;
  color: #4a6cf7;
}

.scroll-float-btn {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 9000;

  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 50%;

  background: var(--color-primary);
  color: #fff;
  font-size: 20px;
  line-height: 1;
  font-family: var(--font-family);

  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  box-shadow: 0 4px 12px rgba(74, 108, 247, 0.35);
  transition: background 0.2s, box-shadow 0.2s, transform 0.2s;
  user-select: none;
}

.scroll-float-btn:hover {
  background: var(--color-primary-hover);
  box-shadow: 0 6px 16px rgba(74, 108, 247, 0.45);
  transform: translateY(-2px);
}

.scroll-float-btn:active {
  transform: translateY(0) scale(0.96);
}

.scroll-float-btn.is-return {
  background: #ff9800;
  box-shadow: 0 4px 12px rgba(255, 152, 0, 0.35);
}

.scroll-float-btn.is-return:hover {
  background: #e68900;
  box-shadow: 0 6px 16px rgba(255, 152, 0, 0.45);
}

.scroll-btn-fade-enter-active,
.scroll-btn-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.scroll-btn-fade-enter-from,
.scroll-btn-fade-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.9);
}

@media (max-width: 768px) {
  #app {
    padding: 4px 8px 12px;
  }

  .charts-area {
    grid-template-columns: 1fr;
    transition: none;
  }

  .chart-wrapper {
    padding: 10px;
    transition: none;
  }

  .chart-expand-btn {
    display: none;
  }

  .charts-area .chart-wrapper .chart-container,
  .charts-area .chart-wrapper:not(.is-expanded) .chart-container,
  .charts-area .chart-wrapper.is-expanded .chart-container {
    aspect-ratio: 2 / 1;
    min-height: 260px;
  }

  .chart-title {
    font-size: 13px;
  }

  .chart-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-sm);
  }

  .chart-controls {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }

  .custom-range {
    justify-content: flex-start;
  }

  .display-count-label {
    align-self: flex-start;
  }

  .display-count-input {
    width: 50px;
  }

  .range-input {
    width: 44px;
  }

  .table-section {
    padding: 4px 8px 6px;
  }

  .tab-btn {
    padding: 3px 8px;
    font-size: 11px;
  }

  .calc-progress-box {
    padding: 20px 24px;
    min-width: 280px;
    max-width: 90vw;
  }

  .scroll-float-btn {
    right: 12px;
    bottom: 12px;
    width: 38px;
    height: 38px;
    font-size: 17px;
  }
}
</style>