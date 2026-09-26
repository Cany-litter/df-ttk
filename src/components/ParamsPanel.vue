<!-- src/components/ParamsPanel.vue -->
<template>
  <div class="params-panel">
    <!-- ============================================================ -->
    <!-- 主体：左 60%（参数） + 右 40%（装备双模式） -->
    <!-- ============================================================ -->
    <div class="params-body">

      <!-- ============ 左栏：参数（2 行） ============ -->
      <div class="params-left">

        <!-- ---------- 第 1 行 ---------- -->
        <div class="left-row">
          <div class="param-group">
            <label>子弹等级</label>
            <select v-model="localParams.bulletLevel" @change="syncParams" class="param-select">
              <option v-for="n in 5" :key="n" :value="n">{{ n }}</option>
            </select>
          </div>

          <div class="param-group">
            <label>生命值</label>
            <input type="number" v-model.number="localParams.healthValue" @change="syncParams" class="param-input" />
          </div>

          <div class="param-group">
            <label>距离 (m)</label>
            <input type="number" v-model.number="localParams.distance" @change="syncParams" class="param-input" />
          </div>

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

          <div class="param-group economic">
            <label>开镜权重</label>
            <input type="number" v-model.number="aimWeightPercent" @change="syncAimWeight" step="5" min="0" class="param-input" />
            <span class="unit">%</span>
          </div>
        </div>

        <!-- ---------- 第 2 行 ---------- -->
        <div class="left-row">
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

          <div class="param-group checkbox-group">
            <label>
              <input type="checkbox" v-model="localParams.triggerDelayEnable" @change="syncParams" />
              扳机延迟
            </label>
          </div>
        </div>

      </div>

      <!-- ============ 右栏：装备（双模式） ============ -->
      <div class="equip-group">

        <!-- ⭐ 头部一行：模式切换 + 选择按钮 -->
        <div class="equip-header">
          <span class="equip-header-label">模式:</span>

          <button
            class="mode-btn"
            :class="{ active: currentMode === 'calc' }"
            @click="setMode('calc')"
          >
            ○ 计算装备
          </button>

          <button
            class="mode-btn"
            :class="{ active: currentMode === 'score' }"
            @click="setMode('score')"
          >
            ● 评分参考
          </button>

          <span class="mode-hint">{{ modeHint }}</span>

          <!-- 选择装备按钮（右对齐） -->
          <button
            class="equip-select-btn"
            :title="'打开装备矩阵'"
            @click="openMatrix"
          >
            ⚙️ 选择装备 ({{ equipCount }})
          </button>
        </div>

        <!-- ⭐ 内容区：只展示标签，无删除按钮 -->
        <div class="equip-content">
          <div class="equip-tags" :title="equipTooltip">
            <template v-if="visibleEquips.length === 0">
              <span class="equip-empty">未选装备</span>
            </template>
            <template v-else>
              <span
                v-for="eq in visibleEquips"
                :key="eq.armorId + '|' + eq.helmetId"
                class="equip-tag"
                :title="getEquipTooltip(eq)"
              >
                {{ eq.armorLevel }}甲{{ eq.armorValue }}+{{ eq.helmetLevel }}头{{ eq.helmetValue }}
              </span>

              <span
                v-if="hiddenCount > 0"
                class="equip-more"
                :title="hiddenEquipsTooltip"
              >
                +{{ hiddenCount }}组
              </span>
            </template>
          </div>
        </div>

      </div>

    </div>

    <!-- ============================================================ -->
    <!-- 底部：操作按钮 -->
    <!-- ============================================================ -->
    <div class="params-row buttons-row">
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

      <button
        class="btn-secondary"
        @click="onExportData"
        :disabled="isAnyUpdating || isGlobalCalculating"
        style="background:#9c27b0;color:#fff;"
      >
        📤 导出数据
      </button>

      <button
        class="btn-secondary"
        @click="onImportData"
        :disabled="isAnyUpdating || isGlobalCalculating"
        style="background:#607d8b;color:#fff;"
      >
        📥 导入数据
      </button>

      <button
        class="btn-secondary"
        @click="onResetData"
        :disabled="isAnyUpdating || isGlobalCalculating"
        style="background:#ff9800;color:#fff;"
      >
        🔄 重置数据
      </button>
    </div>

    <!-- ============================================================ -->
    <!-- 装备矩阵弹窗 -->
    <!-- ============================================================ -->
    <EquipMatrixModal
      v-model:visible="showEquipMatrix"
      :mode="currentMode"
      @confirm="onMatrixConfirm"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { paramsStore, appStore, equipStore } from '@/stores/stores'
import EquipMatrixModal from '@/components/EquipMatrixModal.vue'

const emit = defineEmits([
  'calculate',
  'export-data',
  'import-data',
  'reset-data',
  'equip-changed',
])

// ============================================================
// 本地参数（可写）
//
// ⭐ v7：删掉 armorLevel / armorValue / helmetLevel / helmetValue
//   - 护甲头盔改由 equipStore.calcEquip 提供
// ============================================================
const localParams = ref({
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
  aimWeight: 0.4
})

