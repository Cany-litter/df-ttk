<!-- src/components/ParamsPanel.vue -->
<template>
  <div class="params-panel">
    <!-- 第一行：核心战斗参数 -->
    <div class="params-row">
      <div class="param-group">
        <label>子弹等级</label>
        <select v-model="localParams.bulletLevel" @change="syncParams" class="param-select">
          <option v-for="n in 5" :key="n" :value="n">{{ n }}</option>
        </select>
      </div>

      <div class="param-group">
        <label>护甲等级</label>
        <select v-model="localParams.armorLevel" @change="syncParams" class="param-select">
          <option v-for="n in 6" :key="n" :value="n">{{ n }}</option>
        </select>
      </div>

      <div class="param-group">
        <label>护甲值</label>
        <input type="number" v-model.number="localParams.armorValue" @change="syncParams" class="param-input" />
      </div>

      <div class="param-group">
        <label>头盔等级</label>
        <select v-model="localParams.helmetLevel" @change="syncParams" class="param-select">
          <option v-for="n in 6" :key="n" :value="n">{{ n }}</option>
        </select>
      </div>

      <div class="param-group">
        <label>头盔值</label>
        <input type="number" v-model.number="localParams.helmetValue" @change="syncParams" class="param-input" />
      </div>

      <div class="param-group">
        <label>生命值</label>
        <input type="number" v-model.number="localParams.healthValue" @change="syncParams" class="param-input" />
      </div>

      <!-- 经济参数 - 橙色边框 -->
      <div class="param-group economic">
        <label>KD</label>
        <input type="number" v-model.number="localParams.kdRatio" @change="syncParams" step="0.1" class="param-input" />
      </div>

      <div class="param-group economic">
        <label>撤离率</label>
        <input type="number" v-model.number="extractRatePercent" @change="syncExtractRate" step="1" class="param-input" />
        <span class="unit">%</span>
      </div>

      <div class="param-group economic">
        <label>其他消耗</label>
        <input type="number" v-model.number="localParams.extraCost" @change="syncParams" step="1" class="param-input" />
        <span class="unit">发</span>
      </div>

      <!-- ⭐ 开镜权重 -->
      <div class="param-group economic">
        <label>开镜权重</label>
        <input type="number" v-model.number="aimWeightPercent" @change="syncAimWeight" step="5" min="0" class="param-input" />
        <span class="unit">%</span>
      </div>
    </div>

    <!-- 第二行：命中相关 -->
    <div class="params-row">
      <div class="param-group">
        <label>距离 (m)</label>
        <input type="number" v-model.number="localParams.distance" @change="syncParams" class="param-input" />
      </div>

      <div class="param-group">
        <label>全局命中率</label>
        <input
          type="text"
          v-model="hitRateRaw"
          @change="onHitRateChange"
          placeholder="30:1.0,50:0.9,100:0.6"
          class="hitrate-input"
        />
        <span class="hint">格式: 距离:命中率</span>
      </div>

      <div class="param-group checkbox-group">
        <label>
          <input type="checkbox" v-model="localParams.triggerDelayEnable" @change="syncParams" />
          扳机延迟
        </label>
      </div>

      <!-- 命中概率 - 水平排列 -->
      <div class="hit-prob-group">
        <label>命中概率</label>
        <div class="hit-prob-items">
          <div class="hit-prob-item">
            <span>头部</span>
            <input type="number" v-model.number="localParams.hitProb.head" @change="syncParams" step="0.01" min="0" max="1" class="prob-input" />
          </div>
          <div class="hit-prob-item">
            <span>胸部</span>
            <input type="number" v-model.number="localParams.hitProb.chest" @change="syncParams" step="0.01" min="0" max="1" class="prob-input" />
          </div>
          <div class="hit-prob-item">
            <span>腹部</span>
            <input type="number" v-model.number="localParams.hitProb.stomach" @change="syncParams" step="0.01" min="0" max="1" class="prob-input" />
          </div>
          <div class="hit-prob-item">
            <span>四肢</span>
            <input type="number" v-model.number="localParams.hitProb.limbs" @change="syncParams" step="0.01" min="0" max="1" class="prob-input" />
          </div>
        </div>
      </div>
    </div>

    <!-- 第三行：操作按钮 -->
    <div class="params-row buttons-row">
      <!-- ⭐ 计算 TTK（互斥禁用） -->
      <button
        class="btn-primary"
        @click="onCalculate"
        :disabled="isAnyUpdating || isGlobalCalculating"
        :title="getCalcButtonTitle()"
      >
        <template v-if="isGlobalCalculating">⏳ 计算中...</template>
        <template v-else-if="isAnyUpdating">⏳ 更新中...</template>
        <template v-else>📊 计算 TTK</template>
      </button>

      <!-- ⭐ 生成折线图（互斥禁用） -->
      <button
        class="btn-secondary"
        @click="onDistanceChart"
        :disabled="isAnyUpdating || isGlobalCalculating"
        :title="getChartButtonTitle()"
      >
        📈 生成折线图
      </button>

      <!-- ⭐ 导出数据（互斥禁用） -->
      <button
        class="btn-secondary"
        @click="onExportData"
        :disabled="isAnyUpdating || isGlobalCalculating"
        style="background:#9c27b0;color:#fff;"
      >
        📤 导出数据
      </button>

      <!-- ⭐ 导入数据（互斥禁用） -->
      <button
        class="btn-secondary"
        @click="onImportData"
        :disabled="isAnyUpdating || isGlobalCalculating"
        style="background:#607d8b;color:#fff;"
      >
        📥 导入数据
      </button>

      <!-- ⭐ 重置数据（互斥禁用） -->
      <button
        class="btn-secondary"
        @click="onResetData"
        :disabled="isAnyUpdating || isGlobalCalculating"
        style="background:#ff9800;color:#fff;"
      >
        🔄 重置数据
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { paramsStore, appStore } from '@/stores/stores'

