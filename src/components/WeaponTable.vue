<!-- src/components/WeaponTable.vue -->
<template>
  <div class="weapon-table-wrapper">
    <!-- 工具栏 -->
    <div class="table-controls">
      <button class="btn-sm btn-primary" @click="addWeapon">➕ 新增枪械</button>
      <span class="control-hint">（点击新增后在表格顶部填写数据，然后点击"✅ 确认"保存）</span>
      <span class="count-badge">共 {{ data.length }} 把武器</span>
    </div>

    <!-- ============ ⭐ 桌面：表格 ============ -->
    <div v-if="!isMobile" class="table-scroll">
      <table>
        <thead>
          <tr>
            <th style="min-width:80px;">武器</th>
            <th style="min-width:60px;">类型</th>
            <th style="min-width:90px;">口径</th>
            <th style="min-width:55px;">射速</th>
            <th style="min-width:65px;">当前射速</th>
            <th style="min-width:55px;">初速</th>
            <th style="min-width:65px;">当前初速</th>
            <th style="min-width:110px;">射程</th>
            <th style="min-width:110px;">当前射程</th>
            <th style="min-width:150px;">衰减</th>
            <th style="min-width:150px;">当前衰减</th>
            <th style="min-width:50px;">肉伤</th>
            <th style="min-width:60px;">当前肉伤</th>
            <th style="min-width:50px;">甲伤</th>
            <th style="min-width:60px;">当前甲伤</th>
            <th style="min-width:85px;">部位倍率</th>
            <th style="min-width:95px;">当前倍率</th>
            <th style="min-width:90px;">部位伤害</th>
            <th style="min-width:110px;">枪管</th>
            <th style="min-width:80px;">枪口</th>
            <th style="min-width:90px;">精校</th>
            <th class="sticky-action" style="min-width:90px;">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in rowsWithCurrent"
            :key="row.id || index"
            :class="{ 'new-row': row._isNewRow }"
          >
            <td :class="row._isNewRow ? 'new-row-cell' : 'readonly-cell'">
              <input
                v-if="row._isNewRow"
                v-model="row.name"
                class="new-row-input"
                placeholder="武器名称"
              />
              <span v-else>{{ row.name }}</span>
            </td>

            <td :class="row._isNewRow ? 'new-row-cell' : 'readonly-cell'">
              <select v-if="row._isNewRow" v-model="row.type" class="new-row-select">
                <option v-for="t in typeOptions" :key="t" :value="t">{{ t }}</option>
              </select>
              <span v-else>{{ row.type }}</span>
            </td>

            <td :class="row._isNewRow ? 'new-row-cell' : 'readonly-cell'">
              <select v-if="row._isNewRow" v-model="row.allowedBullet" class="new-row-select">
                <option v-for="cal in caliberOptions" :key="cal" :value="cal">{{ cal }}</option>
              </select>
              <span v-else>{{ row.allowedBullet || '-' }}</span>
            </td>

            <td :class="row._isNewRow ? 'new-row-cell' : 'readonly-cell'">
              <input
                v-if="row._isNewRow"
                v-model.number="row.rof"
                class="new-row-input"
                type="number"
                step="1"
                min="0"
              />
              <span v-else>{{ row.rof }}</span>
            </td>

            <td class="readonly-cell current-value">
              {{ row.rofCurrent !== undefined && row.rofCurrent !== null ? Math.round(row.rofCurrent) : '-' }}
            </td>

            <td :class="row._isNewRow ? 'new-row-cell' : 'readonly-cell'">
              <input
                v-if="row._isNewRow"
                v-model.number="row.velocity"
                class="new-row-input"
                type="number"
                step="1"
                min="0"
              />
              <span v-else>{{ row.velocity }}</span>
            </td>

            <td class="readonly-cell current-value">
              {{ row.velocityCurrent !== undefined && row.velocityCurrent !== null ? Math.round(row.velocityCurrent) : '-' }}
            </td>

            <td :class="row._isNewRow ? 'new-row-cell' : 'readonly-cell'">
              <input
                v-if="row._isNewRow"
                v-model="rangesDisplay"
                class="new-row-input"
                placeholder="40,70,∞,∞"
                @blur="parseRanges(row)"
              />
              <span v-else>{{ formatRanges(row.ranges) }}</span>
            </td>

            <td class="readonly-cell current-value">
              {{ row.rangesCurrent ? formatRanges(row.rangesCurrent) : '-' }}
            </td>

            <td :class="row._isNewRow ? 'new-row-cell' : 'readonly-cell'">
              <input
                v-if="row._isNewRow"
                v-model="decaysDisplay"
                class="new-row-input"
                placeholder="1.0,0.9,0.75,0.75,0.75"
                @blur="parseDecays(row)"
              />
              <span v-else>{{ formatDecays(row.decays) }}</span>
            </td>

            <td class="readonly-cell current-value">
              {{ row.decaysCurrent ? formatDecays(row.decaysCurrent) : '-' }}
            </td>

            <td :class="row._isNewRow ? 'new-row-cell' : 'readonly-cell'">
              <input
                v-if="row._isNewRow"
                v-model.number="row.flesh"
                class="new-row-input"
                type="number"
                step="0.1"
                min="0"
              />
              <span v-else>{{ row.flesh }}</span>
            </td>

            <td class="readonly-cell current-value">
              {{ row.fleshCurrent !== undefined && row.fleshCurrent !== null ? Math.round(row.fleshCurrent) : '-' }}
            </td>

            <td :class="row._isNewRow ? 'new-row-cell' : 'readonly-cell'">
              <input
                v-if="row._isNewRow"
                v-model.number="row.armor"
                class="new-row-input"
                type="number"
                step="0.1"
                min="0"
              />
              <span v-else>{{ row.armor }}</span>
            </td>

            <td class="readonly-cell current-value">
              {{ row.armorCurrent !== undefined && row.armorCurrent !== null ? Math.round(row.armorCurrent) : '-' }}
            </td>

            <td :class="row._isNewRow ? 'new-row-cell' : 'readonly-cell'">
              <input
                v-if="row._isNewRow"
                v-model="multDisplay"
                class="new-row-input"
                placeholder="1.9,1,0.9,0.4"
                @blur="parseMult(row)"
              />
              <span v-else>{{ formatMult(row.mult) }}</span>
            </td>

            <td class="readonly-cell current-value">
              {{ row.multCurrent ? formatMult(row.multCurrent) : '-' }}
            </td>

            <td class="readonly-cell part-damage">{{ row.partDamage || '-' }}</td>

            <td v-if="!row._isNewRow" class="control-cell">
              <select
                :value="row.barrelName || '无'"
                @change="onBarrelChange(index, $event)"
              >
                <option v-for="opt in getBarrelOptions(row)" :key="opt" :value="opt">
                  {{ opt }}
                </option>
              </select>
            </td>
            <td v-else class="readonly-cell">无</td>

            <td v-if="!row._isNewRow" class="control-cell">
              <select
                :value="row.muzzleName || '无'"
                @change="onMuzzleChange(index, $event)"
              >
                <option v-for="opt in muzzleOptions" :key="opt" :value="opt">
                  {{ opt }}
                </option>
              </select>
            </td>
            <td v-else class="readonly-cell">无</td>

            <td v-if="!row._isNewRow" class="precision-cell">
              <div class="precision-container">
                <input
                  type="range"
                  :min="-0.09"
                  :max="0.09"
                  :step="0.01"
                  :value="row.precision || 0.09"
                  @input="onPrecisionChange(index, $event)"
                  class="precision-slider"
                />
                <span class="precision-value">{{ Math.round((row.precision || 0.09) * 100) }}%</span>
              </div>
            </td>
            <td v-else class="readonly-cell">-</td>

            <td class="readonly-cell sticky-action">
              <template v-if="row._isNewRow">
                <button class="btn-confirm" @click="confirmAdd(index)">✅ 确认</button>
                <button class="btn-cancel" @click="cancelAdd(index)">❌ 取消</button>
              </template>
              <button v-else class="btn-edit" @click="editBarrel(index)">编辑枪管</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ============ ⭐ 移动端：卡片 ============ -->
    <div v-else class="card-list">
      <div
        v-for="(row, index) in rowsWithCurrent"
        :key="row.id || index"
        class="card-item"
      >
        <!-- 卡片头部 -->
        <div class="card-header-row">
          <template v-if="row._isNewRow">
            <input
              v-model="row.name"
              class="card-title-input"
              placeholder="武器名称"
            />
          </template>
          <template v-else>
            <span class="card-title-text">{{ row.name }}</span>
            <span class="card-config-tag">{{ row.type }}</span>
          </template>

          <div class="card-actions">
            <template v-if="row._isNewRow">
              <button class="btn-icon btn-confirm" @click="confirmAdd(index)" title="确认">✅</button>
              <button class="btn-icon btn-cancel" @click="cancelAdd(index)" title="取消">❌</button>
            </template>
            <template v-else>
              <button class="btn-icon btn-edit btn-with-text" @click="editBarrel(index)" title="编辑枪管">🔧 枪管</button>
            </template>
          </div>
        </div>

        <!-- 卡片主体 -->
        <div class="card-body">
          <!-- ⭐ 新增行：基础字段可编辑 -->
          <template v-if="row._isNewRow">
            <div class="card-group-title">基础信息</div>
            <div class="card-field editable">
              <span class="field-label">类型</span>
              <select v-model="row.type">
                <option v-for="t in typeOptions" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
            <div class="card-field editable">
              <span class="field-label">口径</span>
              <select v-model="row.allowedBullet">
                <option v-for="cal in caliberOptions" :key="cal" :value="cal">{{ cal }}</option>
              </select>
            </div>
            <div class="card-field editable">
              <span class="field-label">射速</span>
              <input v-model.number="row.rof" type="number" step="1" min="0" />
            </div>
            <div class="card-field editable">
              <span class="field-label">初速</span>
              <input v-model.number="row.velocity" type="number" step="1" min="0" />
            </div>
            <div class="card-field editable">
              <span class="field-label">射程</span>
              <input v-model="rangesDisplay" placeholder="40,70,∞,∞" @blur="parseRanges(row)" />
            </div>
            <div class="card-field editable">
              <span class="field-label">衰减</span>
              <input v-model="decaysDisplay" placeholder="1.0,0.9,0.75,0.75,0.75" @blur="parseDecays(row)" />
            </div>
            <div class="card-field editable">
              <span class="field-label">肉伤</span>
              <input v-model.number="row.flesh" type="number" step="0.1" min="0" />
            </div>
            <div class="card-field editable">
              <span class="field-label">甲伤</span>
              <input v-model.number="row.armor" type="number" step="0.1" min="0" />
            </div>
            <div class="card-field editable">
              <span class="field-label">部位倍率</span>
              <input v-model="multDisplay" placeholder="1.9,1,0.9,0.4" @blur="parseMult(row)" />
            </div>
          </template>

          <!-- ⭐ 已有武器：分组展示 -->
          <template v-else>
            <div class="card-group-title">基础属性 / 当前值</div>
            <div class="card-field">
              <span class="field-label">射速</span>
              <span v-html="dualValue(row.rof, Math.round(row.rofCurrent), ' RPM')"></span>
            </div>
            <div class="card-field">
              <span class="field-label">初速</span>
              <span v-html="dualValue(row.velocity, Math.round(row.velocityCurrent), ' m/s')"></span>
            </div>
            <div class="card-field">
              <span class="field-label">肉伤</span>
              <span v-html="dualValue(row.flesh, Math.round(row.fleshCurrent))"></span>
            </div>
            <div class="card-field">
              <span class="field-label">甲伤</span>
              <span v-html="dualValue(row.armor, Math.round(row.armorCurrent))"></span>
            </div>
            <div class="card-field">
              <span class="field-label">射程</span>
              <span class="field-value mono">{{ formatRanges(row.ranges) }}</span>
            </div>
            <div class="card-field">
              <span class="field-label">衰减</span>
              <span class="field-value mono">{{ formatDecays(row.decays) }}</span>
            </div>
            <div class="card-field">
              <span class="field-label">倍率</span>
              <span class="field-value mono">{{ formatMult(row.mult) }}</span>
            </div>
            <div class="card-field">
              <span class="field-label">部位伤害</span>
              <span class="field-value mono">{{ row.partDamage || '-' }}</span>
            </div>

            <div class="card-group-title">附件</div>
            <div class="card-field editable">
              <span class="field-label">枪管</span>
              <select
                :value="row.barrelName || '无'"
                @change="onBarrelChange(index, $event)"
              >
                <option v-for="opt in getBarrelOptions(row)" :key="opt" :value="opt">
                  {{ opt }}
                </option>
              </select>
            </div>
            <div class="card-field editable">
              <span class="field-label">枪口</span>
              <select
                :value="row.muzzleName || '无'"
                @change="onMuzzleChange(index, $event)"
              >
                <option v-for="opt in muzzleOptions" :key="opt" :value="opt">
                  {{ opt }}
                </option>
              </select>
            </div>
            <div class="card-field">
              <span class="field-label">精校</span>
              <div class="precision-container">
                <input
                  type="range"
                  :min="-0.09"
                  :max="0.09"
                  :step="0.01"
                  :value="row.precision || 0.09"
                  @input="onPrecisionChange(index, $event)"
                  class="precision-slider"
                />
                <span class="precision-value">{{ Math.round((row.precision || 0.09) * 100) }}%</span>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { dataStore } from '@/stores/dataStore'