// ============================================================
// 加载状态
// ============================================================
const isLoading = computed(() => appStore.state.isLoading)

const isGlobalCalculating = computed(() => {
  return appStore.state.isGlobalCalculating === true
})

const isAnyUpdating = computed(() => {
  return (appStore.state.updatingWeaponIds || []).length > 0
})

const isAnyBusy = computed(() => {
  return isAnyUpdating.value || isGlobalCalculating.value
})

// ============================================================
// ⭐ v7：装备双模式
// ============================================================

/** 弹窗可见性 */
const showEquipMatrix = ref(false)

/** 当前模式：'calc' | 'score' */
const currentMode = computed(() => equipStore.state.mode)

/** 模式提示文案 */
const modeHint = computed(() => {
  return currentMode.value === 'calc' ? '用于 TTK' : '用于综合评分'
})

/** 当前模式下要展示的装备列表 */
const currentEquips = computed(() => {
  if (currentMode.value === 'calc') {
    const eq = equipStore.state.calcEquip
    return eq ? [eq] : []
  }
  return equipStore.state.scoreEquips || []
})

/** 装备数量（用于按钮显示） */
const equipCount = computed(() => currentEquips.value.length)

/** 可见标签（单套最多 1 个，多套最多 8 个） */
const MAX_VISIBLE_TAGS_CALC = 1
const MAX_VISIBLE_TAGS_SCORE = 8

const maxVisible = computed(() => {
  return currentMode.value === 'calc' ? MAX_VISIBLE_TAGS_CALC : MAX_VISIBLE_TAGS_SCORE
})

const visibleEquips = computed(() => {
  return currentEquips.value.slice(0, maxVisible.value)
})

/** 折叠数量 */
const hiddenCount = computed(() => {
  const total = currentEquips.value.length
  return total > maxVisible.value ? total - maxVisible.value : 0
})

/** 单个装备的 tooltip */
const getEquipTooltip = (eq) => {
  return `${eq.armorName} Lv.${eq.armorLevel}（${eq.armorValue}） + ${eq.helmetName} Lv.${eq.helmetLevel}（${eq.helmetValue}）`
}

/** 整块标签区的 tooltip */
const equipTooltip = computed(() => {
  const list = currentEquips.value
  if (list.length === 0) return '未选择任何装备'
  return list.map(eq => getEquipTooltip(eq)).join('\n')
})

/** 折叠部分的 tooltip */
const hiddenEquipsTooltip = computed(() => {
  const list = currentEquips.value.slice(maxVisible.value)
  if (list.length === 0) return ''
  return list.map(eq => getEquipTooltip(eq)).join('\n')
})

/** 切换模式 */
const setMode = (mode) => {
  if (mode !== 'calc' && mode !== 'score') return
  equipStore.setMode(mode)
}

/** 打开矩阵弹窗 */
const openMatrix = () => {
  showEquipMatrix.value = true
}

/** 矩阵确认 */
const onMatrixConfirm = (equips) => {
  if (!Array.isArray(equips) || equips.length === 0) return

  // ⭐ 按当前模式写入
  if (currentMode.value === 'calc') {
    equipStore.setCalcEquip(equips[0])
  } else {
    equipStore.setScoreEquips(equips)
  }

  emit('equip-changed', {
    mode: currentMode.value,
    equips,
  })
}

// ============================================================
// 撤离率 / 开镜权重
// ============================================================
const extractRatePercent = computed({
  get: () => Math.round(localParams.value.extractRate * 100),
  set: (val) => {
    localParams.value.extractRate = Math.max(0, Math.min(1, val / 100))
  }
})

const aimWeightPercent = computed({
  get: () => Math.round((localParams.value.aimWeight ?? 0.4) * 100),
  set: (val) => {
    const p = Math.max(0, Math.min(100, Number(val) || 0))
    localParams.value.aimWeight = p / 100
  }
})

// ============================================================
// 命中率原始输入
// ============================================================
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

// ============================================================
// 同步参数到 store
// ============================================================
const syncParams = () => {
  paramsStore.updateAll(localParams.value)
}

const syncExtractRate = () => {
  syncParams()
}

const syncAimWeight = () => {
  syncParams()
}

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

watch(() => paramsStore.state, (newState) => {
  const current = localParams.value
  if (JSON.stringify(current) !== JSON.stringify(newState)) {
    localParams.value = { ...newState }
    initHitRateRaw()
  }
}, { deep: true })

// ============================================================
// 按钮 title
// ============================================================
const getCalcButtonTitle = () => {
  if (isGlobalCalculating.value) return '全局计算中...'
  if (isAnyUpdating.value) return '正在更新单枪数据，请稍候'
  return '计算所有启用配置的 TTK（同时生成折线图数据）'
}

// ============================================================
// 事件触发
// ============================================================
const onCalculate = () => {
  if (isAnyBusy.value) return
  syncParams()
  emit('calculate')
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
/* ============================================================
   参数面板容器
   ============================================================ */
.params-panel {
  background: var(--color-bg-white);
  border-radius: var(--radius-lg);
  padding: 8px 14px;
  box-shadow: var(--shadow-sm);
  margin-bottom: var(--spacing-md);
}

/* ============================================================
   主体：左 60% + 右 40%
   ============================================================ */
.params-body {
  display: grid;
  grid-template-columns: 60% 40%;
  gap: 12px 16px;
  align-items: stretch;
  padding: 2px 0;
}

/* ---------- 左栏：参数 ---------- */
.params-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  justify-content: center;
}

