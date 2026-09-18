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

// ============================================================
// ⭐ __recDebug：推荐结果的控制台调试工具
//
// 用法：
//   __recDebug.list()                     // 列出所有 combo
//   __recDebug(1)                         // 查第 1 个推荐的详情
//   __recDebug.byWeapon(46, '#3')         // 按 weaponId + configId 查
//   __recDebug.byWeaponName('汤姆逊')      // 按武器名查
//   __recDebug.clear()                    // 清空 debug Map（下次重算会重新收集）
//
// ⚠️ 前提：
//   - 必须先跑过一次推荐，且该 combo 是「新算」的（不是命中缓存的）
//   - 命中缓存的 combo 没有 debug 数据
// ============================================================

/**
 * 打印单个 combo 的 debug 信息
 */
function printComboDebug(combo) {
  if (!combo) {
    console.warn('⚠️ combo 为空')
    return
  }

  console.log('\n═══════════════════════════════════════════════════')
  console.log(`🏆 推荐 #${combo.rank}`)
  console.log('═══════════════════════════════════════════════════')

  const w = combo.attackMeta
  const a = combo.defenseMeta

  console.log(`\n📦 装备:`)
  console.log(`  武器: ${w.weaponName} ${w.configId}`)
  console.log(`  子弹: ${w.bulletName} Lv.${w.bulletLevel} (${w.bulletId})`)
  console.log(`  护甲: ${a.armorName} Lv.${a.armorLevel} (${a.armorValue})`)
  console.log(`  头盔: ${a.helmetName} Lv.${a.helmetLevel} (${a.helmetValue})`)
  console.log(`  成本: ${(combo.cost.total / 10000).toFixed(1)}W`)

  console.log(`\n📊 综合胜率: ${(combo.combinedWinRate * 100).toFixed(1)}%`)

  // 每个敌人的详情
  combo.perEnemy.forEach(e => {
    console.log(`\n───────────────────────────────────────────────────`)
    console.log(`🎯 vs ${e.enemyName}`)
    console.log(`───────────────────────────────────────────────────`)

    // ---------- 攻击侧 ----------
    console.log(`\n【攻击侧】我方 → 敌人`)
    if (e.attackDebug) {
      const dbg = e.attackDebug
      const inp = dbg.input
      const out = dbg.output
      const cur = inp._current || {}

      console.log(`  输入:`)
      console.log(`    武器: ${inp.weaponName} ${inp.configId} (weaponId=${inp.weaponId})`)
      console.log(`    子弹: ${inp.bulletName} Lv.${inp.bulletLevel} (${inp.bulletId})`)
      console.log(`    距离: ${inp.distance}m`)
      console.log(`    命中率: ${inp.hitRate}`)
      console.log(`    defender: Lv.${inp.defender.armorLevel}/${inp.defender.armorValue} (甲) Lv.${inp.defender.helmetLevel}/${inp.defender.helmetValue} (头)`)

      console.log(`  武器 _current:`)
      console.log(`    rof=${cur.rof} velocity=${cur.velocity}`)
      console.log(`    ranges=${JSON.stringify(cur.ranges)}`)
      console.log(`    decays=${JSON.stringify(cur.decays)}`)
      console.log(`    flesh=${cur.flesh} armor=${cur.armor}`)
      console.log(`    mult=${JSON.stringify(cur.mult)}`)
      if (cur.rofStages) {
        console.log(`    rofStages=${JSON.stringify(cur.rofStages)}`)
      }
      if (cur.fireMode) {
        console.log(`    fireMode=${cur.fireMode} burstCount=${cur.burstCount} burstInternalROF=${cur.burstInternalROF} burstInterval=${cur.burstInterval}`)
      }

      console.log(`  输出:`)
      console.log(`    → ttk = ${out.ttk.toFixed(2)} ms`)
      console.log(`    → shots = ${out.shots.toFixed(3)}`)
      console.log(`    → hits = ${out.hits.toFixed(3)}`)

      if (out.debug) {
        const d = out.debug
        console.log(`  分解:`)
        console.log(`    flightTime = ${d.flightTime?.toFixed(2)} ms`)
        console.log(`    triggerMs = ${d.triggerMs} ms`)
        console.log(`    shootingTime = ${d.shootingTime?.toFixed(2)} ms`)
        console.log(`    decay = ${d.decay}`)
        console.log(`    pureDamage = ${JSON.stringify(d.pureDamage)}`)
        console.log(`    armorDamage = ${JSON.stringify(d.armorDamage)}`)
        console.log(`    pen = ${JSON.stringify(d.pen)}`)
        console.log(`    stateCount = ${d.stateCount}`)
      }
    } else {
      console.log(`  ⚠️ 无 debug 数据（该条命中 IndexedDB 缓存，未重新计算）`)
      console.log(`     如需 debug 数据：清空缓存后重新跑推荐`)
      console.log(`     attackId = ${e.attackId}`)
    }

    // ---------- 防御侧 ----------
    console.log(`\n【防御侧】敌人 → 我方`)
    if (e.defenseDebug) {
      const dbg = e.defenseDebug
      const inp = dbg.input
      const out = dbg.output
      const cur = inp.enemy_current || {}

      console.log(`  输入:`)
      console.log(`    敌人武器: ${inp.enemyWeaponName} ${inp.enemyConfigId} (weaponId=${inp.enemyWeaponId})`)
      console.log(`    敌人子弹: ${inp.enemyBulletName} Lv.${inp.enemyBulletLevel} (${inp.enemyBulletId})`)
      console.log(`    距离: ${inp.distance}m`)
      console.log(`    命中率: ${inp.hitRate}`)
      console.log(`    defender (我方): Lv.${inp.defender.armorLevel}/${inp.defender.armorValue} (${inp.defender.armorName}) Lv.${inp.defender.helmetLevel}/${inp.defender.helmetValue} (${inp.defender.helmetName})`)

      console.log(`  敌人武器 _current:`)
      console.log(`    rof=${cur.rof} velocity=${cur.velocity}`)
      console.log(`    ranges=${JSON.stringify(cur.ranges)}`)
      console.log(`    decays=${JSON.stringify(cur.decays)}`)
      console.log(`    flesh=${cur.flesh} armor=${cur.armor}`)
      console.log(`    mult=${JSON.stringify(cur.mult)}`)
      if (cur.rofStages) {
        console.log(`    rofStages=${JSON.stringify(cur.rofStages)}`)
      }
      if (cur.fireMode) {
        console.log(`    fireMode=${cur.fireMode} burstCount=${cur.burstCount} burstInternalROF=${cur.burstInternalROF} burstInterval=${cur.burstInterval}`)
      }

      console.log(`  输出:`)
      console.log(`    → ttk = ${out.ttk.toFixed(2)} ms`)
      console.log(`    → shots = ${out.shots.toFixed(3)}`)
      console.log(`    → hits = ${out.hits.toFixed(3)}`)

      if (out.debug) {
        const d = out.debug
        console.log(`  分解:`)
        console.log(`    flightTime = ${d.flightTime?.toFixed(2)} ms`)
        console.log(`    triggerMs = ${d.triggerMs} ms`)
        console.log(`    shootingTime = ${d.shootingTime?.toFixed(2)} ms`)
        console.log(`    decay = ${d.decay}`)
        console.log(`    pureDamage = ${JSON.stringify(d.pureDamage)}`)
        console.log(`    armorDamage = ${JSON.stringify(d.armorDamage)}`)
        console.log(`    pen = ${JSON.stringify(d.pen)}`)
        console.log(`    stateCount = ${d.stateCount}`)
      }
    } else {
      console.log(`  ⚠️ 无 debug 数据（该条命中 IndexedDB 缓存，未重新计算）`)
      console.log(`     如需 debug 数据：清空缓存后重新跑推荐`)
      console.log(`     defenseId = ${e.defenseId}`)
    }

    // ---------- 胜率 ----------
    console.log(`\n【胜率】`)
    console.log(`  攻击 TTK = ${e.attackTTK.toFixed(2)} ms`)
    console.log(`  生存 TTK = ${e.defenseTTK.toFixed(2)} ms`)
    console.log(`  diff = 生存 - 攻击 = ${e.defenseTTK.toFixed(2)} - ${e.attackTTK.toFixed(2)} = ${e.diff.toFixed(2)} ms`)

    const K = getWinRateK()
    if (e.diff !== 0) {
      console.log(`  K = ${K} ms`)
      console.log(`  winRate = 1 / (1 + exp(-diff / K))`)
      console.log(`          = 1 / (1 + exp(-${e.diff.toFixed(2)} / ${K}))`)
      console.log(`          = ${(e.winRate * 100).toFixed(1)}%`)
    } else {
      console.log(`  diff = 0 → winRate = 50%`)
    }
  })

  // ---------- 综合胜率 ----------
  console.log(`\n───────────────────────────────────────────────────`)
  console.log(`📈 综合胜率`)
  console.log(`───────────────────────────────────────────────────`)
  const method = getWinRateAggMethod()
  const perEnemyRates = combo.perEnemy.map(e => e.winRate)
  console.log(`  每敌人胜率: [${perEnemyRates.map(r => (r * 100).toFixed(1) + '%').join(', ')}]`)
  console.log(`  聚合方式: ${method}`)
  console.log(`  → 综合胜率 = ${(combo.combinedWinRate * 100).toFixed(1)}%`)

  console.log('═══════════════════════════════════════════════════\n')
}

