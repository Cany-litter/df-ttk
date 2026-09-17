<!-- src/components/RecPanel.vue -->
<template>
  <div class="rec-panel">
    <!-- ============================================================ -->
    <!-- 顶部说明 -->
    <!-- ============================================================ -->
    <div class="explain-box">
      <strong>📖 配装推荐说明：</strong>
      ① 假想敌默认 1 个，最多 3 个，每个敌人有独立的<b>预算</b>和<b>交战距离</b><br>
      ② 在预算内推荐最优的<b>枪械 / 子弹 / 护甲 / 头盔</b>组合<br>
      ③ 评分：对每个敌人算<b>胜率</b>，再取所有敌人胜率的平均作为<b>综合胜率</b>（越大越好）<br>
      ④ 展示：Top 3 卡片 + 第 4~30 名表格（可加载更多）
    </div>

    <!-- ============================================================ -->
    <!-- 假想敌配置区 -->
    <!-- ============================================================ -->
    <div class="panel">
      <div class="enemies-header">
        <div class="panel-title">
          👥 假想敌配置
          <span class="badge">{{ enemies.length }} 个敌人</span>
        </div>
        <button
          class="add-enemy-btn"
          :disabled="enemies.length >= MAX_ENEMIES"
          @click="addEnemy"
        >
          <template v-if="enemies.length >= MAX_ENEMIES">
            ⚠️ 已达上限 {{ MAX_ENEMIES }} 个
          </template>
          <template v-else>
            ➕ 添加假想敌
          </template>
        </button>
      </div>

      <!-- ⭐ 空状态：无假想敌时显示大按钮 -->
      <div v-if="enemies.length === 0" class="enemy-empty-state">
        <div class="icon">👻</div>
        <div class="title">暂无假想敌</div>
        <div class="hint">点击下方按钮，自动生成一个符合预算的随机配装</div>
        <div class="empty-actions">
          <button class="btn-big-random" @click="addEnemy">
            🎲 随机生成一个假想敌
          </button>
        </div>
      </div>

      <!-- 假想敌卡片网格 -->
      <div v-else class="enemies-grid">
        <div
          v-for="(enemy, index) in enemies"
          :key="enemy._id"
          class="enemy-card"
          :data-index="index"
        >
          <!-- 头部 -->
          <div class="enemy-header">
            <span class="enemy-index">{{ index + 1 }}</span>
            <input
              v-model="enemy.name"
              type="text"
              class="enemy-name-input"
              placeholder="假想敌名称"
            />
            <button
              class="btn-reroll"
              title="按预算重新随机"
              @click="rerollEnemy(index)"
            >
              🎲 重掷
            </button>
            <button
              class="remove-enemy-btn"
              title="删除"
              @click="removeEnemy(index)"
            >
              ✕
            </button>
          </div>

          <!-- 主体 -->
          <div class="enemy-card-body">
            <!-- 预算输入 -->
            <div class="enemy-field budget-field">
              <span class="label">💰 预算</span>
              <input
                v-model.number="enemy.budgetW"
                type="number"
                min="1"
                step="5"
                @input="markDirty"
              />
              <span class="unit">W</span>
            </div>

            <!-- 武器 -->
            <div class="enemy-field">
              <span class="label">武器</span>
              <select v-model="enemy.weaponId" @change="onEnemyWeaponChange(index)">
                <option :value="null" disabled>请选择武器</option>
                <option
                  v-for="w in weaponOptions"
                  :key="w.id"
                  :value="w.id"
                >
                  {{ w.name }}
                </option>
              </select>
            </div>

            <!-- 配置 -->
            <div class="enemy-field">
              <span class="label">配置</span>
              <select
                v-model="enemy.configId"
                :disabled="!enemy.weaponId"
                @change="markDirty"
              >
                <option :value="null" disabled>请选择配置</option>
                <option
                  v-for="c in getConfigOptions(enemy.weaponId)"
                  :key="c.configId"
                  :value="c.configId"
                >
                  {{ c.configId }} · {{ c.barrel || '无枪管' }}
                </option>
              </select>
            </div>

            <!-- 子弹 -->
            <div class="enemy-field">
              <span class="label">子弹</span>
              <select
                v-model="enemy.bulletId"
                :disabled="!enemy.weaponId"
                @change="markDirty"
              >
                <option :value="null" disabled>请选择子弹</option>
                <option
                  v-for="b in getBulletOptions(enemy.weaponId)"
                  :key="b.id"
                  :value="b.id"
                >
                  {{ b.display }}
                </option>
              </select>
            </div>

            <!-- 护甲 -->
            <div class="enemy-field">
              <span class="label">护甲</span>
              <select v-model="enemy.armorId" @change="markDirty">
                <option :value="null" disabled>请选择护甲</option>
                <option
                  v-for="a in armorOptions"
                  :key="a.id"
                  :value="a.id"
                >
                  {{ a.name }} Lv.{{ a.level }}（{{ a.value }}）
                </option>
              </select>
            </div>

            <!-- 头盔 -->
            <div class="enemy-field">
              <span class="label">头盔</span>
              <select v-model="enemy.helmetId" @change="markDirty">
                <option :value="null" disabled>请选择头盔</option>
                <option
                  v-for="h in helmetOptions"
                  :key="h.id"
                  :value="h.id"
                >
                  {{ h.name }} Lv.{{ h.level }}（{{ h.value }}）
                </option>
              </select>
            </div>

            <!-- 距离 -->
            <div class="enemy-field">
              <span class="label">距离</span>
              <input
                v-model.number="enemy.distance"
                type="number"
                class="distance-input"
                min="0"
                max="200"
                step="1"
                @input="markDirty"
              />
              <span class="unit">m</span>
            </div>
          </div>

          <!-- 底部总价 -->
          <div class="card-footer">
            <span>总价</span>
            <span
              class="cost-total"
              :class="{ over: isOverBudget(enemy) }"
            >
              ¥{{ formatCostW(calcEnemyCost(enemy)) }}
              <template v-if="isOverBudget(enemy)">⚠️ 超预算</template>
            </span>
          </div>
        </div>
      </div>

      <!-- 预算 + 开始推荐 -->
      <div class="budget-row">
        <div class="budget-group">
          <label>💰 预算</label>
          <input
            v-model.number="budget"
            type="number"
            class="budget-input"
            min="1"
            step="10"
            @input="markDirty"
          />
          <span class="budget-unit">W 哈弗币</span>
        </div>

        <button
          class="calc-btn"
          :disabled="isRunning || !canRun"
          :title="calcButtonTitle"
          @click="runRecommend"
        >
          <template v-if="isRunning">⏳ 推荐中...</template>
          <template v-else>🔍 开始推荐</template>
        </button>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- ⭐ 推荐结果区顶部：假想敌变更提示条 -->
    <!-- ============================================================ -->
    <div
      v-if="recommendDirty && recommendations"
      class="dirty-hint"
    >
      ⚠️ 假想敌或参数已变更，点击「🔍 开始推荐」刷新结果
    </div>

    <!-- ============================================================ -->
    <!-- Top 3 卡片 -->
    <!-- ============================================================ -->
    <template v-if="recommendations && recommendations.topN.length > 0">
      <div class="section-title">
        🏅 Top 3 推荐
        <span class="badge">按综合胜率排序</span>
      </div>

      <div class="top3-grid">
        <div
          v-for="rec in recommendations.topN"
          :key="rec.rank"
          class="top3-card"
          :class="`rank-${rec.rank}`"
        >
          <!-- 头部（胜率徽章） -->
          <div class="top3-header">
            <div class="rank-label">
              <span class="rank-num">{{ rankIcon(rec.rank) }}</span>
              <span>推荐 #{{ rec.rank }}</span>
            </div>
            <span class="winrate-badge">
              {{ formatPct(rec.winRate) }}<span class="pct">胜率</span>
            </span>
          </div>

          <!-- 主体 -->
          <div class="top3-body">
            <!-- 装备 4 件套 -->
            <div class="gear-row">
              <span class="gear-icon">🔫</span>
              <span class="gear-label">武器</span>
              <span class="gear-value" :title="weaponLabel(rec)">
                {{ weaponLabel(rec) }}
              </span>
              <span class="gear-price">{{ formatPrice(rec.gear.weapon.price) }}</span>
            </div>

            <!-- 改枪码 -->
            <div v-if="rec.gear.weapon.buildCode" class="gear-row buildcode-row">
              <span class="gear-icon"></span>
              <span class="gear-label">码</span>
              <span class="gear-value buildcode-value" :title="rec.gear.weapon.buildCode">
                {{ rec.gear.weapon.buildCode }}
              </span>
              <button
                class="btn-copy-code"
                :class="{ copied: copiedKey === `rec_${rec.rank}` }"
                :title="copiedKey === `rec_${rec.rank}` ? '已复制' : '复制改枪码'"
                @click="copyBuildCode(rec.gear.weapon.buildCode, `rec_${rec.rank}`)"
              >
                {{ copiedKey === `rec_${rec.rank}` ? '✅' : '📋' }}
              </button>
            </div>

            <!-- 子弹 -->
            <div class="gear-row bullet-row">
              <span class="gear-icon">💊</span>
              <span class="gear-label">子弹</span>
              <span class="gear-value" :title="bulletTooltip(rec)">
                {{ bulletLabel(rec) }}
                <span v-if="rec.gear.bullet.carryCount > 0" class="bullet-qty">
                  × {{ rec.gear.bullet.carryCount }}发
                </span>
              </span>
              <span class="gear-price bullet-price-group">
                <span class="bullet-unit-price">
                  {{ formatBulletPrice(rec.gear.bullet.price) }}/发
                </span>
                <span class="bullet-total-price">
                  {{ formatBulletCost(rec.cost.bulletCost) }}
                </span>
              </span>
            </div>

            <div class="gear-row">
              <span class="gear-icon">🦺</span>
              <span class="gear-label">护甲</span>
              <span class="gear-value" :title="armorLabel(rec)">
                {{ armorLabel(rec) }}
              </span>
              <span class="gear-price">{{ formatPrice(rec.gear.armor.price) }}</span>
            </div>

            <div class="gear-row">
              <span class="gear-icon">⛑️</span>
              <span class="gear-label">头盔</span>
              <span class="gear-value" :title="helmetLabel(rec)">
                {{ helmetLabel(rec) }}
              </span>
              <span class="gear-price">{{ formatPrice(rec.gear.helmet.price) }}</span>
            </div>

            <!-- 对敌明细 -->
            <div class="enemy-ttk-detail">
              <div class="enemy-ttk-detail-title">
                <span>对敌明细</span>
                <span class="avg-hint">
                  平均攻 {{ formatTTK(avgAttackTTK(rec)) }}ms / 守 {{ formatTTK(avgDefenseTTK(rec)) }}ms
                </span>
              </div>
              <div
                v-for="(e, idx) in rec.perEnemy"
                :key="idx"
                class="enemy-ttk-row"
                :class="{ 'is-weakest': idx === weakestEnemyIdx(rec) }"
              >
                <span class="enemy-name" :title="e.name">
                  vs {{ e.name }}
                  <span v-if="idx === weakestEnemyIdx(rec)" class="weakest-tag">最弱</span>
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
                <span class="winrate-cell" :class="rateClass(e.winRate)">
                  {{ formatPct(e.winRate) }}
                </span>
              </div>
            </div>

            <!-- 指标行（4 列） -->
            <div class="metrics-row">
              <div class="metric">
                <div class="metric-label">综合胜率</div>
                <div class="metric-value" :class="rateClass(rec.winRate)">
                  {{ formatPct(rec.winRate) }}
                </div>
              </div>
              <div class="metric">
                <div class="metric-label">平均进攻TTK</div>
                <div class="metric-value">
                  {{ formatTTK(avgAttackTTK(rec)) }}<small>ms</small>
                </div>
              </div>
              <div class="metric">
                <div class="metric-label">平均生存TTK</div>
                <div class="metric-value">
                  {{ formatTTK(avgDefenseTTK(rec)) }}<small>ms</small>
                </div>
              </div>
              <div class="metric">
                <div class="metric-label">总价</div>
                <div class="metric-value gear-total">
                  {{ rec.cost.gearTotalW.toFixed(1) }}<small>W</small>
                </div>
              </div>
            </div>

            <!-- ⭐ 添加为假想敌 -->
            <div class="top3-actions">
              <button
                class="btn-add-as-enemy"
                :disabled="enemies.length >= MAX_ENEMIES"
                :title="enemies.length >= MAX_ENEMIES ? '假想敌数量已满，请先移除一个' : '用该配装添加一个新假想敌'"
                @click="addAsEnemy(rec)"
              >
                ➕ 添加为假想敌
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ============================================================ -->
    <!-- 第 4~30 名表格 -->
    <!-- ============================================================ -->
    <template v-if="recommendations && recommendations.rest.length > 0">
      <div class="section-title">
        📊 第 4~{{ Math.min(3 + visibleRestCount, 3 + recommendations.rest.length) }} 名
        <span class="badge">
          {{ visibleRestCount }} / {{ recommendations.rest.length }} 套 · 按综合胜率排序
        </span>
      </div>

      <div class="topn-table-wrapper">
        <table class="topn-table">
          <thead>
            <tr>
              <th class="col-rank">排名</th>
              <th class="col-weapon">武器配置</th>
              <th class="col-bullet">子弹</th>
              <th class="col-armor">护甲</th>
              <th class="col-helmet">头盔</th>
              <th class="col-num">平均进攻TTK</th>
              <th class="col-num">平均生存TTK</th>
              <th class="col-num">综合胜率</th>
              <th class="col-num">总价</th>
              <th class="col-action">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(rec, idx) in displayedRest"
              :key="rec.rank || idx"
            >
              <!-- 排名 -->
              <td class="rank-cell">
                <span class="rank-badge">{{ rec.rank }}</span>
              </td>

              <!-- 武器配置 -->
              <td class="weapon-cell" :title="weaponCellTooltip(rec)">
                <div class="cell-main">
                  <span class="cell-main-text">{{ weaponLabel(rec) }}</span>
                  <button
                    v-if="rec.gear.weapon.buildCode"
                    class="btn-copy-mini"
                    :class="{ copied: copiedKey === `table_${rec.rank}` }"
                    :title="copiedKey === `table_${rec.rank}` ? '已复制' : '复制改枪码'"
                    @click.stop="copyBuildCode(rec.gear.weapon.buildCode, `table_${rec.rank}`)"
                  >
                    {{ copiedKey === `table_${rec.rank}` ? '✅' : '📋' }}
                  </button>
                </div>
                <div class="cell-sub cell-price">{{ formatPrice(rec.gear.weapon.price) }}</div>
              </td>

              <!-- 子弹 -->
              <td class="bullet-cell" :title="bulletTooltip(rec)">
                <div class="cell-main">
                  <span class="cell-main-text">{{ bulletLabel(rec) }}</span>
                  <span v-if="rec.gear.bullet.carryCount > 0" class="bullet-qty-inline">
                    ×{{ rec.gear.bullet.carryCount }}
                  </span>
                </div>
                <div class="cell-sub">
                  <span class="bullet-unit-price-mini">{{ formatBulletPrice(rec.gear.bullet.price) }}/发</span>
                  <span class="bullet-total-price-mini">{{ formatBulletCost(rec.cost.bulletCost) }}</span>
                </div>
              </td>

              <!-- 护甲 -->
              <td class="armor-cell" :title="armorLabel(rec)">
                <div class="cell-main">
                  <span class="cell-main-text">{{ armorLabel(rec) }}</span>
                </div>
                <div class="cell-sub cell-price">{{ formatPrice(rec.gear.armor.price) }}</div>
              </td>

              <!-- 头盔 -->
              <td class="armor-cell" :title="helmetLabel(rec)">
                <div class="cell-main">
                  <span class="cell-main-text">{{ helmetLabel(rec) }}</span>
                </div>
                <div class="cell-sub cell-price">{{ formatPrice(rec.gear.helmet.price) }}</div>
              </td>

              <!-- 平均进攻 TTK -->
              <td class="num-cell ttk-attack">
                {{ formatTTK(avgAttackTTK(rec)) }} ms
              </td>

              <!-- 平均生存 TTK -->
              <td class="num-cell ttk-defense">
                {{ formatTTK(avgDefenseTTK(rec)) }} ms
              </td>

              <!-- 综合胜率 -->
              <td
                class="num-cell winrate"
                :class="rateClass(rec.winRate)"
              >
                {{ formatPct(rec.winRate) }}
              </td>

              <!-- 总价 -->
              <td class="num-cell gear-total">
                {{ formatCost(rec.cost?.gearTotalW) }} W
              </td>

              <!-- ⭐ 操作 -->
              <td class="action-cell">
                <button
                  class="btn-add-as-enemy-mini"
                  :disabled="enemies.length >= MAX_ENEMIES"
                  :title="enemies.length >= MAX_ENEMIES ? '假想敌数量已满，请先移除一个' : '用该配装添加一个新假想敌'"
                  @click="addAsEnemy(rec)"
                >
                  ➕
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ⭐ 加载更多 -->
      <div v-if="visibleRestCount < recommendations.rest.length" class="load-more-row">
        <button class="btn-load-more" @click="handleLoadMore">
          ➕ 加载更多（显示到 Top {{ Math.min(3 + visibleRestCount + LOAD_MORE_STEP, 3 + recommendations.rest.length) }}）
        </button>
      </div>
    </template>

    <!-- ============================================================ -->
    <!-- 空状态（推荐完成后无结果） -->
    <!-- ============================================================ -->
    <div
      v-if="recommendations && recommendations.topN.length === 0"
      class="empty-state"
    >
      <div class="icon">😢</div>
      <div>没有找到符合条件的方案</div>
      <div class="hint">请提高预算或调整假想敌配置</div>
    </div>

    <!-- ============================================================ -->
    <!-- 进度遮罩 -->
    <!-- ============================================================ -->
    <Teleport to="body">
      <div v-if="progress.visible" class="rec-progress-overlay">
        <div class="rec-progress-box">
          <div class="rec-progress-icon">⏳</div>
          <div class="rec-progress-title">{{ progress.title }}</div>

          <div class="rec-progress-phase">{{ progress.phase }}</div>

          <div class="rec-progress-bar-container">
            <div
              class="rec-progress-bar"
              :style="{ width: progress.percent + '%' }"
            ></div>
          </div>

          <div class="rec-progress-text">
            {{ progress.current }} / {{ progress.total }}
          </div>
          <div class="rec-progress-percent">{{ progress.percent }}%</div>

          <div class="rec-progress-hint">
            💡 首次推荐会预计算 TTK 矩阵，后续推荐会复用缓存
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject, nextTick } from 'vue'
import { dataStore, paramsStore } from '@/stores/stores'

