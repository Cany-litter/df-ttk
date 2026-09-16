<!-- src/components/RecCard.vue -->
<template>
  <div class="top3-card" :class="`rank-${rank}`">
    <!-- 头部 -->
    <div class="top3-header">
      <div class="rank-label">
        <span class="rank-num">{{ rankIcon }}</span>
        <span>推荐 #{{ rank }}</span>
      </div>
      <span class="ratio-score">比值 {{ formatRatio(rec.ratio) }}</span>
    </div>

    <!-- 主体 -->
    <div class="top3-body">
      <!-- 装备 4 件套 -->
      <div class="gear-row">
        <span class="gear-icon">🔫</span>
        <span class="gear-label">武器</span>
        <span class="gear-value" :title="weaponLabel">
          {{ weaponLabel }}
        </span>
        <span class="gear-price">{{ formatPrice(rec.gear.weapon.price) }}</span>
      </div>

      <div class="gear-row">
        <span class="gear-icon">💊</span>
        <span class="gear-label">子弹</span>
        <span class="gear-value" :title="bulletLabel">
          {{ bulletLabel }}
        </span>
        <span class="gear-price">{{ formatBulletPrice(rec.gear.bullet.price) }}/发</span>
      </div>

      <div class="gear-row">
        <span class="gear-icon">🦺</span>
        <span class="gear-label">护甲</span>
        <span class="gear-value" :title="armorLabel">
          {{ armorLabel }}
        </span>
        <span class="gear-price">{{ formatPrice(rec.gear.armor.price) }}</span>
      </div>

      <div class="gear-row">
        <span class="gear-icon">⛑️</span>
        <span class="gear-label">头盔</span>
        <span class="gear-value" :title="helmetLabel">
          {{ helmetLabel }}
        </span>
        <span class="gear-price">{{ formatPrice(rec.gear.helmet.price) }}</span>
      </div>

      <!-- 对敌明细 -->
      <div class="enemy-ttk-detail">
        <div class="enemy-ttk-detail-title">对敌明细</div>
        <div
          v-for="(e, idx) in rec.perEnemy"
          :key="idx"
          class="enemy-ttk-row"
        >
          <span class="enemy-name" :title="e.name">
            vs {{ e.name }}
          </span>
          <div class="ttk-pair">
            <span class="ttk-item">
              <span class="k">攻</span>
              <span class="v attack">{{ formatTTK(e.attackTTK) }}</span>
            </span>
            <span class="ttk-item">
              <span class="k">守</span>
              <span class="v defense">{{ formatTTK(e.defenseTTK) }}</span>
            </span>
          </div>
          <span class="ratio" :class="ratioClass(e.ratio)">
            {{ formatRatio(e.ratio) }}
          </span>
        </div>
      </div>

      <!-- 指标行 -->
      <div class="metrics-row">
        <div class="metric">
          <div class="metric-label">综合比值</div>
          <div class="metric-value ratio" :class="ratioClass(rec.ratio)">
            {{ formatRatio(rec.ratio) }}
          </div>
        </div>
        <div class="metric">
          <div class="metric-label">进攻TTK</div>
          <div class="metric-value">
            {{ formatTTK(primaryAttackTTK) }}<small>ms</small>
          </div>
        </div>
        <div class="metric">
          <div class="metric-label">单局消耗</div>
          <div class="metric-value" :class="costClass(rec.cost.totalW)">
            {{ rec.cost.totalW.toFixed(1) }}<small>W</small>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  /**
   * 推荐结果对象（来自 RecEngine 的 recommendations.topN[i]）
   * 结构：
   * {
   *   rank: number,
   *   gear: {
   *     weapon: { id, configId, name, price },
   *     bullet: { id, name, level, price, avgShots, carryCount },
   *     armor: { name, level, value, price },
   *     helmet: { name, level, value, price }
   *   },
   *   perEnemy: [{ name, attackTTK, defenseTTK, ratio }],
   *   ratio: number,
   *   cost: { gunPrice, bulletCost, armorPrice, helmetPrice, total, totalW }
   * }
   */
  rec: {
    type: Object,
    required: true
  }
})

