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
  },
  // ⭐ 分段：只支持对象 { start, end }
  segment: {
    type: Object,
    default: () => ({ start: 0, end: 100 })
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

// ⭐ 是否为移动端（视口宽度 <= 768）
const isMobile = ref(false)

const updateIsMobile = () => {
  isMobile.value = window.innerWidth <= 768
}

// ============================================================
// ⭐ 工具：找最接近目标值的索引
// ============================================================

/**
 * 在数组中找最接近目标值的索引
 * 
 * 因为自定义分段可能传非整数（如 20.5），indexOf 找不到，
 * 需要用"最接近"的索引。
 * 
 * @param {Array<number>} arr
 * @param {number} target
 * @returns {number} 索引，找不到返回 -1
 */
const findClosestIndex = (arr, target) => {
  if (!arr || arr.length === 0) return -1

  // 精确匹配
  const exact = arr.indexOf(target)
  if (exact !== -1) return exact

  // 找最接近的
  let closest = 0
  let minDiff = Math.abs(arr[0] - target)
  for (let i = 1; i < arr.length; i++) {
    const diff = Math.abs(arr[i] - target)
    if (diff < minDiff) {
      minDiff = diff
      closest = i
    }
  }
  return closest
}

// ============================================================
// ⭐ 根据 segment 计算切片范围
// ============================================================
const segmentRange = computed(() => {
  const fullDistances = props.distances || []

  // ⭐ 只支持对象
  let rangeStart = Number(props.segment?.start)
  let rangeEnd = Number(props.segment?.end)

  if (isNaN(rangeStart)) rangeStart = 0
  if (isNaN(rangeEnd)) rangeEnd = 100

  // ⭐ 边界校验
  rangeStart = Math.max(0, Math.min(100, rangeStart))
  rangeEnd = Math.max(0, Math.min(100, rangeEnd))

  // ⭐ 起止交换
  if (rangeStart > rangeEnd) {
    [rangeStart, rangeEnd] = [rangeEnd, rangeStart]
  }

  // ⭐ 用 findClosestIndex 而不是 indexOf（兼容非整数）
  const startIndex = findClosestIndex(fullDistances, rangeStart)
  const endIndex = findClosestIndex(fullDistances, rangeEnd)

  // 边界兜底
  if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
    return {
      startIndex: 0,
      endIndex: fullDistances.length - 1,
      visibleDistances: fullDistances,
      axisStart: fullDistances[0] ?? 0,
      axisEnd: fullDistances[fullDistances.length - 1] ?? 100
    }
  }

  const visibleDistances = fullDistances.slice(startIndex, endIndex + 1)

  return {
    startIndex,
    endIndex,
    visibleDistances,
    axisStart: visibleDistances[0] ?? 0,
    axisEnd: visibleDistances[visibleDistances.length - 1] ?? 100
  }
})

// ============================================================
// ⭐ 处理统计数据（排序 + 排名 + 截断）
// ============================================================
const processedStats = computed(() => {
  const stats = props.stats || []
  if (stats.length === 0) return []

  const sortedWithMeta = stats
    .map(s => ({ ...s }))
    .sort((a, b) => (a.weightedAvg || Infinity) - (b.weightedAvg || Infinity))

  const totalCount = sortedWithMeta.length
  const top15Count = Math.max(3, Math.ceil(totalCount * 0.15))
  const top40Count = Math.ceil(totalCount * 0.40)

  sortedWithMeta.forEach((s, i) => {
    s._rank = i + 1
    s._totalCount = totalCount
    s._isTop15 = i < top15Count
    s._isTop40 = i < top40Count
  })

  const displayCount = props.displayCount
  let displayStats

  if (!displayCount || displayCount <= 0 || displayCount >= totalCount) {
    displayStats = sortedWithMeta
  } else {
    displayStats = sortedWithMeta.slice(0, displayCount)
  }

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

  return displayStats
})

// ============================================================
// ⭐ 计算 Y 轴范围（压缩空白区）
// ============================================================
const calculateYAxisRange = (series) => {
  const allValues = []
  series.forEach(s => {
    (s.data || []).forEach(v => {
      if (typeof v === 'number' && v > 0 && isFinite(v)) {
        allValues.push(v)
      }
    })
  })

  if (allValues.length === 0) {
    return { min: 0, max: 1000 }
  }

  const dataMin = Math.min(...allValues)
  const dataMax = Math.max(...allValues)

  let yMin = Math.max(0, dataMin * 0.92)
  let yMax = dataMax * 1.08

  if (yMax - yMin < 100) {
    const mid = (yMax + yMin) / 2
    yMin = Math.max(0, mid - 50)
    yMax = mid + 50
  }

  yMin = Math.floor(yMin / 10) * 10
  yMax = Math.ceil(yMax / 10) * 10

  return { min: yMin, max: yMax }
}

