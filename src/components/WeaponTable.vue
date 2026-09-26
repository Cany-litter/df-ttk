<!-- src/components/WeaponTable.vue -->
<template>
  <div class="weapon-table-wrapper">
    <!-- ============================================================ -->
    <!-- 工具栏 -->
    <!-- ============================================================ -->
    <div class="table-controls">
      <!-- 左组：操作按钮 -->
      <div class="controls-left">
        <button class="btn-sm btn-primary" @click="addWeapon">➕ 新增枪械</button>
        <button class="btn-sm btn-outline" @click="expandAll">
          {{ hasActiveFilter ? '🔽 展开筛选' : '🔽 全部展开' }}
        </button>
        <button class="btn-sm btn-outline" @click="collapseAll">
          {{ hasActiveFilter ? '🔼 收起筛选' : '🔼 全部收起' }}
        </button>
        <span class="toolbar-divider"></span>
        <button class="btn-sm btn-success" @click="enableAllConfigs">
          {{ hasActiveFilter ? '✅ 启用筛选' : '✅ 全部启用' }}
        </button>
        <button class="btn-sm btn-danger" @click="disableAllConfigs">
          {{ hasActiveFilter ? '❌ 禁用筛选' : '❌ 全部禁用' }}
        </button>

        <!-- ⭐ v7.3：清除导入标记（有标记时才显示） -->
        <button
          v-if="importedConfigCount > 0"
          class="btn-sm btn-clear-import"
          :title="`共 ${importedConfigCount} 个新增配置，点击清除标记`"
          @click="onClearImportMarks"
        >
          🧹 清除导入标记 ({{ importedConfigCount }})
        </button>

        <span class="control-hint">（新增后在卡片内填写数据，点击"确认"保存）</span>
        <span class="count-badge">共 {{ totalCount }} 把武器</span>
        <span class="count-badge">配置启用 {{ globalEnabledConfigCount }}/{{ globalConfigCount }}</span>
      </div>

      <!-- 右组：搜索 + 筛选 + 排序 -->
      <div class="controls-right">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input
            v-model="searchQuery"
            type="text"
            class="search-input"
            placeholder="搜索武器名…"
          />
          <button
            v-if="searchQuery"
            class="search-clear-btn"
            title="清除"
            @click="searchQuery = ''"
          >✕</button>
        </div>

        <label class="filter-item">
          <span class="filter-label">排序:</span>
          <select v-model="sortKey" class="filter-select">
            <option value="default">默认</option>
            <option value="aim_asc">开镜 ↑</option>
            <option value="aim_desc">开镜 ↓</option>
            <option value="price_asc">价格 ↑</option>
            <option value="price_desc">价格 ↓</option>
            <option value="score_asc">评分 ↑</option>
            <option value="score_desc">评分 ↓</option>
            <option value="havoc_asc">哈弗币 ↑</option>
            <option value="havoc_desc">哈弗币 ↓</option>
            <option value="ttk_asc">TTK ↑</option>
            <option value="ttk_desc">TTK ↓</option>
          </select>
        </label>

        <label class="filter-item">
          <span class="filter-label">口径:</span>
          <select v-model="filterCaliber" class="filter-select">
            <option value="all">全部口径</option>
            <option
              v-for="cal in caliberFilterOptions"
              :key="cal"
              :value="cal"
            >{{ cal }}</option>
          </select>
        </label>

        <button
          v-if="hasActiveFilter"
          class="clear-filter-btn"
          title="清空所有搜索/筛选/排序"
          @click="clearFilters"
        >✕ 清空筛选</button>

        <span
          class="display-count"
          :class="{ 'is-filtered': hasActiveFilter }"
        >
          显示 {{ filteredCount }}/{{ totalCount }} 把
        </span>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- 空结果提示 -->
    <!-- ============================================================ -->
    <div v-if="displayedRows.length === 0" class="empty-result">
      <div class="icon">😶</div>
      <div>没有匹配的武器</div>
      <div class="hint">试试调整搜索词或筛选条件</div>
      <button class="btn-sm btn-outline empty-reset-btn" @click="clearFilters">
        ✕ 清空筛选
      </button>
    </div>

    <!-- ============================================================ -->
    <!-- 桌面端：卡片列表 -->
    <!-- ============================================================ -->
    <div v-if="!isMobile && displayedRows.length > 0" class="weapon-card-list">
      <div
        v-for="(row, index) in displayedRows"
        :key="row.id || index"
        class="weapon-card"
        :class="{
          'new-row': row._isNewRow,
          'is-imported': row._isImported === true
        }"
      >
        <!-- ============ 武器头 ============ -->
        <div v-if="row._isNewRow" class="weapon-head new-head">
          <input v-model="row.name" class="new-row-input name-input" placeholder="武器名称" />
          <select v-model="row.type" class="new-row-select">
            <option v-for="t in typeOptions" :key="t" :value="t">{{ t }}</option>
          </select>
          <select v-model="row.allowedBullet" class="new-row-select">
            <option v-for="cal in caliberOptions" :key="cal" :value="cal">{{ cal }}</option>
          </select>
          <span class="new-hint">新武器</span>
        </div>

        <div v-else class="weapon-head">
          <button
            class="collapse-btn"
            :title="isCollapsed(row.id) ? '展开' : '收起'"
            @click.stop="toggleCollapse(row.id)"
          >
            {{ isCollapsed(row.id) ? '▶' : '▼' }}
          </button>

          <div class="wh-name">
            <span class="weapon-name" :title="row.name">{{ row.name }}</span>
            <span
              v-if="row._isImported === true"
              class="imported-badge"
              title="本次导入新增的武器"
            >🆕</span>
          </div>

          <div class="wh-type">
            <span class="weapon-type">{{ row.type }}</span>
          </div>

          <div class="wh-caliber">
            <span class="weapon-caliber" :title="row.allowedBullet || '-'">{{ row.allowedBullet || '-' }}</span>
          </div>

          <div class="wh-attach">
            <span class="k">枪管</span>
            <select
              class="head-select"
              :value="row.activeConfig?.barrelId ?? -1"
              @change="onActiveConfigFieldChange(index, 'barrelId', parseInt($event.target.value))"
            >
              <option v-for="(b, i) in row.barrels" :key="i" :value="i">{{ b.name }}</option>
              <option :value="-1">无</option>
            </select>
          </div>

          <div class="wh-attach">
            <span class="k">枪口</span>
            <select
              class="head-select"
              :value="row.activeConfig?.muzzleId ?? 0"
              @change="onActiveConfigFieldChange(index, 'muzzleId', parseInt($event.target.value))"
            >
              <option v-for="m in muzzleOptions" :key="m" :value="muzzleOptions.indexOf(m)">{{ m }}</option>
            </select>
          </div>

          <div
            class="wh-precision"
            :class="{ 'is-disabled': isNoBarrel(row.activeConfig) }"
          >
            <span class="k">精校</span>
            <input
              type="range"
              min="-0.09" max="0.09" step="0.01"
              :value="isNoBarrel(row.activeConfig) ? 0 : (row.activeConfig?.precision ?? 0.09)"
              :disabled="isNoBarrel(row.activeConfig)"
              @input="onPrecisionInput(index, $event)"
              @change="onPrecisionCommit(index, $event)"
            />
            <span class="val">
              {{ isNoBarrel(row.activeConfig) ? 0 : Math.round((row.activeConfig?.precision ?? 0.09) * 100) }}%
            </span>
          </div>

          <div class="wh-attr" :title="getAttrTooltip('射速', row.rof, Math.round(row.rofCurrent))">
            <span class="k">射速</span>
            <span class="v">{{ Math.round(row.rofCurrent) }}</span>
          </div>
          <div class="wh-attr" :title="getAttrTooltip('初速', row.velocity, row.velocityCurrent)">
            <span class="k">初速</span>
            <span class="v">{{ row.velocityCurrent }}</span>
          </div>
          <div class="wh-attr" :title="getAttrTooltip('肉伤', row.flesh, row.fleshCurrent)">
            <span class="k">肉伤</span>
            <span class="v flesh">{{ row.fleshCurrent }}</span>
          </div>
          <div class="wh-attr" :title="getAttrTooltip('甲伤', row.armor, row.armorCurrent)">
            <span class="k">甲伤</span>
            <span class="v armor">{{ row.armorCurrent }}</span>
          </div>

          <div class="wh-attr wh-attr-wide">
            <span class="k">射程</span>
            <span class="v">{{ row.rangesCurrent.map(fmtDist).join('/') }}</span>
          </div>
          <div class="wh-attr wh-attr-wide">
            <span class="k">衰减</span>
            <span class="v muted">{{ row.decaysCurrent.map(d => d.toFixed(2)).join('/') }}</span>
          </div>
          <div class="wh-attr wh-attr-tags">
            <span class="k">倍率</span>
            <span class="mult-tags">
              <span class="mult-tag head">{{ fmtMult(row.multCurrent.head) }}</span>
              <span class="mult-tag chest">{{ fmtMult(row.multCurrent.chest) }}</span>
              <span class="mult-tag stomach">{{ fmtMult(row.multCurrent.stomach) }}</span>
              <span class="mult-tag limbs">{{ fmtMult(row.multCurrent.limbs) }}</span>
            </span>
          </div>
          <div class="wh-attr wh-attr-tags">
            <span class="k">伤害</span>
            <span class="dmg-tags">
              <span class="dmg-tag head">{{ row.partDamageArr[0] }}</span>
              <span class="dmg-tag chest">{{ row.partDamageArr[1] }}</span>
              <span class="dmg-tag stomach">{{ row.partDamageArr[2] }}</span>
              <span class="dmg-tag limbs">{{ row.partDamageArr[3] }}</span>
            </span>
          </div>
        </div>

        <!-- 新增行：中间字段 -->
        <template v-if="row._isNewRow">
          <div class="new-row-fields">
            <span class="attr-pair">
              <span class="k">射速</span>
              <input v-model.number="row.rof" class="new-row-input tiny" type="number" step="1" min="0" />
            </span>
            <span class="attr-pair">
              <span class="k">初速</span>
              <input v-model.number="row.velocity" class="new-row-input tiny" type="number" step="1" min="0" />
            </span>
            <span class="attr-pair">
              <span class="k">肉伤</span>
              <input v-model.number="row.flesh" class="new-row-input tiny" type="number" step="0.1" min="0" />
            </span>
            <span class="attr-pair">
              <span class="k">甲伤</span>
              <input v-model.number="row.armor" class="new-row-input tiny" type="number" step="0.1" min="0" />
            </span>
            <span class="attr-pair">
              <span class="k">射程</span>
              <input v-model="rangesDisplay" class="new-row-input" placeholder="40,70,∞,∞" @blur="parseRanges(row)" />
            </span>
            <span class="attr-pair">
              <span class="k">衰减</span>
              <input v-model="decaysDisplay" class="new-row-input" placeholder="1.0,0.9,0.75,0.75,0.75" @blur="parseDecays(row)" />
            </span>
            <span class="attr-pair">
              <span class="k">倍率</span>
              <input v-model="multDisplay" class="new-row-input" placeholder="1.9,1,0.9,0.4" @blur="parseMult(row)" />
            </span>
          </div>
        </template>

        <!-- ============ 秒伤 + 操作 行 ============ -->
        <div v-if="!row._isNewRow" v-show="!isCollapsed(row.id)" class="weapon-dps-row">
          <span class="dps-label">秒伤</span>
          <div class="dps-inline">
            <div v-for="(seg, si) in row._dps" :key="si" class="dps-seg">
              <div class="seg-head">
                <span class="seg-dist">{{ fmtDist(seg.start) }}-{{ fmtDist(seg.end) }}m</span>
                <span class="seg-decay">×{{ seg.decay }}</span>
              </div>
              <div class="seg-values">
                <span class="dps-val head">
                  <span class="p">头</span>
                  <span class="n">{{ fmtDPS(seg.flesh.head) }}</span>
                </span>
                <span class="dps-val chest">
                  <span class="p">胸</span>
                  <span class="n">{{ fmtDPS(seg.flesh.chest) }}</span>
                </span>
                <span class="dps-val stomach">
                  <span class="p">腹</span>
                  <span class="n">{{ fmtDPS(seg.flesh.stomach) }}</span>
                </span>
                <span class="dps-val limbs">
                  <span class="p">肢</span>
                  <span class="n">{{ fmtDPS(seg.flesh.limbs) }}</span>
                </span>
                <span class="dps-val armor">
                  <span class="p">甲</span>
                  <span class="n">{{ fmtDPS(seg.armor) }}</span>
                </span>
              </div>
            </div>
          </div>

          <div class="head-actions">
            <button
              class="head-btn update"
              :class="{
                'dirty': isWeaponDirty(row.id),
                'updating': isWeaponUpdating(row.id)
              }"
              :disabled="isWeaponUpdating(row.id) || isGlobalCalculating"
              :title="getUpdateButtonTitle(row.id)"
              @click="updateWeaponTTK(index)"
            >
              <template v-if="isWeaponUpdating(row.id)">⏳ 更新中…</template>
              <template v-else>
                🔄 更新评分<span v-if="isWeaponDirty(row.id)" class="dirty-dot">●</span>
              </template>
            </button>

            <button class="head-btn add" @click="addConfig(row)">➕ 新增配置</button>
            <button class="head-btn base" @click="editBase(index)">编辑属性</button>
            <button class="head-btn barrel" @click="editBarrel(index)">编辑枪管</button>
            <button class="head-btn del" @click="deleteWeapon(index)">删除</button>
          </div>
        </div>

        <!-- ============ 配置列表 ============ -->
        <div
          v-if="!row._isNewRow && row._configRows.length > 0"
          v-show="!isCollapsed(row.id)"
          class="config-section"
        >
          <div class="config-list">
            <div
              v-for="cfg in row._configRows"
              :key="cfg.configId"
              class="config-item"
              :class="{
                enabled: cfg.enabled !== false,
                disabled: cfg.enabled === false,
                active: cfg.configId === row.activeConfigId,
                'is-imported': cfg._isImported === true
              }"
              @click="selectConfig(index, cfg.configId)"
            >
              <input
                type="checkbox"
                class="config-enabled"
                :checked="cfg.enabled !== false"
                @click.stop
                @change="toggleConfig(index, cfg.configId, $event.target.checked)"
              />

              <!-- ⭐ v7.5：configId 改为可编辑输入框 -->
              <input
                type="text"
                class="config-id-input"
                :class="{ 'is-imported-id': cfg._isImported === true }"
                :value="cfg.configId"
                :title="cfg._isImported ? '本次导入新增的配置（可编辑）' : '点击可编辑序号'"
                @click.stop
                @blur="onConfigIdChange(index, cfg.configId, $event)"
                @keydown.enter="$event.target.blur()"
              />

              <div class="buildcode-wrap">
                <input
                  type="text"
                  class="buildcode-input"
                  :value="cfg.buildCode"
                  :title="cfg.buildCode"
                  placeholder="输入改枪码"
                  @click.stop
                  @change="updateConfigField(index, cfg.configId, 'buildCode', $event.target.value)"
                />
                <button
                  class="btn-copy-code"
                  :class="{ copied: copiedRowKey === getConfigKey(row.id, cfg.configId) }"
                  :disabled="!cfg.buildCode || cfg.buildCode.trim() === ''"
                  :title="copiedRowKey === getConfigKey(row.id, cfg.configId) ? '已复制' : '复制改枪码'"
                  @click.stop="copyBuildCode(row.id, cfg.configId, cfg.buildCode, $event)"
                >
                  {{ copiedRowKey === getConfigKey(row.id, cfg.configId) ? '✅' : '📋' }}
                </button>
              </div>

              <span class="fld">
                <span class="k">枪管</span>
                <select
                  class="inline-select"
                  :value="cfg.barrelId"
                  @click.stop
                  @change="updateConfigField(index, cfg.configId, 'barrelId', parseInt($event.target.value))"
                >
                  <option v-for="(b, i) in row.barrels" :key="i" :value="i">{{ b.name }}</option>
                  <option :value="-1">无</option>
                </select>
              </span>

              <span class="fld">
                <span class="k">枪口</span>
                <select
                  class="inline-select"
                  :value="cfg.muzzleId"
                  @click.stop
                  @change="updateConfigField(index, cfg.configId, 'muzzleId', parseInt($event.target.value))"
                >
                  <option v-for="m in muzzleOptions" :key="m" :value="muzzleOptions.indexOf(m)">{{ m }}</option>
                </select>
              </span>

              <div class="hitrate-wrap">
                <span class="k">命中率</span>
                <input
                  type="text"
                  class="hitrate-input"
                  :value="cfg.hitRateRaw"
                  :title="cfg.hitRateRaw"
                  placeholder="30:1.0,50:0.8,100:0.5"
                  @click.stop
                  @change="onHitRateChange(index, cfg.configId, $event.target.value)"
                />
              </div>

              <span class="fld">
                <span class="k">开镜</span>
                <input
                  type="number"
                  class="inline-input aim-input"
                  :value="cfg.aimSpeed"
                  min="0"
                  step="1"
                  @click.stop
                  @change="updateConfigField(index, cfg.configId, 'aimSpeed', parseFloat($event.target.value) || 0)"
                />
                <span class="unit-tiny">ms</span>
              </span>

              <span class="fld">
                <span class="k">价格</span>
                <input
                  type="number"
                  class="inline-input price-input"
                  :value="cfg.price / 10000"
                  step="0.1" min="0"
                  @click.stop
                  @change="updateConfigField(index, cfg.configId, 'price', parseFloat($event.target.value) * 10000)"
                />
                <span class="price-unit">W</span>
              </span>

              <span class="fld">
                <span class="k">子弹</span>
                <select
                  class="inline-select"
                  :value="cfg.bulletId || ''"
                  @click.stop
                  @change="onBulletChange(index, cfg.configId, $event.target.value)"
                >
                  <option value="">无</option>
                  <option
                    v-for="opt in getBulletOptionsForWeapon(row)"
                    :key="opt.id"
                    :value="opt.id"
                  >{{ opt.display }}</option>
                </select>
              </span>

              <span class="fld">
                <span class="k">哈弗币</span>
                <span
                  class="v havoc-cost"
                  :class="havocColor(cfg.havocCost)"
                  :title="getHavocTooltip(cfg._havocCost)"
                  :style="{ cursor: cfg._havocCost ? 'help' : 'default' }"
                >
                  {{ cfg.havocCost != null ? fmtPrice(cfg.havocCost) : '-' }}
                </span>
              </span>

              <!-- ⭐ 评分列 -->
              <span class="fld">
                <span class="k">评分</span>
                <template v-if="cfg.overallScore != null">
                  <span
                    class="v overall-value"
                    :class="'overall-' + cfg.overallScore.grade"
                    :title="getOverallTooltip(cfg)"
                    style="cursor: help;"
                  >
                    {{ Math.round(cfg.overallScore.score) }}ms
                  </span>
                </template>
                <span v-else class="v overall-empty">—</span>
              </span>

              <div class="config-actions">
                <button
                  class="cfg-btn detail"
                  @click.stop="showDetail(index, cfg.configId)"
                >模拟</button>
                <button
                  class="cfg-btn del"
                  @click.stop="deleteConfig(index, cfg.configId)"
                >删除</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 新增行的确认/取消 -->
        <div v-if="row._isNewRow" class="new-row-actions">
          <button class="head-btn base" @click="confirmAdd(index)">✅ 确认</button>
          <button class="head-btn del" @click="cancelAdd(index)">❌ 取消</button>
        </div>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- 移动端：卡片列表 -->
    <!-- ============================================================ -->
    <div v-if="isMobile && displayedRows.length > 0" class="weapon-card-list mobile">
      <div
        v-for="(row, index) in displayedRows"
        :key="row.id || index"
        class="weapon-card"
        :class="{
          'new-row': row._isNewRow,
          'is-imported': row._isImported === true
        }"
      >
        <!-- 身份行 -->
        <div class="card-row row-identity">
          <template v-if="row._isNewRow">
            <input v-model="row.name" class="new-row-input name-input" placeholder="武器名称" />
            <select v-model="row.type" class="new-row-select">
              <option v-for="t in typeOptions" :key="t" :value="t">{{ t }}</option>
            </select>
          </template>
          <template v-else>
            <button
              class="collapse-btn"
              :title="isCollapsed(row.id) ? '展开' : '收起'"
              @click.stop="toggleCollapse(row.id)"
            >
              {{ isCollapsed(row.id) ? '▶' : '▼' }}
            </button>
            <span class="weapon-name">{{ row.name }}</span>
            <span
              v-if="row._isImported === true"
              class="imported-badge"
              title="本次导入新增的武器"
            >🆕</span>
            <span class="weapon-type">{{ row.type }}</span>
            <span class="weapon-caliber">{{ row.allowedBullet || '-' }}</span>
          </template>
        </div>

        <!-- 新增行字段 -->
        <template v-if="row._isNewRow">
          <div class="card-row">
            <span class="row-label">口径</span>
            <select v-model="row.allowedBullet" class="new-row-select flex-input">
              <option v-for="cal in caliberOptions" :key="cal" :value="cal">{{ cal }}</option>
            </select>
          </div>
          <div class="card-row">
            <span class="row-label">射速</span>
            <input v-model.number="row.rof" class="new-row-input flex-input" type="number" step="1" min="0" />
            <span class="row-label">初速</span>
            <input v-model.number="row.velocity" class="new-row-input flex-input" type="number" step="1" min="0" />
          </div>
          <div class="card-row">
            <span class="row-label">肉伤</span>
            <input v-model.number="row.flesh" class="new-row-input flex-input" type="number" step="0.1" min="0" />
            <span class="row-label">甲伤</span>
            <input v-model.number="row.armor" class="new-row-input flex-input" type="number" step="0.1" min="0" />
          </div>
          <div class="card-row">
            <span class="row-label">射程</span>
            <input v-model="rangesDisplay" class="new-row-input flex-input" placeholder="40,70,∞,∞" @blur="parseRanges(row)" />
          </div>
          <div class="card-row">
            <span class="row-label">衰减</span>
            <input v-model="decaysDisplay" class="new-row-input flex-input" placeholder="1.0,0.9,0.75,0.75,0.75" @blur="parseDecays(row)" />
          </div>
          <div class="card-row">
            <span class="row-label">倍率</span>
            <input v-model="multDisplay" class="new-row-input flex-input" placeholder="1.9,1,0.9,0.4" @blur="parseMult(row)" />
          </div>
          <div class="card-row row-actions">
            <button class="action-btn edit-base" @click="confirmAdd(index)">✅ 确认</button>
            <button class="action-btn delete" @click="cancelAdd(index)">❌ 取消</button>
          </div>
        </template>

        <!-- 已有行 -->
        <template v-else>
          <template v-if="!isCollapsed(row.id)">
            <div class="card-row">
              <span class="row-label">枪管</span>
              <select
                class="attach-select full"
                :value="row.activeConfig?.barrelId ?? -1"
                @change="onActiveConfigFieldChange(index, 'barrelId', parseInt($event.target.value))"
              >
                <option v-for="(b, i) in row.barrels" :key="i" :value="i">{{ b.name }}</option>
                <option :value="-1">无</option>
              </select>
            </div>

            <div class="card-row">
              <span class="row-label">枪口</span>
              <select
                class="attach-select full"
                :value="row.activeConfig?.muzzleId ?? 0"
                @change="onActiveConfigFieldChange(index, 'muzzleId', parseInt($event.target.value))"
              >
                <option v-for="m in muzzleOptions" :key="m" :value="muzzleOptions.indexOf(m)">{{ m }}</option>
              </select>
            </div>

            <div class="card-row">
              <span class="row-label">精校</span>
              <div
                class="precision-input-wrap"
                :class="{ 'is-disabled': isNoBarrel(row.activeConfig) }"
              >
                <input
                  type="range"
                  min="-0.09" max="0.09" step="0.01"
                  :value="isNoBarrel(row.activeConfig) ? 0 : (row.activeConfig?.precision ?? 0.09)"
                  :disabled="isNoBarrel(row.activeConfig)"
                  @input="onPrecisionInput(index, $event)"
                  @change="onPrecisionCommit(index, $event)"
                />
                <span class="val">
                  {{ isNoBarrel(row.activeConfig) ? 0 : Math.round((row.activeConfig?.precision ?? 0.09) * 100) }}%
                </span>
              </div>
            </div>

            <div class="card-row">
              <span class="row-label">射速</span>
              <div class="row-value">
                <span class="v-pair" :title="getAttrTooltip('射速', row.rof, Math.round(row.rofCurrent))">
                  <span class="v">{{ Math.round(row.rofCurrent) }}</span>
                </span>
                <span class="v-pair" :title="getAttrTooltip('初速', row.velocity, row.velocityCurrent)">
                  <span class="k">初速</span>
                  <span class="v">{{ row.velocityCurrent }}</span>
                </span>
              </div>
            </div>

            <div class="card-row">
              <span class="row-label">伤/程</span>
              <div class="row-value">
                <span class="v-pair" :title="getAttrTooltip('肉伤', row.flesh, row.fleshCurrent)">
                  <span class="k">肉</span>
                  <span class="v flesh">{{ row.fleshCurrent }}</span>
                </span>
                <span class="v-pair" :title="getAttrTooltip('甲伤', row.armor, row.armorCurrent)">
                  <span class="k">甲</span>
                  <span class="v armor">{{ row.armorCurrent }}</span>
                </span>
                <span class="v-pair">
                  <span class="k">射程</span>
                  <span class="v">{{ row.rangesCurrent.map(fmtDist).join('/') }}</span>
                </span>
              </div>
            </div>

            <div class="card-row">
              <span class="row-label">倍率</span>
              <div class="row-value">
                <span class="mult-tags">
                  <span class="mult-tag head">{{ fmtMult(row.multCurrent.head) }}</span>
                  <span class="mult-tag chest">{{ fmtMult(row.multCurrent.chest) }}</span>
                  <span class="mult-tag stomach">{{ fmtMult(row.multCurrent.stomach) }}</span>
                  <span class="mult-tag limbs">{{ fmtMult(row.multCurrent.limbs) }}</span>
                </span>
                <span class="dmg-tags">
                  <span class="dmg-tag head">{{ row.partDamageArr[0] }}</span>
                  <span class="dmg-tag chest">{{ row.partDamageArr[1] }}</span>
                  <span class="dmg-tag stomach">{{ row.partDamageArr[2] }}</span>
                  <span class="dmg-tag limbs">{{ row.partDamageArr[3] }}</span>
                </span>
              </div>
            </div>

            <div class="card-row row-dps">
              <span class="row-label">秒伤</span>
              <div class="dps-seg-list">
                <div v-for="(seg, si) in row._dps" :key="si" class="dps-seg">
                  <div class="seg-head">
                    <span class="seg-dist">{{ fmtDist(seg.start) }}-{{ fmtDist(seg.end) }}m</span>
                    <span class="seg-decay">×{{ seg.decay }}</span>
                  </div>
                  <div class="seg-values">
                    <span class="dps-val head"><span class="p">头</span><span class="n">{{ fmtDPS(seg.flesh.head) }}</span></span>
                    <span class="dps-val chest"><span class="p">胸</span><span class="n">{{ fmtDPS(seg.flesh.chest) }}</span></span>
                    <span class="dps-val stomach"><span class="p">腹</span><span class="n">{{ fmtDPS(seg.flesh.stomach) }}</span></span>
                    <span class="dps-val limbs"><span class="p">肢</span><span class="n">{{ fmtDPS(seg.flesh.limbs) }}</span></span>
                    <span class="dps-val armor"><span class="p">甲</span><span class="n">{{ fmtDPS(seg.armor) }}</span></span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 配置区 -->
            <div v-if="row._configRows.length > 0" class="card-row config-section-mobile">
              <div class="config-list">
                <div
                  v-for="cfg in row._configRows"
                  :key="cfg.configId"
                  class="config-item-mobile"
                  :class="{
                    enabled: cfg.enabled !== false,
                    disabled: cfg.enabled === false,
                    active: cfg.configId === row.activeConfigId,
                    'is-imported': cfg._isImported === true
                  }"
                  @click="selectConfig(index, cfg.configId)"
                >
                  <div class="cfg-mobile-head">
                    <input
                      type="checkbox"
                      class="config-enabled"
                      :checked="cfg.enabled !== false"
                      @click.stop
                      @change="toggleConfig(index, cfg.configId, $event.target.checked)"
                    />
                    <!-- ⭐ v7.5：configId 改为可编辑输入框（移动端） -->
                    <input
                      type="text"
                      class="config-id-input"
                      :class="{ 'is-imported-id': cfg._isImported === true }"
                      :value="cfg.configId"
                      :title="cfg._isImported ? '本次导入新增的配置（可编辑）' : '点击可编辑序号'"
                      @click.stop
                      @blur="onConfigIdChange(index, cfg.configId, $event)"
                      @keydown.enter="$event.target.blur()"
                    />
                    <input
                      type="text"
                      class="buildcode-input flex-1"
                      :value="cfg.buildCode"
                      placeholder="改枪码"
                      @click.stop
                      @change="updateConfigField(index, cfg.configId, 'buildCode', $event.target.value)"
                    />
                    <button
                      class="btn-copy-code"
                      :disabled="!cfg.buildCode"
                      @click.stop="copyBuildCode(row.id, cfg.configId, cfg.buildCode, $event)"
                    >📋</button>
                  </div>
                  <div class="cfg-mobile-row">
                    <span class="k">枪管</span>
                    <select
                      class="inline-select"
                      :value="cfg.barrelId"
                      @click.stop
                      @change="updateConfigField(index, cfg.configId, 'barrelId', parseInt($event.target.value))"
                    >
                      <option v-for="(b, i) in row.barrels" :key="i" :value="i">{{ b.name }}</option>
                      <option :value="-1">无</option>
                    </select>
                  </div>
                  <div class="cfg-mobile-row">
                    <span class="k">枪口</span>
                    <select
                      class="inline-select"
                      :value="cfg.muzzleId"
                      @click.stop
                      @change="updateConfigField(index, cfg.configId, 'muzzleId', parseInt($event.target.value))"
                    >
                      <option v-for="m in muzzleOptions" :key="m" :value="muzzleOptions.indexOf(m)">{{ m }}</option>
                    </select>
                  </div>
                  <div class="cfg-mobile-row">
                    <span class="k">命中率</span>
                    <input
                      type="text"
                      class="hitrate-input flex-1"
                      :value="cfg.hitRateRaw"
                      placeholder="30:1,50:0.8"
                      @click.stop
                      @change="onHitRateChange(index, cfg.configId, $event.target.value)"
                    />
                  </div>
                  <div class="cfg-mobile-row">
                    <span class="k">开镜</span>
                    <input
                      type="number"
                      class="inline-input"
                      :value="cfg.aimSpeed"
                      min="0"
                      step="1"
                      @click.stop
                      @change="updateConfigField(index, cfg.configId, 'aimSpeed', parseFloat($event.target.value) || 0)"
                    />
                    <span class="k">ms</span>
                  </div>
                  <div class="cfg-mobile-row">
                    <span class="k">价格</span>
                    <input
                      type="number"
                      class="inline-input"
                      :value="cfg.price / 10000"
                      step="0.1"
                      @click.stop
                      @change="updateConfigField(index, cfg.configId, 'price', parseFloat($event.target.value) * 10000)"
                    />
                    <span class="k">W</span>
                  </div>
                  <div class="cfg-mobile-row">
                    <span class="k">子弹</span>
                    <select
                      class="inline-select flex-1"
                      :value="cfg.bulletId || ''"
                      @click.stop
                      @change="onBulletChange(index, cfg.configId, $event.target.value)"
                    >
                      <option value="">无</option>
                      <option
                        v-for="opt in getBulletOptionsForWeapon(row)"
                        :key="opt.id"
                        :value="opt.id"
                      >{{ opt.display }}</option>
                    </select>
                  </div>
                  <div class="cfg-mobile-row">
                    <span class="k">哈弗币</span>
                    <span
                      class="v havoc-cost"
                      :class="havocColor(cfg.havocCost)"
                      :title="getHavocTooltip(cfg._havocCost)"
                      :style="{ cursor: cfg._havocCost ? 'help' : 'default' }"
                    >
                      {{ cfg.havocCost != null ? fmtPrice(cfg.havocCost) : '-' }}
                    </span>
                  </div>
                  <!-- ⭐ 评分行 -->
                  <div class="cfg-mobile-row">
                    <span class="k">评分</span>
                    <template v-if="cfg.overallScore != null">
                      <span
                        class="v overall-value"
                        :class="'overall-' + cfg.overallScore.grade"
                        :title="getOverallTooltip(cfg)"
                      >
                        {{ Math.round(cfg.overallScore.score) }}ms
                      </span>
                    </template>
                    <span v-else class="v overall-empty">—</span>
                    <div class="config-actions">
                      <button class="cfg-btn detail" @click.stop="showDetail(index, cfg.configId)">模拟</button>
                      <button class="cfg-btn del" @click.stop="deleteConfig(index, cfg.configId)">删除</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- 操作行（移动端） -->
          <div class="card-row row-actions">
            <button
              class="action-btn update"
              :class="{
                'dirty': isWeaponDirty(row.id),
                'updating': isWeaponUpdating(row.id)
              }"
              :disabled="isWeaponUpdating(row.id) || isGlobalCalculating"
              @click="updateWeaponTTK(index)"
            >
              <template v-if="isWeaponUpdating(row.id)">⏳ 更新中…</template>
              <template v-else>
                🔄 更新评分<span v-if="isWeaponDirty(row.id)" class="dirty-dot">●</span>
              </template>
            </button>

            <button class="action-btn edit-base" @click="addConfig(row)">➕ 新增配置</button>
            <button class="action-btn edit-barrel" @click="editBarrel(index)">🔧 编辑枪管</button>
            <button class="action-btn delete" @click="deleteWeapon(index)">🗑️ 删除</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, inject } from 'vue'