import { formatRanges, formatMultipliers } from '@/utils/formatters'
import { calculateCurrentValues } from '@/utils/weaponCalc'

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
  caliberOptions: {
    type: Array,
    default: () => [
      '5.45x39mm', '5.56x45mm', '5.8x42mm',
      '7.62x39mm', '7.62x51mm', '7.62x54R',
      '6.8x51mm', '9x39mm', '9x19mm',
      '.45ACP', '.300BLK', '4.6x30mm',
      '5.7x28mm', '12.7x55mm'
    ]
  }
})

const emit = defineEmits(['update', 'edit-barrel', 'add-weapon', 'delete-weapon'])

const typeOptions = ['步枪', '冲锋枪', '轻机枪', '精确射手步枪', '手枪']

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

// ============================================================
// ⭐ 双值显示（原值 → 当前值）
// ============================================================
const dualValue = (orig, cur, suffix = '') => {
  // 容错
  if (cur === undefined || cur === null || isNaN(cur)) {
    return `<span class="field-value">${orig}${suffix}</span>`
  }

  const same = String(orig) === String(cur)
  if (same) {
    return `<span class="field-value dual"><span class="cur same">${cur}${suffix}</span></span>`
  }
  return `<span class="field-value dual">
    <span class="orig">${orig}${suffix}</span>
    <span class="arrow">→</span>
    <span class="cur">${cur}${suffix}</span>
  </span>`
}

