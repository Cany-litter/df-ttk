<!-- src/components/ArmorTable.vue -->
<template>
  <div class="armor-table-wrapper">
    <!-- 工具栏 -->
    <div class="toolbar">
      <button class="btn-sm btn-primary" @click="addRow">
        ➕ 新增{{ typeLabel }}
      </button>
      <button class="btn-sm btn-outline" @click="enableAll">✅ 全部启用</button>
      <button class="btn-sm btn-outline" @click="disableAll">❌ 全部禁用</button>
      <span class="toolbar-divider"></span>
      <span class="toolbar-hint">（点击单元格直接编辑，失焦即保存；价格单位 W）</span>
      <span class="count-badge">共 {{ data.length }} {{ typeUnit }}（启用 {{ enabledCount }}/{{ data.length }}）</span>
    </div>

    <!-- ============ ⭐ 桌面端：表格 ============ -->
    <div v-if="!isMobile" class="table-scroll">
      <table>
        <thead>
          <tr>
            <th style="min-width:50px;" title="是否启用（禁用的不参与推荐）">启用</th>
            <th style="min-width:160px;">名称</th>
            <th style="min-width:70px;">等级</th>
            <th v-if="showParts" style="min-width:90px;">防护部位</th>
            <th style="min-width:90px;">{{ valueLabel }}</th>
            <th style="min-width:110px;">价格 (W)</th>
            <th class="sticky-action" style="min-width:80px;">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in data"
            :key="row.id || row._tempId"
            :class="{ 'new-row': row._isNewRow, 'disabled-row': row.enabled === false && !row._isNewRow }"
          >
            <!-- ⭐ 启用 -->
            <td class="readonly-cell enabled-cell">
              <label
                v-if="!row._isNewRow"
                class="enabled-checkbox-wrap"
                :title="row.enabled !== false ? '点击禁用' : '点击启用'"
              >
                <input
                  type="checkbox"
                  :checked="row.enabled !== false"
                  @change="onEnabledChange(row, $event)"
                />
              </label>
              <span v-else class="enabled-placeholder">-</span>
            </td>

            <!-- 名称 -->
            <td :class="row._isNewRow ? 'new-row-cell' : 'control-cell'">
              <input
                v-if="row._isNewRow"
                v-model="row.name"
                class="new-row-input"
                placeholder="名称"
              />
              <input
                v-else
                :value="row.name"
                class="cell-input"
                @blur="onNameChange(row, $event)"
              />
            </td>

            <!-- 等级（下拉框 + 彩色背景） -->
            <td :class="row._isNewRow ? 'new-row-cell' : 'control-cell'">
              <select
                v-model.number="row.level"
                :class="['level-select', 'lv' + row.level]"
                @change="onLevelChange(row, $event)"
              >
                <option v-for="n in 6" :key="n" :value="n">Lv.{{ n }}</option>
              </select>
            </td>

            <!-- ⭐ 防护部位（仅护甲显示） -->
            <td v-if="showParts" :class="row._isNewRow ? 'new-row-cell' : 'control-cell'">
              <select
                v-model="row.parts"
                class="parts-select"
                @change="onPartsChange(row, $event)"
              >
                <option v-for="p in partsOptions" :key="p" :value="p">{{ p }}</option>
              </select>
            </td>

            <!-- 护甲值/头盔值 -->
            <td :class="row._isNewRow ? 'new-row-cell' : 'control-cell value-cell'">
              <input
                v-if="row._isNewRow"
                v-model.number="row.value"
                class="new-row-input"
                type="number"
                min="0"
                placeholder="值"
              />
              <input
                v-else
                :value="row.value"
                class="cell-input"
                type="number"
                min="0"
                @blur="onValueChange(row, $event)"
              />
            </td>

            <!-- 价格（W 单位） -->
            <td :class="row._isNewRow ? 'new-row-cell' : 'control-cell price-cell'">
              <div class="price-input-wrap">
                <input
                  v-if="row._isNewRow"
                  v-model.number="row.priceInW"
                  class="new-row-input"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="价格"
                />
                <input
                  v-else
                  :value="getPriceInW(row.price)"
                  class="cell-input"
                  type="number"
                  step="0.1"
                  min="0"
                  @blur="onPriceChange(row, $event)"
                />
                <span class="price-unit">W</span>
              </div>
            </td>

            <!-- 操作 -->
            <td class="readonly-cell sticky-action">
              <template v-if="row._isNewRow">
                <button class="btn-icon confirm" @click="confirmAdd(row)" title="确认">✅</button>
                <button class="btn-icon cancel" @click="cancelAdd(row)" title="取消">❌</button>
              </template>
              <template v-else>
                <button class="btn-icon del" @click="deleteRow(row)" title="删除">🗑️</button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ============ ⭐ 移动端：卡片 ============ -->
    <div v-else class="card-list">
      <div
        v-for="row in data"
        :key="row.id || row._tempId"
        class="card-item"
        :class="{ 'new-row': row._isNewRow, 'disabled-row': row.enabled === false && !row._isNewRow }"
      >
        <!-- 卡片头 -->
        <div class="card-header-row">
          <template v-if="row._isNewRow">
            <input
              v-model="row.name"
              class="card-title-input"
              placeholder="名称"
            />
          </template>
          <template v-else>
            <!-- ⭐ 启用勾选框 -->
            <label
              class="enabled-checkbox-wrap card-enabled"
              :title="row.enabled !== false ? '点击禁用' : '点击启用'"
            >
              <input
                type="checkbox"
                :checked="row.enabled !== false"
                @change="onEnabledChange(row, $event)"
              />
            </label>
            <span class="card-title-text">{{ row.name }}</span>
          </template>

          <!-- 等级下拉（彩色） -->
          <select
            v-model.number="row.level"
            :class="['level-select', 'card-level-select', 'lv' + row.level]"
            @change="onLevelChange(row, $event)"
          >
            <option v-for="n in 6" :key="n" :value="n">Lv.{{ n }}</option>
          </select>

          <div class="card-actions">
            <template v-if="row._isNewRow">
              <button class="btn-icon confirm" @click="confirmAdd(row)" title="确认">✅</button>
              <button class="btn-icon cancel" @click="cancelAdd(row)" title="取消">❌</button>
            </template>
            <template v-else>
              <button class="btn-icon del" @click="deleteRow(row)" title="删除">🗑️</button>
            </template>
          </div>
        </div>

        <!-- 卡片体 -->
        <div class="card-body">
          <!-- ⭐ 防护部位（仅护甲） -->
          <div v-if="showParts" class="card-field editable">
            <span class="field-label">防护部位</span>
            <select
              v-model="row.parts"
              class="card-parts-select"
              @change="onPartsChange(row, $event)"
            >
              <option v-for="p in partsOptions" :key="p" :value="p">{{ p }}</option>
            </select>
          </div>

          <!-- 护甲值/头盔值 -->
          <div class="card-field editable">
            <span class="field-label">{{ valueLabel }}</span>
            <input
              v-if="row._isNewRow"
              v-model.number="row.value"
              type="number"
              min="0"
            />
            <input
              v-else
              type="number"
              min="0"
              :value="row.value"
              @blur="onValueChange(row, $event)"
            />
          </div>

          <!-- 价格（W 单位） -->
          <div class="card-field editable">
            <span class="field-label">价格</span>
            <input
              v-if="row._isNewRow"
              v-model.number="row.priceInW"
              type="number"
              step="0.1"
              min="0"
            />
            <input
              v-else
              type="number"
              step="0.1"
              min="0"
              :value="getPriceInW(row.price)"
              @blur="onPriceChange(row, $event)"
            />
            <span class="price-unit">W</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, inject } from 'vue'