// ---------- 排名 ----------
const rank = computed(() => props.rec?.rank || 1)

const rankIcon = computed(() => {
  switch (rank.value) {
    case 1: return '🥇'
    case 2: return '🥈'
    case 3: return '🥉'
    default: return '🏅'
  }
})

// ---------- 装备文案 ----------
const weaponLabel = computed(() => {
  const w = props.rec?.gear?.weapon
  if (!w) return '-'
  const cfg = w.configId || ''
  return `${w.name} ${cfg}`.trim()
})

const bulletLabel = computed(() => {
  const b = props.rec?.gear?.bullet
  if (!b) return '-'
  const parts = []
  if (b.name) parts.push(b.name)
  if (b.level !== undefined && b.level !== null) parts.push(`Lv.${b.level}`)
  return parts.join(' ') || '-'
})

const armorLabel = computed(() => {
  const a = props.rec?.gear?.armor
  if (!a) return '-'
  return `${a.name} Lv.${a.level}（${a.value}）`
})

const helmetLabel = computed(() => {
  const h = props.rec?.gear?.helmet
  if (!h) return '-'
  return `${h.name} Lv.${h.level}（${h.value}）`
})

// ---------- 进攻 TTK（取第一个敌人的） ----------
const primaryAttackTTK = computed(() => {
  const arr = props.rec?.perEnemy
  if (!arr || arr.length === 0) return 0
  return arr[0].attackTTK || 0
})

// ---------- 格式化 ----------
const formatRatio = (v) => {
  if (v === undefined || v === null || !isFinite(v)) return '-'
  return v.toFixed(2)
}

const formatTTK = (v) => {
  if (v === undefined || v === null || !isFinite(v)) return '-'
  return Math.round(v)
}

const formatPrice = (v) => {
  if (v === undefined || v === null || !isFinite(v) || v <= 0) return '-'
  if (v >= 10000) return `¥${(v / 10000).toFixed(1)}W`
  return `¥${Math.round(v)}`
}

const formatBulletPrice = (v) => {
  if (v === undefined || v === null || !isFinite(v) || v <= 0) return '-'
  if (v >= 1000) return `¥${(v / 1000).toFixed(1)}k`
  return `¥${Math.round(v)}`
}

// ---------- 颜色分档 ----------
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
   Top3 卡片（复用 damage-detail-demo.html 的样式）
   ============================================================ */

.top3-card {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  border: 2px solid transparent;
  overflow: hidden;
  transition: all 0.15s;
}

.top3-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  transform: translateY(-2px);
}

