import { HIT_KEYS, HIT_PROB_TOLERANCE } from '../core/config.js';

/**
 * 校验命中概率之和是否为 1
 * @param {Object} params - 包含 hitProb 对象的参数
 * @returns {boolean} 验证是否通过
 * @throws {Error} 当命中概率总和不为1时抛出错误
 */
export function validateHitProb(params) {
  const sum = HIT_KEYS.reduce((s, k) => s + params.hitProb[k], 0);
  if (Math.abs(sum - 1) > HIT_PROB_TOLERANCE) {
    throw new Error('命中率总和必须为 1！');
  }
  return true;
}

/**
 * 🔥 验证距离-命中率映射字符串格式
 * @param {string} hitRateRaw - 格式 "30:0.85,50:0.8,100:0.7"
 * @returns {boolean} 验证是否通过
 * @throws {Error} 当格式无效时抛出错误
 */
export function validateHitRateMap(hitRateRaw) {
  if (!hitRateRaw || hitRateRaw.trim() === '') {
    throw new Error('全局命中率不能为空，请使用格式: 距离:命中率,距离:命中率');
  }
  
  const parts = hitRateRaw.split(',').map(p => p.trim());
  if (parts.length === 0) {
    throw new Error('全局命中率格式无效，请使用格式: 距离:命中率,距离:命中率');
  }
  
  for (const part of parts) {
    const [dist, rate] = part.split(':');
    if (!dist || !rate) {
      throw new Error(`全局命中率格式无效: "${part}"，应为 "距离:命中率"`);
    }
    
    const distance = parseFloat(dist);
    const hitRate = parseFloat(rate);
    
    if (isNaN(distance) || distance < 0) {
      throw new Error(`距离必须为正数: "${dist}"`);
    }
    
    if (isNaN(hitRate) || hitRate < 0 || hitRate > 1) {
      throw new Error(`命中率必须在 0 到 1 之间: "${rate}"`);
    }
  }
  
  return true;
}

/**
 * 校验武器命中率是否在有效范围内
 * @param {Array} attachments - 武器附件配置数组
 * @param {Array} weapons - 武器数据数组
 * @returns {boolean} 验证是否通过
 * @throws {Error} 当命中率超出范围时抛出错误
 */
export function validateWeaponHitRates(attachments, weapons) {
  for (let i = 0; i < attachments.length; i++) {
    const { hitRate } = attachments[i];
    if (hitRate != null && (hitRate < 0 || hitRate > 1)) {
      throw new Error(`${weapons[i].name} 的命中率必须在 0 到 1 之间`);
    }
  }
  return true;
}

/**
 * 验证页面参数的有效性
 * @param {Object} params - 页面参数
 * @returns {boolean} 验证是否通过
 * @throws {Error} 当参数无效时抛出错误
 */
export function validatePageParams(params) {
  // 验证距离
  if (params.distance < 0) {
    throw new Error('距离不能为负数');
  }

  // 验证护甲值
  if (params.armorValue < 0 || params.armorValue > 200) {
    throw new Error('护甲值必须在 0 到 200 之间');
  }

  // 验证头盔值
  if (params.helmetValue < 0 || params.helmetValue > 100) {
    throw new Error('头盔值必须在 0 到 100 之间');
  }

  // 🔥 验证全局命中率映射（如果存在）
  if (params.hitRateMap !== undefined) {
    if (!Array.isArray(params.hitRateMap) || params.hitRateMap.length === 0) {
      throw new Error('全局命中率映射不能为空，请配置至少一个距离-命中率对');
    }
    for (const entry of params.hitRateMap) {
      if (entry.distance < 0) {
        throw new Error(`距离 ${entry.distance} 不能为负数`);
      }
      if (entry.rate < 0 || entry.rate > 1) {
        throw new Error(`命中率 ${entry.rate} 必须在 0 到 1 之间`);
      }
    }
  }

  // 验证子弹等级
  if (![1, 2, 3, 4, 5].includes(params.bulletLevel)) {
    throw new Error('子弹等级必须是 1-5 之间的整数');
  }

  // 验证护甲等级
  if (![1, 2, 3, 4, 5, 6].includes(params.armorLevel)) {
    throw new Error('护甲等级必须是 1-6 之间的整数');
  }

  // 验证头盔等级
  if (![1, 2, 3, 4, 5, 6].includes(params.helmetLevel)) {
    throw new Error('头盔等级必须是 1-6 之间的整数');
  }

  return true;
}