// ============================================================
// ⭐ 附件管理（内部维护）
// ============================================================

const weaponAttachments = ref({})

const initWeaponAttachments = (weapons) => {
  weapons.forEach(weapon => {
    if (weapon._isNewRow) return
    
    const existing = weaponAttachments.value[weapon.id]
    if (existing && existing.barrelId !== undefined) {
      return
    }
    
    const dm = dataStore.getDataManager()
    const bestBarrelIndex = dm.findBestBarrelIndex(weapon.id)
    
    weaponAttachments.value[weapon.id] = {
      barrelId: bestBarrelIndex >= 0 ? bestBarrelIndex : -1,
      muzzleId: 0,
      precision: 0.09
    }
  })
}

watch(() => props.data, (newData) => {
  initWeaponAttachments(newData)
}, { immediate: true })

const getWeaponAttachment = (weaponId) => {
  if (!weaponAttachments.value[weaponId]) {
    weaponAttachments.value[weaponId] = {
      barrelId: -1,
      muzzleId: 0,
      precision: 0.09
    }
  }
  return weaponAttachments.value[weaponId]
}

const getMuzzleName = (muzzleId) => {
  const dm = dataStore.getDataManager()
  const muzzle = dm.getMuzzleById(muzzleId)
  return muzzle ? muzzle.name : '无'
}

