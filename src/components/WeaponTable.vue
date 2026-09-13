<!-- src/components/WeaponTable.vue -->
<template>
  <div class="weapon-table-wrapper">
    <!-- 工具栏 -->
    <div class="table-controls">
      <button class="btn-sm btn-primary" @click="addWeapon">➕ 新增枪械</button>
      <button class="btn-sm btn-outline" @click="expandAll">🔽 全部展开</button>
      <button class="btn-sm btn-outline" @click="collapseAll">🔼 全部收起</button>
      <span class="toolbar-divider"></span>
      <button class="btn-sm btn-success" @click="enableAllConfigs">✅ 全部启用</button>
      <button class="btn-sm btn-danger" @click="disableAllConfigs">❌ 全部禁用</button>
      <span class="control-hint">（新增后在卡片内填写数据，点击"确认"保存）</span>
      <span class="count-badge">共 {{ data.length }} 把武器</span>
    </div>

    <!-- ============================================================ -->
    <!-- ⭐ 桌面端：卡片列表 -->
    <!-- ============================================================ -->
    <div v-if="!isMobile" class="weapon-card-list">
      <div
        v-for="(row, index) in rowsWithCurrent"
        :key="row.id || index"
        class="weapon-card"
        :class="{ 'new-row': row._isNewRow }"
      >
        <!-- ============ 武器头（Grid 固定列） ============ -->
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
          <!-- ⭐ 收起/展开按钮（最左侧） -->
          <button
            class="collapse-btn"
            :title="isCollapsed(row.id) ? '展开' : '收起'"
            @click.stop="toggleCollapse(row.id)"
          >
            {{ isCollapsed(row.id) ? '▶' : '▼' }}
          </button>

          <!-- 身份列 -->
          <div class="wh-identity">
            <span class="weapon-name" :title="row.name">{{ row.name }}</span>
            <span class="weapon-type">{{ row.type }}</span>
            <span class="weapon-caliber">{{ row.allowedBullet || '-' }}</span>
          </div>

          <!-- 附件列：枪管 -->
          <div class="wh-attach">
            <span class="k">枪管</span>
            <select
              class="head-select"
              :value="row.activeConfig?.barrelId ?? -1"
              @change="onActiveConfigFieldChange(index, 'barrelId', parseInt($event.target.value))"
            >
              <option v-for="(b, i) in row.barrels" :key="i" :value="i">{{ b.name }}</option>
              <option :value="-1" v-if="row.barrels.length === 0">无</option>
            </select>
          </div>

          <!-- 附件列：枪口 -->
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

          <!-- 附件列：精校 -->
          <div class="wh-precision">
            <span class="k">精校</span>
            <input
              type="range"
              min="-0.09" max="0.09" step="0.01"
              :value="row.activeConfig?.precision ?? 0.09"
              @input="onPrecisionInput(index, $event)"
              @change="onPrecisionCommit(index, $event)"
            />
            <span class="val">{{ Math.round((row.activeConfig?.precision ?? 0.09) * 100) }}%</span>
          </div>

          <!-- 属性列 -->
          <div class="wh-attr">
            <span class="k">射速</span>
            <span class="v orig">{{ row.rof }}</span>
            <span class="arrow">→</span>
            <span class="v">{{ Math.round(row.rofCurrent) }}</span>
          </div>
          <div class="wh-attr">
            <span class="k">初速</span>
            <span class="v orig">{{ row.velocity }}</span>
            <span class="arrow">→</span>
            <span class="v">{{ row.velocityCurrent }}</span>
          </div>
          <div class="wh-attr">
            <span class="k">肉伤</span>
            <span class="v orig">{{ row.flesh }}</span>
            <span class="arrow">→</span>
            <span class="v flesh">{{ row.fleshCurrent }}</span>
          </div>
          <div class="wh-attr">
            <span class="k">甲伤</span>
            <span class="v orig">{{ row.armor }}</span>
            <span class="arrow">→</span>
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
              <span class="mult-tag head">{{ row.multCurrent.head }}</span>
              <span class="mult-tag chest">{{ row.multCurrent.chest }}</span>
              <span class="mult-tag stomach">{{ row.multCurrent.stomach }}</span>
              <span class="mult-tag limbs">{{ row.multCurrent.limbs }}</span>
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

        <!-- ============ 秒伤 + 操作 行（可收起） ============ -->
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
            <button class="head-btn add" @click="addConfig(row)">➕ 新增配置 ({{ row._enabledCount }}/{{ row._configCount }})</button>
            <button class="head-btn base" @click="editBase(index)">编辑属性</button>
            <button class="head-btn barrel" @click="editBarrel(index)">编辑枪管</button>
            <button class="head-btn del" @click="deleteWeapon(index)">删除</button>
          </div>
        </div>

        <!-- ============ 配置列表（可收起） ============ -->
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
                active: cfg.configId === row.activeConfigId
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

              <span class="config-id">{{ cfg.configId }}</span>

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
                  <option :value="-1" v-if="row.barrels.length === 0">无</option>
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
                  :value="cfg.bulletDisplay"
                  @click.stop
                  @change="onBulletChange(index, cfg.configId, $event.target.value)"
                >
                  <option value="无">无</option>
                  <option
                    v-for="opt in getBulletOptionsForWeapon(row)"
                    :key="opt"
                    :value="opt"
                  >{{ opt }}</option>
                </select>
              </span>

              <span class="fld">
                <span class="k">哈弗币</span>
                <span class="v" :class="havocColor(cfg.havocCost)">
                  {{ cfg.havocCost != null ? fmtPrice(cfg.havocCost) : '-' }}
                </span>
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
    <!-- ⭐ 移动端：卡片列表 -->
    <!-- ============================================================ -->
    <div v-else class="weapon-card-list mobile">
      <div
        v-for="(row, index) in rowsWithCurrent"
        :key="row.id || index"
        class="weapon-card"
        :class="{ 'new-row': row._isNewRow }"
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
          <!-- ⭐ 可收起部分 -->
          <template v-if="!isCollapsed(row.id)">
            <div class="card-row">
              <span class="row-label">枪管</span>
              <select
                class="attach-select full"
                :value="row.activeConfig?.barrelId ?? -1"
                @change="onActiveConfigFieldChange(index, 'barrelId', parseInt($event.target.value))"
              >
                <option v-for="(b, i) in row.barrels" :key="i" :value="i">{{ b.name }}</option>
                <option :value="-1" v-if="row.barrels.length === 0">无</option>
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
              <div class="precision-input-wrap">
                <input
                  type="range"
                  min="-0.09" max="0.09" step="0.01"
                  :value="row.activeConfig?.precision ?? 0.09"
                  @input="onPrecisionInput(index, $event)"
                  @change="onPrecisionCommit(index, $event)"
                />
                <span class="val">{{ Math.round((row.activeConfig?.precision ?? 0.09) * 100) }}%</span>
              </div>
            </div>

            <div class="card-row">
              <span class="row-label">射速</span>
              <div class="row-value">
                <span class="v-pair">
                  <span class="v orig">{{ row.rof }}</span>
                  <span class="arrow">→</span>
                  <span class="v">{{ Math.round(row.rofCurrent) }}</span>
                </span>
                <span class="v-pair">
                  <span class="k">初速</span>
                  <span class="v orig">{{ row.velocity }}</span>
                  <span class="arrow">→</span>
                  <span class="v">{{ row.velocityCurrent }}</span>
                </span>
              </div>
            </div>

            <div class="card-row">
              <span class="row-label">伤/程</span>
              <div class="row-value">
                <span class="v-pair">
                  <span class="k">肉</span>
                  <span class="v flesh">{{ row.fleshCurrent }}</span>
                </span>
                <span class="v-pair">
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
                  <span class="mult-tag head">{{ row.multCurrent.head }}</span>
                  <span class="mult-tag chest">{{ row.multCurrent.chest }}</span>
                  <span class="mult-tag stomach">{{ row.multCurrent.stomach }}</span>
                  <span class="mult-tag limbs">{{ row.multCurrent.limbs }}</span>
                </span>
                <span class="dmg-tags">
                  <span class="dmg-tag head">{{ row.partDamageArr[0] }}</span>
                  <span class="dmg-tag chest">{{ row.partDamageArr[1] }}</span>
                  <span class="dmg-tag stomach">{{ row.partDamageArr[2] }}</span>
                  <span class="dmg-tag limbs">{{ row.partDamageArr[3] }}</span>
                </span>
              </div>
            </div>

            <!-- 秒伤 -->
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
                    active: cfg.configId === row.activeConfigId
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
                    <span class="config-id">{{ cfg.configId }}</span>
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
                      <option :value="-1" v-if="row.barrels.length === 0">无</option>
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
                      :value="cfg.bulletDisplay"
                      @click.stop
                      @change="onBulletChange(index, cfg.configId, $event.target.value)"
                    >
                      <option value="无">无</option>
                      <option v-for="opt in getBulletOptionsForWeapon(row)" :key="opt" :value="opt">{{ opt }}</option>
                    </select>
                  </div>
                  <div class="cfg-mobile-row">
                    <span class="k">哈弗币</span>
                    <span class="v" :class="havocColor(cfg.havocCost)">
                      {{ cfg.havocCost != null ? fmtPrice(cfg.havocCost) : '-' }}
                    </span>
                    <div class="config-actions">
                      <button class="cfg-btn detail" @click.stop="showDetail(index, cfg.configId)">模拟</button>
                      <button class="cfg-btn del" @click.stop="deleteConfig(index, cfg.configId)">删除</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- 操作行（不收起） -->
          <div class="card-row row-actions">
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
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { dataStore } from '@/stores/dataStore'
import { appStore } from '@/stores/appStore'
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