import { dataStore, appStore, paramsStore } from '@/stores/stores'
import { calculateCurrentValues } from '@/utils/weaponCalc'

const props = defineProps({
  data: {
    type: Array,
    required: true
  },
  muzzleOptions: {
    type: Array,
    default: () => ['无', '死寂', '先进/轻语/勇火', '冲锋枪回声消音器']
  },
  getBarrelOptions: {
    type: Function,
    required: true
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

const emit = defineEmits([
  'update',
  'edit-barrel',
  'add-weapon',
  'delete-weapon',
  'show-damage-detail',
  'update-ttk'
])

const showConfirm = inject('showConfirm', null)
const showAlert = inject('showAlert', null)

const typeOptions = ['步枪', '冲锋枪', '轻机枪', '精确射手步枪', '手枪']

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

// ============================================================
// 无枪管判断
// ============================================================
const isNoBarrel = (config) => {
  if (!config) return false
  const barrelId = (config.barrelId !== undefined) ? config.barrelId : -1
  return barrelId === -1
}

// ============================================================
// 搜索 / 筛选 / 排序
// ============================================================

const searchQuery = ref('')
const filterCaliber = ref('all')
const sortKey = ref('default')

const hasActiveFilter = computed(() => {
  return searchQuery.value.trim() !== '' ||
         filterCaliber.value !== 'all' ||
         sortKey.value !== 'default'
})

const caliberFilterOptions = computed(() => {
  const weapons = dataStore.state.weapons || []
  const set = new Set()
  for (const w of weapons) {
    if (w.allowedBullet) set.add(w.allowedBullet)
  }
  return Array.from(set).sort()
})

const getSortFieldValue = (row, key) => {
  if (!key || key === 'default') return 0

  const [field, dir] = key.split('_')
  const isAsc = dir === 'asc'
  const configs = row._configRows || []

  if (configs.length === 0) return Infinity

  const values = configs
    .map(cfg => getSortFieldValueForConfig(cfg, field))
    .filter(v => v != null && isFinite(v))

  if (values.length === 0) return Infinity

  return isAsc ? Math.min(...values) : Math.max(...values)
}

const getSortFieldValueForConfig = (cfg, field) => {
  switch (field) {
    case 'aim':
      return (typeof cfg.aimSpeed === 'number' && !isNaN(cfg.aimSpeed))
        ? cfg.aimSpeed
        : null

    case 'price':
      return (typeof cfg.price === 'number' && isFinite(cfg.price) && cfg.price > 0)
        ? cfg.price
        : null

    case 'score':
      return (cfg.overallScore != null && isFinite(cfg.overallScore.score))
        ? cfg.overallScore.score
        : null

    case 'havoc':
      return (cfg.havocCost != null && isFinite(cfg.havocCost))
        ? cfg.havocCost
        : null

    case 'ttk':
      return (cfg._scoreTtk != null && isFinite(cfg._scoreTtk))
        ? cfg._scoreTtk
        : null

    default:
      return null
  }
}

const getSortDirection = (key) => {
  if (!key || key === 'default') return 1
  return key.endsWith('_desc') ? -1 : 1
}

const compareBySortKey = (a, b, key) => {
  if (key === 'default') return 0

  const [field] = key.split('_')
  const dir = getSortDirection(key)

  const va = getSortFieldValueForConfig(a, field)
  const vb = getSortFieldValueForConfig(b, field)

  const aNull = (va == null || !isFinite(va))
  const bNull = (vb == null || !isFinite(vb))

  if (aNull && bNull) return 0
  if (aNull) return 1
  if (bNull) return -1

  return (va - vb) * dir
}

// ============================================================
// 收起/展开状态
// ============================================================
const collapsedMap = reactive({})

const isCollapsed = (weaponId) => {
  return collapsedMap[weaponId] === true
}

const toggleCollapse = (weaponId) => {
  if (isCollapsed(weaponId)) {
    delete collapsedMap[weaponId]
  } else {
    collapsedMap[weaponId] = true
  }
}

const expandAll = () => {
  for (const row of displayedRows.value) {
    if (!row._isNewRow) {
      delete collapsedMap[row.id]
    }
  }
}

const collapseAll = () => {
  for (const row of displayedRows.value) {
    if (!row._isNewRow) {
      collapsedMap[row.id] = true
    }
  }
}

// ============================================================
// 全部启用 / 全部禁用配置
// ============================================================

const enableAllConfigs = () => {
  const dm = dataStore.getDataManager()
  let count = 0

  const visibleWeaponIds = hasActiveFilter.value
    ? new Set(displayedRows.value.filter(r => !r._isNewRow).map(r => r.id))
    : null

  for (const price of dm.getPrices()) {
    if (visibleWeaponIds && !visibleWeaponIds.has(price.weaponId)) continue

    for (const config of price.configs) {
      if (config.enabled === false) {
        dm.updatePriceConfig(price.weaponId, config.id, { enabled: true })
        count++
      }
    }
  }

  if (count > 0) {
    dataStore.refreshPrices()
    console.log(`✅ 已启用 ${count} 个配置` + (visibleWeaponIds ? '（筛选结果）' : ''))
  } else {
    console.log('ℹ️ 所有配置已启用')
  }
}

const disableAllConfigs = () => {
  const dm = dataStore.getDataManager()
  let count = 0

  const visibleWeaponIds = hasActiveFilter.value
    ? new Set(displayedRows.value.filter(r => !r._isNewRow).map(r => r.id))
    : null

  for (const price of dm.getPrices()) {
    if (visibleWeaponIds && !visibleWeaponIds.has(price.weaponId)) continue

    for (const config of price.configs) {
      if (config.enabled !== false) {
        dm.updatePriceConfig(price.weaponId, config.id, { enabled: false })
        count++
      }
    }
  }

  if (count > 0) {
    dataStore.refreshPrices()
    console.log(`❌ 已禁用 ${count} 个配置` + (visibleWeaponIds ? '（筛选结果）' : ''))
  } else {
    console.log('ℹ️ 所有配置已禁用')
  }
}

const clearFilters = () => {
  searchQuery.value = ''
  filterCaliber.value = 'all'
  sortKey.value = 'default'
}

// ============================================================
// 当前选中的配置
// ============================================================
const activeConfigMap = reactive({})

const getActiveConfigId = (weaponId, configs) => {
  if (
    activeConfigMap[weaponId] &&
    configs.some(c => c.configId === activeConfigMap[weaponId])
  ) {
    return activeConfigMap[weaponId]
  }

  if (configs && configs.length > 0) {
    const firstEnabled = configs.find(c => c.enabled !== false)
    const defaultId = firstEnabled ? firstEnabled.configId : configs[0].configId
    activeConfigMap[weaponId] = defaultId
    return defaultId
  }

  return null
}

// ============================================================
// 秒伤计算
// ============================================================
const calcDPSBySegment = (current) => {
  const { ranges, decays, flesh, armor, rof, mult } = current
  if (!ranges || !decays || !mult) return []

  const bounds = [
    { start: 0,          end: ranges[0], decay: decays[0] },
    { start: ranges[0],  end: ranges[1], decay: decays[1] },
    { start: ranges[1],  end: ranges[2], decay: decays[2] },
    { start: ranges[2],  end: ranges[3], decay: decays[3] },
    { start: ranges[3],  end: Infinity,  decay: decays[4] }
  ]

  const segments = []
  for (const b of bounds) {
    if (b.start >= b.end) continue
    segments.push({
      start: b.start, end: b.end, decay: b.decay,
      flesh: {
        head:    flesh * mult.head    * b.decay * rof / 60,
        chest:   flesh * mult.chest   * b.decay * rof / 60,
        stomach: flesh * mult.stomach * b.decay * rof / 60,
        limbs:   flesh * mult.limbs   * b.decay * rof / 60
      },
      armor: armor * b.decay * rof / 60
    })
  }
  return segments
}

const fmtDist = (v) => v === Infinity ? '∞' : Math.round(v)
const fmtDPS = (v) => v.toFixed(1)
const fmtPrice = (v) => v >= 10000 ? `¥${(v / 10000).toFixed(1)}W` : `¥${v}`

const fmtMult = (v) => {
  if (typeof v !== 'number' || !isFinite(v)) return v
  const rounded = Math.round((v + Number.EPSILON) * 100) / 100
  return rounded
}

const havocColor = (v) => {
  if (v == null) return 'havoc-empty'
  const w = v / 10000
  if (w > 60) return 'havoc-red'
  if (w > 30) return 'havoc-orange'
  return 'havoc-green'
}

const getAttrTooltip = (label, original, current) => {
  return `${label}\n${original} → ${current}`
}

// ============================================================
// 评分 tooltip（配置行）
// ============================================================

const getOverallTooltip = (cfg) => {
  if (!cfg.overallScore) return ''
  const { score, grade } = cfg.overallScore

  const aimWeight = paramsStore.state.aimWeight ?? 0.4
  const aimSpeed = cfg.aimSpeed || 0
  const avgTTK = score - aimWeight * aimSpeed

  const lines = [
    `═══════════════════════════════`,
    `⭐ 评分: ${score.toFixed(1)}ms`,
    `分档: ${grade}`,
    `───────────────────────────────`,
    `距离加权平均TTK: ${avgTTK.toFixed(1)}ms`,
    `开镜时间: ${aimSpeed}ms × ${aimWeight} = ${(aimWeight * aimSpeed).toFixed(1)}ms`,
    `───────────────────────────────`,
    `公式: ${avgTTK.toFixed(1)} + ${aimWeight} × ${aimSpeed} = ${score.toFixed(1)}ms`,
    `═══════════════════════════════`
  ]
  return lines.join('\n')
}

const getHavocTooltip = (cost) => {
  if (!cost) return ''
  const lines = [
    `═══════════════════════════════`,
    `💰 哈弗币消耗: ¥${(cost.totalCost / 10000).toFixed(1)}W`,
    `═══════════════════════════════`,
    `整枪损失: ¥${(cost.weaponLossCost / 10000).toFixed(1)}W`,
    `子弹消耗: ¥${(cost.bulletCost / 10000).toFixed(1)}W`,
    `平均致死枪数: ${cost.avgShots.toFixed(1)} 发`,
    `KD 放大: ${(cost.kdRatio * 5).toFixed(1)}x`,
    `子弹单价: ¥${cost.bulletPrice}`
  ]
  return lines.join('\n')
}

// ============================================================
// 单枪更新状态判断
// ============================================================

const isWeaponDirty = (weaponId) => {
  if (weaponId === undefined || weaponId === null) return false
  const row = rowsWithCurrent.value.find(r => r.id === weaponId)
  if (row?._isNewRow) return false
  return dataStore.isWeaponModified(weaponId)
}

const isWeaponUpdating = (weaponId) => {
  if (weaponId === undefined || weaponId === null) return false
  return appStore.isUpdatingWeapon(weaponId)
}

const isGlobalCalculating = computed(() => {
  return appStore.state.isGlobalCalculating === true
})

const getUpdateButtonTitle = (weaponId) => {
  if (isWeaponUpdating(weaponId)) return '评分更新中…'
  if (isGlobalCalculating.value) return '全局计算中，请稍候'
  if (isWeaponDirty(weaponId)) return '有未同步的修改，点击更新评分'
  return '重新计算该武器所有配置的评分'
}

const updateWeaponTTK = (index) => {
  const row = displayedRows.value[index]
  if (!row || row._isNewRow) return
  if (isWeaponUpdating(row.id)) return
  if (isGlobalCalculating.value) return

  emit('update-ttk', { weaponId: row.id })
}

// ============================================================
// 核心：rowsWithCurrent
// ============================================================

const rowsWithCurrent = computed(() => {
  const weapons = dataStore.state.weapons
  const prices = dataStore.state.prices
  void prices

  void dataStore.state.modifiedVersion
  void appStore.state.updatingWeaponIds
  void appStore.state.isGlobalCalculating

  const havocCosts = appStore.state.havocCosts || {}
  const weaponScores = appStore.state.weaponScores || {}

  return weapons.map(weapon => {
    if (weapon._isNewRow) {
      return { ...weapon, _isNewRow: true }
    }

    const configRows = dataStore.getPriceRowsForWeapon(weapon.id)
    const activeConfigId = getActiveConfigId(weapon.id, configRows)
    const activeConfig = configRows.find(c => c.configId === activeConfigId) || null

    let barrel = null
    if (activeConfig && activeConfig.barrelId >= 0 && weapon.barrels && weapon.barrels[activeConfig.barrelId]) {
      barrel = weapon.barrels[activeConfig.barrelId]
    }
    const muzzleId = activeConfig?.muzzleId ?? 0
    const precision = activeConfig?.precision ?? 0.09

    const current = calculateCurrentValues(weapon, barrel, muzzleId, precision)

    const partDamageArr = ['head', 'chest', 'stomach', 'limbs'].map(p =>
      Math.round(current.flesh * (current.mult[p] ?? 1))
    )

    const dps = calcDPSBySegment(current)

    let configsWithHavoc = configRows.map(cfg => {
      const key = `${weapon.id}_${cfg.configId}`
      const cost = havocCosts[key] || null
      const overallData = weaponScores[key] || null

      return {
        ...cfg,
        havocCost: cost?.totalCost ?? null,
        _havocCost: cost,
        overallScore: overallData || null,
        _isImported: cfg._isImported === true,
      }
    })

    if (sortKey.value !== 'default') {
      configsWithHavoc = [...configsWithHavoc].sort((a, b) =>
        compareBySortKey(a, b, sortKey.value)
      )
    }

    const enabledCount = configsWithHavoc.filter(c => c.enabled !== false).length

    return {
      ...weapon,
      _isImported: weapon._isImported === true,
      barrels: weapon.barrels || [],
      rofCurrent: current.rof,
      velocityCurrent: current.velocity,
      rangesCurrent: current.ranges,
      decaysCurrent: current.decays,
      fleshCurrent: current.flesh,
      armorCurrent: current.armor,
      multCurrent: current.mult,
      partDamageArr,
      _dps: dps,
      _configRows: configsWithHavoc,
      _configCount: configsWithHavoc.length,
      _enabledCount: enabledCount,
      activeConfigId,
      activeConfig,
      _isNewRow: false
    }
  })
})

// ============================================================
// ⭐ v7.3：导入标记统计（必须在 rowsWithCurrent 之后定义）
// ============================================================

const importedConfigCount = computed(() => {
  let count = 0
  for (const row of rowsWithCurrent.value) {
    if (row._isNewRow) continue
    for (const cfg of row._configRows || []) {
      if (cfg._isImported) count++
    }
  }
  return count
})

const onClearImportMarks = async () => {
  let confirmed = true
  if (showConfirm) {
    const result = await showConfirm({
      title: '清除导入标记',
      message: `确定清除所有 ${importedConfigCount.value} 个"新增"标记吗？\n\n（不会删除数据，只是移除黄色高亮）`,
      confirmText: '清除',
      confirmType: 'warning'
    })
    confirmed = result.confirmed
  } else {
    confirmed = confirm('确定清除所有"新增"标记吗？')
  }

  if (!confirmed) return

  const count = dataStore.clearImportMarks()
  emit('update', { type: 'clear-import-marks', count })

  if (count > 0) {
    console.log(`🧹 已清除 ${count} 个导入标记`)
  }
}

// ============================================================
// ⭐ v7.5 / v8：配置 ID 编辑
//
// ⭐ v8 改动（问题 12）：
//   clearWeaponDerivedData 改为 async，除了清内存，也清 IndexedDB
// ============================================================

/**
 * 清掉某武器的评分 / 哈弗币缓存 + IndexedDB 缓存
 *
 * ⭐ v8：问题 12 - 新增 IndexedDB 清理
 *
 * 场景：configId 变更后（如 #1 → #5）
 *   - 旧 key（atk_{wid}_1_...）成孤儿，永远不被查
 *   - 新 key（atk_{wid}_5_...）需要重算
 *   - 内存里的 weaponScores / havocCosts 也带旧 configId
 *
 * @param {number} weaponId
 * @returns {Promise<void>}
 */
const clearWeaponDerivedData = async (weaponId) => {
  // ---------- 1. 清内存：评分 ----------
  const oldScores = appStore.state.weaponScores || {}
  const newScores = { ...oldScores }
  const prefix = `${weaponId}_`
  let scoreDeleted = 0
  for (const key of Object.keys(newScores)) {
    if (key.startsWith(prefix)) {
      delete newScores[key]
      scoreDeleted++
    }
  }
  if (scoreDeleted > 0) {
    appStore.setWeaponScores(newScores)
  }

  // ---------- 2. 清内存：哈弗币 ----------
  const oldHavoc = appStore.state.havocCosts || {}
  const newHavoc = { ...oldHavoc }
  let havocDeleted = 0
  for (const key of Object.keys(newHavoc)) {
    if (key.startsWith(prefix)) {
      delete newHavoc[key]
      havocDeleted++
    }
  }
  if (havocDeleted > 0) {
    appStore.setHavocCosts(newHavoc)
  }

  // ---------- 3. ⭐ v8：清 IndexedDB ----------
  let idbDeleted = 0
  try {
    const { deleteMatrixEntriesByPrefix } = await import('@/core/TTKIndexedDB')
    idbDeleted = await deleteMatrixEntriesByPrefix(`atk_${weaponId}_`)
  } catch (e) {
    console.warn('⚠️ 清理 IndexedDB 缓存失败:', e)
  }

  if (scoreDeleted > 0 || havocDeleted > 0 || idbDeleted > 0) {
    console.log(
      `🧹 已清除武器 ${weaponId} 的派生数据: ` +
      `评分 ${scoreDeleted}, 哈弗币 ${havocDeleted}, IndexedDB ${idbDeleted}`
    )
  }
}

/**
 * ⭐ v7.5：配置 ID 编辑（失焦时保存）
 *
 * ⭐ v8：clearWeaponDerivedData 现在是 async，需要 await
 */
const onConfigIdChange = async (index, oldConfigId, event) => {
  const row = displayedRows.value[index]
  if (!row) return

  const newConfigId = String(event.target.value || '').trim()

  // 没变化 → 不动
  if (newConfigId === oldConfigId) return

  // 调用 store（内部已 refresh prices）
  const result = await dataStore.updateConfigId(row.id, oldConfigId, newConfigId)

  if (!result.ok) {
    // 失败：恢复原值 + 提示
    event.target.value = oldConfigId
    if (showAlert) {
      showAlert(`⚠️ ${result.error}`)
    }
    return
  }

  // 成功：
  // 1. 如果该配置是当前选中配置 → 更新 activeConfigId
  if (activeConfigMap[row.id] === oldConfigId) {
    activeConfigMap[row.id] = newConfigId
  }

  // 2. 清掉该武器的评分/哈弗币缓存 + IndexedDB 缓存（key 变了）
  //    ⭐ v8：await
  await clearWeaponDerivedData(row.id)

  emit('update', {
    type: 'config-id-change',
    weaponId: row.id,
    oldConfigId,
    newConfigId,
    cacheDeleted: result.cacheDeleted,
  })

  console.log(`✅ 配置 ID 已修改: ${row.name} ${oldConfigId} → ${newConfigId}`)
}

// ============================================================
// displayedRows
// ============================================================

const displayedRows = computed(() => {
  let rows = rowsWithCurrent.value

  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    rows = rows.filter(r => {
      if (r._isNewRow) return true
      return (r.name || '').toLowerCase().includes(q)
    })
  }

  if (filterCaliber.value !== 'all') {
    rows = rows.filter(r => {
      if (r._isNewRow) return true
      return r.allowedBullet === filterCaliber.value
    })
  }

  if (sortKey.value !== 'default') {
    rows = [...rows].sort((a, b) => {
      if (a._isNewRow && !b._isNewRow) return -1
      if (!a._isNewRow && b._isNewRow) return 1
      if (a._isNewRow && b._isNewRow) return 0

      const va = getSortFieldValue(a, sortKey.value)
      const vb = getSortFieldValue(b, sortKey.value)
      const dir = getSortDirection(sortKey.value)

      const aNull = !isFinite(va)
      const bNull = !isFinite(vb)

      if (aNull && bNull) return 0
      if (aNull) return 1
      if (bNull) return -1

      return (va - vb) * dir
    })
  } else {
    rows = [...rows].sort((a, b) => {
      if (a._isNewRow && !b._isNewRow) return -1
      if (!a._isNewRow && b._isNewRow) return 1
      return 0
    })
  }

  return rows
})

const filteredCount = computed(() => {
  return displayedRows.value.filter(r => !r._isNewRow).length
})

const totalCount = computed(() => {
  return (dataStore.state.weapons || []).filter(w => !w._isNewRow).length
})

// ============================================================
// 全局配置统计
// ============================================================

const globalConfigCount = computed(() => {
  const prices = dataStore.state.prices || []
  let total = 0
  for (const price of prices) {
    if (Array.isArray(price.configs)) {
      total += price.configs.length
    }
  }
  return total
})

const globalEnabledConfigCount = computed(() => {
  const prices = dataStore.state.prices || []
  let enabled = 0
  for (const price of prices) {
    if (Array.isArray(price.configs)) {
      for (const config of price.configs) {
        if (config.enabled !== false) {
          enabled++
        }
      }
    }
  }
  return enabled
})

// ============================================================
// 新增行临时字段
// ============================================================
const rangesDisplay = ref('')
const decaysDisplay = ref('')
const multDisplay = ref('')

const parseRanges = (row) => {
  if (!row._isNewRow) return
  const str = rangesDisplay.value
  const ranges = str.split(',').map(v => {
    const trimmed = v.trim()
    if (trimmed === '∞' || trimmed === 'Infinity' || trimmed === '') return Infinity
    return parseFloat(trimmed) || 40
  })
  row.ranges = ranges
}

const parseDecays = (row) => {
  if (!row._isNewRow) return
  const str = decaysDisplay.value
  const decays = str.split(',').map(v => parseFloat(v.trim()) || 1.0)
  while (decays.length < 5) decays.push(1.0)
  row.decays = decays.slice(0, 5)
}

const parseMult = (row) => {
  if (!row._isNewRow) return
  const parts = multDisplay.value.split(',').map(v => parseFloat(v.trim()) || 1)
  row.mult = {
    head: parts[0] || 1.9,
    chest: parts[1] || 1,
    stomach: parts[2] || 0.9,
    limbs: parts[3] || 0.4
  }
}

// ============================================================
// 精校
// ============================================================
const precisionLocalMap = ref({})

const onPrecisionInput = (index, event) => {
  const row = displayedRows.value[index]
  if (!row) return
  if (isNoBarrel(row.activeConfig)) return

  const val = parseFloat(event.target.value)
  const el = event.target.nextElementSibling
  if (el) el.textContent = Math.round(val * 100) + '%'
  precisionLocalMap.value[row.id] = val
}

const onPrecisionCommit = (index, event) => {
  const row = displayedRows.value[index]
  if (!row || !row.activeConfig) return
  if (isNoBarrel(row.activeConfig)) return

  const val = parseFloat(event.target.value)
  updateConfigField(index, row.activeConfigId, 'precision', val)
  delete precisionLocalMap.value[row.id]
}

// ============================================================
// 配置操作
// ============================================================
const getConfigKey = (weaponId, configId) => `${weaponId}_${configId}`

const selectConfig = (index, configId) => {
  const row = displayedRows.value[index]
  if (!row) return
  activeConfigMap[row.id] = configId
}

const toggleConfig = (index, configId, enabled) => {
  const row = displayedRows.value[index]
  if (!row) return
  const dm = dataStore.getDataManager()
  dm.updatePriceConfig(row.id, configId, { enabled })
  dataStore.refreshPrices()
}

const onActiveConfigFieldChange = (index, field, value) => {
  const row = displayedRows.value[index]
  if (!row || !row.activeConfigId) return
  updateConfigField(index, row.activeConfigId, field, value)
}

const updateConfigField = (index, configId, field, value) => {
  const row = displayedRows.value[index]
  if (!row) return
  const dm = dataStore.getDataManager()

  if (field === 'barrelId') {
    const wasNoBarrel = (row.activeConfig?.barrelId ?? -1) === -1
    const willBeNoBarrel = value === -1

    if (willBeNoBarrel) {
      dm.updatePriceConfig(row.id, configId, { barrelId: -1, precision: 0 })
    } else if (wasNoBarrel) {
      dm.updatePriceConfig(row.id, configId, { barrelId: value, precision: 0.09 })
    } else {
      dm.updatePriceConfig(row.id, configId, { barrelId: value })
    }
  } else {
    dm.updatePriceConfig(row.id, configId, { [field]: value })
  }

  dataStore.refreshPrices()
  emit('update', { index, type: field, value, weaponId: row.id })
}

const onHitRateChange = (index, configId, str) => {
  const row = displayedRows.value[index]
  if (!row) return
  const parsed = parseHitRateString(str)
  const dm = dataStore.getDataManager()
  dm.updatePriceConfig(row.id, configId, {
    distance: parsed.distance,
    hitRate: parsed.hitRate
  })
  dataStore.refreshPrices()
}

const parseHitRateString = (str) => {
  if (!str || str.trim() === '') return { distance: [], hitRate: [] }
  const parts = str.split(',').map(p => p.trim()).filter(Boolean)
  const distance = [], hitRate = []
  for (const part of parts) {
    const [d, r] = part.split(':')
    const dist = parseFloat(d), rate = parseFloat(r)
    if (isNaN(dist) || dist < 0) continue
    if (isNaN(rate) || rate < 0 || rate > 1) continue
    distance.push(dist)
    hitRate.push(rate)
  }
  const pairs = distance.map((d, i) => ({ d, r: hitRate[i] }))
  pairs.sort((a, b) => a.d - b.d)
  return {
    distance: pairs.map(p => p.d),
    hitRate: pairs.map(p => p.r)
  }
}

const onBulletChange = (index, configId, bulletId) => {
  const row = displayedRows.value[index]
  if (!row) return
  const dm = dataStore.getDataManager()

  const finalBulletId = (bulletId === '无' || bulletId === '-' || !bulletId)
    ? ''
    : bulletId

  dm.updatePriceConfig(row.id, configId, { bullet: finalBulletId })
  dataStore.refreshPrices()
}

const getBulletOptionsForWeapon = (row) => {
  const weapon = dataStore.getWeaponById(row.id)
  if (!weapon || !weapon.allowedBullet) return []
  const dm = dataStore.getDataManager()
  const bullets = dm.getBulletsByCaliber(weapon.allowedBullet)

  return bullets.map(b => ({
    id: b.id,
    display: dm.getBulletDisplay(b)
  }))
}

// ============================================================
// 复制改枪码
// ============================================================
const copiedRowKey = ref(null)
let copiedTimer = null

const copyBuildCode = async (weaponId, configId, code, event) => {
  if (event) event.stopPropagation()
  if (!code || code.trim() === '') return

  const text = code.trim()
  const key = getConfigKey(weaponId, configId)

  let success = false
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      success = true
    } catch (e) {}
  }
  if (!success) success = fallbackCopy(text)

  if (success) {
    copiedRowKey.value = key
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copiedRowKey.value = null }, 1500)
  }
}

