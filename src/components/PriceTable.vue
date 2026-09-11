<!-- src/components/PriceTable.vue -->
<template>
  <div class="price-table-wrapper">
    <!-- 工具栏 -->
    <div class="table-controls">
      <span class="control-label">☑ 启用配置：</span>
      <button class="btn-sm btn-outline" @click="selectAll">全选</button>
      <button class="btn-sm btn-outline" @click="selectNone">全不选</button>
      <span class="control-hint">（取消勾选不参与 TTK 计算）</span>
      <span class="enabled-count">已选: {{ enabledCount }}/{{ totalCount }}</span>
      <button class="btn-sm btn-primary" @click="addConfig">➕ 新增配置</button>
    </div>

    <!-- ============ ⭐ 桌面：表格 ============ -->
    <div v-if="!isMobile" class="table-scroll">
      <table>
        <thead>
          <tr>
            <th style="min-width:55px;cursor:pointer;" @click="toggleSort('enabled')">
              启用 <span class="sort-icon">{{ getSortIcon('enabled') }}</span>
            </th>
            <th style="min-width:80px;">武器</th>
            <th style="min-width:50px;">序号</th>
            <th style="min-width:110px;">枪管</th>
            <th style="min-width:80px;">枪口</th>
            <th style="min-width:110px;">改枪码</th>
            <th style="min-width:90px;cursor:pointer;" @click="toggleSort('price')">
              整枪价格 <span class="sort-icon">{{ getSortIcon('price') }}</span>
            </th>
            <th style="min-width:150px;">命中率</th>
            <th style="min-width:120px;">子弹</th>
            <th style="min-width:110px;background:#fff3e0;cursor:pointer;" @click="toggleSort('havocCost')">
              哈弗币消耗 <span class="sort-icon">{{ getSortIcon('havocCost') }}</span>
            </th>
            <th class="sticky-action" style="min-width:120px;">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in sortedRows"
            :key="row._uniqueId || index"
            :class="{ 'new-row': row._isNewRow }"
          >
            <td class="readonly-cell enabled-cell">
              <input
                type="checkbox"
                :checked="row.enabled !== false"
                @change="onEnabledChange(row, $event)"
                class="enabled-checkbox"
              />
            </td>
            <td class="readonly-cell">{{ row.weaponName }}</td>
            <td class="readonly-cell">{{ row.configId }}</td>
            <td class="control-cell">
              <select v-model="row.barrel" @change="onCellChange(row, 'barrel', row.barrel)">
                <option v-for="opt in getBarrelOptions(row)" :key="opt" :value="opt">
                  {{ opt }}
                </option>
              </select>
            </td>
            <td class="control-cell">
              <select v-model="row.muzzle" @change="onCellChange(row, 'muzzle', row.muzzle)">
                <option v-for="opt in muzzleOptions" :key="opt" :value="opt">
                  {{ opt }}
                </option>
              </select>
            </td>
            <td class="control-cell">
              <input
                v-model="row.buildCode"
                class="cell-input"
                placeholder="输入改枪码"
                @blur="onCellChange(row, 'buildCode', row.buildCode)"
              />
            </td>
            <td class="control-cell">
              <input
                :value="getPriceDisplay(row)"
                class="cell-input"
                type="number"
                step="1"
                placeholder="价格"
                @blur="onPriceChange(row, $event)"
              />
            </td>
            <td class="control-cell">
              <input
                :value="row.hitRateRaw"
                class="cell-input hitrate-cell"
                placeholder="30:1.0,50:0.9,100:0.6"
                @blur="onHitRateChange(row, $event)"
              />
            </td>
            <td class="control-cell">
              <select
                :value="row.bulletDisplay"
                @change="onBulletChange(row, $event)"
              >
                <option v-for="opt in getBulletOptions(row)" :key="opt" :value="opt">
                  {{ opt }}
                </option>
              </select>
            </td>
            <td class="readonly-cell havoc-cell">
              <span
                v-if="row._havocCost"
                class="havoc-cost"
                :style="{ color: getHavocColor(row._havocCost.totalCost) }"
                :title="getHavocTooltip(row._havocCost)"
              >
                ¥{{ (row._havocCost.totalCost / 10000).toFixed(1) }}W
              </span>
              <span v-else class="text-muted">-</span>
            </td>
            <td class="readonly-cell sticky-action">
              <template v-if="row._isNewRow">
                <button class="btn-confirm" @click="confirmAdd(index)">✅</button>
                <button class="btn-cancel" @click="cancelAdd(index)">❌</button>
              </template>
              <template v-else>
                <button class="btn-detail" @click="openDamageDetail(row)" title="单次伤害模拟">📊 详情</button>
                <button class="btn-delete" @click="deleteRow(row)" title="删除配置">🗑️</button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ============ ⭐ 移动端：卡片 ============ -->
    <div v-else class="card-list">
      <div
        v-for="(row, index) in sortedRows"
        :key="row._uniqueId || index"
        class="card-item"
        :class="{ disabled: row.enabled === false }"
      >
        <!-- 卡片头部：武器名 + 序号 + 启用 + 哈弗币 + 操作 -->
        <div class="card-header-row">
          <span class="card-title-text">{{ row.weaponName }}</span>
          <span class="card-config-tag">{{ row.configId }}</span>

          <!-- 启用复选框 -->
          <label class="card-enabled-label">
            <input
              type="checkbox"
              :checked="row.enabled !== false"
              @change="onEnabledChange(row, $event)"
            />
          </label>

          <!-- ⭐ 哈弗币消耗（放在启用和操作之间） -->
          <span
            v-if="row._havocCost"
            class="card-havoc-cost"
            :style="{ color: getHavocColor(row._havocCost.totalCost) }"
            :title="getHavocTooltip(row._havocCost)"
          >
            ¥{{ (row._havocCost.totalCost / 10000).toFixed(1) }}W
          </span>
          <span v-else class="card-havoc-cost text-muted">-</span>

          <!-- 操作按钮 -->
          <div class="card-actions">
            <template v-if="row._isNewRow">
              <button class="btn-icon btn-confirm" @click="confirmAdd(index)" title="确认">✅</button>
              <button class="btn-icon btn-cancel" @click="cancelAdd(index)" title="取消">❌</button>
            </template>
            <template v-else>
              <button class="btn-icon btn-detail" @click="openDamageDetail(row)" title="详情">📊</button>
              <button class="btn-icon btn-delete" @click="deleteRow(row)" title="删除">🗑️</button>
            </template>
          </div>
        </div>

        <!-- 卡片主体 -->
        <div class="card-body">
          <!-- 枪管 -->
          <div class="card-field editable">
            <span class="field-label">枪管</span>
            <select
              :value="row.barrel"
              @change="onCellChange(row, 'barrel', $event.target.value)"
            >
              <option v-for="opt in getBarrelOptions(row)" :key="opt" :value="opt">
                {{ opt }}
              </option>
            </select>
          </div>

          <!-- 枪口 -->
          <div class="card-field editable">
            <span class="field-label">枪口</span>
            <select
              :value="row.muzzle"
              @change="onCellChange(row, 'muzzle', $event.target.value)"
            >
              <option v-for="opt in muzzleOptions" :key="opt" :value="opt">
                {{ opt }}
              </option>
            </select>
          </div>

          <!-- 改枪码 -->
          <div class="card-field editable">
            <span class="field-label">改枪码</span>
            <input
              type="text"
              :value="row.buildCode"
              placeholder="输入改枪码"
              @blur="onCellChange(row, 'buildCode', $event.target.value)"
            />
          </div>

          <!-- 整枪价格 -->
          <div class="card-field editable">
            <span class="field-label">整枪价格</span>
            <input
              type="number"
              :value="getPriceDisplay(row)"
              step="0.1"
              placeholder="价格"
              @blur="onPriceChange(row, $event)"
            />
            <span style="color:#888;font-size:11px;">W</span>
          </div>

          <!-- 命中率 -->
          <div class="card-field editable">
            <span class="field-label">命中率</span>
            <input
              type="text"
              class="mono"
              :value="row.hitRateRaw"
              placeholder="30:1.0,50:0.9,100:0.6"
              @blur="onHitRateChange(row, $event)"
            />
          </div>

          <!-- 子弹 -->
          <div class="card-field editable">
            <span class="field-label">子弹</span>
            <select
              :value="row.bulletDisplay"
              @change="onBulletChange(row, $event)"
            >
              <option v-for="opt in getBulletOptions(row)" :key="opt" :value="opt">
                {{ opt }}
              </option>
            </select>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { dataStore } from '@/stores/dataStore'

