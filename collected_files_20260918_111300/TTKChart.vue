<!-- src/components/TTKChart.vue -->
<template>
  <div ref="chartRef" class="chart-container"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  results: {
    type: Array,
    default: () => []
  },
  params: {
    type: Object,
    default: () => ({})
  },
  // ⭐ 显示数量：0 或负数 = 全部
  displayCount: {
    type: Number,
    default: 10
  }
})

const chartRef = ref(null)
let chartInstance = null

// ⭐ 固定的5个部分（始终保留）
const ALL_KEYS = ['noMissFireDelay', 'burstInterval', 'emptyDelay', 'flight', 'triggerDelay']

// 图例名称映射
const LEGEND_MAP = {
  noMissFireDelay: '无空枪射击延迟',
  burstInterval: '平均连发间隔',
  emptyDelay: '平均空枪延迟',
  flight: '飞行延迟',
  triggerDelay: '扳机延迟'
}

// 颜色配置
const COLORS = {
  noMissFireDelay: 'rgba(54, 162, 235, 0.75)',
  burstInterval: 'rgba(255, 99, 132, 0.75)',
  emptyDelay: 'rgba(75, 192, 192, 0.75)',
  flight: 'rgba(255, 159, 64, 0.75)',
  triggerDelay: 'rgba(153, 102, 255, 0.75)'
}

// ⭐ 可见状态
const visibleMap = ref({
  noMissFireDelay: true,
  burstInterval: true,
  emptyDelay: true,
  flight: true,
  triggerDelay: true
})

// ⭐ 是否为移动端（视口宽度 <= 768）
const isMobile = ref(false)

const updateIsMobile = () => {
  isMobile.value = window.innerWidth <= 768
}

// ⭐ 获取可见部分的键列表（用于计算总TTK）
const getVisibleKeys = () => {
  return ALL_KEYS.filter(key => visibleMap.value[key])
}

// ⭐ 计算可见总 TTK（只累加可见部分）
const calculateVisibleTotal = (item) => {
  const keys = getVisibleKeys()
  let total = 0
  keys.forEach(key => {
    total += item[key] || 0
  })
  return total
}

// ⭐ 截断 results（按传入顺序取前 N 条，0 或负数 = 全部）
const getDisplayedResults = () => {
  const all = props.results || []
  const count = props.displayCount

  if (!count || count <= 0 || count >= all.length) {
    return all
  }
  return all.slice(0, count)
}

