<!-- src/components/BarrelEditor.vue -->
<template>
  <div v-if="visible" class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <div class="modal-header">
        <h3>🔧 编辑枪管 — {{ weaponName }}</h3>
        <button class="modal-close" @click="close">&times;</button>
      </div>

      <div class="modal-body">
        <!-- 枪管列表 -->
        <div v-if="barrels.length === 0" class="empty-state">
          <p>📭 暂无枪管数据</p>
          <span class="hint">点击下方 "新增枪管" 添加</span>
        </div>

        <div v-else class="table-scroll">
          <table class="barrel-table">
            <thead>
              <tr>
                <th style="min-width:80px;">名称</th>
                <th style="min-width:50px;">射程倍率</th>
                <th style="min-width:50px;">射程增量</th>
                <th style="min-width:50px;">初速增量</th>
                <th style="min-width:50px;">射速倍率</th>
                <th style="min-width:45px;">肉伤加成</th>
                <th style="min-width:45px;">甲伤加成</th>
                <th style="min-width:55px;">扳机延迟Δ</th>
                <th style="min-width:80px;">自定义射程</th>
                <th style="min-width:140px;">自定义衰减</th>
                <th style="min-width:120px;">部位倍率加成</th>
                <th style="min-width:110px;" title="格式：前N个间隔+射速，逗号分隔。如 3:+100 表示前3个间隔射速+100">分段射速</th>
                <th style="min-width:60px;">开火模式</th>
                <th style="min-width:45px;">连发数</th>
                <th style="min-width:50px;">内部射速</th>
                <th style="min-width:50px;">连发间隔</th>
                <th style="min-width:50px;">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(barrel, index) in barrels" :key="index">
                <td>
                  <input v-model="barrel.name" class="cell-input" placeholder="枪管名称" />
                </td>
                <td>
                  <input v-model.number="barrel.rangeMult" class="cell-input" type="number" step="0.01" />
                </td>
                <td>
                  <input v-model.number="barrel.rangeAdd" class="cell-input" type="number" step="0.01" />
                </td>
                <td>
                  <input v-model.number="barrel.velocityAdd" class="cell-input" type="number" step="1" />
                </td>
                <td>
                  <input v-model.number="barrel.rofMult" class="cell-input" type="number" step="0.01" />
                </td>
                <td>
                  <input v-model.number="barrel.damageBonus" class="cell-input" type="number" step="0.1" />
                </td>
                <td>
                  <input v-model.number="barrel.armorDamageBonus" class="cell-input" type="number" step="0.1" />
                </td>
                <td>
                  <input v-model.number="barrel.triggerDelayDelta" class="cell-input" type="number" step="1" />
                </td>
                <td>
                  <input
                    v-model="barrel.rangesDisplay"
                    class="cell-input"
                    :placeholder="weaponRangesPlaceholder"
                    @blur="parseRanges(index)"
                  />
                </td>
                <td>
                  <input
                    v-model="barrel.decaysDisplay"
                    class="cell-input"
                    :placeholder="weaponDecaysPlaceholder"
                  />
                </td>
                <td>
                  <input
                    v-model="barrel.partMultAddDisplay"
                    class="cell-input part-mult-input"
                    :placeholder="partMultAddPlaceholder"
                    title="依次对应：头部、胸部、腹部、四肢（不填则使用武器原始倍率）"
                  />
                </td>
                <td>
                  <!-- ⭐ 分段射速编辑（字符串格式） -->
                  <input
                    v-model="barrel.rofStagesDisplay"
                    class="cell-input rof-stages-input"
                    placeholder="如: 3:+100"
                    title="格式：前N个间隔:+射速，逗号分隔。如 3:+100 表示前3个间隔射速+100，之后 +0。留空表示无分段"
                    @blur="parseRofStages(index)"
                  />
                </td>
                <td>
                  <select v-model="barrel.fireMode" class="cell-select">
                    <option value="">默认</option>
                    <option value="auto">全自动</option>
                    <option value="burst">连发</option>
                  </select>
                </td>
                <td>
                  <input
                    v-model.number="barrel.burstCount"
                    class="cell-input"
                    type="number"
                    :disabled="barrel.fireMode !== 'burst'"
                  />
                </td>
                <td>
                  <input
                    v-model.number="barrel.burstInternalROF"
                    class="cell-input"
                    type="number"
                    :disabled="barrel.fireMode !== 'burst'"
                  />
                </td>
                <td>
                  <input
                    v-model.number="barrel.burstInterval"
                    class="cell-input"
                    type="number"
                    step="0.01"
                    :disabled="barrel.fireMode !== 'burst'"
                  />
                </td>
                <td>
                  <button class="btn-delete" @click="deleteBarrel(index)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" @click="addBarrel">➕ 新增枪管</button>
        <button class="btn-primary" @click="save">💾 保存</button>
        <button class="btn-secondary" @click="close">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { dataStore } from '@/stores/dataStore'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  weaponId: {
    type: [Number, String],
    default: null
  }
})

