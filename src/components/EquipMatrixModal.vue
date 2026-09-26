<!-- src/components/EquipMatrixModal.vue -->
<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="equip-matrix-overlay"
      @click.self="onCancel"
    >
      <div class="equip-matrix-modal">

        <!-- ============================================================ -->
        <!-- 头部 -->
        <!-- ============================================================ -->
        <div class="matrix-header">
          <h3 class="matrix-title">
            ⚙️ {{ isCalcMode ? '选择计算装备' : '选择评分参考' }}
          </h3>

          <span class="matrix-count">
            已选 <strong>{{ selectedCount }}</strong> / {{ totalCount }} 组
          </span>

          <!-- 全选（单套模式禁用） -->
          <button
            class="toolbar-btn toolbar-btn-select"
            :disabled="isCalcMode || selectedCount === totalCount"
            @click="selectAll"
          >
            ✅ 全选
          </button>

          <!-- 清空（始终可用，但已空时禁用） -->
          <button
            class="toolbar-btn toolbar-btn-clear"
            :disabled="selectedCount === 0"
            @click="clearAll"
          >
            ❌ 清空
          </button>

          <span class="toolbar-hint">{{ hintText }}</span>

          <button class="matrix-close" @click="onCancel">&times;</button>
        </div>

        <!-- ============================================================ -->
        <!-- 矩阵主体 -->
        <!-- ============================================================ -->
        <div class="matrix-body">
          <div v-if="armors.length === 0 || helmets.length === 0" class="matrix-empty">
            <div class="empty-icon">📭</div>
            <div>暂无启用的护甲或头盔</div>
            <div class="empty-hint">请先在「弹甲数据」页启用护甲和头盔</div>
          </div>

          <div v-else class="matrix-scroll">
            <div class="matrix-relative" ref="relativeRef">

              <table class="matrix-table">
                <thead>
                  <tr>
                    <th class="corner-cell">
                      <div class="corner-label">
                        <span class="corner-x">头盔 →</span>
                        <span class="corner-y">护甲 ↓</span>
                      </div>
                    </th>

                    <th
                      v-for="helmet in helmets"
                      :key="helmet.id"
                      class="helmet-head"
                      :class="'lv' + helmet.level"
                      :title="`${helmet.name} Lv.${helmet.level}（${helmet.value}）`"
                    >
                      <div class="head-name">{{ helmet.name }}</div>
                      <div class="head-meta">Lv.{{ helmet.level }} · {{ helmet.value }}</div>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  <tr
                    v-for="(armor, ai) in armors"
                    :key="armor.id"
                  >
                    <th
                      class="armor-head"
                      :class="'lv' + armor.level"
                      :title="`${armor.name} Lv.${armor.level}（${armor.value}）`"
                    >
                      <div class="head-name">{{ armor.name }}</div>
                      <div class="head-meta">Lv.{{ armor.level }} · {{ armor.value }}</div>
                    </th>

                    <td
                      v-for="(helmet, hi) in helmets"
                      :key="helmet.id"
                      :ref="el => setCellRef(el, ai, hi)"
                      class="matrix-cell"
                      :class="{
                        'is-selected': isSelected(armor, helmet),
                        'is-in-drag': isCellInDrag(ai, hi),
                      }"
                      :title="getCellTitle(armor, helmet)"
                      @mousedown="onCellMouseDown($event, ai, hi)"
                      @click="onCellClick($event, armor, helmet)"
                    >
                      <div class="cell-inner">
                        <span v-if="isSelected(armor, helmet)" class="cell-check">✓</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div
                v-if="dragBox"
                class="drag-box"
                :style="{
                  left: dragBox.x + 'px',
                  top: dragBox.y + 'px',
                  width: dragBox.w + 'px',
                  height: dragBox.h + 'px',
                }"
              ></div>

            </div>
          </div>
        </div>

        <!-- ============================================================ -->
        <!-- 底部 -->
        <!-- ============================================================ -->
        <div class="matrix-footer">
          <div class="footer-summary">
            <template v-if="selectedCount === 0">
              <span class="summary-empty">未选择任何装备</span>
            </template>
            <template v-else>
              <span class="summary-text">
                已选 <strong>{{ selectedCount }}</strong> 组装备{{ isCalcMode ? '（计算装备只能选 1 套）' : '' }}
              </span>
            </template>
          </div>

          <div class="footer-actions">
            <button class="footer-btn cancel" @click="onCancel">取消</button>
            <button
              class="footer-btn confirm"
              :disabled="selectedCount === 0"
              @click="onConfirm"
            >
              确认
            </button>
          </div>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { dataStore, equipStore } from '@/stores/stores'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  /**
   * ⭐ v7：模式
   * - 'calc'  计算装备（单套，用于 TTK 相关）
   * - 'score' 评分参考（多套，用于综合评分）
   *
   * 默认 'calc'
   */
  mode: {
    type: String,
    default: 'calc',
    validator: (v) => ['calc', 'score'].includes(v),
  },
})

