<!-- src/components/ImportModeDialog.vue -->
<!--
  v7.3 新增：导入模式选择对话框

  用途：
    用户点「📥 导入数据」选中文件后弹出，让用户选择：
      - 🔄 全量覆盖（overwrite）：清空当前所有数据，用文件替换
      - ➕ 增量覆盖（merge）：合并文件与当前数据，新增的配置打标记

  用法：
    <ImportModeDialog
      v-model:visible="visible"
      :file-name="fileName"
      @confirm="onConfirm"
      @cancel="onCancel"
    />

    const mode = await showImportModeDialog(fileName)  // 'overwrite' | 'merge' | null
-->
<template>
  <Teleport to="body">
    <Transition name="import-mode-fade">
      <div v-if="visible" class="import-overlay" @click.self="onCancel">
        <div class="import-dialog">

          <!-- ============ 头部 ============ -->
          <div class="dialog-header">
            <h3 class="dialog-title">📥 选择导入模式</h3>
            <button class="dialog-close" @click="onCancel" title="关闭">&times;</button>
          </div>

          <!-- ============ 文件信息 ============ -->
          <div class="file-info">
            <span class="file-icon">📄</span>
            <span class="file-label">待导入文件</span>
            <span class="file-name" :title="fileName">{{ fileName || '(未命名)' }}</span>
          </div>

          <!-- ============ 主体：两张选择卡 ============ -->
          <div class="mode-options">

            <!-- ---------- 全量覆盖 ---------- -->
            <button
              class="mode-card mode-overwrite"
              @click="choose('overwrite')"
            >
              <div class="mode-header">
                <div class="mode-icon">🔄</div>
                <div class="mode-title">全量覆盖</div>
              </div>

              <div class="mode-body">
                <div class="mode-desc">
                  清空当前所有数据，完全用文件里的内容替换。
                </div>

                <ul class="mode-list">
                  <li>
                    <span class="dot dot-red"></span>
                    <span>现有武器 / 配置 / 子弹 / 护甲</span>
                    <b class="hl-replace">全部被替换</b>
                  </li>
                  <li>
                    <span class="dot dot-red"></span>
                    <span>当前未保存的修改</span>
                    <b class="hl-replace">全部丢失</b>
                  </li>
                </ul>

                <div class="mode-warn">
                  ⚠️ 此操作不可撤销
                </div>
              </div>
            </button>

            <!-- ---------- 增量覆盖 ---------- -->
            <button
              class="mode-card mode-merge"
              @click="choose('merge')"
            >
              <div class="mode-header">
                <div class="mode-icon">➕</div>
                <div class="mode-title">增量覆盖</div>
              </div>

              <div class="mode-body">
                <div class="mode-desc">
                  合并文件与当前数据，冲突时以文件为准。
                </div>

                <ul class="mode-list">
                  <li>
                    <span class="dot dot-blue"></span>
                    <span>文件里已存在的武器 / 配置</span>
                    <b class="hl-update">更新</b>
                  </li>
                  <li>
                    <span class="dot dot-orange"></span>
                    <span>文件里的新武器 / 新配置</span>
                    <b class="hl-add">追加</b>
                  </li>
                  <li>
                    <span class="dot dot-green"></span>
                    <span>当前有、文件里没有的</span>
                    <b class="hl-keep">保留</b>
                  </li>
                </ul>

                <div class="mode-note">
                  🆕 新增的配置会以<b class="hl-yellow">黄色标记</b>高亮
                </div>
              </div>
            </button>

          </div>

          <!-- ============ 底部 ============ -->
          <div class="dialog-footer">
            <span class="footer-hint">选择一种模式开始导入</span>
            <button class="footer-btn cancel" @click="onCancel">取消</button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