const emit = defineEmits(['update:visible', 'saved'])

// 本地状态
const barrels = ref([])
const weaponName = ref('')
const currentWeapon = ref(null)

// ============================================================
// 武器原始值 → placeholder
// ============================================================

const weaponRangesPlaceholder = computed(() => {
  if (!currentWeapon.value) return '40,70,∞,∞'
  const ranges = currentWeapon.value.ranges || []
  return ranges.map(r => r === Infinity ? '∞' : r).join(',')
})

const weaponDecaysPlaceholder = computed(() => {
  if (!currentWeapon.value) return '1.00,0.90,0.75,0.75,0.75'
  const decays = currentWeapon.value.decays || []
  return decays.map(v => v.toFixed(2)).join(',')
})

const partMultAddPlaceholder = computed(() => {
  return '0,0,0,0'
})

// ============================================================
// 部位倍率加成：格式化 & 解析
// ============================================================

const formatPartMultAdd = (partMultAdd) => {
  if (!partMultAdd || typeof partMultAdd !== 'object') return ''
  const keys = ['head', 'chest', 'stomach', 'limbs']
  const values = keys.map(k => {
    const v = partMultAdd[k]
    return typeof v === 'number' ? v : 0
  })
  if (values.every(v => v === 0)) return ''
  return values.join(',')
}

const parsePartMultAdd = (str) => {
  if (!str || str.trim() === '') return null
  const parts = str.split(',').map(p => p.trim())
  const keys = ['head', 'chest', 'stomach', 'limbs']
  const result = {}
  for (let i = 0; i < 4; i++) {
    const value = parts[i] !== undefined ? parseFloat(parts[i]) : 0
    result[keys[i]] = isNaN(value) ? 0 : value
  }
  if (Object.values(result).every(v => v === 0)) return null
  return result
}

// ============================================================
// ⭐ 分段射速：格式化 & 解析
// ============================================================

/**
 * 将 rofStages 数组转为显示字符串
 * 
 * 输入：[{ untilShot: 3, rofAdd: 100 }, { rofAdd: 0 }]
 * 输出："3:+100"
 * 
 * 规则：只显示"有 untilShot 且 rofAdd != 0"的阶段
 */
const formatRofStages = (rofStages) => {
  if (!Array.isArray(rofStages) || rofStages.length === 0) return ''

  const parts = []
  for (const stage of rofStages) {
    if (stage.untilShot === undefined || stage.untilShot === null) continue
    if (!stage.rofAdd) continue
    const sign = stage.rofAdd > 0 ? '+' : ''
    parts.push(`${stage.untilShot}:${sign}${stage.rofAdd}`)
  }

  return parts.join(',')
}

/**
 * 将显示字符串解析为 rofStages 数组
 * 
 * 输入："3:+100" 或 "3:+100,6:+50" 或空
 * 输出：
 *   [{ untilShot: 3, rofAdd: 100 }, { rofAdd: 0 }]
 *   [{ untilShot: 3, rofAdd: 100 }, { untilShot: 6, rofAdd: 50 }, { rofAdd: 0 }]
 *   null（空字符串）
 */
const parseRofStagesFromString = (str) => {
  if (!str || str.trim() === '') return null

  const segments = str.split(',').map(s => s.trim()).filter(Boolean)
  const stages = []

  for (const seg of segments) {
    // 匹配 "N:+X" 或 "N:-X" 或 "N:X"
    const match = seg.match(/^(\d+)\s*:\s*([+-]?\d+(?:\.\d+)?)$/)
    if (!match) continue

    const untilShot = parseInt(match[1], 10)
    const rofAdd = parseFloat(match[2])

    if (isNaN(untilShot) || untilShot <= 0) continue
    if (isNaN(rofAdd)) continue

    stages.push({ untilShot, rofAdd })
  }

  if (stages.length === 0) return null

  // 按 untilShot 升序排序
  stages.sort((a, b) => a.untilShot - b.untilShot)

  // 自动补"之后所有发"阶段
  stages.push({ rofAdd: 0 })

  return stages
}

