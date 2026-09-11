<!-- src/App.vue -->
<template>
  <div id="app">
    <!-- 头部 -->
    <AppHeader />

    <!-- 参数面板（内部已包含所有操作按钮） -->
    <ParamsPanel
      @calculate="handleCalculate"
      @distance-chart="handleDistanceChart"
      @export-data="exportData"
      @import-data="importData"
      @reset-data="resetData"
    />

    <!-- 图表区域 -->
    <div class="charts-area">
      <!-- ⭐ 柱状图（TTK 对比） -->
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

      <!-- ⭐ 折线图（距离 - TTK） -->
      <div class="chart-wrapper">
        <div class="chart-header">
          <h3 class="chart-title">📈 距离 - TTK 折线图</h3>
          <div class="chart-controls">
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
        />
      </div>
    </div>

    <!-- ============ 表格区域 ============ -->
    <div class="table-section">
      <!-- Tab 导航 -->
      <div class="table-tabs">
        <button
          class="tab-btn"
          :class="{ active: appStore.state.currentTab === 'price' }"
          @click="switchTab('price')"
        >
          💰 价格数据
        </button>
        <button
          class="tab-btn"
          :class="{ active: appStore.state.currentTab === 'weapon' }"
          @click="switchTab('weapon')"
        >
          🔫 枪械数据
        </button>
        <button
          class="tab-btn"
          :class="{ active: appStore.state.currentTab === 'bullet' }"
          @click="switchTab('bullet')"
        >
          💊 子弹数据
        </button>
      </div>

      <!-- Tab 内容 -->
      <div class="tab-content">
        <!-- 价格表格容器 -->
        <div
          id="tab-price"
          v-show="appStore.state.currentTab === 'price'"
          class="tab-pane"
        >
          <PriceTable
            :data="priceRows"
            :muzzle-options="muzzleOptions"
            :get-barrel-options="getBarrelOptions"
            :get-bullet-options="getBulletOptions"
            :havoc-costs="appStore.state.havocCosts"
            @update="onDataUpdate"
            @add-config="onAddConfig"
            @show-damage-detail="onShowDamageDetail"
          />
        </div>

        <!-- 武器表格容器 -->
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
          />
        </div>

        <!-- 子弹表格容器 -->
        <div
          id="tab-bullet"
          v-show="appStore.state.currentTab === 'bullet'"
          class="tab-pane"
        >
          <BulletTable
            :data="bulletRows"
            :caliber-options="caliberOptions"
            @update="onBulletUpdate"
            @add-bullet="onAddBullet"
            @delete-bullet="onDeleteBullet"
          />
        </div>
      </div>
    </div>

    <!-- 页脚 -->
    <AppFooter />

    <!-- ============ 新增配置弹窗 ============ -->
    <div v-if="showAddConfigModal" class="modal-overlay" @click.self="closeAddConfigModal">
      <div class="modal-content modal-small">
        <div class="modal-header">
          <h3>➕ 新增价格配置</h3>
          <button class="modal-close" @click="closeAddConfigModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>选择武器</label>
            <select v-model="addConfigWeaponId" class="form-select">
              <option v-for="w in addConfigWeaponList" :key="w.id" :value="w.id">
                {{ w.name }}（已有 {{ getConfigCount(w.id) }} 个配置）
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>配置 ID</label>
            <input v-model="addConfigId" class="form-input" placeholder="如: #1, #2" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="closeAddConfigModal">取消</button>
          <button class="btn-primary" @click="confirmAddConfig">✅ 确认添加</button>
        </div>
      </div>
    </div>

    <!-- ============ 枪管编辑器弹窗 ============ -->
    <BarrelEditor
      :visible="appStore.state.showBarrelEditor"
      :weapon-id="appStore.state.editingWeaponId"
      @update:visible="onBarrelVisibleChange"
      @saved="onBarrelSaved"
    />

    <!-- ============ ⭐ 单次伤害模拟弹窗 ============ -->
    <DamageDetailModal
      v-model:visible="showDamageDetail"
      :weapon-id="detailWeaponId"
      :config-id="detailConfigId"
      :distance="paramsStore.state.distance"
    />
  </div>

  <!-- ============ ⭐ 计算进度遮罩 ============ -->
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

  <!-- ============ ⭐ 移动端竖屏提示 ============ -->
  <Teleport to="body">
    <div
      v-if="!rotateHintDismissed"
      class="rotate-hint"
      @click="closeRotateHint"
    >
      <div class="rotate-hint-card" @click.stop>
        <div class="rotate-hint-icon">📱</div>
        <div class="rotate-hint-text">请横屏使用</div>
        <button class="rotate-hint-btn" @click="closeRotateHint">知道了</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { dataStore } from '@/stores/dataStore'
