<!-- src/components/BulletTable.vue -->
<template>
  <div class="bullet-table-wrapper">
    <!-- 工具栏 -->
    <div class="table-controls">
      <button class="btn-sm btn-primary" @click="addBullet">➕ 新增子弹</button>
      <span class="control-hint">（点击新增后在表格顶部填写数据，然后点击"✅ 确认"保存）</span>
      <span class="count-badge">共 {{ data.length }} 种子弹</span>
    </div>

    <!-- ============ ⭐ 桌面：表格 ============ -->
    <div v-if="!isMobile" class="table-scroll">
      <table>
        <thead>
          <tr>
            <th style="min-width:110px;">子弹口径</th>
            <th style="min-width:65px;">等级</th>
            <th style="min-width:90px;">基础伤害比例</th>
            <th style="min-width:180px;">护甲衰减 (1-6级)</th>
            <th style="min-width:180px;">穿透 (1-6级)</th>
            <th style="min-width:80px;">价格</th>
            <th class="sticky-action" style="min-width:80px;">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in data"
            :key="row.id || row._bulletId || index"
            :class="{ 'new-row': row._isNewRow }"
          >
            <!-- 子弹口径 -->
            <td :class="row._isNewRow ? 'new-row-cell' : 'readonly-cell'">
              <input
                v-if="row._isNewRow"
                v-model="row.caliber"
                class="new-row-input"
                placeholder="如: 5.56x45mm"
              />
              <span v-else>{{ row.caliber || '-' }}</span>
            </td>

            <!-- 等级 -->
            <td :class="row._isNewRow ? 'new-row-cell' : 'readonly-cell'">
              <select v-if="row._isNewRow" v-model="row.level" class="new-row-select">
                <option v-for="opt in levelOptions" :key="opt" :value="opt">
                  {{ opt }}
                </option>
              </select>
              <span v-else-if="isSpecialLevel(row.level)" class="special-badge">
                {{ row.level }}
              </span>
              <span v-else>{{ row.level }}</span>
            </td>

            <!-- 基础伤害比例 -->
            <td :class="row._isNewRow ? 'new-row-cell' : 'control-cell'">
              <input
                v-if="row._isNewRow"
                v-model.number="row.base"
                class="new-row-input"
                type="number"
                step="0.01"
                min="0"
              />
              <input
                v-else
                :value="row.base !== undefined ? row.base.toFixed(2) : '1.00'"
                class="cell-input"
                type="number"
                step="0.01"
                min="0"
                @blur="onBaseChange(row, $event)"
              />
            </td>

            <!-- 护甲衰减 1-6级 -->
            <td :class="row._isNewRow ? 'new-row-cell' : 'control-cell'">
              <input
                v-if="row._isNewRow"
                v-model="newRowArmorMultDisplay"
                class="new-row-input"
                placeholder="1.0,1.0,1.0,1.0,1.0,0.6"
                @blur="parseNewRowArmorMult(row)"
              />
              <input
                v-else
                :value="getArmorMultString(row)"
                class="cell-input armor-cell"
                type="text"
                placeholder="1.0,1.0,1.0,1.0,1.0,0.6"
                @blur="onArmorMultChange(row, $event)"
              />
            </td>

            <!-- 穿透 1-6级 -->
            <td :class="row._isNewRow ? 'new-row-cell' : 'control-cell'">
              <input
                v-if="row._isNewRow"
                v-model="newRowPenDisplay"
                class="new-row-input"
                placeholder="1.0,1.0,0.75,0.5,0,0"
                @blur="parseNewRowPen(row)"
              />
              <input
                v-else
                :value="getPenString(row)"
                class="cell-input armor-cell"
                type="text"
                placeholder="1.0,1.0,0.75,0.5,0,0"
                @blur="onPenChange(row, $event)"
              />
            </td>

            <!-- 价格 -->
            <td :class="row._isNewRow ? 'new-row-cell' : 'control-cell'">
              <input
                v-if="row._isNewRow"
                v-model.number="row.price"
                class="new-row-input"
                type="number"
                step="1"
                min="0"
              />
              <input
                v-else
                :value="row.price || 0"
                class="cell-input"
                type="number"
                step="1"
                min="0"
                @blur="onPriceChange(row, $event)"
              />
            </td>

            <!-- 操作 -->
            <td class="readonly-cell sticky-action">
              <template v-if="row._isNewRow">
                <button class="btn-confirm" @click="confirmAdd(row)">✅</button>
                <button class="btn-cancel" @click="cancelAdd(row)">❌</button>
              </template>
              <button v-else class="btn-delete" @click="deleteRow(row)">🗑️</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ============ ⭐ 移动端：卡片 ============ -->
    <div v-else class="card-list">
      <div
        v-for="(row, index) in data"
        :key="row.id || row._bulletId || index"
        class="card-item"
      >
        <!-- 卡片头部 -->
        <div class="card-header-row">
          <template v-if="row._isNewRow">
            <input
              v-model="row.caliber"
              class="card-title-input"
              placeholder="如: 5.56x45mm"
            />
            <select v-model="row.level" class="card-level-select">
              <option v-for="opt in levelOptions" :key="opt" :value="opt">
                {{ opt }}
              </option>
            </select>
          </template>
          <template v-else>
            <span class="card-title-text">{{ row.caliber || '-' }}</span>
            <span v-if="isSpecialLevel(row.level)" class="level-badge">
              Lv.{{ row.level }}
            </span>
            <span v-else class="card-config-tag">Lv.{{ row.level }}</span>
          </template>

          <div class="card-actions">
            <template v-if="row._isNewRow">
              <button class="btn-icon btn-confirm" @click="confirmAdd(row)" title="确认">✅</button>
              <button class="btn-icon btn-cancel" @click="cancelAdd(row)" title="取消">❌</button>
            </template>
            <template v-else>
              <button class="btn-icon btn-delete" @click="deleteRow(row)" title="删除">🗑️</button>
            </template>
          </div>
        </div>

        <!-- 卡片主体 -->
        <div class="card-body">
          <!-- 基础伤害比例 -->
          <div class="card-field editable">
            <span class="field-label">基础伤害</span>
            <input
              v-if="row._isNewRow"
              v-model.number="row.base"
              type="number"
              step="0.01"
              min="0"
            />
            <input
              v-else
              type="number"
              step="0.01"
              min="0"
              :value="row.base !== undefined ? row.base.toFixed(2) : '1.00'"
              @blur="onBaseChange(row, $event)"
            />
          </div>

          <!-- 护甲衰减 -->
          <div class="card-field editable">
            <span class="field-label">护甲衰减</span>
            <input
              v-if="row._isNewRow"
              v-model="newRowArmorMultDisplay"
              class="mono"
              placeholder="1.0,1.0,1.0,1.0,1.0,0.6"
              @blur="parseNewRowArmorMult(row)"
            />
            <input
              v-else
              class="mono"
              type="text"
              :value="getArmorMultString(row)"
              placeholder="1.0,1.0,1.0,1.0,1.0,0.6"
              @blur="onArmorMultChange(row, $event)"
            />
          </div>

          <!-- 穿透 -->
          <div class="card-field editable">
            <span class="field-label">穿透</span>
            <input
              v-if="row._isNewRow"
              v-model="newRowPenDisplay"
              class="mono"
              placeholder="1.0,1.0,0.75,0.5,0,0"
              @blur="parseNewRowPen(row)"
            />
            <input
              v-else
              class="mono"
              type="text"
              :value="getPenString(row)"
              placeholder="1.0,1.0,0.75,0.5,0,0"
              @blur="onPenChange(row, $event)"
            />
          </div>

          <!-- 价格 -->
          <div class="card-field editable">
            <span class="field-label">价格</span>
            <input
              v-if="row._isNewRow"
              v-model.number="row.price"
              type="number"
              step="1"
              min="0"
            />
            <input
              v-else
              type="number"
              step="1"
              min="0"
              :value="row.price || 0"
              @blur="onPriceChange(row, $event)"
            />
            <span style="color:#888;font-size:11px;">¥</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { dataStore } from '@/stores/dataStore'