const props = defineProps({
  data: {
    type: Array,
    required: true
  },
  muzzleOptions: {
    type: Array,
    default: () => ['无', '死寂', '先进/轻语/勇火', '冲锋枪回声消音器']
  },
  getBarrelOptions: {
    type: Function,
    required: true
  },
  getBulletOptions: {
    type: Function,
    required: true
  },
  havocCosts: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['update', 'add-config', 'show-damage-detail'])

// ⭐ 是否为移动端（视口宽度 <= 768）
const isMobile = ref(false)
const updateIsMobile = () => {
  isMobile.value = window.innerWidth <= 768
}

onMounted(() => {
  updateIsMobile()
  window.addEventListener('resize', updateIsMobile)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateIsMobile)
})

// ---------- 调试：监听 data 变化 ----------
watch(() => props.data, (newData, oldData) => {
  if (newData && newData.length > 0) {
    const enabled = newData.filter(r => r.enabled !== false).length
    console.log('🔍 PriceTable data 变化:', oldData?.length, '->', newData?.length, '启用:', enabled)
  }
}, { deep: true, immediate: true })

// ---------- 排序 ----------
const sortKey = ref(null)
const sortOrder = ref('asc')

const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortOrder.value = 'asc'
  }
}

const getSortIcon = (key) => {
  if (sortKey.value !== key) return '⇅'
  return sortOrder.value === 'asc' ? '↑' : '↓'
}