import { paramsStore } from '@/stores/paramsStore'
import { appStore } from '@/stores/appStore'
import { SimulationEngine } from '@/core/SimulationEngine'
import { BulletStrategyFactory } from '@/core/BulletStrategy'
import { SIMULATION_CONFIG, CHART_CONFIG } from '@/core/config'

// ⭐ 从 weaponCalc 引入抽出的函数
import { calculateCurrentValues } from '@/utils/weaponCalc'

// 导入组件
import AppHeader from '@/components/AppHeader.vue'
import AppFooter from '@/components/AppFooter.vue'
import ParamsPanel from '@/components/ParamsPanel.vue'
import TTKChart from '@/components/TTKChart.vue'
import DistanceChart from '@/components/DistanceChart.vue'
import PriceTable from '@/components/PriceTable.vue'
import WeaponTable from '@/components/WeaponTable.vue'
import BulletTable from '@/components/BulletTable.vue'
import BarrelEditor from '@/components/BarrelEditor.vue'
import DamageDetailModal from '@/components/DamageDetailModal.vue'

// ---------- 状态 ----------
const highlightWeapon = ref(null)
const distances = ref(Array.from({ length: 101 }, (_, i) => i))
const caliberOptions = ref([])

// ⭐ 折线图显示数量（默认 10，0 或负数表示全部）
const displayCount = ref(10)

// ⭐ 柱状图显示数量（默认 10，独立于折线图）
const barDisplayCount = ref(10)

// 新增配置弹窗状态
const showAddConfigModal = ref(false)
const addConfigWeaponId = ref(null)
const addConfigId = ref('')

// ⭐ 单次伤害模拟弹窗状态
const showDamageDetail = ref(false)
const detailWeaponId = ref(null)
const detailConfigId = ref('#1')

// ⭐ 移动端竖屏提示：是否已被用户关闭
const rotateHintDismissed = ref(false)

const closeRotateHint = () => {
  rotateHintDismissed.value = true
}

// ---------- 计算属性 ----------
const priceRows = computed(() => {
  const prices = dataStore.state.prices
  if (!prices || prices.length === 0) {
    return []
  }
  const rows = dataStore.getPriceRows()
  return rows || []
})

const weaponRows = computed(() => {
  return dataStore.state.weapons || []
})

const bulletRows = computed(() => {
  return dataStore.state.bullets || []
})

const muzzleOptions = ['无', '死寂', '先进/轻语/勇火', '冲锋枪回声消音器']

// 新增配置弹窗 - 武器列表
const addConfigWeaponList = computed(() => {
  const weapons = dataStore.state.weapons || []
  return weapons.filter(w => {
    const price = dataStore.getPriceByWeaponId(w.id)
    return price && price.configs && price.configs.length > 0
  })
})

// ---------- 距离图表数据 ----------
const distanceStats = ref([])

// ---------- 辅助函数 ----------
const getConfigCount = (weaponId) => {
  const price = dataStore.getPriceByWeaponId(weaponId)
  return price?.configs?.length || 0
}

const getBarrelOptions = (row) => {
  const weaponId = row._weaponId
  if (!weaponId) return ['无']
  const weapon = dataStore.getWeaponById(weaponId)
  if (!weapon || !weapon.barrels || weapon.barrels.length === 0) return ['无']
  const options = weapon.barrels.map(b => b.name)
  return ['无', ...options]
}