// ============================================================
// ⭐ 计算带当前值的行数据
// ============================================================

const rowsWithCurrent = computed(() => {
  return props.data.map(weapon => {
    if (weapon._isNewRow) {
      return {
        ...weapon,
        _isNewRow: true
      }
    }
    
    const attachment = getWeaponAttachment(weapon.id)
    const barrelId = attachment.barrelId
    const muzzleId = attachment.muzzleId || 0
    const precision = attachment.precision || 0.09
    
    let barrel = null
    let barrelName = '无'
    if (barrelId >= 0 && weapon.barrels && weapon.barrels[barrelId]) {
      barrel = weapon.barrels[barrelId]
      barrelName = barrel.name || '无'
    }
    
    const current = calculateCurrentValues(weapon, barrel, muzzleId, precision)
    
    const multCurrent = current.mult || weapon.mult
    const fleshCurrent = current.flesh
    const parts = ['head', 'chest', 'stomach', 'limbs']
    const partDamageStr = parts.map(part => {
      const multiplier = multCurrent[part] ?? 1
      return (fleshCurrent * multiplier).toFixed(1)
    }).join(',')

    const barrelOptions = ['无']
    if (weapon.barrels && Array.isArray(weapon.barrels) && weapon.barrels.length > 0) {
      weapon.barrels.forEach(b => {
        if (b.name) {
          barrelOptions.push(b.name)
        }
      })
    }
    
    return {
      ...weapon,
      barrelId: barrelId,
      barrelName: barrelName,
      muzzleId: muzzleId,
      muzzleName: getMuzzleName(muzzleId),
      precision: precision,
      rofCurrent: current.rof,
      velocityCurrent: current.velocity,
      rangesCurrent: current.ranges,
      decaysCurrent: current.decays,
      fleshCurrent: current.flesh,
      armorCurrent: current.armor,
      multCurrent: current.mult,
      partDamage: partDamageStr,
      _barrelOptions: barrelOptions,
      _isNewRow: false
    }
  })
})

