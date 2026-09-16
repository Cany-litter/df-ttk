<!-- src/App.vue -->
<template>
  <div id="app">
    <!-- 头部 -->
    <AppHeader />

    <!-- 参数面板 -->
    <ParamsPanel
      @calculate="handleCalculate"
      @distance-chart="handleDistanceChart"
      @export-data="exportData"
      @import-data="importData"
      @reset-data="resetData"
    />

    <!-- 图表区域 -->
    <div class="charts-area">
      <!-- 柱状图（TTK 对比） -->
      <div class="chart-wrapper">
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
          </div>
        </div>
        <TTKChart
          :results="appStore.state.ttkResults"
          :params="paramsStore.state"
          :display-count="barDisplayCount"
        />
      </div>

      <!-- 折线图（距离 - TTK） -->
      <div class="chart-wrapper">
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
          </div>
        </div>
        <DistanceChart
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

        <!-- ⭐ 配装推荐 Tab -->
        <div
          id="tab-rec"
          v-show="appStore.state.currentTab === 'rec'"
          class="tab-pane"
        >
          <RecPanel />
        </div>
      </div>
    </div>

    <!-- 页脚 -->
    <AppFooter />

    <!-- 枪管编辑器弹窗 -->
    <BarrelEditor
      :visible="appStore.state.showBarrelEditor"
      :weapon-id="appStore.state.editingWeaponId"
      @update:visible="onBarrelVisibleChange"
      @saved="onBarrelSaved"
    />

    <!-- 基础属性编辑器弹窗 -->
    <WeaponBaseEditor
      :visible="appStore.state.showBaseEditor"
      :weapon-id="appStore.state.editingBaseWeaponId"
      :caliber-options="caliberOptions"
      @update:visible="onBaseVisibleChange"
      @saved="onBaseSaved"
    />

    <!-- 单次伤害模拟弹窗 -->
    <DamageDetailModal
      v-model:visible="showDamageDetail"
      :weapon-id="detailWeaponId"
      :config-id="detailConfigId"
      :distance="paramsStore.state.distance"
    />

    <!-- ⭐ 通用确认弹窗 -->
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
</template>

<script setup>
import { ref, computed, onMounted, provide } from 'vue'
import { dataStore } from '@/stores/dataStore'
import { paramsStore } from '@/stores/paramsStore'
import { appStore } from '@/stores/appStore'
import { SimulationEngine } from '@/core/SimulationEngine'
import { computeKeyPoints } from '@/core/KeyPointsComputer'

import { calculateCurrentValues } from '@/utils/weaponCalc'

// 导入组件
import AppHeader from '@/components/AppHeader.vue'
import AppFooter from '@/components/AppFooter.vue'
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

// ---------- 状态 ----------
const highlightWeapon = ref(null)
const distances = ref(Array.from({ length: 101 }, (_, i) => i))
const caliberOptions = ref([])

const displayCount = ref(10)
const barDisplayCount = ref(10)

// ⭐ 自定义起止距离（默认 0~100m）
const customStart = ref(0)
const customEnd = ref(100)

const showDamageDetail = ref(false)
const detailWeaponId = ref(null)
const detailConfigId = ref('#1')

// ---------- 计算属性 ----------
const weaponRows = computed(() => {
  return dataStore.state.weapons || []
})

const muzzleOptions = ['无', '死寂', '先进/轻语/勇火', '冲锋枪回声消音器']

const distanceStats = ref([])

/**
 * ⭐ 传递给 DistanceChart 的分段
 */
const segmentProp = computed(() => ({
  start: customStart.value,
  end: customEnd.value
}))