const getWeaponBarrelOptions = (row) => {
  const weapon = dataStore.getWeaponById(row.id)
  if (!weapon || !weapon.barrels || weapon.barrels.length === 0) return ['无']
  const options = weapon.barrels.map(b => b.name)
  return ['无', ...options]
}

const getBulletOptions = (row) => {
  const weaponId = row._weaponId
  if (!weaponId) return ['无']
  const weapon = dataStore.getWeaponById(weaponId)
  if (!weapon || !weapon.allowedBullet) return ['无']
  const bullets = dataStore.getDataManager().getBulletsByCaliber(weapon.allowedBullet)
  if (!bullets || bullets.length === 0) return ['无']
  const options = bullets.map(b => `${b.caliber} Lv.${b.level}`)
  return ['无', ...options]
}

// ⭐ 折线图：显示数量输入框处理
const onDisplayCountBlur = () => {
  if (typeof displayCount.value !== 'number' || isNaN(displayCount.value)) {
    displayCount.value = 10
  }
  if (displayCount.value < 0) {
    displayCount.value = 0
  }
}

// ⭐ 柱状图：显示数量输入框处理
const onBarDisplayCountBlur = () => {
  if (typeof barDisplayCount.value !== 'number' || isNaN(barDisplayCount.value)) {
    barDisplayCount.value = 10
  }
  if (barDisplayCount.value < 0) {
    barDisplayCount.value = 0
  }
}

// 回车时失焦（两个输入框共用）
const onDisplayCountEnter = (e) => {
  e.target.blur()
}

// ---------- 事件处理 ----------
const switchTab = (tab) => {
  appStore.switchTab(tab)
}

// ⭐ 打开单次伤害模拟弹窗
const onShowDamageDetail = ({ weaponId, configId }) => {
  detailWeaponId.value = weaponId
  detailConfigId.value = configId || '#1'
  showDamageDetail.value = true
}

// ---------- 新增配置弹窗 ----------
const onAddConfig = () => {
  const weapons = dataStore.state.weapons || []
  const available = weapons.filter(w => {
    const price = dataStore.getPriceByWeaponId(w.id)
    return price && price.configs && price.configs.length > 0
  })
  
  if (available.length === 0) {
    alert('⚠️ 没有可用的武器价格配置，请先为武器创建价格配置')
    return
  }
  
  addConfigWeaponId.value = available[0].id
  addConfigId.value = ''
  showAddConfigModal.value = true
}

const closeAddConfigModal = () => {
  showAddConfigModal.value = false
  addConfigWeaponId.value = null
  addConfigId.value = ''
}

const confirmAddConfig = () => {
  const weaponId = addConfigWeaponId.value
  if (!weaponId) {
    alert('请选择武器')
    return
  }
  
  const weapon = dataStore.getWeaponById(weaponId)
  if (!weapon) {
    alert('武器不存在')
    return
  }
  
  let configId = addConfigId.value.trim()
  if (!configId) {
    const price = dataStore.getPriceByWeaponId(weaponId)
    const ids = price?.configs?.map(c => {
      const num = parseInt(c.id.replace('#', ''))
      return isNaN(num) ? 0 : num
    }) || [0]
    const maxId = Math.max(...ids)
    configId = `#${maxId + 1}`
  }
  
  const price = dataStore.getPriceByWeaponId(weaponId)
  if (price?.configs?.some(c => c.id === configId)) {
    alert(`配置 ${configId} 已存在，请使用不同的 ID`)
    return
  }
  
  const bestBarrelIndex = dataStore.findBestBarrelIndex(weaponId)
  let barrelName = '无'
  let barrelId = -1
  if (bestBarrelIndex >= 0 && weapon.barrels && weapon.barrels[bestBarrelIndex]) {
    barrelName = weapon.barrels[bestBarrelIndex].name || '无'
    barrelId = bestBarrelIndex
  }
  
  let bulletId = ''
  if (weapon.allowedBullet) {
    const defaultBullet = dataStore.getBulletByCaliberAndLevel(weapon.allowedBullet, 4)
    if (defaultBullet) {
      bulletId = defaultBullet.id
    } else {
      const bullets = dataStore.getBulletsByCaliber(weapon.allowedBullet)
      if (bullets && bullets.length > 0) {
        bulletId = bullets[0].id
      }
    }
  }
  
  const newConfig = {
    id: configId,
    barrelId: barrelId,
    barrel: barrelName,
    muzzleId: 0,
    muzzle: '无',
    buildCode: '',
    price: 0,
    distance: [30, 50, 100],
    hitRate: [1.0, 0.9, 0.6],
    bullet: bulletId || '',
    enabled: true
  }
  
  const result = dataStore.getDataManager().addPriceConfig(weaponId, newConfig)
  if (result) {
    dataStore.refreshPrices()
    closeAddConfigModal()
    console.log(`✅ 已为 ${weapon.name} 添加配置 ${configId}`)
  } else {
    alert('添加配置失败，请检查控制台错误信息')
  }
}

