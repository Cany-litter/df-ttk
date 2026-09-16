<!-- src/components/BulletTable.vue -->
<template>
  <div class="bullet-table-wrapper">
    <!-- 工具栏 -->
    <div class="table-controls">
      <button class="btn-sm btn-primary" @click="addBullet">➕ 新增子弹</button>
      <button class="btn-sm btn-outline" @click="enableAll">✅ 全部启用</button>
      <button class="btn-sm btn-outline" @click="disableAll">❌ 全部禁用</button>
      <span class="toolbar-divider"></span>
      <span class="control-hint">（点击新增后在表格顶部填写数据，然后点击"✅ 确认"保存）</span>
      <span class="count-badge">
        共 {{ data.length }} 种子弹（启用 {{ enabledCount }}）
      </span>
    </div>

    <!-- ============ ⭐ 桌面：表格 ============ -->
    <div v-if="!isMobile" class="table-scroll">
      <table class="bullet-table">
        <colgroup>
          <col style="width: 50px;" />
          <col style="width: 50px;" />
          <col style="width: 100px;" />
          <col style="width: 110px;" />
          <col style="width: 65px;" />
          <col style="width: 180px;" />
          <col style="width: 180px;" />
          <col style="width: 180px;" />
          <col style="width: 80px;" />
          <col style="width: 80px;" />
        </colgroup>
        <thead>
          <tr>
            <th title="是否启用（禁用的不参与推荐/计算）">启用</th>
            <th title="同口径+等级唯一一个默认">默认</th>
            <th>子弹名称</th>
            <th>子弹口径</th>
            <th>等级</th>
            <th class="multi-col-header">
              <div class="header-main">部位肉伤</div>
              <div class="header-sub">头 · 胸 · 腹 · 肢</div>
            </th>
            <th class="multi-col-header">
              <div class="header-main">护甲衰减</div>
              <div class="header-sub">1 · 2 · 3 · 4 · 5 · 6</div>
            </th>
            <th class="multi-col-header">
              <div class="header-main">穿透</div>
              <div class="header-sub">1 · 2 · 3 · 4 · 5 · 6</div>
            </th>
            <th>价格</th>
            <th class="sticky-action">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in data"
            :key="row.id || row._bulletId || index"
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

            <!-- ⭐ 默认 -->
            <td class="readonly-cell default-cell">
              <label
                v-if="!row._isNewRow"
                class="default-radio-wrap"
                :title="row.isDefault ? '当前默认' : '设为默认'"
              >
                <input
                  type="radio"
                  :name="`default_${row.caliber}_${row.level}`"
                  :checked="row.isDefault === true"
                  @change="onDefaultChange(row)"
                />
                <span class="default-star" :class="{ active: row.isDefault }">
                  {{ row.isDefault ? '⭐' : '○' }}
                </span>
              </label>
              <span v-else class="default-placeholder">-</span>
            </td>

            <!-- 子弹名称 -->
            <td :class="row._isNewRow ? 'new-row-cell' : 'control-cell'">
              <input
                v-if="row._isNewRow"
                v-model="row.name"
                class="new-row-input"
                placeholder="如: M995"
              />
              <input
                v-else
                :value="row.name || ''"
                class="cell-input"
                type="text"
                placeholder="未命名"
                @blur="onNameChange(row, $event)"
              />
            </td>

            <!-- 子弹口径 -->
            <td :class="row._isNewRow ? 'new-row-cell' : 'readonly-cell'">
              <input
                v-if="row._isNewRow"
                v-model="row.caliber"
                class="new-row-input"
                placeholder="如: 5.56x45mm"
              />
              <span v-else class="readonly-text" :title="row.id">{{ row.caliber || '-' }}</span>
            </td>

            <!-- 等级（固定 1-6） -->
            <td :class="row._isNewRow ? 'new-row-cell' : 'control-cell'">
              <select
                v-model="row.level"
                class="level-select"
                :class="getLevelClass(row.level)"
                @change="onLevelChange(row, $event)"
              >
                <option v-for="opt in levelOptions" :key="opt" :value="opt">
                  {{ opt }}
                </option>
              </select>
            </td>

            <!-- ⭐ 部位肉伤（单输入框，逗号分隔） -->
            <td :class="row._isNewRow ? 'new-row-cell' : 'control-cell'">
              <input
                v-if="row._isNewRow"
                v-model="newRowPartMultStr"
                class="new-row-input mono-input"
                type="text"
                placeholder="1,1,1,1"
              />
              <input
                v-else
                :value="getPartMultString(row)"
                class="cell-input mono-input"
                type="text"
                placeholder="1,1,1,1"
                @blur="onPartMultChange(row, $event)"
              />
            </td>

            <!-- ⭐ 护甲衰减（单输入框，逗号分隔） -->
            <td :class="row._isNewRow ? 'new-row-cell' : 'control-cell'">
              <input
                v-if="row._isNewRow"
                v-model="newRowArmorMultStr"
                class="new-row-input mono-input"
                type="text"
                placeholder="1,1,1,1,1,0.6"
              />
              <input
                v-else
                :value="getArmorMultString(row)"
                class="cell-input mono-input"
                type="text"
                placeholder="1,1,1,1,1,0.6"
                @blur="onArmorMultChange(row, $event)"
              />
            </td>

            <!-- ⭐ 穿透（单输入框，逗号分隔） -->
            <td :class="row._isNewRow ? 'new-row-cell' : 'control-cell'">
              <input
                v-if="row._isNewRow"
                v-model="newRowPenStr"
                class="new-row-input mono-input"
                type="text"
                placeholder="1,1,0.75,0.5,0,0"
              />
              <input
                v-else
                :value="getPenString(row)"
                class="cell-input mono-input"
                type="text"
                placeholder="1,1,0.75,0.5,0,0"
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
        :class="{ 'disabled-row': row.enabled === false && !row._isNewRow }"
      >
        <!-- 卡片头部 -->
        <div class="card-header-row">
          <template v-if="row._isNewRow">
            <input
              v-model="row.name"
              class="card-title-input"
              placeholder="子弹名称"
            />
            <input
              v-model="row.caliber"
              class="card-caliber-input"
              placeholder="口径"
            />
            <select v-model="row.level" class="card-level-select">
              <option v-for="opt in levelOptions" :key="opt" :value="opt">
                {{ opt }}
              </option>
            </select>
          </template>
          <template v-else>
            <!-- ⭐ 启用勾选框 -->
            <label class="enabled-checkbox-wrap card-enabled" :title="row.enabled !== false ? '点击禁用' : '点击启用'">
              <input
                type="checkbox"
                :checked="row.enabled !== false"
                @change="onEnabledChange(row, $event)"
              />
            </label>
            <span class="card-title-text">{{ row.name || '未命名' }}</span>
            <span class="card-caliber-tag" :title="row.id">{{ row.caliber || '-' }}</span>
            <span
              class="level-badge"
              :class="getLevelClass(row.level)"
            >
              Lv.{{ row.level }}
            </span>
            <!-- ⭐ 默认切换 -->
            <button
              class="default-toggle-btn"
              :class="{ active: row.isDefault }"
              :title="row.isDefault ? '当前默认' : '设为默认'"
              @click.stop="onDefaultChange(row)"
            >
              {{ row.isDefault ? '⭐' : '○' }}
            </button>
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
          <!-- 等级（移动端可编辑） -->
          <div v-if="!row._isNewRow" class="card-field editable">
            <span class="field-label">等级</span>
            <select
              v-model="row.level"
              class="level-select-mobile"
              :class="getLevelClass(row.level)"
              @change="onLevelChange(row, $event)"
            >
              <option v-for="opt in levelOptions" :key="opt" :value="opt">
                {{ opt }}
              </option>
            </select>
          </div>

          <!-- 部位肉伤 -->
          <div class="card-field editable">
            <span class="field-label">部位肉伤</span>
            <input
              v-if="row._isNewRow"
              v-model="newRowPartMultStr"
              class="mono"
              placeholder="1,1,1,1"
            />
            <input
              v-else
              class="mono"
              type="text"
              :value="getPartMultString(row)"
              placeholder="1,1,1,1"
              @blur="onPartMultChange(row, $event)"
            />
            <span class="field-hint">头,胸,腹,肢</span>
          </div>

          <!-- 护甲衰减 -->
          <div class="card-field editable">
            <span class="field-label">护甲衰减</span>
            <input
              v-if="row._isNewRow"
              v-model="newRowArmorMultStr"
              class="mono"
              placeholder="1,1,1,1,1,0.6"
            />
            <input
              v-else
              class="mono"
              type="text"
              :value="getArmorMultString(row)"
              placeholder="1,1,1,1,1,0.6"
              @blur="onArmorMultChange(row, $event)"
            />
            <span class="field-hint">1~6级</span>
          </div>

          <!-- 穿透 -->
          <div class="card-field editable">
            <span class="field-label">穿透</span>
            <input
              v-if="row._isNewRow"
              v-model="newRowPenStr"
              class="mono"
              placeholder="1,1,0.75,0.5,0,0"
            />
            <input
              v-else
              class="mono"
              type="text"
              :value="getPenString(row)"
              placeholder="1,1,0.75,0.5,0,0"
              @blur="onPenChange(row, $event)"
            />
            <span class="field-hint">1~6级</span>
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
import { ref, computed, watch, onMounted, onBeforeUnmount, inject } from 'vue'
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
    default: () => [1, 2, 3, 4, 5, 6]
  }
})

