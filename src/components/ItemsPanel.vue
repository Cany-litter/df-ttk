<!-- src/components/ItemsPanel.vue -->
<template>
  <div class="items-panel">
    <!-- 子 Tab 导航 -->
    <div class="sub-tabs">
      <button
        class="sub-tab"
        :class="{ active: currentSubTab === 'bullet' }"
        @click="switchSubTab('bullet')"
      >
        💊 子弹
        <span class="count">{{ bulletRows.length }}</span>
      </button>
      <button
        class="sub-tab"
        :class="{ active: currentSubTab === 'armor' }"
        @click="switchSubTab('armor')"
      >
        🦺 护甲
        <span class="count">{{ armorRows.length }}</span>
      </button>
      <button
        class="sub-tab"
        :class="{ active: currentSubTab === 'helmet' }"
        @click="switchSubTab('helmet')"
      >
        ⛑️ 头盔
        <span class="count">{{ helmetRows.length }}</span>
      </button>
      <!-- ⭐ v5：其他物品 -->
      <button
        class="sub-tab"
        :class="{ active: currentSubTab === 'other' }"
        @click="switchSubTab('other')"
      >
        🧰 其他物品
        <span class="count">{{ otherItemsRows.length }}</span>
      </button>
    </div>

    <!-- ============ 子 Tab 内容 ============ -->
    <div class="sub-content">
      <!-- 子弹 -->
      <div v-show="currentSubTab === 'bullet'" class="sub-pane">
        <BulletTable
          :data="bulletRows"
          :caliber-options="caliberOptions"
          @update="onBulletUpdate"
          @add-bullet="onAddBullet"
          @delete-bullet="onDeleteBullet"
        />
      </div>

      <!-- 护甲 -->
      <div v-show="currentSubTab === 'armor'" class="sub-pane">
        <ArmorTable
          :data="armorRows"
          type="armor"
          @update="onArmorUpdate"
        />
      </div>

      <!-- 头盔 -->
      <div v-show="currentSubTab === 'helmet'" class="sub-pane">
        <ArmorTable
          :data="helmetRows"
          type="helmet"
          @update="onArmorUpdate"
        />
      </div>

      <!-- ⭐ v5：其他物品 -->
      <div v-show="currentSubTab === 'other'" class="sub-pane">
        <OtherItemsTable
          :data="otherItemsRows"
          @update="onOtherItemsUpdate"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { dataStore, appStore } from '@/stores/stores'
import BulletTable from '@/components/BulletTable.vue'
import ArmorTable from '@/components/ArmorTable.vue'
import OtherItemsTable from '@/components/OtherItemsTable.vue'   // ⭐ v5

const props = defineProps({
  caliberOptions: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update'])

// ---------- 计算属性 ----------
const currentSubTab = computed(() => appStore.state.currentSubTab)

const bulletRows = computed(() => {
  return dataStore.state.bullets || []
})

const armorRows = computed(() => {
  return (dataStore.state.armors || []).filter(a => a.type === 'armor')
})

const helmetRows = computed(() => {
  return (dataStore.state.armors || []).filter(a => a.type === 'helmet')
})

// ⭐ v5：其他物品（包含禁用的，让 UI 能看到）
const otherItemsRows = computed(() => {
  return dataStore.state.otherItems || []
})

// ---------- 子 Tab 切换 ----------
const switchSubTab = (sub) => {
  appStore.switchSubTab(sub)
}

// ============================================================
// 子弹事件（转发到父组件）
// ============================================================
const onBulletUpdate = () => {
  dataStore.refreshBullets()
  emit('update')
}

const onAddBullet = (index, bulletData) => {
  // BulletTable 内部会处理，这里只需刷新
  dataStore.refreshBullets()
  emit('update')
}

const onDeleteBullet = (index, bulletId, isCancelled) => {
  if (isCancelled) {
    // BulletTable 内部处理
    return
  }
  const dm = dataStore.getDataManager()
  dm.removeBullet(bulletId)
  dataStore.refreshBullets()
  emit('update')
}

// ============================================================
// 护甲事件（ArmorTable 内部已处理，只需刷新）
// ============================================================
const onArmorUpdate = () => {
  dataStore.refreshArmors()
  emit('update')
}

// ============================================================
// ⭐ v5：其他物品事件（OtherItemsTable 内部已处理，只需刷新）
// ============================================================
const onOtherItemsUpdate = () => {
  dataStore.refreshOtherItems()
  emit('update')
}
</script>

<style scoped>
.items-panel {
  width: 100%;
}

/* ============================================================
   子 Tab 导航
   ============================================================ */
.sub-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border-light, #e8e8e8);
  flex-wrap: wrap;
}

.sub-tab {
  padding: 5px 16px;
  border: 1px solid var(--color-border, #d0d0d0);
  background: #fafafa;
  border-radius: 4px;
  font-family: var(--font-family);
  font-size: 12px;
  cursor: pointer;
  color: #666;
  font-weight: 500;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  user-select: none;
}

.sub-tab:hover {
  border-color: var(--color-primary, #4a6cf7);
  color: var(--color-primary, #4a6cf7);
}

.sub-tab.active {
  background: var(--color-primary, #4a6cf7);
  border-color: var(--color-primary, #4a6cf7);
  color: #fff;
}

.sub-tab .count {
  font-size: 10px;
  opacity: 0.75;
  font-family: var(--font-mono);
}

/* ============================================================
   子 Tab 内容
   ============================================================ */
.sub-content {
  min-height: 300px;
}

.sub-pane {
  width: 100%;
}

/* ============================================================
   移动端适配
   ============================================================ */
@media (max-width: 768px) {
  .sub-tabs {
    gap: 3px;
  }

  .sub-tab {
    padding: 4px 10px;
    font-size: 11px;
    gap: 3px;
  }

  .sub-tab .count {
    font-size: 9px;
  }
}
</style>