const emit = defineEmits(['update:visible', 'confirm', 'cancel'])

// ============================================================
// 模式判断
// ============================================================
const isCalcMode = computed(() => props.mode === 'calc')
const isScoreMode = computed(() => props.mode === 'score')

// ============================================================
// 数据源
// ============================================================
const armors = computed(() => {
  const list = dataStore.state.armors || []
  return list.filter(a => a.type === 'armor' && a.enabled !== false)
})

const helmets = computed(() => {
  const list = dataStore.state.armors || []
  return list.filter(a => a.type === 'helmet' && a.enabled !== false)
})

const totalCount = computed(() => armors.value.length * helmets.value.length)

// ============================================================
// 选中状态
// ============================================================
const selectedSet = ref(new Set())
const selectedCount = computed(() => selectedSet.value.size)

const makeKey = (armor, helmet) => `${armor.id}|${helmet.id}`

const isSelected = (armor, helmet) => {
  return selectedSet.value.has(makeKey(armor, helmet))
}

const getCellTitle = (armor, helmet) => {
  const selected = isSelected(armor, helmet)
  return [
    selected ? '✓ 已选' : '未选',
    `${armor.name} Lv.${armor.level}（${armor.value}）`,
    `${helmet.name} Lv.${helmet.level}（${helmet.value}）`,
  ].join('\n')
}

// ============================================================
// 提示文案
// ============================================================
const hintText = computed(() => {
  if (isCalcMode.value) {
    return '点击格子选中（只能选 1 套）'
  }
  return '点击格子勾选 / 取消（可拖拽框选）'
})

// ============================================================
// 拖拽框选（仅 score 模式）
// ============================================================

const relativeRef = ref(null)
const cellRefs = ref({})

const setCellRef = (el, ai, hi) => {
  const key = `${ai}-${hi}`
  if (!el) {
    delete cellRefs.value[key]
  } else {
    cellRefs.value[key] = el
  }
}

const dragActive = ref(false)
const dragMoved = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const dragCur = ref({ x: 0, y: 0 })

const DRAG_THRESHOLD = 4

const dragBox = computed(() => {
  if (!dragActive.value || !dragMoved.value) return null
  const x1 = Math.min(dragStart.value.x, dragCur.value.x)
  const y1 = Math.min(dragStart.value.y, dragCur.value.y)
  const x2 = Math.max(dragStart.value.x, dragCur.value.x)
  const y2 = Math.max(dragStart.value.y, dragCur.value.y)
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
})

const cellsInDrag = ref(new Set())

const isCellInDrag = (ai, hi) => {
  if (!dragActive.value || !dragMoved.value) return false
  return cellsInDrag.value.has(`${ai}-${hi}`)
}

const recomputeCellsInDrag = () => {
  if (!relativeRef.value) return
  const box = dragBox.value
  if (!box) {
    cellsInDrag.value = new Set()
    return
  }

  const containerRect = relativeRef.value.getBoundingClientRect()

  const dragRect = {
    left: containerRect.left + box.x,
    top: containerRect.top + box.y,
    right: containerRect.left + box.x + box.w,
    bottom: containerRect.top + box.y + box.h,
  }

  const next = new Set()
  for (const key in cellRefs.value) {
    const el = cellRefs.value[key]
    if (!el) continue
    const r = el.getBoundingClientRect()
    const intersects = !(
      r.right < dragRect.left ||
      r.left > dragRect.right ||
      r.bottom < dragRect.top ||
      r.top > dragRect.bottom
    )
    if (intersects) next.add(key)
  }
  cellsInDrag.value = next
}