const emit = defineEmits(['update', 'add-bullet', 'delete-bullet'])

// ⭐ 注入通用弹窗
const showConfirm = inject('showConfirm', null)
const showAlert = inject('showAlert', null)

// ⭐ 部位定义
const PART_KEYS = ['head', 'chest', 'stomach', 'limbs']

// ⭐ 是否为移动端
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

// ⭐ 启用数量统计
const enabledCount = computed(() => {
  return props.data.filter(r => r.enabled !== false).length
})

// ⭐ 新增行的临时状态（字符串）
const newRowPartMultStr = ref('1,1,1,1')
const newRowArmorMultStr = ref('1,1,1,1,1,0.6')
const newRowPenStr = ref('1,1,0.75,0.5,0,0')

// 重置新增行临时状态
const resetNewRowState = () => {
  newRowPartMultStr.value = '1,1,1,1'
  newRowArmorMultStr.value = '1,1,1,1,1,0.6'
  newRowPenStr.value = '1,1,0.75,0.5,0,0'
}

// ---------- 调试 ----------
watch(() => props.data, (newData, oldData) => {
  if (newData && newData.length > 0) {
    const newRows = newData.filter(r => r._isNewRow)
    console.log('🔍 BulletTable data 变化:', oldData?.length, '->', newData?.length, '新增行:', newRows.length)
  }
}, { deep: true, immediate: true })

