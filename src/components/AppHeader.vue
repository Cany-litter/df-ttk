<!-- src/components/AppHeader.vue -->
<template>
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
</template>

<style scoped>
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

/* ============ 移动端适配 ============ */
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
}
</style>