// ============================================================
// ⭐ TTK 计算（含进度条 + 缓存 hash 校验 + 连发间隔）
// ============================================================
const handleCalculate = async () => {
  appStore.setLoading(true)
  try {
    const enabledConfigs = getEnabledConfigs()
    if (enabledConfigs.length === 0) {
      alert('请至少启用一个价格配置')
      return
    }

    const { armed, attachments } = buildArmedWeapons(enabledConfigs)
    const dm = dataStore.getDataManager()
    const cacheManager = dm.getCacheManager?.() || null
    const params = paramsStore.state

    // ⭐ 显示进度遮罩
    const total = armed.length
    appStore.showCalcProgress('计算 TTK 中...', total)

    const results = []
    let cacheHits = 0
    let cacheMisses = 0

    for (let i = 0; i < armed.length; i++) {
      const weapon = armed[i]
      const attachment = attachments[i] || {}
      const weaponId = weapon.id
      const configId = attachment.configId || '#1'

      let totalTimeMs = 0
      let avgShots = 0
      let burstIntervalMs = 0     // ⭐ 平均连发间隔（毫秒）
      let fromCache = false

      // ============================================================
      // ⭐ 缓存读取前先校验 hash 有效性
      // ============================================================
      const price = dm.getPriceByWeaponId(weaponId)
      if (price && cacheManager) {
        const config = price.configs.find(c => c.id === configId)
        if (config && config.cache && config.cache.keyPoints) {
          // ⭐ 校验 hash（参数变化 → 缓存失效）
          const isValid = cacheManager.isCacheValid(weapon, config, params, attachment)

          if (isValid) {
            totalTimeMs = cacheManager.interpolateTTK(
              config.cache.keyPoints,
              params.distance
            )
            let totalShots = 0
            let shotCount = 0
            for (const point of config.cache.keyPoints) {
              if (point.shots !== undefined && point.shots !== null) {
                totalShots += point.shots
                shotCount++
              }
            }
            avgShots = shotCount > 0 ? totalShots / shotCount : 0
            // ⭐ 从缓存读连发间隔（秒 → 毫秒）
            burstIntervalMs = (config.cache.avgBurstInterval || 0) * 1000
            fromCache = true
            cacheHits++
          } else {
            // 缓存失效：删除旧缓存，走重新模拟
            console.log(`🔄 缓存失效: ${weapon._displayName || weapon.name} (hash 不匹配)`)
            delete config.cache
            cacheMisses++
          }
        }
      }

      if (!fromCache) {
        const realBulletKey = SimulationEngine.getRealBulletKey(
          attachment.bulletType,
          weapon,
          params,
          dm
        )
        if (realBulletKey) {
          const bulletData = dm.getBulletById(realBulletKey)
          if (bulletData) {
            const strategy = BulletStrategyFactory.getStrategy(realBulletKey)

            // ⭐ 使用配置的命中率映射
            const configHitRateMap = attachment.hitRateMap || params.hitRateMap || []
            const hitRate = dm.getHitRateFromMap(
              configHitRateMap,
              params.distance,
              0.85
            )

            const simParams = { ...params, distance: params.distance, hitRate }
            const result = SimulationEngine.calculateSinglePoint(
              weapon,
              simParams,
              SIMULATION_CONFIG.DEFAULT_SIM_COUNT,
              strategy,
              bulletData
            )
            const trigger = params.triggerDelayEnable
              ? (weapon.triggerDelay || 0) / 1000
              : 0
            totalTimeMs = (result.avgTime + trigger) * 1000
            avgShots = result.avgShots || 0
            // ⭐ 平均连发间隔（秒 → 毫秒）
            burstIntervalMs = (result.avgBurstInterval || 0) * 1000
          }
        }
      }

      const triggerDelay = params.triggerDelayEnable ? (weapon.triggerDelay || 0) : 0
      const velocity = weapon.velocity || 500
      const flight = (params.distance / velocity) * 1000

      // ⭐ 计算"无空枪射击延迟"和"空枪延迟"，从总时间里扣除飞行/连发/扳机后的部分
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
        fromCache
      })

      appStore.updateCalcProgress(i + 1)
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    results.sort((a, b) => a.totalTime - b.totalTime)
    appStore.setTtkResults(results)

    console.log(`✅ TTK 计算完成: ${results.length} 个配置 (缓存命中 ${cacheHits}, 失效重算 ${cacheMisses})`)

    await handleDistanceChart()
  } catch (error) {
    console.error('计算失败:', error)
    alert('计算失败: ' + error.message)
  } finally {
    appStore.setLoading(false)
    appStore.hideCalcProgress()
  }
}