function getWinRateK() {
  const result = window.__lastRecResult
  return result?._debug?.winRateK ?? 100
}

function getWinRateAggMethod() {
  const result = window.__lastRecResult
  return result?._debug?.winRateAggMethod ?? 'avg'
}

/**
 * 获取当前推荐结果的 _debug 数据
 */
function getDebugData() {
  const result = window.__lastRecResult
  if (!result) {
    console.warn('⚠️ 没有推荐结果。请先跑一次推荐。')
    return null
  }
  if (!result._debug || !result._debug.combos) {
    console.warn('⚠️ 推荐结果中没有 debug 数据。请确认：')
    console.warn('   1. 已替换为最新版 RecEngine.js + TTKMatrix.js')
    console.warn('   2. 推荐时至少有部分 combo 是「新算」的（不是全命中缓存）')
    return null
  }
  return result._debug
}

/**
 * 主入口：__recDebug(rank)
 */
function __recDebug(rank) {
  const debug = getDebugData()
  if (!debug) return

  if (typeof rank !== 'number') {
    console.warn('⚠️ 用法: __recDebug(rank)，rank 是数字（如 __recDebug(1)）')
    console.warn('   其他用法: __recDebug.list() / __recDebug.byWeapon(id, configId) / __recDebug.byWeaponName(name)')
    return
  }

  const combo = debug.combos.find(c => c.rank === rank)
  if (!combo) {
    console.warn(`⚠️ 未找到推荐 #${rank}`)
    console.warn(`   可用 rank: ${debug.combos.map(c => c.rank).join(', ')}`)
    return
  }

  printComboDebug(combo)
}