// ============================================================
// 辅助方法
// ============================================================

const getLevelClass = (level) => {
  const n = Number(level)
  if (n >= 1 && n <= 6) return `level-${n}`
  return ''
}

const parseNumberArray = (str, defaultValue, minLength, maxLength = minLength) => {
  if (!str || str.trim() === '') return null

  const values = str.split(',').map(v => {
    const num = parseFloat(v.trim())
    return isNaN(num) ? defaultValue : num
  })

  while (values.length < minLength) values.push(defaultValue)
  return values.slice(0, maxLength)
}

// ============================================================
// 显示：已有行的字符串
// ============================================================

const getPartMultString = (row) => {
  if (row._isNewRow) return newRowPartMultStr.value
  const pm = row.partMult || { head: 1, chest: 1, stomach: 1, limbs: 1 }
  const values = PART_KEYS.map(k => {
    const v = pm[k]
    return typeof v === 'number' && isFinite(v) ? v : 1
  })
  return values.join(',')
}

const getArmorMultString = (row) => {
  if (row._isNewRow) return newRowArmorMultStr.value
  if (!row.armorData) return '1,1,1,1,1,0.6'
  const values = []
  for (let i = 1; i <= 6; i++) {
    const v = row.armorData[i]?.armorMult
    values.push(typeof v === 'number' && isFinite(v) ? v : 1)
  }
  return values.join(',')
}