// ⭐ 注入通用弹窗
const showAlert = inject('showAlert', null)

// ============================================================
// 常量
// ============================================================

const MAX_ENEMIES = 3
const DEFAULT_BUDGET_W = 100
const BULLET_CARRY_COUNT = 60

// ⭐ 随机配装采样参数
const RANDOM_SAMPLE_COUNT = 100
const RANDOM_TOP_RATIO = 0.3

// ⭐ 加载更多：每次新增多少条
const LOAD_MORE_STEP = 20

// ⭐ 头盔等级偏移权重（相对护甲）
const HELMET_OFFSET_WEIGHTS = [
  { offset: -1, weight: 0.05 },
  { offset:  0, weight: 0.45 },
  { offset:  1, weight: 0.35 },
  { offset:  2, weight: 0.12 },
  { offset:  3, weight: 0.03 },
]

// ============================================================
// 状态
// ============================================================

const budget = ref(100)
const isRunning = ref(false)
const recommendations = ref(null)

// ⭐ 推荐结果是否"脏"（假想敌或参数变更后为 true）
const recommendDirty = ref(false)

// ⭐ 表格默认显示多少条（不包含 Top 3）
const visibleRestCount = ref(10)

// ⭐ 复制改枪码的临时状态
const copiedKey = ref(null)
let copiedTimer = null