// ---------- 计算属性 ----------
const totalCount = computed(() => props.data.length)

const enabledCount = computed(() => {
  return props.data.filter(row => row.enabled !== false).length
})

// 带 HavocCost 的数据
const dataWithCost = computed(() => {
  return props.data.map(row => {
    const weaponId = row._weaponId
    const configId = row.configId || '#1'
    const key = `${weaponId}_${configId}`
    return {
      ...row,
      _havocCost: props.havocCosts[key] || null
    }
  })
})

// 排序后的数据
const sortedRows = computed(() => {
  if (!sortKey.value) return dataWithCost.value

  return [...dataWithCost.value].sort((a, b) => {
    let valA = a[sortKey.value] ?? ''
    let valB = b[sortKey.value] ?? ''

    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortOrder.value === 'asc' ? valA - valB : valB - valA
    }

    valA = String(valA)
    valB = String(valB)
    const compare = valA.localeCompare(valB, 'zh-CN')
    return sortOrder.value === 'asc' ? compare : -compare
  })
})

// ---------- 辅助方法 ----------
const getPriceDisplay = (row) => {
  const price = row.price
  if (!price || price === 0) return ''
  return (price / 10000).toFixed(1)
}

const getHavocColor = (totalCost) => {
  const costInW = totalCost / 10000
  if (costInW > 60) return '#f44336'
  if (costInW > 30) return '#ff9800'
  return '#4caf50'
}

const getHavocTooltip = (cost) => {
  if (!cost) return ''
  const lines = [
    `═══════════════════════════════`,
    `💰 哈弗币消耗: ¥${(cost.totalCost / 10000).toFixed(1)}W`,
    `═══════════════════════════════`,
    `整枪损失: ¥${(cost.weaponLossCost / 10000).toFixed(1)}W`,
    `子弹消耗: ¥${(cost.bulletCost / 10000).toFixed(1)}W`,
    `平均致死枪数: ${cost.avgShots.toFixed(1)}发`,
    `KD放大: ${(cost.kdRatio * 5).toFixed(1)}x`,
    `子弹单价: ¥${cost.bulletPrice}`
  ]
  return lines.join('\n')
}

// ============================================================
// ⭐ 命中率字符串解析
// ============================================================
const parseHitRateString = (str) => {
  if (!str || str.trim() === '') {
    return { distance: [], hitRate: [] }
  }

  const parts = str.split(',').map(p => p.trim()).filter(Boolean)
  const distance = []
  const hitRate = []

  for (const part of parts) {
    const [distStr, rateStr] = part.split(':')
    if (distStr === undefined || rateStr === undefined) continue

    const d = parseFloat(distStr)
    const r = parseFloat(rateStr)

    if (isNaN(d) || d < 0) continue
    if (isNaN(r) || r < 0 || r > 1) continue

    distance.push(d)
    hitRate.push(r)
  }

  const pairs = distance.map((d, i) => ({ d, r: hitRate[i] }))
  pairs.sort((a, b) => a.d - b.d)

  return {
    distance: pairs.map(p => p.d),
    hitRate: pairs.map(p => p.r)
  }
}

