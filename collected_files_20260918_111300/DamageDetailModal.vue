<!-- src/components/DamageDetailModal.vue -->
<template>
  <div v-if="visible" class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <!-- 头部 -->
      <div class="modal-header">
        <h3>
          📊 单次伤害模拟
          <span class="sub">{{ weaponName }} {{ configId }} · {{ distance }}m</span>
        </h3>
        <button class="modal-close" @click="close">&times;</button>
      </div>

      <!-- 内容 -->
      <div class="modal-body">
        <!-- 顶部摘要 + 再来一次 -->
        <div class="sim-toolbar">
          <div class="sim-summary">
            <template v-if="simResult">
              本次击杀共 <strong>{{ simResult.shots }}</strong> 发
              （命中 <strong>{{ simResult.hits }}</strong>），
              造成 <strong>{{ totalDamage.toFixed(1) }}</strong> 点伤害
            </template>
            <template v-else>
              正在模拟…
            </template>
          </div>
          <button class="reroll-btn" @click="reroll" :disabled="isRolling">
            🎲 再来一次
          </button>
        </div>

        <!-- ⭐ TTK 分解 -->
        <div v-if="simResult" class="ttk-breakdown">
          <div class="breakdown-item">
            <span class="breakdown-label">飞行延迟</span>
            <span class="breakdown-value">{{ flightMs.toFixed(1) }}<small>ms</small></span>
          </div>
          <div class="breakdown-item">
            <span class="breakdown-label">射击延迟</span>
            <span class="breakdown-value">{{ shootingMs.toFixed(1) }}<small>ms</small></span>
          </div>
          <div class="breakdown-item" v-if="triggerMs > 0">
            <span class="breakdown-label">扳机延迟</span>
            <span class="breakdown-value">{{ triggerMs.toFixed(1) }}<small>ms</small></span>
          </div>
          <div class="breakdown-item" v-if="avgBurstMs > 0">
            <span class="breakdown-label">平均连发间隔</span>
            <span class="breakdown-value">{{ avgBurstMs.toFixed(1) }}<small>ms</small></span>
          </div>
          <div class="breakdown-item total">
            <span class="breakdown-label">总 TTK</span>
            <span class="breakdown-value">{{ totalTtkMs.toFixed(0) }}<small>ms</small></span>
          </div>
        </div>

        <!-- ============================================================ -->
        <!-- ⭐ 桌面：9 列明细表 -->
        <!-- ============================================================ -->
        <table v-if="!isMobile" class="step-table">
          <thead>
            <tr>
              <th>发数</th>
              <th>间隔</th>
              <th>命中</th>
              <th>部位</th>
              <th>最终伤害</th>
              <th>剩余血量</th>
              <th>护甲</th>
              <th>头盔</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(s, idx) in simResult?.steps || []" :key="idx">
              <!-- 连发间隔分隔行 -->
              <tr v-if="s.burstGapBefore > 0" class="burst-gap-row">
                <td colspan="9">
                  <span class="burst-gap-text">
                    ⏱ 连发间隔 +{{ (s.burstGapBefore * 1000).toFixed(0) }} ms
                  </span>
                </td>
              </tr>

              <!-- 未命中行 -->
              <tr v-if="!s.hit" class="miss-row">
                <td>{{ s.shot }}</td>
                <td class="interval-cell">{{ formatInterval(s.shotIntervalBefore) }}</td>
                <td>❌</td>
                <td>-</td>
                <td>-</td>
                <td>{{ s.health.toFixed(2) }}</td>
                <td>{{ s.armorVal.toFixed(0) }}</td>
                <td>{{ s.helmetVal.toFixed(0) }}</td>
                <td>-</td>
              </tr>

              <!-- 命中行 -->
              <tr v-else class="hit-row">
                <td>{{ s.shot }}</td>
                <td class="interval-cell">{{ formatInterval(s.shotIntervalBefore) }}</td>
                <td>✅</td>
                <td>
                  <span class="hit-part-badge" :class="partCls(s.hitPart)">
                    {{ partLabel(s.hitPart) }}
                  </span>
                </td>
                <td class="dmg-cell">-{{ s.finalDamage.toFixed(2) }}</td>
                <td>
                  {{ s.health.toFixed(2) }}
                  <span v-if="idx === (simResult.steps.length - 1)">💀</span>
                </td>
                <td>{{ s.armorVal.toFixed(0) }}</td>
                <td>{{ s.helmetVal.toFixed(0) }}</td>
                <td>
                  <span class="expand-toggle" @click="toggleDetail(idx)">
                    {{ expandedSet.has(idx) ? '收起 ▲' : '展开 ▼' }}
                  </span>
                </td>
              </tr>

              <!-- 展开详情行 -->
              <tr v-if="s.hit && expandedSet.has(idx)" class="detail-row-wrap">
                <td colspan="9" class="detail-cell">
                  <div class="step-detail active">
                    <div class="detail-title">第 {{ s.shot }} 发详细计算</div>

                    <template v-if="s.shot > 1">
                      <div class="detail-row">
                        <span class="detail-label">射击间隔：</span>
                        <span class="detail-value">
                          {{ (s.shotIntervalBefore * 1000).toFixed(2) }} ms
                          （射速 ≈ {{ intervalToRof(s.shotIntervalBefore).toFixed(0) }} RPM）
                        </span>
                      </div>
                      <div v-if="s.burstGapBefore > 0" class="detail-row">
                        <span class="detail-label">连发间隔：</span>
                        <span class="detail-value">
                          {{ (s.burstGapBefore * 1000).toFixed(0) }} ms
                        </span>
                      </div>
                      <div class="detail-divider"></div>
                    </template>

                    <div class="detail-row">
                      <span class="detail-label">命中部位：</span>
                      <span class="detail-value">
                        {{ partLabel(s.hitPart) }}（武器倍率 = {{ s.debug.mult }}）
                      </span>
                    </div>

                    <div class="detail-row">
                      <span class="detail-label">基础伤害：</span>
                      <span class="detail-value">
                        {{ s.debug.weaponFlesh }}（肉伤）
                        <template v-if="s.debug.partMult !== undefined && s.debug.partMult !== 1">
                          × {{ s.debug.partMult }}（子弹倍率）
                        </template>
                        × {{ s.debug.mult }}（武器倍率）
                        = {{ s.debug.baseDamage.toFixed(2) }}
                      </span>
                    </div>

                    <div class="detail-row">
                      <span class="detail-label">距离衰减：</span>
                      <span class="detail-value">× {{ s.debug.decay.toFixed(2) }}</span>
                    </div>

                    <div class="detail-row">
                      <span class="detail-label">纯伤害：</span>
                      <span class="detail-value">
                        {{ s.debug.baseDamage.toFixed(2) }} × {{ s.debug.decay.toFixed(2) }}
                        = {{ s.debug.pureDamage.toFixed(2) }}
                      </span>
                    </div>

                    <div class="detail-divider"></div>

                    <template v-if="s.debug.ignoreArmor">
                      <div class="detail-row">
                        <span class="detail-label">{{ partLabel(s.hitPart) }}：</span>
                        <span class="detail-value">无视护甲减伤</span>
                      </div>
                      <div class="detail-row">
                        <span class="detail-label">最终伤害：</span>
                        <span class="detail-value dmg-final">{{ s.finalDamage.toFixed(2) }}</span>
                      </div>
                    </template>

                    <template v-else>
                      <div class="detail-row">
                        <span class="detail-label">
                          {{ isHelmetPart(s.hitPart) ? '头盔' : '护甲' }}穿透：
                        </span>
                        <span class="detail-value">{{ s.debug.pen }}（Lv.{{ armorLevel }}）</span>
                      </div>
                      <div class="detail-row">
                        <span class="detail-label">穿透伤害：</span>
                        <span class="detail-value">
                          {{ s.debug.pureDamage.toFixed(2) }} × {{ s.debug.pen }}
                          = {{ s.debug.penDamage.toFixed(2) }}
                        </span>
                      </div>
                      <div class="detail-row">
                        <span class="detail-label">
                          {{ isHelmetPart(s.hitPart) ? '头盔' : '护甲' }}伤害：
                        </span>
                        <span class="detail-value">
                          {{ s.debug.armorDamage !== null ? s.debug.armorDamage.toFixed(2) : '-' }}
                        </span>
                      </div>
                      <div class="detail-divider"></div>
                      <div class="detail-row">
                        <span class="detail-label">
                          {{ isHelmetPart(s.hitPart) ? '头盔' : '护甲' }}判定：
                        </span>
                        <span class="detail-value">
                          {{ s.debug.armorBefore?.toFixed(0) }} -
                          {{ s.debug.armorDamage?.toFixed(0) }} =
                          {{ s.debug.armorAfter?.toFixed(0) }}
                          <template v-if="s.debug.armorBroken">（已击穿 💥）</template>
                          <template v-else>（未击穿）</template>
                        </span>
                      </div>
                      <div class="detail-row">
                        <span class="detail-label">最终伤害：</span>
                        <span class="detail-value dmg-final">{{ s.finalDamage.toFixed(2) }}</span>
                      </div>
                    </template>

                    <div class="detail-divider"></div>
                    <div class="detail-row">
                      <span class="detail-label">血量变化：</span>
                      <span class="detail-value">
                        {{ (s.health + s.finalDamage).toFixed(2) }} → {{ s.health.toFixed(2) }}
                      </span>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>

        <!-- ============================================================ -->
        <!-- ⭐ 移动端：每发一个紧凑块（两行制） -->
        <!-- ============================================================ -->
        <div v-else class="step-list">
          <template v-for="(s, idx) in simResult?.steps || []" :key="idx">
            <!-- 连发间隔分隔行 -->
            <div v-if="s.burstGapBefore > 0" class="burst-gap-divider">
              ⏱ 连发间隔 +{{ (s.burstGapBefore * 1000).toFixed(0) }} ms
            </div>

            <!-- 未命中的发 -->
            <div v-if="!s.hit" class="step-item miss-item">
              <div class="step-line-1">
                <span class="step-shot">#{{ s.shot }}</span>
                <span class="step-hit">❌</span>
                <span class="step-part">未命中</span>
                <span class="step-damage">-</span>
                <span class="step-health">{{ s.health.toFixed(2) }}</span>
              </div>
              <div class="step-line-2">
                <span class="step-meta">间隔 {{ formatInterval(s.shotIntervalBefore) }}</span>
                <span class="step-meta">甲 {{ s.armorVal.toFixed(0) }}</span>
                <span class="step-meta">头 {{ s.helmetVal.toFixed(0) }}</span>
              </div>
            </div>

            <!-- 命中的发 -->
            <template v-else>
              <div class="step-item hit-item">
                <div class="step-line-1">
                  <span class="step-shot">#{{ s.shot }}</span>
                  <span class="step-hit">✅</span>
                  <span class="hit-part-badge" :class="partCls(s.hitPart)">
                    {{ partLabel(s.hitPart) }}
                  </span>
                  <span class="step-damage">-{{ s.finalDamage.toFixed(2) }}</span>
                  <span class="step-health">
                    {{ s.health.toFixed(2) }}
                    <span v-if="idx === (simResult.steps.length - 1)">💀</span>
                  </span>
                </div>
                <div class="step-line-2">
                  <span class="step-meta">间隔 {{ formatInterval(s.shotIntervalBefore) }}</span>
                  <span class="step-meta">甲 {{ s.armorVal.toFixed(0) }}</span>
                  <span class="step-meta">头 {{ s.helmetVal.toFixed(0) }}</span>
                  <span class="step-toggle" @click="toggleDetail(idx)">
                    {{ expandedSet.has(idx) ? '收起 ▲' : '展开 ▼' }}
                  </span>
                </div>
              </div>

              <!-- 展开详情 -->
              <div v-if="expandedSet.has(idx)" class="step-detail active mobile-detail">
                <div class="detail-title">第 {{ s.shot }} 发详细计算</div>

                <template v-if="s.shot > 1">
                  <div class="detail-row">
                    <span class="detail-label">射击间隔：</span>
                    <span class="detail-value">
                      {{ (s.shotIntervalBefore * 1000).toFixed(2) }} ms
                      （射速 ≈ {{ intervalToRof(s.shotIntervalBefore).toFixed(0) }} RPM）
                    </span>
                  </div>
                  <div v-if="s.burstGapBefore > 0" class="detail-row">
                    <span class="detail-label">连发间隔：</span>
                    <span class="detail-value">
                      {{ (s.burstGapBefore * 1000).toFixed(0) }} ms
                    </span>
                  </div>
                  <div class="detail-divider"></div>
                </template>

                <div class="detail-row">
                  <span class="detail-label">命中部位：</span>
                  <span class="detail-value">
                    {{ partLabel(s.hitPart) }}（武器倍率 = {{ s.debug.mult }}）
                  </span>
                </div>

                <div class="detail-row">
                  <span class="detail-label">基础伤害：</span>
                  <span class="detail-value">
                    {{ s.debug.weaponFlesh }}（肉伤）
                    <template v-if="s.debug.partMult !== undefined && s.debug.partMult !== 1">
                      × {{ s.debug.partMult }}（子弹倍率）
                    </template>
                    × {{ s.debug.mult }}（武器倍率）
                    = {{ s.debug.baseDamage.toFixed(2) }}
                  </span>
                </div>

                <div class="detail-row">
                  <span class="detail-label">距离衰减：</span>
                  <span class="detail-value">× {{ s.debug.decay.toFixed(2) }}</span>
                </div>

                <div class="detail-row">
                  <span class="detail-label">纯伤害：</span>
                  <span class="detail-value">
                    {{ s.debug.baseDamage.toFixed(2) }} × {{ s.debug.decay.toFixed(2) }}
                    = {{ s.debug.pureDamage.toFixed(2) }}
                  </span>
                </div>

                <div class="detail-divider"></div>

                <template v-if="s.debug.ignoreArmor">
                  <div class="detail-row">
                    <span class="detail-label">{{ partLabel(s.hitPart) }}：</span>
                    <span class="detail-value">无视护甲减伤</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">最终伤害：</span>
                    <span class="detail-value dmg-final">{{ s.finalDamage.toFixed(2) }}</span>
                  </div>
                </template>

                <template v-else>
                  <div class="detail-row">
                    <span class="detail-label">
                      {{ isHelmetPart(s.hitPart) ? '头盔' : '护甲' }}穿透：
                    </span>
                    <span class="detail-value">{{ s.debug.pen }}（Lv.{{ armorLevel }}）</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">穿透伤害：</span>
                    <span class="detail-value">
                      {{ s.debug.pureDamage.toFixed(2) }} × {{ s.debug.pen }}
                      = {{ s.debug.penDamage.toFixed(2) }}
                    </span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">
                      {{ isHelmetPart(s.hitPart) ? '头盔' : '护甲' }}伤害：
                    </span>
                    <span class="detail-value">
                      {{ s.debug.armorDamage !== null ? s.debug.armorDamage.toFixed(2) : '-' }}
                    </span>
                  </div>
                  <div class="detail-divider"></div>
                  <div class="detail-row">
                    <span class="detail-label">
                      {{ isHelmetPart(s.hitPart) ? '头盔' : '护甲' }}判定：
                    </span>
                    <span class="detail-value">
                      {{ s.debug.armorBefore?.toFixed(0) }} -
                      {{ s.debug.armorDamage?.toFixed(0) }} =
                      {{ s.debug.armorAfter?.toFixed(0) }}
                      <template v-if="s.debug.armorBroken">（已击穿 💥）</template>
                      <template v-else>（未击穿）</template>
                    </span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">最终伤害：</span>
                    <span class="detail-value dmg-final">{{ s.finalDamage.toFixed(2) }}</span>
                  </div>
                </template>

                <div class="detail-divider"></div>
                <div class="detail-row">
                  <span class="detail-label">血量变化：</span>
                  <span class="detail-value">
                    {{ (s.health + s.finalDamage).toFixed(2) }} → {{ s.health.toFixed(2) }}
                  </span>
                </div>
              </div>
            </template>
          </template>
        </div>
      </div>

      <!-- 底部 -->
      <div class="modal-footer">
        <button class="btn-secondary" @click="close">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { dataStore, paramsStore } from '@/stores/stores'