.top3-card.rank-1 { border-color: #ffc107; }
.top3-card.rank-2 { border-color: #9e9e9e; }
.top3-card.rank-3 { border-color: #cd7f32; }

/* ---------- 头部 ---------- */
.top3-header {
  padding: 8px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
}

.top3-card.rank-1 .top3-header {
  background: linear-gradient(135deg, #ffc107, #ffd54f);
  color: #7a5c00;
}
.top3-card.rank-2 .top3-header {
  background: linear-gradient(135deg, #9e9e9e, #bdbdbd);
}
.top3-card.rank-3 .top3-header {
  background: linear-gradient(135deg, #cd7f32, #d4a373);
}

.top3-header .rank-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.top3-header .rank-num {
  font-size: 16px;
}

.top3-header .ratio-score {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.3);
  padding: 2px 10px;
  border-radius: 10px;
}

.top3-card.rank-1 .top3-header .ratio-score {
  color: #7a5c00;
}

/* ---------- 主体 ---------- */
.top3-body {
  padding: 12px 14px;
}

/* ---------- 装备行 ---------- */
.gear-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px dashed #f0f0f0;
  font-size: 12px;
}

.gear-row:last-child {
  border-bottom: none;
}

.gear-icon {
  font-size: 16px;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}

.gear-label {
  color: #888;
  font-size: 11px;
  flex-shrink: 0;
  width: 36px;
}

.gear-value {
  flex: 1;
  font-weight: 500;
  color: var(--color-text);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gear-price {
  font-family: var(--font-mono);
  font-size: 11px;
  color: #e67e22;
  flex-shrink: 0;
}

/* ---------- 对敌明细 ---------- */
.enemy-ttk-detail {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #f0f0f0;
}

.enemy-ttk-detail-title {
  font-size: 11px;
  color: #888;
  margin-bottom: 6px;
}

.enemy-ttk-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: center;
  padding: 5px 6px;
  background: #fafbfd;
  border-radius: 4px;
  margin-bottom: 4px;
  font-size: 11px;
}

.enemy-ttk-row .enemy-name {
  color: #555;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.enemy-ttk-row .ttk-pair {
  display: flex;
  gap: 6px;
}

.enemy-ttk-row .ttk-item {
  display: flex;
  align-items: baseline;
  gap: 2px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
}

.enemy-ttk-row .ttk-item .k {
  font-family: var(--font-family);
  font-size: 9px;
  font-weight: 400;
  color: #999;
}

.enemy-ttk-row .ttk-item .v.attack { color: #f44336; }
.enemy-ttk-row .ttk-item .v.defense { color: #4caf50; }

.enemy-ttk-row .ratio {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  color: var(--color-primary);
  padding: 1px 6px;
  background: #eef2ff;
  border-radius: 3px;
}

/* 比值颜色（对敌明细里的小标签） */
.enemy-ttk-row .ratio.ratio-good {
  color: #4caf50;
  background: #e8f5e9;
}
.enemy-ttk-row .ratio.ratio-warn {
  color: #ff9800;
  background: #fff3e0;
}
.enemy-ttk-row .ratio.ratio-bad {
  color: #f44336;
  background: #ffebee;
}

/* ---------- 指标行 ---------- */
.metrics-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #f0f0f0;
}

.metric {
  text-align: center;
  padding: 6px 4px;
  background: #fafbfd;
  border-radius: 6px;
  border: 1px solid #eef0f3;
}

.metric-label {
  font-size: 10px;
  color: #999;
  margin-bottom: 2px;
}

.metric-value {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.2;
}

.metric-value small {
  font-size: 10px;
  font-weight: 400;
  color: #888;
  margin-left: 2px;
}

.metric-value.ratio {
  color: var(--color-primary);
}

.metric-value.ratio.ratio-good { color: #4caf50; }
.metric-value.ratio.ratio-warn { color: #ff9800; }
.metric-value.ratio.ratio-bad  { color: #f44336; }

.metric-value.cost-good { color: #4caf50; }
.metric-value.cost-warn { color: #ff9800; }
.metric-value.cost-bad  { color: #f44336; }

/* ============================================================
   移动端适配
   ============================================================ */
@media (max-width: 768px) {
  .top3-header {
    padding: 6px 12px;
    font-size: 12px;
  }

  .top3-header .rank-num {
    font-size: 14px;
  }

  .top3-header .ratio-score {
    font-size: 12px;
    padding: 1px 8px;
  }

  .top3-body {
    padding: 10px 12px;
  }

  .gear-row {
    font-size: 11px;
    gap: 6px;
    padding: 4px 0;
  }

  .gear-icon {
    font-size: 14px;
    width: 18px;
  }

  .gear-label {
    font-size: 10px;
    width: 32px;
  }

  .gear-price {
    font-size: 10px;
  }

  .enemy-ttk-row {
    font-size: 10px;
    padding: 4px 5px;
    gap: 6px;
  }

  .enemy-ttk-row .ttk-item {
    font-size: 10px;
  }

  .enemy-ttk-row .ratio {
    font-size: 11px;
    padding: 1px 5px;
  }

  .metric {
    padding: 4px 2px;
  }

  .metric-label {
    font-size: 9px;
  }

  .metric-value {
    font-size: 12px;
  }

  .metric-value small {
    font-size: 9px;
  }
}
</style>