/**
 * 假想敌列表
 */
const enemies = ref([])

let _enemyIdCounter = 0

/**
 * 进度状态
 */
const progress = ref({
  visible: false,
  title: '推荐中...',
  phase: '',
  current: 0,
  total: 0,
  percent: 0
})

// ============================================================
// 数据选项
// ============================================================

const weaponOptions = computed(() => {
  return dataStore.state.weapons || []
})

const armorOptions = computed(() => {
  return (dataStore.state.armors || []).filter(a => a.type === 'armor')
})

const helmetOptions = computed(() => {
  return (dataStore.state.armors || []).filter(a => a.type === 'helmet')
})

const getConfigOptions = (weaponId) => {
  if (!weaponId) return []
  return dataStore.getPriceRowsForWeapon(weaponId) || []
}

const getBulletOptions = (weaponId) => {
  if (!weaponId) return []
  const weapon = dataStore.getWeaponById(weaponId)
  if (!weapon || !weapon.allowedBullet) return []

  const bullets = dataStore.getBulletsByCaliber(weapon.allowedBullet) || []
  return bullets.map(b => ({
    id: b.id,
    display: dataStore.getDataManager().getBulletDisplay(b)
  }))
}

// ============================================================
// ⭐ 随机配装工具
// ============================================================

const rand = (min, max) => Math.random() * (max - min) + min
const randInt = (min, max) => Math.floor(rand(min, max + 1))
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

const randomDistanceByType = (type) => {
  if (type === '冲锋枪' || type === '手枪') return randInt(0, 40)
  return randInt(20, 100)
}

const weightedPickOffset = (weights) => {
  const total = weights.reduce((sum, w) => sum + w.weight, 0)
  let r = Math.random() * total
  for (const w of weights) {
    r -= w.weight
    if (r <= 0) return w.offset
  }
  return weights[weights.length - 1].offset
}

const pickHelmetForArmor = (armor, helmets) => {
  if (!armor || !helmets || helmets.length === 0) {
    return pick(helmets)
  }

  const armorLevel = armor.level ?? 4
  const offset = weightedPickOffset(HELMET_OFFSET_WEIGHTS)

  let targetLevel = armorLevel - offset
  targetLevel = Math.max(1, Math.min(6, targetLevel))

  const sameLevel = helmets.filter(h => h.level === targetLevel)
  if (sameLevel.length > 0) {
    return pick(sameLevel)
  }

  let closest = helmets[0]
  let minDiff = Math.abs((closest.level ?? 1) - targetLevel)
  for (const h of helmets) {
    const diff = Math.abs((h.level ?? 1) - targetLevel)
    if (diff < minDiff) {
      minDiff = diff
      closest = h
    }
  }
  return closest
}

