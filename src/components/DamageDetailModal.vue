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

        <!-- 明细表 -->
        <table class="step-table">
          <thead>
            <tr>
              <th>发数</th>
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
              <!-- ⭐ 连发间隔分隔行 -->
              <tr v-if="s.burstGapBefore > 0" class="burst-gap-row">
                <td colspan="8">
                  <span class="burst-gap-text">
                    ⏱ 连发间隔 +{{ (s.burstGapBefore * 1000).toFixed(0) }} ms
                  </span>
                </td>
              </tr>

              <!-- 未命中行 -->
              <tr v-if="!s.hit" class="miss-row">
                <td>{{ s.shot }}</td>
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
                <td colspan="8" class="detail-cell">
                  <div class="step-detail active">
                    <div class="detail-title">第 {{ s.shot }} 发详细计算</div>

                    <div class="detail-row">
                      <span class="detail-label">命中部位：</span>
                      <span class="detail-value">
                        {{ partLabel(s.hitPart) }}（mult = {{ s.debug.mult }}）
                        <template v-if="s.debug.stPartMult !== undefined">
                          × ST修正 {{ s.debug.stPartMult }}
                        </template>
                      </span>
                    </div>

                    <div class="detail-row">
                      <span class="detail-label">基础伤害：</span>
                      <span class="detail-value">
                        {{ s.debug.weaponFlesh }}（肉伤）
                        <template v-if="s.debug.bulletBase !== null">
                          × {{ s.debug.bulletBase }}（子弹）
                        </template>
                        × {{ s.debug.mult }}（部位）
                        <template v-if="s.debug.stPartMult !== undefined">
                          × {{ s.debug.stPartMult }}（ST）
                        </template>
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

                    <!-- 四肢：无视护甲 -->
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

                    <!-- 有护甲减伤 -->
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
      </div>

      <!-- 底部 -->
      <div class="modal-footer">
        <button class="btn-secondary" @click="close">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { dataStore } from '@/stores/dataStore'
import { paramsStore } from '@/stores/paramsStore'
import { SimulationEngine } from '@/core/SimulationEngine'
import { BulletStrategyFactory } from '@/core/BulletStrategy'
import { setSeed } from '@/utils/rng'
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

// 当前模拟使用的扳机延迟快照（避免弹窗展示时被全局 params 变化影响）
const triggerEnabled = ref(true)
const triggerDelayRaw = ref(0)  // 武器原始扳机延迟（毫秒）

// 固定的"首次打开"种子（保证第一次打开可复现）
const INITIAL_SEED = 12345

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

// ============================================================
// ⭐ TTK 分解（全部换算成毫秒）
// ============================================================

// 飞行延迟
const flightMs = computed(() => {
  if (!simResult.value) return 0
  return simResult.value.flightTime * 1000
})

// 射击延迟（纯射击间隔部分）
const shootingMs = computed(() => {
  if (!simResult.value) return 0
  return (simResult.value.shootingIntervalTime || 0) * 1000
})

// 扳机延迟
const triggerMs = computed(() => {
  if (!simResult.value) return 0
  return triggerEnabled.value ? (triggerDelayRaw.value || 0) : 0
})

// 平均连发间隔（单次平均：总连发间隔 / 连发次数）
const avgBurstMs = computed(() => {
  if (!simResult.value) return 0
  const count = simResult.value.burstIntervalCount || 0
  if (count <= 0) return 0
  return (simResult.value.burstIntervalTotal / count) * 1000
})

// 总 TTK = 飞行 + 射击 + 连发间隔总时间 + 扳机延迟
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

  // ============================================================
  // ⭐ 1. 用 getPriceRowsForWeapon 拿"解析后"的行
  //    这样 barrelId / muzzleId / bulletId 都是经过名字反查的，
  //    不会因为原始 config 缺少 barrelId 而丢失枪管
  // ============================================================
  const rows = dm.getPriceRowsForWeapon(props.weaponId) || []
  const row = rows.find(r => r.configId === props.configId)

  if (!row) {
    console.warn('⚠️ 未找到价格配置:', props.configId)
    return
  }

  const barrelId = row.barrelId ?? -1
  const muzzleId = row.muzzleId ?? 0
  const bulletIdFromRow = row.bulletId || null

  // 2. 应用枪管 / 枪口，得到当前武器属性（含连发字段）
  const barrel = (barrelId >= 0 && weapon.barrels?.[barrelId]) ? weapon.barrels[barrelId] : null

  const current = calculateCurrentValues(weapon, barrel, muzzleId, 0.09)

  // 合并成带 _current 的武器对象（SimulationEngine 会优先读 _current）
  const armedWeapon = {
    ...weapon,
    ...current,
    _current: current,
    _displayName: weapon.name,
    _configId: props.configId,
    triggerDelay: weapon.triggerDelay || 0
  }

  // 3. 拿实际子弹（优先用 row.bulletId，否则走口径+等级推断）
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

  // 4. 命中率（优先用配置的 distance/hitRate 映射）
  let hitRate = params.hitRate
  const rawConfig = row._rawConfig
  if (rawConfig?.distance?.length && rawConfig?.hitRate?.length) {
    const map = rawConfig.distance.map((d, i) => ({ distance: d, rate: rawConfig.hitRate[i] }))
    hitRate = dm.getHitRateFromMap(map, props.distance, params.hitRate ?? 0.85)
  }

  // 5. 快照扳机延迟（供展示）
  triggerEnabled.value = params.triggerDelayEnable !== false
  triggerDelayRaw.value = weapon.triggerDelay || 0

  // 6. 组装模拟参数
  const simParams = {
    ...params,
    distance: props.distance,
    hitRate
  }

  // 7. 设置种子 + 运行
  setSeed(seed)
  const strategy = BulletStrategyFactory.getStrategy(bulletKey)
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
    `连发次数=${result.burstIntervalCount}`
  )
}

// ---------- 事件 ----------
const reroll = () => {
  if (isRolling.value) return
  isRolling.value = true
  // 换一个基于时间的种子
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

// ---------- 监听打开 ----------
watch(() => props.visible, (newVal) => {
  if (newVal) {
    runSimulation(INITIAL_SEED)
  }
})

// 切换武器/配置/距离时，如果当前可见则重跑
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
  width: 860px;
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

/* ⭐ TTK 分解 */
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

/* 明细表 */
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

/* ⭐ 连发间隔分隔行 */
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

/* 底部 */
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

/* 移动端 */
@media (max-width: 768px) {
  .modal-content { width: 98vw; max-height: 95vh; }
  .step-table { font-size: 11px; }
  .step-table thead th,
  .step-table tbody td { padding: 5px 4px; }
  .step-detail .detail-label { min-width: 110px; }
  .breakdown-item { flex: 1 1 45%; }
}
</style>