const emit = defineEmits(['calculate', 'distance-chart', 'export-data', 'import-data', 'reset-data'])

// ---------- 本地参数（可写） ----------
const localParams = ref({
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
  aimWeight: 0.4
})

// ---------- 加载状态 ----------
const isLoading = computed(() => appStore.state.isLoading)

// ⭐ 全局计算中状态
const isGlobalCalculating = computed(() => {
  return appStore.state.isGlobalCalculating === true
})

// ⭐ 任意单枪更新中状态
const isAnyUpdating = computed(() => {
  return (appStore.state.updatingWeaponIds || []).length > 0
})

// ⭐ 互斥禁用
const isAnyBusy = computed(() => {
  return isAnyUpdating.value || isGlobalCalculating.value
})

// ---------- 撤离率（百分比显示） ----------
const extractRatePercent = computed({
  get: () => Math.round(localParams.value.extractRate * 100),
  set: (val) => {
    localParams.value.extractRate = Math.max(0, Math.min(1, val / 100))
  }
})

// ---------- ⭐ 开镜权重（百分比显示） ----------
const aimWeightPercent = computed({
  get: () => Math.round((localParams.value.aimWeight ?? 0.4) * 100),
  set: (val) => {
    const p = Math.max(0, Math.min(100, Number(val) || 0))
    localParams.value.aimWeight = p / 100
  }
})

// ---------- 命中率原始输入 ----------
const hitRateRaw = ref('')

const initHitRateRaw = () => {
  const map = localParams.value.hitRateMap
  if (map && map.length > 0) {
    hitRateRaw.value = map.map(p => `${p.distance}:${p.rate}`).join(',')
  } else {
    hitRateRaw.value = '30:1.0,50:0.9,100:0.6'
  }
}
initHitRateRaw()

// ---------- 同步参数到 store ----------
const syncParams = () => {
  paramsStore.updateAll(localParams.value)
}

const syncExtractRate = () => {
  syncParams()
}

const syncAimWeight = () => {
  syncParams()
}

// 命中率变更
const onHitRateChange = () => {
  const value = hitRateRaw.value
  if (value && value.trim() !== '') {
    try {
      const parts = value.split(',').map(p => p.trim())
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
      if (map.length > 0) {
        localParams.value.hitRateMap = map
        syncParams()
      }
    } catch (e) {
      console.warn('解析命中率映射失败:', e)
    }
  } else {
    localParams.value.hitRateMap = []
    syncParams()
  }
}

// ---------- 从 store 同步到本地 ----------
watch(() => paramsStore.state, (newState) => {
  const current = localParams.value
  if (JSON.stringify(current) !== JSON.stringify(newState)) {
    localParams.value = { ...newState }
    initHitRateRaw()
  }
}, { deep: true })

// ---------- ⭐ 按钮 title（互斥提示） ----------
const getCalcButtonTitle = () => {
  if (isGlobalCalculating.value) return '全局计算中...'
  if (isAnyUpdating.value) return '正在更新单枪数据，请稍候'
  return '计算所有启用配置的 TTK'
}

const getChartButtonTitle = () => {
  if (isGlobalCalculating.value) return '全局计算中...'
  if (isAnyUpdating.value) return '正在更新单枪数据，请稍候'
  return '生成距离-TTK 折线图数据'
}

