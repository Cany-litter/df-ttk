// src/stores/paramsStore.js
import { reactive, readonly } from 'vue'

const DEFAULT_PARAMS = {
  bulletLevel: 4,
  armorLevel: 4,
  armorValue: 110,
  helmetLevel: 4,
  helmetValue: 48,
  healthValue: 100,
  distance: 30,
  hitRateMap: [
    { distance: 30, rate: 1.0 },
    { distance: 50, rate: 0.9 },
    { distance: 100, rate: 0.6 }
  ],
  hitProb: {
    head: 0.1,
    chest: 0.3,
    stomach: 0.3,
    limbs: 0.3
  },
  triggerDelayEnable: true,
  kdRatio: 1.0,
  extractRate: 0.5,
  extraCost: 30
}

const state = reactive({ ...DEFAULT_PARAMS })

function getHitRateFromMap(map, distance) {
  if (!map || map.length === 0) return 0.85
  const sorted = [...map].sort((a, b) => a.distance - b.distance)
  if (distance <= sorted[0].distance) return Math.min(1, sorted[0].rate)
  if (distance >= sorted[sorted.length - 1].distance) return sorted[sorted.length - 1].rate
  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i], p2 = sorted[i + 1]
    if (distance >= p1.distance && distance < p2.distance) {
      const t = (distance - p1.distance) / (p2.distance - p1.distance)
      return p1.rate + t * (p2.rate - p1.rate)
    }
  }
  return sorted[sorted.length - 1].rate
}

export const paramsStore = {
  state: readonly(state),

  get hitRate() {
    return getHitRateFromMap(state.hitRateMap, state.distance)
  },

  update(key, value) {
    if (key in state) state[key] = value
  },

  updateAll(newParams) {
    Object.assign(state, newParams)
  },

  updateHitRateMap(raw) {
    if (!raw || raw.trim() === '') {
      state.hitRateMap = []
      return
    }
    try {
      const parts = raw.split(',').map(p => p.trim())
      const map = []
      for (const part of parts) {
        const [dist, rate] = part.split(':')
        if (dist && rate) {
          const distance = parseFloat(dist)
          const hitRate = parseFloat(rate)
          if (!isNaN(distance) && !isNaN(hitRate) && hitRate >= 0 && hitRate <= 1) {
            map.push({ distance, rate: hitRate })
          }
        }
      }
      state.hitRateMap = map
    } catch (e) {
      console.warn('解析命中率映射失败:', e)
    }
  },

  reset() {
    Object.assign(state, DEFAULT_PARAMS)
  }
}