const onCellMouseDown = (e, ai, hi) => {
  if (e.button !== 0) return

  // ⭐ 单套模式不支持拖拽框选
  if (isCalcMode.value) return

  e.preventDefault()

  if (!relativeRef.value) return
  const containerRect = relativeRef.value.getBoundingClientRect()

  dragStart.value = {
    x: e.clientX - containerRect.left,
    y: e.clientY - containerRect.top,
  }
  dragCur.value = { ...dragStart.value }
  dragActive.value = true
  dragMoved.value = false
  cellsInDrag.value = new Set()

  window.addEventListener('mousemove', onWindowMouseMove)
  window.addEventListener('mouseup', onWindowMouseUp)
}

const onWindowMouseMove = (e) => {
  if (!dragActive.value) return
  if (!relativeRef.value) return

  const containerRect = relativeRef.value.getBoundingClientRect()

  dragCur.value = {
    x: e.clientX - containerRect.left,
    y: e.clientY - containerRect.top,
  }

  const dx = Math.abs(dragCur.value.x - dragStart.value.x)
  const dy = Math.abs(dragCur.value.y - dragStart.value.y)
  if (!dragMoved.value && (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD)) {
    dragMoved.value = true
  }

  if (dragMoved.value) {
    recomputeCellsInDrag()
  }
}

const onWindowMouseUp = () => {
  if (!dragActive.value) return

  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('mouseup', onWindowMouseUp)

  if (dragMoved.value) {
    applyDragToggle()
  }

  dragActive.value = false
  dragMoved.value = false
  cellsInDrag.value = new Set()
}

/**
 * 应用框选切换（仅 score 模式）
 */
const applyDragToggle = () => {
  if (isCalcMode.value) return

  const next = new Set(selectedSet.value)

  const armorsList = armors.value
  const helmetsList = helmets.value

  for (const posKey of cellsInDrag.value) {
    const [aiStr, hiStr] = posKey.split('-')
    const ai = parseInt(aiStr, 10)
    const hi = parseInt(hiStr, 10)

    const armor = armorsList[ai]
    const helmet = helmetsList[hi]
    if (!armor || !helmet) continue

    const selKey = makeKey(armor, helmet)
    if (next.has(selKey)) next.delete(selKey)
    else next.add(selKey)
  }

  selectedSet.value = next

  _justDragged = true
  setTimeout(() => { _justDragged = false }, 0)
}

let _justDragged = false

// ============================================================
// 点击切换
//
// ⭐ v7 差异：
//   - calc 模式：替换（只保留当前点击的）
//   - score 模式：切换（追加/取消）
// ============================================================
const toggleCell = (armor, helmet) => {
  const key = makeKey(armor, helmet)

  if (isCalcMode.value) {
    // 单套：替换
    selectedSet.value = new Set([key])
    return
  }

  // 多套：切换
  const next = new Set(selectedSet.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selectedSet.value = next
}

const onCellClick = (e, armor, helmet) => {
  if (_justDragged) {
    e.stopPropagation()
    return
  }
  toggleCell(armor, helmet)
}

// ============================================================
// 全选 / 清空
// ============================================================
const selectAll = () => {
  // 单套模式不支持全选
  if (isCalcMode.value) return

  const set = new Set()
  for (const armor of armors.value) {
    for (const helmet of helmets.value) {
      set.add(makeKey(armor, helmet))
    }
  }
  selectedSet.value = set
}

const clearAll = () => {
  selectedSet.value = new Set()
}

// ============================================================
// 打开时：从 equipStore 初始化
// ============================================================
watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      const set = new Set()

      if (isCalcMode.value) {
        // 单套：从 calcEquip 读
        const eq = equipStore.state.calcEquip
        if (eq && eq.armorId && eq.helmetId) {
          set.add(`${eq.armorId}|${eq.helmetId}`)
        }
      } else {
        // 多套：从 scoreEquips 读
        const list = equipStore.state.scoreEquips || []
        for (const eq of list) {
          if (eq.armorId && eq.helmetId) {
            set.add(`${eq.armorId}|${eq.helmetId}`)
          }
        }
      }

      selectedSet.value = set

      dragActive.value = false
      dragMoved.value = false
      cellsInDrag.value = new Set()
    } else {
      window.removeEventListener('mousemove', onWindowMouseMove)
      window.removeEventListener('mouseup', onWindowMouseUp)
    }
  },
  { immediate: true }
)