import { SimulationEngine } from '@/core/SimulationEngine'
import { BulletStrategyFactory, setSeed } from '@/core/CombatCore'
import { calculateCurrentValues } from '@/utils/weaponCalc'

const props = defineProps({
  visible: { type: Boolean, default: false },
  weaponId: { type: [Number, String], default: null },
  configId: { type: String, default: '#1' },
  distance: { type: Number, default: 30 }
})

const emit = defineEmits(['update:visible'])

// ---------- 状态 ----------
const simResult = ref(null)
const expandedSet = ref(new Set())
const isRolling = ref(false)

// 当前模拟使用的扳机延迟快照
const triggerEnabled = ref(true)
const triggerDelayRaw = ref(0)

// 固定的"首次打开"种子
const INITIAL_SEED = 12345

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

// ---------- 计算属性 ----------
const weaponName = computed(() => {
  const w = dataStore.getWeaponById(props.weaponId)
  return w?.name || '未知武器'
})

const armorLevel = computed(() => paramsStore.state.armorLevel || 4)

const totalDamage = computed(() => {
  if (!simResult.value) return 0
  return simResult.value.steps
    .filter(s => s.hit)
    .reduce((sum, s) => sum + s.finalDamage, 0)
})

// TTK 分解
const flightMs = computed(() => {
  if (!simResult.value) return 0
  return simResult.value.flightTime * 1000
})