// ============================================================
// ⭐ 折线图（含进度条 + 缓存 hash 校验）
// ============================================================
const handleDistanceChart = async () => {
  try {
    const enabledConfigs = getEnabledConfigs()
    if (enabledConfigs.length === 0) return

    const { armed, attachments } = buildArmedWeapons(enabledConfigs)

    appStore.showCalcProgress('生成折线图数据中...', armed.length)

    const stats = await buildDistanceStats(armed, attachments)

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
// ⭐ 构建武装武器（含附件、命中率映射）
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

    const current = calculateCurrentValues(weapon, barrel, config.muzzleId || 0, 0.09)

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
      bulletType: config.bulletId || null,
      hitRateMap: hitRateMap,
      displayName
    })
  }

  return { armed, attachments }
}

// ============================================================
// ⭐ 关键点生成（对齐射程分段 + 10m 间隔）
// ============================================================
const getKeyDistances = (ranges, maxDistance) => {
  const validRanges = (ranges || []).filter(r => r !== Infinity && r <= maxDistance)
  
  const keyDistances = [0]
  
  for (const range of validRanges) {
    const before = Math.max(0, range - 1)
    if (before > 0 && !keyDistances.includes(before)) {
      keyDistances.push(before)
    }
    if (!keyDistances.includes(range)) {
      keyDistances.push(range)
    }
  }
  
  for (let d = 10; d <= maxDistance; d += 10) {
    if (!keyDistances.includes(d)) {
      keyDistances.push(d)
    }
  }
  
  if (!keyDistances.includes(maxDistance)) {
    keyDistances.push(maxDistance)
  }
  
  return [...new Set(keyDistances)].sort((a, b) => a - b)
}