const props = defineProps({
  data: {
    type: Array,
    required: true
  },
  caliberOptions: {
    type: Array,
    default: () => []
  },
  levelOptions: {
    type: Array,
    default: () => ['1', '2', '3', '4', '5', 'RIP', 'M61', 'BT+P', 'Double', 'SUPER', 'AP', 'CT', 'ST4', 'ST5']
  }
})

const emit = defineEmits(['update', 'add-bullet', 'delete-bullet'])

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

// 特殊等级列表
const specialLevels = ['RIP', 'M61', 'BT+P', 'Double', 'SUPER', 'AP', 'CT', 'ST4', 'ST5']

// ⭐ 新增行的临时输入状态（不依赖 row 字段，避免响应式读写问题）
const newRowArmorMultDisplay = ref('')
const newRowPenDisplay = ref('')

// ---------- 调试：监听 data 变化 ----------
watch(() => props.data, (newData, oldData) => {
  if (newData && newData.length > 0) {
    const newRows = newData.filter(r => r._isNewRow)
    console.log('🔍 BulletTable data 变化:', oldData?.length, '->', newData?.length, '新增行:', newRows.length)
  }
}, { deep: true, immediate: true })

// ============================================================
// 辅助方法
// ============================================================

const isSpecialLevel = (level) => {
  return specialLevels.includes(String(level))
}

