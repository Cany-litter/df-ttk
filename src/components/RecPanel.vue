<!-- src/components/RecPanel.vue -->
<template>
  <div class="rec-panel">
    <!-- ============================================================ -->
    <!-- 顶部说明 -->
    <!-- ============================================================ -->
    <div class="explain-box">
      <strong>📖 配装推荐说明：</strong>
      ① 假想敌默认 1 个，最多 3 个，每个敌人有独立的<b>交战距离</b><br>
      ② 在预算内推荐最优的<b>枪械 / 子弹 / 护甲 / 头盔</b>组合<br>
      ③ 评分：对每个敌人算「生存TTK / 进攻TTK」比值，取<b>最小值</b>（越大越好）<br>
      ④ 展示：Top 3 卡片 + 第 4~10 名表格
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

      <div class="enemies-grid">
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
              v-if="enemies.length > 1"
              class="remove-enemy-btn"
              title="删除"
              @click="removeEnemy(index)"
            >
              ✕
            </button>
          </div>

          <!-- 主体 -->
          <div class="enemy-card-body">
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
              <select v-model="enemy.armorId">
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
              <select v-model="enemy.helmetId">
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

            <!-- 距离（⭐ 左对齐） -->
            <div class="enemy-field">
              <span class="label">距离</span>
              <input
                v-model.number="enemy.distance"
                type="number"
                class="distance-input"
                min="0"
                max="200"
                step="1"
              />
              <span class="unit">m</span>
            </div>
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
    <!-- 摘要区 -->
    <!-- ============================================================ -->
    <div v-if="recommendations" class="summary-box">
      <div class="summary-line-1">
        💰 预算 <strong>{{ budget }}W</strong> 内，共
        <strong>{{ recommendations.allCount }}</strong> 套方案符合条件
      </div>

      <div
        v-if="champion"
        class="summary-champion"
      >
        <span class="champion-badge">🏆</span>
        <div class="champion-info">
          <div class="champion-title">最优推荐</div>
          <div class="champion-gear">
            {{ championGearText }}
          </div>
        </div>
        <div class="champion-stats">
          <div class="champion-stat">
            <div class="k">对敌比值</div>
            <div class="v">{{ champion.ratio.toFixed(2) }}</div>
          </div>
          <div class="champion-stat">
            <div class="k">单局消耗</div>
            <div class="v">{{ champion.cost.totalW.toFixed(1) }}<small>W</small></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- Top 3 卡片（原 RecCard 内联） -->
    <!-- ============================================================ -->
    <template v-if="recommendations && recommendations.topN.length > 0">
      <div class="section-title">
        🏅 Top 3 推荐
        <span class="badge">按对敌比值排序</span>
      </div>

      <div class="top3-grid">
        <div
          v-for="rec in recommendations.topN"
          :key="rec.rank"
          class="top3-card"
          :class="`rank-${rec.rank}`"
        >
          <!-- 头部 -->
          <div class="top3-header">
            <div class="rank-label">
              <span class="rank-num">{{ rankIcon(rec.rank) }}</span>
              <span>推荐 #{{ rec.rank }}</span>
            </div>
            <span class="ratio-score">比值 {{ formatRatio(rec.ratio) }}</span>
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

            <div class="gear-row">
              <span class="gear-icon">💊</span>
              <span class="gear-label">子弹</span>
              <span class="gear-value" :title="bulletLabel(rec)">
                {{ bulletLabel(rec) }}
              </span>
              <span class="gear-price">{{ formatBulletPrice(rec.gear.bullet.price) }}/发</span>
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
                  {{ formatTTK(primaryAttackTTK(rec)) }}<small>ms</small>
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
      </div>
    </template>

    <!-- ============================================================ -->
    <!-- 第 4~10 名表格（原 RecTable 内联） -->
    <!-- ============================================================ -->
    <template v-if="recommendations && recommendations.rest.length > 0">
      <div class="section-title">
        📊 第 4~10 名
        <span class="badge">{{ recommendations.rest.length }} 套 · 按对敌比值排序</span>
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
              <th class="col-num">进攻TTK</th>
              <th class="col-num">生存TTK</th>
              <th class="col-num">对敌比值</th>
              <th class="col-num">单局消耗</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(rec, idx) in recommendations.rest" :key="rec.rank || idx">
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

          <!-- 阶段文案 -->
          <div class="rec-progress-phase">{{ progress.phase }}</div>

          <!-- 进度条 -->
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

          <!-- 提示 -->
          <div class="rec-progress-hint">
            💡 首次推荐可能需要较长时间，请耐心等待
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

