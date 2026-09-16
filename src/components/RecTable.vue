<!-- src/components/RecTable.vue -->
<template>
  <div class="topn-table-wrapper">
    <!-- 空状态 -->
    <div v-if="!recs || recs.length === 0" class="empty-state">
      <div class="icon">📊</div>
      <div>暂无第 4~10 名方案</div>
    </div>

    <!-- 表格 -->
    <table v-else class="topn-table">
      <thead>
        <tr>
          <th class="col-rank">排名</th>
          <th class="col-weapon">武器配置</th>
          <th class="col-bullet">子弹</th>
          <th class="col-armor">护甲</th>
          <th class="col-helmet">头盔</th>
          <th class="col-num">进攻TTK</th>
          <th class="col-num">生存TTK</th>
          <th class="col-num">对敌比值</th>
          <th class="col-num">单局消耗</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(rec, idx) in recs" :key="rec.rank || idx">
          <!-- 排名 -->
          <td class="rank-cell">
            <span class="rank-badge">{{ rec.rank }}</span>
          </td>

          <!-- 武器配置 -->
          <td class="weapon-cell" :title="weaponLabel(rec)">
            {{ weaponLabel(rec) }}
          </td>

          <!-- 子弹 -->
          <td class="bullet-cell" :title="bulletLabel(rec)">
            {{ bulletLabel(rec) }}
          </td>

          <!-- 护甲 -->
          <td class="armor-cell" :title="armorLabel(rec)">
            {{ armorLabel(rec) }}
          </td>

          <!-- 头盔 -->
          <td class="armor-cell" :title="helmetLabel(rec)">
            {{ helmetLabel(rec) }}
          </td>

          <!-- 进攻 TTK -->
          <td class="num-cell ttk-attack">
            {{ formatTTK(primaryAttackTTK(rec)) }} ms
          </td>

          <!-- 生存 TTK -->
          <td class="num-cell ttk-defense">
            {{ formatTTK(primaryDefenseTTK(rec)) }} ms
          </td>

          <!-- 对敌比值 -->
          <td
            class="num-cell ratio"
            :class="ratioClass(rec.ratio)"
            :title="ratioTooltip(rec)"
          >
            {{ formatRatio(rec.ratio) }}
          </td>

          <!-- 单局消耗 -->
          <td
            class="num-cell cost"
            :class="costClass(rec.cost?.totalW)"
          >
            {{ formatCost(rec.cost?.totalW) }} W
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
const props = defineProps({
  /**
   * 推荐结果数组（来自 RecEngine 的 recommendations.rest）
   * 结构：
   * [
   *   {
   *     rank: number,
   *     gear: {
   *       weapon: { id, configId, name, price },
   *       bullet: { id, name, level, price, avgShots, carryCount },
   *       armor: { name, level, value, price },
   *       helmet: { name, level, value, price }
   *     },
   *     perEnemy: [{ name, attackTTK, defenseTTK, ratio }],
   *     ratio: number,
   *     cost: { ..., totalW }
   *   },
   *   ...
   * ]
   */
  recs: {
    type: Array,
    default: () => []
  }
})

// ============================================================
// 装备文案
// ============================================================

const weaponLabel = (rec) => {
  const w = rec?.gear?.weapon
  if (!w) return '-'
  const cfg = w.configId || ''
  return `${w.name} ${cfg}`.trim()
}

const bulletLabel = (rec) => {
  const b = rec?.gear?.bullet
  if (!b) return '-'
  const parts = []
  if (b.name) parts.push(b.name)
  if (b.level !== undefined && b.level !== null) parts.push(`Lv.${b.level}`)
  return parts.join(' ') || '-'
}

const armorLabel = (rec) => {
  const a = rec?.gear?.armor
  if (!a) return '-'
  return `${a.name} Lv.${a.level}`
}

const helmetLabel = (rec) => {
  const h = rec?.gear?.helmet
  if (!h) return '-'
  return `${h.name} Lv.${h.level}`
}

// ============================================================
// TTK / 比值 / 成本
// ============================================================

/** 取第一个敌人的进攻 TTK */
const primaryAttackTTK = (rec) => {
  const arr = rec?.perEnemy
  if (!arr || arr.length === 0) return 0
  return arr[0].attackTTK || 0
}

/** 取第一个敌人的生存 TTK */
const primaryDefenseTTK = (rec) => {
  const arr = rec?.perEnemy
  if (!arr || arr.length === 0) return 0
  return arr[0].defenseTTK || 0
}

/** 多敌人时的 tooltip（显示每个敌人的比值） */
const ratioTooltip = (rec) => {
  const arr = rec?.perEnemy
  if (!arr || arr.length === 0) return ''
  if (arr.length === 1) return ''
  return arr.map(e => `${e.name}: ${formatRatio(e.ratio)}`).join('\n')
}

// ============================================================
// 格式化
// ============================================================

const formatTTK = (v) => {
  if (v === undefined || v === null || !isFinite(v)) return '-'
  return Math.round(v)
}

const formatRatio = (v) => {
  if (v === undefined || v === null || !isFinite(v)) return '-'
  return v.toFixed(2)
}

