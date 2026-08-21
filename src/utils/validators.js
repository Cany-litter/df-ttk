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

  // 验证命中率
  if (params.hitRate < 0 || params.hitRate > 1) {
    throw new Error('命中率必须在 0 到 1 之间');
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

/**
 * 验证改枪配置的有效性
 * @param {Object} config - 改枪配置对象
 * @returns {boolean} 验证是否通过
 * @throws {Error} 当配置无效时抛出错误
 */
export function validateConfig(config) {
  if (!config) {
    throw new Error('改枪配置不能为空');
  }

  // 验证价格
  if (config.price !== undefined && (config.price < 0 || isNaN(config.price))) {
    throw new Error('价格必须为非负数字');
  }

  // 验证改枪码
  if (config.code !== undefined && typeof config.code !== 'string') {
    throw new Error('改枪码必须为字符串');
  }

  // 验证子弹类型
  if (config.bulletType !== undefined && config.bulletType === '') {
    throw new Error('子弹类型不能为空');
  }

  // 验证携带数量
  if (config.ammoCount !== undefined && (config.ammoCount < 0 || isNaN(config.ammoCount))) {
    throw new Error('携带数量必须为非负数字');
  }

  // 验证精校值
  if (config.precision !== undefined && (config.precision < -0.09 || config.precision > 0.09)) {
    throw new Error('精校值必须在 -0.09 到 0.09 之间');
  }

  // 验证枪管索引
  if (config.selectedBarrel !== undefined && config.selectedBarrel < 0) {
    throw new Error('枪管索引不能为负数');
  }

  // 验证枪口索引
  if (config.selectedMuzzle !== undefined && config.selectedMuzzle < 0) {
    throw new Error('枪口索引不能为负数');
  }

  // 验证命中率点
  if (config.hitRatePoints !== undefined) {
    if (!Array.isArray(config.hitRatePoints)) {
      throw new Error('命中率点必须为数组');
    }
    if (config.hitRatePoints.length > 3) {
      throw new Error('最多配置3个命中率点');
    }
    for (const point of config.hitRatePoints) {
      if (point.distance === undefined || point.distance < 0) {
        throw new Error('命中率点的距离必须为非负数字');
      }
      if (point.rate === undefined || point.rate < 0 || point.rate > 1) {
        throw new Error('命中率点的命中率必须在 0 到 1 之间');
      }
    }
  }

  return true;
}

/**
 * 验证武器数据的完整性
 * @param {Object} weapon - 武器对象
 * @returns {boolean} 验证是否通过
 * @throws {Error} 当武器数据不完整时抛出错误
 */
export function validateWeaponData(weapon) {
  if (!weapon) {
    throw new Error('武器数据不能为空');
  }

  // 验证必填字段
  if (!weapon.name || typeof weapon.name !== 'string') {
    throw new Error('武器名称必须为非空字符串');
  }

  if (weapon.rof === undefined || isNaN(weapon.rof) || weapon.rof <= 0) {
    throw new Error('射速必须为正数');
  }

  if (weapon.velocity === undefined || isNaN(weapon.velocity) || weapon.velocity <= 0) {
    throw new Error('初速必须为正数');
  }

  if (weapon.flesh === undefined || isNaN(weapon.flesh) || weapon.flesh <= 0) {
    throw new Error('基础伤害必须为正数');
  }

  if (weapon.armor === undefined || isNaN(weapon.armor) || weapon.armor < 0) {
    throw new Error('护甲伤害必须为非负数');
  }

  // 验证射程
  if (!Array.isArray(weapon.ranges) || weapon.ranges.length !== 4) {
    throw new Error('射程必须为包含4个元素的数组');
  }

  // 验证衰减
  if (!Array.isArray(weapon.decays) || weapon.decays.length !== 5) {
    throw new Error('衰减必须为包含5个元素的数组');
  }

  // 验证部位倍率
  if (!weapon.mult || typeof weapon.mult !== 'object') {
    throw new Error('部位倍率必须为对象');
  }
  const requiredParts = ['head', 'chest', 'stomach', 'limbs'];
  for (const part of requiredParts) {
    if (weapon.mult[part] === undefined || isNaN(weapon.mult[part]) || weapon.mult[part] <= 0) {
      throw new Error(`部位倍率 ${part} 必须为正数`);
    }
  }

  // 验证改枪配置
  if (weapon.configs !== undefined) {
    if (!Array.isArray(weapon.configs) || weapon.configs.length === 0) {
      throw new Error('至少需要一个改枪配置');
    }
    for (const config of weapon.configs) {
      validateConfig(config);
    }
  }

  return true;
}