.left-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  min-height: 28px;
}

/* ============================================================
   参数组 / 输入框
   ============================================================ */
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
  width: 90px;
}

.hitrate-input {
  width: 200px;
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
  width: 70px;
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

.param-group.economic {
  border-left: 2px solid var(--color-warning);
  padding-left: 8px;
  margin-left: 2px;
}

.param-group.economic label {
  color: #e65100;
  font-weight: var(--font-weight-semibold);
}

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

.unit {
  font-family: var(--font-family);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  margin-left: -2px;
}

/* ============================================================
   ⭐ v7：右栏装备（双模式）
   ============================================================ */
.equip-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px;
  border-left: 2px solid var(--color-primary);
  background: #f8faff;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  min-width: 0;
  min-height: 90px;
}

/* ---------- 头部一行：模式切换 + 选择按钮 ---------- */
.equip-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding-bottom: 6px;
  border-bottom: 1px dashed #d0ddff;
}

.equip-header-label {
  font-family: var(--font-family);
  font-size: 11px;
  color: #888;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 模式按钮 */
.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 24px;
  padding: 0 10px;
  border: 1px solid #d0d0d0;
  background: #fff;
  border-radius: 4px;
  font-family: var(--font-family);
  font-size: 12px;
  font-weight: 500;
  color: #666;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
  user-select: none;
}

.mode-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.mode-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.mode-btn.active:hover {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
  color: #fff;
}

.mode-hint {
  font-family: var(--font-family);
  font-size: 10px;
  color: #999;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 选择装备按钮（右对齐） */
.equip-select-btn {
  margin-left: auto;
  height: 24px;
  padding: 0 12px;
  border: 1px solid var(--color-primary);
  border-radius: 4px;
  background: #fff;
  color: var(--color-primary);
  font-family: var(--font-family);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.equip-select-btn:hover {
  background: var(--color-primary);
  color: #fff;
}

.equip-select-btn:active {
  transform: translateY(1px);
}

/* ---------- 内容区：只展示标签 ---------- */
.equip-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-height: 0;
}

.equip-tags {
  display: flex;
  align-items: flex-start;
  align-content: flex-start;
  gap: 4px;
  flex-wrap: wrap;
  padding: 2px 0;
  min-height: 26px;
  cursor: help;
}

.equip-empty {
  font-size: 12px;
  color: #bbb;
  font-style: italic;
  padding: 4px 6px;
}

/* 单个装备标签（无删除按钮） */
.equip-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  background: var(--color-primary);
  color: #fff;
  border-radius: 11px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  height: 22px;
  user-select: none;
}

/* +N 组（折叠标记） */
.equip-more {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: #eef2ff;
  color: var(--color-primary);
  border: 1px solid #d0ddff;
  border-radius: 11px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  height: 22px;
  cursor: help;
}

/* ============================================================
   底部：操作按钮行
   ============================================================ */
.buttons-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 14px;
  padding-top: 6px;
  border-top: 1px solid #eee;
  margin-top: 8px;
}

.buttons-row button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.buttons-row button:disabled:active {
  transform: none;
}

/* ============================================================
   移动端适配
   ============================================================ */
@media (max-width: 768px) {
  .params-panel {
    padding: 6px 10px;
  }

  .params-body {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .params-left {
    gap: 4px;
    justify-content: flex-start;
  }

  .left-row {
    gap: 4px 8px;
    min-height: 0;
  }

  .param-group label {
    font-size: var(--font-size-sm);
  }

  .param-select,
  .param-input {
    width: 70px;
    font-size: var(--font-size-md);
    height: 30px;
  }

  .hitrate-input {
    width: 140px;
    font-size: var(--font-size-md);
    height: 30px;
  }

  .prob-input {
    width: 56px;
    height: 28px;
  }

  .hit-prob-items {
    gap: 2px 6px;
  }

  .hit-prob-item span {
    width: 24px;
    font-size: var(--font-size-xs);
  }

  /* 移动端：装备区整块独占一行 */
  .equip-group {
    padding: 8px 10px;
    border-left: 2px solid var(--color-primary);
    border-radius: var(--radius-sm);
    background: #f8faff;
    min-height: 0;
  }

  .equip-header {
    gap: 4px;
  }

  .mode-btn {
    padding: 0 8px;
    font-size: 11px;
    height: 26px;
  }

  .mode-hint {
    font-size: 10px;
  }

  .equip-select-btn {
    width: 100%;
    justify-content: center;
    margin-left: 0;
    margin-top: 2px;
    height: 28px;
  }

  .equip-tags {
    min-height: 0;
  }

  .equip-tag {
    font-size: 10px;
    padding: 1px 8px;
    height: 20px;
  }

  .equip-more {
    font-size: 10px;
    padding: 1px 6px;
    height: 20px;
  }
}
</style>