const shootingMs = computed(() => {
  if (!simResult.value) return 0
  return (simResult.value.shootingIntervalTime || 0) * 1000
})

const triggerMs = computed(() => {
  if (!simResult.value) return 0
  return triggerEnabled.value ? (triggerDelayRaw.value || 0) : 0
})

const avgBurstMs = computed(() => {
  if (!simResult.value) return 0
  const count = simResult.value.burstIntervalCount || 0
  if (count <= 0) return 0
  return (simResult.value.burstIntervalTotal / count) * 1000
})

const totalTtkMs = computed(() => {
  if (!simResult.value) return 0
  const burstTotalMs = (simResult.value.burstIntervalTotal || 0) * 1000
  return flightMs.value + shootingMs.value + burstTotalMs + triggerMs.value
})

// ---------- 部位显示辅助 ----------
const PART_LABEL = {
  head: '头部',
  chest: '胸部',
  stomach: '腹部',
  limbs: '四肢'
}
const PART_CLS = {
  head: 'part-head',
  chest: 'part-chest',
  stomach: 'part-stomach',
  limbs: 'part-limbs'
}
const partLabel = (key) => PART_LABEL[key] || '-'
const partCls = (key) => PART_CLS[key] || ''
const isHelmetPart = (key) => key === 'head'

