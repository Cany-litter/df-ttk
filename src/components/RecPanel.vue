<!-- src/components/RecPanel.vue -->
<!--
  配装推荐面板

  假想敌生成流程：
    createEnemy(index, budgetW, excludeWeaponIds)
      ① _makeTemporaryTarget(budgetW)   预算内按比例随机配装
          · 武器：配置价格 ≤ 剩余 × 40%
          · 子弹：单价 × 120 ≤ 剩余 × 50%
          · 防御：护甲+头盔+甲修+头修 ≤ 剩余
          · 顺序：武器 → 子弹 → 防御
          · 距离：固定 30m
          · 无重试，找不到就用最便宜的兜底
      ② 用靶子跑推荐 → top30
      ③ 从 top30 随机挑一个
          · ⭐ 过滤掉 excludeWeaponIds 里的武器
          · 全都过滤掉则回退到全量池
      ④ 转成假想敌
          · 距离：按武器射程分段权重随机

  武器去重：
    · 同一批假想敌之间，尽量不用相同武器
    · 添加假想敌 → 排除所有已有假想敌的武器
    · 重掷假想敌 → 排除其他假想敌的武器（不排除自己）
    · 武器池用尽 → 允许重复

  距离分段权重：
    · 段数 = 有限 ranges 数 + 1
    · 段间权重 N : (N-1) : ... : 1
    · 段内均匀
    · 最后一段到 100m

  成本计算：
    · 从推荐结果来的假想敌 → 用 _recCost.total（推荐引擎算的）
    · 手动编辑的假想敌 → 本地算（含维修包）

  维修包：
    · 按护甲/头盔等级自动配（4→标准，5→精密，6→高级）
    · 1~3 级不配
    · 显示时合并为一行「维修」

  持久化：
    · 保存前深拷贝 + 去掉 Vue 响应式 + 剔除 _recCost
-->
<template>
  <div class="rec-panel">

    <!-- ============================================================ -->
    <!-- 视图切换：空状态 / 完整界面 -->
    <!-- ============================================================ -->
    <Transition name="rec-view-fade" mode="out-in">

      <!-- 状态 1：空状态（无假想敌） -->
      <div v-if="enemies.length === 0" key="empty" class="rec-empty-state">
        <div class="rec-empty-card">
          <div class="rec-empty-title">🎯 配装推荐</div>
          <div class="rec-empty-hint">
            设定预算，自动生成假想敌并推荐配装
          </div>

          <div class="rec-empty-budget-row">
            <label class="rec-empty-budget-label">💰 我方预算</label>
            <input
              v-model.number="budget"
              type="number"
              class="rec-empty-budget-input"
              min="1"
              step="10"
              @keydown.enter="runRecommend"
            />
            <span class="rec-empty-budget-unit">W 哈弗币</span>
          </div>

          <button
            class="rec-empty-start-btn"
            :disabled="isRunning"
            @click="runRecommend"
          >
            <template v-if="isRunning">⏳ 推荐中...</template>
            <template v-else>🔍 开始推荐</template>
          </button>
        </div>
      </div>

      <!-- 状态 3：完整界面 -->
      <div v-else key="full" class="rec-full-view">

        <!-- 假想敌配置区 -->
        <div class="panel">
          <div class="enemies-header">
            <div class="panel-title">
              👥 假想敌配置
              <span class="badge">{{ enemies.length }} 个敌人</span>
            </div>
            <button
              class="add-enemy-btn"
              :disabled="enemies.length >= MAX_ENEMIES || isRunning"
              :title="enemies.length >= MAX_ENEMIES ? '已达上限' : ''"
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

          <!-- 假想敌卡片网格 -->
          <div class="enemies-grid">
            <div
              v-for="(enemy, index) in enemies"
              :key="enemy._id"
              class="enemy-card"
              :class="{ 'is-rerolling': rerollingIndex === index }"
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
                  title="按该假想敌的预算，重新随机一套配装"
                  :disabled="isRunning || rerollingIndex !== null"
                  @click="rerollEnemy(index)"
                >
                  <template v-if="rerollingIndex === index">⏳ 重掷中</template>
                  <template v-else>🎲 重掷</template>
                </button>
                <button
                  class="remove-enemy-btn"
                  title="删除"
                  :disabled="rerollingIndex !== null"
                  @click="removeEnemy(index)"
                >
                  ✕
                </button>
              </div>

              <!-- 主体 -->
              <div class="enemy-card-body">
                <!-- 假想敌自己的预算 -->
                <div class="enemy-field budget-field">
                  <span class="label">💰 配装</span>
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
                <div class="enemy-field with-price">
                  <span class="label">武器</span>
                  <select v-model="enemy.weaponId" @change="onEnemyWeaponChange(index)">
                    <option :value="null" disabled>请选择武器</option>
                    <option v-for="w in weaponOptions" :key="w.id" :value="w.id">
                      {{ w.name }}
                    </option>
                  </select>
                  <span class="price-tag">{{ formatPrice(getCostBreakdown(enemy).weapon) }}</span>
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
                <div class="enemy-field with-price">
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
                  <span class="price-tag">{{ formatPrice(getCostBreakdown(enemy).bullet) }}</span>
                </div>

                <!-- 护甲 -->
                <div class="enemy-field with-price">
                  <span class="label">护甲</span>
                  <select v-model="enemy.armorId" @change="onEnemyArmorChange(index)">
                    <option :value="null" disabled>请选择护甲</option>
                    <option v-for="a in armorOptions" :key="a.id" :value="a.id">
                      {{ a.name }} Lv.{{ a.level }}（{{ a.value }}）
                    </option>
                  </select>
                  <span class="price-tag">{{ formatPrice(getCostBreakdown(enemy).armor) }}</span>
                </div>

                <!-- 头盔 -->
                <div class="enemy-field with-price">
                  <span class="label">头盔</span>
                  <select v-model="enemy.helmetId" @change="onEnemyHelmetChange(index)">
                    <option :value="null" disabled>请选择头盔</option>
                    <option v-for="h in helmetOptions" :key="h.id" :value="h.id">
                      {{ h.name }} Lv.{{ h.level }}（{{ h.value }}）
                    </option>
                  </select>
                  <span class="price-tag">{{ formatPrice(getCostBreakdown(enemy).helmet) }}</span>
                </div>

                <!-- 维修（甲修 + 头修，合并一行） -->
                <div class="enemy-field with-price repair-field">
                  <span class="label">维修</span>
                  <span
                    class="readonly-value"
                    :class="{ 'is-empty': !hasRepair(enemy) }"
                    :title="getRepairTooltip(enemy)"
                  >
                    {{ getRepairLabel(enemy) }}
                  </span>
                  <span class="price-tag repair-tag">
                    {{ formatPrice(getCostBreakdown(enemy).armorRepair + getCostBreakdown(enemy).helmetRepair) }}
                  </span>
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

              <!-- 底部：携带数 + 总价 + 预算占比 -->
              <div class="card-footer">
                <div class="cost-total-row">
                  <span class="carry-count">{{ getCarryCount(enemy) }}发</span>
                  <span class="cost-sep">·</span>
                  <span class="cost-total" :class="{ over: isOverBudget(enemy) }">
                    ¥{{ formatCostW(calcEnemyCost(enemy)) }}
                  </span>
                  <span class="cost-ratio" :class="{ over: isOverBudget(enemy) }">
                    ({{ getCostRatio(enemy) }}%)
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 我方预算 + 开始推荐 -->
          <div class="budget-row">
            <div class="budget-group">
              <label>💰 我方预算</label>
              <input
                v-model.number="budget"
                type="number"
                class="budget-input"
                min="1"
                step="10"
                @input="markDirty"
              />
              <span class="budget-unit">W 哈弗币</span>
              <span class="budget-hint">（推荐结果必须 ≤ 这个预算）</span>
            </div>

            <button
              class="calc-btn"
              :disabled="isRunning"
              :title="calcButtonTitle"
              @click="runRecommend"
            >
              <template v-if="isRunning">⏳ 推荐中...</template>
              <template v-else>🔍 开始推荐</template>
            </button>
          </div>
        </div>

        <!-- 无推荐结果提示 -->
        <div
          v-if="!recommendations"
          class="no-rec-hint"
        >
          💡 点击上方「🔍 开始推荐」获取综合推荐
        </div>

        <!-- 假想敌变更提示条 -->
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
            <span class="badge">{{ recommendations.allCount }} 套候选</span>
            <span class="badge">我方预算 {{ budget }}W</span>
          </div>

          <div class="top3-grid">
            <div
              v-for="rec in recommendations.topN"
              :key="rec.rank"
              class="top3-card"
              :class="`rank-${rec.rank}`"
            >
              <div class="top3-header">
                <div class="rank-label">
                  <span class="rank-num">{{ rankIcon(rec.rank) }}</span>
                  <span>推荐 #{{ rec.rank }}</span>
                </div>
                <span class="winrate-badge">
                  {{ formatPct(rec.winRate) }}<span class="pct">综合胜率</span>
                </span>
              </div>

              <div class="top3-body">
                <div class="gear-row">
                  <span class="gear-icon">🔫</span>
                  <span class="gear-label">武器</span>
                  <span class="gear-value" :title="weaponLabel(rec)">
                    {{ weaponLabel(rec) }}
                  </span>
                  <span class="gear-price">{{ formatPrice(rec.gear.weapon.price) }}</span>
                </div>

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

                <!-- 维修包行 -->
                <div
                  v-if="rec.cost.repairCost > 0"
                  class="gear-row repair-row"
                  :title="repairTooltip(rec)"
                >
                  <span class="gear-icon">🔧</span>
                  <span class="gear-label">维修</span>
                  <span class="gear-value repair-value">
                    {{ repairLabel(rec) }}
                  </span>
                  <span class="gear-price repair-price">
                    {{ formatPrice(rec.cost.repairCost) }}
                  </span>
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
                  <div class="metric" :title="gearTotalTooltip(rec)">
                    <div class="metric-label">总价</div>
                    <div class="metric-value gear-total">
                      {{ rec.cost.gearTotalW.toFixed(1) }}<small>W</small>
                    </div>
                  </div>
                </div>

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
                  <td class="rank-cell">
                    <span class="rank-badge">{{ rec.rank }}</span>
                  </td>

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

                  <td class="armor-cell" :title="armorLabel(rec)">
                    <div class="cell-main">
                      <span class="cell-main-text">{{ armorLabel(rec) }}</span>
                    </div>
                    <div class="cell-sub cell-price">{{ formatPrice(rec.gear.armor.price) }}</div>
                  </td>

                  <td class="armor-cell" :title="helmetLabel(rec)">
                    <div class="cell-main">
                      <span class="cell-main-text">{{ helmetLabel(rec) }}</span>
                    </div>
                    <div class="cell-sub cell-price">{{ formatPrice(rec.gear.helmet.price) }}</div>
                  </td>

                  <td class="num-cell ttk-attack">
                    {{ formatTTK(avgAttackTTK(rec)) }} ms
                  </td>

                  <td class="num-cell ttk-defense">
                    {{ formatTTK(avgDefenseTTK(rec)) }} ms
                  </td>

                  <td
                    class="num-cell winrate"
                    :class="rateClass(rec.winRate)"
                  >
                    {{ formatPct(rec.winRate) }}
                  </td>

                  <td class="num-cell gear-total" :title="gearTotalTooltip(rec)">
                    <div class="gear-total-main">{{ formatCost(rec.cost?.gearTotalW) }} W</div>
                    <div v-if="rec.cost.repairCost > 0" class="gear-total-sub">
                      含维修 {{ formatCost(rec.cost.repairCost / 10000) }} W
                    </div>
                  </td>

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

          <div v-if="visibleRestCount < recommendations.rest.length" class="load-more-row">
            <button class="btn-load-more" @click="handleLoadMore">
              ➕ 加载更多（显示到 Top {{ Math.min(3 + visibleRestCount + LOAD_MORE_STEP, 3 + recommendations.rest.length) }}）
            </button>
          </div>
        </template>

        <!-- 空状态（推荐完成后无结果） -->
        <div
          v-if="recommendations && recommendations.topN.length === 0"
          class="empty-state"
        >
          <div class="icon">😢</div>
          <div>没有找到符合条件的方案</div>
          <div class="hint">请提高我方预算或调整假想敌配置</div>
        </div>

      </div>
    </Transition>

    <!-- 进度遮罩 -->
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
import { ref, computed, onMounted, onBeforeUnmount, inject, nextTick, watch } from 'vue'
import { dataStore, paramsStore } from '@/stores/stores'
import {
  saveRecPanelState,
  loadRecPanelState,
} from '@/core/TTKMatrix'