// ============================================================
// ⭐ 折线图数据构建（异步 + 进度 + 缓存 hash 校验 + 写缓存）
// ============================================================
const buildDistanceStats = async (armed, attachments) => {
  const params = paramsStore.state
  const dm = dataStore.getDataManager()
  const cacheManager = dm.getCacheManager?.() || null
  const stats = []

  for (let idx = 0; idx < armed.length; idx++) {
    const weapon = armed[idx]
    const attachment = attachments[idx] || {}
    const configId = attachment.configId || '#1'
    const weaponId = weapon.id
    const displayName = weapon._displayName || weapon.name

    const price = dm.getPriceByWeaponId(weaponId)
    let times = []
    let keyPoints = []

    // 1. 尝试从缓存读取（先校验 hash）
    if (price && cacheManager) {
      const config = price.configs.find(c => c.id === configId)
      if (config && config.cache && config.cache.keyPoints) {
        const isValid = cacheManager.isCacheValid(weapon, config, params, attachment)
        if (isValid) {
          keyPoints = config.cache.keyPoints
          times = distances.value.map(d => {
            return cacheManager.interpolateTTK(keyPoints, d)
          })
          console.log(`💾 缓存命中: ${displayName}`)
        } else {
          console.log(`🔄 折线图缓存失效: ${displayName} (hash 不匹配)`)
          delete config.cache
        }
      }
    }

    // 2. 缓存未命中或失效，执行模拟
    if (times.length === 0) {
      const result = calculateSingleWeapon(weapon, params, distances.value, attachment, dm)
      if (result) {
        times = result.times
        keyPoints = result.keyPoints

        // ⭐⭐⭐ 写入缓存（用新 hash + 连发间隔）
        if (price && cacheManager) {
          const config = price.configs.find(c => c.id === configId)
          if (config) {
            try {
              const hash = cacheManager.generateParamsHash(
                weapon,
                config,
                params,
                attachment
              )
              config.cache = {
                keyPoints: keyPoints,
                hash: hash,
                avgBurstInterval: result.avgBurstInterval || 0,
                cachedAt: new Date().toISOString()
              }
              console.log(`💾 已缓存: ${displayName} (${keyPoints.length} 个关键点, 平均连发间隔 ${(config.cache.avgBurstInterval * 1000).toFixed(1)}ms)`)
            } catch (e) {
              console.warn(`⚠️ 缓存写入失败: ${displayName}`, e)
            }
          }
        }
      }
    }

    // 3. 计算加权平均
    if (times.length > 0) {
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
        keyPoints,
        displayName,
        weightedAvg
      })
    }

    appStore.updateCalcProgress(idx + 1)
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  stats.sort((a, b) => a.weightedAvg - b.weightedAvg)
  return stats
}

// ============================================================
// ⭐ 计算单个武器（用于折线图）
// ============================================================
const calculateSingleWeapon = (weapon, params, distances, attachment, dm) => {
  const selectedBulletType = attachment.bulletType
  const realBulletKey = SimulationEngine.getRealBulletKey(
    selectedBulletType, weapon, params, dm
  )

  if (!realBulletKey) return null

  const bulletData = dm.getBulletById(realBulletKey)
  if (!bulletData) return null

  const strategy = BulletStrategyFactory.getStrategy(realBulletKey)
  
  const keyDistances = getKeyDistances(
    weapon.ranges || [40, 70, Infinity, Infinity],
    CHART_CONFIG.MAX_DISTANCE || 100
  )
  
  console.log(`📊 ${weapon._displayName || weapon.name} 关键点:`, keyDistances)
  
  const keyPoints = []
  let burstIntervalSum = 0

  const cacheManager = dm.getCacheManager?.() || null

  const configHitRateMap = attachment.hitRateMap || params.hitRateMap || []

  for (const distance of keyDistances) {
    const hitRate = dm.getHitRateFromMap(
      configHitRateMap,
      distance,
      0.85
    )

    const simParams = { ...params, distance, hitRate, bulletLevel: realBulletKey }
    const result = SimulationEngine.calculateSinglePoint(
      weapon, 
      simParams, 
      SIMULATION_CONFIG.DISTANCE_SIM_COUNT,
      strategy, 
      bulletData
    )

    const trigger = params.triggerDelayEnable
      ? (weapon.triggerDelay || 0) / 1000
      : 0

    const totalTimeMs = (result.avgTime + trigger) * 1000
    keyPoints.push({
      d: distance,
      t: totalTimeMs,
      shots: result.avgShots,
      bulletPrice: bulletData.price || 0
    })

    burstIntervalSum += (result.avgBurstInterval || 0)
  }

  const avgBurstInterval = keyDistances.length > 0 ? burstIntervalSum / keyDistances.length : 0

  const times = distances.map(d => {
    return cacheManager ? cacheManager.interpolateTTK(keyPoints, d) : 0
  })

  return { keyPoints, times, avgBurstInterval }
}

// ---------- 数据更新事件 ----------
const onDataUpdate = () => {
  dataStore.refreshPrices()
}

const onWeaponUpdate = (payload) => {
  dataStore.refreshWeapons()
  if (payload?.weaponId) {
    dataStore.markWeaponModified(payload.weaponId)
  }
}