// ---------- 事件处理 ----------
const onCellChange = (row, key, value) => {
  const dm = dataStore.getDataManager()
  dm.updatePriceConfig(row._weaponId, row.configId, { [key]: value })
  dataStore.refreshPrices()
  emit('update')
}

const onHitRateChange = (row, event) => {
  const str = event.target.value
  const parsed = parseHitRateString(str)

  const dm = dataStore.getDataManager()
  dm.updatePriceConfig(row._weaponId, row.configId, {
    distance: parsed.distance,
    hitRate: parsed.hitRate
  })
  dataStore.refreshPrices()
  emit('update')
}

const onBulletChange = (row, event) => {
  const display = event.target.value
  const dm = dataStore.getDataManager()

  if (display === '无' || display === '-' || !display) {
    dm.updatePriceConfig(row._weaponId, row.configId, { bullet: '' })
  } else {
    const bulletId = dm.findBulletIdByDisplay(display)
    if (!bulletId) {
      console.warn('⚠️ 未找到子弹:', display)
      return
    }
    dm.updatePriceConfig(row._weaponId, row.configId, { bullet: bulletId })
  }

  dataStore.refreshPrices()
  emit('update')
}

const onPriceChange = (row, event) => {
  const value = parseFloat(event.target.value)
  if (!isNaN(value) && value >= 0) {
    const dm = dataStore.getDataManager()
    dm.updatePriceConfig(row._weaponId, row.configId, { price: value * 10000 })
    dataStore.refreshPrices()
    emit('update')
  }
}

const onEnabledChange = (row, event) => {
  const checked = event.target.checked
  const dm = dataStore.getDataManager()
  row.enabled = checked
  dm.updatePriceConfig(row._weaponId, row.configId, { enabled: checked })
  dataStore.refreshPrices()
  emit('update')
}

const selectAll = () => {
  const dm = dataStore.getDataManager()
  props.data.forEach((row) => {
    if (row._weaponId && row.configId) {
      row.enabled = true
      dm.updatePriceConfig(row._weaponId, row.configId, { enabled: true })
    }
  })
  dataStore.refreshPrices()
  emit('update')
}

const selectNone = () => {
  const dm = dataStore.getDataManager()
  props.data.forEach((row) => {
    if (row._weaponId && row.configId) {
      row.enabled = false
      dm.updatePriceConfig(row._weaponId, row.configId, { enabled: false })
    }
  })
  dataStore.refreshPrices()
  emit('update')
}

const addConfig = () => {
  emit('add-config')
}

const openDamageDetail = (row) => {
  emit('show-damage-detail', {
    weaponId: row._weaponId,
    configId: row.configId || '#1'
  })
}

const deleteRow = (row) => {
  if (!confirm(`确定要删除 ${row.weaponName} 的配置吗？`)) return

  const dm = dataStore.getDataManager()
  dm.removePriceConfig(row._weaponId, row.configId)
  dataStore.refreshPrices()
  emit('update')
}

const confirmAdd = (index) => {
  const row = sortedRows.value[index]
  emit('add-config', index, row)
}

const cancelAdd = (index) => {
  const row = sortedRows.value[index]
  const dm = dataStore.getDataManager()
  if (row._weaponId && row.configId) {
    dm.removePriceConfig(row._weaponId, row.configId)
  }
  dataStore.refreshPrices()
  emit('update')
}
</script>

<style scoped>
.price-table-wrapper {
  width: 100%;
}

/* ============ 工具栏 ============ */
.table-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #f8f9fa;
  border-radius: var(--radius-md);
  margin-bottom: 6px;
  flex-wrap: wrap;
  border: 1px solid var(--color-border-light);
}

.control-label {
  font-family: var(--font-family);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
}

