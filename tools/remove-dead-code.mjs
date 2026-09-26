#!/usr/bin/env node
// tools/remove-dead-code.mjs
//
// 用途：批量删除死代码
//
// 用法：
//   node tools/remove-dead-code.mjs --dry-run   # 预览（默认）
//   node tools/remove-dead-code.mjs --apply     # 实际写入

import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT = path.resolve(__dirname, '..')
const DRY_RUN = !process.argv.includes('--apply')

// ============================================================
// 每个文件的删除规则
// 每条规则：{ match: 正则, desc: 描述 }
// 用 [\s\S]*? 非贪婪匹配，不跨越下一个明显的代码块
// ============================================================

const RULES = {
  'src/core/SimulationEngine.js': [
    {
      desc: '删除常量 HIT_KEYS',
      match: /\/\/ 命中部位常量\s*export const HIT_KEYS = \[[^\]]*\];\s*\n/,
      replace: '',
    },
    {
      desc: '删除常量 HIT_PROB_TOLERANCE',
      match: /\/\/ 命中概率校验容差\s*export const HIT_PROB_TOLERANCE = [^;]+;\s*\n/,
      replace: '',
    },
    {
      desc: '删除常量 CHART_CONFIG',
      match: /\/\/ 图表配置\s*export const CHART_CONFIG = \{[\s\S]*?\};\s*\n/,
      replace: '',
    },
    {
      desc: '删除常量 MUZZLE_PRECISION_BONUS',
      match: /\/\/ 枪口精度加成\s*export const MUZZLE_PRECISION_BONUS = [^;]+;\s*\n/,
      replace: '',
    },
    {
      desc: '删除常量 TIME_UNITS',
      match: /\/\/ 时间单位转换\s*export const TIME_UNITS = \{[\s\S]*?\};\s*\n/,
      replace: '',
    },
    {
      desc: '删除常量 CHART_COLORS',
      match: /\/\/ 图表颜色配置\s*export const CHART_COLORS = \{[\s\S]*?\};\s*\n/,
      replace: '',
    },
    {
      desc: '删除常量 RANK_COLORS',
      match: /\/\/ 排名变化颜色\s*export const RANK_COLORS = \{[\s\S]*?\};\s*\n/,
      replace: '',
    },
    {
      desc: '删除函数 resetSeed',
      match: /\/\*\*\s*\n\s*\*\s*重置到默认种子\s*\n\s*\*\/\s*\nexport function resetSeed\(\) \{[\s\S]*?\n\}\s*\n/,
      replace: '',
    },
    {
      desc: '删除类 BaseDamageCalculator',
      match: /\/\*\*\s*\n\s*\*\s*基础伤害计算器[\s\S]*?\n\}\s*\n(?=\n\/\*\*\s*\n\s*\*\s*护甲减伤计算器)/,
      replace: '',
    },
    {
      desc: 'simulateOneTTK 去掉 verbose 参数',
      match: /static simulateOneTTK\(weapon, params, bulletStrategy, bulletData, verbose = false\) \{/,
      replace: 'static simulateOneTTK(weapon, params, bulletStrategy, bulletData) {',
    },
    {
      desc: 'calculateAvgStats 调用去掉最后的 false',
      match: /(this\.simulateOneTTK\(\s*\n\s*weapon,\s*\n\s*params,\s*\n\s*bulletStrategy,\s*\n\s*bulletData,\s*\n\s*)false(\s*\n\s*\);)/g,
      replace: '$1$2',
    },
    {
      desc: 'calculateSinglePoint 调用去掉最后的 false',
      match: /(this\.simulateOneTTK\(\s*\n\s*weapon,\s*\n\s*params,\s*\n\s*bulletStrategy,\s*\n\s*bulletData,\s*\n\s*)false(\s*\n\s*\);)/g,
      replace: '$1$2',
    },
  ],

  'src/App.vue': [
    {
      desc: 'App.vue 删除未使用的 computeTTK import',
      match: /import \{ computeTTK \} from '@\/core\/FastTTK'\n/,
      replace: '',
    },
    {
      desc: 'App.vue 删除 updateSingleWeaponTTK 函数',
      match: /\/\/ =+\n\/\/ 单枪 TTK 更新（备用函数）[\s\S]*?return \{ success: true, newDistanceStats \}\n\}\n\n/,
      replace: '',
    },
  ],

  'src/core/RecEngine.js': [
    {
      desc: 'RecEngine 删除 _makeScenarioHash 方法',
      match: /\/\/ =+\n\/\/ 6\. 场景哈希（转发到 TTKMatrix）\n\/\/ =+\n\n\s*_makeScenarioHash\(scenario\) \{\s*\n\s*return makeScenarioHash\(scenario\)\s*\n\s*\}\n\n/,
      replace: '',
    },
    {
      desc: 'RecEngine 删除 exportResult 方法',
      match: /\/\/ =+\n\/\/ 8\. 导出推荐结果\n\/\/ =+\n\n\s*exportResult\(result, input = null, options = \{\}\) \{[\s\S]*?\n\s*\}\n\n(?=\s*printResult)/,
      replace: '',
    },
  ],

  'src/core/DataManager.js': [
    {
      desc: 'DataManager 删除 getEnabledBullets',
      match: /\s*getEnabledBullets\(\) \{\s*\n\s*return \(this\.data\.bullets \|\| \[\]\)\.filter\(b => b\.enabled !== false\)\s*\n\s*\}\n/,
      replace: '',
    },
    {
      desc: 'DataManager 删除 getDefaultBullet',
      match: /\s*getDefaultBullet\(caliber, level\) \{[\s\S]*?\n\s*\}\n/,
      replace: '',
    },
    {
      desc: 'DataManager 删除 getBulletRows',
      match: /\s*getBulletRows\(\) \{[\s\S]*?\n\s*\}\n/,
      replace: '',
    },
    {
      desc: 'DataManager 删除 getEnabledArmors',
      match: /\s*getEnabledArmors\(\) \{\s*\n\s*return \(this\.data\.armors \|\| \[\]\)\.filter\(a => a\.enabled !== false\)\s*\n\s*\}\n/,
      replace: '',
    },
    {
      desc: 'DataManager 删除 getMuzzleNames',
      match: /\s*getMuzzleNames\(\) \{\s*\n\s*return this\.muzzles\.map\(m => m\.name\)\s*\n\s*\}\n/,
      replace: '',
    },
  ],

  'src/core/TTKMatrix.js': [
    {
      desc: 'TTKMatrix 删除 getAllMatrixEntries',
      match: /\/\*\*\s*\n\s*\*\s*获取所有矩阵记录（慎用，数据可能很大）\s*\n\s*\*\/\s*\nexport async function getAllMatrixEntries\(\) \{[\s\S]*?\n\}\n\n/,
      replace: '',
    },
    {
      desc: 'TTKMatrix 删除 closeDB',
      match: /\/\*\*\s*\n\s*\*\s*关闭数据库连接（用于测试或重置）\s*\n\s*\*\/\s*\nexport async function closeDB\(\) \{[\s\S]*?\n\}\n/,
      replace: '',
    },
  ],

  'src/core/EquipScoreEngine.js': [
    {
      desc: 'EquipScoreEngine 删除 getScoreEntries',
      match: /\/\*\*\s*\n\s*\*\s*批量读取评分缓存[\s\S]*?\nexport async function getScoreEntries\(ids\) \{[\s\S]*?\n\}\n\n/,
      replace: '',
    },
  ],

  'src/core/FastTTK.js': [
    {
      desc: 'FastTTK 删除 queryMatrixStats',
      match: /\/\*\*\s*\n\s*\*\s*矩阵缓存统计\s*\n\s*\*\/\s*\nexport async function queryMatrixStats\(\) \{[\s\S]*?\n\}\n\n/,
      replace: '',
    },
  ],
}