const calcEnemyCost = (enemy) => {
  if (!enemy || !enemy.weaponId) return Infinity

  const dm = dataStore.getDataManager()
  const weapon = dm.getWeaponById(enemy.weaponId)
  if (!weapon) return Infinity

  const configs = dataStore.getPriceRowsForWeapon(enemy.weaponId) || []
  const config = configs.find(c => c.configId === enemy.configId)
  const configPrice = config?.price || 0

  const bullets = dm.getBulletsByCaliber(weapon.allowedBullet) || []
  const bullet = bullets.find(b => b.id === enemy.bulletId)
  const bulletPrice = bullet?.price || 0

  const armor = dm.getArmorById(enemy.armorId)
  const armorPrice = armor?.price || 0

  const helmet = dm.getArmorById(enemy.helmetId)
  const helmetPrice = helmet?.price || 0

  const bulletCost = bulletPrice * BULLET_CARRY_COUNT

  return configPrice + bulletCost + armorPrice + helmetPrice
}

const isOverBudget = (enemy) => {
  if (!enemy) return false
  const cost = calcEnemyCost(enemy)
  const budgetYuan = (enemy.budgetW || DEFAULT_BUDGET_W) * 10000
  return cost > budgetYuan
}

const formatCostW = (costYuan) => {
  if (!isFinite(costYuan)) return '-'
  return (costYuan / 10000).toFixed(1) + 'W'
}

const randomEnemyOnce = () => {
  const dm = dataStore.getDataManager()
  const weapons = dm.getWeapons() || []
  const armors = dm.getArmorsByType('armor') || []
  const helmets = dm.getArmorsByType('helmet') || []

  if (weapons.length === 0 || armors.length === 0 || helmets.length === 0) {
    return null
  }

  const weapon = pick(weapons)

  const configs = (dataStore.getPriceRowsForWeapon(weapon.id) || [])
    .filter(c => c.enabled !== false)
  if (configs.length === 0) return null
  const config = pick(configs)

  const bullets = (dm.getBulletsByCaliber(weapon.allowedBullet) || [])
    .filter(b => b.enabled !== false)
  if (bullets.length === 0) return null
  const bullet = pick(bullets)

  const armor = pick(armors)
  const helmet = pickHelmetForArmor(armor, helmets)

  const distance = randomDistanceByType(weapon.type)

  return {
    _id: `enemy_${Date.now()}_${++_enemyIdCounter}`,
    name: '',
    budgetW: 0,
    weaponId: weapon.id,
    configId: config.configId,
    bulletId: bullet.id,
    armorId: armor.id,
    helmetId: helmet.id,
    distance,
  }
}

const randomEnemy = (budgetYuan) => {
  const candidates = []

  for (let i = 0; i < RANDOM_SAMPLE_COUNT; i++) {
    const enemy = randomEnemyOnce()
    if (!enemy) continue

    enemy.budgetW = Math.round(budgetYuan / 10000)

    const cost = calcEnemyCost(enemy)
    if (isFinite(cost) && cost <= budgetYuan) {
      candidates.push({ enemy, cost })
    }
  }

  if (candidates.length === 0) {
    return null
  }

  candidates.sort((a, b) => b.cost - a.cost)

  const topN = Math.max(1, Math.ceil(candidates.length * RANDOM_TOP_RATIO))
  const topCandidates = candidates.slice(0, topN)

  const chosen = topCandidates[Math.floor(Math.random() * topCandidates.length)]
  return chosen.enemy
}

// ============================================================
// ⭐ 脏标记
// ============================================================

const markDirty = () => {
  if (recommendations.value) {
    recommendDirty.value = true
  }
}

// ============================================================
// 假想敌操作
// ============================================================

const createEnemy = (index = 0) => {
  const random = randomEnemy(DEFAULT_BUDGET_W * 10000)
  if (random) {
    random.name = `假想敌 ${index + 1}`
    return random
  }

  _enemyIdCounter += 1
  return {
    _id: `enemy_${Date.now()}_${_enemyIdCounter}`,
    name: `假想敌 ${index + 1}`,
    budgetW: DEFAULT_BUDGET_W,
    weaponId: null,
    configId: null,
    bulletId: null,
    armorId: null,
    helmetId: null,
    distance: 30
  }
}

const addEnemy = () => {
  if (enemies.value.length >= MAX_ENEMIES) return
  enemies.value.push(createEnemy(enemies.value.length))
  markDirty()
}

const removeEnemy = (index) => {
  if (enemies.value.length <= 1) return
  enemies.value.splice(index, 1)
  markDirty()
}

const rerollEnemy = (index) => {
  const enemy = enemies.value[index]
  if (!enemy) return

  const budgetYuan = (enemy.budgetW || DEFAULT_BUDGET_W) * 10000
  const oldName = enemy.name

  const newEnemy = randomEnemy(budgetYuan)
  if (newEnemy) {
    newEnemy.name = oldName || `假想敌 ${index + 1}`
    enemies.value[index] = newEnemy
    markDirty()
  } else {
    const msg = `⚠️ 预算 ¥${enemy.budgetW || DEFAULT_BUDGET_W}W 太小，无法生成配装`
    if (showAlert) showAlert(msg)
    else alert(msg)
  }
}

const onEnemyWeaponChange = (index) => {
  const enemy = enemies.value[index]
  if (!enemy) return

  enemy.configId = null
  enemy.bulletId = null

  const configs = getConfigOptions(enemy.weaponId)
  if (configs.length > 0) {
    const firstEnabled = configs.find(c => c.enabled !== false) || configs[0]
    enemy.configId = firstEnabled.configId
  }

  const bullets = getBulletOptions(enemy.weaponId)
  if (bullets.length > 0) {
    const sorted = [...bullets].sort((a, b) => {
      const la = parseInt(String(a.display).match(/Lv\.(\d+)/)?.[1] || '0')
      const lb = parseInt(String(b.display).match(/Lv\.(\d+)/)?.[1] || '0')
      return lb - la
    })
    enemy.bulletId = sorted[0].id
  }

  markDirty()
}

/**
 * ⭐ 从推荐结果"添加为假想敌"
 *
 * - 假想敌数量 < 3 时：追加一个新假想敌
 * - 假想敌数量 = 3 时：提示"数量已满"
 * - 添加后不自动重跑推荐，只标记 dirty
 */
const addAsEnemy = (rec) => {
  if (!rec) return

  if (enemies.value.length >= MAX_ENEMIES) {
    const msg = `⚠️ 假想敌数量已满（${MAX_ENEMIES} 个），请先移除一个再添加`
    if (showAlert) showAlert(msg)
    else alert(msg)
    return
  }

  // 从 rec 提取字段
  const weaponId = rec.gear.weapon.id
  const configId = rec.gear.weapon.configId
  const bulletId = rec.gear.bullet.id
  const armorId = rec.gear.armor.id
  const helmetId = rec.gear.helmet.id

  // 缺失字段检查
  if (!weaponId || !configId || !bulletId || !armorId || !helmetId) {
    console.warn('⚠️ addAsEnemy: 推荐结果缺少必要字段', rec)
    const msg = '⚠️ 该推荐结果缺少必要字段，无法添加'
    if (showAlert) showAlert(msg)
    else alert(msg)
    return
  }

  // 按武器类型随机距离
  const weapon = dataStore.getWeaponById(weaponId)
  const distance = randomDistanceByType(weapon?.type || '步枪')

  _enemyIdCounter += 1

  const newEnemy = {
    _id: `enemy_${Date.now()}_${_enemyIdCounter}`,
    name: `假想敌 ${enemies.value.length + 1}`,
    budgetW: budget.value,
    weaponId,
    configId,
    bulletId,
    armorId,
    helmetId,
    distance,
  }

  enemies.value.push(newEnemy)
  markDirty()

  console.log(`➕ 已添加为假想敌: ${rec.gear.weapon.name} ${configId} / ${rec.gear.bullet.name} Lv.${rec.gear.bullet.level}`)
}