const getPenString = (row) => {
  if (row._isNewRow) return newRowPenStr.value
  if (!row.armorData) return '1,1,0.75,0.5,0,0'
  const values = []
  for (let i = 1; i <= 6; i++) {
    const v = row.armorData[i]?.pen
    values.push(typeof v === 'number' && isFinite(v) ? v : 0)
  }
  return values.join(',')
}

// ============================================================
// ⭐ 启用/禁用切换
// ============================================================

const onEnabledChange = (row, event) => {
  if (row._isNewRow) return

  const newEnabled = event.target.checked
  const dm = dataStore.getDataManager()
  const ok = dm.updateBullet(row.id, { enabled: newEnabled })
  if (ok) {
    dataStore.refreshBullets()
    emit('update')
    console.log(`${newEnabled ? '✅ 启用' : '❌ 禁用'} 子弹: ${row.id}`)
  } else {
    // 失败时回滚 checkbox
    event.target.checked = !newEnabled
  }
}

// ⭐ 全部启用
const enableAll = () => {
  const dm = dataStore.getDataManager()
  const count = dm.setBulletsEnabled(true)
  if (count > 0) {
    dataStore.refreshBullets()
    emit('update')
    console.log(`✅ 已启用 ${count} 颗子弹`)
  } else {
    console.log('ℹ️ 所有子弹已启用')
  }
}

// ⭐ 全部禁用
const disableAll = async () => {
  let confirmed = true
  if (showConfirm) {
    const result = await showConfirm({
      title: '禁用全部子弹',
      message: '确定要禁用全部子弹吗？禁用后推荐功能将无法使用任何子弹。',
      confirmText: '禁用',
      confirmType: 'warning'
    })
    confirmed = result.confirmed
  } else {
    confirmed = confirm('确定要禁用全部子弹吗？')
  }

  if (!confirmed) return

  const dm = dataStore.getDataManager()
  const count = dm.setBulletsEnabled(false)
  if (count > 0) {
    dataStore.refreshBullets()
    emit('update')
    console.log(`❌ 已禁用 ${count} 颗子弹`)
  } else {
    console.log('ℹ️ 所有子弹已禁用')
  }
}

// ============================================================
// ⭐ 部位肉伤：失焦处理
// ============================================================

const onPartMultChange = (row, event) => {
  const str = event.target.value
  const values = parseNumberArray(str, 1, 4, 4)

  if (!values || !values.every(v => !isNaN(v) && v >= 0)) {
    event.target.value = getPartMultString(row)
    return
  }

  const newPartMult = {
    head: values[0],
    chest: values[1],
    stomach: values[2],
    limbs: values[3]
  }

  const dm = dataStore.getDataManager()
  const ok = dm.updateBullet(row.id, { partMult: newPartMult })
  if (ok) {
    dataStore.refreshBullets()
    emit('update')
    event.target.value = getPartMultString(row)
  } else {
    event.target.value = getPartMultString(row)
  }
}

// ============================================================
// ⭐ 护甲衰减：失焦处理
// ============================================================

const onArmorMultChange = (row, event) => {
  const str = event.target.value
  const values = parseNumberArray(str, 1, 6, 6)

  if (!values || !values.every(v => !isNaN(v) && v >= 0)) {
    event.target.value = getArmorMultString(row)
    return
  }

  const dm = dataStore.getDataManager()
  const ok = dm.updateBullet(row.id, { armorMult: values })
  if (ok) {
    dataStore.refreshBullets()
    emit('update')
    event.target.value = getArmorMultString(row)
  } else {
    event.target.value = getArmorMultString(row)
  }
}