// ============================================================
// 主流程
// ============================================================

let totalFiles = 0
let totalRules = 0
let totalMatched = 0

console.log(`\n🧹 死代码清理 ${DRY_RUN ? '(预览模式，加 --apply 才写入)' : '(实际执行)'}\n`)
console.log(`根目录: ${ROOT}\n`)

for (const [relPath, rules] of Object.entries(RULES)) {
  const absPath = path.join(ROOT, relPath)

  if (!fs.existsSync(absPath)) {
    console.log(`⏭️  跳过（不存在）: ${relPath}`)
    continue
  }

  const original = fs.readFileSync(absPath, 'utf-8')
  let modified = original
  let fileMatched = 0

  console.log(`\n📄 ${relPath}`)
  console.log('─'.repeat(60))

  for (const rule of rules) {
    totalRules++

    // 用 match 检查是否有匹配
    const testMatch = original.match(rule.match)
    if (!testMatch) {
      console.log(`  ⚠️  未匹配: ${rule.desc}`)
      continue
    }

    // 在实际修改的字符串上执行替换
    const before = modified
    modified = modified.replace(rule.match, rule.replace)

    if (before !== modified) {
      const removedLines = rule.match.source.length > 0
        ? (testMatch[0].split('\n').length - (rule.replace ? rule.replace.split('\n').length : 0))
        : 0
      console.log(`  ✅ ${rule.desc}  (约 ${removedLines} 行)`)
      fileMatched++
      totalMatched++
    } else {
      console.log(`  ⚠️  替换无变化: ${rule.desc}`)
    }
  }

  if (modified !== original) {
    totalFiles++
    const oldLines = original.split('\n').length
    const newLines = modified.split('\n').length
    console.log(`  📊 行数: ${oldLines} → ${newLines} (减少 ${oldLines - newLines})`)

    if (!DRY_RUN) {
      const backupPath = absPath + '.bak.' + Date.now()
      fs.writeFileSync(backupPath, original, 'utf-8')
      fs.writeFileSync(absPath, modified, 'utf-8')
      console.log(`  💾 已写入（备份: ${path.basename(backupPath)}）`)
    }
  } else {
    console.log(`  ✅ 无变化`)
  }
}

console.log('\n' + '='.repeat(60))
if (DRY_RUN) {
  console.log(`📊 预览: ${totalFiles} 个文件会被修改，${totalMatched}/${totalRules} 条规则命中`)
  console.log(`\n💡 去掉 --dry-run 或加 --apply 实际执行：`)
  console.log(`   node tools/remove-dead-code.mjs --apply`)
} else {
  console.log(`📊 完成: ${totalFiles} 个文件已修改，${totalMatched}/${totalRules} 条规则命中`)
  console.log(`\n💡 如需回滚，从对应的 .bak.<timestamp> 文件恢复`)
}
console.log('='.repeat(60) + '\n')