// ============================================================
// ⭐ 加载更多
// ============================================================

const displayedRest = computed(() => {
  if (!recommendations.value) return []
  return recommendations.value.rest.slice(0, visibleRestCount.value)
})

const handleLoadMore = () => {
  if (!recommendations.value) return
  visibleRestCount.value = Math.min(
    visibleRestCount.value + LOAD_MORE_STEP,
    recommendations.value.rest.length
  )
}

// ============================================================
// ⭐ 复制改枪码
// ============================================================

const copyBuildCode = async (code, key) => {
  if (!code || code.trim() === '') return

  const text = code.trim()
  let success = false

  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      success = true
    } catch (e) {
      // fallback
    }
  }

  if (!success) {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.top = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      success = document.execCommand('copy')
      document.body.removeChild(ta)
    } catch (e) {
      success = false
    }
  }

  if (success) {
    copiedKey.value = key
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copiedKey.value = null
    }, 1500)
  }
}

// ============================================================
// 计算属性
// ============================================================

const canRun = computed(() => {
  if (enemies.value.length === 0) return false

  return enemies.value.every(e =>
    e.weaponId &&
    e.configId &&
    e.bulletId &&
    e.armorId &&
    e.helmetId &&
    e.distance >= 0
  )
})

const calcButtonTitle = computed(() => {
  if (isRunning.value) return '推荐中...'
  if (!canRun.value) return '请完整配置所有假想敌'
  return '开始推荐配装'
})

// ============================================================
// ⭐ 装备标签辅助
// ============================================================

const weaponLabel = (rec) => {
  const w = rec?.gear?.weapon
  if (!w) return '-'
  const cfg = w.configId || ''
  return `${w.name} ${cfg}`.trim()
}

const weaponCellTooltip = (rec) => {
  const w = rec?.gear?.weapon
  if (!w) return ''
  const label = weaponLabel(rec)
  if (!w.buildCode) return label
  return `${label}\n改枪码: ${w.buildCode}`
}

const bulletLabel = (rec) => {
  const b = rec?.gear?.bullet
  if (!b) return '-'
  const parts = []
  if (b.name) parts.push(b.name)
  if (b.level !== undefined && b.level !== null) parts.push(`Lv.${b.level}`)
  return parts.join(' ') || '-'
}

const bulletTooltip = (rec) => {
  const b = rec?.gear?.bullet
  if (!b) return ''

  const lines = [bulletLabel(rec)]
  if (b.carryCount > 0) {
    lines.push(`携带数量: ${b.carryCount} 发`)
  }
  if (b.price > 0) {
    lines.push(`单价: ¥${b.price}/发`)
  }
  const bulletCost = rec?.cost?.bulletCost
  if (bulletCost > 0) {
    lines.push(`总价: ¥${(bulletCost / 10000).toFixed(1)}W`)
  }
  return lines.join('\n')
}

const armorLabel = (rec) => {
  const a = rec?.gear?.armor
  if (!a) return '-'
  return `${a.name} Lv.${a.level}（${a.value}）`
}

const helmetLabel = (rec) => {
  const h = rec?.gear?.helmet
  if (!h) return '-'
  return `${h.name} Lv.${h.level}（${h.value}）`
}

const rankIcon = (rank) => {
  switch (rank) {
    case 1: return '🥇'
    case 2: return '🥈'
    case 3: return '🥉'
    default: return '🏅'
  }
}

// ============================================================
// ⭐ 胜率相关辅助
// ============================================================

const avgAttackTTK = (rec) => {
  const arr = rec?.perEnemy
  if (!arr || arr.length === 0) return 0
  return arr.reduce((s, e) => s + (e.attackTTK || 0), 0) / arr.length
}

const avgDefenseTTK = (rec) => {
  const arr = rec?.perEnemy
  if (!arr || arr.length === 0) return 0
  return arr.reduce((s, e) => s + (e.defenseTTK || 0), 0) / arr.length
}

const weakestEnemyIdx = (rec) => {
  const arr = rec?.perEnemy
  if (!arr || arr.length === 0) return -1

  let minIdx = 0
  for (let i = 1; i < arr.length; i++) {
    if ((arr[i].winRate || 0) < (arr[minIdx].winRate || 0)) {
      minIdx = i
    }
  }
  return minIdx
}

const rateClass = (rate) => {
  if (rate === undefined || rate === null || !isFinite(rate)) return ''
  if (rate >= 0.7) return 'rate-good'
  if (rate >= 0.5) return 'rate-warn'
  return 'rate-bad'
}

// ============================================================
// ⭐ 格式化辅助
// ============================================================

const formatPct = (v) => {
  if (v === undefined || v === null || !isFinite(v)) return '-'
  return `${Math.round(v * 100)}%`
}

const formatTTK = (v) => {
  if (v === undefined || v === null || !isFinite(v)) return '-'
  return Math.round(v)
}

const formatCost = (v) => {
  if (v === undefined || v === null || !isFinite(v)) return '-'
  return v.toFixed(1)
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

const formatBulletCost = (v) => {
  if (v === undefined || v === null || !isFinite(v) || v <= 0) return '-'
  if (v >= 10000) return `¥${(v / 10000).toFixed(1)}W`
  return `¥${Math.round(v)}`
}

// ============================================================
// 推荐主流程
// ============================================================

const buildEngineEnemies = () => {
  return enemies.value.map(e => {
    const armor = armorOptions.value.find(a => a.id === e.armorId)
    const helmet = helmetOptions.value.find(h => h.id === e.helmetId)

    return {
      name: e.name || '假想敌',
      weaponId: e.weaponId,
      configId: e.configId,
      bulletId: e.bulletId,
      armorLevel: armor?.level ?? 4,
      armorValue: armor?.value ?? 0,
      helmetLevel: helmet?.level ?? 4,
      helmetValue: helmet?.value ?? 0,
      distance: e.distance
    }
  })
}

const buildEngineParams = () => {
  const p = paramsStore.state
  return {
    hitRateMap: p.hitRateMap || [],
    hitProb: p.hitProb || { head: 0.1, chest: 0.3, stomach: 0.3, limbs: 0.3 },
    triggerDelayEnable: p.triggerDelayEnable !== false,
    healthValue: p.healthValue ?? 100
  }
}

const runRecommend = async () => {
  if (isRunning.value) return
  if (!canRun.value) {
    if (showAlert) {
      await showAlert('⚠️ 请完整配置所有假想敌（武器/配置/子弹/护甲/头盔/距离）')
    }
    return
  }

  const engine = window.__recEngine
  if (!engine) {
    if (showAlert) {
      await showAlert('⚠️ 推荐引擎未初始化（window.__recEngine 不存在）')
    }
    return
  }

  isRunning.value = true
  recommendations.value = null

  // ⭐ 重置加载更多计数
  visibleRestCount.value = 10

  progress.value.visible = true
  progress.value.title = '推荐中...'
  progress.value.phase = '准备中...'
  progress.value.current = 0
  progress.value.total = 0
  progress.value.percent = 0

  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 150))

  const input = {
    budget: budget.value,
    enemies: buildEngineEnemies(),
    params: buildEngineParams(),
    kdRatio: paramsStore.state.kdRatio ?? 1.0,
    extraCost: paramsStore.state.extraCost ?? 30
  }

  console.log('📋 推荐输入:', input)

  const onProgress = (current, total, phase) => {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0

    progress.value.current = current
    progress.value.total = total
    progress.value.percent = percent

    let phaseText = ''
    switch (phase) {
      case 'enumerating':
        phaseText = '① 枚举攻击侧 / 防御侧配置'
        break
      case 'attack':
        phaseText = '② 计算攻击侧 TTK 矩阵'
        break
      case 'defense':
        phaseText = '③ 计算防御侧 TTK 矩阵'
        break
      default:
        phaseText = phase || ''
    }

    progress.value.phase = phaseText
  }

  try {
    const result = await engine.recommend(input, { onProgress, recordLog: true })

    recommendations.value = result.recommendations

    // ⭐ 推荐完成 → 清除 dirty
    recommendDirty.value = false

    engine.printResult(result)

    window.__lastRecResult = result
    console.log('💡 提示：可通过 window.__lastRecResult 获取完整结果')
    console.log('💡 提示：可调用 window.__recEngine.exportResult(window.__lastRecResult) 导出 JSON')

  } catch (error) {
    console.error('❌ 推荐失败:', error)
    if (showAlert) {
      await showAlert('推荐失败: ' + error.message)
    }
  } finally {
    isRunning.value = false
    progress.value.visible = false
    progress.value.percent = 0
    progress.value.current = 0
    progress.value.total = 0
    progress.value.phase = ''
  }
}