// 间隔显示辅助
const formatInterval = (intervalSec) => {
  if (!intervalSec || intervalSec <= 0) return '-'
  return `${(intervalSec * 1000).toFixed(1)} ms`
}

const intervalToRof = (intervalSec) => {
  if (!intervalSec || intervalSec <= 0) return 0
  return 60 / intervalSec
}

// ---------- 核心：跑一次记录模式模拟 ----------
const runSimulation = (seed) => {
  simResult.value = null
  expandedSet.value = new Set()

  const dm = dataStore.getDataManager()
  const weapon = dm.getWeaponById(props.weaponId)
  if (!weapon) {
    console.warn('⚠️ 未找到武器:', props.weaponId)
    return
  }

  const rows = dm.getPriceRowsForWeapon(props.weaponId) || []
  const row = rows.find(r => r.configId === props.configId)

  if (!row) {
    console.warn('⚠️ 未找到价格配置:', props.configId)
    return
  }

  const barrelId = row.barrelId ?? -1
  const muzzleId = row.muzzleId ?? 0
  const bulletIdFromRow = row.bulletId || null

  const barrel = (barrelId >= 0 && weapon.barrels?.[barrelId]) ? weapon.barrels[barrelId] : null

  const current = calculateCurrentValues(weapon, barrel, muzzleId, 0.09)

  const armedWeapon = {
    ...weapon,
    ...current,
    _current: current,
    _displayName: weapon.name,
    _configId: props.configId,
    triggerDelay: weapon.triggerDelay || 0
  }

  const params = paramsStore.state
  const bulletKey = SimulationEngine.getRealBulletKey(
    bulletIdFromRow,
    armedWeapon,
    params,
    dm
  )
  if (!bulletKey) {
    console.warn('⚠️ 未匹配到子弹')
    return
  }
  const bulletData = dm.getBulletById(bulletKey)
  if (!bulletData) {
    console.warn('⚠️ 子弹数据不存在:', bulletKey)
    return
  }

  let hitRate = params.hitRate
  const rawConfig = row._rawConfig
  if (rawConfig?.distance?.length && rawConfig?.hitRate?.length) {
    const map = rawConfig.distance.map((d, i) => ({ distance: d, rate: rawConfig.hitRate[i] }))
    hitRate = dm.getHitRateFromMap(map, props.distance, params.hitRate ?? 0.85)
  }

  triggerEnabled.value = params.triggerDelayEnable !== false
  triggerDelayRaw.value = weapon.triggerDelay || 0

  const simParams = {
    ...params,
    distance: props.distance,
    hitRate
  }

  setSeed(seed)
  // ⭐ 传入 bulletData，优先用 name 匹配策略
  const strategy = BulletStrategyFactory.getStrategy(bulletKey, bulletData)
  const result = SimulationEngine.simulateOneTTKWithDetail(
    armedWeapon,
    simParams,
    strategy,
    bulletData
  )

  simResult.value = result

  console.log(
    `✅ 单次模拟完成: ${result.shots} 发, 命中 ${result.hits}, ` +
    `TTK ${result.totalTimeMs.toFixed(0)}ms, ` +
    `连发模式=${result.isBurstMode}, ` +
    `连发次数=${result.burstIntervalCount}, ` +
    `分段射速=${current.rofStages ? '有' : '无'}`
  )
}