const props = defineProps({
  /**
   * 是否显示
   */
  visible: {
    type: Boolean,
    default: false,
  },
  /**
   * 待导入的文件名（用于展示）
   */
  fileName: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:visible', 'confirm', 'cancel'])

/**
 * 用户选择了一种模式
 * @param {'overwrite' | 'merge'} mode
 */
const choose = (mode) => {
  emit('confirm', mode)
  emit('update:visible', false)
}

/**
 * 用户取消
 */
const onCancel = () => {
  emit('cancel')
  emit('update:visible', false)
}
</script>

<style scoped>
/* ============================================================
   遮罩
   ============================================================ */
.import-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100001;
  animation: import-fade-in 0.15s ease;
}

@keyframes import-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ============================================================
   弹窗容器
   ============================================================ */
.import-dialog {
  background: #fff;
  border-radius: 12px;
  width: 680px;
  max-width: 94vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  animation: import-slide-in 0.18s ease;
}

@keyframes import-slide-in {
  from { opacity: 0; transform: translateY(-16px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ============================================================
   头部
   ============================================================ */
.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
}

.dialog-title {
  font-family: var(--font-family, inherit);
  font-size: 15px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0;
}

.dialog-close {
  background: none;
  border: none;
  font-size: 22px;
  line-height: 1;
  color: #999;
  cursor: pointer;
  padding: 0 4px;
  transition: color 0.15s;
}

.dialog-close:hover {
  color: #333;
}

/* ============================================================
   文件信息
   ============================================================ */
.file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: #f8faff;
  border-bottom: 1px solid #eef0f5;
  font-size: 12px;
  flex-shrink: 0;
}

.file-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.file-label {
  color: #888;
  flex-shrink: 0;
}

.file-name {
  font-family: var(--font-mono, monospace);
  color: var(--color-primary, #4a6cf7);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

/* ============================================================
   模式选择
   ============================================================ */
.mode-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 16px 20px;
  flex: 1;
  overflow-y: auto;
}

.mode-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 14px 12px;
  border: 2px solid #e8ecf2;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  text-align: left;
  font-family: var(--font-family, inherit);
  transition: all 0.18s ease;
}

.mode-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
}

.mode-card.mode-overwrite:hover {
  border-color: #f44336;
  background: #fff5f5;
}

.mode-card.mode-merge:hover {
  border-color: #4a6cf7;
  background: #f5f8ff;
}

.mode-card:active {
  transform: translateY(0) scale(0.99);
}

/* ---------- 卡片头部（图标 + 标题） ---------- */
.mode-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mode-icon {
  font-size: 22px;
  line-height: 1;
  flex-shrink: 0;
}

.mode-title {
  font-size: 15px;
  font-weight: 700;
  color: #1a1a2e;
  line-height: 1.2;
}

/* ---------- 卡片主体 ---------- */
.mode-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.mode-desc {
  font-size: 12px;
  color: #666;
  line-height: 1.5;
}

.mode-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: #555;
}

.mode-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.5;
  min-width: 0;
}

.mode-list li > span:not(.dot) {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mode-list li > b {
  flex-shrink: 0;
  font-size: 11px;
}

/* 小圆点 */
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}

.dot-red { background: #f44336; }
.dot-blue { background: #4a6cf7; }
.dot-orange { background: #ff9800; }
.dot-green { background: #4caf50; }

/* 高亮词 */
.hl-replace {
  color: #c62828;
  font-weight: 700;
}

.hl-update {
  color: #4a6cf7;
  font-weight: 700;
}

.hl-add {
  color: #e65100;
  font-weight: 700;
}

.hl-keep {
  color: #2e7d32;
  font-weight: 700;
}

.hl-yellow {
  color: #ff9800;
}

/* 警告条（全量覆盖） */
.mode-warn {
  margin-top: 4px;
  padding: 6px 10px;
  background: #ffebee;
  color: #c62828;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
}

/* 提示条（增量覆盖） */
.mode-note {
  margin-top: 4px;
  padding: 6px 10px;
  background: #fff8e1;
  color: #e65100;
  border-radius: 5px;
  font-size: 11px;
  text-align: center;
}

/* ============================================================
   底部
   ============================================================ */
.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  border-top: 1px solid #e8e8e8;
  background: #fafbfd;
  flex-shrink: 0;
}

.footer-hint {
  font-size: 11px;
  color: #999;
}

.footer-btn {
  height: 32px;
  padding: 0 20px;
  border: none;
  border-radius: 5px;
  font-family: var(--font-family, inherit);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}

.footer-btn.cancel {
  background: #f0f0f0;
  color: #666;
}

.footer-btn.cancel:hover {
  background: #e0e0e0;
  color: #333;
}

.footer-btn.cancel:active {
  transform: translateY(1px);
}

/* ============================================================
   过渡动画
   ============================================================ */
.import-mode-fade-enter-active,
.import-mode-fade-leave-active {
  transition: opacity 0.15s ease;
}

.import-mode-fade-enter-from,
.import-mode-fade-leave-to {
  opacity: 0;
}

/* ============================================================
   移动端
   ============================================================ */
@media (max-width: 768px) {
  .import-dialog {
    width: 96vw;
    max-width: 96vw;
  }

  .mode-options {
    grid-template-columns: 1fr;
    padding: 12px 14px;
    gap: 10px;
  }

  .mode-card {
    padding: 12px;
  }

  .mode-icon {
    font-size: 20px;
  }

  .mode-title {
    font-size: 14px;
  }

  .dialog-header {
    padding: 12px 14px;
  }

  .file-info {
    padding: 8px 14px;
  }

  .dialog-footer {
    padding: 10px 14px;
  }

  .footer-hint {
    display: none;
  }
}

/* ============================================================
   横屏小屏
   ============================================================ */
@media (orientation: landscape) and (max-height: 500px) {
  .import-dialog {
    max-height: 96vh;
  }

  .mode-options {
    padding: 10px 14px;
  }
}
</style>