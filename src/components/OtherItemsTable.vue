<!-- src/components/OtherItemsTable.vue -->
<template>
  <div class="other-items-wrapper">
    <!-- ============================================================ -->
    <!-- 工具栏 -->
    <!-- ============================================================ -->
    <div class="toolbar">
      <button class="btn-sm btn-primary" @click="addRow">
        ➕ 新增物品
      </button>
      <button class="btn-sm btn-outline" @click="enableAll">✅ 全部启用</button>
      <button class="btn-sm btn-outline" @click="disableAll">❌ 全部禁用</button>
      <span class="toolbar-divider"></span>
      <span class="toolbar-hint">（点击单元格直接编辑，失焦即保存；价格单位 W）</span>
      <span class="count-badge">
        共 {{ data.length }} 件（启用 {{ enabledCount }}/{{ data.length }}）
      </span>
    </div>

    <!-- ============================================================ -->
    <!-- ⭐ 桌面端：表格 -->
    <!-- ============================================================ -->
    <div v-if="!isMobile" class="table-scroll">
      <table>
        <thead>
          <tr>
            <th style="min-width:50px;" title="是否启用">启用</th>
            <th style="min-width:160px;">名称</th>
            <th style="min-width:100px;">类别</th>
            <th style="min-width:110px;">价格 (W)</th>
            <th style="min-width:260px;">说明</th>
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

            <!-- ⭐ 类别（下拉框） -->
            <td :class="row._isNewRow ? 'new-row-cell' : 'control-cell'">
              <select
                v-model="row.category"
                class="category-select"
                :class="getCategoryClass(row.category)"
                @change="onCategoryChange(row, $event)"
              >
                <option
                  v-for="cat in categoryOptions"
                  :key="cat"
                  :value="cat"
                >{{ cat }}</option>
              </select>
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

            <!-- 说明 -->
            <td :class="row._isNewRow ? 'new-row-cell' : 'control-cell'">
              <input
                v-if="row._isNewRow"
                v-model="row.description"
                class="new-row-input"
                placeholder="说明"
              />
              <input
                v-else
                :value="row.description"
                class="cell-input description-input"
                placeholder="（无说明）"
                @blur="onDescriptionChange(row, $event)"
              />
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

    <!-- ============================================================ -->
    <!-- ⭐ 移动端：卡片列表 -->
    <!-- ============================================================ -->
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

          <!-- 类别（彩色） -->
          <select
            v-model="row.category"
            class="category-select card-category-select"
            :class="getCategoryClass(row.category)"
            @change="onCategoryChange(row, $event)"
          >
            <option
              v-for="cat in categoryOptions"
              :key="cat"
              :value="cat"
            >{{ cat }}</option>
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
          <!-- 价格 -->
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

          <!-- 说明 -->
          <div class="card-field editable">
            <span class="field-label">说明</span>
            <input
              v-if="row._isNewRow"
              v-model="row.description"
              placeholder="说明"
            />
            <input
              v-else
              :value="row.description"
              placeholder="（无说明）"
              @blur="onDescriptionChange(row, $event)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- ⭐ 空状态 -->
    <!-- ============================================================ -->
    <div v-if="data.length === 0" class="empty-state">
      <div class="icon">📦</div>
      <div>还没有其他物品</div>
      <div class="hint">点击上方「➕ 新增物品」添加背包 / 胸挂 / 治疗 / 维修等</div>
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
  }
})

const emit = defineEmits(['update'])

// ⭐ 注入通用弹窗
const showConfirm = inject('showConfirm', null)
const showAlert = inject('showAlert', null)

// ============================================================
// 类别
// ============================================================

const categoryOptions = ['背包', '胸挂', '治疗', '维修', '其他']

// ============================================================
// 移动端判断
// ============================================================

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

// ============================================================
// 计算属性
// ============================================================

const enabledCount = computed(() => {
  return props.data.filter(r => r.enabled !== false).length
})

// ============================================================
// 工具
// ============================================================

const getPriceInW = (price) => {
  if (price === undefined || price === null || price < 0) return ''
  return (price / 10000).toFixed(1)
}

const getCategoryClass = (cat) => {
  switch (cat) {
    case '背包': return 'cat-bag'
    case '胸挂': return 'cat-chest'
    case '治疗': return 'cat-heal'
    case '维修': return 'cat-repair'
    default: return 'cat-other'
  }
}