import { dataStore } from '@/stores/stores'

const props = defineProps({
  data: {
    type: Array,
    required: true
  },
  type: {
    type: String,
    required: true,
    validator: (v) => ['armor', 'helmet'].includes(v)
  }
})

const emit = defineEmits(['update'])

// ⭐ 注入通用弹窗
const showConfirm = inject('showConfirm', null)
const showAlert = inject('showAlert', null)

// ---------- 计算属性 ----------
const typeLabel = computed(() => props.type === 'armor' ? '护甲' : '头盔')
const valueLabel = computed(() => props.type === 'armor' ? '护甲值' : '头盔值')
const typeUnit = computed(() => props.type === 'armor' ? '件护甲' : '顶头盔')

const showParts = computed(() => props.type === 'armor')

const partsOptions = ['胸部', '胸腹', '胸腹肩']

// ⭐ 启用数量统计
const enabledCount = computed(() => {
  return props.data.filter(r => r.enabled !== false).length
})

// ---------- 移动端判断 ----------
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

// ---------- 新增行状态 ----------
const isAdding = ref(false)

// ============================================================
// 价格单位换算（W）
// ============================================================
const getPriceInW = (price) => {
  if (price === undefined || price === null || price < 0) return ''
  return (price / 10000).toFixed(1)
}

