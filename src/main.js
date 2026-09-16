﻿// src/main.js
import { createApp } from 'vue'
import App from './App.vue'
import './styles/main.css'

import * as echarts from 'echarts'
window.echarts = echarts

import { getDataManager } from '@/core/DataManager'
import { getTtkCacheManager } from '@/core/TtkCacheManager'

// 获取 DataManager 实例
const dm = getDataManager()

// ⭐ 初始化 TtkCacheManager 并注入到 DataManager
// （统一缓存：ttkCache 是唯一缓存，旧的 ConfigCacheManager 已删除）
const ttkCacheManager = getTtkCacheManager(dm)
dm.setTtkCacheManager(ttkCacheManager)

// 挂到 window 上方便调试
window.__dataManager = dm
window.__ttkCacheManager = ttkCacheManager

console.log('✅ TtkCacheManager 已初始化并注入到 DataManager')

const app = createApp(App)
app.mount('#app')

// ⭐ RecEngine 供推荐面板使用
import { getRecEngine } from '@/core/RecEngine'
const recEngine = getRecEngine(dm, ttkCacheManager)
window.__recEngine = recEngine