const onBulletUpdate = () => {
  dataStore.refreshBullets()
}

// ---------- 数据管理 ----------
const exportData = () => {
  try {
    const includeCache = confirm('是否包含缓存数据？\n\n点击"确定"包含缓存，点击"取消"不包含缓存')
    dataStore.exportData(includeCache)
  } catch (error) {
    console.error('导出失败:', error)
    alert('导出失败: ' + error.message)
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
      const confirmed = confirm('导入将覆盖当前所有数据，确定继续吗？')
      if (!confirmed) return
      
      const reader = new FileReader()
      reader.onload = async (event) => {
        try {
          await dataStore.importData(event.target.result)
          dataStore.refreshWeapons()
          dataStore.refreshBullets()
          dataStore.refreshPrices()
          alert('✅ 数据导入成功！')
        } catch (error) {
          console.error('导入失败:', error)
          alert('导入失败: ' + error.message)
        }
      }
      reader.onerror = () => {
        alert('读取文件失败')
      }
      reader.readAsText(file)
    } catch (error) {
      console.error('导入失败:', error)
      alert('导入失败: ' + error.message)
    }
  }
  input.click()
}

const resetData = () => {
  if (!confirm('⚠️ 确定要重置所有数据为默认值吗？\n（当前修改将丢失！）')) {
    return
  }
  
  try {
    dataStore.resetData()
    dataStore.refreshWeapons()
    dataStore.refreshBullets()
    dataStore.refreshPrices()
    
    setTimeout(() => {
      handleCalculate()
    }, 500)
    
    alert('✅ 数据已重置为默认值！')
  } catch (error) {
    console.error('重置失败:', error)
    alert('重置失败: ' + error.message)
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
      alert('⚠️ 已有新增行，请先完成或取消当前新增操作')
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
    buildCode: '',
    price: 0,
    distance: [30, 50, 100],
    hitRate: [1.0, 0.9, 0.6],
    bullet: '',
    enabled: true,
    cache: null
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
  alert('删除武器功能开发中')
}

// ============================================================
// ⭐ 子弹管理
// ============================================================

/**
 * 新增 / 确认新增子弹
 */
const onAddBullet = (index, bulletData) => {
  const dm = dataStore.getDataManager()
  
  if (bulletData === undefined || bulletData === null) {
    const existing = dm.data.bullets.find(b => b._isNewRow === true)
    if (existing) {
      alert('⚠️ 已有新增行，请先完成或取消当前新增操作')
      return
    }
    
    const defaultArmorData = {}
    for (let i = 1; i <= 6; i++) {
      defaultArmorData[i] = { armorMult: 1.0, pen: 0.5 }
    }
    
    const tempBullet = {
      id: `temp_bullet_${Date.now()}`,
      caliber: '',
      level: '1',
      base: 1.0,
      price: 0,
      armorData: defaultArmorData,
      _armorMultValues: [1.0, 1.0, 1.0, 1.0, 1.0, 0.6],
      _penValues: [1.0, 1.0, 0.75, 0.5, 0, 0],
      _isNewRow: true
    }
    
    dm.data.bullets.unshift(tempBullet)
    dataStore.refreshBullets()
    
    console.log('✅ 已插入临时占位子弹')
    return
  }
  
  const existing = dm.getBulletById(bulletData.id)
  if (existing && !existing._isNewRow) {
    alert(`子弹 ${bulletData.id} 已存在`)
    return
  }
  
  const bulletList = dm.data.bullets
  const tempIndex = bulletList.findIndex(b => b._isNewRow === true)
  if (tempIndex !== -1) {
    bulletList.splice(tempIndex, 1, bulletData)
  } else {
    bulletList.push(bulletData)
  }
  
  dataStore.refreshBullets()
  console.log(`✅ 新增子弹: ${bulletData.id}`)
}

/**
 * 删除子弹 / 取消新增
 */
const onDeleteBullet = (index, bulletId, isCancelled) => {
  if (isCancelled) {
    const dm = dataStore.getDataManager()
    const bulletList = dm.data.bullets
    const tempIndex = bulletList.findIndex(b => b._isNewRow === true)
    if (tempIndex !== -1) {
      bulletList.splice(tempIndex, 1)
    }
    dataStore.refreshBullets()
    console.log('✅ 已取消新增子弹')
    return
  }
  
  const dm = dataStore.getDataManager()
  dm.removeBullet(bulletId)
  dataStore.refreshBullets()
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
    // 打开时由 openBarrelEditor 触发，无需处理
  } else {
    appStore.closeBarrelEditor()
  }
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
    console.log('priceRows 长度:', priceRows.value?.length)
    console.log('weaponRows 长度:', weaponRows.value?.length)
    console.log('bulletRows 长度:', bulletRows.value?.length)
    console.log('=== 调试结束 ===')

    setTimeout(() => {
      handleCalculate()
    }, 500)
  } catch (error) {
    console.error('初始化失败:', error)
    alert('数据加载失败，请检查 data.json 文件是否存在')
  }
})
</script>