// 注入通用弹窗
const showAlert = inject('showAlert', null)

// ============================================================
// 常量
// ============================================================

const MAX_ENEMIES = 6
const DEFAULT_BUDGET_W = 100
const DEFAULT_CARRY_COUNT = 120
const FIXED_TARGET_DISTANCE = 30

/** 假想敌靶子的预算分配上限（参考） */
const TARGET_BUDGET = {
  WEAPON: 0.4,
  BULLET: 0.5,
  DEFENSE: 1.0,
}

/** 维修包名字映射（跟 RecEngine 保持一致） */
const REPAIR_ARMOR_NAMES = {
  4: '标准护甲维修包',
  5: '精密护甲维修包',
  6: '高级护甲维修组合',
}
const REPAIR_HELMET_NAMES = {
  4: '标准头盔维修包',
  5: '精密头盔维修包',
  6: '高级头盔维修组合',
}

/** 距离随机上限 */
const MAX_DISTANCE = 100
/** 无有限射程时的默认段边界 */
const DEFAULT_RANGE_BOUNDS = [40, 70]

const LOAD_MORE_STEP = 20
const PERSIST_DEBOUNCE_MS = 500

// ============================================================
// 状态
// ============================================================

const budget = ref(100)
const isRunning = ref(false)
const recommendations = ref(null)
const visibleRestCount = ref(10)
const recommendDirty = ref(false)
const copiedKey = ref(null)
let copiedTimer = null

const enemies = ref([])
const rerollingIndex = ref(null)

let _enemyIdCounter = 0

const progress = ref({
  visible: false,
  title: '推荐中...',
  phase: '',
  current: 0,
  total: 0,
  percent: 0
})

let persistTimer = null

// ============================================================
// 数据选项
// ============================================================

const weaponOptions = computed(() => dataStore.state.weapons || [])

const armorOptions = computed(() =>
  (dataStore.state.armors || []).filter(a => a.type === 'armor')
)

const helmetOptions = computed(() =>
  (dataStore.state.armors || []).filter(a => a.type === 'helmet')
)

const getConfigOptions = (weaponId) => {
  if (!weaponId) return []
  return dataStore.getPriceRowsForWeapon(weaponId) || []
}

const getBulletOptions = (weaponId) => {
  if (!weaponId) return []
  const weapon = dataStore.getWeaponById(weaponId)
  if (!weapon || !weapon.allowedBullet) return []

  const bullets = dataStore.getBulletsByCaliber(weapon.allowedBullet) || []
  const dm = dataStore.getDataManager()
  return bullets.map(b => ({
    id: b.id,
    display: dm.getBulletDisplay(b)
  }))
}

// ============================================================
// 推荐结果辅助
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
// 工具函数
// ============================================================

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

/**
 * 按武器射程分段，随机一个距离
 *
 * 逻辑：
 *   · 段数 = 有限 ranges 数 + 1
 *   · 段间权重 N : (N-1) : ... : 1
 *   · 段内均匀
 *   · 最后一段到 MAX_DISTANCE (100)
 *
 * 举例 AS-Val（ranges = [27, 54, ∞, ∞]）：
 *   段1: [0, 26]    weight = 3  (50%)
 *   段2: [27, 53]   weight = 2  (33.3%)
 *   段3: [54, 100]  weight = 1  (16.7%)
 *
 * 举例 野牛（ranges = [20, 27, 40, 55]）：
 *   段1: [0, 19]    weight = 5  (33.3%)
 *   段2: [20, 26]   weight = 4  (26.7%)
 *   段3: [27, 39]   weight = 3  (20%)
 *   段4: [40, 54]   weight = 2  (13.3%)
 *   段5: [55, 100]  weight = 1  (6.7%)
 *
 * @param {Object} weapon
 * @returns {number} 距离（整数）
 */