// ⭐ 模式变化时（弹窗打开状态下），重新初始化
watch(
  () => props.mode,
  () => {
    if (props.visible) {
      const set = new Set()

      if (isCalcMode.value) {
        const eq = equipStore.state.calcEquip
        if (eq && eq.armorId && eq.helmetId) {
          set.add(`${eq.armorId}|${eq.helmetId}`)
        }
      } else {
        const list = equipStore.state.scoreEquips || []
        for (const eq of list) {
          if (eq.armorId && eq.helmetId) {
            set.add(`${eq.armorId}|${eq.helmetId}`)
          }
        }
      }

      selectedSet.value = set
    }
  }
)

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('mouseup', onWindowMouseUp)
})

// ============================================================
// 组装 equip
// ============================================================
const buildEquip = (armor, helmet) => ({
  armorId: armor.id,
  helmetId: helmet.id,
  armorName: armor.name,
  helmetName: helmet.name,
  armorLevel: armor.level,
  armorValue: armor.value,
  helmetLevel: helmet.level,
  helmetValue: helmet.value,
})

const buildSelectedEquips = () => {
  const result = []
  for (const armor of armors.value) {
    for (const helmet of helmets.value) {
      if (selectedSet.value.has(makeKey(armor, helmet))) {
        result.push(buildEquip(armor, helmet))
      }
    }
  }
  result.sort((a, b) => {
    if (b.armorLevel !== a.armorLevel) return b.armorLevel - a.armorLevel
    if (b.helmetLevel !== a.helmetLevel) return b.helmetLevel - a.helmetLevel
    return b.armorValue - a.armorValue
  })
  return result
}

// ============================================================
// 事件
// ============================================================
const onCancel = () => {
  emit('cancel')
  emit('update:visible', false)
}

const onConfirm = () => {
  const equips = buildSelectedEquips()
  if (equips.length === 0) return

  // ⭐ 根据模式，回传不同结构
  if (isCalcMode.value) {
    // 单套：只回传第一个（保险）
    emit('confirm', [equips[0]])
  } else {
    emit('confirm', equips)
  }

  emit('update:visible', false)
}
</script>

<style scoped>
/* ============================================================
   遮罩
   ============================================================ */
.equip-matrix-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100000;
  animation: matrix-fade-in 0.15s ease;
}

@keyframes matrix-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* ============================================================
   弹窗容器
   ============================================================ */
.equip-matrix-modal {
  background: #fff;
  border-radius: 10px;
  width: 960px;
  max-width: 96vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
  animation: matrix-slide-in 0.18s ease;
}