// ============================================================
// 启用/禁用
// ============================================================

const onEnabledChange = (row, event) => {
  if (row._isNewRow) return

  const newEnabled = event.target.checked
  const dm = dataStore.getDataManager()
  const ok = dm.updateOtherItem(row.id, { enabled: newEnabled })
  if (ok) {
    dataStore.refreshOtherItems()
    emit('update')
    console.log(`${newEnabled ? '✅ 启用' : '❌ 禁用'} 其他物品: ${row.id}`)
  } else {
    event.target.checked = !newEnabled
  }
}

const enableAll = () => {
  const dm = dataStore.getDataManager()
  const count = dm.setOtherItemsEnabled(true)
  if (count > 0) {
    dataStore.refreshOtherItems()
    emit('update')
    console.log(`✅ 已启用 ${count} 件其他物品`)
  } else {
    console.log('ℹ️ 所有其他物品已启用')
  }
}

const disableAll = async () => {
  let confirmed = true
  if (showConfirm) {
    const result = await showConfirm({
      title: '禁用全部其他物品',
      message: '确定要禁用全部其他物品吗？',
      confirmText: '禁用',
      confirmType: 'warning'
    })
    confirmed = result.confirmed
  } else {
    confirmed = confirm('确定要禁用全部其他物品吗？')
  }

  if (!confirmed) return

  const dm = dataStore.getDataManager()
  const count = dm.setOtherItemsEnabled(false)
  if (count > 0) {
    dataStore.refreshOtherItems()
    emit('update')
    console.log(`❌ 已禁用 ${count} 件其他物品`)
  } else {
    console.log('ℹ️ 所有其他物品已禁用')
  }
}

// ============================================================
// 编辑（失焦保存）
// ============================================================

const onNameChange = (row, event) => {
  const value = event.target.value.trim()
  if (!value) {
    event.target.value = row.name
    return
  }
  if (value === row.name) return

  const dm = dataStore.getDataManager()
  const ok = dm.updateOtherItem(row.id, { name: value })
  if (ok) {
    dataStore.refreshOtherItems()
    emit('update')
  } else {
    event.target.value = row.name
  }
}