// ---------- 事件触发 ----------
const onCalculate = () => {
  if (isAnyBusy.value) return
  syncParams()
  emit('calculate')
}

const onDistanceChart = () => {
  if (isAnyBusy.value) return
  syncParams()
  emit('distance-chart')
}

const onExportData = () => {
  if (isAnyBusy.value) return
  emit('export-data')
}

const onImportData = () => {
  if (isAnyBusy.value) return
  emit('import-data')
}

const onResetData = () => {
  if (isAnyBusy.value) return
  emit('reset-data')
}
</script>

<style scoped>
.params-panel {
  background: var(--color-bg-white);
  border-radius: var(--radius-lg);
  padding: 8px 14px;
  box-shadow: var(--shadow-sm);
  margin-bottom: var(--spacing-md);
}

.params-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 14px;
  padding: 2px 0;
}

.params-row + .params-row {
  border-top: 1px solid #f0f0f0;
  padding-top: 4px;
  margin-top: 2px;
}

.param-group {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.param-group label {
  font-family: var(--font-family);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-medium);
  color: #444;
  white-space: nowrap;
}

/* ---------- 输入框/下拉框统一基础样式 ---------- */
.param-select,
.param-input {
  padding: 2px 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
  font-size: var(--font-size-md);
  background: var(--color-bg-light);
  height: 26px;
  color: var(--color-text);
}

.param-select:focus,
.param-input:focus {
  border-color: var(--color-primary);
  outline: none;
  background: var(--color-bg-white);
}

.param-select,
.param-input {
  width: 120px;
}

.hitrate-input {
  width: 220px;
  padding: 2px 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
  font-size: var(--font-size-md);
  background: var(--color-bg-light);
  height: 26px;
  color: var(--color-text);
}

.hitrate-input:focus {
  border-color: var(--color-primary);
  outline: none;
  background: var(--color-bg-white);
}

.prob-input {
  width: 80px;
  padding: 2px 3px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  background: var(--color-bg-light);
  height: 24px;
  color: var(--color-text);
}

.prob-input:focus {
  border-color: var(--color-primary);
  outline: none;
  background: var(--color-bg-white);
}

.hint {
  font-family: var(--font-family);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  white-space: nowrap;
}

/* ---------- 经济参数 - 橙色边框 ---------- */
.param-group.economic {
  border-left: 2px solid var(--color-warning);
  padding-left: 8px;
  margin-left: 4px;
}

.param-group.economic label {
  color: #e65100;
  font-weight: var(--font-weight-semibold);
}

/* ---------- 复选框组 ---------- */
.param-group.checkbox-group label {
  font-weight: var(--font-weight-normal);
  cursor: pointer;
  font-size: var(--font-size-md);
  display: flex;
  align-items: center;
  gap: 3px;
}

.param-group.checkbox-group input[type="checkbox"] {
  width: 14px;
  height: 14px;
  cursor: pointer;
  margin: 0;
}

/* ---------- 命中概率 - 水平排列 ---------- */
.hit-prob-group {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.hit-prob-group > label {
  font-family: var(--font-family);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-medium);
  color: #444;
  white-space: nowrap;
}

.hit-prob-items {
  display: flex;
  gap: 4px 10px;
  flex-wrap: wrap;
}

.hit-prob-item {
  display: flex;
  align-items: center;
  gap: 2px;
}

.hit-prob-item span {
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  width: 28px;
  text-align: right;
}

/* ---------- 操作按钮行 ---------- */
.buttons-row {
  padding-top: 4px;
  border-top: 1px solid #eee;
  margin-top: 4px;
}

/* ⭐ 按钮禁用态（统一视觉） */
.buttons-row button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.buttons-row button:disabled:active {
  transform: none;
}

.unit {
  font-family: var(--font-family);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  margin-left: -2px;
}

/* ============ 移动端适配 ============ */
@media (max-width: 768px) {
  .params-panel {
    padding: 6px 10px;
  }

  .params-row {
    gap: 4px 8px;
  }

  .param-group label {
    font-size: var(--font-size-sm);
  }

  .param-select,
  .param-input {
    width: 80px;
    font-size: var(--font-size-md);
    height: 30px;
  }

  .hitrate-input {
    width: 150px;
    font-size: var(--font-size-md);
    height: 30px;
  }

  .prob-input {
    width: 60px;
    height: 28px;
  }

  .hit-prob-items {
    gap: 2px 6px;
  }

  .hit-prob-item span {
    width: 24px;
    font-size: var(--font-size-xs);
  }
}
</style>