// ---------- 事件 ----------
const reroll = () => {
  if (isRolling.value) return
  isRolling.value = true
  const newSeed = Date.now() % 2147483647
  runSimulation(newSeed)
  isRolling.value = false
}

const toggleDetail = (idx) => {
  const s = new Set(expandedSet.value)
  if (s.has(idx)) s.delete(idx)
  else s.add(idx)
  expandedSet.value = s
}

const close = () => {
  emit('update:visible', false)
}

watch(() => props.visible, (newVal) => {
  if (newVal) {
    runSimulation(INITIAL_SEED)
  }
})

watch(
  () => [props.weaponId, props.configId, props.distance],
  () => {
    if (props.visible) runSimulation(INITIAL_SEED)
  }
)
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0;
  width: 100%; height: 100%;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
}

.modal-content {
  background: #fff;
  border-radius: 12px;
  width: 900px;
  max-width: 95vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: modalSlideIn 0.25s ease;
}

@keyframes modalSlideIn {
  from { opacity: 0; transform: translateY(-30px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* 头部 */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
}
.modal-header h3 {
  font-family: var(--font-family, inherit);
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
}
.modal-header .sub {
  font-size: 12px;
  color: #888;
  font-weight: 400;
  margin-left: 8px;
}
.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #999;
  padding: 0 4px;
  line-height: 1;
}
.modal-close:hover { color: #333; }

/* 内容 */
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

/* 顶部工具条 */
.sim-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
  flex-wrap: wrap;
}
.sim-summary {
  font-size: 12px;
  color: #666;
}
.sim-summary strong {
  color: #4a6cf7;
  font-family: var(--font-mono, 'Courier New', monospace);
}

.reroll-btn {
  padding: 6px 16px;
  background: #4a6cf7;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}
.reroll-btn:hover { background: #3a5cd7; }
.reroll-btn:active { transform: scale(0.96); }
.reroll-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* TTK 分解 */
.ttk-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px 14px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e8e8e8;
  margin-bottom: 14px;
}
.breakdown-item {
  flex: 1 1 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 8px;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #eee;
  min-width: 90px;
}
.breakdown-item.total {
  background: linear-gradient(135deg, #4a6cf7 0%, #6a8cf7 100%);
  border-color: #4a6cf7;
}
.breakdown-item.total .breakdown-label { color: rgba(255,255,255,0.85); }
.breakdown-item.total .breakdown-value { color: #fff; }
.breakdown-item.total .breakdown-value small { color: rgba(255,255,255,0.85); }

.breakdown-label {
  font-size: 11px;
  color: #888;
  margin-bottom: 3px;
  white-space: nowrap;
}
.breakdown-value {
  font-size: 16px;
  font-weight: 700;
  font-family: var(--font-mono, 'Courier New', monospace);
  color: #1a1a2e;
}
.breakdown-value small {
  font-size: 10px;
  font-weight: 400;
  color: #888;
  margin-left: 2px;
}

/* ============================================================
   桌面：9 列明细表
   ============================================================ */
.step-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.step-table thead th {
  background: #f0f4f8;
  padding: 7px 8px;
  border: 1px solid #e0e0e0;
  font-weight: 600;
  text-align: center;
  font-size: 11px;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 2;
}
.step-table tbody td {
  padding: 6px 8px;
  border: 1px solid #e8e8e8;
  text-align: center;
}
.step-table tbody tr.hit-row { background: #f8fff8; }
.step-table tbody tr.miss-row { background: #fff8f8; color: #999; }

.interval-cell {
  font-family: var(--font-mono, 'Courier New', monospace);
  font-size: 11px;
  color: #6a6a8e;
}

/* 连发间隔分隔行 */
.step-table tbody tr.burst-gap-row {
  background: #f0f4ff;
}
.step-table tbody tr.burst-gap-row td {
  padding: 3px 8px;
  border: 1px solid #dbe4ff;
  border-top: 1px dashed #a8b8f0;
  border-bottom: 1px dashed #a8b8f0;
  text-align: center;
}
.burst-gap-text {
  display: inline-block;
  font-family: var(--font-mono, 'Courier New', monospace);
  font-size: 11px;
  font-weight: 600;
  color: #4a6cf7;
  letter-spacing: 0.3px;
}

.dmg-cell {
  color: #f44336;
  font-weight: 600;
}

/* 部位徽章 */
.hit-part-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  color: #fff;
}
.part-head { background: #f44336; }
.part-chest { background: #4a6cf7; }
.part-stomach { background: #ff9800; }
.part-limbs { background: #9e9e9e; }

/* 展开 toggle */
.expand-toggle {
  cursor: pointer;
  color: #4a6cf7;
  font-size: 11px;
  user-select: none;
  white-space: nowrap;
}
.expand-toggle:hover { text-decoration: underline; }

/* 展开详情 */
.detail-row-wrap td.detail-cell {
  padding: 0;
  border: none;
  text-align: left;
  background: transparent;
}
.step-detail {
  background: #fafafa;
  padding: 12px 16px;
  border-radius: 6px;
  margin: 4px 8px;
  font-size: 12px;
  border-left: 3px solid #4a6cf7;
}
.step-detail .detail-title {
  font-weight: 600;
  margin-bottom: 8px;
  color: #4a6cf7;
  font-size: 12px;
}
.step-detail .detail-row {
  display: flex;
  padding: 3px 0;
  font-family: var(--font-mono, 'Courier New', monospace);
  font-size: 11px;
}
.step-detail .detail-label {
  color: #666;
  min-width: 150px;
  flex-shrink: 0;
}
.step-detail .detail-value { color: #1a1a2e; font-weight: 500; }
.step-detail .detail-value.dmg-final {
  color: #f44336;
  font-weight: 700;
}
.step-detail .detail-divider {
  border-top: 1px dashed #ddd;
  margin: 6px 0;
}

/* ============================================================
   移动端：每发一个紧凑块（两行制）
   ============================================================ */
.step-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 连发间隔分隔条 */
.burst-gap-divider {
  text-align: center;
  padding: 3px 8px;
  background: #f0f4ff;
  border-radius: 4px;
  border: 1px dashed #a8b8f0;
  font-family: var(--font-mono, 'Courier New', monospace);
  font-size: 11px;
  font-weight: 600;
  color: #4a6cf7;
  letter-spacing: 0.3px;
}

/* 单发块 */
.step-item {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #e8e8e8;
  background: #fff;
  font-size: 12px;
}

.step-item.hit-item {
  background: #f8fff8;
}

.step-item.miss-item {
  background: #fff8f8;
  color: #999;
}

/* 第一行：核心信息 */
.step-line-1 {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
}

.step-shot {
  font-family: var(--font-mono, 'Courier New', monospace);
  font-weight: 600;
  color: #4a6cf7;
  font-size: 12px;
  flex-shrink: 0;
  min-width: 26px;
}

.step-hit {
  font-size: 12px;
  flex-shrink: 0;
}

.step-part {
  flex-shrink: 0;
  font-size: 11px;
}

.step-damage {
  color: #f44336;
  font-weight: 600;
  font-family: var(--font-mono, 'Courier New', monospace);
  flex-shrink: 0;
  font-size: 12px;
}

.step-health {
  margin-left: auto;
  font-family: var(--font-mono, 'Courier New', monospace);
  font-weight: 600;
  color: #1a1a2e;
  font-size: 12px;
  flex-shrink: 0;
}

/* 第二行：次要信息 */
.step-line-2 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed #f0f0f0;
  font-size: 11px;
  color: #888;
}

.step-meta {
  font-family: var(--font-mono, 'Courier New', monospace);
  white-space: nowrap;
}

.step-toggle {
  margin-left: auto;
  color: #4a6cf7;
  cursor: pointer;
  font-size: 11px;
  user-select: none;
  flex-shrink: 0;
}

.step-toggle:hover {
  text-decoration: underline;
}

/* 移动端展开详情 */
.mobile-detail {
  margin: 4px 0 4px 0;
  padding: 10px 12px;
  border-radius: 6px;
  border-left: 3px solid #4a6cf7;
}

.mobile-detail .detail-label {
  min-width: 110px;
}

/* ============================================================
   页脚
   ============================================================ */
.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid #e8e8e8;
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}
.btn-secondary {
  padding: 6px 18px;
  background: #e8e8e8;
  color: #333;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}
.btn-secondary:hover { background: #d5d5d5; }

/* ============================================================
   ⭐ 移动端适配
   ============================================================ */
@media (max-width: 768px) {
  .modal-content {
    width: 98vw;
    max-height: 95vh;
  }

  .modal-header {
    padding: 10px 14px;
  }

  .modal-header h3 {
    font-size: 14px;
  }

  .modal-header .sub {
    display: block;
    margin-left: 0;
    margin-top: 2px;
    font-size: 11px;
  }

  .modal-body {
    padding: 12px 14px;
  }

  /* ⭐ TTK 分解：压缩 */
  .ttk-breakdown {
    gap: 6px;
    padding: 8px 10px;
    margin-bottom: 10px;
  }

  .breakdown-item {
    flex: 1 1 70px;
    padding: 4px 6px;
    min-width: 60px;
    border-radius: 4px;
  }

  .breakdown-label {
    font-size: 9px;
    margin-bottom: 2px;
  }

  .breakdown-value {
    font-size: 13px;
  }

  .breakdown-value small {
    font-size: 8px;
  }

  /* 摘要行 */
  .sim-toolbar {
    margin-bottom: 10px;
    gap: 8px;
  }

  .sim-summary {
    font-size: 11px;
  }

  .reroll-btn {
    padding: 5px 12px;
    font-size: 12px;
  }

  /* 移动端详情：更紧凑 */
  .mobile-detail .detail-label {
    min-width: 100px;
    font-size: 10px;
  }

  .mobile-detail .detail-value {
    font-size: 10px;
  }

  .mobile-detail .detail-row {
    font-size: 10px;
  }
}
</style>