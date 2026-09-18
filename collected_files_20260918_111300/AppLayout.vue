<!-- src/components/AppLayout.vue -->
<!--
  页面布局（AppHeader + AppFooter 合并）

  用法：
    <AppLayout>
      <ParamsPanel ... />
      <div class="charts-area">...</div>
      <div class="table-section">...</div>
    </AppLayout>

  说明：
  - Header 固定在顶部，Footer 固定在底部，中间内容通过 <slot /> 承载
  - Header 里的 /assets/bili.png 是绝对路径，不受组件位置影响
  - scoped 样式只作用于本组件的 header/footer，不影响 slot 内容
-->
<template>
  <div class="app-layout">
    <!-- ============ 页头 ============ -->
    <header class="app-header">
      <div class="header-left">
        <span class="app-title">三角洲 TTK 计算器</span>
      </div>
      <div class="header-right">
        <a href="https://space.bilibili.com/128602631" target="_blank" class="author-link">
          <span>殘雲碎夢</span>
          <img src="/assets/bili.png" alt="B站" class="bili-icon" />
        </a>
      </div>
    </header>

    <!-- ============ 中间内容 ============ -->
    <slot />

    <!-- ============ 页脚 ============ -->
    <footer class="app-footer">
      <span>Delta Force TTK Calculator &copy; 2026</span>
      <span class="footer-separator">|</span>
      <span>数据仅供参考，以游戏内为准</span>
    </footer>
  </div>
</template>

<script setup>
// 无脚本逻辑，纯布局组件
</script>

<style scoped>
/* ============================================================
   页头（原 AppHeader.vue）
   ============================================================ */
.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0 12px 0;
  border-bottom: 2px solid var(--color-border-light);
  flex-wrap: wrap;
  gap: var(--spacing-sm);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
}

.app-title {
  font-family: var(--font-family);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
  line-height: 1.2;
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  font-family: var(--font-family);
  font-size: var(--font-size-lg);
  color: var(--color-text-secondary);
}

.author-link {
  display: flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  color: var(--color-text-secondary);
  transition: color 0.2s;
}

.author-link:hover {
  color: var(--color-primary);
}

.bili-icon {
  height: 28px;
  width: 28px;
  border-radius: 50%;
  transition: transform 0.2s;
}

.bili-icon:hover {
  transform: scale(1.1);
}

/* ============================================================
   页脚（原 AppFooter.vue）
   ============================================================ */
.app-footer {
  margin-top: var(--spacing-lg);
  padding: 8px 0 4px 0;
  border-top: 1px solid var(--color-border-light);
  text-align: center;
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  display: flex;
  justify-content: center;
  gap: var(--spacing-md);
  flex-wrap: wrap;
}

.footer-separator {
  color: #ddd;
}

/* ============================================================
   移动端适配
   ============================================================ */
@media (max-width: 768px) {
  .app-title {
    font-size: 16px;
  }

  .header-right {
    font-size: var(--font-size-md);
  }

  .bili-icon {
    height: 24px;
    width: 24px;
  }

  .app-footer {
    font-size: var(--font-size-sm);
    gap: var(--spacing-sm);
  }
}
</style>