const formatCost = (v) => {
  if (v === undefined || v === null || !isFinite(v)) return '-'
  return v.toFixed(1)
}

// ============================================================
// 颜色分档
// ============================================================

/**
 * 比值颜色：
 *   >= 1.0  绿色（有优势）
 *   0.9~1.0 橙色（接近）
 *   < 0.9   红色（劣势）
 */
const ratioClass = (v) => {
  if (v === undefined || v === null || !isFinite(v)) return ''
  if (v >= 1.0) return 'ratio-good'
  if (v >= 0.9) return 'ratio-warn'
  return 'ratio-bad'
}

/**
 * 成本颜色：
 *   <= 30W  绿色
 *   <= 60W  橙色
 *   > 60W   红色
 */
const costClass = (totalW) => {
  if (totalW === undefined || totalW === null || !isFinite(totalW)) return ''
  if (totalW <= 30) return 'cost-good'
  if (totalW <= 60) return 'cost-warn'
  return 'cost-bad'
}
</script>

<style scoped>
/* ============================================================
   容器（复用 damage-detail-demo.html 的样式）
   ============================================================ */

.topn-table-wrapper {
  background: #fff;
  border-radius: 8px;
  padding: 14px 18px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  border: 1px solid #ddd;
  overflow-x: auto;
}

.topn-table-wrapper::-webkit-scrollbar {
  height: 6px;
}

.topn-table-wrapper::-webkit-scrollbar-track {
  background: #f5f5f5;
  border-radius: 3px;
}

.topn-table-wrapper::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 3px;
}

.topn-table-wrapper::-webkit-scrollbar-thumb:hover {
  background: #aaa;
}

/* ============================================================
   空状态
   ============================================================ */

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #999;
  font-size: 13px;
}

.empty-state .icon {
  font-size: 40px;
  margin-bottom: 10px;
  opacity: 0.5;
}

/* ============================================================
   表格
   ============================================================ */

.topn-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  min-width: 1100px;
}

.topn-table thead th {
  background: #f0f4f8;
  padding: 8px 10px;
  border: 1px solid #e0e0e0;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 10;
}

.topn-table tbody td {
  padding: 6px 10px;
  border: 1px solid var(--color-border-light);
  vertical-align: middle;
}

.topn-table tbody tr:hover {
  background: #f8faff;
}

/* ============================================================
   列宽
   ============================================================ */

.col-rank { width: 50px; }
.col-weapon { min-width: 140px; }
.col-bullet { min-width: 140px; }
.col-armor { min-width: 130px; }
.col-helmet { min-width: 130px; }
.col-num { text-align: right !important; min-width: 90px; }

/* ============================================================
   单元格样式
   ============================================================ */

/* ---------- 排名 ---------- */
.rank-cell {
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--color-primary);
  text-align: center;
  width: 40px;
}

.rank-cell .rank-badge {
  display: inline-block;
  min-width: 22px;
  height: 22px;
  line-height: 22px;
  padding: 0 4px;
  background: #eef2ff;
  color: var(--color-primary);
  border-radius: 11px;
  font-size: 11px;
}

/* ---------- 武器 ---------- */
.weapon-cell {
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

/* ---------- 子弹 ---------- */
.bullet-cell {
  font-family: var(--font-mono);
  font-size: 11px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

/* ---------- 护甲 / 头盔 ---------- */
.armor-cell {
  font-size: 11px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}

/* ---------- 数字列 ---------- */
.num-cell {
  font-family: var(--font-mono);
  font-weight: 600;
  text-align: right;
  white-space: nowrap;
}

.num-cell.ttk-attack { color: #f44336; }
.num-cell.ttk-defense { color: #4caf50; }
.num-cell.cost { color: #e67e22; }

/* ---------- 对敌比值（带颜色分档） ---------- */
.num-cell.ratio {
  color: var(--color-primary);
  font-weight: 700;
  cursor: help;
}

.num-cell.ratio.ratio-good { color: #4caf50; }
.num-cell.ratio.ratio-warn { color: #ff9800; }
.num-cell.ratio.ratio-bad  { color: #f44336; }

/* ---------- 成本（带颜色分档） ---------- */
.num-cell.cost.cost-good { color: #4caf50; }
.num-cell.cost.cost-warn { color: #ff9800; }
.num-cell.cost.cost-bad  { color: #f44336; }

/* ============================================================
   移动端适配
   ============================================================ */
@media (max-width: 768px) {
  .topn-table-wrapper {
    padding: 10px 12px;
  }

  .topn-table {
    font-size: 11px;
    min-width: 900px;
  }

  .topn-table thead th {
    padding: 6px 8px;
    font-size: 10px;
  }

  .topn-table tbody td {
    padding: 4px 6px;
  }

  .col-rank { width: 40px; }
  .col-weapon { min-width: 110px; }
  .col-bullet { min-width: 110px; }
  .col-armor { min-width: 100px; }
  .col-helmet { min-width: 100px; }
  .col-num { min-width: 75px; }

  .rank-cell .rank-badge {
    min-width: 18px;
    height: 18px;
    line-height: 18px;
    font-size: 10px;
  }
}
</style>