// ============================================================
// ⭐ 通用确认弹窗（Promise 封装 + provide）
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
// ⭐ 应用自定义分段
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
// ⭐ TTK 计算（全局）
// ============================================================
const handleCalculate = async () => {
  // ⭐ 互斥：单枪更新中时不允许全局计算
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

    const { armed, attachments } = buildArmedWeapons(enabledConfigs)
    const dm = dataStore.getDataManager()
    const tcm = dm.getTtkCacheManager?.() || null
    const params = paramsStore.state

    const total = armed.length
    appStore.showCalcProgress('计算 TTK 中...', total)

    const results = []
    let cacheHits = 0
    let cacheMisses = 0
    let skippedCount = 0

    for (let i = 0; i < armed.length; i++) {
      const weapon = armed[i]
      const attachment = attachments[i] || {}
      const params = paramsStore.state

      // ⭐⭐⭐ 前置检查：解析实际使用的子弹
      const realBulletKey = SimulationEngine.getRealBulletKey(
        attachment.bulletType,
        weapon,
        params,
        dm
      )

      if (!realBulletKey) {
        console.log(`⚠️ 跳过 ${weapon._displayName || weapon.name}：无 Lv.${params.bulletLevel} 子弹`)
        skippedCount++
        appStore.updateCalcProgress(i + 1)
        continue
      }

      const bulletData = dm.getBulletById(realBulletKey)
      if (!bulletData) {
        console.log(`⚠️ 跳过 ${weapon._displayName || weapon.name}：子弹 ${realBulletKey} 不存在`)
        skippedCount++
        appStore.updateCalcProgress(i + 1)
        continue
      }

      // ⭐⭐⭐ 统一走 computeKeyPoints（内部查 ttkCache + 未命中算 + 写缓存）
      const kp = await computeKeyPoints({
        armedWeapon: weapon,
        attachment,
        bulletId: realBulletKey,
        params,
        dataManager: dm,
        ttkCacheManager: tcm
      })

      if (!kp || !kp.keyPoints || kp.keyPoints.length === 0) {
        console.log(`⚠️ 跳过 ${weapon._displayName || weapon.name}：keyPoints 为空`)
        skippedCount++
        appStore.updateCalcProgress(i + 1)
        continue
      }

      if (kp.fromCache) {
        cacheHits++
      } else {
        cacheMisses++
      }

      // ============================================================
      // 计算 TTK 分解
      // ============================================================
      const totalTimeMs = tcm.interpolateTTK(kp.keyPoints, params.distance)
      const avgShots = tcm.averageShots(kp.keyPoints)
      const burstIntervalMs = (kp.avgBurstInterval || 0) * 1000

      const triggerDelay = params.triggerDelayEnable ? (weapon.triggerDelay || 0) : 0
      const velocity = weapon.velocity || 500
      const flight = (params.distance / velocity) * 1000

      const nonShotPart = flight + triggerDelay + burstIntervalMs
      const remaining = Math.max(0, totalTimeMs - nonShotPart)
      const noMissFireDelay = remaining * (0.5 / 0.7)
      const emptyDelay = remaining * (0.2 / 0.7)

      results.push({
        name: weapon._displayName || weapon.name,
        weapon,
        totalTime: totalTimeMs || 0,
        noMissFireDelay: noMissFireDelay || 0,
        burstInterval: burstIntervalMs,
        emptyDelay: emptyDelay || 0,
        flight: flight || 0,
        triggerDelay: triggerDelay || 0,
        avgShots: avgShots || 0,
        fromCache: kp.fromCache
      })

      appStore.updateCalcProgress(i + 1)
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    results.sort((a, b) => a.totalTime - b.totalTime)
    appStore.setTtkResults(results)

    console.log(`✅ TTK 计算完成: ${results.length} 个配置 (缓存命中 ${cacheHits}, 失效重算 ${cacheMisses}, 跳过 ${skippedCount})`)

    await handleDistanceChart()
    computeHavocCosts(enabledConfigs, dm, tcm, params)

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
// ⭐ 单枪 TTK 更新
// ============================================================

/**
 * 更新单把枪的完整 TTK 数据（所有配置）
 */
const updateSingleWeaponTTK = async (weaponId, onProgress) => {
  const dm = dataStore.getDataManager()
  const tcm = dm.getTtkCacheManager?.() || null
  const params = paramsStore.state

  const weapon = dataStore.getWeaponById(weaponId)
  if (!weapon) {
    console.warn(`⚠️ updateSingleWeaponTTK: 未找到武器 ${weaponId}`)
    return { success: false, newDistanceStats: [] }
  }

  const allConfigRows = dataStore.getPriceRowsForWeapon(weaponId)
  if (allConfigRows.length === 0) {
    console.warn(`⚠️ updateSingleWeaponTTK: 武器 ${weaponId} 无配置`)
    return { success: false, newDistanceStats: [] }
  }

  const { armed, attachments } = buildArmedWeapons(allConfigRows)

  const newDistanceStats = []
  const totalConfigs = armed.length

  for (let idx = 0; idx < armed.length; idx++) {
    const weaponArmed = armed[idx]
    const attachment = attachments[idx] || {}
    const configId = attachment.configId || '#1'

    const price = dm.getPriceByWeaponId(weaponId)
    const config = price?.configs.find(c => c.id === configId)

    if (config) {
      // ⭐ 解析实际子弹
      const realBulletKey = SimulationEngine.getRealBulletKey(
        attachment.bulletType,
        weaponArmed,
        params,
        dm
      )

      if (!realBulletKey) {
        console.warn(`⚠️ 武器 ${weaponId} 配置 ${configId} 计算失败（子弹未匹配）`)
      } else {
        // ⭐ 统一走 computeKeyPoints（会先查缓存）
        const kp = await computeKeyPoints({
          armedWeapon: weaponArmed,
          attachment,
          bulletId: realBulletKey,
          params,
          dataManager: dm,
          ttkCacheManager: tcm
        })

        if (kp && kp.keyPoints && kp.keyPoints.length > 0) {
          if (config.enabled !== false) {
            // 计算加权平均
            const times = distances.value.map(d => tcm.interpolateTTK(kp.keyPoints, d))

            let weightedSum = 0
            let weightSum = 0
            distances.value.forEach((d, i) => {
              const ttk = times[i]
              if (ttk > 0) {
                const w = 1.5 - (d / 100) * 1.0
                weightedSum += ttk * w
                weightSum += w
              }
            })
            const weightedAvg = weightSum > 0 ? weightedSum / weightSum : Infinity

            newDistanceStats.push({
              weapon: weaponArmed,
              times,
              keyPoints: kp.keyPoints,
              displayName: weaponArmed._displayName || weaponArmed.name,
              weightedAvg
            })
          }
        } else {
          console.warn(`⚠️ 武器 ${weaponId} 配置 ${configId} 计算失败（keyPoints 为空）`)
        }
      }
    }

    if (typeof onProgress === 'function') {
      onProgress(idx + 1, totalConfigs)
    }

    await new Promise(resolve => setTimeout(resolve, 0))
  }

  return { success: true, newDistanceStats }
}

/**
 * ⭐ 单枪更新的事件处理
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
  appStore.showCalcProgress(`更新 ${weaponName} 中...`, 1)

  try {
    const dm = dataStore.getDataManager()
    const tcm = dm.getTtkCacheManager?.() || null
    const params = paramsStore.state

    const { success, newDistanceStats } = await updateSingleWeaponTTK(
      weaponId,
      (current, total) => {
        appStore.updateCalcProgress(current)
        appStore.state.calcProgress.title = `更新 ${weaponName} 中...`
      }
    )

    if (!success) {
      console.warn(`⚠️ 单枪更新失败: ${weaponId}`)
      return
    }

    // ---------- 更新 TTK 结果 ----------
    const oldResults = appStore.state.ttkResults || []
    const filteredResults = oldResults.filter(
      r => r.weapon?.id !== weaponId
    )

    const newTtkResults = []
    for (const stat of newDistanceStats) {
      const weaponArmed = stat.weapon
      const configId = weaponArmed._configId || '#1'

      const totalTimeMs = tcm.interpolateTTK(stat.keyPoints, params.distance)
      const avgShots = tcm.averageShots(stat.keyPoints)
      const burstIntervalMs = (weaponArmed._current?.avgBurstInterval || 0) * 1000

      const triggerDelay = params.triggerDelayEnable ? (weaponArmed.triggerDelay || 0) : 0
      const velocity = weaponArmed.velocity || 500
      const flight = (params.distance / velocity) * 1000

      const nonShotPart = flight + triggerDelay + burstIntervalMs
      const remaining = Math.max(0, totalTimeMs - nonShotPart)
      const noMissFireDelay = remaining * (0.5 / 0.7)
      const emptyDelay = remaining * (0.2 / 0.7)

      newTtkResults.push({
        name: weaponArmed._displayName || weaponArmed.name,
        weapon: weaponArmed,
        totalTime: totalTimeMs || 0,
        noMissFireDelay: noMissFireDelay || 0,
        burstInterval: burstIntervalMs,
        emptyDelay: emptyDelay || 0,
        flight: flight || 0,
        triggerDelay: triggerDelay || 0,
        avgShots: avgShots || 0,
        fromCache: true
      })
    }

    const mergedResults = [...filteredResults, ...newTtkResults]
    mergedResults.sort((a, b) => a.totalTime - b.totalTime)
    appStore.setTtkResults(mergedResults)

    // ---------- 更新评分 ----------
    const oldScores = appStore.state.scores || {}
    const newScores = { ...oldScores }

    const prefix = `${weaponId}_`
    for (const key of Object.keys(newScores)) {
      if (key.startsWith(prefix)) {
        delete newScores[key]
      }
    }

    for (const stat of newDistanceStats) {
      const weaponArmed = stat.weapon
      const configId = weaponArmed._configId || '#1'
      const key = `${weaponId}_${configId}`

      const price = dm.getPriceByWeaponId(weaponId)
      const config = price?.configs.find(c => c.id === configId)
      const aimSpeed = config?.aimSpeed || 0

      newScores[key] = {
        ttk: stat.weightedAvg,
        aim: aimSpeed
      }
    }
    appStore.setScores(newScores)

    // ---------- 更新哈弗币消耗 ----------
    if (tcm) {
      const oldHavoc = appStore.state.havocCosts || {}
      const newHavoc = { ...oldHavoc }

      for (const key of Object.keys(newHavoc)) {
        if (key.startsWith(prefix)) {
          delete newHavoc[key]
        }
      }

      const price = dm.getPriceByWeaponId(weaponId)
      if (price) {
        for (const config of price.configs) {
          if (config.enabled === false) continue

          // ⭐ 从 ttkCache 读
          const key = `${weaponId}_${config.id}`
          const keyPoints = getKeyPointsForConfig(weaponId, config, params, dm, tcm)
          if (!keyPoints) continue

          try {
            const cost = tcm.calculateHavocCostAverage(
              keyPoints,
              {
                weaponPrice: config.price || 0,
                kdRatio: params.kdRatio ?? 1.0,
                extractRate: params.extractRate ?? 0.5,
                extraCost: params.extraCost ?? 30
              }
            )
            newHavoc[key] = cost
          } catch (e) {
            console.warn(`⚠️ 哈弗币计算失败: ${key}`, e)
          }
        }
      }
      appStore.setHavocCosts(newHavoc)
    }

    // ---------- 更新折线图数据 ----------
    if (newDistanceStats.length > 0) {
      const oldStats = distanceStats.value || []
      const filteredStats = oldStats.filter(
        s => s.weapon?.id !== weaponId
      )
      const mergedStats = [...filteredStats, ...newDistanceStats]
      mergedStats.sort((a, b) => a.weightedAvg - b.weightedAvg)
      distanceStats.value = mergedStats
    }

    dataStore.clearWeaponModified(weaponId)

    const w = dataStore.getWeaponById(weaponId)
    console.log(`✅ 单枪 TTK 更新完成: ${w?.name || weaponId} (${newDistanceStats.length} 个启用配置)`)
  } catch (error) {
    console.error('单枪更新失败:', error)
    showAlert('更新失败: ' + error.message)
  } finally {
    appStore.removeUpdatingWeapon(weaponId)
    appStore.hideCalcProgress()
  }
}

/**
 * ⭐ 辅助：从 ttkCache 读取某配置的 keyPoints
 * 
 * @param {number} weaponId
 * @param {Object} config - 原始 config 对象
 * @param {Object} params - 战斗参数
 * @param {DataManager} dm
 * @param {TtkCacheManager} tcm
 * @returns {Array|null} keyPoints 或 null
 */
const getKeyPointsForConfig = (weaponId, config, params, dm, tcm) => {
  const weapon = dm.getWeaponById(weaponId)
  if (!weapon) return null

  const barrelId = config.barrelId ?? -1
  const muzzleId = config.muzzleId ?? 0
  const precision = config.precision ?? 0.09

  // 解析子弹
  const bulletId = SimulationEngine.getRealBulletKey(
    config.bullet || null,
    weapon,
    params,
    dm
  )
  if (!bulletId) return null

  const weaponKey = tcm.makeWeaponKey(weaponId, config.id, barrelId, muzzleId, precision)
  const defenderKey = tcm.makeDefenderKey(
    params.armorLevel, params.armorValue,
    params.helmetLevel, params.helmetValue
  )

  // 构建 hitRateMap
  let hitRateMap = []
  if (config.distance && config.hitRate &&
      Array.isArray(config.distance) && Array.isArray(config.hitRate)) {
    const len = Math.min(config.distance.length, config.hitRate.length)
    for (let i = 0; i < len; i++) {
      hitRateMap.push({ distance: config.distance[i], rate: config.hitRate[i] })
    }
  }

  const scenarioKey = tcm.makeScenarioKey(
    hitRateMap.length > 0 ? hitRateMap : params.hitRateMap,
    params.hitProb,
    params.triggerDelayEnable,
    params.healthValue
  )

  return tcm.get(weaponKey, bulletId, defenderKey, scenarioKey)
}

// ============================================================
// ⭐ 哈弗币消耗计算（全量）
// ============================================================
const computeHavocCosts = (enabledConfigs, dm, tcm, params) => {
  if (!tcm) {
    appStore.setHavocCosts({})
    return
  }

  const havocCosts = {}
  let computed = 0
  let skipped = 0

  for (const configRow of enabledConfigs) {
    const weaponId = configRow._weaponId
    const configId = configRow.configId || '#1'
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

    const keyPoints = getKeyPointsForConfig(weaponId, config, params, dm, tcm)
    if (!keyPoints || keyPoints.length === 0) {
      skipped++
      continue
    }

    try {
      const cost = tcm.calculateHavocCostAverage(
        keyPoints,
        {
          weaponPrice: config.price || 0,
          kdRatio: params.kdRatio ?? 1.0,
          extractRate: params.extractRate ?? 0.5,
          extraCost: params.extraCost ?? 30
        }
      )
      havocCosts[key] = cost
      computed++
    } catch (e) {
      console.warn(`⚠️ 哈弗币消耗计算失败: ${key}`, e)
      skipped++
    }
  }

  appStore.setHavocCosts(havocCosts)
  console.log(`💰 哈弗币估算完成: ${computed} 条 (跳过 ${skipped})`)
}

// ============================================================
// ⭐ 折线图（全量）
// ============================================================
const handleDistanceChart = async () => {
  try {
    const enabledConfigs = getEnabledConfigs()
    if (enabledConfigs.length === 0) return

    const { armed, attachments } = buildArmedWeapons(enabledConfigs)

    appStore.showCalcProgress('生成折线图数据中...', armed.length)

    const stats = await buildDistanceStats(armed, attachments)

    const dm = dataStore.getDataManager()
    const scores = {}
    for (const s of stats) {
      const weaponId = s.weapon.id
      const configId = s.weapon._configId || '#1'
      const key = `${weaponId}_${configId}`

      const price = dm.getPriceByWeaponId(weaponId)
      const config = price?.configs.find(c => c.id === configId)
      const aimSpeed = config?.aimSpeed || 0

      scores[key] = {
        ttk: s.weightedAvg,
        aim: aimSpeed
      }
    }
    appStore.setScores(scores)
    console.log(`⭐ 评分原始数据已计算: ${Object.keys(scores).length} 条`)

    let allZero = true
    if (stats.length > 0 && stats[0].times) {
      for (let i = 0; i < Math.min(stats[0].times.length, 10); i++) {
        if (stats[0].times[i] > 0) {
          allZero = false
          break
        }
      }
    }

    if (stats.length > 0 && allZero) {
      const mockStats = stats.map((s, i) => {
        const baseTime = 200 + (i % 10) * 50
        return {
          ...s,
          times: distances.value.map(d => baseTime + d * 1.2 + Math.random() * 30)
        }
      })
      distanceStats.value = mockStats
    } else {
      distanceStats.value = stats
    }

    console.log(`✅ 折线图数据生成完成: ${stats.length} 个武器`)

    appStore.hideCalcProgress()
  } catch (error) {
    console.error('生成折线图失败:', error)
    appStore.hideCalcProgress()
  }
}

const getEnabledConfigs = () => {
  const rows = dataStore.getPriceRows()
  return rows.filter(row => row.enabled !== false)
}

// ============================================================
// ⭐ 构建武装武器
// ============================================================
const buildArmedWeapons = (configs) => {
  const armed = []
  const attachments = []

  for (const config of configs) {
    const weapon = dataStore.getWeaponById(config._weaponId)
    if (!weapon) continue

    const displayName = `${weapon.name} ${config.configId || ''}`.trim()

    let barrel = null
    let barrelIndex = -1
    if (config.barrelId !== undefined && config.barrelId >= 0 && weapon.barrels && weapon.barrels[config.barrelId]) {
      barrel = weapon.barrels[config.barrelId]
      barrelIndex = config.barrelId
    }

    const precision = (typeof config.precision === 'number' && !isNaN(config.precision))
      ? config.precision
      : 0.09

    const current = calculateCurrentValues(weapon, barrel, config.muzzleId || 0, precision)

    const armedWeapon = {
      ...weapon,
      ...current,
      _current: current,
      _displayName: displayName,
      _configId: config.configId || '#1',
      _price: config.price || 0,
      triggerDelay: weapon.triggerDelay || 0
    }

    armed.push(armedWeapon)

    let hitRateMap = []
    if (config.distance && config.hitRate &&
        Array.isArray(config.distance) && Array.isArray(config.hitRate) &&
        config.distance.length > 0 && config.hitRate.length > 0) {
      const len = Math.min(config.distance.length, config.hitRate.length)
      for (let i = 0; i < len; i++) {
        hitRateMap.push({
          distance: config.distance[i],
          rate: config.hitRate[i]
        })
      }
    }

    attachments.push({
      weaponId: weapon.id,
      configId: config.configId || '#1',
      barrelIndex,
      muzzleIndex: config.muzzleId || 0,
      precision,
      bulletType: config.bulletId || null,
      hitRateMap: hitRateMap,
      displayName
    })
  }

  return { armed, attachments }
}

// ============================================================
// ⭐ 折线图数据构建（全量）
// ============================================================
const buildDistanceStats = async (armed, attachments) => {
  const params = paramsStore.state
  const dm = dataStore.getDataManager()
  const tcm = dm.getTtkCacheManager?.() || null
  const stats = []

  for (let idx = 0; idx < armed.length; idx++) {
    const weapon = armed[idx]
    const attachment = attachments[idx] || {}
    const displayName = weapon._displayName || weapon.name

    // ⭐⭐⭐ 前置检查：解析实际使用的子弹
    const realBulletKey = SimulationEngine.getRealBulletKey(
      attachment.bulletType,
      weapon,
      params,
      dm
    )

    if (!realBulletKey) {
      console.log(`⚠️ 折线图跳过 ${displayName}：无 Lv.${params.bulletLevel} 子弹`)
      appStore.updateCalcProgress(idx + 1)
      continue
    }

    const bulletData = dm.getBulletById(realBulletKey)
    if (!bulletData) {
      console.log(`⚠️ 折线图跳过 ${displayName}：子弹 ${realBulletKey} 不存在`)
      appStore.updateCalcProgress(idx + 1)
      continue
    }

    // ⭐⭐⭐ 统一走 computeKeyPoints
    const kp = await computeKeyPoints({
      armedWeapon: weapon,
      attachment,
      bulletId: realBulletKey,
      params,
      dataManager: dm,
      ttkCacheManager: tcm
    })

    if (!kp || !kp.keyPoints || kp.keyPoints.length === 0) {
      console.log(`⚠️ 折线图跳过 ${displayName}：keyPoints 为空`)
      appStore.updateCalcProgress(idx + 1)
      continue
    }

    if (kp.fromCache) {
      console.log(`💾 缓存命中: ${displayName}`)
    } else {
      console.log(`💾 已缓存: ${displayName} (${kp.keyPoints.length} 个关键点)`)
    }

    // 插值生成 101 个点的完整曲线
    const times = distances.value.map(d => tcm.interpolateTTK(kp.keyPoints, d))

    let weightedSum = 0
    let weightSum = 0
    distances.value.forEach((d, i) => {
      const ttk = times[i]
      if (ttk > 0) {
        const w = 1.5 - (d / 100) * 1.0
        weightedSum += ttk * w
        weightSum += w
      }
    })
    const weightedAvg = weightSum > 0 ? weightedSum / weightSum : Infinity

    stats.push({
      weapon,
      times,
      keyPoints: kp.keyPoints,
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
// ⭐ 数据管理（导出/导入/重置）
// ============================================================

const exportData = async () => {
  try {
    const result = await showConfirm({
      title: '📤 导出数据',
      message: '是否包含缓存数据？\n\n包含缓存：下次导入时可直接读取，无需重算\n不含缓存：文件更小，导入后需重新计算',
      confirmText: '导出',
      cancelText: '取消',
      confirmType: 'primary',
      checkboxLabel: '包含缓存数据',
      checkboxDefault: true
    })

    if (result.confirmed) {
      dataStore.exportData(result.checked)
    }
  } catch (error) {
    console.error('导出失败:', error)
    showAlert('导出失败: ' + error.message)
  }
}

const importData = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    try {
      const result = await showConfirm({
        title: '📥 导入数据',
        message: `即将导入文件「${file.name}」\n\n导入将覆盖当前所有数据，确定继续吗？`,
        confirmText: '导入',
        cancelText: '取消',
        confirmType: 'warning'
      })

      if (!result.confirmed) return

      const reader = new FileReader()
      reader.onload = async (event) => {
        try {
          dataStore.importData(event.target.result)
          dataStore.refreshWeapons()
          dataStore.refreshBullets()
          dataStore.refreshPrices()
          dataStore.refreshArmors()
          await showAlert('✅ 数据导入成功！')
        } catch (error) {
          console.error('导入失败:', error)
          showAlert('导入失败: ' + error.message)
        }
      }
      reader.onerror = () => {
        showAlert('读取文件失败')
      }
      reader.readAsText(file)
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
    message: '⚠️ 确定要重置所有数据为默认值吗？\n\n当前的所有修改都将丢失！',
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

    // ⭐ 清空 ttkCache
    const dm = dataStore.getDataManager()
    const tcm = dm.getTtkCacheManager?.()
    if (tcm) {
      tcm.clearAll()
      console.log('🗑️ 已清空 ttkCache')
    }

    setTimeout(() => {
      handleCalculate()
    }, 500)

    await showAlert('✅ 数据已重置为默认值！')
  } catch (error) {
    console.error('重置失败:', error)
    showAlert('重置失败: ' + error.message)
  }
}

// ============================================================
// ⭐ 武器管理
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
// ⭐ 枪管编辑器
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
  if (visible) {
    // 打开时由 openBarrelEditor 触发
  } else {
    appStore.closeBarrelEditor()
  }
}

// ============================================================
// ⭐ 基础属性编辑器
// ============================================================
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

// ---------- 初始化 ----------
onMounted(async () => {
  try {
    await dataStore.loadData()

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
    console.log('=== 调试结束 ===')

    setTimeout(() => {
      handleCalculate()
    }, 500)
  } catch (error) {
    console.error('初始化失败:', error)
    showAlert('数据加载失败，请检查 data.json 文件是否存在')
  }
})
</script>

<style>
/* ============================================================
   App 组件专用样式（不变）
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
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  margin: 6px 0;
}

.chart-wrapper {
  background: var(--color-bg-white);
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: var(--shadow-sm);
  border: 1px solid #ddd;
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

@media (max-width: 768px) {
  #app {
    padding: 4px 8px 12px;
  }

  .chart-wrapper {
    padding: 10px;
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
}
</style>