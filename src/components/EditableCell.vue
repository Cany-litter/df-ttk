<!-- src/components/EditableCell.vue -->
<template>
  <div class="editable-cell" @click="startEdit">
    <!-- 显示模式 -->
    <span v-if="!isEditing" class="display-value">
      {{ displayValue }}
    </span>

    <!-- 编辑模式 -->
    <input
      v-else
      ref="inputRef"
      v-model="editValue"
      :type="inputType"
      :placeholder="placeholder"
      class="editor-input"
      @blur="saveEdit"
      @keydown.enter="saveEdit"
      @keydown.escape="cancelEdit"
    />
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'

const props = defineProps({
  modelValue: {
    required: true
  },
  type: {
    type: String,
    default: 'text'  // 'text' | 'number'
  },
  placeholder: {
    type: String,
    default: ''
  },
  formatter: {
    type: Function,
    default: null
  }
})

const emit = defineEmits(['update:modelValue'])

const isEditing = ref(false)
const editValue = ref(props.modelValue)
const inputRef = ref(null)

// 显示值
const displayValue = computed(() => {
  if (props.formatter) {
    return props.formatter(props.modelValue)
  }
  if (props.modelValue === null || props.modelValue === undefined) {
    return '-'
  }
  return String(props.modelValue)
})

// 输入类型
const inputType = computed(() => {
  return props.type === 'number' ? 'number' : 'text'
})

// 开始编辑
const startEdit = () => {
  isEditing.value = true
  editValue.value = props.modelValue
  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.focus()
      if (props.type === 'number') {
        inputRef.value.select()
      }
    }
  })
}

// 保存编辑
const saveEdit = () => {
  isEditing.value = false
  let value = editValue.value

  if (props.type === 'number') {
    const num = parseFloat(value)
    if (!isNaN(num)) {
      value = num
    } else {
      value = 0
    }
  }

  if (value !== props.modelValue) {
    emit('update:modelValue', value)
  }
}

// 取消编辑
const cancelEdit = () => {
  isEditing.value = false
  editValue.value = props.modelValue
}
</script>

<style scoped>
.editable-cell {
  cursor: pointer;
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px 4px;
}

.display-value {
  padding: 2px 6px;
  border-radius: 3px;
  min-width: 20px;
  display: inline-block;
  font-size: 12px;
}

.display-value:hover {
  background: #f0f4ff;
}

.editor-input {
  width: 100%;
  padding: 2px 6px;
  border: 2px solid #4a6cf7;
  border-radius: 3px;
  font-size: 12px;
  background: #fff;
  min-height: 28px;
  box-sizing: border-box;
  outline: none;
}

.editor-input:focus {
  box-shadow: 0 0 0 2px rgba(74, 108, 247, 0.2);
}

/* 移动端适配 */
@media (max-width: 768px) {
  .editable-cell {
    min-height: 40px;
    padding: 4px 2px;
  }
  .editor-input {
    font-size: 14px;
    min-height: 36px;
  }
  .display-value {
    font-size: 13px;
  }
}
</style>