// ============================================================
// ⭐ 穿透：失焦处理（带 0~1 校验）
// ============================================================

const onPenChange = async (row, event) => {
  const str = event.target.value
  const values = parseNumberArray(str, 0, 6, 6)

  if (!values || !values.every(v => !isNaN(v) && v >= 0)) {
    event.target.value = getPenString(row)
    return
  }

  // ⭐ 穿透值 0~1 校验（改用弹窗）
  const invalid = values.find(v => v > 1)
  if (invalid !== undefined) {
    const msg = `⚠️ 穿透值不能超过 1（检测到 ${invalid}）`
    if (showAlert) {
      await showAlert(msg)
    } else {
      alert(msg)
    }
    event.target.value = getPenString(row)
    return
  }

  const dm = dataStore.getDataManager()
  const ok = dm.updateBullet(row.id, { pen: values })
  if (ok) {
    dataStore.refreshBullets()
    emit('update')
    event.target.value = getPenString(row)
  } else {
    event.target.value = getPenString(row)
  }
}

// ============================================================
// ⭐ 已有子弹的其他编辑
// ============================================================

const onNameChange = (row, event) => {
  const value = String(event.target.value || '').trim()
  const finalName = value || '未命名'

  if (finalName === row.name) return

  const dm = dataStore.getDataManager()
  const ok = dm.updateBullet(row.id, { name: finalName })
  if (ok) {
    dataStore.refreshBullets()
    emit('update')
  } else {
    event.target.value = row.name
  }
}

const onLevelChange = (row, event) => {
  const value = event.target.value
  const finalLevel = /^\d+$/.test(value) ? parseInt(value, 10) : value

  if (finalLevel === row.level) return

  if (row._isNewRow) {
    row.level = finalLevel
    return
  }

  const dm = dataStore.getDataManager()
  const ok = dm.updateBullet(row.id, { level: finalLevel })
  if (ok) {
    dataStore.refreshBullets()
    emit('update')
    console.log(`✅ 子弹等级已更新: ${row.name || row.caliber} Lv.${finalLevel}`)
  } else {
    event.target.value = row.level
  }
}