const randomDistance = (weapon) => {
  // ---------- 提取有限 ranges（遇到 Infinity 就停）----------
  const ranges = weapon?.ranges
  let bounds = []

  if (Array.isArray(ranges)) {
    for (const r of ranges) {
      if (typeof r === 'number' && isFinite(r) && r > 0) {
        bounds.push(Math.round(r))
      } else {
        break
      }
    }
  }

  // 无有限射程 → 用默认
  if (bounds.length === 0) {
    bounds = [...DEFAULT_RANGE_BOUNDS]
  }

  // ---------- 构建段 ----------
  const segments = []
  let prevEnd = 0

  for (const b of bounds) {
    if (b > prevEnd) {
      segments.push({ start: prevEnd, end: b - 1 })
      prevEnd = b
    }
  }
  // 最后一段
  if (MAX_DISTANCE >= prevEnd) {
    segments.push({ start: prevEnd, end: MAX_DISTANCE })
  }

  if (segments.length === 0) return 30   // 兜底

  // ---------- 权重：N : (N-1) : ... : 1 ----------
  const N = segments.length
  const weights = segments.map((_, i) => N - i)
  const totalWeight = weights.reduce((a, b) => a + b, 0)

  // ---------- 按权重选段 ----------
  let r = Math.random() * totalWeight
  let chosen = segments[segments.length - 1]

  for (let i = 0; i < segments.length; i++) {
    if (r < weights[i]) {
      chosen = segments[i]
      break
    }
    r -= weights[i]
  }

  // ---------- 段内均匀随机 ----------
  const range = chosen.end - chosen.start + 1
  return chosen.start + Math.floor(Math.random() * range)
}

/**
 * 维修包名字 → ID 映射（懒加载缓存）
 */
let _repairIdCache = null

const _getRepairIdMap = () => {
  if (_repairIdCache) return _repairIdCache

  const dm = dataStore.getDataManager()
  const items = dm.getOtherItems(true) || []

  const armorMap = {}
  const helmetMap = {}

  for (const item of items) {
    if (item.category !== '维修') continue
    if (item.enabled === false) continue

    for (const [level, name] of Object.entries(REPAIR_ARMOR_NAMES)) {
      if (item.name === name) {
        armorMap[level] = item.id
      }
    }
    for (const [level, name] of Object.entries(REPAIR_HELMET_NAMES)) {
      if (item.name === name) {
        helmetMap[level] = item.id
      }
    }
  }

  _repairIdCache = { armorMap, helmetMap }
  return _repairIdCache
}

/**
 * 按等级查维修包 ID
 */
const _getRepairIdByLevel = (level, type) => {
  if (level !== 4 && level !== 5 && level !== 6) return null
  const { armorMap, helmetMap } = _getRepairIdMap()
  const map = type === 'armor' ? armorMap : helmetMap
  return map[level] || null
}

/**
 * 按 ID 查维修包对象
 */
const _getRepairById = (id) => {
  if (!id) return null
  const dm = dataStore.getDataManager()
  return dm.getOtherItemById(id) || null
}

/**
 * 查维修包价格（按名字查，用于靶子生成阶段）
 */
const _getRepairPriceByName = (level, type, repairPriceMap) => {
  if (level !== 4 && level !== 5 && level !== 6) return 0
  const nameMap = type === 'armor' ? REPAIR_ARMOR_NAMES : REPAIR_HELMET_NAMES
  const name = nameMap[level]
  if (!name) return 0
  const price = repairPriceMap.get(name)
  if (price === undefined) {
    console.warn(`⚠️ RecPanel: 未找到维修包 "${name}"，成本记 0`)
    return 0
  }
  return price
}

/**
 * 懒加载维修包价格表（按名字）
 */
const _getRepairPriceMap = () => {
  const dm = dataStore.getDataManager()
  const items = dm.getOtherItems(true) || []
  const map = new Map()
  for (const item of items) {
    if (item.category !== '维修') continue
    if (item.enabled === false) continue
    if (!item.name) continue
    map.set(item.name, item.price || 0)
  }
  return map
}

const getCarryCount = (enemy) => {
  if (enemy && typeof enemy.carryCount === 'number' && enemy.carryCount > 0) {
    return enemy.carryCount
  }
  return DEFAULT_CARRY_COUNT
}

/**
 * 获取假想敌的各部分价格明细
 */
const getCostBreakdown = (enemy) => {
  const empty = {
    weapon: 0, bullet: 0, armor: 0, helmet: 0,
    armorRepair: 0, helmetRepair: 0, total: 0,
  }
  if (!enemy || !enemy.weaponId) return empty

  const dm = dataStore.getDataManager()
  const weapon = dm.getWeaponById(enemy.weaponId)
  if (!weapon) return empty

  // 武器
  const configs = dataStore.getPriceRowsForWeapon(enemy.weaponId) || []
  const config = configs.find(c => c.configId === enemy.configId)
  const weaponCost = config?.price || 0

  // 子弹
  const bullets = dm.getBulletsByCaliber(weapon.allowedBullet) || []
  const bullet = bullets.find(b => b.id === enemy.bulletId)
  const bulletCost = (bullet?.price || 0) * getCarryCount(enemy)

  // 护甲 + 头盔
  const armor = dm.getArmorById(enemy.armorId)
  const helmet = dm.getArmorById(enemy.helmetId)
  const armorCost = armor?.price || 0
  const helmetCost = helmet?.price || 0

  // 维修包
  const armorRepair = _getRepairById(enemy.armorRepairId)
  const helmetRepair = _getRepairById(enemy.helmetRepairId)
  const armorRepairCost = armorRepair?.price || 0
  const helmetRepairCost = helmetRepair?.price || 0

  return {
    weapon: weaponCost,
    bullet: bulletCost,
    armor: armorCost,
    helmet: helmetCost,
    armorRepair: armorRepairCost,
    helmetRepair: helmetRepairCost,
    total: weaponCost + bulletCost + armorCost + helmetCost + armorRepairCost + helmetRepairCost,
  }
}

/**
 * 是否有维修包
 */
const hasRepair = (enemy) => {
  return !!(enemy?.armorRepairId || enemy?.helmetRepairId)
}

/**
 * 维修标签（合并甲修 + 头修）
 */
const getRepairLabel = (enemy) => {
  if (!enemy) return '不配'
  const armorRepair = _getRepairById(enemy.armorRepairId)
  const helmetRepair = _getRepairById(enemy.helmetRepairId)

  const parts = []
  if (armorRepair) {
    const level = getArmorLevel(enemy.armorId)
    parts.push(`${level}甲修`)
  }
  if (helmetRepair) {
    const level = getHelmetLevel(enemy.helmetId)
    parts.push(`${level}头修`)
  }

  if (parts.length === 0) return '不配'
  return parts.join(' + ')
}

/**
 * 维修 tooltip
 */
const getRepairTooltip = (enemy) => {
  if (!enemy) return ''
  const armorRepair = _getRepairById(enemy.armorRepairId)
  const helmetRepair = _getRepairById(enemy.helmetRepairId)

  const lines = ['🔧 维修包']
  if (armorRepair) {
    lines.push(`甲修: ${armorRepair.name} ¥${(armorRepair.price / 10000).toFixed(1)}W`)
  }
  if (helmetRepair) {
    lines.push(`头修: ${helmetRepair.name} ¥${(helmetRepair.price / 10000).toFixed(1)}W`)
  }
  if (lines.length === 1) {
    lines.push('不配维修包')
  }
  return lines.join('\n')
}

/**
 * 查护甲/头盔等级
 */
const getArmorLevel = (armorId) => {
  const a = dataStore.getDataManager().getArmorById(armorId)
  return a?.level ?? '?'
}

const getHelmetLevel = (helmetId) => {
  const h = dataStore.getDataManager().getArmorById(helmetId)
  return h?.level ?? '?'
}

/**
 * 计算假想敌成本
 *
 * 优先用推荐引擎算好的 _recCost.total，否则本地算
 */
const calcEnemyCost = (enemy) => {
  if (!enemy) return Infinity

  if (enemy._recCost && typeof enemy._recCost.total === 'number' && isFinite(enemy._recCost.total)) {
    return enemy._recCost.total
  }

  const breakdown = getCostBreakdown(enemy)
  if (breakdown.total === 0 && !enemy.weaponId) return Infinity
  return breakdown.total
}

