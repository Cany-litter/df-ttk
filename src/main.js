// src/main.js
import { createApp } from 'vue'
import App from './App.vue'
import './styles/main.css'

import * as echarts from 'echarts'
window.echarts = echarts

import { getDataManager } from '@/core/DataManager'
import { getConfigCacheManager } from '@/core/ConfigCacheManager'

// 获取 DataManager 实例
const dm = getDataManager()

// 初始化 ConfigCacheManager 并注入到 DataManager
const cacheManager = getConfigCacheManager(dm)
dm.setCacheManager(cacheManager)

console.log('✅ CacheManager 已初始化并注入到 DataManager')

const app = createApp(App)
app.mount('#app')