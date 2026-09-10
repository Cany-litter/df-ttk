<!-- src/components/DistanceChart.vue -->
<template>
  <div ref="chartRef" class="chart-container"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick, computed } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  stats: {
    type: Array,
    default: () => []
  },
  distances: {
    type: Array,
    default: () => []
  },
  highlightWeapon: {
    type: String,
    default: null
  },
  displayCount: {
    type: Number,
    default: 10
  }
})

const chartRef = ref(null)
let chartInstance = null

// 颜色方案
const colors = [
  '#e74c3c', '#2ecc71', '#3498db', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#2c3e50', '#27ae60', '#8e44ad',
  '#16a085', '#d35400', '#2980b9', '#c0392b', '#f1c40f'
]

// ============================================================
// 处理统计数据（排序 + 排名 + 截断）
// ============================================================
const processedStats = computed(() => {
  const stats = props.stats || []
  console.log('🔄 processedStats 重新计算, stats 长度:', stats.length, 'displayCount:', props.displayCount)

  if (stats.length === 0) return []

  // ⭐ 1. 先浅拷贝每个对象，避免修改 props 传入的数据
  const sortedWithMeta = stats
    .map(s => ({ ...s }))
    .sort((a, b) => (a.weightedAvg || Infinity) - (b.weightedAvg || Infinity))

  // 2. 分配排名
  const totalCount = sortedWithMeta.length
  const top15Count = Math.max(3, Math.ceil(totalCount * 0.15))
  const top40Count = Math.ceil(totalCount * 0.40)

  sortedWithMeta.forEach((s, i) => {
    s._rank = i + 1
    s._totalCount = totalCount
    s._isTop15 = i < top15Count
    s._isTop40 = i < top40Count
  })

  // 3. 截断
  const displayCount = props.displayCount
  let displayStats

  if (!displayCount || displayCount <= 0 || displayCount >= totalCount) {
    displayStats = sortedWithMeta
  } else {
    displayStats = sortedWithMeta.slice(0, displayCount)
  }

  // 4. 高亮武器追加
  if (props.highlightWeapon) {
    const highlightIndex = displayStats.findIndex(
      s => s.displayName === props.highlightWeapon
    )
    if (highlightIndex === -1) {
      const highlightStat = sortedWithMeta.find(
        s => s.displayName === props.highlightWeapon
      )
      if (highlightStat) {
        displayStats = [...displayStats, highlightStat]
      }
    }
  }

  console.log('  → 显示数量:', displayStats.length)
  return displayStats
})