/**
 * 成本 / 预算 比例
 */
const getCostRatio = (enemy) => {
  if (!enemy) return '0.0'
  const cost = calcEnemyCost(enemy)
  const budgetYuan = (enemy.budgetW || DEFAULT_BUDGET_W) * 10000
  if (budgetYuan <= 0) return '0.0'
  return ((cost / budgetYuan) * 100).toFixed(1)
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

// ============================================================
// 临时靶子生成
// ============================================================

const _makeTemporaryTarget = (budgetW) => {
  console.log('\n═══════════════════════════════════════════')
  console.log(`🎲 [靶子生成] 开始，预算 ${budgetW}W`)
  console.log('═══════════════════════════════════════════')

  const dm = dataStore.getDataManager()
  const budgetYuan = budgetW * 10000

  // ---------- 数据检查 ----------
  const allConfigs = []
  for (const weapon of dm.getWeapons() || []) {
    const rows = dataStore.getPriceRowsForWeapon(weapon.id) || []
    for (const row of rows) {
      if (row.enabled === false) continue
      allConfigs.push({ weapon, row })
    }
  }
  if (allConfigs.length === 0) {
    console.warn('❌ 靶子生成失败：没有可用的武器配置')
    return null
  }

  const allArmors = dm.getArmorsByType('armor') || []
  const allHelmets = dm.getArmorsByType('helmet') || []
  if (allArmors.length === 0 || allHelmets.length === 0) {
    console.warn('❌ 靶子生成失败：没有可用的护甲或头盔')
    return null
  }

  console.log(`📊 数据池: 配置 ${allConfigs.length} 个, 护甲 ${allArmors.length} 个, 头盔 ${allHelmets.length} 个`)

  const repairPriceMap = _getRepairPriceMap()

  let remaining = budgetYuan
  console.log(`💰 初始预算: ${(remaining / 10000).toFixed(1)}W`)

  // ---------- ① 武器 ----------
  console.log('\n─── ① 武器选择 ───')
  const weaponUpperLimit = remaining * TARGET_BUDGET.WEAPON
  console.log(`   上限: 剩余 × ${TARGET_BUDGET.WEAPON} = ${(weaponUpperLimit / 10000).toFixed(1)}W`)

  const weaponCandidates = allConfigs.filter(
    c => (c.row.price || 0) <= weaponUpperLimit
  )
  console.log(`   候选数: ${weaponCandidates.length} / ${allConfigs.length}`)

  let chosenWeaponConfig = null
  if (weaponCandidates.length > 0) {
    chosenWeaponConfig = pick(weaponCandidates)
  } else {
    chosenWeaponConfig = [...allConfigs].sort(
      (a, b) => (a.row.price || 0) - (b.row.price || 0)
    )[0]
    console.warn('   ⚠️ 无候选，兜底用最便宜配置')
  }

  const weapon = chosenWeaponConfig.weapon
  const config = chosenWeaponConfig.row
  const weaponPrice = config.price || 0

  console.log(`   ✅ 选中: ${weapon.name} ${config.configId} (${config.barrel || '无枪管'})`)
  console.log(`   价格: ${(weaponPrice / 10000).toFixed(1)}W`)

  remaining -= weaponPrice
  console.log(`   剩余: ${(remaining / 10000).toFixed(1)}W`)

  // ---------- ② 子弹 ----------
  console.log('\n─── ② 子弹选择 ───')
  const allBullets = dm.getBulletsByCaliber(weapon.allowedBullet) || []
  if (allBullets.length === 0) {
    console.warn(`   ❌ 武器 ${weapon.name} 没有可用子弹`)
    return null
  }

  const bulletUpperLimit = remaining * TARGET_BUDGET.BULLET
  console.log(`   上限: 剩余 × ${TARGET_BUDGET.BULLET} = ${(bulletUpperLimit / 10000).toFixed(1)}W`)
  console.log(`   口径: ${weapon.allowedBullet}, 可用子弹 ${allBullets.length} 颗`)

  const bulletCandidates = allBullets.filter(
    b => (b.price || 0) * DEFAULT_CARRY_COUNT <= bulletUpperLimit
  )
  console.log(`   候选数: ${bulletCandidates.length} / ${allBullets.length}`)

  let chosenBullet = null
  if (bulletCandidates.length > 0) {
    chosenBullet = pick(bulletCandidates)
  } else {
    chosenBullet = [...allBullets].sort(
      (a, b) => (a.price || 0) - (b.price || 0)
    )[0]
    console.warn('   ⚠️ 无候选，兜底用最便宜子弹')
  }

  const bulletCost = (chosenBullet.price || 0) * DEFAULT_CARRY_COUNT
  console.log(`   ✅ 选中: ${chosenBullet.name} Lv.${chosenBullet.level}`)
  console.log(`   单价: ¥${chosenBullet.price}/发 × ${DEFAULT_CARRY_COUNT} 发 = ¥${(bulletCost / 10000).toFixed(1)}W`)

  remaining -= bulletCost
  console.log(`   剩余: ${(remaining / 10000).toFixed(1)}W`)

  // ---------- ③ 防御 ----------
  console.log('\n─── ③ 防御选择 ───')
  const defenseUpperLimit = remaining * TARGET_BUDGET.DEFENSE
  console.log(`   上限: 剩余 × ${TARGET_BUDGET.DEFENSE} = ${(defenseUpperLimit / 10000).toFixed(1)}W`)

  const defenseCandidates = []
  for (const armor of allArmors) {
    for (const helmet of allHelmets) {
      const armorRepair = _getRepairPriceByName(armor.level, 'armor', repairPriceMap)
      const helmetRepair = _getRepairPriceByName(helmet.level, 'helmet', repairPriceMap)
      const defenseCost = (armor.price || 0) + (helmet.price || 0) + armorRepair + helmetRepair
      if (defenseCost <= defenseUpperLimit) {
        defenseCandidates.push({ armor, helmet })
      }
    }
  }
  console.log(`   候选数: ${defenseCandidates.length} / ${allArmors.length * allHelmets.length}`)

  let chosenDefense = null
  if (defenseCandidates.length > 0) {
    chosenDefense = pick(defenseCandidates)
  } else {
    const cheapestArmor = [...allArmors].sort(
      (a, b) => (a.price || 0) - (b.price || 0)
    )[0]
    const cheapestHelmet = [...allHelmets].sort(
      (a, b) => (a.price || 0) - (b.price || 0)
    )[0]
    chosenDefense = { armor: cheapestArmor, helmet: cheapestHelmet }
    console.warn('   ⚠️ 无候选，兜底用最便宜护甲+头盔')
  }

  const armor = chosenDefense.armor
  const helmet = chosenDefense.helmet

  // 维修包
  const armorRepairId = _getRepairIdByLevel(armor.level, 'armor')
  const helmetRepairId = _getRepairIdByLevel(helmet.level, 'helmet')
  const armorRepairItem = _getRepairById(armorRepairId)
  const helmetRepairItem = _getRepairById(helmetRepairId)
  const armorRepairPrice = armorRepairItem?.price || 0
  const helmetRepairPrice = helmetRepairItem?.price || 0
  const defenseCost = (armor.price || 0) + (helmet.price || 0) + armorRepairPrice + helmetRepairPrice

  console.log(`   ✅ 选中: ${armor.name} Lv.${armor.level} + ${helmet.name} Lv.${helmet.level}`)
  console.log(`   护甲: ¥${((armor.price || 0) / 10000).toFixed(1)}W`)
  console.log(`   头盔: ¥${((helmet.price || 0) / 10000).toFixed(1)}W`)
  console.log(`   甲修: ¥${(armorRepairPrice / 10000).toFixed(1)}W (${armorRepairItem?.name || '不配'})`)
  console.log(`   头修: ¥${(helmetRepairPrice / 10000).toFixed(1)}W (${helmetRepairItem?.name || '不配'})`)
  console.log(`   防御成本: ¥${(defenseCost / 10000).toFixed(1)}W`)

  remaining -= defenseCost
  console.log(`   剩余: ${(remaining / 10000).toFixed(1)}W`)

  // ---------- 组装靶子 ----------
  const totalCost = weaponPrice + bulletCost + defenseCost
  const usageRatio = budgetYuan > 0 ? (totalCost / budgetYuan * 100) : 0

  console.log('\n─── 靶子汇总 ───')
  console.log(`   武器: ${(weaponPrice / 10000).toFixed(1)}W`)
  console.log(`   子弹: ${(bulletCost / 10000).toFixed(1)}W`)
  console.log(`   防御: ${(defenseCost / 10000).toFixed(1)}W`)
  console.log(`   总计: ${(totalCost / 10000).toFixed(1)}W / 预算 ${budgetW}W (${usageRatio.toFixed(1)}%)`)
  console.log(`   距离: ${FIXED_TARGET_DISTANCE}m (固定)`)
  console.log('═══════════════════════════════════════════\n')

  _enemyIdCounter += 1
  return {
    _id: `enemy_${Date.now()}_${_enemyIdCounter}`,
    name: '',
    budgetW,
    weaponId: weapon.id,
    configId: config.configId,
    bulletId: chosenBullet.id,
    armorId: armor.id,
    helmetId: helmet.id,
    armorRepairId,
    helmetRepairId,
    distance: FIXED_TARGET_DISTANCE,
    carryCount: DEFAULT_CARRY_COUNT,
  }
}

/**
 * 空模板假想敌（兜底）
 */
const _makeEmptyEnemy = (index, budgetW) => {
  _enemyIdCounter += 1
  return {
    _id: `enemy_${Date.now()}_${_enemyIdCounter}`,
    name: `假想敌 ${index + 1}`,
    budgetW,
    weaponId: null,
    configId: null,
    bulletId: null,
    armorId: null,
    helmetId: null,
    armorRepairId: null,
    helmetRepairId: null,
    distance: randomDistance(null),
    carryCount: DEFAULT_CARRY_COUNT,
  }
}

/**
 * 推荐结果 → 假想敌对象
 *
 * 距离按武器射程分段权重随机
 */
const _recToEnemy = (rec, budgetW) => {
  if (!rec || !rec.gear) return null

  const weaponId = rec.gear.weapon?.id
  const configId = rec.gear.weapon?.configId
  const bulletId = rec.gear.bullet?.id
  const armorId = rec.gear.armor?.id
  const helmetId = rec.gear.helmet?.id
  const armorLevel = rec.gear.armor?.level
  const helmetLevel = rec.gear.helmet?.level
  const armorRepairPrice = rec.gear.repair?.armorRepairPrice || 0
  const helmetRepairPrice = rec.gear.repair?.helmetRepairPrice || 0

  if (!weaponId || !configId || !bulletId || !armorId || !helmetId) {
    console.warn('⚠️ RecPanel: _recToEnemy 缺少必要字段', rec)
    return null
  }

  // 按等级 + 是否有维修费，反推维修包 ID
  const armorRepairId = armorRepairPrice > 0
    ? _getRepairIdByLevel(armorLevel, 'armor')
    : null
  const helmetRepairId = helmetRepairPrice > 0
    ? _getRepairIdByLevel(helmetLevel, 'helmet')
    : null

  // 距离按武器射程分段权重随机
  const weapon = dataStore.getDataManager().getWeaponById(weaponId)
  const distance = randomDistance(weapon)

  _enemyIdCounter += 1
  return {
    _id: `enemy_${Date.now()}_${_enemyIdCounter}`,
    name: '',
    budgetW,
    weaponId,
    configId,
    bulletId,
    armorId,
    helmetId,
    armorRepairId,
    helmetRepairId,
    distance,
    carryCount: rec.gear.bullet.carryCount || DEFAULT_CARRY_COUNT,
    _recCost: rec.cost || null,
  }
}

// ============================================================
// 假想敌创建（带武器去重）
// ============================================================

/**
 * 创建假想敌
 *
 * 流程：临时靶子 → 跑推荐 → 从 top30 挑 → 转假想敌
 *
 * @param {number} index - 假想敌序号
 * @param {number} enemyBudgetW - 预算（W）
 * @param {Array<number>} excludeWeaponIds - 要排除的武器 ID（去重）
 * @returns {Promise<Object>}
 */
const createEnemy = async (index, enemyBudgetW, excludeWeaponIds = []) => {
  const finalBudgetW = (typeof enemyBudgetW === 'number' && enemyBudgetW > 0)
    ? enemyBudgetW
    : DEFAULT_BUDGET_W

  console.log(`\n\n╔═══════════════════════════════════════════╗`)
  console.log(`║  创建假想敌 #${index + 1}  (预算 ${finalBudgetW}W)`)
  if (excludeWeaponIds.length > 0) {
    console.log(`║  排除武器: [${excludeWeaponIds.join(', ')}]`)
  }
  console.log(`╚═══════════════════════════════════════════╝`)

  // ---------- ① 临时靶子 ----------
  const target = _makeTemporaryTarget(finalBudgetW)
  if (!target) {
    console.warn('❌ 临时靶子生成失败，返回空模板')
    return _makeEmptyEnemy(index, finalBudgetW)
  }

  const targetCost = getCostBreakdown(target).total
  console.log(`\n🎯 靶子已生成: 成本 ${(targetCost / 10000).toFixed(1)}W / 预算 ${finalBudgetW}W\n`)

  // ---------- ② 用靶子跑推荐 ----------
  console.log('═══════════════════════════════════════════')
  console.log('🔍 [步骤 ②] 用靶子跑推荐')
  console.log('═══════════════════════════════════════════')

  let recs = null
  try {
    const result = await runRecommendInternal(
      [buildEngineEnemy(target)],
      finalBudgetW,
      null
    )
    if (result?.recommendations) {
      recs = result.recommendations
      console.log(`✅ 推荐完成`)
    } else {
      console.warn('❌ 推荐返回空')
    }
  } catch (e) {
    console.warn('❌ 推荐抛异常:', e)
  }

  // ---------- 打印 top30 ----------
  if (recs) {
    const allRecs = [...(recs.topN || []), ...(recs.rest || [])]
    console.log(`\n📋 临时推荐池 (共 ${allRecs.length} 个):`)
    console.log('───────────────────────────────────────────')
    allRecs.forEach((r, i) => {
      const cost = r.cost?.total || 0
      const costW = (cost / 10000).toFixed(1)
      const ratio = finalBudgetW > 0 ? (cost / (finalBudgetW * 10000) * 100).toFixed(1) : '0'
      const winRate = (r.winRate * 100).toFixed(1)
      const wid = r.gear?.weapon?.id
      const weapon = `${r.gear?.weapon?.name || '?'} ${r.gear?.weapon?.configId || ''}`
      const excluded = excludeWeaponIds.includes(wid) ? ' 🚫' : ''
      console.log(
        `  #${String(i + 1).padStart(2)}  ${costW.padStart(6)}W (${ratio.padStart(5)}%)  ` +
        `胜率 ${winRate.padStart(5)}%  ${weapon}${excluded}`
      )
    })
    console.log('───────────────────────────────────────────')

    const costs = allRecs.map(r => r.cost?.total || 0)
    if (costs.length > 0) {
      const minCost = Math.min(...costs)
      const maxCost = Math.max(...costs)
      const avgCost = costs.reduce((s, c) => s + c, 0) / costs.length
      console.log(`💰 成本分布: min ${(minCost / 10000).toFixed(1)}W / avg ${(avgCost / 10000).toFixed(1)}W / max ${(maxCost / 10000).toFixed(1)}W`)
    }
    console.log('')
  }

  // ---------- ③ 从 top30 随机挑一个（过滤已用武器） ----------
  console.log('═══════════════════════════════════════════')
  console.log('🎲 [步骤 ③] 从推荐池随机挑一个')
  console.log('═══════════════════════════════════════════')

  const allRecs = recs
    ? [...(recs.topN || []), ...(recs.rest || [])]
    : []

  // ⭐ 过滤掉已用武器
  let candidateRecs = allRecs
  if (excludeWeaponIds.length > 0) {
    const filtered = allRecs.filter(r => {
      const wid = r.gear?.weapon?.id
      return wid && !excludeWeaponIds.includes(wid)
    })
    if (filtered.length > 0) {
      candidateRecs = filtered
      console.log(`🎯 武器去重：${allRecs.length} → ${filtered.length}（排除 ${excludeWeaponIds.length} 个武器）`)
    } else {
      candidateRecs = allRecs
      console.warn(`⚠️ 所有候选武器都已用过，回退到全量池 (${allRecs.length} 个)`)
    }
  }

  let chosenRec = null
  if (candidateRecs.length > 0) {
    const chosenIndex = Math.floor(Math.random() * candidateRecs.length)
    chosenRec = candidateRecs[chosenIndex]

    const cost = chosenRec.cost?.total || 0
    const ratio = finalBudgetW > 0 ? (cost / (finalBudgetW * 10000) * 100).toFixed(1) : '0'
    console.log(`✅ 随机命中: #${chosenIndex + 1}`)
    console.log(`   ${chosenRec.gear?.weapon?.name || '?'} ${chosenRec.gear?.weapon?.configId || ''} (武器ID: ${chosenRec.gear?.weapon?.id})`)
    console.log(`   成本 ${(cost / 10000).toFixed(1)}W (${ratio}%)`)
    console.log(`   胜率 ${(chosenRec.winRate * 100).toFixed(1)}%`)
  } else {
    console.warn('⚠️ 推荐池为空，回退到靶子')
  }

  // ---------- ④ 转假想敌 ----------
  console.log('\n═══════════════════════════════════════════')
  console.log('✅ [步骤 ④] 转成假想敌')
  console.log('═══════════════════════════════════════════')

  let enemy = chosenRec ? _recToEnemy(chosenRec, finalBudgetW) : null

  if (!enemy) {
    enemy = target
    if (allRecs.length === 0) {
      console.warn('⚠️ 推荐结果为空，回退到靶子')
    }
  }

  enemy.budgetW = finalBudgetW
  enemy.name = `假想敌 ${index + 1}`

  const finalCost = calcEnemyCost(enemy)
  const finalRatio = finalBudgetW > 0 ? (finalCost / (finalBudgetW * 10000) * 100).toFixed(1) : '0'
  const source = chosenRec ? '推荐池' : '靶子(回退)'

  console.log(`   来源: ${source}`)
  console.log(`   武器ID: ${enemy.weaponId}`)
  console.log(`   最终成本: ${(finalCost / 10000).toFixed(1)}W / 预算 ${finalBudgetW}W (${finalRatio}%)`)
  console.log(`   最终距离: ${enemy.distance}m`)
  console.log('╚═══════════════════════════════════════════╝\n\n')

  return enemy
}

// ============================================================
// 持久化
// ============================================================

const _serializeEnemies = (list) => {
  return list.map(e => ({
    _id: e._id,
    name: e.name,
    budgetW: e.budgetW,
    weaponId: e.weaponId,
    configId: e.configId,
    bulletId: e.bulletId,
    armorId: e.armorId,
    helmetId: e.helmetId,
    armorRepairId: e.armorRepairId,
    helmetRepairId: e.helmetRepairId,
    distance: e.distance,
    carryCount: e.carryCount,
  }))
}

const schedulePersist = () => {
  clearTimeout(persistTimer)
  persistTimer = setTimeout(async () => {
    try {
      const cleanEnemies = JSON.parse(JSON.stringify(_serializeEnemies(enemies.value)))
      await saveRecPanelState({
        enemies: cleanEnemies,
        budget: budget.value,
      })
    } catch (e) {
      console.warn('⚠️ 保存配装面板状态失败:', e)
    }
  }, PERSIST_DEBOUNCE_MS)
}

const persistNow = async () => {
  try {
    const cleanEnemies = JSON.parse(JSON.stringify(_serializeEnemies(enemies.value)))
    await saveRecPanelState({
      enemies: cleanEnemies,
      budget: budget.value,
    })
  } catch (e) {
    console.warn('⚠️ 保存配装面板状态失败:', e)
  }
}

const markDirty = () => {
  if (recommendations.value) {
    recommendDirty.value = true
  }
}

// ============================================================
// 假想敌操作
// ============================================================

/**
 * 收集当前所有假想敌的武器 ID（去重）
 */
const _collectUsedWeaponIds = (excludeIndex = -1) => {
  const ids = []
  enemies.value.forEach((e, i) => {
    if (i === excludeIndex) return
    if (e.weaponId !== null && e.weaponId !== undefined) {
      if (!ids.includes(e.weaponId)) {
        ids.push(e.weaponId)
      }
    }
  })
  return ids
}

const addEnemy = async () => {
  if (enemies.value.length >= MAX_ENEMIES) return
  if (enemies.value.length === 0) return
  if (rerollingIndex.value !== null) return

  // 排除所有已有假想敌的武器
  const excludeWeaponIds = _collectUsedWeaponIds()

  const newEnemy = await createEnemy(
    enemies.value.length,
    budget.value,
    excludeWeaponIds
  )
  enemies.value.push(newEnemy)
  markDirty()
  schedulePersist()
}

const rerollEnemy = async (index) => {
  const enemy = enemies.value[index]
  if (!enemy) return
  if (rerollingIndex.value !== null) return
  if (isRunning.value) return

  const oldName = enemy.name
  const enemyBudgetW = enemy.budgetW || DEFAULT_BUDGET_W

  // 排除其他假想敌的武器（不排除自己）
  const excludeWeaponIds = _collectUsedWeaponIds(index)

  rerollingIndex.value = index

  try {
    const newEnemy = await createEnemy(index, enemyBudgetW, excludeWeaponIds)
    newEnemy.name = oldName || `假想敌 ${index + 1}`
    enemies.value.splice(index, 1, newEnemy)

    markDirty()
    schedulePersist()
  } catch (e) {
    console.error('❌ 重掷失败:', e)
  } finally {
    rerollingIndex.value = null
  }
}

const removeEnemy = (index) => {
  if (enemies.value.length <= 1) return
  if (rerollingIndex.value !== null) return

  enemies.value.splice(index, 1)
  markDirty()
  schedulePersist()
}

const onEnemyWeaponChange = (index) => {
  const enemy = enemies.value[index]
  if (!enemy) return

  enemy._recCost = null

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
  schedulePersist()
}

const onEnemyArmorChange = (index) => {
  const enemy = enemies.value[index]
  if (!enemy) return

  enemy._recCost = null

  // 按新护甲等级自动配维修包
  const armor = dataStore.getDataManager().getArmorById(enemy.armorId)
  enemy.armorRepairId = _getRepairIdByLevel(armor?.level, 'armor')

  markDirty()
  schedulePersist()
}

const onEnemyHelmetChange = (index) => {
  const enemy = enemies.value[index]
  if (!enemy) return

  enemy._recCost = null

  const helmet = dataStore.getDataManager().getArmorById(enemy.helmetId)
  enemy.helmetRepairId = _getRepairIdByLevel(helmet?.level, 'helmet')

  markDirty()
  schedulePersist()
}

/**
 * 从推荐结果添加为假想敌
 *
 * 不去重（用户主动选的）
 */
const addAsEnemy = (rec) => {
  if (!rec) return
  if (rerollingIndex.value !== null) return

  if (enemies.value.length >= MAX_ENEMIES) {
    const msg = `⚠️ 假想敌数量已满（${MAX_ENEMIES} 个），请先移除一个再添加`
    if (showAlert) showAlert(msg)
    else alert(msg)
    return
  }

  const newEnemy = _recToEnemy(rec, budget.value)
  if (!newEnemy) {
    const msg = '⚠️ 该推荐结果缺少必要字段，无法添加'
    if (showAlert) showAlert(msg)
    else alert(msg)
    return
  }

  newEnemy.name = `假想敌 ${enemies.value.length + 1}`
  enemies.value.push(newEnemy)
  markDirty()
  schedulePersist()

  console.log(
    `➕ 已添加为假想敌: ${rec.gear.weapon.name} ${rec.gear.weapon.configId}（配装预算 ${newEnemy.budgetW}W，距离 ${newEnemy.distance}m）`
  )
}

// ============================================================
// 复制改枪码
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

const calcButtonTitle = computed(() => {
  if (isRunning.value) return '推荐中...'
  return `综合推荐（我方预算 ${budget.value}W，面对 ${enemies.value.length} 个假想敌）`
})

// ============================================================
// 装备标签辅助
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

const repairLabel = (rec) => {
  const repair = rec?.gear?.repair
  if (!repair || repair.repairCost <= 0) return '-'

  const parts = []
  if (repair.armorRepairPrice > 0) {
    const level = rec?.gear?.armor?.level
    parts.push(`${level}甲修`)
  }
  if (repair.helmetRepairPrice > 0) {
    const level = rec?.gear?.helmet?.level
    parts.push(`${level}头修`)
  }
  return parts.join(' + ') || '-'
}

const repairTooltip = (rec) => {
  const repair = rec?.gear?.repair
  if (!repair || repair.repairCost <= 0) return ''

  const lines = ['🔧 维修包']
  if (repair.armorRepairPrice > 0) {
    const level = rec?.gear?.armor?.level
    lines.push(`${level}甲 → ${getRepairName(level, 'armor')} ¥${(repair.armorRepairPrice / 10000).toFixed(1)}W`)
  }
  if (repair.helmetRepairPrice > 0) {
    const level = rec?.gear?.helmet?.level
    lines.push(`${level}头 → ${getRepairName(level, 'helmet')} ¥${(repair.helmetRepairPrice / 10000).toFixed(1)}W`)
  }
  lines.push(`合计: ¥${(repair.repairCost / 10000).toFixed(1)}W`)
  return lines.join('\n')
}

const getRepairName = (level, type) => {
  const map = type === 'armor' ? REPAIR_ARMOR_NAMES : REPAIR_HELMET_NAMES
  return map[level] || '-'
}

const gearTotalTooltip = (rec) => {
  if (!rec?.cost) return ''

  const lines = ['💰 总价明细']
  const c = rec.cost

  if (c.gunPrice > 0) lines.push(`武器: ¥${(c.gunPrice / 10000).toFixed(1)}W`)
  if (c.bulletCost > 0) lines.push(`子弹: ¥${(c.bulletCost / 10000).toFixed(1)}W`)
  if (c.armorPrice > 0) lines.push(`护甲: ¥${(c.armorPrice / 10000).toFixed(1)}W`)
  if (c.helmetPrice > 0) lines.push(`头盔: ¥${(c.helmetPrice / 10000).toFixed(1)}W`)
  if (c.repairCost > 0) lines.push(`维修包: ¥${(c.repairCost / 10000).toFixed(1)}W`)
  lines.push(`────────────`)
  lines.push(`合计: ¥${(c.total / 10000).toFixed(1)}W`)

  return lines.join('\n')
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
// 胜率相关辅助
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
// 格式化辅助
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
  if (v === undefined || v === null || !isFinite(v)) return '-'
  if (v > 0) {
    if (v >= 10000) return `¥${(v / 10000).toFixed(1)}W`
    return `¥${Math.round(v)}`
  }
  return '-'
}

// ============================================================
// 引擎参数构建
// ============================================================

const buildEngineEnemy = (e) => {
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
}

const buildEngineEnemies = () => {
  return enemies.value.map(buildEngineEnemy)
}

const buildEngineParams = () => {
  const p = paramsStore.state
  return {
    hitRateMap: p.hitRateMap || [],
    hitProb: p.hitProb || { head: 0.1, chest: 0.3, stomach: 0.3, legs: 0.3 },
    triggerDelayEnable: p.triggerDelayEnable !== false,
    healthValue: p.healthValue ?? 100
  }
}

const runRecommendInternal = async (enemiesList, budgetW, progressRange = null) => {
  const engine = window.__recEngine
  if (!engine) return null

  const input = {
    budget: budgetW,
    enemies: enemiesList,
    params: buildEngineParams(),
    kdRatio: paramsStore.state.kdRatio ?? 1.0,
    extraCost: paramsStore.state.extraCost ?? 30
  }

  let onProgress = null
  if (progressRange) {
    const [start, end] = progressRange
    onProgress = (current, total, phase) => {
      const localPercent = total > 0 ? Math.round((current / total) * 100) : 0
      const globalPercent = start + Math.round((end - start) * localPercent / 100)

      progress.value.current = current
      progress.value.total = total
      progress.value.percent = globalPercent

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
  }

  const result = await engine.recommend(input, { onProgress, recordLog: false })
  return result
}

// ============================================================
// 推荐主入口
// ============================================================

const runRecommend = async () => {
  if (isRunning.value) return

  const engine = window.__recEngine
  if (!engine) {
    if (showAlert) {
      await showAlert('⚠️ 推荐引擎未初始化（window.__recEngine 不存在）')
    }
    return
  }

  isRunning.value = true
  recommendations.value = null
  visibleRestCount.value = 10

  progress.value.visible = true
  progress.value.title = '推荐中...'
  progress.value.phase = '准备中...'
  progress.value.current = 0
  progress.value.total = 0
  progress.value.percent = 0

  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 150))

  try {
    if (enemies.value.length === 0) {
      progress.value.title = '正在初始化...'
      progress.value.phase = '生成初始假想敌'
      progress.value.percent = 5

      // 第一个假想敌，无需排除
      const firstEnemy = await createEnemy(0, budget.value, [])
      firstEnemy.name = '假想敌 1'
      enemies.value = [firstEnemy]
    }

    const enemiesList = buildEngineEnemies()

    progress.value.title = '综合推荐中...'
    progress.value.phase = `面对 ${enemiesList.length} 个假想敌（我方预算 ${budget.value}W）`
    progress.value.percent = 20

    const result = await runRecommendInternal(enemiesList, budget.value, [20, 100])

    if (result && result.recommendations) {
      recommendations.value = result.recommendations
      recommendDirty.value = false
      visibleRestCount.value = 10

      if (engine.printResult) {
        engine.printResult(result)
      }

      window.__lastRecResult = result
    }

    await persistNow()

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

const initPanel = async () => {
  try {
    const state = await loadRecPanelState()

    if (state && Array.isArray(state.enemies) && state.enemies.length > 0) {
      enemies.value = state.enemies
      budget.value = typeof state.budget === 'number' ? state.budget : DEFAULT_BUDGET_W

      let maxId = 0
      for (const e of state.enemies) {
        const match = String(e._id || '').match(/_(\d+)$/)
        if (match) {
          const n = parseInt(match[1], 10)
          if (n > maxId) maxId = n
        }
        if (typeof e.budgetW !== 'number' || !e.budgetW) {
          e.budgetW = budget.value
        }
      }
      _enemyIdCounter = maxId

      console.log(`✅ 已恢复配装面板状态：${enemies.value.length} 个假想敌，我方预算 ${budget.value}W`)
    } else {
      enemies.value = []
      budget.value = DEFAULT_BUDGET_W
      console.log('ℹ️ 无持久化状态，显示空状态')
    }
  } catch (e) {
    console.warn('⚠️ 恢复配装面板状态失败:', e)
    enemies.value = []
    budget.value = DEFAULT_BUDGET_W
  }
}

// ============================================================
// Watch：持久化触发
// ============================================================

watch(
  () => [enemies.value.length, budget.value],
  () => {
    if (enemies.value.length > 0) {
      schedulePersist()
    }
  },
  { deep: false }
)

watch(
  enemies,
  () => {
    if (enemies.value.length > 0) {
      schedulePersist()
    }
  },
  { deep: true }
)

// ============================================================
// 生命周期
// ============================================================

onMounted(() => {
  if (!dataStore.state.isLoaded) {
    setTimeout(() => {
      initPanel()
    }, 800)
  } else {
    initPanel()
  }
})

onBeforeUnmount(() => {
  clearTimeout(persistTimer)
  if (copiedTimer) clearTimeout(copiedTimer)
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
   视图切换过渡动画
   ============================================================ */

.rec-view-fade-enter-active {
  transition: all 0.35s cubic-bezier(0.34, 1.2, 0.64, 1);
}

.rec-view-fade-leave-active {
  transition: all 0.2s ease;
}

.rec-view-fade-enter-from {
  opacity: 0;
  transform: scale(0.96) translateY(12px);
}

.rec-view-fade-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(-12px);
}

/* ============================================================
   空状态（居中卡片）
   ============================================================ */

.rec-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 420px;
  padding: 40px 20px;
}

.rec-empty-card {
  background: #fff;
  border-radius: 16px;
  padding: 40px 44px 36px;
  box-shadow: 0 8px 40px rgba(74, 108, 247, 0.10),
              0 2px 8px rgba(0, 0, 0, 0.04);
  border: 1px solid #e8ecf5;
  text-align: center;
  max-width: 440px;
  width: 100%;
  transition: all 0.2s;
}

.rec-empty-title {
  font-family: var(--font-family);
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 10px;
  letter-spacing: 0.5px;
}

.rec-empty-hint {
  font-family: var(--font-family);
  font-size: 13px;
  color: #999;
  margin-bottom: 28px;
  line-height: 1.6;
}

.rec-empty-budget-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  background: #fff8e1;
  border: 1px solid #ffe0a8;
  border-radius: 10px;
  margin-bottom: 20px;
}

.rec-empty-budget-label {
  font-family: var(--font-family);
  font-size: 14px;
  font-weight: 600;
  color: #e65100;
  white-space: nowrap;
}

.rec-empty-budget-input {
  width: 100px;
  padding: 8px 12px;
  border: 1px solid #ffcc80;
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 700;
  background: #fff;
  color: var(--color-text);
  text-align: center;
  outline: none;
  transition: border-color 0.15s;
}

.rec-empty-budget-input:focus {
  border-color: #ff9800;
  box-shadow: 0 0 0 3px rgba(255, 152, 0, 0.12);
}

.rec-empty-budget-unit {
  font-family: var(--font-family);
  font-size: 13px;
  color: #e65100;
  white-space: nowrap;
}

.rec-empty-start-btn {
  width: 100%;
  padding: 12px 24px;
  background: linear-gradient(135deg, #4a6cf7, #6a8cf7);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-family: var(--font-family);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 4px 14px rgba(74, 108, 247, 0.25);
  letter-spacing: 0.5px;
}

.rec-empty-start-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #3a5cd7, #5a7ce7);
  box-shadow: 0 6px 20px rgba(74, 108, 247, 0.35);
  transform: translateY(-1px);
}

.rec-empty-start-btn:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(74, 108, 247, 0.25);
}