@keyframes matrix-slide-in {
  from { opacity: 0; transform: translateY(-12px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* ============================================================
   头部
   ============================================================ */
.matrix-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--color-border-light, #e8e8e8);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.matrix-title {
  font-family: var(--font-family);
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, #1a1a2e);
  white-space: nowrap;
  flex-shrink: 0;
}

.matrix-count {
  font-size: 12px;
  font-weight: 400;
  color: #888;
  white-space: nowrap;
  flex-shrink: 0;
}

.matrix-count strong {
  color: var(--color-primary, #4a6cf7);
  font-family: var(--font-mono);
  font-size: 14px;
}

.toolbar-btn {
  height: 26px;
  padding: 0 12px;
  border: none;
  border-radius: 5px;
  font-family: var(--font-family);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}

.toolbar-btn-select {
  background: #e8f5e9;
  color: #2e7d32;
  border: 1px solid #a5d6a7;
}

.toolbar-btn-select:hover:not(:disabled) {
  background: #d4ead6;
  border-color: #81c784;
}

.toolbar-btn-clear {
  background: #ffebee;
  color: #c62828;
  border: 1px solid #ffcdd2;
}

.toolbar-btn-clear:hover:not(:disabled) {
  background: #ffcdd2;
  border-color: #ef9a9a;
}

.toolbar-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.toolbar-hint {
  font-size: 11px;
  color: #999;
  white-space: nowrap;
  flex-shrink: 0;
  margin-left: 4px;
}

.matrix-close {
  margin-left: auto;
  background: none;
  border: none;
  font-size: 22px;
  line-height: 1;
  color: #999;
  cursor: pointer;
  padding: 0 4px;
  transition: color 0.15s;
  flex-shrink: 0;
}

.matrix-close:hover { color: #333; }

/* ============================================================
   矩阵主体
   ============================================================ */
.matrix-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.matrix-empty {
  text-align: center;
  padding: 40px 20px;
  color: #999;
  font-size: 13px;
}

.matrix-empty .empty-icon {
  font-size: 40px;
  margin-bottom: 8px;
  opacity: 0.5;
}

.matrix-empty .empty-hint {
  font-size: 11px;
  color: #bbb;
  margin-top: 4px;
}

.matrix-scroll {
  overflow: auto;
  padding: 8px 14px 12px;
  flex: 1;
  min-height: 0;
}

.matrix-scroll::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.matrix-scroll::-webkit-scrollbar-track {
  background: #f5f5f5;
  border-radius: 3px;
}

.matrix-scroll::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 3px;
}

.matrix-scroll::-webkit-scrollbar-thumb:hover {
  background: #aaa;
}

.matrix-relative {
  position: relative;
  display: inline-block;
  min-width: 100%;
}

/* ============================================================
   矩阵表格
   ============================================================ */
.matrix-table {
  border-collapse: separate;
  border-spacing: 2px;
  font-family: var(--font-family);
  font-size: 12px;
  min-width: 100%;
  user-select: none;
}

.corner-cell {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 20;
  background: #f0f4f8;
  border-radius: 5px;
  padding: 4px 8px;
  min-width: 140px;
  width: 140px;
  vertical-align: middle;
  text-align: center;
}

.corner-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
  color: #888;
  font-weight: 500;
  line-height: 1.3;
}

.corner-y { color: #e65100; font-weight: 600; }
.corner-x { color: var(--color-primary, #4a6cf7); font-weight: 600; }

.helmet-head {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 4px 4px;
  border-radius: 5px;
  min-width: 64px;
  text-align: center;
  vertical-align: middle;
  background: #f0f4f8;
  cursor: default;
  user-select: none;
}

.helmet-head .head-name {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 64px;
  margin-bottom: 1px;
}

.helmet-head .head-meta {
  font-size: 10px;
  color: #888;
  font-family: var(--font-mono);
}

.armor-head {
  position: sticky;
  left: 0;
  z-index: 10;
  padding: 4px 8px;
  border-radius: 5px;
  min-width: 140px;
  width: 140px;
  text-align: left;
  vertical-align: middle;
  background: #f0f4f8;
  cursor: default;
  user-select: none;
}

.armor-head .head-name {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 130px;
  margin-bottom: 1px;
}

.armor-head .head-meta {
  font-size: 10px;
  color: #888;
  font-family: var(--font-mono);
}

.helmet-head.lv1, .armor-head.lv1 { border-left: 3px solid #e0e0e0; }
.helmet-head.lv2, .armor-head.lv2 { border-left: 3px solid #4caf50; }
.helmet-head.lv3, .armor-head.lv3 { border-left: 3px solid #2196f3; }
.helmet-head.lv4, .armor-head.lv4 { border-left: 3px solid #9c27b0; }
.helmet-head.lv5, .armor-head.lv5 { border-left: 3px solid #ff9800; }
.helmet-head.lv6, .armor-head.lv6 { border-left: 3px solid #f44336; }

/* ============================================================
   矩阵格子
   ============================================================ */
.matrix-cell {
  padding: 0;
  min-width: 64px;
  width: 64px;
  height: 32px;
  cursor: pointer;
  border-radius: 5px;
  background: #fafbfd;
  border: 1px solid #e8ecf2;
  transition: background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
  user-select: none;
  position: relative;
}

.matrix-cell:hover {
  background: #eef2ff;
  border-color: #c5d0ff;
}

.matrix-cell.is-selected {
  background: var(--color-primary, #4a6cf7);
  border-color: var(--color-primary, #4a6cf7);
  box-shadow: 0 2px 5px rgba(74, 108, 247, 0.3);
}

.matrix-cell.is-selected:hover {
  background: var(--color-primary-hover, #3a5cd7);
  border-color: var(--color-primary-hover, #3a5cd7);
}

.matrix-cell.is-in-drag {
  outline: 2px dashed #ff9800;
  outline-offset: -2px;
  background: #fff3e0;
}

.matrix-cell.is-in-drag.is-selected {
  background: #ffb74d;
  border-color: #ff9800;
}

.cell-inner {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cell-check {
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
}

/* ============================================================
   拖拽虚线框
   ============================================================ */
.drag-box {
  position: absolute;
  pointer-events: none;
  border: 2px dashed var(--color-primary, #4a6cf7);
  background: rgba(74, 108, 247, 0.08);
  border-radius: 4px;
  z-index: 30;
  box-shadow: 0 0 8px rgba(74, 108, 247, 0.25);
}

/* ============================================================
   底部
   ============================================================ */
.matrix-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  border-top: 1px solid var(--color-border-light, #e8e8e8);
  background: #fafbfd;
  flex-shrink: 0;
}

.footer-summary {
  font-size: 12px;
  color: #666;
}

.summary-empty { color: #bbb; }

.summary-text strong {
  color: var(--color-primary, #4a6cf7);
  font-family: var(--font-mono);
  font-size: 14px;
}

.footer-actions {
  display: flex;
  gap: 8px;
}

.footer-btn {
  height: 28px;
  padding: 0 18px;
  border: none;
  border-radius: 5px;
  font-family: var(--font-family);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  user-select: none;
}

.footer-btn.cancel {
  background: #f0f0f0;
  color: #666;
}

.footer-btn.cancel:hover {
  background: #e0e0e0;
  color: #333;
}

.footer-btn.confirm {
  background: var(--color-primary, #4a6cf7);
  color: #fff;
}

.footer-btn.confirm:hover:not(:disabled) {
  background: var(--color-primary-hover, #3a5cd7);
}

.footer-btn.confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.footer-btn:active:not(:disabled) {
  transform: translateY(1px);
}

/* ============================================================
   移动端适配
   ============================================================ */
@media (max-width: 768px) {
  .equip-matrix-modal {
    width: 98vw;
    max-width: 98vw;
    max-height: 95vh;
  }

  .matrix-header {
    padding: 8px 12px;
    gap: 6px;
  }

  .matrix-title { font-size: 14px; }
  .matrix-count { font-size: 11px; }

  .toolbar-btn {
    padding: 0 10px;
    font-size: 11px;
    height: 26px;
  }

  .toolbar-hint {
    display: none;
  }

  .matrix-scroll { padding: 6px 10px 10px; }

  .matrix-table {
    border-spacing: 2px;
    font-size: 11px;
  }

  .corner-cell {
    min-width: 100px;
    width: 100px;
    padding: 4px 6px;
  }

  .armor-head {
    min-width: 100px;
    width: 100px;
    padding: 4px 6px;
  }

  .armor-head .head-name {
    font-size: 11px;
    max-width: 92px;
  }

  .helmet-head {
    min-width: 50px;
    padding: 3px 2px;
  }

  .helmet-head .head-name {
    font-size: 11px;
    max-width: 50px;
  }

  .matrix-cell {
    min-width: 50px;
    width: 50px;
    height: 30px;
  }

  .cell-check { font-size: 16px; }

  .matrix-footer {
    padding: 8px 12px;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .footer-summary {
    text-align: center;
    font-size: 11px;
  }

  .footer-actions { width: 100%; }

  .footer-btn {
    flex: 1;
    height: 34px;
    padding: 0 12px;
    font-size: 13px;
  }
}

@media (orientation: landscape) and (max-height: 500px) {
  .equip-matrix-modal { max-height: 96vh; }
  .matrix-header { padding: 6px 12px; }
  .matrix-cell { height: 28px; }
  .matrix-footer { padding: 6px 12px; }
}
</style>