/**
 * 列出所有 combo
 */
__recDebug.list = function () {
  const debug = getDebugData()
  if (!debug) return

  console.log('\n📋 所有推荐 combo:')
  console.log('───────────────────────────────────────────────────')
  debug.combos.forEach(c => {
    const w = c.attackMeta
    const a = c.defenseMeta
    const hasDebug = c.perEnemy.some(e => e.attackDebug || e.defenseDebug)
    const debugTag = hasDebug ? '📗' : '📕'   // 📗 有 debug，📕 全命中缓存
    console.log(
      `${debugTag} #${c.rank}  ${w.weaponName} ${w.configId} + ${w.bulletName} Lv.${w.bulletLevel}` +
      ` | 甲: ${a.armorName} Lv.${a.armorLevel} + 头: ${a.helmetName} Lv.${a.helmetLevel}` +
      ` | 综合胜率: ${(c.combinedWinRate * 100).toFixed(1)}%`
    )
  })
  console.log('───────────────────────────────────────────────────')
  console.log(`共 ${debug.combos.length} 个`)
  console.log(`📗 = 有 debug 数据   📕 = 全命中缓存（无 debug）`)
  console.log(`用 __recDebug(rank) 查看详情\n`)
}

/**
 * 按 weaponId + configId 查
 */