// ============================================================
// 加载武器数据
// ============================================================

const loadWeapon = () => {
  if (!props.weaponId) return

  const weapon = dataStore.getWeaponById(props.weaponId)
  if (!weapon) {
    weaponName.value = '未找到武器'
    currentWeapon.value = null
    barrels.value = []
    return
  }

  weaponName.value = weapon.name || '未命名武器'
  currentWeapon.value = weapon

  // 复制枪管数据
  barrels.value = (weapon.barrels || []).map(b => ({
    ...b,
    rangesDisplay: b.ranges ? b.ranges.map(r => r === Infinity ? '∞' : r).join(',') : '',
    decaysDisplay: b.decays ? b.decays.join(',') : '',
    partMultAddDisplay: formatPartMultAdd(b.partMultAdd),
    rofStagesDisplay: formatRofStages(b.rofStages),   // ⭐ 分段射速
    fireMode: b.fireMode || '',
    burstCount: b.burstCount || 3,
    burstInternalROF: b.burstInternalROF || 800,
    burstInterval: b.burstInterval || 0.1
  }))
}

// 监听 weaponId 变化
watch(() => props.weaponId, loadWeapon, { immediate: true })
watch(() => props.visible, (newVal) => {
  if (newVal) loadWeapon()
})

// ============================================================
// 解析方法
// ============================================================

// 解析射程
const parseRanges = (index) => {
  const barrel = barrels.value[index]
  if (!barrel || !barrel.rangesDisplay) return

  const str = barrel.rangesDisplay
  const ranges = str.split(',').map(v => {
    const trimmed = v.trim()
    if (trimmed === '∞' || trimmed === 'Infinity' || trimmed === '') return Infinity
    return parseFloat(trimmed) || 0
  })
  barrel.ranges = ranges
}

// ⭐ 解析分段射速（唯一的 parseRofStages，写回 barrel.rofStages）
const parseRofStages = (index) => {
  const barrel = barrels.value[index]
  if (!barrel) return
  barrel.rofStages = parseRofStagesFromString(barrel.rofStagesDisplay)
}

// ============================================================
// 新增/删除枪管
// ============================================================

const addBarrel = () => {
  barrels.value.push({
    name: '',
    rangeMult: 1.0,
    rangeAdd: 0,
    velocityAdd: 0,
    rofMult: 1.0,
    damageBonus: 0,
    armorDamageBonus: 0,
    triggerDelayDelta: 0,
    ranges: [],
    rangesDisplay: '',
    decays: [],
    decaysDisplay: '',
    partMultAddDisplay: '',
    rofStagesDisplay: '',   // ⭐ 分段射速
    rofStages: null,
    fireMode: '',
    burstCount: 3,
    burstInternalROF: 800,
    burstInterval: 0.1
  })
}

const deleteBarrel = (index) => {
  if (!confirm('确定要删除这个枪管吗？')) return
  barrels.value.splice(index, 1)
}

// ============================================================
// 保存
// ============================================================

