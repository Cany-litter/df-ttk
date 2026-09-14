/**
 * 子弹数据结构迁移脚本 v2
 * 
 * 功能：
 * 1. base → partMult（全设 base 的值）
 * 2. default → isDefault（字段名替换）
 * 3. isDefault 唯一性校验（同 caliber+level 只保留序号最小的）
 * 4. 删除 base / stMult 字段
 * 5. 清空所有 cache（计算逻辑变了）
 * 
 * 用法：
 *   node migrate-bullet-v2.js --dry-run   （只预览，不写文件）
 *   node migrate-bullet-v2.js             （正式执行）
 * 
 * 注意：
 * - 脚本会先备份到 public/data.backup.${timestamp}.json
 * - 迁移后所有 cache 失效，首次计算会慢（正常）
 * - 建议先 --dry-run 预览，确认无误再正式跑
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATA_PATH = path.join(__dirname, 'public', 'data.json')
const BACKUP_PATH = path.join(__dirname, 'public', `data.backup.${Date.now()}.json`)

const isDryRun = process.argv.includes('--dry-run')

// ============================================================
// 工具函数
// ============================================================

/**
 * 从 ID 里提取序号（用于同组默认子弹的排序）
 */
function extractIndexFromId(id) {
  const match = String(id || '').match(/#(\d+)$/)
  return match ? parseInt(match[1], 10) : 999999
}

/**
 * 校验并规范化 partMult
 */
function normalizePartMult(raw) {
  const fallback = { head: 1, chest: 1, stomach: 1, limbs: 1 }
  if (!raw || typeof raw !== 'object') return fallback

  const result = { ...fallback }
  for (const key of ['head', 'chest', 'stomach', 'limbs']) {
    const v = raw[key]
    if (typeof v === 'number' && isFinite(v)) {
      result[key] = v
    }
  }
  return result
}

// ============================================================
// 主流程
// ============================================================

function main() {
  console.log('═'.repeat(70))
  console.log('🔧 子弹数据结构迁移脚本 v2')
  console.log('   模式：' + (isDryRun ? 'DRY RUN（只预览）' : '正式执行'))
  console.log('═'.repeat(70))
  console.log('')

  // ---------- 1. 读数据 ----------
  if (!fs.existsSync(DATA_PATH)) {
    console.error(`❌ 找不到文件: ${DATA_PATH}`)
    process.exit(1)
  }

  const rawData = fs.readFileSync(DATA_PATH, 'utf-8')

  let data
  try {
    data = JSON.parse(rawData)
  } catch (e) {
    console.error('❌ data.json 解析失败:', e.message)
    process.exit(1)
  }

  if (!Array.isArray(data.bullets) || data.bullets.length === 0) {
    console.error('❌ data.bullets 为空，无法迁移')
    process.exit(1)
  }

  console.log('📂 读取文件:', DATA_PATH)
  console.log('   武器:', data.weapons?.length || 0)
  console.log('   子弹:', data.bullets.length)
  console.log('   价格配置:', data.prices?.length || 0)
  console.log('   护甲:', data.armors?.length || 0)
  console.log('')

  // ---------- 2. base → partMult ----------
  console.log('📝 Step 1: base → partMult')
  let baseConverted = 0
  let baseAbsent = 0

  for (const bullet of data.bullets) {
    const oldBase = bullet.base
    if (oldBase !== undefined) {
      const val = typeof oldBase === 'number' && isFinite(oldBase) ? oldBase : 1
      bullet.partMult = normalizePartMult({
        head: val,
        chest: val,
        stomach: val,
        limbs: val
      })
      baseConverted++
    } else if (!bullet.partMult) {
      // 没有 base 也没有 partMult，补默认
      bullet.partMult = { head: 1, chest: 1, stomach: 1, limbs: 1 }
      baseAbsent++
    } else {
      // 已有 partMult，规范化
      bullet.partMult = normalizePartMult(bullet.partMult)
    }

    // 删除 base 字段
    if (bullet.base !== undefined) {
      delete bullet.base
    }
  }

  console.log(`   ✅ 从 base 转换: ${baseConverted}`)
  console.log(`   ✅ 缺失补默认: ${baseAbsent}`)
  console.log('')

  // ---------- 3. 删除 stMult ----------
  console.log('📝 Step 2: 删除 stMult')
  let stMultRemoved = 0

  for (const bullet of data.bullets) {
    if (bullet.stMult !== undefined) {
      delete bullet.stMult
      stMultRemoved++
    }
  }

  console.log(`   ✅ 删除 stMult: ${stMultRemoved}`)
  console.log('')

  // ---------- 4. default → isDefault ----------
  console.log('📝 Step 3: default → isDefault')
  let defaultRenamed = 0

  for (const bullet of data.bullets) {
    if (bullet.default !== undefined) {
      bullet.isDefault = bullet.default === true
      delete bullet.default
      defaultRenamed++
    }
    // 确保 isDefault 存在
    if (bullet.isDefault === undefined) {
      bullet.isDefault = false
    }
  }

  console.log(`   ✅ 重命名字段: ${defaultRenamed}`)
  console.log('')

  // ---------- 5. isDefault 唯一性校验 ----------
  console.log('📝 Step 4: isDefault 唯一性校验')
  console.log('')

  // 按 caliber + level 分组
  const groups = new Map()
  for (const bullet of data.bullets) {
    const key = `${bullet.caliber}|${bullet.level}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(bullet)
  }

  let defaultSet = 0
  let defaultCleared = 0
  let multiBulletGroups = 0

  for (const [key, bullets] of groups.entries()) {
    // 按 ID 序号排序（序号最小的优先）
    bullets.sort((a, b) => extractIndexFromId(a.id) - extractIndexFromId(b.id))

    if (bullets.length > 1) {
      multiBulletGroups++
      console.log(`   ${key} (${bullets.length} 颗):`)
    }

    // 找到第一个 isDefault: true 的
    let firstDefault = bullets.find(b => b.isDefault === true)

    // 如果没有默认，取序号最小的
    if (!firstDefault) {
      firstDefault = bullets[0]
      firstDefault.isDefault = true
      defaultSet++
      if (bullets.length > 1) {
        console.log(`      ⭐ ${firstDefault.id} (${firstDefault.name}) → 自动设为默认`)
      }
    } else {
      if (bullets.length > 1) {
        console.log(`      ⭐ ${firstDefault.id} (${firstDefault.name}) → 保持默认`)
      }
    }

    // 其他子弹取消默认
    for (const b of bullets) {
      if (b !== firstDefault && b.isDefault === true) {
        b.isDefault = false
        defaultCleared++
        if (bullets.length > 1) {
          console.log(`      ○ ${b.id} (${b.name}) → 取消默认`)
        }
      }
    }
  }

  console.log('')
  console.log(`   ✅ 自动设默认: ${defaultSet}`)
  console.log(`   ✅ 取消多余默认: ${defaultCleared}`)
  console.log(`   ✅ 多子弹组: ${multiBulletGroups}`)
  console.log('')

  // ---------- 6. 清空所有 cache ----------
  console.log('📝 Step 5: 清空所有 cache')
  let clearedCaches = 0

  for (const price of data.prices || []) {
    for (const config of price.configs || []) {
      if (config.cache) {
        delete config.cache
        clearedCaches++
      }
    }
  }

  console.log(`   ✅ 清空缓存: ${clearedCaches}`)
  console.log('')

  // ---------- 7. 统计 ----------
  console.log('═'.repeat(70))
  console.log('📊 迁移统计')
  console.log('═'.repeat(70))
  console.log(`   子弹总数:         ${data.bullets.length}`)
  console.log(`   base → partMult:  ${baseConverted}`)
  console.log(`   缺失补默认:       ${baseAbsent}`)
  console.log(`   删除 stMult:      ${stMultRemoved}`)
  console.log(`   重命名 default:   ${defaultRenamed}`)
  console.log(`   自动设默认:       ${defaultSet}`)
  console.log(`   取消多余默认:     ${defaultCleared}`)
  console.log(`   清空缓存:         ${clearedCaches}`)
  console.log('')

  // ---------- 8. 预览示例 ----------
  console.log('📋 迁移后示例（前 3 颗子弹）:')
  console.log('')
  for (const bullet of data.bullets.slice(0, 3)) {
    console.log(`   ${bullet.id}`)
    console.log(`     name:      ${bullet.name}`)
    console.log(`     caliber:   ${bullet.caliber}`)
    console.log(`     level:     ${bullet.level}`)
    console.log(`     partMult:  ${JSON.stringify(bullet.partMult)}`)
    console.log(`     isDefault: ${bullet.isDefault}`)
    console.log(`     price:     ${bullet.price}`)
    console.log('')
  }

  // ---------- 9. 写回 ----------
  if (isDryRun) {
    console.log('═'.repeat(70))
    console.log('🔍 DRY RUN 模式，未写入文件')
    console.log('   如需正式执行，运行: node migrate-bullet-v2.js')
    console.log('═'.repeat(70))
    return
  }

  // 备份
  try {
    fs.writeFileSync(BACKUP_PATH, rawData, 'utf-8')
    console.log(`💾 备份: ${BACKUP_PATH}`)
  } catch (e) {
    console.error('❌ 备份失败:', e.message)
    console.error('   已中止迁移，未修改原文件')
    process.exit(1)
  }

  // 写入
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8')
    console.log(`💾 写入: ${DATA_PATH}`)
  } catch (e) {
    console.error('❌ 写入失败:', e.message)
    console.error(`   原文件未修改，可从备份恢复: ${BACKUP_PATH}`)
    process.exit(1)
  }

  console.log('')
  console.log('═'.repeat(70))
  console.log('✅ 迁移完成')
  console.log('═'.repeat(70))
  console.log('')
  console.log('📋 后续步骤:')
  console.log('   1. 替换代码文件（DataManager / BulletTable / BulletStrategy / CombatUtils）')
  console.log('   2. 递增 CACHE_VERSION（4 → 5）')
  console.log('   3. 刷新浏览器，确认页面正常')
  console.log('   4. 检查子弹表显示（默认列 + 4 个部位输入框）')
  console.log('   5. 点「计算 TTK」，确认能算出结果')
  console.log('')
}

main()