// ============================================================
// ⭐ 启用/禁用切换
// ============================================================

const onEnabledChange = (row, event) => {
  if (row._isNewRow) return

  const newEnabled = event.target.checked
  const ok = dataStore.updateArmor(row.id, { enabled: newEnabled })
  if (ok) {
    dataStore.refreshArmors()
    emit('update')
    console.log(`${newEnabled ? '✅ 启用' : '❌ 禁用'} ${typeLabel.value}: ${row.id}`)
  } else {
    // 失败时回滚 checkbox
    event.target.checked = !newEnabled
  }
}

// ⭐ 全部启用
const enableAll = () => {
  const dm = dataStore.getDataManager()
  const count = dm.setArmorsEnabledByType(props.type, true)
  if (count > 0) {
    dataStore.refreshArmors()
    emit('update')
    console.log(`✅ 已启用 ${count} ${typeUnit.value}`)
  } else {
    console.log(`ℹ️ 所有${typeLabel.value}已启用`)
  }
}

// ⭐ 全部禁用
const disableAll = async () => {
  let confirmed = true
  if (showConfirm) {
    const result = await showConfirm({
      title: `禁用全部${typeLabel.value}`,
      message: `确定要禁用全部${typeLabel.value}吗？禁用后推荐功能将无法使用这些${typeLabel.value}。`,
      confirmText: '禁用',
      confirmType: 'warning'
    })
    confirmed = result.confirmed
  } else {
    confirmed = confirm(`确定要禁用全部${typeLabel.value}吗？`)
  }

  if (!confirmed) return

  const dm = dataStore.getDataManager()
  const count = dm.setArmorsEnabledByType(props.type, false)
  if (count > 0) {
    dataStore.refreshArmors()
    emit('update')
    console.log(`❌ 已禁用 ${count} ${typeUnit.value}`)
  } else {
    console.log(`ℹ️ 所有${typeLabel.value}已禁用`)
  }
}

// ============================================================
// 事件处理
// ============================================================

const onNameChange = (row, event) => {
  const value = event.target.value.trim()
  if (!value) {
    event.target.value = row.name
    return
  }
  if (value === row.name) return

  const ok = dataStore.updateArmor(row.id, { name: value })
  if (ok) {
    dataStore.refreshArmors()
    emit('update')
  }
}

const onLevelChange = (row, event) => {
  const value = parseInt(event.target.value, 10)
  if (isNaN(value) || value < 1 || value > 6) {
    event.target.value = row.level
    return
  }
  if (value === row.level) return

  if (row._isNewRow) {
    row.level = value
    return
  }

  const ok = dataStore.updateArmor(row.id, { level: value })
  if (ok) {
    dataStore.refreshArmors()
    emit('update')
  }
}

const onPartsChange = (row, event) => {
  const value = event.target.value
  if (!partsOptions.includes(value)) return
  if (value === row.parts) return

  if (row._isNewRow) {
    row.parts = value
    return
  }

  const ok = dataStore.updateArmor(row.id, { parts: value })
  if (ok) {
    dataStore.refreshArmors()
    emit('update')
  }
}

const onValueChange = (row, event) => {
  const value = parseFloat(event.target.value)
  if (isNaN(value) || value < 0) {
    event.target.value = row.value
    return
  }
  if (value === row.value) return

  const ok = dataStore.updateArmor(row.id, { value })
  if (ok) {
    dataStore.refreshArmors()
    emit('update')
  }
}

const onPriceChange = (row, event) => {
  const valueInW = parseFloat(event.target.value)
  if (isNaN(valueInW) || valueInW < 0) {
    event.target.value = getPriceInW(row.price)
    return
  }
  const value = Math.round(valueInW * 10000)
  if (value === row.price) return

  const ok = dataStore.updateArmor(row.id, { price: value })
  if (ok) {
    dataStore.refreshArmors()
    emit('update')
  }
}

// ============================================================
// 新增（改用弹窗）
// ============================================================