const emit = defineEmits(['update', 'edit-barrel', 'add-weapon', 'delete-weapon', 'show-damage-detail'])

const typeOptions = ['步枪', '冲锋枪', '轻机枪', '精确射手步枪', '手枪']

// ⭐ 是否为移动端
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
// ⭐ 收起/展开状态（每个武器独立）
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
  Object.keys(collapsedMap).forEach(k => delete collapsedMap[k])
}

const collapseAll = () => {
  props.data.forEach(w => {
    if (!w._isNewRow) {
      collapsedMap[w.id] = true
    }
  })
}

// ============================================================
// ⭐ 全部启用 / 全部禁用配置
// ============================================================
const enableAllConfigs = () => {
  const dm = dataStore.getDataManager()
  const prices = dm.getPrices()
  let count = 0

  for (const price of prices) {
    for (const config of price.configs) {
      if (config.enabled === false) {
        dm.updatePriceConfig(price.weaponId, config.id, { enabled: true })
        count++
      }
    }
  }

  if (count > 0) {
    dataStore.refreshPrices()
    console.log(`✅ 已启用 ${count} 个配置`)
  } else {
    console.log('ℹ️ 所有配置已启用')
  }
}

const disableAllConfigs = () => {
  const dm = dataStore.getDataManager()
  const prices = dm.getPrices()
  let count = 0

  for (const price of prices) {
    for (const config of price.configs) {
      if (config.enabled !== false) {
        dm.updatePriceConfig(price.weaponId, config.id, { enabled: false })
        count++
      }
    }
  }

  if (count > 0) {
    dataStore.refreshPrices()
    console.log(`❌ 已禁用 ${count} 个配置`)
  } else {
    console.log('ℹ️ 所有配置已禁用')
  }
}