.control-hint {
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.enabled-count {
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  color: #666;
  margin-left: auto;
  background: var(--color-secondary);
  padding: 0 8px;
  border-radius: 10px;
  font-weight: var(--font-weight-medium);
}

/* ============ 表格 ============ */
.table-scroll {
  overflow: auto;
  max-height: 500px;
  border: 1px solid #eee;
  border-radius: var(--radius-md);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  min-width: 700px;
}

thead th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #f7f8fa;
  padding: 6px 6px;
  border: 1px solid #e0e0e0;
  text-align: center;
  white-space: nowrap;
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-sm);
  height: 34px;
}

tbody td {
  padding: 0;
  border: 1px solid var(--color-border-light);
  text-align: center;
  vertical-align: middle;
  font-size: var(--font-size-sm);
  height: 32px;
  overflow: hidden;
}

tbody tr:hover {
  background: var(--color-bg-hover);
}

tbody tr.new-row td {
  background: #fff8e1;
  border-top: 2px solid var(--color-warning);
}

.readonly-cell {
  padding: 4px 6px;
}

.control-cell {
  padding: 0;
  position: relative;
}

/* ============ ⭐ 冻结「操作」列 ============ */
.sticky-action {
  position: sticky;
  right: 0;
  z-index: 5;
  background: #fff;
  box-shadow: -2px 0 4px rgba(0, 0, 0, 0.06);
}

thead th.sticky-action {
  z-index: 15;
  background: #f7f8fa;
}

tbody tr:hover .sticky-action {
  background: var(--color-bg-hover);
}

tbody tr.new-row .sticky-action {
  background: #fff8e1;
}

/* ============ 输入框（填满单元格） ============ */
.cell-input,
.control-cell input,
.control-cell select {
  width: 100%;
  height: 100%;
  min-height: 30px;
  padding: 4px 8px;
  border: none;
  border-radius: 0;
  background: transparent;
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  color: inherit;
  box-sizing: border-box;
  outline: none;
  text-align: center;
  transition: background 0.15s, box-shadow 0.15s;
}

.cell-input:focus,
.control-cell input:focus,
.control-cell select:focus {
  background: var(--color-bg-white);
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.cell-input:hover:not(:focus),
.control-cell input:hover:not(:focus),
.control-cell select:hover:not(:focus) {
  background: rgba(74, 108, 247, 0.06);
}

/* ============ 下拉框 ============ */
.control-cell select {
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%23999' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
  padding-right: 20px;
  cursor: pointer;
}

/* ============ 特殊列 ============ */
.hitrate-cell {
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
}

.havoc-cell {
  background: #fffbf5;
}

.havoc-cost {
  font-family: var(--font-mono);
  font-weight: var(--font-weight-semibold);
  cursor: help;
  padding: 0 4px;
  border-radius: 2px;
  border-bottom: 1px dashed #ccc;
}

.havoc-cost:hover {
  background: #fff3e0;
}

.enabled-cell {
  text-align: center;
}

.enabled-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--color-primary);
}

.sort-icon {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  margin-left: 2px;
}

.btn-detail {
  height: var(--btn-height-sm);
  padding: 2px 8px;
  border: none;
  border-radius: var(--btn-radius-sm);
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  white-space: nowrap;
  background: var(--color-primary);
  color: #fff;
  margin-right: 3px;
}

.btn-detail:hover {
  background: var(--color-primary-hover);
}

.btn-detail:active {
  transform: translateY(1px);
}

.text-muted {
  color: var(--color-text-muted);
}

/* ⭐ 卡片模式下，让卡片内的等宽输入框生效 */
.card-field.editable input.mono {
  font-family: var(--font-mono);
  font-size: 12px;
}

/* ============ ⭐ 卡片头部的哈弗币消耗 ============ */
.card-havoc-cost {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
  padding: 0 4px;
  white-space: nowrap;
  cursor: help;
}

/* ============ 移动端适配（表格模式下的微调） ============ */
@media (max-width: 768px) {
  .table-controls {
    gap: 4px;
    padding: 4px 8px;
  }
  
  .control-hint {
    width: 100%;
    margin-left: 0;
  }
  
  .enabled-count {
    margin-left: 0;
  }
  
  .tab-btn {
    padding: 4px 10px;
    font-size: var(--font-size-md);
  }
}
</style>