/**
 * 获取护甲衰减字符串
 * - 新增临时行：用组件内临时状态 newRowArmorMultDisplay
 * - 已有子弹：从 row.armorData 拼
 */
const getArmorMultString = (row) => {
  if (row._isNewRow) {
    return newRowArmorMultDisplay.value || ''
  }

  if (!row.armorData) return ''
  const values = []
  for (let i = 1; i <= 6; i++) {
    const v = row.armorData[i]?.armorMult
    values.push(typeof v === 'number' ? v : 1.0)
  }
  return values.map(v => v.toFixed(2)).join(',')
}

/**
 * 获取穿透字符串
 */
const getPenString = (row) => {
  if (row._isNewRow) {
    return newRowPenDisplay.value || ''
  }

  if (!row.armorData) return ''
  const values = []
  for (let i = 1; i <= 6; i++) {
    const v = row.armorData[i]?.pen
    values.push(typeof v === 'number' ? v : 0)
  }
  return values.map(v => v.toFixed(2)).join(',')
}

/**
 * 把 "1.0,1.0,0.75,0.5,0,0" 解析成数字数组（长度补到 6）
 */
const parseNumberArray = (str, defaultValue, length = 6) => {
  if (!str || str.trim() === '') return null

  const values = str.split(',').map(v => {
    const num = parseFloat(v.trim())
    return isNaN(num) ? defaultValue : num
  })

  while (values.length < length) values.push(defaultValue)
  return values.slice(0, length)
}

// ============================================================
// 新增行的解析（把临时状态写入 row 的临时字段）
// ============================================================

const parseNewRowArmorMult = (row) => {
  if (!row._isNewRow) return
  const values = parseNumberArray(newRowArmorMultDisplay.value, 1.0)
  if (values) {
    row._armorMultValues = values
  }
}

const parseNewRowPen = (row) => {
  if (!row._isNewRow) return
  const values = parseNumberArray(newRowPenDisplay.value, 0)
  if (values) {
    row._penValues = values
  }
}

// ============================================================
// 已有子弹的编辑（走 DataManager）
// ============================================================

const onBaseChange = (row, event) => {
  const value = parseFloat(event.target.value)
  if (!isNaN(value) && value >= 0) {
    const dm = dataStore.getDataManager()
    dm.updateBullet(row.id, { base: value })
    dataStore.refreshBullets()
    emit('update')
  }
}

const onArmorMultChange = (row, event) => {
  const str = event.target.value
  const values = parseNumberArray(str, 1.0)
  if (values && values.every(v => !isNaN(v) && v >= 0)) {
    const dm = dataStore.getDataManager()
    dm.updateBullet(row.id, { armorMult: values })
    dataStore.refreshBullets()
    emit('update')
  } else {
    event.target.value = getArmorMultString(row)
  }
}

const onPenChange = (row, event) => {
  const str = event.target.value
  const values = parseNumberArray(str, 0)
  if (values && values.every(v => !isNaN(v) && v >= 0 && v <= 1)) {
    const dm = dataStore.getDataManager()
    dm.updateBullet(row.id, { pen: values })
    dataStore.refreshBullets()
    emit('update')
  } else {
    event.target.value = getPenString(row)
  }
}

const onPriceChange = (row, event) => {
  const value = parseFloat(event.target.value)
  if (!isNaN(value) && value >= 0) {
    const dm = dataStore.getDataManager()
    dm.updateBullet(row.id, { price: value })
    dataStore.refreshBullets()
    emit('update')
  }
}