// 构建 ECharts 配置
const buildChartOption = () => {
  const results = getDisplayedResults()

  if (results.length === 0) {
    return {
      title: {
        text: props.results?.length > 0
          ? '显示数量为 0 或超出范围'
          : '暂无数据，请点击 "计算 TTK"',
        left: 'center',
        top: 'center',
        textStyle: { color: '#999', fontSize: 14, fontWeight: 400 }
      }
    }
  }

  // 复制数据并计算可见总 TTK
  const dataWithVisibleTotal = results.map(item => ({
    ...item,
    visibleTotal: calculateVisibleTotal(item)
  }))

  // 按可见总 TTK 排序
  dataWithVisibleTotal.sort((a, b) => a.visibleTotal - b.visibleTotal)

  const labels = dataWithVisibleTotal.map(r => r.name || '未知武器')

  // ⭐ 始终构建 5 个系列，隐藏的部分数据设为 0
  const series = ALL_KEYS.map(key => {
    const isVisible = visibleMap.value[key]
    const data = dataWithVisibleTotal.map(r => isVisible ? (r[key] || 0) : 0)
    const name = LEGEND_MAP[key] || key
    return {
      name: name,
      type: 'bar',
      stack: 'total',
      data: data,
      itemStyle: { color: COLORS[key] || 'rgba(200, 200, 200, 0.7)' },
      barWidth: '60%'
    }
  })

  // 计算每个武器的总 TTK（用于显示标签）
  const totals = dataWithVisibleTotal.map(r => r.visibleTotal)

  // ⭐ 在最后一个可见的系列上显示总 TTK 标签
  let lastVisibleKey = null
  for (let i = ALL_KEYS.length - 1; i >= 0; i--) {
    if (visibleMap.value[ALL_KEYS[i]]) {
      lastVisibleKey = ALL_KEYS[i]
      break
    }
  }

  if (lastVisibleKey) {
    const lastIndex = ALL_KEYS.indexOf(lastVisibleKey)
    if (series[lastIndex]) {
      series[lastIndex].label = {
        show: true,
        position: 'top',
        formatter: function(params) {
          return Math.round(totals[params.dataIndex]) + 'ms'
        },
        fontSize: isMobile.value ? 8 : 9,
        color: '#666'
      }
    }
  }

  // ⭐ 图例数据始终包含所有 5 个项
  const legendData = Object.values(LEGEND_MAP)

  // ⭐ selected 状态始终包含所有 5 个项
  const selected = {}
  ALL_KEYS.forEach(key => {
    selected[LEGEND_MAP[key]] = visibleMap.value[key]
  })

  // ⭐ 移动端：Y 轴刻度精简
  const yAxisSplitNumber = isMobile.value ? 4 : 6

  // ⭐ 判断是否需要旋转 X 轴标签
  // - 移动端：永远旋转（屏窄，标签容易重叠）
  // - 桌面：标签数 > 8 才旋转
  const shouldRotateLabel = isMobile.value || labels.length > 8

  // ⭐ grid 配置
  // 旋转标签时，底部需要更多空间容纳倾斜的文字
  const gridConfig = isMobile.value
    ? { left: 40, right: 12, top: 12, bottom: shouldRotateLabel ? 85 : 75 }
    : { left: 45, right: 20, top: 15, bottom: shouldRotateLabel ? 65 : 55 }

  // ⭐ 移动端：图例文字更小
  const legendTextStyle = isMobile.value ? { fontSize: 9 } : { fontSize: 11 }

  // ⭐ X 轴标签配置
  const xAxisLabelConfig = {
    rotate: shouldRotateLabel ? 45 : 0,
    fontSize: isMobile.value
      ? (labels.length > 20 ? 8 : 9)
      : (labels.length > 20 ? 9 : 11),
    interval: 0,
    // ⭐ 旋转时右对齐，让标签从刻度线向上延伸
    align: shouldRotateLabel ? 'right' : 'center',
    verticalAlign: shouldRotateLabel ? 'top' : 'middle'
  }

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: function(params) {
        if (!params || params.length === 0) return ''
        const name = params[0].name
        let html = `<strong>${name}</strong><br/>`
        let total = 0
        params.forEach(p => {
          if (p.value > 0) {
            html += `${p.marker} ${p.seriesName}: ${Math.round(p.value)}ms<br/>`
            total += p.value
          }
        })
        html += `─────────────────<br/>`
        html += `总 TTK: ${Math.round(total)}ms`
        return html
      }
    },
    legend: {
      data: legendData,
      bottom: 0,
      textStyle: legendTextStyle,
      itemWidth: isMobile.value ? 12 : 14,
      itemHeight: isMobile.value ? 8 : 10,
      selected: selected
    },
    grid: gridConfig,
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: xAxisLabelConfig,
      axisLine: { lineStyle: { color: '#ccc' } }
    },
    yAxis: {
      type: 'value',
      name: 'TTK (ms)',
      nameTextStyle: { fontSize: isMobile.value ? 10 : 11 },
      axisLabel: { fontSize: isMobile.value ? 9 : 10 },
      splitNumber: yAxisSplitNumber,
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } }
    },
    series: series,
    color: Object.values(COLORS)
  }
}

// ⭐ 处理图例点击事件
const handleLegendSelectChanged = (params) => {
  const selected = params.selected
  // 更新可见状态
  ALL_KEYS.forEach(key => {
    const name = LEGEND_MAP[key]
    if (selected[name] !== undefined) {
      visibleMap.value[key] = selected[name]
    }
  })

  // 重新计算并更新图表
  updateChart()
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

  chartInstance.on('legendselectchanged', handleLegendSelectChanged)

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

// 监听数据变化
watch(() => props.results, () => {
  nextTick(() => {
    if (chartInstance) {
      updateChart()
    } else {
      initChart()
    }
  })
}, { deep: true })

// ⭐ 监听显示数量变化
watch(() => props.displayCount, () => {
  nextTick(() => {
    if (chartInstance) {
      updateChart()
    } else {
      initChart()
    }
  })
})

// ⭐ 监听移动端状态变化（视口宽度跨过 768 时更新图表配置）
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
    chartInstance.off('legendselectchanged', handleLegendSelectChanged)
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