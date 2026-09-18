<!-- src/components/WeaponBaseEditor.vue -->
<template>
  <div v-if="visible" class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <!-- 头部 -->
      <div class="modal-header">
        <h3>
          ✏️ 编辑基础属性
          <span class="weapon-name-tag">{{ weaponName }}</span>
        </h3>
        <button class="modal-close" @click="close">&times;</button>
      </div>

      <!-- 主体 -->
      <div class="modal-body">
        <!-- 第 1 行：名称 / 类型 / 口径 / 扳机 -->
        <div class="edit-row row-4cols">
          <span class="label">名称</span>
          <input v-model="form.name" type="text" class="edit-input" placeholder="武器名称" />
          <span class="unit"></span>

          <span class="label">类型</span>
          <select v-model="form.type" class="edit-select">
            <option v-for="t in typeOptions" :key="t" :value="t">{{ t }}</option>
          </select>
          <span class="unit"></span>

          <span class="label">口径</span>
          <select v-model="form.allowedBullet" class="edit-select">
            <option v-for="cal in caliberOptions" :key="cal" :value="cal">{{ cal }}</option>
          </select>
          <span class="unit"></span>

          <span class="label">扳机</span>
          <input v-model.number="form.triggerDelay" type="number" class="edit-input num" step="1" min="0" />
          <span class="unit">ms</span>
        </div>

        <!-- 第 2 行：射速 / 初速 / 肉伤 / 甲伤 -->
        <div class="edit-row row-4cols">
          <span class="label">射速</span>
          <input v-model.number="form.rof" type="number" class="edit-input num" step="1" min="0" />
          <span class="unit">RPM</span>

          <span class="label">初速</span>
          <input v-model.number="form.velocity" type="number" class="edit-input num" step="1" min="0" />
          <span class="unit">m/s</span>

          <span class="label">肉伤</span>
          <input v-model.number="form.flesh" type="number" class="edit-input num" step="0.1" min="0" />
          <span class="unit"></span>

          <span class="label">甲伤</span>
          <input v-model.number="form.armor" type="number" class="edit-input num" step="0.1" min="0" />
          <span class="unit"></span>
        </div>

        <!-- 第 3 行：射程 / 衰减 -->
        <div class="edit-row row-2cols">
          <span class="label">射程</span>
          <input
            v-model="rangesDisplay"
            type="text"
            class="edit-input mono"
            placeholder="27, 54, ∞, ∞"
            @blur="onRangesBlur"
          />
          <span class="unit"></span>

          <span class="label">衰减</span>
          <input
            v-model="decaysDisplay"
            type="text"
            class="edit-input mono"
            placeholder="1.0, 0.9, 0.8, 0.8, 0.8"
            @blur="onDecaysBlur"
          />
          <span class="unit"></span>
        </div>

        <!-- 第 4 行：头 / 胸 / 腹 / 肢 -->
        <div class="edit-row row-parts">
          <span class="part-tag head">头</span>
          <input v-model.number="form.mult.head" type="number" class="edit-input mult" step="0.05" min="0" />
          <span class="unit"></span>

          <span class="part-tag chest">胸</span>
          <input v-model.number="form.mult.chest" type="number" class="edit-input mult" step="0.05" min="0" />
          <span class="unit"></span>

          <span class="part-tag stomach">腹</span>
          <input v-model.number="form.mult.stomach" type="number" class="edit-input mult" step="0.05" min="0" />
          <span class="unit"></span>

          <span class="part-tag limbs">肢</span>
          <input v-model.number="form.mult.limbs" type="number" class="edit-input mult" step="0.05" min="0" />
          <span class="unit"></span>
        </div>

        <!-- ⭐ 第 5 行：开火模式 / 连发数 / 内部射速 / 连发间隔 -->
        <div class="edit-row row-4cols">
          <span class="label">模式</span>
          <select v-model="form.fireMode" class="edit-select">
            <option value="">默认</option>
            <option value="auto">全自动</option>
            <option value="burst">连发</option>
          </select>
          <span class="unit"></span>

          <span class="label">连发数</span>
          <input
            v-model.number="form.burstCount"
            type="number"
            class="edit-input num"
            step="1" min="1"
            :disabled="!isBurstMode"
          />
          <span class="unit">发</span>

          <span class="label">内部射速</span>
          <input
            v-model.number="form.burstInternalROF"
            type="number"
            class="edit-input num"
            step="1" min="0"
            :disabled="!isBurstMode"
          />
          <span class="unit">RPM</span>

          <span class="label">连发间隔</span>
          <input
            v-model.number="form.burstInterval"
            type="number"
            class="edit-input num"
            step="0.01" min="0"
            :disabled="!isBurstMode"
          />
          <span class="unit">s</span>
        </div>
      </div>

      <!-- 底部 -->
      <div class="modal-footer">
        <button class="btn-cancel" @click="close">取消</button>
        <button class="btn-save" @click="save">💾 保存</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, inject } from 'vue'