const save = () => {
  const weapon = dataStore.getWeaponById(props.weaponId)
  if (!weapon) {
    alert('未找到武器')
    return
  }

  // 过滤空名称的枪管
  const validBarrels = barrels.value.filter(b => b.name && b.name.trim() !== '')

  // 构建保存数据
  weapon.barrels = validBarrels.map(b => {
    const result = {
      name: b.name.trim(),
      rangeMult: b.rangeMult || 1.0,
      rangeAdd: b.rangeAdd || 0,
      velocityAdd: b.velocityAdd || 0,
      rofMult: b.rofMult || 1.0,
      damageBonus: b.damageBonus || 0,
      armorDamageBonus: b.armorDamageBonus || 0,
      triggerDelayDelta: b.triggerDelayDelta || 0
    }

    // 自定义射程（仅当用户填写时才写入）
    if (b.ranges && b.ranges.length > 0) {
      result.ranges = b.ranges
    }

    // 自定义衰减（仅当用户填写时才写入）
    if (b.decaysDisplay && b.decaysDisplay.trim() !== '') {
      result.decays = b.decaysDisplay.split(',').map(v => parseFloat(v.trim()) || 1.0)
    }

    // 部位倍率加成（仅当用户填写且非全 0 时才写入）
    const partMultAdd = parsePartMultAdd(b.partMultAddDisplay)
    if (partMultAdd) {
      result.partMultAdd = partMultAdd
    }

    // ⭐ 分段射速（仅当用户填写时才写入）
    // 优先用 b.rofStages（如果 parse 过），否则从 display 重新解析
    let rofStages = b.rofStages
    if (rofStages === undefined || rofStages === null) {
      rofStages = parseRofStagesFromString(b.rofStagesDisplay || '')
    }
    if (rofStages && Array.isArray(rofStages) && rofStages.length > 0) {
      result.rofStages = rofStages
    }

    // 开火模式
    if (b.fireMode) {
      result.fireMode = b.fireMode
      if (b.fireMode === 'burst') {
        result.burstCount = b.burstCount || 3
        result.burstInternalROF = b.burstInternalROF || 800
        result.burstInterval = b.burstInterval || 0.1
      }
    }

    return result
  })

  // 标记武器已修改
  dataStore.markWeaponModified(props.weaponId)
  dataStore.refreshWeapons()

  emit('saved')
  emit('update:visible', false)
  alert('✅ 枪管已保存')
}

// ============================================================
// 关闭
// ============================================================

const close = () => {
  emit('update:visible', false)
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.modal-content {
  background: var(--color-bg-white);
  border-radius: var(--radius-xl);
  max-width: 95vw;
  max-height: 90vh;
  width: 1420px;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
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
}

.modal-close:hover {
  color: #333;
}

.modal-body {
  padding: 12px 16px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  display: flex;
  gap: var(--spacing-md);
  justify-content: flex-end;
  padding: 12px 20px;
  border-top: 1px solid var(--color-border-light);
  flex-shrink: 0;
}

.empty-state {
  text-align: center;
  padding: 40px 0;
  color: var(--color-text-muted);
  font-family: var(--font-family);
}

.empty-state .hint {
  font-size: var(--font-size-sm);
  color: #bbb;
  display: block;
  margin-top: 4px;
}

.table-scroll {
  overflow: auto;
  max-height: 500px;
}

/* ============ 表格 ============ */
.barrel-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  min-width: 1380px;
}

.barrel-table thead th {
  background: #f0f4f8;
  padding: 4px 4px;
  border: 1px solid #e0e0e0;
  text-align: center;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 10;
}

.barrel-table tbody td {
  padding: 2px 3px;
  border: 1px solid var(--color-border-light);
  text-align: center;
  vertical-align: middle;
}

/* ============ 输入框 ============ */
.cell-input {
  width: 100%;
  padding: 2px 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
  font-size: var(--font-size-xs);
  background: var(--color-bg-light);
  box-sizing: border-box;
  min-height: 22px;
  color: var(--color-text);
}

.cell-input:focus {
  border-color: var(--color-primary);
  outline: none;
  background: var(--color-bg-white);
}

.cell-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 部位倍率加成输入框 - 等宽字体 */
.part-mult-input {
  font-family: var(--font-mono);
  letter-spacing: -0.3px;
}

/* ⭐ 分段射速输入框 - 等宽字体 */
.rof-stages-input {
  font-family: var(--font-mono);
  letter-spacing: -0.3px;
}

.cell-select {
  padding: 2px 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
  font-size: var(--font-size-xs);
  background: var(--color-bg-light);
  max-width: 70px;
  cursor: pointer;
  color: var(--color-text);
}

.cell-select:focus {
  border-color: var(--color-primary);
  outline: none;
}

/* ============ 移动端适配 ============ */
@media (max-width: 768px) {
  .modal-content {
    width: 98vw;
    max-width: 98vw;
  }
  
  .barrel-table {
    min-width: 1200px;
    font-size: var(--font-size-xs);
  }
  
  .barrel-table thead th {
    font-size: 9px;
    padding: 3px 3px;
  }
  
  .barrel-table tbody td {
    padding: 1px 2px;
  }
  
  .cell-input,
  .cell-select {
    font-size: 10px;
    min-width: 30px;
    padding: 1px 2px;
  }
}
</style>