// ============================================================
// 状态
// ============================================================

const budget = ref(100)
const isRunning = ref(false)
const recommendations = ref(null)

/**
 * 假想敌列表
 * 每个敌人：{ _id, name, weaponId, configId, bulletId, armorId, helmetId, distance }
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
// 数据选项（从 dataStore 读取）
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

/**
 * 获取某武器的配置列表
 */
const getConfigOptions = (weaponId) => {
  if (!weaponId) return []
  return dataStore.getPriceRowsForWeapon(weaponId) || []
}

/**
 * 获取某武器的子弹列表
 */
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
// 假想敌操作
// ============================================================

/**
 * 创建一个新的假想敌对象
 */
const createEnemy = (index = 0) => {
  _enemyIdCounter += 1
  return {
    _id: `enemy_${Date.now()}_${_enemyIdCounter}`,
    name: `假想敌 ${index + 1}`,
    weaponId: null,
    configId: null,
    bulletId: null,
    armorId: null,
    helmetId: null,
    distance: 30
  }
}

/**
 * 添加假想敌
 */
const addEnemy = () => {
  if (enemies.value.length >= MAX_ENEMIES) return
  enemies.value.push(createEnemy(enemies.value.length))
}

/**
 * 删除假想敌
 */
const removeEnemy = (index) => {
  if (enemies.value.length <= 1) return
  enemies.value.splice(index, 1)
}

/**
 * 武器变化时，重置配置/子弹，并尝试选中默认配置
 */
const onEnemyWeaponChange = (index) => {
  const enemy = enemies.value[index]
  if (!enemy) return

  // 重置
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

const champion = computed(() => {
  const top = recommendations.value?.topN
  if (!top || top.length === 0) return null
  return top[0]
})

const championGearText = computed(() => {
  const c = champion.value
  if (!c) return ''

  const w = c.gear.weapon
  const b = c.gear.bullet
  const a = c.gear.armor
  const h = c.gear.helmet

  const parts = [
    `${w.name} ${w.configId || ''}`.trim(),
    `${b.name} Lv.${b.level}`,
    `${a.name} Lv.${a.level}`,
    `${h.name} Lv.${h.level}`
  ]

  return parts.join(' · ')
})

// ============================================================
// ⭐ 装备标签辅助（原 RecCard / RecTable 合并去重）
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
  return `${a.name} Lv.${a.level}（${a.value}）`
}

const helmetLabel = (rec) => {
  const h = rec?.gear?.helmet
  if (!h) return '-'
  return `${h.name} Lv.${h.level}（${h.value}）`
}

/**
 * 排名图标
 */
const rankIcon = (rank) => {
  switch (rank) {
    case 1: return '🥇'
    case 2: return '🥈'
    case 3: return '🥉'
    default: return '🏅'
  }
}

/**
 * 取第一个敌人的进攻 TTK
 */
const primaryAttackTTK = (rec) => {
  const arr = rec?.perEnemy
  if (!arr || arr.length === 0) return 0
  return arr[0].attackTTK || 0
}

/**
 * 取第一个敌人的生存 TTK
 */
const primaryDefenseTTK = (rec) => {
  const arr = rec?.perEnemy
  if (!arr || arr.length === 0) return 0
  return arr[0].defenseTTK || 0
}

/**
 * 多敌人时的 tooltip（显示每个敌人的比值）
 */