const fallbackCopy = (text) => {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch (e) { return false }
}

// ============================================================
// 配置增删
// ============================================================
const addConfig = async (row) => {
  const dm = dataStore.getDataManager()
  const price = dm.getPriceByWeaponId(row.id)
  if (!price) {
    if (showAlert) await showAlert('⚠️ 未找到价格配置')
    return
  }

  const nextId = dm.getNextConfigId(row.id)
  const defaultBarrelIndex = dm.findBestBarrelIndex(row.id)
  const isNoBarrelDefault = (defaultBarrelIndex < 0)

  const newConfig = {
    id: nextId,
    barrelId: isNoBarrelDefault ? -1 : defaultBarrelIndex,
    barrel: !isNoBarrelDefault && row.barrels[defaultBarrelIndex]
      ? row.barrels[defaultBarrelIndex].name
      : '无',
    muzzleId: 0,
    muzzle: '无',
    precision: isNoBarrelDefault ? 0 : 0.09,
    aimSpeed: 0,
    buildCode: '',
    price: 0,
    distance: [30, 50, 100],
    hitRate: [1.0, 0.9, 0.6],
    bullet: '',
    enabled: true
  }

  const ok = dm.addPriceConfig(row.id, newConfig)
  if (ok) {
    dataStore.refreshPrices()
    activeConfigMap[row.id] = nextId
    console.log(`✅ 已为 ${row.name} 添加配置 ${nextId}`)
  } else {
    if (showAlert) await showAlert('添加失败，请检查控制台')
  }
}