// ============================================================
// 初始化
// ============================================================

onMounted(() => {
  if (!dataStore.state.isLoaded) {
    setTimeout(() => {
      enemies.value = [createEnemy(0)]
    }, 800)
  } else {
    enemies.value = [createEnemy(0)]
  }
})
</script>

<style scoped>
/* ============================================================
   容器
   ============================================================ */

.rec-panel {
  width: 100%;
}

/* ============================================================
   说明框
   ============================================================ */

.explain-box {
  background: #f8f9ff;
  border-left: 3px solid var(--color-primary);
  padding: 10px 14px;
  margin-bottom: 16px;
  border-radius: 4px;
  font-size: 12px;
  color: #555;
  line-height: 1.7;
}

.explain-box strong {
  color: var(--color-text);
}

/* ============================================================
   面板
   ============================================================ */

.panel {
  background: #fff;
  border-radius: 8px;
  padding: 14px 18px;
  margin-bottom: 16px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  border: 1px solid #ddd;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-title .badge {
  font-size: 11px;
  font-weight: 500;
  color: #888;
  background: #eef0f5;
  padding: 2px 8px;
  border-radius: 10px;
}

/* ============================================================
   假想敌区
   ============================================================ */

.enemies-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.add-enemy-btn {
  padding: 4px 12px;
  background: #e8f5e9;
  color: #2e7d32;
  border: 1px solid #a5d6a7;
  border-radius: 4px;
  font-family: var(--font-family);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  margin-left: auto;
}

.add-enemy-btn:hover:not(:disabled) {
  background: #d4ead6;
  border-color: #81c784;
}

.add-enemy-btn:disabled {
  background: #f5f5f5;
  color: #bbb;
  border-color: #e0e0e0;
  cursor: not-allowed;
}

/* ---------- 空状态 ---------- */
.enemy-empty-state {
  width: 100%;
  text-align: center;
  padding: 40px 20px;
  color: #999;
  font-size: 13px;
  border: 2px dashed #ddd;
  border-radius: 8px;
  margin-bottom: 14px;
}

.enemy-empty-state .icon {
  font-size: 42px;
  margin-bottom: 12px;
  opacity: 0.45;
}

.enemy-empty-state .title {
  font-size: 14px;
  color: #666;
  margin-bottom: 6px;
  font-weight: 500;
}

.enemy-empty-state .hint {
  font-size: 11px;
  color: #bbb;
  margin-bottom: 20px;
}

.empty-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

.btn-big-random {
  padding: 10px 24px;
  background: #9c27b0;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-family: var(--font-family);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-big-random:hover { background: #7b1fa2; }
.btn-big-random:active { transform: scale(0.97); }

/* ---------- 敌人卡片容器 ---------- */
.enemies-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}

/* ---------- 单个敌人卡片 ---------- */
.enemy-card {
  width: 320px;
  flex-shrink: 0;
  background: #fafbfd;
  border: 1px solid #e0e4ea;
  border-radius: 8px;
  padding: 10px 12px;
  position: relative;
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
}

.enemy-card:hover {
  border-color: var(--color-primary);
}

.enemy-card[data-index="0"] { border-left: 4px solid #f44336; }
.enemy-card[data-index="1"] { border-left: 4px solid #ff9800; }
.enemy-card[data-index="2"] { border-left: 4px solid #9c27b0; }

.enemy-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px dashed #e0e4ea;
  flex-shrink: 0;
}

.enemy-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.enemy-card[data-index="0"] .enemy-index { background: #f44336; }
.enemy-card[data-index="1"] .enemy-index { background: #ff9800; }
.enemy-card[data-index="2"] .enemy-index { background: #9c27b0; }

.enemy-name-input {
  flex: 1;
  min-width: 0;
  padding: 3px 6px;
  border: 1px solid transparent;
  border-radius: 3px;
  font-family: var(--font-family);
  font-size: 12px;
  font-weight: 600;
  background: transparent;
  color: var(--color-text);
  outline: none;
}

.enemy-name-input:hover {
  background: #fff;
  border-color: #e0e0e0;
}

.enemy-name-input:focus {
  background: #fff;
  border-color: var(--color-primary);
}

.btn-reroll {
  flex-shrink: 0;
  height: 22px;
  padding: 0 8px;
  border: 1px solid #d0b3e8;
  border-radius: 4px;
  background: #faf5ff;
  color: #9c27b0;
  font-family: var(--font-family);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  transition: all 0.15s;
  white-space: nowrap;
}

.btn-reroll:hover {
  background: #f3e5f5;
  border-color: #9c27b0;
}

.btn-reroll:active { transform: scale(0.96); }

.remove-enemy-btn {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #ccc;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.remove-enemy-btn:hover {
  background: #ffebee;
  color: #f44336;
}

/* ---------- 卡片主体 ---------- */
.enemy-card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.enemy-field {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
}

.enemy-field .label {
  font-size: 11px;
  color: #888;
  width: 48px;
  flex-shrink: 0;
  text-align: right;
}

.enemy-field select,
.enemy-field input {
  flex: 1;
  min-width: 0;
  padding: 3px 6px;
  border: 1px solid #d0d0d0;
  border-radius: 3px;
  font-family: var(--font-family);
  font-size: 11px;
  background: #fff;
  color: var(--color-text);
  outline: none;
  height: 24px;
  text-align: left;
}

.enemy-field select:focus,
.enemy-field input:focus {
  border-color: var(--color-primary);
}

.enemy-field select:disabled {
  background: #f5f5f5;
  color: #aaa;
  cursor: not-allowed;
}

.enemy-field .distance-input {
  font-family: var(--font-mono);
  font-weight: 600;
  text-align: left;
  color: var(--color-primary);
}

.enemy-field .unit {
  font-size: 10px;
  color: #999;
  flex-shrink: 0;
}

.enemy-field.budget-field {
  background: #fff8e1;
  border: 1px solid #ffe0a8;
  border-radius: 4px;
  padding: 4px 6px;
  margin-bottom: 6px;
}

.enemy-field.budget-field .label {
  color: #e65100;
  font-weight: 600;
  font-size: 11px;
}

.enemy-field.budget-field input {
  border-color: #ffcc80;
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--color-text);
}

.enemy-field.budget-field input:focus {
  border-color: #ff9800;
}

.enemy-field.budget-field .unit {
  color: #e65100;
  font-weight: 500;
}

.card-footer {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed #e0e4ea;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: #888;
}

.card-footer .cost-total {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 12px;
  color: #e67e22;
}

.card-footer .cost-total.over {
  color: #f44336;
}

/* ============================================================
   预算区
   ============================================================ */

.budget-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 20px;
  padding-top: 10px;
  border-top: 1px solid #f0f0f0;
}

.budget-group {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background: #fff8e1;
  border: 1px solid #ffe0a8;
  border-radius: 6px;
}

.budget-group label {
  font-size: 12px;
  font-weight: 600;
  color: #e65100;
  white-space: nowrap;
}

.budget-input {
  width: 90px;
  padding: 4px 8px;
  border: 1px solid #ffcc80;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  background: #fff;
  color: var(--color-text);
  text-align: left;
  outline: none;
}

.budget-input:focus {
  border-color: #ff9800;
}

.budget-unit {
  font-size: 11px;
  color: #e65100;
}

.calc-btn {
  padding: 6px 22px;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-family: var(--font-family);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  margin-left: auto;
}

.calc-btn:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.calc-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* ============================================================
   ⭐ 脏标记提示条
   ============================================================ */

.dirty-hint {
  background: #fff3e0;
  border: 1px solid #ffcc80;
  color: #e65100;
  border-radius: 6px;
  padding: 10px 14px;
  margin-bottom: 16px;
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  animation: dirty-pulse 2s ease-in-out infinite;
}

@keyframes dirty-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.85; }
}

/* ============================================================
   区块标题
   ============================================================ */

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #333;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title .badge {
  font-size: 11px;
  font-weight: 500;
  color: #888;
  background: #eef0f5;
  padding: 2px 8px;
  border-radius: 10px;
}