const addRow = async () => {
  if (isAdding.value) {
    const msg = '请先完成当前新增'
    if (showAlert) {
      await showAlert(msg)
    } else {
      alert(msg)
    }
    return
  }

  const tempId = `_new_${Date.now()}`

  const dm = dataStore.getDataManager()
  const tempArmor = {
    id: tempId,
    type: props.type,
    name: '',
    level: 1,
    value: 0,
    priceInW: 0,
    enabled: true,
    _isNewRow: true
  }

  if (props.type === 'armor') {
    tempArmor.parts = '胸腹'
  }

  if (!Array.isArray(dm.data.armors)) {
    dm.data.armors = []
  }
  dm.data.armors.unshift(tempArmor)
  dataStore.refreshArmors()
  isAdding.value = true
}

const confirmAdd = async (row) => {
  if (!row.name || row.name.trim() === '') {
    const msg = `⚠️ 请输入${typeLabel.value}名称`
    if (showAlert) {
      await showAlert(msg)
    } else {
      alert(msg)
    }
    return
  }

  const dm = dataStore.getDataManager()
  const newId = `${props.type}_${row.level}_${Date.now()}`

  const idx = dm.data.armors.findIndex(a => a.id === row.id)
  if (idx === -1) return

  const newArmor = {
    id: newId,
    type: props.type,
    name: row.name.trim(),
    level: row.level,
    value: row.value || 0,
    price: Math.round((row.priceInW || 0) * 10000),
    enabled: true
  }

  if (props.type === 'armor') {
    newArmor.parts = row.parts || '胸腹'
  }

  dm.data.armors.splice(idx, 1, newArmor)
  dataStore.refreshArmors()
  isAdding.value = false
  emit('update')

  console.log(`✅ 已新增${typeLabel.value}: ${newArmor.name} (${newArmor.id}), 价格 ¥${newArmor.price}`)
}

const cancelAdd = (row) => {
  const dm = dataStore.getDataManager()
  const idx = dm.data.armors.findIndex(a => a.id === row.id)
  if (idx !== -1) {
    dm.data.armors.splice(idx, 1)
  }
  dataStore.refreshArmors()
  isAdding.value = false
}

// ============================================================
// ⭐ 删除（改用弹窗）
// ============================================================
const deleteRow = async (row) => {
  let confirmed = true
  if (showConfirm) {
    const result = await showConfirm({
      title: `删除${typeLabel.value}`,
      message: `确定删除「${row.name}」？`,
      confirmText: '删除',
      confirmType: 'danger'
    })
    confirmed = result.confirmed
  } else {
    confirmed = confirm(`确定删除「${row.name}」？`)
  }

  if (!confirmed) return

  const ok = dataStore.removeArmor(row.id)
  if (ok) {
    dataStore.refreshArmors()
    emit('update')
    console.log(`🗑️ 已删除: ${row.name}`)
  }
}
</script>

<style scoped>
.armor-table-wrapper {
  width: 100%;
}

/* ============ 工具栏 ============ */
.toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #f8f9fa;
  border-radius: var(--radius-md, 4px);
  margin-bottom: 8px;
  flex-wrap: wrap;
  border: 1px solid var(--color-border-light, #e8e8e8);
}

.btn-sm {
  height: 24px;
  padding: 2px 10px;
  border: none;
  border-radius: 3px;
  font-family: var(--font-family);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  white-space: nowrap;
  user-select: none;
}