// ============================================================
// 格式化方法
// ============================================================

const formatDecays = (decays) => {
  if (!decays || !Array.isArray(decays)) return '-'
  return decays.map(v => v.toFixed(2)).join(', ')
}

const formatMult = (mult) => {
  if (!mult || typeof mult !== 'object') return '-'
  const round = (v) => typeof v === 'number' ? Math.round((v + Number.EPSILON) * 100) / 100 : v
  return `${round(mult.head)},${round(mult.chest)},${round(mult.stomach)},${round(mult.limbs)}`
}

// ============================================================
// 新增行临时显示字段
// ============================================================

const rangesDisplay = ref('')
const decaysDisplay = ref('')
const multDisplay = ref('')

const parseRanges = (row) => {
  if (!row._isNewRow) return
  const str = rangesDisplay.value
  const ranges = str.split(',').map(v => {
    const trimmed = v.trim()
    if (trimmed === '∞' || trimmed === 'Infinity' || trimmed === '') return Infinity
    return parseFloat(trimmed) || 40
  })
  row.ranges = ranges
}

const parseDecays = (row) => {
  if (!row._isNewRow) return
  const str = decaysDisplay.value
  const decays = str.split(',').map(v => parseFloat(v.trim()) || 1.0)
  while (decays.length < 5) decays.push(1.0)
  row.decays = decays.slice(0, 5)
}

const parseMult = (row) => {
  if (!row._isNewRow) return
  const parts = multDisplay.value.split(',').map(v => parseFloat(v.trim()) || 1)
  row.mult = {
    head: parts[0] || 1.9,
    chest: parts[1] || 1,
    stomach: parts[2] || 0.9,
    limbs: parts[3] || 0.4
  }
}

// ============================================================
// 事件处理
// ============================================================

const onBarrelChange = (index, event) => {
  const value = event.target.value
  const row = rowsWithCurrent.value[index]
  if (!row || row._isNewRow) return
  
  let barrelIndex = -1
  if (value !== '无') {
    const dm = dataStore.getDataManager()
    const weapon = dm.getWeaponById(row.id)
    if (weapon && weapon.barrels) {
      barrelIndex = weapon.barrels.findIndex(b => b.name === value)
    }
  }
  
  const attachment = getWeaponAttachment(row.id)
  attachment.barrelId = barrelIndex
  
  emit('update', { index, type: 'barrel', value: barrelIndex, weaponId: row.id })
}

