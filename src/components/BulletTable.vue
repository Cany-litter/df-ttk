<!-- src/components/BulletTable.vue -->
<template>
  <div class="bullet-table-wrapper">
    <!-- 工具栏 -->
    <div class="table-controls">
      <button class="btn-sm btn-primary" @click="addBullet">➕ 新增子弹</button>
      <span class="control-hint">（点击新增后在表格顶部填写数据，然后点击"✅ 确认"保存）</span>
      <span class="count-badge">共 {{ data.length }} 种子弹</span>
    </div>

    <!-- 表格 -->
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th style="min-width:110px;">子弹口径</th>
            <th style="min-width:65px;">等级</th>
            <th style="min-width:90px;">基础伤害比例</th>
            <th style="min-width:180px;">护甲衰减 (1-6级)</th>
            <th style="min-width:180px;">穿透 (1-6级)</th>
            <th style="min-width:80px;">价格</th>
            <th style="min-width:80px;">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in data"
            :key="row._bulletId || row.id || index"
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
                @blur="onBaseChange(index, $event)"
              />
            </td>

            <!-- 护甲衰减 1-6级 -->
            <td :class="row._isNewRow ? 'new-row-cell' : 'control-cell'">
              <input
                v-if="row._isNewRow"
                v-model="armorMultDisplay"
                class="new-row-input"
                placeholder="1.0,1.0,1.0,1.0,1.0,0.6"
                @blur="parseArmorMult(row)"
              />
              <input
                v-else
                :value="getArmorMultString(row)"
                class="cell-input armor-cell"
                type="text"
                placeholder="1.0,1.0,1.0,1.0,1.0,0.6"
                @blur="onArmorMultChange(index, $event)"
              />
            </td>

            <!-- 穿透 1-6级 -->
            <td :class="row._isNewRow ? 'new-row-cell' : 'control-cell'">
              <input
                v-if="row._isNewRow"
                v-model="penDisplay"
                class="new-row-input"
                placeholder="1.0,1.0,0.75,0.5,0,0"
                @blur="parsePen(row)"
              />
              <input
                v-else
                :value="getPenString(row)"
                class="cell-input armor-cell"
                type="text"
                placeholder="1.0,1.0,0.75,0.5,0,0"
                @blur="onPenChange(index, $event)"
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
                @blur="onPriceChange(index, $event)"
              />
            </td>

            <!-- 操作 -->
            <td class="readonly-cell">
              <template v-if="row._isNewRow">
                <button class="btn-confirm" @click="confirmAdd(index)">✅</button>
                <button class="btn-cancel" @click="cancelAdd(index)">❌</button>
              </template>
              <button v-else class="btn-delete" @click="deleteRow(index)">🗑️</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
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

// 特殊等级列表
const specialLevels = ['RIP', 'M61', 'BT+P', 'Double', 'SUPER', 'AP', 'CT', 'ST4', 'ST5']

// 新增行临时显示字段
const armorMultDisplay = ref('')
const penDisplay = ref('')

// ---------- 调试：监听 data 变化 ----------
watch(() => props.data, (newData, oldData) => {
  if (newData && newData.length > 0) {
    const newRows = newData.filter(r => r._isNewRow)
    console.log('🔍 BulletTable data 变化:', oldData?.length, '->', newData?.length, '新增行:', newRows.length)
  }
}, { deep: true, immediate: true })

// ---------- 辅助方法 ----------
const isSpecialLevel = (level) => {
  return specialLevels.includes(String(level))
}

const getArmorMultString = (row) => {
  const values = row._armorMultValues || []
  if (values.length === 0) return ''
  return values.map(v => {
    const num = typeof v === 'number' ? v : parseFloat(v)
    return isNaN(num) ? '1.00' : num.toFixed(2)
  }).join(',')
}

const getPenString = (row) => {
  const values = row._penValues || []
  if (values.length === 0) return ''
  return values.map(v => {
    const num = typeof v === 'number' ? v : parseFloat(v)
    return isNaN(num) ? '0.00' : num.toFixed(2)
  }).join(',')
}

// ---------- 新增行解析 ----------
const parseArmorMult = (row) => {
  if (!row._isNewRow) return
  const str = armorMultDisplay.value
  const values = str.split(',').map(v => parseFloat(v.trim()) || 1.0)
  while (values.length < 6) values.push(1.0)
  row._armorMultValues = values.slice(0, 6)
  row.armorMult = values[0] || 1.0
}