const onDefaultChange = (row) => {
  if (row._isNewRow) return
  if (row.isDefault === true) return

  const dm = dataStore.getDataManager()
  const ok = dm.setDefaultBullet(row.id)
  if (ok) {
    dataStore.refreshBullets()
    emit('update')
    console.log(`⭐ 已设置默认: ${row.id}`)
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
  resetNewRowState()
  emit('add-bullet', -1, null)
}

const confirmAdd = async (row) => {
  if (!row) return

  if (!row.caliber || String(row.caliber).trim() === '') {
    const msg = '⚠️ 请输入子弹口径'
    if (showAlert) {
      await showAlert(msg)
    } else {
      alert(msg)
    }
    return
  }
  if (row.level === undefined || row.level === null || row.level === '') {
    const msg = '⚠️ 请选择子弹等级'
    if (showAlert) {
      await showAlert(msg)
    } else {
      alert(msg)
    }
    return
  }

  const caliber = String(row.caliber).trim()
  const name = String(row.name || '').trim() || '未命名'
  const level = row.level

  const dm = dataStore.getDataManager()
  const bulletId = dm.getNextBulletId(caliber)

  const partMultValues = parseNumberArray(newRowPartMultStr.value, 1, 4, 4)
    || [1, 1, 1, 1]

  const armorValues = parseNumberArray(newRowArmorMultStr.value, 1, 6, 6)
    || [1, 1, 1, 1, 1, 0.6]

  const penValues = parseNumberArray(newRowPenStr.value, 0, 6, 6)
    || [1, 1, 0.75, 0.5, 0, 0]

  const bulletData = {
    id: bulletId,
    name: name,
    caliber: caliber,
    level: level,
    partMult: {
      head: partMultValues[0],
      chest: partMultValues[1],
      stomach: partMultValues[2],
      limbs: partMultValues[3]
    },
    price: row.price || 0,
    enabled: true,
    armorData: {}
  }

  for (let i = 1; i <= 6; i++) {
    bulletData.armorData[i] = {
      armorMult: armorValues[i - 1] ?? 1,
      pen: penValues[i - 1] ?? 0
    }
  }

  console.log(`✅ 新增子弹 ID: ${bulletId}`)
  emit('add-bullet', null, bulletData)

  resetNewRowState()
}

const cancelAdd = (row) => {
  emit('delete-bullet', null, null, true)
  resetNewRowState()
}

// ============================================================
// ⭐ 删除已有子弹（改用弹窗）
// ============================================================

const deleteRow = async (row) => {
  const label = row.name
    ? `${row.name} (${row.caliber} Lv.${row.level})`
    : `${row.caliber} Lv.${row.level}`

  let confirmed = true
  if (showConfirm) {
    const result = await showConfirm({
      title: '删除子弹',
      message: `确定要删除子弹 "${label}" 吗？`,
      confirmText: '删除',
      confirmType: 'danger'
    })
    confirmed = result.confirmed
  } else {
    confirmed = confirm(`确定要删除子弹 "${label}" 吗？`)
  }

  if (!confirmed) return
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

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: #dde3ee;
  margin: 0 2px;
  flex-shrink: 0;
}

/* ============ 表格 ============ */
.table-scroll {
  overflow: auto;
  max-height: 500px;
  border: 1px solid #eee;
  border-radius: var(--radius-md);
}

.bullet-table {
  width: 100%;
  min-width: 1105px;
  border-collapse: collapse;
  table-layout: fixed;
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
}

thead th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #f0fff4;
  padding: 6px 4px;
  border: 1px solid #e0e0e0;
  text-align: center;
  white-space: nowrap;
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-sm);
  height: 44px;
  overflow: hidden;
}

tbody td {
  padding: 0;
  border: 1px solid var(--color-border-light);
  text-align: center;
  vertical-align: middle;
  font-size: var(--font-size-sm);
  height: 36px;
  overflow: hidden;
}

tbody tr:hover {
  background: #f8fffa;
}