const onMuzzleChange = (index, event) => {
  const value = event.target.value
  const row = rowsWithCurrent.value[index]
  if (!row || row._isNewRow) return
  
  const muzzleIndex = props.muzzleOptions.indexOf(value)
  
  const attachment = getWeaponAttachment(row.id)
  attachment.muzzleId = muzzleIndex >= 0 ? muzzleIndex : 0
  
  emit('update', { index, type: 'muzzle', value: muzzleIndex >= 0 ? muzzleIndex : 0, weaponId: row.id })
}

const onPrecisionChange = (index, event) => {
  const value = parseFloat(event.target.value)
  const row = rowsWithCurrent.value[index]
  if (!row || row._isNewRow) return
  
  const attachment = getWeaponAttachment(row.id)
  attachment.precision = value
  
  emit('update', { index, type: 'precision', value, weaponId: row.id })
}

const editBarrel = (index) => {
  const row = rowsWithCurrent.value[index]
  if (!row) return
  emit('edit-barrel', row.id)
}

// ============================================================
// ⭐ 新增武器
// ============================================================

const addWeapon = () => {
  emit('add-weapon', -1, null)
}

const confirmAdd = (index) => {
  const row = rowsWithCurrent.value[index]
  if (!row) return
  
  if (!row.name || row.name.trim() === '') {
    alert('⚠️ 请输入武器名称')
    return
  }
  if (!row.allowedBullet || row.allowedBullet.trim() === '') {
    alert('⚠️ 请选择口径')
    return
  }
  
  emit('add-weapon', index, row)
}

const cancelAdd = (index) => {
  emit('delete-weapon', index, null, true)
}
</script>

<style scoped>
.weapon-table-wrapper {
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
  min-width: 1400px;
}

thead th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #f0f4f8;
  padding: 6px 4px;
  border: 1px solid #e0e0e0;
  text-align: center;
  white-space: nowrap;
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-xs);
  height: 32px;
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

.new-row-cell {
  padding: 2px 3px;
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
  background: #f0f4f8;
}

tbody tr:hover .sticky-action {
  background: var(--color-bg-hover);
}

tbody tr.new-row .sticky-action {
  background: #fff8e1;
}

/* ============ 输入框（填满单元格） ============ */
.control-cell input,
.control-cell select {
  width: 100%;
  height: 100%;
  min-height: 30px;
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

.control-cell input:focus,
.control-cell select:focus {
  background: var(--color-bg-white);
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

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

/* ============ 特殊列样式 ============ */
.current-value {
  font-weight: var(--font-weight-semibold);
  color: var(--color-primary);
  background: #f5f7fb;
}

.part-damage {
  font-family: var(--font-mono);
  font-weight: var(--font-weight-medium);
  color: #2d3748;
}

/* 精校列 */
.precision-cell {
  padding: 2px 4px;
}

.precision-container {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  justify-content: center;
}

.precision-slider {
  width: 50px;
  cursor: pointer;
  accent-color: var(--color-primary);
}

.precision-value {
  font-family: var(--font-family);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  min-width: 28px;
  text-align: center;
}

/* ⭐ 卡片模式：新增行的武器名输入框 */
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

/* ⭐ 卡片模式下，精校滑条居中 */
.card-field .precision-container {
  justify-content: flex-start;
  flex: 1;
}

/* ============ 移动端适配（表格模式下的微调） ============ */
@media (max-width: 768px) {
  table {
    font-size: var(--font-size-xs);
    min-width: 1200px;
  }
  
  thead th {
    padding: 4px 2px;
    height: 30px;
  }
  
  tbody td {
    height: 30px;
  }
  
  .control-cell input,
  .control-cell select {
    font-size: var(--font-size-sm);
    min-height: 28px;
    padding: 3px 4px;
  }
  
  .precision-slider {
    width: 40px;
  }
}
</style>