__recDebug.byWeapon = function (weaponId, configId) {
  const debug = getDebugData()
  if (!debug) return

  const combo = debug.combos.find(c =>
    c.attackMeta.weaponId === weaponId &&
    c.attackMeta.configId === configId
  )
  if (!combo) {
    console.warn(`⚠️ 未找到武器 weaponId=${weaponId} configId=${configId}`)
    console.warn(`   用 __recDebug.list() 查看可用的组合`)
    return
  }

  printComboDebug(combo)
}

/**
 * 按武器名查（模糊匹配，取第一个）
 */
__recDebug.byWeaponName = function (name) {
  const debug = getDebugData()
  if (!debug) return

  if (!name || typeof name !== 'string') {
    console.warn('⚠️ 用法: __recDebug.byWeaponName("汤姆逊")')
    return
  }

  const matched = debug.combos.filter(c =>
    (c.attackMeta.weaponName || '').includes(name)
  )
  if (matched.length === 0) {
    console.warn(`⚠️ 未找到武器名含 "${name}" 的推荐`)
    console.warn(`   用 __recDebug.list() 查看可用的组合`)
    return
  }

  if (matched.length > 1) {
    console.log(`ℹ️ 匹配到 ${matched.length} 个，显示第一个（rank=#${matched[0].rank}）`)
    console.log(`   全部匹配 rank: ${matched.map(c => '#' + c.rank).join(', ')}`)
  }

  printComboDebug(matched[0])
}

/**
 * 清空 debug Map（下次重算会重新收集）
 */
__recDebug.clear = async function () {
  try {
    const { clearDebugMap } = await import('@/core/TTKMatrix.js')
    clearDebugMap()
    console.log('🗑️ debug Map 已清空')
  } catch (e) {
    console.warn('⚠️ 清空 debug Map 失败:', e)
  }
}

/**
 * 帮助
 */
__recDebug.help = function () {
  console.log('\n═══════════════════════════════════════════════════')
  console.log('📖 __recDebug 用法')
  console.log('═══════════════════════════════════════════════════')
  console.log('')
  console.log('  __recDebug.list()                 列出所有 combo')
  console.log('  __recDebug(rank)                  查第 rank 个推荐的详情')
  console.log('  __recDebug.byWeapon(id, configId) 按 weaponId + configId 查')
  console.log('  __recDebug.byWeaponName(name)     按武器名查（模糊匹配）')
  console.log('  __recDebug.clear()                清空 debug Map')
  console.log('  __recDebug.help()                 显示本帮助')
  console.log('')
  console.log('📌 前提：')
  console.log('  - 必须先跑过一次推荐')
  console.log('  - 该 combo 是「新算」的（不是命中缓存的）')
  console.log('  - 命中缓存的 combo 无 debug 数据')
  console.log('')
  console.log('💡 提示：')
  console.log('  - 如果全部命中缓存，用 __recDebug.clear() 后重新推荐')
  console.log('  - 或者直接清空 IndexedDB（DevTools）')
  console.log('')
  console.log('═══════════════════════════════════════════════════\n')
}

// 挂到 window
window.__recDebug = __recDebug

console.log('✅ __recDebug 已初始化（输入 __recDebug.help() 查看用法）')