// ============================================================
// ⭐ 新增子弹
// ============================================================

const addBullet = () => {
  newRowArmorMultDisplay.value = ''
  newRowPenDisplay.value = ''
  emit('add-bullet', -1, null)
}

const confirmAdd = (row) => {
  if (!row) return

  if (!row.caliber || String(row.caliber).trim() === '') {
    alert('⚠️ 请输入子弹口径')
    return
  }
  if (!row.level) {
    alert('⚠️ 请选择子弹等级')
    return
  }

  const bulletData = {
    id: `${row.caliber}_${row.level}`,
    caliber: String(row.caliber).trim(),
    level: row.level,
    base: row.base || 1.0,
    price: row.price || 0,
    armorData: {}
  }

  const armorValues = row._armorMultValues
    || parseNumberArray(newRowArmorMultDisplay.value, 1.0)
    || [1.0, 1.0, 1.0, 1.0, 1.0, 0.6]

  const penValues = row._penValues
    || parseNumberArray(newRowPenDisplay.value, 0)
    || [1.0, 1.0, 0.75, 0.5, 0, 0]

  for (let i = 1; i <= 6; i++) {
    bulletData.armorData[i] = {
      armorMult: armorValues[i - 1] ?? 1.0,
      pen: penValues[i - 1] ?? 0
    }
  }

  emit('add-bullet', null, bulletData)
}

const cancelAdd = (row) => {
  emit('delete-bullet', null, null, true)
}

// ============================================================
// 删除已有子弹
// ============================================================

const deleteRow = (row) => {
  if (!confirm(`确定要删除子弹 "${row.caliber} Lv.${row.level}" 吗？`)) return
  emit('delete-bullet', null, row.id, false)
}
</script>

<style scoped>
.bullet-table-wrapper {
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

.control-hint {
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.count-badge {
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
  min-width: 800px;
}

thead th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #f0fff4;
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
  background: #f8fffa;
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

.new-row-cell {
  padding: 2px 4px;
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
  background: #f0fff4;
}

tbody tr:hover .sticky-action {
  background: #f8fffa;
}

tbody tr.new-row .sticky-action {
  background: #fff8e1;
}

/* ============ 输入框（填满单元格） ============ */
.control-cell .cell-input {
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

.control-cell .cell-input:focus {
  background: var(--color-bg-white);
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.control-cell .cell-input:hover:not(:focus) {
  background: rgba(74, 108, 247, 0.06);
}

/* 护甲衰减/穿透列使用等宽字体 */
.armor-cell {
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  letter-spacing: -0.3px;
}

/* ============ 新增行的输入框 ============ */
.new-row-input,
.new-row-select {
  width: 100%;
  padding: 3px 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  background: var(--color-bg-white);
  box-sizing: border-box;
  height: 26px;
  color: var(--color-text);
}

.new-row-input:focus,
.new-row-select:focus {
  border-color: var(--color-primary);
  outline: none;
}

/* ============ 特殊等级标签 ============ */
.special-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 8px;
  font-family: var(--font-family);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  background: var(--color-warning);
  color: #fff;
}

/* ⭐ 卡片模式：新增行的标题输入框 */
.card-title-input {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
  font-size: 13px;
  background: var(--color-bg-white);
  color: var(--color-text);
  outline: none;
}

.card-title-input:focus {
  border-color: var(--color-primary);
}

/* ⭐ 卡片模式：新增行的等级下拉 */
.card-level-select {
  flex-shrink: 0;
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
  font-size: 12px;
  background: var(--color-bg-white);
  color: var(--color-text);
  outline: none;
  cursor: pointer;
}

.card-level-select:focus {
  border-color: var(--color-primary);
}

/* ⭐ 卡片模式：等宽输入框 */
.card-field.editable input.mono {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: -0.3px;
}

/* ============ 移动端适配 ============ */
@media (max-width: 768px) {
  /* ⭐ 工具栏：压缩 padding 和 gap */
  .table-controls {
    gap: 3px;
    padding: 3px 6px;
  }

  .control-hint {
    width: 100%;
    margin-left: 0;
  }

  .count-badge {
    margin-left: 0;
  }
}
</style>