const parsePen = (row) => {
  if (!row._isNewRow) return
  const str = penDisplay.value
  const values = str.split(',').map(v => parseFloat(v.trim()) || 0)
  while (values.length < 6) values.push(0)
  row._penValues = values.slice(0, 6)
  row.pen = values[0] || 0
}

// ---------- 单元格编辑事件 ----------
const onBaseChange = (index, event) => {
  const value = parseFloat(event.target.value)
  if (!isNaN(value) && value >= 0) {
    const row = props.data[index]
    const dm = dataStore.getDataManager()
    dm.updateBullet(row._bulletId, { base: value })
    dataStore.refreshBullets()
    emit('update')
  }
}

const onArmorMultChange = (index, event) => {
  const str = event.target.value
  const values = str.split(',').map(v => parseFloat(v.trim()) || 1.0)
  if (values.length === 6 && values.every(v => !isNaN(v) && v >= 0)) {
    const row = props.data[index]
    const dm = dataStore.getDataManager()
    dm.updateBullet(row._bulletId, { armorMult: values })
    dataStore.refreshBullets()
    emit('update')
  } else {
    event.target.value = getArmorMultString(props.data[index])
  }
}

const onPenChange = (index, event) => {
  const str = event.target.value
  const values = str.split(',').map(v => parseFloat(v.trim()) || 0)
  if (values.length === 6 && values.every(v => !isNaN(v) && v >= 0 && v <= 1)) {
    const row = props.data[index]
    const dm = dataStore.getDataManager()
    dm.updateBullet(row._bulletId, { pen: values })
    dataStore.refreshBullets()
    emit('update')
  } else {
    event.target.value = getPenString(props.data[index])
  }
}

const onPriceChange = (index, event) => {
  const value = parseFloat(event.target.value)
  if (!isNaN(value) && value >= 0) {
    const row = props.data[index]
    const dm = dataStore.getDataManager()
    dm.updateBullet(row._bulletId, { price: value })
    dataStore.refreshBullets()
    emit('update')
  }
}

// ============================================================
// ⭐ 新增子弹（关键修复）
// ============================================================

/**
 * 点击"新增子弹"按钮
 * 传递 index = -1，明确告知父组件是"新增按钮"事件
 */
const addBullet = () => {
  emit('add-bullet', -1, null)
}

/**
 * 点击"✅ 确认"按钮
 * 传递 index 和 bulletData，父组件创建真实子弹
 */
const confirmAdd = (index) => {
  const row = props.data[index]
  if (!row) return
  
  if (!row.caliber || row.caliber.trim() === '') {
    alert('⚠️ 请输入子弹口径')
    return
  }
  if (!row.level) {
    alert('⚠️ 请选择子弹等级')
    return
  }
  
  const bulletData = {
    id: `${row.caliber}_${row.level}`,
    caliber: row.caliber,
    level: row.level,
    base: row.base || 1.0,
    price: row.price || 0,
    armorData: {}
  }

  const armorValues = row._armorMultValues || [1.0, 1.0, 1.0, 1.0, 1.0, 0.6]
  const penValues = row._penValues || [1.0, 1.0, 0.75, 0.5, 0, 0]
  for (let i = 1; i <= 6; i++) {
    bulletData.armorData[i] = {
      armorMult: armorValues[i - 1] || 1.0,
      pen: penValues[i - 1] || 0
    }
  }

  emit('add-bullet', index, bulletData)
}

/**
 * 点击"❌ 取消"按钮
 * 传递 isCancelled = true，父组件移除临时行
 */
const cancelAdd = (index) => {
  emit('delete-bullet', index, null, true)
}

const deleteRow = (index) => {
  const row = props.data[index]
  if (!confirm(`确定要删除子弹 "${row.caliber} Lv.${row.level}" 吗？`)) return
  emit('delete-bullet', index, row._bulletId, false)
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

/* ============ 移动端适配 ============ */
@media (max-width: 768px) {
  table {
    font-size: var(--font-size-sm);
    min-width: 700px;
  }
  
  thead th {
    padding: 4px 3px;
    height: 30px;
  }
  
  tbody td {
    height: 30px;
  }
  
  .control-cell .cell-input {
    font-size: var(--font-size-sm);
    min-height: 28px;
    padding: 3px 6px;
  }
  
  .armor-cell {
    font-size: var(--font-size-xs);
  }
}
</style>