.rec-empty-start-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

/* ============================================================
   完整界面容器
   ============================================================ */

.rec-full-view {
  width: 100%;
}

/* ============================================================
   假想敌配置区
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
  flex: 1 1 300px;
  min-width: 0;
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

.enemy-card.is-rerolling {
  opacity: 0.5;
  pointer-events: none;
}

.enemy-card[data-index="0"] { border-left: 4px solid #f44336; }
.enemy-card[data-index="1"] { border-left: 4px solid #ff9800; }
.enemy-card[data-index="2"] { border-left: 4px solid #9c27b0; }
.enemy-card[data-index="3"] { border-left: 4px solid #2196f3; }
.enemy-card[data-index="4"] { border-left: 4px solid #4caf50; }
.enemy-card[data-index="5"] { border-left: 4px solid #009688; }

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
.enemy-card[data-index="3"] .enemy-index { background: #2196f3; }
.enemy-card[data-index="4"] .enemy-index { background: #4caf50; }
.enemy-card[data-index="5"] .enemy-index { background: #009688; }

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

.btn-reroll:hover:not(:disabled) {
  background: #f3e5f5;
  border-color: #9c27b0;
}

.btn-reroll:active:not(:disabled) { transform: scale(0.96); }

.btn-reroll:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.remove-enemy-btn:hover:not(:disabled) {
  background: #ffebee;
  color: #f44336;
}

.remove-enemy-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

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

/* ---------- 带价格的字段 ---------- */
.enemy-field.with-price .label {
  width: 36px;
}

