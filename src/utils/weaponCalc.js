// src/utils/weaponCalc.js
import { getDataManager } from '@/core/DataManager'

/**
 * 武器当前属性计算工具
 * 
 * 职责：根据武器基础属性 + 枪管 + 枪口 + 精校，计算"应用附件后"的当前属性
 * 
 * 用途：
 * - App.vue 的 buildArmedWeapons（批量计算）
 * - DamageDetailModal.vue（单次模拟弹窗）
 * - WeaponTable.vue（表格预览）
 * 
 * ⭐ 合并规则（所有"枪管可覆盖"的字段）：
 *    枪管字段 > 武器字段 > null
 *    涉及的字段包括：
 *    - 连发字段：fireMode / burstCount / burstInternalROF / burstInterval
 *    - 分段射速：rofStages
 * 
 * ⭐ 初速公式（对齐旧版本口径）：
 *    初速 = (原始初速 + velocityAdd) × rangeMult × (1 + 枪口mult) × (1 + 精校)
 *    其中 rangeMult = 枪管射程倍率 + 枪口射程加成
 * 
 *    示例：AS Val + VSS海啸长枪管组合 + 无枪口 + 精校9%
 *      原始初速 330，rangeMult 1.3
 *      velocityMult = 1.3 × 1.0 × 1.09 = 1.417
 *      初速 = 330 × 1.417 = 467.61 → 468
 * 
 *    示例：AS Val + 刺客高级枪管（velocityAdd: 120）+ 无枪口 + 精校9%
 *      原始初速 330，rangeMult 1.0，velocityAdd 120
 *      velocityMult = 1.0 × 1.0 × 1.09 = 1.09
 *      初速 = (330 + 120) × 1.09 = 490.5 → 491
 */

/**
 * 计算应用枪管 / 枪口 / 精校后的武器当前属性
 * 
 * @param {Object} weapon - 武器对象（原始数据，含 mult / ranges / decays 等）
 * @param {Object|null} barrel - 枪管对象（null 表示"无"）
 * @param {number} muzzleId - 枪口 ID（0 = 无）
 * @param {number} precision - 精校值（范围 -0.09 ~ 0.09，默认 0.09）
 * @returns {Object} {
 *   rof,               // 当前射速
 *   velocity,          // 当前初速
 *   ranges,            // 当前射程数组
 *   decays,            // 当前衰减数组
 *   flesh,             // 当前肉伤
 *   armor,             // 当前甲伤
 *   mult,              // 当前部位倍率对象
 *   fireMode,          // 开火模式：'auto' | 'burst' | null
 *   burstCount,        // 连发数（如 3、4）
 *   burstInternalROF,  // 连发内射速
 *   burstInterval,     // 连发间隔（秒）
 *   rofStages,         // 分段射速：[{ untilShot, rofAdd }, ...] 或 null
 * }
 */