// ============================================================
// 构建 ECharts 配置
// ============================================================
const buildChartOption = () => {
  const stats = processedStats.value
  const distances = props.distances || []

  if (stats.length === 0 || distances.length === 0) {
    return {
      title: {
        text: '暂无数据，请点击 "生成折线图"',
        left: 'center',
        top: 'center',
        textStyle: { color: '#999', fontSize: 14, fontWeight: 400 }
      }
    }
  }

  // 构建系列数据
  const series = stats.map((s, index) => {
    const label = s.displayName || s.weapon?.name || '未知武器'
    const isHighlighted = props.highlightWeapon && label === props.highlightWeapon
    const rank = s._rank || (index + 1)
    const totalCount = s._totalCount || stats.length
    const isTop15 = s._isTop15
    const isTop40 = s._isTop40

    let lineWidth = 1.0
    let lineType = 'solid'
    let opacity = 1.0
    let colorIndex = index % colors.length

    if (isHighlighted) {
      lineWidth = 3.5
      opacity = 1.0
      colorIndex = 0
    } else if (isTop15) {
      lineWidth = 2.5
      opacity = 1.0
    } else if (isTop40) {
      lineWidth = 1.5
      opacity = 0.7
    } else {
      lineWidth = 1.0
      lineType = 'dashed'
      opacity = 0.45
    }

    const color = isHighlighted ? '#ff0000' : colors[colorIndex % colors.length]

    return {
      name: label,
      type: 'line',
      data: s.times || [],
      smooth: false,
      lineStyle: {
        width: lineWidth,
        type: lineType,
        opacity: opacity
      },
      itemStyle: {
        color: color,
        opacity: opacity
      },
      symbol: 'circle',
      symbolSize: 2,
      showSymbol: true,
      emphasis: {
        itemStyle: { opacity: 1 },
        lineStyle: { width: lineWidth }
      },
      z: isHighlighted ? 100 : (isTop15 ? 10 : 1),
      _rank: rank,
      _totalCount: totalCount,
      _isTop15: isTop15,
      _isHighlighted: isHighlighted
    }
  })

  // 高亮武器移到最前面
  if (props.highlightWeapon) {
    const highlightIndex = series.findIndex(s => s.name === props.highlightWeapon)
    if (highlightIndex > 0) {
      const [highlight] = series.splice(highlightIndex, 1)
      series.unshift(highlight)
    }
  }

  // 图例数据
  const legendData = series.map(s => s.name)

  return {
    tooltip: {
      trigger: 'axis',
      confine: true,
      formatter: function(params) {
        const distance = params[0].axisValue
        let html = `<strong>${distance}m</strong><br/>`
        const sorted = [...params].sort((a, b) => a.value - b.value)
        sorted.forEach(p => {
          if (p.value !== null && p.value !== undefined && p.value > 0) {
            const displayValue = p.value >= 1000 ? (p.value / 1000).toFixed(2) + 's' : Math.round(p.value) + 'ms'
            html += `${p.marker} ${p.seriesName}: ${displayValue}<br/>`
          }
        })
        return html
      }
    },
    legend: {
      type: 'scroll',
      orient: 'horizontal',
      left: 'center',
      top: 'bottom',
      itemWidth: 14,
      itemHeight: 10,
      textStyle: { fontSize: 10 },
      pageButtonItemGap: 5,
      pageButtonGap: 10,
      pageIconColor: '#4a6cf7',
      pageIconInactiveColor: '#aaa',
      pageTextStyle: { color: '#333' },
      data: legendData,
      formatter: function(name) {
        const seriesItem = series.find(s => s.name === name)
        if (!seriesItem) return name
        const rank = seriesItem._rank || '?'
        const total = seriesItem._totalCount || '?'
        const isTop15 = seriesItem._isTop15 ? '⭐ ' : ''
        const isHighlighted = seriesItem._isHighlighted ? '🔴 ' : ''
        return `${isHighlighted}${isTop15}#${rank}/${total} ${name}`
      }
    },
    grid: {
      left: 55,
      right: 20,
      top: 15,
      bottom: 60
    },
    xAxis: {
      type: 'category',
      data: distances,
      name: '距离 (m)',
      nameLocation: 'center',
      nameGap: 30,
      nameTextStyle: { fontSize: 11 },
      axisLabel: {
        fontSize: 10,
        interval: Math.max(1, Math.floor(distances.length / 30))
      },
      splitLine: { show: false },
      axisLine: { lineStyle: { color: '#ccc' } }
    },
    yAxis: {
      type: 'value',
      name: 'TTK',
      nameTextStyle: { fontSize: 11 },
      axisLabel: {
        fontSize: 10,
        formatter: function(value) {
          if (value >= 1000) {
            return (value / 1000).toFixed(1) + 's'
          }
          return Math.round(value) + 'ms'
        }
      },
      splitLine: {
        lineStyle: { color: '#f0f0f0', type: 'dashed' }
      }
    },
    series: series,
    animation: false,
    animationDuration: 0,
    animationDurationUpdate: 0
  }
}

// 初始化图表
const initChart = () => {
  if (!chartRef.value) return

  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }

  chartInstance = echarts.init(chartRef.value)
  chartInstance.setOption(buildChartOption())

  const resize = () => chartInstance?.resize()
  window.addEventListener('resize', resize)
  chartInstance._resizeHandler = resize
}

// 更新图表
const updateChart = () => {
  if (!chartInstance) return
  chartInstance.setOption(buildChartOption(), true)
}

// ⭐ 分别监听每个依赖，确保 displayCount 变化时触发更新
watch(() => props.stats, () => {
  console.log('👁️ watch: stats 变化')
  nextTick(() => {
    if (chartInstance) updateChart()
    else initChart()
  })
}, { deep: true })

watch(() => props.distances, () => {
  nextTick(() => {
    if (chartInstance) updateChart()
    else initChart()
  })
}, { deep: true })

watch(() => props.highlightWeapon, () => {
  console.log('👁️ watch: highlightWeapon 变化')
  nextTick(() => {
    if (chartInstance) updateChart()
    else initChart()
  })
})

watch(() => props.displayCount, (newVal, oldVal) => {
  console.log('👁️ watch: displayCount 变化', oldVal, '->', newVal)
  nextTick(() => {
    if (chartInstance) updateChart()
    else initChart()
  })
})

// 生命周期
onMounted(() => {
  nextTick(() => {
    initChart()
  })
})

onBeforeUnmount(() => {
  if (chartInstance) {
    if (chartInstance._resizeHandler) {
      window.removeEventListener('resize', chartInstance._resizeHandler)
    }
    chartInstance.dispose()
    chartInstance = null
  }
})

defineExpose({
  resize: () => chartInstance?.resize(),
  update: updateChart
})
</script>

<style scoped>
.chart-container {
  width: 100%;
  height: auto;
  aspect-ratio: 2 / 1;
  min-height: 420px;
}

@media (max-width: 768px) {
  .chart-container {
    min-height: 320px;
  }
}
</style>