.btn-sm.btn-primary {
  background: var(--color-primary, #4a6cf7);
  color: #fff;
}
.btn-sm.btn-primary:hover {
  background: var(--color-primary-hover, #3a5cd7);
}

.btn-sm.btn-outline {
  background: var(--color-bg-white);
  border: 1px solid var(--color-border);
  color: #333;
}
.btn-sm.btn-outline:hover {
  background: #f0f4ff;
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.toolbar-hint {
  font-size: 11px;
  color: var(--color-text-muted, #999);
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: #dde3ee;
  margin: 0 2px;
  flex-shrink: 0;
}

.count-badge {
  font-size: 11px;
  color: #666;
  margin-left: auto;
  background: #eef2f7;
  padding: 0 8px;
  border-radius: 10px;
  font-weight: 500;
  height: 20px;
  display: inline-flex;
  align-items: center;
}

/* ============ 表格 ============ */
.table-scroll {
  overflow: auto;
  max-height: 560px;
  border: 1px solid #eee;
  border-radius: 6px;
}
.table-scroll::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.table-scroll::-webkit-scrollbar-thumb {
  background: #ddd;
  border-radius: 3px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  min-width: 650px;
}

thead th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #f0f4f8;
  padding: 6px 6px;
  border: 1px solid #e0e0e0;
  text-align: center;
  white-space: nowrap;
  font-weight: 600;
  font-size: 11px;
  height: 32px;
}

tbody td {
  padding: 0;
  border: 1px solid var(--color-border-light, #e8e8e8);
  text-align: center;
  vertical-align: middle;
  font-size: 11px;
  height: 30px;
}

tbody tr:hover {
  background: #f8faff;
}

tbody tr.new-row td {
  background: #fff8e1;
  border-top: 2px solid var(--color-warning, #ff9800);
}

/* ⭐ 禁用行（灰色） */
tbody tr.disabled-row {
  background: #f5f5f5;
}

tbody tr.disabled-row td {
  color: #bbb;
}

tbody tr.disabled-row:hover {
  background: #f0f0f0;
}

.sticky-action {
  position: sticky;
  right: 0;
  z-index: 5;
  background: #fff;
  box-shadow: -2px 0 4px rgba(0, 0, 0, 0.06);
}
thead th.sticky-action {
  z-index: 15;
  background: #f0f4f8;
}
tbody tr:hover .sticky-action {
  background: #f8faff;
}
tbody tr.new-row .sticky-action {
  background: #fff8e1;
}
tbody tr.disabled-row .sticky-action {
  background: #f5f5f5;
}

.readonly-cell {
  padding: 3px 6px;
}
.control-cell {
  padding: 0;
  position: relative;
}

/* 单元格输入框 */
.cell-input {
  width: 100%;
  height: 100%;
  min-height: 28px;
  padding: 3px 6px;
  border: none;
  border-radius: 0;
  background: transparent;
  font-family: var(--font-family);
  font-size: 11px;
  color: inherit;
  box-sizing: border-box;
  outline: none;
  text-align: center;
  transition: background 0.15s;
}
.cell-input:focus {
  background: #fff;
  box-shadow: inset 0 0 0 2px var(--color-primary, #4a6cf7);
}
.cell-input:hover:not(:focus) {
  background: rgba(74, 108, 247, 0.06);
}

/* 新增行输入框 */
.new-row-cell {
  padding: 2px 3px;
}
.new-row-input,
.new-row-select {
  width: 100%;
  padding: 3px 6px;
  border: 1px solid var(--color-border, #d0d0d0);
  border-radius: 3px;
  font-family: var(--font-family);
  font-size: 11px;
  background: #fff;
  box-sizing: border-box;
  height: 26px;
  color: var(--color-text, #1a1a2e);
  outline: none;
}
.new-row-input:focus,
.new-row-select:focus {
  border-color: var(--color-primary, #4a6cf7);
}

/* ⭐ 价格单元格（输入框 + W 单位） */
.price-input-wrap {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0 4px 0 0;
}
.price-input-wrap .cell-input,
.price-input-wrap .new-row-input {
  flex: 1;
  min-width: 0;
}
.price-unit {
  font-size: 10px;
  color: #999;
  flex-shrink: 0;
  padding-left: 2px;
}

/* ============================================================
   ⭐ 启用列
   ============================================================ */
.enabled-cell {
  padding: 0;
}

.enabled-checkbox-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 28px;
  cursor: pointer;
  user-select: none;
}

.enabled-checkbox-wrap input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--color-success);
  margin: 0;
}

.enabled-placeholder {
  color: #ccc;
  font-size: 12px;
}

/* ============================================================
   等级下拉框（彩色背景）
   ============================================================ */
.level-select {
  width: 100%;
  height: 100%;
  min-height: 28px;
  padding: 3px 18px 3px 6px;
  border: none;
  border-radius: 0;
  background: transparent;
  font-family: var(--font-family);
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text, #1a1a2e);
  box-sizing: border-box;
  outline: none;
  text-align: center;
  text-align-last: center;
  cursor: pointer;
  transition: background 0.15s;
  -webkit-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%23333' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 4px center;
}
.level-select:focus {
  box-shadow: inset 0 0 0 2px var(--color-primary, #4a6cf7);
}

.level-select.lv1 {
  background-color: #ffffff;
  color: #333;
  border: 1px solid #e0e0e0;
}
.level-select.lv2 {
  background-color: #e8f5e9;
  color: #2e7d32;
}
.level-select.lv3 {
  background-color: #e3f2fd;
  color: #1565c0;
}
.level-select.lv4 {
  background-color: #ede7f6;
  color: #5e35b1;
}
.level-select.lv5 {
  background-color: #fff8e1;
  color: #e65100;
}
.level-select.lv6 {
  background-color: #ffebee;
  color: #c62828;
}

.level-select.lv1:hover:not(:focus) { background-color: #f8f8f8; }
.level-select.lv2:hover:not(:focus) { background-color: #d4ead6; }
.level-select.lv3:hover:not(:focus) { background-color: #c9e4fc; }
.level-select.lv4:hover:not(:focus) { background-color: #ddd0f0; }
.level-select.lv5:hover:not(:focus) { background-color: #ffefc4; }
.level-select.lv6:hover:not(:focus) { background-color: #ffd6da; }

/* ============================================================
   ⭐ 防护部位下拉框
   ============================================================ */
.parts-select {
  width: 100%;
  height: 100%;
  min-height: 28px;
  padding: 3px 18px 3px 6px;
  border: none;
  border-radius: 0;
  background: transparent;
  font-family: var(--font-family);
  font-size: 11px;
  color: var(--color-text, #1a1a2e);
  box-sizing: border-box;
  outline: none;
  text-align: center;
  text-align-last: center;
  cursor: pointer;
  transition: background 0.15s;
  -webkit-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%23999' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 4px center;
}
.parts-select:focus {
  background-color: #fff;
  box-shadow: inset 0 0 0 2px var(--color-primary, #4a6cf7);
}
.parts-select:hover:not(:focus) {
  background-color: rgba(74, 108, 247, 0.06);
}

.value-cell {
  font-weight: 600;
  color: var(--color-primary, #4a6cf7);
}
.price-cell {
  color: #e67e22;
  font-weight: 600;
}

/* 操作按钮 */
.btn-icon {
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  margin: 0 1px;
}
.btn-icon.del {
  background: #f0f0f0;
  color: #666;
}
.btn-icon.del:hover {
  background: #e0e0e0;
  color: var(--color-danger, #f44336);
}
.btn-icon.confirm {
  background: var(--color-success, #4caf50);
  color: #fff;
}
.btn-icon.confirm:hover {
  background: #388e3c;
}
.btn-icon.cancel {
  background: var(--color-danger, #f44336);
  color: #fff;
}
.btn-icon.cancel:hover {
  background: #d32f2f;
}

/* ============ 移动端卡片 ============ */
.card-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.card-item {
  background: #fff;
  border: 1px solid var(--color-border-light, #e8e8e8);
  border-radius: 6px;
  overflow: hidden;
}
.card-item.new-row {
  background: #fff8e1;
  border-color: var(--color-warning, #ff9800);
  border-width: 2px;
}

/* ⭐ 禁用卡片 */
.card-item.disabled-row {
  background: #f5f5f5;
  opacity: 0.7;
}

.card-header-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #f8faff;
  border-bottom: 1px solid var(--color-border-light, #e8e8e8);
}
.card-item.new-row .card-header-row {
  background: #fff3c4;
}

/* ⭐ 移动端启用勾选框 */
.card-enabled {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}

.card-title-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #1a1a2e);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.card-title-input {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--color-border, #d0d0d0);
  border-radius: 4px;
  font-family: var(--font-family);
  font-size: 13px;
  background: #fff;
  color: var(--color-text, #1a1a2e);
  outline: none;
}
.card-title-input:focus {
  border-color: var(--color-primary, #4a6cf7);
}

.card-level-select {
  width: auto;
  min-width: 60px;
  height: 26px;
  padding: 2px 18px 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.card-parts-select {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid var(--color-border, #d0d0d0);
  border-radius: 4px;
  font-family: var(--font-family);
  font-size: 13px;
  background: #fafafa;
  color: var(--color-text, #1a1a2e);
  outline: none;
  cursor: pointer;
}
.card-parts-select:focus {
  border-color: var(--color-primary, #4a6cf7);
  background: #fff;
}

.card-actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.card-body {
  padding: 2px 0;
}

.card-field {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px dashed #f0f0f0;
}
.card-field:last-child {
  border-bottom: none;
}

.card-field .field-label {
  font-size: 12px;
  color: #888;
  flex-shrink: 0;
  width: 68px;
}

.card-field.editable input {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid var(--color-border, #d0d0d0);
  border-radius: 4px;
  font-family: var(--font-family);
  font-size: 13px;
  background: #fafafa;
  color: var(--color-text, #1a1a2e);
  outline: none;
}
.card-field.editable input:focus {
  border-color: var(--color-primary, #4a6cf7);
  background: #fff;
}
</style>