export function calculateCurrentValues(weapon, barrel, muzzleId, precision) {
  const dm = getDataManager()

  // ============================================================
  // 1. 获取枪口加成
  // ============================================================
  let muzzleRangeMult = 0
  let muzzleVelocityMult = 1.0

  if (dm && typeof dm.getMuzzleBonuses === 'function') {
    const bonuses = dm.getMuzzleBonuses(muzzleId)
    muzzleRangeMult = bonuses.rangeMult || 0
    muzzleVelocityMult = bonuses.velocityMult || 1.0
  }

  // ============================================================
  // 2. 计算射程倍率（枪管射程倍率 + 枪口射程加成）
  // ============================================================
  let rangeMult = 1.0
  if (barrel) {
    const hasRangeAdd = typeof barrel.rangeAdd === 'number' && barrel.rangeAdd !== 0
    if (hasRangeAdd) {
      rangeMult = 1.0
    } else {
      rangeMult = barrel.rangeMult ?? 1.0
    }
  }
  rangeMult += muzzleRangeMult

  if (!isFinite(rangeMult) || isNaN(rangeMult)) {
    rangeMult = 1.0
  }

  // ============================================================
  // 3. ⭐ 计算初速倍率
  //    = rangeMult × 枪口初速倍率 × (1 + 精校)
  // ============================================================
  let velocityMult = rangeMult * muzzleVelocityMult * (1 + precision)
  if (!isFinite(velocityMult) || isNaN(velocityMult)) {
    velocityMult = 1.0
  }

  // ============================================================
  // 4. 枪管其他加成
  // ============================================================
  let rofMult = barrel ? (barrel.rofMult ?? 1.0) : 1.0
  let damageBonus = barrel && barrel.damageBonus !== undefined ? barrel.damageBonus : 0
  let armorDamageBonus = barrel && barrel.armorDamageBonus !== undefined ? barrel.armorDamageBonus : 0

  // ============================================================
  // 5. 部位倍率加成
  // ============================================================
  const partAdd = barrel && barrel.partMultAdd ? barrel.partMultAdd : null
  const newMult = { ...weapon.mult }
  if (partAdd) {
    for (const k in partAdd) {
      newMult[k] = (newMult[k] ?? 1) + partAdd[k]
    }
  }

  // ============================================================
  // 6. 计算当前射程
  // ============================================================
  let newRanges
  if (barrel && Array.isArray(barrel.ranges) && barrel.ranges.length > 0) {
    newRanges = barrel.ranges
  } else {
    const hasRangeAdd = barrel && typeof barrel.rangeAdd === 'number' && barrel.rangeAdd !== 0
    const rangeAddValue = hasRangeAdd ? barrel.rangeAdd : 0
    newRanges = (weapon.ranges || [40, 70, Infinity, Infinity]).map(r => {
      if (r === Infinity) return Infinity
      return Math.round(r * rangeMult + rangeAddValue)
    })
  }

  // ============================================================
  // 7. 计算当前初速
  //    初速 = (原始初速 + velocityAdd) × velocityMult
  //    其中 velocityMult 已包含 rangeMult
  // ============================================================
  const hasVelocityAdd = barrel && typeof barrel.velocityAdd === 'number'
  let newVelocity = hasVelocityAdd
    ? Math.round(((weapon.velocity || 500) + barrel.velocityAdd) * velocityMult)
    : Math.round((weapon.velocity || 500) * velocityMult)

  if (!isFinite(newVelocity) || isNaN(newVelocity) || newVelocity <= 0) {
    newVelocity = weapon.velocity || 500
  }

  // ============================================================
  // 8. 计算当前射速、肉伤、甲伤
  // ============================================================
  let rof = Math.round((weapon.rof || 600) * rofMult * 100) / 100
  if (!isFinite(rof) || isNaN(rof) || rof <= 0) {
    rof = weapon.rof || 600
  }

  let flesh = Math.round(((weapon.flesh || 30) + damageBonus) * 10) / 10
  if (!isFinite(flesh) || isNaN(flesh)) {
    flesh = weapon.flesh || 30
  }

  let armor = Math.round(((weapon.armor || 35) + armorDamageBonus) * 10) / 10
  if (!isFinite(armor) || isNaN(armor)) {
    armor = weapon.armor || 35
  }

  // ============================================================
  // 9. 计算当前衰减
  // ============================================================
  let newDecays
  if (barrel && Array.isArray(barrel.decays) && barrel.decays.length > 0) {
    newDecays = barrel.decays
  } else {
    newDecays = weapon.decays || [1, 0.9, 0.75, 0.75, 0.75]
  }

  // ============================================================
  // 10. 连发字段合并（枪管 > 武器）
  // ============================================================
  const fireMode = barrel?.fireMode ?? weapon.fireMode ?? null
  const burstCount = barrel?.burstCount ?? weapon.burstCount ?? null
  const burstInternalROF = barrel?.burstInternalROF ?? weapon.burstInternalROF ?? null
  const burstInterval = barrel?.burstInterval ?? weapon.burstInterval ?? null

  // ============================================================
  // 11. 分段射速合并（枪管 > 武器）
  // ============================================================
  const rawRofStages = barrel?.rofStages ?? weapon.rofStages ?? null
  const rofStages = Array.isArray(rawRofStages)
    ? rawRofStages.map(stage => ({ ...stage }))
    : null

  return {
    rof,
    velocity: newVelocity,
    ranges: newRanges,
    decays: newDecays,
    flesh,
    armor,
    mult: newMult,
    // 连发字段
    fireMode,
    burstCount,
    burstInternalROF,
    burstInterval,
    // 分段射速
    rofStages
  }
}