/* ============================================================
   Top3 网格
   ============================================================ */

.top3-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

/* ============================================================
   空状态（推荐完成后）
   ============================================================ */

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #999;
  font-size: 13px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #ddd;
  margin-bottom: 16px;
}

.empty-state .icon {
  font-size: 40px;
  margin-bottom: 10px;
  opacity: 0.5;
}

.empty-state .hint {
  font-size: 11px;
  color: #bbb;
  margin-top: 6px;
}

/* ============================================================
   进度遮罩
   ============================================================ */

.rec-progress-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100000;
  backdrop-filter: blur(4px);
}

.rec-progress-box {
  background: #fff;
  border-radius: 12px;
  padding: 24px 32px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  min-width: 360px;
  max-width: 480px;
  text-align: center;
}

.rec-progress-icon {
  font-size: 32px;
  margin-bottom: 12px;
  animation: rec-pulse 1.5s ease-in-out infinite;
}

@keyframes rec-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.15); opacity: 0.8; }
}

.rec-progress-title {
  font-family: var(--font-family);
  font-size: 15px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

.rec-progress-phase {
  font-family: var(--font-family);
  font-size: 13px;
  color: var(--color-primary);
  margin-bottom: 12px;
  min-height: 18px;
  font-weight: 500;
}

.rec-progress-bar-container {
  width: 100%;
  height: 8px;
  background: #e8e8e8;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 10px;
}

.rec-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #4a6cf7, #6a8cf7);
  border-radius: 4px;
  transition: width 0.2s ease;
}

