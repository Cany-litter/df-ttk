﻿// src/main.js
import { createApp } from 'vue'
import App from './App.vue'
import './styles/main.css'

import * as echarts from 'echarts'
window.echarts = echarts

import { getDataManager } from '@/core/DataManager'

// 获取 DataManager 实例
const dm = getDataManager()

// 挂到 window 上方便调试
window.__dataManager = dm

console.log('✅ DataManager 已初始化')

const app = createApp(App)
app.mount('#app')

// ⭐ RecEngine 供推荐面板使用
import { getRecEngine } from '@/core/RecEngine'
const recEngine = getRecEngine(dm)
window.__recEngine = recEngine

console.log('✅ RecEngine 已初始化')