const deleteConfig = async (index, configId) => {
  const row = displayedRows.value[index]
  if (!row) return

  let confirmed = true
  if (showConfirm) {
    const result = await showConfirm({
      title: '删除配置',
      message: `确定删除配置 ${configId}？（${row.name}）`,
      confirmText: '删除',
      confirmType: 'danger'
    })
    confirmed = result.confirmed
  } else {
    confirmed = confirm(`确定删除配置 ${configId}？（${row.name}）`)
  }

  if (!confirmed) return

  const dm = dataStore.getDataManager()
  const ok = dm.removePriceConfig(row.id, configId)
  if (ok) {
    dataStore.refreshPrices()
    if (activeConfigMap[row.id] === configId) {
      delete activeConfigMap[row.id]
    }
  }
}

// ============================================================
// 武器级操作
// ============================================================
const editBarrel = (index) => {
  const row = displayedRows.value[index]
  if (!row) return
  emit('edit-barrel', row.id)
}

const editBase = (index) => {
  const row = displayedRows.value[index]
  if (!row) return
  appStore.openBaseEditor(row.id)
}

const deleteWeapon = async (index) => {
  const row = displayedRows.value[index]
  if (!row) return

  let confirmed = true
  if (showConfirm) {
    const result = await showConfirm({
      title: '删除武器',
      message: `确定删除武器「${row.name}」？此操作不可恢复。`,
      confirmText: '删除',
      confirmType: 'danger'
    })
    confirmed = result.confirmed
  } else {
    confirmed = confirm(`确定删除武器「${row.name}」？此操作不可恢复。`)
  }

  if (!confirmed) return

  const dm = dataStore.getDataManager()
  const weaponList = dm.data.weapons
  const idx = weaponList.findIndex(w => w.id === row.id)
  if (idx !== -1) {
    weaponList.splice(idx, 1)
    const priceIdx = dm.data.prices.findIndex(p => p.weaponId === row.id)
    if (priceIdx !== -1) dm.data.prices.splice(priceIdx, 1)
    dataStore.refreshWeapons()
    dataStore.refreshPrices()
  }
}