.rec-progress-text {
  font-family: var(--font-family);
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.rec-progress-percent {
  font-family: 'Courier New', monospace;
  font-size: 18px;
  font-weight: 600;
  color: #4a6cf7;
  margin-bottom: 12px;
}

.rec-progress-hint {
  font-size: 11px;
  color: #999;
  padding-top: 10px;
  border-top: 1px dashed #eee;
}

/* ============================================================
   Top3 卡片样式
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

.top3-header {
  padding: 10px 14px;
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
  font-size: 18px;
}

.winrate-badge {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 700;
  padding: 3px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.5);
}

.top3-card.rank-1 .winrate-badge {
  color: #7a5c00;
}

.winrate-badge .pct {
  font-size: 10px;
  font-weight: 500;
  opacity: 0.8;
}

.top3-body {
  padding: 12px 14px;
}

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

.buildcode-row {
  padding: 4px 0;
  margin-top: -2px;
}

.buildcode-value {
  font-family: var(--font-mono);
  font-size: 10px;
  color: #4a6cf7;
  background: #f5f7fb;
  padding: 2px 6px;
  border-radius: 3px;
  cursor: text;
  user-select: all;
}

.btn-copy-code {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: #f0f4ff;
  color: var(--color-primary);
  font-size: 11px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.btn-copy-code:hover {
  background: #dde6ff;
}

.btn-copy-code:active {
  transform: scale(0.94);
}

.btn-copy-code.copied {
  background: #e8f5e9;
  color: var(--color-success);
}

.bullet-row .gear-value {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  flex-wrap: nowrap;
  overflow: hidden;
}

.bullet-qty {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: #4a6cf7;
  background: #eef2ff;
  padding: 0 5px;
  border-radius: 3px;
  flex-shrink: 0;
}

.bullet-price-group {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  flex-shrink: 0;
}

.bullet-unit-price {
  color: #999;
  font-size: 10px;
}

.bullet-total-price {
  color: #e67e22;
  font-weight: 700;
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  flex-wrap: wrap;
}

.avg-hint {
  font-size: 10px;
  color: #bbb;
  font-family: var(--font-mono);
}

.enemy-ttk-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  background: #fafbfd;
  border-radius: 4px;
  margin-bottom: 4px;
  font-size: 11px;
}

.enemy-ttk-row.is-weakest {
  background: #fff3e0;
  border-left: 3px solid #ff9800;
}

.enemy-ttk-row .enemy-name {
  color: #555;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.enemy-ttk-row.is-weakest .enemy-name {
  color: #e65100;
  font-weight: 600;
}

.weakest-tag {
  font-size: 9px;
  background: #ff9800;
  color: #fff;
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
  font-weight: 500;
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

.winrate-cell {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  min-width: 52px;
  text-align: center;
}

.winrate-cell.rate-good {
  color: #4caf50;
  background: #e8f5e9;
}
.winrate-cell.rate-warn {
  color: #ff9800;
  background: #fff3e0;
}
.winrate-cell.rate-bad {
  color: #f44336;
  background: #ffebee;
}

/* ---------- 指标行 ---------- */
.metrics-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
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

.metric-value.rate-good { color: #4caf50; }
.metric-value.rate-warn { color: #ff9800; }
.metric-value.rate-bad  { color: #f44336; }

.metric-value.gear-total {
  color: #e67e22;
}

/* ---------- ⭐ Top3 底部操作 ---------- */
.top3-actions {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #f0f0f0;
  display: flex;
  justify-content: center;
}

.btn-add-as-enemy {
  padding: 6px 18px;
  background: #e8f5e9;
  color: #2e7d32;
  border: 1px solid #a5d6a7;
  border-radius: 5px;
  font-family: var(--font-family);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.btn-add-as-enemy:hover:not(:disabled) {
  background: #c8e6c9;
  border-color: #81c784;
}

.btn-add-as-enemy:active:not(:disabled) {
  transform: scale(0.97);
}

.btn-add-as-enemy:disabled {
  background: #f5f5f5;
  color: #bbb;
  border-color: #e0e0e0;
  cursor: not-allowed;
}

/* ============================================================
   ⭐ 第 4~30 名表格
   ============================================================ */

.topn-table-wrapper {
  background: #fff;
  border-radius: 8px;
  padding: 14px 18px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  border: 1px solid #ddd;
  overflow-x: auto;
  margin-bottom: 10px;
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

.topn-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  min-width: 1220px;
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

.col-rank { width: 50px; }
.col-weapon { min-width: 160px; }
.col-bullet { min-width: 170px; }
.col-armor { min-width: 150px; }
.col-helmet { min-width: 150px; }
.col-num { text-align: right !important; min-width: 90px; }
.col-action { width: 60px; text-align: center !important; }

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

.cell-main {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.cell-main-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
  font-weight: 500;
  font-size: 12px;
}

.cell-sub {
  margin-top: 2px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: #999;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-price { color: #e67e22; }

.weapon-cell { cursor: help; }
.bullet-cell { cursor: help; }
.armor-cell { cursor: help; }

.bullet-qty-inline {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-weight: 700;
  color: #4a6cf7;
  font-size: 10px;
}

.bullet-unit-price-mini {
  color: #999;
  margin-right: 6px;
}

.bullet-total-price-mini {
  color: #e67e22;
  font-weight: 700;
}

.btn-copy-mini {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 3px;
  background: #f0f4ff;
  color: var(--color-primary);
  font-size: 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  padding: 0;
  line-height: 1;
}

.btn-copy-mini:hover { background: #dde6ff; }
.btn-copy-mini:active { transform: scale(0.92); }
.btn-copy-mini.copied { background: #e8f5e9; color: var(--color-success); }

.num-cell {
  font-family: var(--font-mono);
  font-weight: 600;
  text-align: right;
  white-space: nowrap;
}

.num-cell.ttk-attack { color: #f44336; }
.num-cell.ttk-defense { color: #4caf50; }
.num-cell.gear-total { color: #e67e22; }

.num-cell.winrate {
  font-weight: 700;
  font-size: 13px;
}

.num-cell.winrate.rate-good { color: #4caf50; }
.num-cell.winrate.rate-warn { color: #ff9800; }
.num-cell.winrate.rate-bad  { color: #f44336; }

/* ⭐ 操作列 */
.action-cell {
  text-align: center !important;
  padding: 4px 6px;
}

.btn-add-as-enemy-mini {
  width: 28px;
  height: 28px;
  border: 1px solid #a5d6a7;
  border-radius: 5px;
  background: #e8f5e9;
  color: #2e7d32;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  padding: 0;
}

.btn-add-as-enemy-mini:hover:not(:disabled) {
  background: #c8e6c9;
  border-color: #81c784;
  transform: scale(1.05);
}

.btn-add-as-enemy-mini:active:not(:disabled) {
  transform: scale(0.95);
}

.btn-add-as-enemy-mini:disabled {
  background: #f5f5f5;
  color: #bbb;
  border-color: #e0e0e0;
  cursor: not-allowed;
}

/* ⭐ 加载更多 */
.load-more-row {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
}

.btn-load-more {
  padding: 10px 28px;
  background: #fff;
  color: var(--color-primary);
  border: 1.5px dashed var(--color-primary);
  border-radius: 8px;
  font-family: var(--font-family);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.btn-load-more:hover {
  background: #f0f4ff;
  border-color: var(--color-primary-hover);
  color: var(--color-primary-hover);
}

.btn-load-more:active {
  transform: scale(0.98);
}

/* ============================================================
   移动端适配
   ============================================================ */

@media (max-width: 768px) {
  .panel {
    padding: 10px 12px;
  }

  .explain-box {
    padding: 8px 12px;
    font-size: 11px;
    line-height: 1.6;
  }

  .enemies-grid {
    gap: 8px;
  }

  .enemy-card {
    width: 100%;
    padding: 8px 10px;
  }

  .enemy-field .label {
    font-size: 10px;
    width: 40px;
  }

  .enemy-field select,
  .enemy-field input {
    font-size: 10px;
    height: 26px;
  }

  .enemy-empty-state {
    padding: 30px 16px;
  }

  .enemy-empty-state .icon {
    font-size: 36px;
  }

  .btn-big-random {
    width: 100%;
    justify-content: center;
    padding: 10px 16px;
  }

  .empty-actions {
    flex-direction: column;
    gap: 8px;
  }

  .budget-row {
    gap: 6px 12px;
  }

  .budget-input {
    width: 70px;
    font-size: 12px;
  }

  .calc-btn {
    width: 100%;
    margin-left: 0;
    padding: 8px 16px;
  }

  .dirty-hint {
    padding: 8px 12px;
    font-size: 12px;
  }

  .top3-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .section-title {
    font-size: 14px;
  }

  .rec-progress-box {
    padding: 20px 24px;
    min-width: 280px;
    max-width: 90vw;
  }

  .top3-header {
    padding: 8px 12px;
    font-size: 12px;
  }

  .top3-header .rank-num {
    font-size: 16px;
  }

  .winrate-badge {
    font-size: 13px;
    padding: 2px 10px;
  }

  .winrate-badge .pct {
    font-size: 9px;
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

  .buildcode-value {
    font-size: 9px;
  }

  .bullet-qty {
    font-size: 10px;
    padding: 0 4px;
  }

  .bullet-unit-price {
    font-size: 9px;
  }

  .enemy-ttk-row {
    font-size: 10px;
    padding: 5px 6px;
    gap: 6px;
  }

  .enemy-ttk-row .ttk-item {
    font-size: 10px;
  }

  .winrate-cell {
    font-size: 12px;
    min-width: 46px;
    padding: 2px 6px;
  }

  .metrics-row {
    grid-template-columns: repeat(2, 1fr);
    gap: 5px;
  }

  .metric {
    padding: 5px 2px;
  }

  .metric-label {
    font-size: 9px;
  }

  .metric-value {
    font-size: 13px;
  }

  .metric-value small {
    font-size: 9px;
  }

  .btn-add-as-enemy {
    width: 100%;
    justify-content: center;
  }

  .topn-table-wrapper {
    padding: 10px 12px;
  }

  .topn-table {
    font-size: 11px;
    min-width: 1040px;
  }

  .topn-table thead th {
    padding: 6px 8px;
    font-size: 10px;
  }

  .topn-table tbody td {
    padding: 4px 6px;
  }

  .col-rank { width: 40px; }
  .col-weapon { min-width: 120px; }
  .col-bullet { min-width: 120px; }
  .col-armor { min-width: 110px; }
  .col-helmet { min-width: 110px; }
  .col-num { min-width: 75px; }
  .col-action { width: 50px; }

  .rank-cell .rank-badge {
    min-width: 18px;
    height: 18px;
    line-height: 18px;
    font-size: 10px;
  }

  .cell-main-text {
    font-size: 11px;
  }

  .cell-sub {
    font-size: 9px;
  }

  .btn-copy-mini {
    width: 16px;
    height: 16px;
    font-size: 9px;
  }

  .btn-add-as-enemy-mini {
    width: 24px;
    height: 24px;
    font-size: 12px;
  }

  .btn-load-more {
    width: 100%;
    justify-content: center;
    padding: 10px 16px;
  }
}
</style>