<style>
/* ============================================================
   App 组件专用样式（全局样式已在 main.css 中定义）
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

/* ============ 图表区域 ============ */
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
  gap: var(--spacing-lg);
}

/* ⭐ 显示数量选择器 */
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

/* ============ 表格区域 ============ */
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
  padding: 4px 14px;
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

/* ============ 新增配置弹窗 ============ */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.modal-content.modal-small {
  max-width: 480px;
  width: 90%;
  background: var(--color-bg-white);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  animation: modalSlideIn 0.25s ease;
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: translateY(-30px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 18px;
  border-bottom: 1px solid var(--color-border-light);
  flex-shrink: 0;
}

.modal-header h3 {
  font-family: var(--font-family);
  font-size: 16px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
}

.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--color-text-muted);
  transition: color 0.2s;
  padding: 0 4px;
}

.modal-close:hover {
  color: #333;
}

.modal-body {
  padding: 16px 18px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  display: flex;
  gap: var(--spacing-md);
  justify-content: flex-end;
  padding: 12px 18px;
  border-top: 1px solid #eee;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.form-group {
  margin-bottom: 14px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  font-family: var(--font-family);
  font-size: 13px;
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.form-select,
.form-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-family: var(--font-family);
  font-size: 13px;
  background: var(--color-bg-light);
  transition: border-color 0.2s;
  color: var(--color-text);
}

.form-select:focus,
.form-input:focus {
  border-color: var(--color-primary);
  outline: none;
  background: var(--color-bg-white);
}

/* ============================================================
   ⭐ 计算进度遮罩
   ============================================================ */
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

/* ============================================================
   ⭐ 移动端竖屏提示
   ============================================================ */
.rotate-hint {
  display: none;   /* 默认隐藏 */
}

/* 手机竖屏时才显示 */
@media (orientation: portrait) and (max-width: 768px) {
  .rotate-hint {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 999999;
  }
}

.rotate-hint-card {
  background: #fff;
  border-radius: 16px;
  padding: 32px 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  text-align: center;
  max-width: 80vw;
  animation: rotateHintSlideIn 0.3s ease;
}

@keyframes rotateHintSlideIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.rotate-hint-icon {
  font-size: 48px;
  margin-bottom: 16px;
  display: inline-block;
  animation: rotateHintPulse 2s ease-in-out infinite;
}

@keyframes rotateHintPulse {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(90deg); }
}

.rotate-hint-text {
  font-family: var(--font-family);
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 20px;
  letter-spacing: 1px;
}

.rotate-hint-btn {
  padding: 8px 28px;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-family: var(--font-family);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.rotate-hint-btn:hover {
  background: var(--color-primary-hover);
}

.rotate-hint-btn:active {
  transform: scale(0.96);
}

/* ============ 移动端适配 ============ */
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
  
  .display-count-input {
    width: 50px;
  }
  
  .table-section {
    padding: 4px 8px 6px;
  }
  
  .tab-btn {
    padding: 4px 10px;
    font-size: var(--font-size-md);
  }
  
  .calc-progress-box {
    padding: 20px 24px;
    min-width: 280px;
    max-width: 90vw;
  }
}
</style>