.enemy-field .price-tag {
  font-family: var(--font-mono);
  font-size: 10px;
  color: #e67e22;
  font-weight: 600;
  flex-shrink: 0;
  min-width: 50px;
  text-align: right;
}

.enemy-field .price-tag.repair-tag {
  color: #5e35b1;
}

/* ---------- 维修字段（只读） ---------- */
.repair-field {
  background: #f8f9ff;
  border-radius: 3px;
  padding: 2px 2px !important;
}

.enemy-field .readonly-value {
  flex: 1;
  min-width: 0;
  padding: 3px 6px;
  border: 1px dashed #d0d0d0;
  border-radius: 3px;
  font-family: var(--font-family);
  font-size: 11px;
  background: #fff;
  color: #5e35b1;
  height: 24px;
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.enemy-field .readonly-value.is-empty {
  color: #bbb;
  font-style: italic;
}

/* ---------- 卡片底部 ---------- */
.card-footer {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #e0e4ea;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 11px;
  color: #888;
}

.cost-total-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

.card-footer .carry-count {
  color: #4a6cf7;
  font-weight: 600;
}

.card-footer .cost-sep {
  color: #ccc;
}

.card-footer .cost-total {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 13px;
  color: #e67e22;
}

.card-footer .cost-total.over {
  color: #f44336;
}

.card-footer .cost-ratio {
  font-family: var(--font-mono);
  font-size: 10px;
  color: #999;
}

.card-footer .cost-ratio.over {
  color: #f44336;
  font-weight: 600;
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
  flex-wrap: wrap;
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

.budget-hint {
  font-size: 10px;
  color: #999;
  white-space: nowrap;
  margin-left: 4px;
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
   无推荐结果提示
   ============================================================ */

.no-rec-hint {
  background: #f0f4ff;
  border: 1px solid #d0ddff;
  color: #4a6cf7;
  border-radius: 6px;
  padding: 16px 14px;
  margin-bottom: 16px;
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

/* ============================================================
   脏标记提示条
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
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
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
   空状态（推荐完成后无结果）
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

.repair-row {
  background: #f8f9ff;
  margin: 0 -6px;
  padding-left: 6px;
  padding-right: 6px;
  border-radius: 4px;
}

.repair-value {
  color: #5e35b1;
  font-weight: 600;
}

.repair-price {
  color: #5e35b1;
  font-weight: 700;
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
   第 4~30 名表格
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

.num-cell.gear-total {
  color: #e67e22;
  line-height: 1.25;
}

.gear-total-main {
  font-weight: 700;
}

.gear-total-sub {
  font-size: 10px;
  color: #5e35b1;
  font-weight: 500;
}

.num-cell.winrate {
  font-weight: 700;
  font-size: 13px;
}

.num-cell.winrate.rate-good { color: #4caf50; }
.num-cell.winrate.rate-warn { color: #ff9800; }
.num-cell.winrate.rate-bad  { color: #f44336; }

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
  .rec-empty-state {
    min-height: 300px;
    padding: 24px 16px;
  }

  .rec-empty-card {
    padding: 28px 24px 24px;
    border-radius: 12px;
  }

  .rec-empty-title {
    font-size: 18px;
    margin-bottom: 8px;
  }

  .rec-empty-hint {
    font-size: 12px;
    margin-bottom: 20px;
  }

  .rec-empty-budget-row {
    padding: 10px 12px;
    margin-bottom: 16px;
  }

  .rec-empty-budget-input {
    width: 80px;
    padding: 6px 10px;
    font-size: 15px;
  }

  .rec-empty-start-btn {
    padding: 11px 20px;
    font-size: 14px;
  }

  .panel {
    padding: 10px 12px;
  }

  .enemies-grid {
    gap: 8px;
  }

  .enemy-card {
    flex: 1 1 100%;
    max-width: 100%;
    padding: 8px 10px;
  }

  .enemy-field .label {
    font-size: 10px;
    width: 40px;
  }

  .enemy-field.with-price .label {
    width: 34px;
  }

  .enemy-field select,
  .enemy-field input {
    font-size: 10px;
    height: 26px;
  }

  .enemy-field .readonly-value {
    font-size: 10px;
    height: 26px;
    line-height: 20px;
  }

  .enemy-field .price-tag {
    font-size: 9px;
    min-width: 44px;
  }

  .budget-row {
    gap: 6px 12px;
  }

  .budget-input {
    width: 70px;
    font-size: 12px;
  }

  .budget-hint {
    font-size: 9px;
  }

  .calc-btn {
    width: 100%;
    margin-left: 0;
    padding: 8px 16px;
  }

  .no-rec-hint {
    padding: 12px;
    font-size: 12px;
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