tbody tr.new-row td {
  background: #fff8e1;
  border-top: 2px solid var(--color-warning);
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

.readonly-cell {
  padding: 4px 6px;
}

.readonly-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: #555;
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

tbody tr.disabled-row .sticky-action {
  background: #f5f5f5;
}

/* ============ 输入框（填满单元格） ============ */
.control-cell .cell-input {
  width: 100%;
  height: 100%;
  min-height: 34px;
  padding: 4px 6px;
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

.mono-input {
  font-family: var(--font-mono) !important;
  font-size: 11px !important;
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

/* ============ 多列表头 ============ */
.multi-col-header {
  padding: 4px 4px 5px;
  vertical-align: middle;
}

.multi-col-header .header-main {
  font-size: 12px;
  font-weight: 600;
  color: #333;
  text-align: center;
  margin-bottom: 2px;
  line-height: 1.2;
}

.multi-col-header .header-sub {
  font-size: 10px;
  font-weight: 400;
  color: #888;
  line-height: 1.2;
  text-align: center;
  letter-spacing: 0.3px;
}

/* ============ ⭐ 启用列 ============ */
.enabled-cell {
  padding: 0;
}

.enabled-checkbox-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 34px;
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

/* ============ ⭐ 默认列 ============ */
.default-cell {
  padding: 0;
}

.default-radio-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 34px;
  cursor: pointer;
  user-select: none;
}

.default-radio-wrap input[type="radio"] {
  display: none;
}

.default-star {
  font-size: 14px;
  color: #ccc;
  transition: all 0.15s;
  line-height: 1;
}

.default-star.active {
  color: #ffc107;
  text-shadow: 0 0 4px rgba(255, 193, 7, 0.5);
}

.default-radio-wrap:hover .default-star {
  transform: scale(1.2);
}

.default-placeholder {
  color: #ccc;
  font-size: 12px;
}

/* ============ ⭐ 等级下拉框（桌面） ============ */
.level-select {
  width: 100%;
  height: 100%;
  min-height: 34px;
  padding: 2px 16px 2px 4px;
  border: none;
  border-radius: 0;
  background: transparent;
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  font-weight: 600;
  text-align: center;
  text-align-last: center;
  cursor: pointer;
  outline: none;
  transition: background 0.15s;
  -webkit-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%23999' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 3px center;
}

.level-select:hover:not(:focus) {
  background-color: rgba(74, 108, 247, 0.06);
}

.level-select:focus {
  background-color: #fff;
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.level-select.level-1 { background-color: #ffffff; color: #333; }
.level-select.level-2 { background-color: #e8f5e9; color: #2e7d32; }
.level-select.level-3 { background-color: #e3f2fd; color: #1565c0; }
.level-select.level-4 { background-color: #ede7f6; color: #5e35b1; }
.level-select.level-5 { background-color: #fff8e1; color: #e65100; }
.level-select.level-6 { background-color: #ffebee; color: #c62828; }

/* ============ 卡片模式 ============ */

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

.card-caliber-input {
  flex-shrink: 0;
  width: 100px;
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
  font-size: 12px;
  background: var(--color-bg-white);
  color: var(--color-text);
  outline: none;
}

.card-caliber-input:focus {
  border-color: var(--color-primary);
}

.card-caliber-tag {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: #666;
  background: #eef0f5;
  padding: 2px 8px;
  border-radius: 8px;
}

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

.level-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 8px;
  font-family: var(--font-family);
  font-size: 10px;
  font-weight: 600;
  flex-shrink: 0;
}

.level-badge.level-1 { background: #ffffff; color: #333; border: 1px solid #e0e0e0; }
.level-badge.level-2 { background: #e8f5e9; color: #2e7d32; }
.level-badge.level-3 { background: #e3f2fd; color: #1565c0; }
.level-badge.level-4 { background: #ede7f6; color: #5e35b1; }
.level-badge.level-5 { background: #fff8e1; color: #e65100; }
.level-badge.level-6 { background: #ffebee; color: #c62828; }

.default-toggle-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: #f5f5f5;
  font-size: 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  margin-left: 4px;
}

.default-toggle-btn.active {
  background: #fff8e1;
  color: #ffc107;
}

.default-toggle-btn:hover {
  background: #fff3e0;
}

/* ⭐ 移动端启用勾选框 */
.card-enabled {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}

/* ⭐ 禁用卡片 */
.card-item.disabled-row {
  background: #f5f5f5;
  opacity: 0.7;
}

.level-select-mobile {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
  font-size: 13px;
  font-weight: 600;
  background: var(--color-bg-light);
  color: var(--color-text);
  outline: none;
  cursor: pointer;
}

.level-select-mobile:focus {
  border-color: var(--color-primary);
  background: #fff;
}

.level-select-mobile.level-1 { background: #ffffff; color: #333; }
.level-select-mobile.level-2 { background: #e8f5e9; color: #2e7d32; }
.level-select-mobile.level-3 { background: #e3f2fd; color: #1565c0; }
.level-select-mobile.level-4 { background: #ede7f6; color: #5e35b1; }
.level-select-mobile.level-5 { background: #fff8e1; color: #e65100; }
.level-select-mobile.level-6 { background: #ffebee; color: #c62828; }

.card-field.editable input.mono {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: -0.3px;
}

.field-hint {
  font-size: 10px;
  color: #aaa;
  flex-shrink: 0;
  margin-left: 4px;
  white-space: nowrap;
}

/* ============ 移动端适配 ============ */
@media (max-width: 768px) {
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