const ratioTooltip = (rec) => {
  const arr = rec?.perEnemy
  if (!arr || arr.length === 0) return ''
  if (arr.length === 1) return ''
  return arr.map(e => `${e.name}: ${formatRatio(e.ratio)}`).join('\n')
}

// ============================================================
// ⭐ 格式化辅助（原 RecCard / RecTable 合并去重）
// ============================================================

const formatRatio = (v) => {
  if (v === undefined || v === null || !isFinite(v)) return '-'
  return v.toFixed(2)
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

// ============================================================
// ⭐ 颜色分档（原 RecCard / RecTable 合并去重）
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

// ============================================================
// 推荐主流程
// ============================================================

/**
 * 把 UI 的假想敌对象转换为 RecEngine 需要的格式
 */
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

/**
 * 把 paramsStore 转换为 RecEngine 需要的 params
 */
const buildEngineParams = () => {
  const p = paramsStore.state
  return {
    hitRateMap: p.hitRateMap || [],
    hitProb: p.hitProb || { head: 0.1, chest: 0.3, stomach: 0.3, limbs: 0.3 },
    triggerDelayEnable: p.triggerDelayEnable !== false,
    healthValue: p.healthValue ?? 100
  }
}

/**
 * 开始推荐
 *
 * ⭐ 缓存策略：
 * - 不再每次推荐前 clearAll()，让 ttkCache 跨推荐复用
 * - 第一次推荐：全量计算（约 50 秒）
 * - 第二次推荐（同假想敌、同预算）：全部命中（约 1 秒）
 * - 改预算：全部命中（预算不影响 TTK）
 * - 改假想敌护甲：攻击侧重算、防御侧命中
 * - 改假想敌武器：攻击侧命中、防御侧重算
 * - 改场景参数（命中率/扳机/生命值）：全部重算
 *
 * ⭐ 清空缓存的时机：
 * - 点「重置数据」时（App.vue 的 resetData 里处理）
 * - 手动调 window.__ttkCacheManager.clearAll()
 */
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

  // ⭐ 先显示进度遮罩，await nextTick + 小延迟，确保遮罩渲染出来
  progress.value.visible = true
  progress.value.title = '推荐中...'
  progress.value.phase = '准备中...'
  progress.value.current = 0
  progress.value.total = 0
  progress.value.percent = 0

  await nextTick()
  // 再等 150ms，让浏览器完成遮罩绘制
  await new Promise(resolve => setTimeout(resolve, 150))

  // ⭐ 不再清空 ttkCache，让缓存跨推荐复用

  const input = {
    budget: budget.value,
    enemies: buildEngineEnemies(),
    params: buildEngineParams(),
    kdRatio: paramsStore.state.kdRatio ?? 1.0,
    extraCost: paramsStore.state.extraCost ?? 30
  }

  console.log('📋 推荐输入:', input)

  // ⭐ 进度回调
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
        phaseText = '② 计算攻击侧 TTK'
        break
      case 'defense':
        phaseText = '③ 计算防御侧 TTK'
        break
      default:
        phaseText = phase || ''
    }

    progress.value.phase = phaseText
  }

  try {
    const result = await engine.recommend(input, { onProgress, recordLog: true })

    recommendations.value = result.recommendations

    // 打印到控制台
    engine.printResult(result)

    // 导出结果（可选，调试用）
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

const createDefaultEnemy = () => {
  const enemy = createEnemy(0)

  const weapons = weaponOptions.value
  if (weapons.length > 0) {
    enemy.weaponId = weapons[0].id

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
  }

  const armors = armorOptions.value
  if (armors.length > 0) {
    const lv5 = armors.find(a => a.level === 5)
    enemy.armorId = (lv5 || armors[0]).id
  }

  const helmets = helmetOptions.value
  if (helmets.length > 0) {
    const lv5 = helmets.find(h => h.level === 5)
    enemy.helmetId = (lv5 || helmets[0]).id
  }

  return enemy
}

onMounted(() => {
  if (!dataStore.state.isLoaded) {
    setTimeout(() => {
      enemies.value = [createDefaultEnemy()]
    }, 800)
  } else {
    enemies.value = [createDefaultEnemy()]
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

/* ---------- 敌人卡片容器 ---------- */
.enemies-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}

/* ---------- 单个敌人卡片 ---------- */
.enemy-card {
  width: 300px;
  min-height: 240px;
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

/* ---------- 卡片头部 ---------- */
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
  /* ⭐ 默认左对齐 */
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

/* ⭐ 距离输入框：左对齐（和其他输入框一致） */
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
   摘要区
   ============================================================ */

.summary-box {
  background: linear-gradient(135deg, #f8f9ff, #eef2ff);
  border: 1px solid #d0ddff;
  border-radius: 8px;
  padding: 14px 18px;
  margin-bottom: 16px;
}

.summary-line-1 {
  font-size: 13px;
  color: #555;
  margin-bottom: 8px;
}

.summary-line-1 strong {
  color: var(--color-primary);
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 700;
  padding: 0 2px;
}

.summary-champion {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #e0e6ff;
}

.champion-badge {
  font-size: 20px;
  flex-shrink: 0;
}

.champion-info {
  flex: 1;
  min-width: 0;
}

.champion-title {
  font-size: 11px;
  color: #888;
  margin-bottom: 2px;
}

.champion-gear {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.champion-stats {
  display: flex;
  gap: 16px;
  flex-shrink: 0;
  padding-left: 12px;
  border-left: 1px dashed #e0e6ff;
}

.champion-stat {
  text-align: center;
}

.champion-stat .k {
  font-size: 10px;
  color: #888;
  margin-bottom: 2px;
}

.champion-stat .v {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 700;
  color: var(--color-primary);
}

.champion-stat .v small {
  font-size: 10px;
  font-weight: 400;
  color: #888;
  margin-left: 1px;
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
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

/* ============================================================
   空状态
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

/* ⭐ 阶段文案 */
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

/* ⭐ 提示 */
.rec-progress-hint {
  font-size: 11px;
  color: #999;
  padding-top: 10px;
  border-top: 1px dashed #eee;
}

/* ============================================================
   ⭐ Top3 卡片样式（原 RecCard.vue 内联）
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
   ⭐ 第 4~10 名表格样式（原 RecTable.vue 内联）
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

/* ---------- 列宽 ---------- */
.col-rank { width: 50px; }
.col-weapon { min-width: 140px; }
.col-bullet { min-width: 140px; }
.col-armor { min-width: 130px; }
.col-helmet { min-width: 130px; }
.col-num { text-align: right !important; min-width: 90px; }

/* ---------- 单元格样式 ---------- */
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

.weapon-cell {
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.bullet-cell {
  font-family: var(--font-mono);
  font-size: 11px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.armor-cell {
  font-size: 11px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}

.num-cell {
  font-family: var(--font-mono);
  font-weight: 600;
  text-align: right;
  white-space: nowrap;
}

.num-cell.ttk-attack { color: #f44336; }
.num-cell.ttk-defense { color: #4caf50; }
.num-cell.cost { color: #e67e22; }

.num-cell.ratio {
  color: var(--color-primary);
  font-weight: 700;
  cursor: help;
}

.num-cell.ratio.ratio-good { color: #4caf50; }
.num-cell.ratio.ratio-warn { color: #ff9800; }
.num-cell.ratio.ratio-bad  { color: #f44336; }

.num-cell.cost.cost-good { color: #4caf50; }
.num-cell.cost.cost-warn { color: #ff9800; }
.num-cell.cost.cost-bad  { color: #f44336; }

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
    min-height: auto;
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

  .summary-box {
    padding: 10px 12px;
  }

  .summary-champion {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .champion-stats {
    flex-direction: row;
    gap: 12px;
    padding-left: 0;
    padding-top: 8px;
    border-left: none;
    border-top: 1px dashed #e0e6ff;
    width: 100%;
    justify-content: center;
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

  /* ⭐ Top3 卡片移动端 */
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

  /* ⭐ 表格移动端 */
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