const showDetail = (index, configId) => {
  const row = displayedRows.value[index]
  if (!row) return
  emit('show-damage-detail', { weaponId: row.id, configId })
}

// ============================================================
// 新增武器
// ============================================================
const addWeapon = () => {
  emit('add-weapon', -1, null)
}

const confirmAdd = async (index) => {
  const row = displayedRows.value[index]
  if (!row) return
  if (!row.name || row.name.trim() === '') {
    if (showAlert) await showAlert('⚠️ 请输入武器名称')
    return
  }
  if (!row.allowedBullet || row.allowedBullet.trim() === '') {
    if (showAlert) await showAlert('⚠️ 请选择口径')
    return
  }
  emit('add-weapon', index, row)
}

const cancelAdd = (index) => {
  emit('delete-weapon', index, null, true)
}
</script>

<style scoped>
/* ============================================================
   工具栏
   ============================================================ */
.weapon-table-wrapper {
  width: 100%;
}

.table-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #f8f9fa;
  border-radius: var(--radius-md);
  margin-bottom: 6px;
  flex-wrap: wrap;
  border: 1px solid var(--color-border-light);
  row-gap: 6px;
}

.controls-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}

.controls-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-left: auto;
  min-width: 0;
}

.control-hint {
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.count-badge {
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  color: #666;
  background: var(--color-secondary);
  padding: 0 8px;
  border-radius: 10px;
  font-weight: var(--font-weight-medium);
  display: inline-flex;
  align-items: center;
  height: 20px;
  white-space: nowrap;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: #dde3ee;
  margin: 0 2px;
  flex-shrink: 0;
}

.btn-sm.btn-success {
  background: #4caf50;
  color: #fff;
  border: 1px solid #4caf50;
}
.btn-sm.btn-success:hover {
  background: #388e3c;
  border-color: #388e3c;
}
.btn-sm.btn-danger {
  background: #f44336;
  color: #fff;
  border: 1px solid #f44336;
}
.btn-sm.btn-danger:hover {
  background: #d32f2f;
  border-color: #d32f2f;
}

/* ⭐ v7.3：清除导入标记按钮 */
.btn-sm.btn-clear-import {
  background: #fff8e1;
  color: #e65100;
  border: 1px solid #ffcc80;
}
.btn-sm.btn-clear-import:hover {
  background: #ffe0b2;
  border-color: #ff9800;
  color: #bf360c;
}

/* 搜索框 */
.search-box {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 26px;
  min-width: 160px;
  max-width: 220px;
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.search-box:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(74,108,247,0.12);
}

.search-icon {
  padding: 0 4px 0 8px;
  font-size: 12px;
  color: #999;
  flex-shrink: 0;
  line-height: 1;
}

.search-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  outline: none;
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  color: var(--color-text);
  height: 100%;
  padding: 0;
}