const onCategoryChange = (row, event) => {
  const value = event.target.value
  if (!categoryOptions.includes(value)) {
    event.target.value = row.category
    return
  }
  if (value === row.category) return

  if (row._isNewRow) {
    row.category = value
    return
  }

  const dm = dataStore.getDataManager()
  const ok = dm.updateOtherItem(row.id, { category: value })
  if (ok) {
    dataStore.refreshOtherItems()
    emit('update')
  } else {
    event.target.value = row.category
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

  const dm = dataStore.getDataManager()
  const ok = dm.updateOtherItem(row.id, { price: value })
  if (ok) {
    dataStore.refreshOtherItems()
    emit('update')
  } else {
    event.target.value = getPriceInW(row.price)
  }
}

const onDescriptionChange = (row, event) => {
  const value = event.target.value
  if (value === row.description) return

  const dm = dataStore.getDataManager()
  const ok = dm.updateOtherItem(row.id, { description: value })
  if (ok) {
    dataStore.refreshOtherItems()
    emit('update')
  } else {
    event.target.value = row.description
  }
}

// ============================================================
// 新增
// ============================================================

const isAdding = ref(false)

const addRow = async () => {
  if (isAdding.value) {
    const msg = '请先完成当前新增'
    if (showAlert) await showAlert(msg)
    else alert(msg)
    return
  }

  const tempId = `_new_other_${Date.now()}`

  const dm = dataStore.getDataManager()
  const tempItem = {
    id: tempId,
    name: '',
    category: '其他',
    priceInW: 0,
    description: '',
    enabled: true,
    _isNewRow: true
  }

  if (!Array.isArray(dm.data.otherItems)) {
    dm.data.otherItems = []
  }
  dm.data.otherItems.unshift(tempItem)
  dataStore.refreshOtherItems()
  isAdding.value = true
}

const confirmAdd = async (row) => {
  if (!row.name || row.name.trim() === '') {
    const msg = '⚠️ 请输入物品名称'
    if (showAlert) await showAlert(msg)
    else alert(msg)
    return
  }

  const dm = dataStore.getDataManager()
  const newItem = {
    id: dm.getNextOtherItemId(),
    name: row.name.trim(),
    category: row.category || '其他',
    price: Math.round((row.priceInW || 0) * 10000),
    description: row.description || '',
    enabled: true
  }

  // 从数据里删掉临时行，push 新行
  const idx = dm.data.otherItems.findIndex(item => item.id === row.id)
  if (idx === -1) return
  dm.data.otherItems.splice(idx, 1)

  const ok = dm.addOtherItem(newItem)
  if (ok) {
    dataStore.refreshOtherItems()
    isAdding.value = false
    emit('update')
    console.log(`✅ 已新增其他物品: ${newItem.name} (${newItem.id})`)
  } else {
    // 失败：恢复临时行
    dm.data.otherItems.splice(idx, 0, row)
    dataStore.refreshOtherItems()
    if (showAlert) await showAlert('新增失败，请检查控制台')
  }
}

const cancelAdd = (row) => {
  const dm = dataStore.getDataManager()
  const idx = dm.data.otherItems.findIndex(item => item.id === row.id)
  if (idx !== -1) {
    dm.data.otherItems.splice(idx, 1)
  }
  dataStore.refreshOtherItems()
  isAdding.value = false
}

// ============================================================
// 删除
// ============================================================

const deleteRow = async (row) => {
  let confirmed = true
  if (showConfirm) {
    const result = await showConfirm({
      title: '删除物品',
      message: `确定删除「${row.name}」？`,
      confirmText: '删除',
      confirmType: 'danger'
    })
    confirmed = result.confirmed
  } else {
    confirmed = confirm(`确定删除「${row.name}」？`)
  }

  if (!confirmed) return

  const dm = dataStore.getDataManager()
  const ok = dm.removeOtherItem(row.id)
  if (ok) {
    dataStore.refreshOtherItems()
    emit('update')
    console.log(`🗑️ 已删除: ${row.name}`)
  }
}
</script>

<style scoped>
.other-items-wrapper {
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
  min-width: 800px;
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

/* 说明列：左对齐 */
.description-input {
  text-align: left;
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

/* 价格单元格 */
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
   启用列
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
   ⭐ 类别下拉框（彩色背景）
   ============================================================ */
.category-select {
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
.category-select:focus {
  box-shadow: inset 0 0 0 2px var(--color-primary, #4a6cf7);
}

/* ⭐ 5 种类别配色 */
.category-select.cat-bag {
  background-color: #e8f5e9;
  color: #2e7d32;
}
.category-select.cat-chest {
  background-color: #e3f2fd;
  color: #1565c0;
}
.category-select.cat-heal {
  background-color: #ffebee;
  color: #c62828;
}
.category-select.cat-repair {
  background-color: #fff8e1;
  color: #e65100;
}
.category-select.cat-other {
  background-color: #f5f5f5;
  color: #666;
}

.category-select.cat-bag:hover:not(:focus) { background-color: #d4ead6; }
.category-select.cat-chest:hover:not(:focus) { background-color: #c9e4fc; }
.category-select.cat-heal:hover:not(:focus) { background-color: #ffd6da; }
.category-select.cat-repair:hover:not(:focus) { background-color: #ffefc4; }
.category-select.cat-other:hover:not(:focus) { background-color: #ebebeb; }

/* 价格列颜色 */
.price-cell {
  color: #e67e22;
  font-weight: 600;
}

/* ============================================================
   操作按钮
   ============================================================ */
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

/* ============================================================
   ⭐ 空状态
   ============================================================ */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #999;
  font-size: 13px;
  background: #fff;
  border-radius: 8px;
  border: 1px dashed #ddd;
  margin-top: 10px;
}

.empty-state .icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-state > div {
  font-family: var(--font-family);
  margin-bottom: 6px;
}

.empty-state .hint {
  font-size: 12px;
  color: #bbb;
}

/* ============================================================
   移动端卡片
   ============================================================ */
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

/* 移动端启用勾选框 */
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

.card-category-select {
  width: auto;
  min-width: 60px;
  height: 26px;
  padding: 2px 18px 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
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
  width: 40px;
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

.card-field .price-unit {
  font-size: 11px;
  color: #999;
  flex-shrink: 0;
}
</style>