import { dataStore } from '@/stores/stores'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  weaponId: {
    type: [Number, String],
    default: null
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

const emit = defineEmits(['update:visible', 'saved'])

// ⭐ 注入通用弹窗
const showAlert = inject('showAlert', null)

const typeOptions = ['步枪', '冲锋枪', '轻机枪', '精确射手步枪', '手枪']

// ---------- 表单状态 ----------
const form = ref({
  name: '',
  type: '步枪',
  allowedBullet: '',
  triggerDelay: 0,
  rof: 600,
  velocity: 500,
  flesh: 30,
  armor: 35,
  ranges: [40, 70, Infinity, Infinity],
  decays: [1, 0.9, 0.75, 0.75, 0.75],
  mult: { head: 1.9, chest: 1.0, stomach: 0.9, limbs: 0.4 },
  fireMode: '',
  burstCount: 3,
  burstInternalROF: 800,
  burstInterval: 0.1
})

// 射程/衰减的显示字符串
const rangesDisplay = ref('')
const decaysDisplay = ref('')

// ---------- 计算属性 ----------
const weaponName = computed(() => {
  const w = dataStore.getWeaponById(props.weaponId)
  return w?.name || '未知武器'
})

const isBurstMode = computed(() => form.value.fireMode === 'burst')

// ---------- 工具函数 ----------
const fmtRanges = (ranges) => {
  return (ranges || []).map(r => r === Infinity ? '∞' : r).join(', ')
}

const parseRanges = (str) => {
  return str.split(',').map(v => {
    const t = v.trim()
    if (t === '∞' || t === 'Infinity' || t === '') return Infinity
    const n = parseFloat(t)
    return isNaN(n) ? 0 : n
  })
}

const fmtDecays = (decays) => {
  return (decays || []).map(d => d.toFixed(2)).join(', ')
}

const parseDecays = (str) => {
  const arr = str.split(',').map(v => {
    const n = parseFloat(v.trim())
    return isNaN(n) ? 1.0 : n
  })
  while (arr.length < 5) arr.push(1.0)
  return arr.slice(0, 5)
}

// ---------- 加载武器数据 ----------
const loadWeapon = () => {
  if (!props.weaponId) return

  const weapon = dataStore.getWeaponById(props.weaponId)
  if (!weapon) {
    console.warn('⚠️ 未找到武器:', props.weaponId)
    return
  }

  form.value = {
    name: weapon.name || '',
    type: weapon.type || '步枪',
    allowedBullet: weapon.allowedBullet || '',
    triggerDelay: weapon.triggerDelay || 0,
    rof: weapon.rof || 600,
    velocity: weapon.velocity || 500,
    flesh: weapon.flesh || 30,
    armor: weapon.armor || 35,
    ranges: [...(weapon.ranges || [40, 70, Infinity, Infinity])],
    decays: [...(weapon.decays || [1, 0.9, 0.75, 0.75, 0.75])],
    mult: { ...(weapon.mult || { head: 1.9, chest: 1.0, stomach: 0.9, limbs: 0.4 }) },
    fireMode: weapon.fireMode || '',
    burstCount: weapon.burstCount ?? 3,
    burstInternalROF: weapon.burstInternalROF ?? 800,
    burstInterval: weapon.burstInterval ?? 0.1
  }

  rangesDisplay.value = fmtRanges(form.value.ranges)
  decaysDisplay.value = fmtDecays(form.value.decays)
}

// 打开时加载
watch(() => props.visible, (newVal) => {
  if (newVal) loadWeapon()
})

watch(() => props.weaponId, () => {
  if (props.visible) loadWeapon()
})

// ---------- 射程/衰减 blur 时解析 ----------
const onRangesBlur = () => {
  form.value.ranges = parseRanges(rangesDisplay.value)
  rangesDisplay.value = fmtRanges(form.value.ranges)
}

const onDecaysBlur = () => {
  form.value.decays = parseDecays(decaysDisplay.value)
  decaysDisplay.value = fmtDecays(form.value.decays)
}

// ---------- 保存（改用弹窗） ----------
const save = async () => {
  if (!props.weaponId) return

  if (!form.value.name || form.value.name.trim() === '') {
    if (showAlert) {
      await showAlert('⚠️ 请输入武器名称')
    } else {
      alert('⚠️ 请输入武器名称')
    }
    return
  }

  // 保证射程/衰减已解析
  onRangesBlur()
  onDecaysBlur()

  const fireMode = form.value.fireMode || null
  const isBurst = fireMode === 'burst'

  const dm = dataStore.getDataManager()
  const updates = {
    name: form.value.name.trim(),
    type: form.value.type,
    allowedBullet: form.value.allowedBullet,
    triggerDelay: form.value.triggerDelay,
    rof: form.value.rof,
    velocity: form.value.velocity,
    flesh: form.value.flesh,
    armor: form.value.armor,
    ranges: form.value.ranges,
    decays: form.value.decays,
    mult: form.value.mult,

    // ⭐ 连发字段
    fireMode,
    burstCount: isBurst ? form.value.burstCount : null,
    burstInternalROF: isBurst ? form.value.burstInternalROF : null,
    burstInterval: isBurst ? form.value.burstInterval : null
  }

  const ok = dm.updateWeapon(props.weaponId, updates)
  if (ok) {
    dataStore.refreshWeapons()
    dataStore.refreshPrices()
    dataStore.markWeaponModified(props.weaponId)
    console.log(`✅ 已保存武器基础属性: ${updates.name}`)
    emit('saved')
    emit('update:visible', false)
  } else {
    if (showAlert) {
      await showAlert('保存失败，请检查控制台')
    } else {
      alert('保存失败，请检查控制台')
    }
  }
}

// ---------- 关闭 ----------
const close = () => {
  emit('update:visible', false)
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.modal-content {
  background: #fff;
  border-radius: 8px;
  width: 880px;
  max-width: 95vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: modalSlideIn 0.2s ease;
}

@keyframes modalSlideIn {
  from { opacity: 0; transform: translateY(-20px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ---------- 头部 ---------- */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-border-light);
  flex-shrink: 0;
}
.modal-header h3 {
  font-family: var(--font-family);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}
.weapon-name-tag {
  font-size: 11px;
  color: var(--color-primary);
  background: #eef2ff;
  padding: 1px 8px;
  border-radius: 8px;
  margin-left: 6px;
  font-family: var(--font-mono);
}
.modal-close {
  background: none;
  border: none;
  font-size: 20px;
  line-height: 1;
  color: #999;
  cursor: pointer;
  padding: 0 4px;
  transition: color 0.15s;
}
.modal-close:hover { color: #333; }

/* ---------- 主体 ---------- */
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 16px;
}
.modal-body::-webkit-scrollbar { width: 5px; }
.modal-body::-webkit-scrollbar-thumb {
  background: #ddd;
  border-radius: 3px;
}

/* ============================================================
   5 行布局（Grid 严格对齐）
   ============================================================ */
.edit-row {
  display: grid;
  align-items: center;
  margin-bottom: 6px;
  column-gap: 6px;
}
.edit-row:last-child {
  margin-bottom: 0;
}

/* 4 列（第 1、2、5 行） */
.edit-row.row-4cols {
  grid-template-columns:
    42px minmax(0, 1fr) 38px
    42px minmax(0, 1fr) 38px
    42px minmax(0, 1fr) 38px
    42px minmax(0, 1fr) 38px;
}

/* 2 列（第 3 行） */
.edit-row.row-2cols {
  grid-template-columns:
    42px minmax(0, 1fr) 38px
    42px minmax(0, 1fr) 38px;
}

/* 4 列部位（第 4 行） */
.edit-row.row-parts {
  grid-template-columns:
    42px minmax(0, 1fr) 38px
    42px minmax(0, 1fr) 38px
    42px minmax(0, 1fr) 38px
    42px minmax(0, 1fr) 38px;
}

/* 标签 */
.label {
  font-family: var(--font-family);
  font-size: 11px;
  color: #666;
  text-align: right;
  white-space: nowrap;
}

/* 单位 */
.unit {
  font-family: var(--font-family);
  font-size: 10px;
  color: #999;
  white-space: nowrap;
  text-align: left;
}

/* 输入框 / 下拉框 */
.edit-input,
.edit-select {
  width: 100%;
  min-width: 0;
  padding: 3px 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-family: var(--font-family);
  font-size: 12px;
  background: #fafbfd;
  color: var(--color-text);
  outline: none;
  transition: all 0.15s;
  height: 26px;
  text-align: left;
}
.edit-input:focus,
.edit-select:focus {
  background: #fff;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(74,108,247,0.12);
}
.edit-input:hover,
.edit-select:hover {
  border-color: #b0b8c8;
}
.edit-input.num {
  text-align: left;
}
.edit-input.mono {
  font-family: var(--font-mono);
  font-size: 11px;
  text-align: left;
}
.edit-input.mult {
  text-align: left;
  font-family: var(--font-mono);
  font-size: 12px;
}

/* ⭐ 禁用状态 */
.edit-input:disabled,
.edit-select:disabled {
  background: #f5f5f5;
  color: #bbb;
  cursor: not-allowed;
  border-color: #e0e0e0;
}
.edit-input:disabled:hover,
.edit-select:disabled:hover {
  border-color: #e0e0e0;
}

/* 部位倍率的彩色标签 */
.part-tag {
  font-family: var(--font-family);
  font-size: 10px;
  font-weight: 600;
  padding: 2px 0;
  border-radius: 3px;
  text-align: center;
  line-height: 1.6;
  width: 100%;
  box-sizing: border-box;
  display: inline-block;
}
.part-tag.head    { background: #fdecea; color: #f44336; }
.part-tag.chest   { background: #eef2ff; color: #4a6cf7; }
.part-tag.stomach { background: #fff3e0; color: #ff9800; }
.part-tag.limbs   { background: #f5f5f5; color: #9e9e9e; }

/* ---------- 底部 ---------- */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 16px;
  border-top: 1px solid var(--color-border-light);
  flex-shrink: 0;
}
.modal-footer button {
  padding: 4px 16px;
  border: none;
  border-radius: 4px;
  font-family: var(--font-family);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  height: 28px;
}
.btn-cancel {
  background: #f0f0f0;
  color: #666;
}
.btn-cancel:hover { background: #e0e0e0; }
.btn-save {
  background: var(--color-primary);
  color: #fff;
}
.btn-save:hover { background: var(--color-primary-hover); }

/* ---------- 窄屏适配 ---------- */
@media (max-width: 900px) {
  .modal-content {
    width: 95vw;
  }

  .edit-row.row-4cols,
  .edit-row.row-2cols,
  .edit-row.row-parts {
    grid-template-columns:
      42px minmax(0, 1fr) 38px
      42px minmax(0, 1fr) 38px;
  }

  .edit-row.row-4cols > *:nth-child(n+7),
  .edit-row.row-parts > *:nth-child(n+7) {
    grid-row: 2;
  }
}
</style>