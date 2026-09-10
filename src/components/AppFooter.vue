<!-- src/components/AppFooter.vue -->
<template>
  <footer class="app-footer">
    <span>Delta Force TTK Calculator &copy; 2026</span>
    <span class="footer-separator">|</span>
    <span>数据仅供参考，以游戏内为准</span>
  </footer>
</template>

<style scoped>
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

/* ============ 移动端适配 ============ */
@media (max-width: 768px) {
  .app-footer {
    font-size: var(--font-size-sm);
    gap: var(--spacing-sm);
  }
}
</style>