.search-input::placeholder {
  color: #bbb;
}

.search-clear-btn {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin-right: 3px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #999;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.search-clear-btn:hover {
  background: #f0f0f0;
  color: #666;
}

.filter-item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

.filter-label {
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  color: #666;
  flex-shrink: 0;
}

.filter-select {
  height: 26px;
  padding: 2px 6px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  background: #fff;
  color: #333;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s;
}

.filter-select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(74,108,247,0.12);
}

.clear-filter-btn {
  height: 26px;
  padding: 0 10px;
  border: 1px solid #ffcdd2;
  border-radius: 4px;
  background: #ffebee;
  color: #c62828;
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.clear-filter-btn:hover {
  background: #ffcdd2;
  border-color: #ef9a9a;
}
.clear-filter-btn:active {
  transform: scale(0.97);
}

.display-count {
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  color: #666;
  white-space: nowrap;
  flex-shrink: 0;
}

.display-count.is-filtered {
  color: var(--color-primary);
  font-weight: 600;
}

.empty-result {
  text-align: center;
  padding: 60px 20px;
  background: #fff;
  border-radius: 8px;
  border: 1px dashed #ddd;
  margin-top: 10px;
}

.empty-result .icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-result > div {
  font-family: var(--font-family);
  font-size: 14px;
  color: #666;
  margin-bottom: 6px;
}

.empty-result .hint {
  font-size: 12px;
  color: #bbb;
  margin-bottom: 16px;
}

.empty-reset-btn {
  margin-top: 8px;
  height: 28px;
  padding: 0 16px;
}

/* ---------- 卡片列表 ---------- */
.weapon-card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.weapon-card {
  background: #fff;
  border: 1px solid var(--color-border-light);
  border-radius: 8px;
  overflow: hidden;
  transition: box-shadow 0.15s;
}
.weapon-card:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
.weapon-card.new-row {
  background: #fff8e1;
  border-color: var(--color-warning);
  border-width: 2px;
}

.weapon-card.is-imported {
  border-left: 4px solid #ff9800;
  background: #fffef8;
}

/* ---------- 武器头 Grid ---------- */
.weapon-head {
  display: grid;
  grid-template-columns:
    26px 110px 56px 90px 180px 150px 130px
    60px 60px 60px 60px 130px 210px 150px 150px;
  align-items: center;
  column-gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(to bottom, #fbfcff, #f0f4ff);
  border-bottom: 1px solid var(--color-border-light);
}

.weapon-card.is-imported .weapon-head {
  background: linear-gradient(to bottom, #fffef8, #fff8e1);
}

.collapse-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: #eef2ff;
  color: var(--color-primary);
  font-size: 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
  justify-self: center;
}
.collapse-btn:hover {
  background: #dde6ff;
}

.wh-name {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}
.weapon-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  max-width: 100%;
}

.imported-badge {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 1;
  cursor: help;
}

.wh-type {
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
}
.weapon-type {
  font-size: 10px;
  background: #eef2f7;
  color: #666;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.wh-caliber {
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
}
.weapon-caliber {
  font-size: 10px;
  background: #eef0f5;
  color: #888;
  padding: 1px 6px;
  border-radius: 8px;
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.wh-attach {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  width: 100%;
}
.wh-attach .k {
  color: #888;
  font-size: 10px;
  flex-shrink: 0;
}
.head-select {
  flex: 1;
  min-width: 0;
  padding: 2px 6px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-family: var(--font-family);
  font-size: 11px;
  background: #fff;
  color: #333;
  cursor: pointer;
  outline: none;
  height: 22px;
  text-overflow: ellipsis;
}
.head-select:focus { border-color: var(--color-primary); }

.wh-precision {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.wh-precision .k {
  color: #888;
  font-size: 11px;
  flex-shrink: 0;
}
.wh-precision input[type="range"] {
  flex: 1;
  min-width: 0;
  accent-color: var(--color-primary);
  cursor: pointer;
  height: 16px;
}
.wh-precision .val {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--color-primary);
  flex-shrink: 0;
  min-width: 30px;
  text-align: right;
}

.wh-precision.is-disabled {
  opacity: 0.45;
}
.wh-precision.is-disabled .k {
  color: #bbb;
}
.wh-precision.is-disabled input[type="range"] {
  cursor: not-allowed;
  accent-color: #ccc;
}
.wh-precision.is-disabled .val {
  color: #bbb;
}

.wh-attr {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  min-width: 0;
  cursor: help;
}
.wh-attr .k {
  color: #888;
  font-size: 10px;
  flex-shrink: 0;
}
.wh-attr .v {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
}
.wh-attr .v.flesh { color: #e74c3c; }
.wh-attr .v.armor { color: #2980b9; }
.wh-attr .v.muted {
  color: #aaa;
  font-weight: 400;
  font-size: 11px;
}
.wh-attr-wide {
  gap: 4px;
}
.wh-attr-tags {
  overflow: visible;
  cursor: default;
}

.mult-tags, .dmg-tags {
  display: inline-flex;
  gap: 2px;
}
.mult-tag, .dmg-tag {
  display: inline-block;
  padding: 0 5px;
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
}
.mult-tag.head, .dmg-tag.head { background: #fdecea; color: #f44336; }
.mult-tag.chest, .dmg-tag.chest { background: #eef2ff; color: #4a6cf7; }
.mult-tag.stomach, .dmg-tag.stomach { background: #fff3e0; color: #ff9800; }
.mult-tag.limbs, .dmg-tag.limbs { background: #f5f5f5; color: #9e9e9e; }

.weapon-head.new-head {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.new-hint {
  font-size: 11px;
  color: var(--color-warning);
  font-weight: 600;
}

/* ---------- 秒伤 + 操作 行 ---------- */
.weapon-dps-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: #fafbfd;
  border-bottom: 1px solid var(--color-border-light);
  overflow-x: auto;
}
.weapon-dps-row::-webkit-scrollbar { height: 4px; }
.weapon-dps-row::-webkit-scrollbar-thumb { background: #ddd; border-radius: 2px; }

.weapon-card.is-imported .weapon-dps-row {
  background: #fffdf5;
}

.dps-label {
  font-size: 11px;
  color: #888;
  font-weight: 600;
  flex-shrink: 0;
  padding-right: 8px;
  border-right: 1px dashed #e8ecf2;
}
.dps-inline {
  display: flex;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.dps-seg {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  background: #fff;
  border: 1px solid #eef0f3;
  border-radius: 4px;
  flex-shrink: 0;
}
.seg-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.15;
  padding-right: 6px;
  border-right: 1px dashed #e8ecf2;
  min-width: 50px;
}
.seg-dist { font-size: 10px; color: #666; font-weight: 600; white-space: nowrap; }
.seg-decay { font-size: 9px; color: #999; }
.seg-values { display: flex; gap: 6px; align-items: center; }
.dps-val {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.15;
  min-width: 30px;
}
.dps-val .p { font-size: 9px; line-height: 1; font-weight: 600; }
.dps-val .n { font-family: var(--font-mono); font-size: 12px; font-weight: 700; line-height: 1.3; }
.dps-val.head .p, .dps-val.head .n { color: #f44336; }
.dps-val.chest .p, .dps-val.chest .n { color: #4a6cf7; }
.dps-val.stomach .p, .dps-val.stomach .n { color: #ff9800; }
.dps-val.limbs .p, .dps-val.limbs .n { color: #9e9e9e; }
.dps-val.armor .p, .dps-val.armor .n { color: #2980b9; }
.dps-val.armor { padding-left: 6px; border-left: 1px dashed #e8ecf2; }

.head-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  margin-left: auto;
  padding-left: 10px;
  border-left: 1px dashed #e0e6ee;
}
.head-btn {
  height: 24px;
  padding: 0 10px;
  border: none;
  border-radius: 4px;
  font-family: var(--font-family);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  transition: all 0.15s;
  user-select: none;
}
.head-btn.base { background: var(--color-primary); color: #fff; }
.head-btn.base:hover { background: var(--color-primary-hover); }
.head-btn.barrel { background: #ff9800; color: #fff; }
.head-btn.barrel:hover { background: #e68900; }
.head-btn.del { background: #f0f0f0; color: #666; }
.head-btn.del:hover { background: #e0e0e0; color: #f44336; }

.head-btn.add { background: #4caf50; color: #fff; }
.head-btn.add:hover { background: #388e3c; }

.head-btn.update {
  background: #e8f5e9;
  color: #2e7d32;
  border: 1px solid #a5d6a7;
  position: relative;
}
.head-btn.update:hover:not(:disabled) {
  background: #d4ead6;
  border-color: #81c784;
}
.head-btn.update.dirty {
  background: #fff3e0;
  color: #e65100;
  border-color: #ffcc80;
  box-shadow: 0 0 0 2px rgba(255, 152, 0, 0.15);
}
.head-btn.update.dirty:hover:not(:disabled) {
  background: #ffe0b2;
  border-color: #ffb74d;
}
.head-btn.update.updating {
  background: #f5f5f5;
  color: #999;
  border-color: #e0e0e0;
  cursor: not-allowed;
  opacity: 0.85;
}
.head-btn.update:disabled {
  cursor: not-allowed;
}
.head-btn.update .dirty-dot {
  color: #f44336;
  font-size: 14px;
  line-height: 1;
  margin-left: 3px;
  animation: dirty-pulse 1.5s ease-in-out infinite;
}
@keyframes dirty-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ---------- 配置区 ---------- */
.config-section {
  padding: 6px 12px 8px;
  background: #fafbfd;
  overflow-x: auto;
}

.weapon-card.is-imported .config-section {
  background: #fffdf5;
}

.config-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* ---------- 配置行 grid ---------- */
.config-item {
  display: grid;
  grid-template-columns:
    28px     /* 启用 */
    50px     /* configId */
    350px    /* 改枪码 */
    190px    /* 枪管 */
    160px    /* 枪口 */
    250px    /* 命中率 */
    80px     /* 开镜 */
    110px    /* 价格 */
    140px    /* 子弹 */
    90px     /* 哈弗币 */
    130px    /* 评分 */
    minmax(110px, 1fr);   /* 操作 */
  align-items: center;
  column-gap: 8px;

  padding: 5px 10px;
  background: #fff;
  border: 1px solid #eef0f3;
  border-radius: 6px;
  transition: all 0.15s;
  cursor: pointer;
  min-width: 1550px;
}

.config-item.enabled { border-left: 3px solid var(--color-success); }
.config-item.disabled { opacity: 0.55; border-left: 3px solid #ddd; }

.config-item.active {
  border-color: var(--color-primary);
  border-left: 4px solid var(--color-primary);
  background: #e8eeff;
  box-shadow: 0 1px 6px rgba(74,108,247,0.2);
}
.config-item.active.enabled {
  border-left: 4px solid var(--color-primary);
}

.config-item > * {
  min-width: 0;
  overflow: hidden;
}

/* ⭐ v7.3：增量导入新增配置的样式 */
.config-item.is-imported {
  border-color: #ffc107;
  border-left: 4px solid #ff9800;
  background: #fffbea;
  position: relative;
}

.config-item.is-imported.active {
  background: #fff3c4;
  border-color: #ff9800;
  border-left: 4px solid #ff9800;
  box-shadow: 0 1px 6px rgba(255, 152, 0, 0.25);
}

.config-enabled {
  width: 16px; height: 16px;
  cursor: pointer;
  accent-color: var(--color-primary);
  justify-self: start;
}

/* ⭐ v7.5：可编辑的 configId */
.config-id-input {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  color: var(--color-primary);
  background: #eef2ff;
  padding: 1px 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  text-align: center;
  width: 50px;
  height: 22px;
  outline: none;
  transition: all 0.15s;
  justify-self: start;
  box-sizing: border-box;
}

.config-id-input:hover:not(:focus) {
  background: #dde6ff;
  border-color: #c5d0ff;
}

.config-id-input:focus {
  background: #fff;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(74,108,247,0.15);
}

.config-item.active .config-id-input {
  background: var(--color-primary);
  color: #fff;
}

.config-item.active .config-id-input:focus {
  background: #fff;
  color: var(--color-primary);
}

/* 导入标记 */
.config-id-input.is-imported-id {
  background: #fff8e1;
  color: #e65100;
  border: 1px dashed #ff9800;
}

.config-item.active .config-id-input.is-imported-id {
  background: #ff9800;
  color: #fff;
  border: 1px dashed #e65100;
}

/* 兼容旧的 .config-id（如果别处还在用） */
.config-id {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  color: var(--color-primary);
  background: #eef2ff;
  padding: 1px 8px;
  border-radius: 4px;
  justify-self: start;
  text-align: center;
}
.config-item.active .config-id {
  background: var(--color-primary);
  color: #fff;
}

.config-item .buildcode-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-width: 0;
}
.buildcode-input {
  flex: 1;
  min-width: 0;
  padding: 3px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  background: #fafbfd;
  color: #333;
  outline: none;
  height: 24px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: all 0.15s;
}
.buildcode-input:hover { background: #fff; border-color: #e0e0e0; }
.buildcode-input:focus {
  background: #fff;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(74,108,247,0.12);
}
.btn-copy-code {
  flex-shrink: 0;
  width: 24px; height: 24px;
  border: none;
  border-radius: 4px;
  background: #f0f4ff;
  color: var(--color-primary);
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.btn-copy-code:hover { background: #dde6ff; }
.btn-copy-code:active { transform: scale(0.94); }
.btn-copy-code:disabled { opacity: 0.35; cursor: not-allowed; }
.btn-copy-code.copied { background: #e8f5e9; color: var(--color-success); }

.config-item .fld {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-width: 0;
}
.fld .k {
  color: #999;
  font-size: 11px;
  flex-shrink: 0;
}
.fld .v {
  font-family: var(--font-mono);
  font-weight: 600;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fld .v.price { color: #e67e22; }
.fld .v.havoc-green { color: #4caf50; }
.fld .v.havoc-orange { color: #ff9800; }
.fld .v.havoc-red { color: #f44336; }
.fld .v.havoc-empty { color: #ccc; font-weight: 400; }

.fld .v.havoc-cost {
  cursor: help;
  padding: 0 4px;
  border-radius: 2px;
  border-bottom: 1px dashed #ccc;
  transition: all 0.15s;
}
.fld .v.havoc-cost:hover {
  background: #fff3e0;
  border-bottom-color: #ff9800;
}

.fld .v.overall-value {
  font-family: var(--font-mono);
  font-weight: 700;
  padding: 0 4px;
  border-radius: 2px;
  border-bottom: 1px dashed #ccc;
  transition: all 0.15s;
}
.fld .v.overall-value:hover {
  background: #eef2ff;
  border-bottom-color: var(--color-primary);
}

.overall-A { color: #4caf50; }
.overall-B { color: #4a6cf7; }
.overall-C { color: #ff9800; }
.overall-D { color: #f44336; }
.overall-empty { color: #ccc; font-weight: 400; }

.config-item .hitrate-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-width: 0;
}
.hitrate-input {
  flex: 1;
  min-width: 0;
  padding: 3px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  background: #fafbfd;
  color: #333;
  outline: none;
  height: 24px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: all 0.15s;
}
.hitrate-input:hover { background: #fff; border-color: #e0e0e0; }
.hitrate-input:focus {
  background: #fff;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(74,108,247,0.12);
}

.inline-select {
  flex: 1;
  min-width: 0;
  padding: 2px 6px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-family: var(--font-family);
  font-size: 11px;
  background: #fff;
  color: #333;
  cursor: pointer;
  outline: none;
  height: 24px;
}
.inline-select:focus { border-color: var(--color-primary); }

.inline-input {
  padding: 2px 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  background: #fff;
  color: #333;
  outline: none;
  height: 24px;
}
.inline-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(74,108,247,0.12);
}
.inline-input.price-input {
  width: 60px;
  text-align: right;
  flex-shrink: 0;
}
.inline-input.aim-input {
  width: 60px;
  text-align: right;
  flex-shrink: 0;
}
.price-unit,
.unit-tiny {
  font-size: 10px;
  color: #999;
  flex-shrink: 0;
  font-weight: 600;
}

.config-actions {
  display: flex;
  gap: 4px;
  justify-self: end;
  flex-shrink: 0;
}
.cfg-btn {
  height: 24px;
  padding: 0 10px;
  border: none;
  border-radius: 4px;
  font-family: var(--font-family);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  transition: all 0.15s;
  user-select: none;
}
.cfg-btn.detail { background: var(--color-primary); color: #fff; }
.cfg-btn.detail:hover { background: var(--color-primary-hover); }
.cfg-btn.del { background: #f0f0f0; color: #666; }
.cfg-btn.del:hover { background: #e0e0e0; color: #f44336; }

/* ---------- 新增行 ---------- */
.new-row-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  padding: 8px 12px;
  background: #fff8e1;
}
.new-row-actions {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  background: #fff8e1;
  justify-content: flex-end;
}
.new-row-input, .new-row-select {
  padding: 3px 6px;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  font-family: var(--font-family);
  font-size: 12px;
  background: #fff;
  color: var(--color-text);
  box-sizing: border-box;
  height: 26px;
}
.new-row-input:focus, .new-row-select:focus {
  border-color: var(--color-primary);
  outline: none;
}
.new-row-input.name-input { min-width: 100px; }
.new-row-input.tiny { width: 60px; }
.new-row-input.flex-input { flex: 1; min-width: 0; }
.new-row-select { min-width: 80px; }
.attr-pair {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.attr-pair .k {
  font-size: 11px;
  color: #888;
}

/* ---------- 响应式 ---------- */
@media (max-width: 1600px) {
  .weapon-head {
    grid-template-columns:
      26px 105px 52px 82px 170px 140px 120px 56px 56px 56px 56px 120px 200px 140px 140px;
  }
}
@media (max-width: 1400px) {
  .weapon-head {
    grid-template-columns:
      26px 95px 50px 76px 160px 130px 110px 52px 52px 52px 52px 110px 190px 130px 130px;
    column-gap: 6px;
  }
  .weapon-name { font-size: 13px; }
}
@media (max-width: 1200px) {
  .weapon-head {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    row-gap: 6px;
  }
  .collapse-btn { order: -1; }
  .wh-name { flex: 0 0 auto; min-width: 0; max-width: 130px; }
  .wh-type { flex: 0 0 auto; }
  .wh-caliber { flex: 0 0 auto; }
  .wh-attach {
    flex: 1 1 auto;
    min-width: 140px;
  }
  .wh-precision { flex: 1 1 auto; }
  .wh-attr { flex: 0 0 auto; }
  .wh-attr-wide {
    min-width: 150px;
  }
  .head-select { max-width: 160px; }
  .wh-precision input[type="range"] { width: 70px; }
}

/* ---------- 移动端 ---------- */
.weapon-card-list.mobile .card-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  min-height: 30px;
  border-bottom: 1px solid #f2f4f7;
  flex-wrap: wrap;
}
.weapon-card-list.mobile .row-identity {
  background: linear-gradient(to bottom, #fbfcff, #f5f7fb);
  border-bottom: 1px solid var(--color-border-light);
  padding: 8px 12px;
}
.weapon-card-list.mobile .weapon-name {
  font-size: 15px;
  max-width: 55%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.weapon-card-list.mobile .row-label {
  font-size: 12px;
  color: #888;
  flex-shrink: 0;
  min-width: 34px;
}

.row-value {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.v-pair {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  white-space: nowrap;
  font-size: 13px;
  cursor: help;
}
.v-pair .k { color: #999; font-size: 11px; }
.v-pair .v { font-family: var(--font-mono); font-weight: 600; color: var(--color-text); }
.v-pair .v.flesh { color: #e74c3c; }
.v-pair .v.armor { color: #2980b9; }

.attach-select.full {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-family: var(--font-family);
  font-size: 13px;
  background: #fff;
  color: #333;
  cursor: pointer;
  outline: none;
  height: 32px;
}

.precision-input-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}
.precision-input-wrap input[type="range"] {
  flex: 1;
  min-width: 0;
  accent-color: var(--color-primary);
  cursor: pointer;
  height: 22px;
}
.precision-input-wrap .val {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  color: var(--color-primary);
  min-width: 40px;
  text-align: right;
}

.precision-input-wrap.is-disabled {
  opacity: 0.45;
}
.precision-input-wrap.is-disabled input[type="range"] {
  cursor: not-allowed;
  accent-color: #ccc;
}
.precision-input-wrap.is-disabled .val {
  color: #bbb;
}

.row-dps {
  flex-direction: column;
  align-items: stretch !important;
  padding: 8px 12px 10px !important;
  gap: 6px !important;
  background: #fafbfd;
}
.row-dps .row-label {
  color: #666;
  font-weight: 600;
  margin-bottom: 2px;
}
.dps-seg-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.row-dps .dps-seg {
  padding: 5px 8px;
  gap: 8px;
}
.row-dps .dps-val { flex: 1; }
.row-dps .seg-values { flex: 1; justify-content: space-between; }

.config-section-mobile {
  flex-direction: column;
  align-items: stretch !important;
  padding: 8px 12px 10px !important;
  gap: 6px !important;
  background: #fafbfd;
}
.config-item-mobile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  background: #fff;
  border: 1px solid #eef0f3;
  border-radius: 6px;
  transition: all 0.15s;
  cursor: pointer;
}
.config-item-mobile.enabled { border-left: 3px solid var(--color-success); }
.config-item-mobile.disabled { opacity: 0.55; border-left: 3px solid #ddd; }
.config-item-mobile.active {
  border-color: var(--color-primary);
  border-left: 4px solid var(--color-primary);
  background: #e8eeff;
}
.config-item-mobile.active.enabled {
  border-left: 4px solid var(--color-primary);
}

/* ⭐ v7.3：移动端新增配置样式 */
.config-item-mobile.is-imported {
  border-color: #ffc107;
  border-left: 4px solid #ff9800;
  background: #fffbea;
}
.config-item-mobile.is-imported.active {
  background: #fff3c4;
  border-color: #ff9800;
  border-left: 4px solid #ff9800;
}

/* ⭐ v7.5：移动端 configId 输入框 */
.config-item-mobile .config-id-input {
  width: 50px;
  height: 24px;
  font-size: 12px;
  flex-shrink: 0;
}

.config-item-mobile.active .config-id-input {
  background: var(--color-primary);
  color: #fff;
}

.config-item-mobile.active .config-id-input:focus {
  background: #fff;
  color: var(--color-primary);
}

.config-item-mobile .config-id-input.is-imported-id {
  background: #fff8e1;
  color: #e65100;
  border: 1px dashed #ff9800;
}

.config-item-mobile.active .config-id-input.is-imported-id {
  background: #ff9800;
  color: #fff;
  border: 1px dashed #e65100;
}

.cfg-mobile-head {
  display: flex;
  align-items: center;
  gap: 4px;
}
.cfg-mobile-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.cfg-mobile-row .k {
  font-size: 11px;
  color: #999;
  flex-shrink: 0;
  min-width: 38px;
}
.flex-1 { flex: 1; min-width: 0; }

.row-actions {
  padding: 8px 12px;
  gap: 6px;
  background: #fafbfd;
}
.action-btn {
  flex: 1;
  height: 34px;
  padding: 0 8px;
  border: none;
  border-radius: 5px;
  font-family: var(--font-family);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  white-space: nowrap;
  transition: all 0.15s;
}
.action-btn.edit-barrel { background: #ff9800; color: #fff; }
.action-btn.edit-barrel:active { background: #e68900; }
.action-btn.edit-base { background: #4caf50; color: #fff; }
.action-btn.edit-base:active { background: #388e3c; }
.action-btn.delete { background: #f0f0f0; color: #666; }
.action-btn.delete:active { background: #e0e0e0; color: #f44336; }

.action-btn.update {
  background: #e8f5e9;
  color: #2e7d32;
  border: 1px solid #a5d6a7;
  position: relative;
}
.action-btn.update:active:not(:disabled) {
  background: #d4ead6;
}
.action-btn.update.dirty {
  background: #fff3e0;
  color: #e65100;
  border-color: #ffcc80;
  box-shadow: 0 0 0 2px rgba(255, 152, 0, 0.15);
}
.action-btn.update.dirty:active:not(:disabled) {
  background: #ffe0b2;
}
.action-btn.update.updating {
  background: #f5f5f5;
  color: #999;
  border-color: #e0e0e0;
  cursor: not-allowed;
  opacity: 0.85;
}
.action-btn.update:disabled {
  cursor: not-allowed;
}
.action-btn.update .dirty-dot {
  color: #f44336;
  font-size: 14px;
  line-height: 1;
  margin-left: 3px;
  animation: dirty-pulse 1.5s ease-in-out infinite;
}

/* ---------- 移动端工具栏紧凑 ---------- */
@media (max-width: 768px) {
  .table-controls {
    padding: 5px 8px;
    row-gap: 5px;
  }

  .controls-left,
  .controls-right {
    gap: 4px;
  }

  .controls-right {
    margin-left: 0;
    width: 100%;
  }

  .search-box {
    min-width: 130px;
    flex: 1;
  }

  .control-hint {
    display: none;
  }

  .filter-label {
    display: none;
  }

  .display-count {
    font-size: 11px;
  }
}
</style>