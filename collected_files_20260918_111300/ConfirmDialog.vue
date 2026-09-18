<!-- src/components/ConfirmDialog.vue -->
<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="confirm-overlay"
      @click.self="onCancel"
    >
      <div class="confirm-content" :class="`type-${confirmType}`">
        <!-- 头部 -->
        <div class="confirm-header">
          <h3 class="confirm-title">
            <span v-if="icon" class="confirm-icon">{{ icon }}</span>
            {{ title || '确认' }}
          </h3>
          <button class="confirm-close" @click="onCancel">&times;</button>
        </div>

        <!-- 主体 -->
        <div class="confirm-body">
          <!-- 消息文本 -->
          <div v-if="message" class="confirm-message">
            {{ message }}
          </div>

          <!-- 可选勾选框 -->
          <label
            v-if="checkboxLabel"
            class="confirm-checkbox-row"
          >
            <input
              type="checkbox"
              v-model="checkboxChecked"
              class="confirm-checkbox"
            />
            <span class="confirm-checkbox-label">{{ checkboxLabel }}</span>
          </label>
        </div>

        <!-- 底部 -->
        <div class="confirm-footer">
          <button
            class="confirm-btn cancel"
            @click="onCancel"
          >
            {{ cancelText || '取消' }}
          </button>
          <button
            class="confirm-btn confirm"
            :class="`btn-${confirmType}`"
            @click="onConfirm"
          >
            {{ confirmText || '确定' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, computed } from 'vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: '确认'
  },
  message: {
    type: String,
    default: ''
  },
  confirmText: {
    type: String,
    default: '确定'
  },
  cancelText: {
    type: String,
    default: '取消'
  },
  /**
   * 确认按钮类型
   * - 'primary' 蓝色（默认）
   * - 'danger'  红色（删除/重置）
   * - 'warning' 橙色（警告）
   */
  confirmType: {
    type: String,
    default: 'primary',
    validator: (v) => ['primary', 'danger', 'warning'].includes(v)
  },
  /**
   * 可选勾选框标签
   * 为空则不显示勾选框
   */
  checkboxLabel: {
    type: String,
    default: ''
  },
  /**
   * 勾选框默认值
   */
  checkboxDefault: {
    type: Boolean,
    default: false
  },
  /**
   * 是否显示图标
   * 根据 confirmType 自动选择
   */
  showIcon: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['update:visible', 'confirm', 'cancel'])

// ---------- 内部状态 ----------
const checkboxChecked = ref(props.checkboxDefault)

// ⭐ 根据 confirmType 自动选择图标
const icon = computed(() => {
  if (!props.showIcon) return ''
  switch (props.confirmType) {
    case 'danger': return '⚠️'
    case 'warning': return '⚠️'
    default: return '❓'
  }
})

// ---------- 打开时重置勾选框状态 ----------
watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      checkboxChecked.value = props.checkboxDefault
    }
  }
)

// ---------- 事件 ----------
const onConfirm = () => {
  emit('confirm', { checked: checkboxChecked.value })
  emit('update:visible', false)
}

const onCancel = () => {
  emit('cancel')
  emit('update:visible', false)
}
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100000;   /* 比 calc-progress-overlay（99999）更高 */
  animation: confirm-fade-in 0.15s ease;
}

@keyframes confirm-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.confirm-content {
  background: #fff;
  border-radius: 10px;
  width: 420px;
  max-width: 92vw;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: confirm-slide-in 0.2s ease;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@keyframes confirm-slide-in {
  from { opacity: 0; transform: translateY(-16px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ---------- 头部 ---------- */
.confirm-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border-light, #e8e8e8);
  flex-shrink: 0;
}

.confirm-title {
  font-family: var(--font-family, inherit);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #1a1a2e);
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.4;
}

.confirm-icon {
  font-size: 16px;
  line-height: 1;
}

.confirm-close {
  background: none;
  border: none;
  font-size: 22px;
  line-height: 1;
  color: #999;
  cursor: pointer;
  padding: 0 4px;
  transition: color 0.15s;
  flex-shrink: 0;
}

.confirm-close:hover {
  color: #333;
}

/* ---------- 主体 ---------- */
.confirm-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.confirm-message {
  font-family: var(--font-family, inherit);
  font-size: 13px;
  color: #444;
  line-height: 1.6;
  white-space: pre-wrap;   /* 支持 \n 换行 */
  word-break: break-word;
}

/* 勾选框 */
.confirm-checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #f8f9fa;
  border: 1px solid var(--color-border-light, #e8e8e8);
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}

.confirm-checkbox-row:hover {
  background: #f0f4ff;
  border-color: #d0ddff;
}

.confirm-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--color-primary, #4a6cf7);
  flex-shrink: 0;
  margin: 0;
}

.confirm-checkbox-label {
  font-family: var(--font-family, inherit);
  font-size: 13px;
  color: #333;
  cursor: pointer;
}

/* ---------- 底部 ---------- */
.confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border-light, #e8e8e8);
  background: #fafbfd;
  flex-shrink: 0;
}

.confirm-btn {
  height: 32px;
  padding: 0 18px;
  border: none;
  border-radius: 5px;
  font-family: var(--font-family, inherit);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  white-space: nowrap;
  user-select: none;
}

.confirm-btn:active {
  transform: translateY(1px);
}

.confirm-btn.cancel {
  background: #f0f0f0;
  color: #666;
}

.confirm-btn.cancel:hover {
  background: #e0e0e0;
  color: #333;
}

.confirm-btn.confirm.btn-primary {
  background: var(--color-primary, #4a6cf7);
  color: #fff;
}

.confirm-btn.confirm.btn-primary:hover {
  background: var(--color-primary-hover, #3a5cd7);
}

.confirm-btn.confirm.btn-danger {
  background: var(--color-danger, #f44336);
  color: #fff;
}

.confirm-btn.confirm.btn-danger:hover {
  background: var(--color-danger-hover, #d32f2f);
}

.confirm-btn.confirm.btn-warning {
  background: var(--color-warning, #ff9800);
  color: #fff;
}

.confirm-btn.confirm.btn-warning:hover {
  background: var(--color-warning-hover, #e68900);
}

/* ============================================================
   移动端适配
   ============================================================ */
@media (max-width: 768px) {
  .confirm-content {
    width: 92vw;
    max-width: 92vw;
  }

  .confirm-header {
    padding: 10px 14px;
  }

  .confirm-title {
    font-size: 14px;
  }

  .confirm-body {
    padding: 14px;
  }

  .confirm-message {
    font-size: 13px;
  }

  .confirm-footer {
    padding: 10px 14px;
  }

  .confirm-btn {
    height: 36px;
    padding: 0 16px;
    font-size: 13px;
    flex: 1;
  }
}
</style>