// ============================================================
// ⭐ 根据跨度计算 X 轴刻度间隔
// ============================================================
const getTickInterval = (start, end) => {
  const span = end - start
  if (span <= 10) return 1
  if (span <= 25) return 2
  if (span <= 50) return 5
  if (span <= 80) return 10
  return 20
}

// ============================================================
// 构建 ECharts 配置
// ============================================================
const buildChartOption = () => {
  const stats = processedStats.value
  const { startIndex, endIndex, visibleDistances, axisStart, axisEnd } = segmentRange.value

  if (stats.length === 0 || visibleDistances.length === 0) {
    return {
      title: {
        text: '暂无数据，请点击 "生成折线图"',
        left: 'center',
        top: 'center',
        textStyle: { color: '#999', fontSize: 14, fontWeight: 400 }
      }
    }
  }

  // 构建系列数据（times 按 segment 切片）
  const series = stats.map((s, index) => {
    const label = s.displayName || s.weapon?.name || '未知武器'
    const isHighlighted = props.highlightWeapon && label === props.highlightWeapon
    const rank = s._rank || (index + 1)
    const totalCount = s._totalCount || stats.length
    const isTop15 = s._isTop15
    const isTop40 = s._isTop40

    // 切片 times
    const fullTimes = s.times || []
    const slicedTimes = fullTimes.slice(startIndex, endIndex + 1)

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
      data: slicedTimes,
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

  // 计算 Y 轴范围
  const yRange = calculateYAxisRange(series)

  // 图例数据
  const legendData = series.map(s => s.name)

  // 移动端配置调整
  const axisLabelFontSize = isMobile.value ? 9 : 10
  const axisNameFontSize = isMobile.value ? 10 : 11
  const gridConfig = isMobile.value
    ? { left: 50, right: 12, top: 12, bottom: 55 }
    : { left: 60, right: 20, top: 15, bottom: 60 }

  // ⭐ X 轴刻度：按跨度自适应
  const tickInterval = getTickInterval(axisStart, axisEnd)
  const xAxisLabelConfig = {
    fontSize: axisLabelFontSize,
    formatter: (value) => {
      const num = Number(value)
      return num % tickInterval === 0 ? num : ''
    },
    interval: 0
  }

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
      itemWidth: isMobile.value ? 12 : 14,
      itemHeight: isMobile.value ? 8 : 10,
      textStyle: { fontSize: isMobile.value ? 9 : 10 },
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
    grid: gridConfig,
    xAxis: {
      type: 'category',
      data: visibleDistances,
      name: '距离 (m)',
      nameLocation: 'center',
      nameGap: isMobile.value ? 24 : 30,
      nameTextStyle: { fontSize: axisNameFontSize },
      axisLabel: xAxisLabelConfig,
      splitLine: { show: false },
      axisLine: { lineStyle: { color: '#ccc' } }
    },
    yAxis: {
      type: 'value',
      name: 'TTK',
      nameTextStyle: { fontSize: axisNameFontSize },
      min: yRange.min,
      max: yRange.max,
      axisLabel: {
        fontSize: axisLabelFontSize,
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

  const resize = () => {
    updateIsMobile()
    chartInstance?.resize()
  }
  window.addEventListener('resize', resize)
  chartInstance._resizeHandler = resize
}

// 更新图表
const updateChart = () => {
  if (!chartInstance) return
  chartInstance.setOption(buildChartOption(), true)
}

// 监听依赖变化
watch(() => props.stats, () => {
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
  nextTick(() => {
    if (chartInstance) updateChart()
    else initChart()
  })
})

watch(() => props.displayCount, () => {
  nextTick(() => {
    if (chartInstance) updateChart()
    else initChart()
  })
})

// ⭐ 监听分段变化（对象类型需要 deep: true）
watch(() => props.segment, () => {
  nextTick(() => {
    if (chartInstance) updateChart()
    else initChart()
  })
}, { deep: true })

// 监听移动端状态变化
watch(isMobile, () => {
  nextTick(() => {
    if (chartInstance) {
      updateChart()
    }
  })
})

// 生命周期
onMounted(() => {
  updateIsMobile()
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

/* ⭐ 手机竖屏：降低高度（有纵向空间） */
@media (orientation: portrait) and (max-width: 768px) {
  .chart-container {
    min-height: 260px;
  }
}

/* ⭐ 手机横屏：进一步降低高度（纵向空间紧张） */
@media (orientation: landscape) and (max-height: 500px) {
  .chart-container {
    height: 200px;
    min-height: 0;
    aspect-ratio: auto;
  }
}
</style>