// ============================================================
// ⭐ 当前选中的配置（每个武器独立）
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
// ⭐ 秒伤计算
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

const havocColor = (v) => {
  if (v == null) return 'havoc-empty'
  const w = v / 10000
  if (w > 100) return 'havoc-red'
  if (w > 50) return 'havoc-orange'
  return 'havoc-green'
}

// ============================================================
// ⭐ 核心：rowsWithCurrent
// 
// ⭐ 关键修复：显式引用 state.weapons / state.prices，
//    建立响应式依赖，保证 prices 变化时 rowsWithCurrent 重算
// ============================================================
const rowsWithCurrent = computed(() => {
  // ⭐ 显式建立对 state.weapons / state.prices 的响应式依赖
  const weapons = dataStore.state.weapons
  const prices = dataStore.state.prices
  void prices

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

    const havocCosts = appStore.state.havocCosts || {}
    const configsWithHavoc = configRows.map(cfg => {
      const key = `${weapon.id}_${cfg.configId}`
      return {
        ...cfg,
        havocCost: havocCosts[key]?.totalCost ?? null
      }
    })

    const enabledCount = configsWithHavoc.filter(c => c.enabled !== false).length

    return {
      ...weapon,
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
// ⭐ 精校
// ============================================================
const precisionLocalMap = ref({})

const onPrecisionInput = (index, event) => {
  const row = rowsWithCurrent.value[index]
  if (!row) return
  const val = parseFloat(event.target.value)
  const el = event.target.nextElementSibling
  if (el) el.textContent = Math.round(val * 100) + '%'
  precisionLocalMap.value[row.id] = val
}

const onPrecisionCommit = (index, event) => {
  const row = rowsWithCurrent.value[index]
  if (!row || !row.activeConfig) return
  const val = parseFloat(event.target.value)
  updateConfigField(index, row.activeConfigId, 'precision', val)
  delete precisionLocalMap.value[row.id]
}

// ============================================================
// ⭐ 配置操作
// ============================================================
const getConfigKey = (weaponId, configId) => `${weaponId}_${configId}`

const selectConfig = (index, configId) => {
  const row = rowsWithCurrent.value[index]
  if (!row) return
  activeConfigMap[row.id] = configId
}

const toggleConfig = (index, configId, enabled) => {
  const row = rowsWithCurrent.value[index]
  if (!row) return
  const dm = dataStore.getDataManager()
  dm.updatePriceConfig(row.id, configId, { enabled })
  dataStore.refreshPrices()
}

const onActiveConfigFieldChange = (index, field, value) => {
  const row = rowsWithCurrent.value[index]
  if (!row || !row.activeConfigId) return
  updateConfigField(index, row.activeConfigId, field, value)
}

const updateConfigField = (index, configId, field, value) => {
  const row = rowsWithCurrent.value[index]
  if (!row) return
  const dm = dataStore.getDataManager()
  dm.updatePriceConfig(row.id, configId, { [field]: value })
  dataStore.refreshPrices()
  emit('update', { index, type: field, value, weaponId: row.id })
}

const onHitRateChange = (index, configId, str) => {
  const row = rowsWithCurrent.value[index]
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

const onBulletChange = (index, configId, display) => {
  const row = rowsWithCurrent.value[index]
  if (!row) return
  const dm = dataStore.getDataManager()
  if (display === '无' || display === '-' || !display) {
    dm.updatePriceConfig(row.id, configId, { bullet: '' })
  } else {
    const bulletId = dm.findBulletIdByDisplay(display)
    if (!bulletId) return
    dm.updatePriceConfig(row.id, configId, { bullet: bulletId })
  }
  dataStore.refreshPrices()
}

const getBulletOptionsForWeapon = (row) => {
  const weapon = dataStore.getWeaponById(row.id)
  if (!weapon || !weapon.allowedBullet) return []
  const bullets = dataStore.getDataManager().getBulletsByCaliber(weapon.allowedBullet)
  return bullets.map(b => `${b.caliber} Lv.${b.level}`)
}

// ============================================================
// ⭐ 复制改枪码
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
// ⭐ 配置增删
// ============================================================
const addConfig = (row) => {
  const dm = dataStore.getDataManager()
  const price = dm.getPriceByWeaponId(row.id)
  if (!price) {
    alert('⚠️ 未找到价格配置')
    return
  }

  const nextId = dm.getNextConfigId(row.id)
  const defaultBarrelIndex = dm.findBestBarrelIndex(row.id)

  const newConfig = {
    id: nextId,
    barrelId: defaultBarrelIndex >= 0 ? defaultBarrelIndex : -1,
    barrel: defaultBarrelIndex >= 0 && row.barrels[defaultBarrelIndex]
      ? row.barrels[defaultBarrelIndex].name
      : '无',
    muzzleId: 0,
    muzzle: '无',
    precision: 0.09,
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
    alert('添加失败，请检查控制台')
  }
}

const deleteConfig = (index, configId) => {
  const row = rowsWithCurrent.value[index]
  if (!row) return
  if (!confirm(`确定删除配置 ${configId}？（${row.name}）`)) return

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
// ⭐ 武器级操作
// ============================================================
const editBarrel = (index) => {
  const row = rowsWithCurrent.value[index]
  if (!row) return
  emit('edit-barrel', row.id)
}

// ⭐ 编辑基础属性：打开弹窗
const editBase = (index) => {
  const row = rowsWithCurrent.value[index]
  if (!row) return
  appStore.openBaseEditor(row.id)
}

const deleteWeapon = (index) => {
  const row = rowsWithCurrent.value[index]
  if (!row) return
  if (!confirm(`确定删除武器「${row.name}」？此操作不可恢复。`)) return
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
  const row = rowsWithCurrent.value[index]
  if (!row) return
  emit('show-damage-detail', { weaponId: row.id, configId })
}

// ============================================================
// ⭐ 新增武器
// ============================================================
const addWeapon = () => {
  emit('add-weapon', -1, null)
}

const confirmAdd = (index) => {
  const row = rowsWithCurrent.value[index]
  if (!row) return
  if (!row.name || row.name.trim() === '') {
    alert('⚠️ 请输入武器名称')
    return
  }
  if (!row.allowedBullet || row.allowedBullet.trim() === '') {
    alert('⚠️ 请选择口径')
    return
  }
  emit('add-weapon', index, row)
}

const cancelAdd = (index) => {
  emit('delete-weapon', index, null, true)
}
</script>

<style scoped>
.weapon-table-wrapper {
  width: 100%;
}

/* ============ 工具栏 ============ */
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
  margin-left: auto;
  background: var(--color-secondary);
  padding: 0 8px;
  border-radius: 10px;
  font-weight: var(--font-weight-medium);
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

/* ============ 卡片列表 ============ */
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

.weapon-head {
  display: grid;
  grid-template-columns:
    26px
    200px
    140px
    110px
    130px
    140px
    130px
    110px
    110px
    180px
    200px
    180px
    180px;
  align-items: center;
  column-gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(to bottom, #fbfcff, #f0f4ff);
  border-bottom: 1px solid var(--color-border-light);
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

.wh-identity {
  display: flex;
  align-items: center;
  gap: 6px;
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
  flex-shrink: 1;
  min-width: 0;
  max-width: 100px;
}
.weapon-type {
  font-size: 10px;
  background: #eef2f7;
  color: #666;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 600;
  flex-shrink: 0;
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
  flex-shrink: 1;
  min-width: 0;
}

.wh-attach {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.wh-attach .k {
  color: #888;
  font-size: 11px;
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

.wh-attr {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  min-width: 0;
}
.wh-attr .k {
  color: #888;
  font-size: 11px;
  flex-shrink: 0;
}
.wh-attr .v {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
}
.wh-attr .v.orig {
  color: #aaa;
  font-weight: 400;
  font-size: 11px;
}
.wh-attr .v.flesh { color: #e74c3c; }
.wh-attr .v.armor { color: #2980b9; }
.wh-attr .v.muted {
  color: #aaa;
  font-weight: 400;
  font-size: 11px;
}
.wh-attr .arrow {
  color: #ddd;
  font-size: 11px;
  flex-shrink: 0;
}
.wh-attr-wide {
  gap: 4px;
}
.wh-attr-tags {
  overflow: visible;
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

/* ============ 秒伤 + 操作 行 ============ */
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

/* ============================================================
   ⭐ 配置区（Grid 固定列对齐）
   ============================================================ */
.config-section {
  padding: 6px 12px 8px;
  background: #fafbfd;
  overflow-x: auto;
}
.config-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.config-item {
  display: grid;
  grid-template-columns:
    28px
    50px
    400px
    140px
    110px
    300px
    90px
    140px
    90px
    minmax(110px, 1fr);
  align-items: center;
  column-gap: 8px;

  padding: 5px 10px;
  background: #fff;
  border: 1px solid #eef0f3;
  border-radius: 6px;
  transition: all 0.15s;
  cursor: pointer;
  min-width: 1400px;
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

.config-enabled {
  width: 16px; height: 16px;
  cursor: pointer;
  accent-color: var(--color-primary);
  justify-self: start;
}

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
.price-unit { font-size: 10px; color: #999; flex-shrink: 0; }

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

/* ============ 新增行 ============ */
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

/* ============================================================
   响应式
   ============================================================ */
@media (max-width: 1600px) {
  .weapon-head {
    grid-template-columns:
      26px 180px 130px 100px 120px 130px 120px 100px 100px 160px 180px 160px 160px;
  }
}
@media (max-width: 1400px) {
  .weapon-head {
    grid-template-columns:
      26px 160px 120px 90px 110px 120px 110px 90px 90px 140px 160px 140px 140px;
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
  .wh-identity { flex: 0 0 auto; min-width: 0; }
  .wh-attach { flex: 1 1 auto; }
  .wh-precision { flex: 1 1 auto; }
  .wh-attr { flex: 0 0 auto; }
  .head-select { max-width: 130px; }
  .wh-precision input[type="range"] { width: 70px; }
}

/* ============ 移动端 ============ */
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
}
.v-pair .k { color: #999; font-size: 11px; }
.v-pair .v { font-family: var(--font-mono); font-weight: 600; color: var(--color-text); }
.v-pair .v.orig { color: #aaa; font-weight: 400; font-size: 12px; }
.v-pair .v.flesh { color: #e74c3c; }
.v-pair .v.armor { color: #2980b9; }
.v-pair .v.muted { color: #aaa; font-weight: 400; font-size: 12px; }
.v-pair .arrow { color: #ccc; font-size: 11px; }

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
.config-item-mobile.active .config-id {
  background: var(--color-primary);
  color: #fff;
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
</style>