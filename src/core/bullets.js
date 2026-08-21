// src/core/bullets.js

/**
 * 子弹数据
 * 
 * 数据结构说明：
 * - 常规口径: { 口径名称: { name, levels: { 等级: { base, armorDamage, penLevels } } } }
 * - 特殊子弹: { 子弹名称: { name, type, level, base, armorDamage, penLevels, specialNote, ... } }
 * 
 * 字段说明：
 * - base: 基础伤害比例 (1.0 = 100%)
 * - armorDamage: 护甲伤害衰减 (1~6级数组)，影响护甲消耗
 * - penLevels: 护甲穿透水平 (1~6级数组)，影响肉体伤害留存比例
 * 
 * 穿透机制：
 * - penLevels 数组索引0~5对应护甲等级1~6
 * - 值表示子弹对该等级护甲的肉体伤害留存比例
 * - 例如 Lv.4 子弹: [100%, 100%, 100%, 100%, 75%, 50%]
 *   表示对1~4级护甲造成100%肉体伤害，对5级护甲造成75%，对6级护甲造成50%
 * 
 * 特殊子弹机制：
 * - RIP/CT: 全算四肢，无视护甲 (penLevels全为0)
 * - 双头弹: 固定肉伤74，甲伤11，钝伤机制(5甲40%,6甲30%)
 * - 高穿弹: 使用常规穿透机制，但等级高
 */

// ==================== 常规口径数据 ====================

const createLevels = (baseValues) => ({
  1: {
    base: baseValues[0] || 1.10,
    // 护甲伤害衰减 (1~6级) - 影响护甲消耗
    armorDamage: [0.60, 0.60, 0.40, 0.30, 0.20, 0.20],
    // 护甲穿透水平 (1~6级) - 影响肉体伤害留存
    // Lv.1: 对1级100%, 2级75%, 3级50%, 4级0%, 5级0%, 6级0%
    penLevels: [1.00, 0.75, 0.50, 0.00, 0.00, 0.00]
  },
  2: {
    base: baseValues[1] || 1.10,
    armorDamage: [0.70, 0.70, 0.70, 0.50, 0.40, 0.30],
    // Lv.2: 对1级100%, 2级100%, 3级75%, 4级50%, 5级0%, 6级0%
    penLevels: [1.00, 1.00, 0.75, 0.50, 0.00, 0.00]
  },
  3: {
    base: baseValues[2] || 1.00,
    armorDamage: [0.90, 0.90, 0.90, 0.90, 0.50, 0.40],
    // Lv.3: 对1级100%, 2级100%, 3级100%, 4级75%, 5级50%, 6级0%
    penLevels: [1.00, 1.00, 1.00, 0.75, 0.50, 0.00]
  },
  4: {
    base: baseValues[3] || 1.00,
    armorDamage: [1.00, 1.00, 1.00, 1.00, 1.00, 0.60],
    // Lv.4: 对1级100%, 2级100%, 3级100%, 4级100%, 5级75%, 6级50%
    penLevels: [1.00, 1.00, 1.00, 1.00, 0.75, 0.50]
  },
  5: {
    base: baseValues[4] || 1.00,
    armorDamage: [1.10, 1.10, 1.10, 1.10, 1.10, 1.10],
    // Lv.5: 对1级100%, 2级100%, 3级100%, 4级100%, 5级100%, 6级75%
    penLevels: [1.00, 1.00, 1.00, 1.00, 1.00, 0.75]
  },
});

/**
 * 子弹数据主对象
 */
export const bulletData = {
  // ========== 步枪口径 ==========
  '5.45x39': {
    name: '5.45×39',
    levels: createLevels([1.10, 1.10, 1.00, 1.00, 1.00]),
  },
  '5.56x45': {
    name: '5.56×45',
    levels: createLevels([1.10, 1.10, 1.00, 1.00, 1.00]),
  },
  // ========== 新增: 5.8×42 (中国制式步枪口径) ==========
  '5.8x42': {
    name: '5.8×42',
    levels: createLevels([1.10, 1.10, 1.00, 1.00, 1.00]),
  },
  '7.62x39': {
    name: '7.62×39',
    levels: createLevels([1.10, 1.10, 1.00, 1.00, 1.00]),
  },
  '7.62x51': {
    name: '7.62×51',
    levels: createLevels([1.10, 1.10, 1.00, 1.00, 1.00]),
  },
  '7.62x54R': {
    name: '7.62×54R',
    levels: createLevels([1.10, 1.10, 1.00, 1.00, 1.00]),
  },
  // ========== 新增: 6.8×51 (M7/RM277/M250 通用) ==========
  '6.8x51': {
    name: '6.8×51',
    levels: createLevels([1.10, 1.10, 1.00, 1.00, 1.00]),
  },
  // ========== 新增: 9×39 (AS Val/SR-3M 亚音速重弹) ==========
  '9x39': {
    name: '9×39',
    levels: createLevels([1.10, 1.10, 1.00, 1.00, 1.00]),
  },

  // ========== 冲锋枪/手枪口径 ==========
  '9x19': {
    name: '9×19',
    levels: createLevels([1.10, 1.10, 1.00, 1.00, 1.00]),
  },
  '.45ACP': {
    name: '.45 ACP',
    levels: createLevels([1.10, 1.10, 1.00, 1.00, 1.00]),
  },
  '.300BLK': {
    name: '.300 BLK',
    levels: createLevels([1.10, 1.10, 1.00, 1.00, 1.00]),
  },
  '4.6x30': {
    name: '4.6×30',
    levels: createLevels([1.10, 1.10, 1.00, 1.00, 1.00]),
  },
  '5.7x28': {
    name: '5.7×28',
    levels: createLevels([1.10, 1.10, 1.00, 1.00, 1.00]),
  },

  // ========== 狙击/机枪口径 ==========
  '12.7x55': {
    name: '12.7×55',
    levels: createLevels([1.10, 1.10, 1.00, 1.00, 1.00]),
  },
  '.338NM': {
    name: '.338 NM',
    levels: createLevels([1.10, 1.10, 1.00, 1.00, 1.00]),
  },

  // ==================== 特殊子弹 ====================

  // ---- RIP系列 (全算四肢，无视护甲) ----
  '9x19-RIP': {
    name: '9×19 RIP',
    type: 'rip',
    level: 3,
    base: 1.40,
    armorDamage: [0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
    penLevels: [0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
    specialNote: 'RIP: 全算四肢，无视护甲',
  },
  '9x19-CT': {
    name: '9×19 CT',
    type: 'ct',
    level: 4,
    base: 1.35,
    armorDamage: [0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
    penLevels: [0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
    specialNote: 'CT: 全算四肢，无视护甲',
  },
  '.45ACP-RIP': {
    name: '.45 ACP RIP',
    type: 'rip',
    level: 3,
    base: 1.35,
    armorDamage: [0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
    penLevels: [0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
    specialNote: 'RIP: 全算四肢，无视护甲',
  },

  // ---- 双头弹 (固定伤害 + 钝伤机制) ----
  '12.7x55-Double': {
    name: '12.7×55 双头弹',
    type: 'double',
    level: 4,
    base: 1.00,
    armorDamage: [0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
    penLevels: [0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
    specialNote: '双头弹: 肉伤74，甲伤11 | 钝伤: 5甲40%, 6甲30%',
    fixedFleshDamage: 74,
    fixedArmorDamage: 11,
    bluntDamage: { 5: 0.40, 6: 0.30 },
  },

  // ---- 高穿弹 (高穿透) ----
  '7.62x51-M61': {
    name: '7.62×51 M61',
    type: 'highPen',
    level: 5,
    base: 1.00,
    armorDamage: [1.20, 1.20, 1.20, 1.20, 1.20, 1.20],
    penLevels: [1.00, 1.00, 1.00, 1.00, 1.00, 1.00],
    specialNote: 'M61: 高穿透弹',
  },
  '7.62x39-AP': {
    name: '7.62×39 AP',
    type: 'highPen',
    level: 5,
    base: 1.00,
    armorDamage: [1.10, 1.10, 1.10, 1.10, 1.10, 1.10],
    penLevels: [1.00, 1.00, 1.00, 1.00, 1.00, 1.00],
    specialNote: 'AP: 高穿透弹',
  },
  '9x19-BT+P': {
    name: '9×19 BT+P',
    type: 'highPen',
    level: 4,
    base: 1.10,
    armorDamage: [1.00, 1.00, 1.00, 1.00, 1.00, 0.60],
    penLevels: [1.00, 1.00, 1.00, 1.00, 0.75, 0.50],
    specialNote: 'BT+P: 高穿透弹',
  },
  '.45ACP-SUPER': {
    name: '.45 ACP SUPER',
    type: 'highPen',
    level: 4,
    base: 0.85,
    armorDamage: [1.10, 1.10, 1.10, 1.10, 1.10, 0.60],
    penLevels: [1.00, 1.00, 1.00, 1.00, 0.75, 0.50],
    specialNote: 'SUPER: 高穿透弹',
  },
};

// ==================== 工具函数 ====================

/**
 * 获取口径数据
 * @param {string} caliber - 口径名称 (如 '5.45x39')
 * @returns {Object|null} 口径数据对象
 */
export function getCaliberData(caliber) {
  return bulletData[caliber] || null;
}

/**
 * 获取子弹等级数据
 * @param {string} caliber - 口径名称
 * @param {number} level - 等级 (1-5)
 * @returns {Object|null} 等级数据对象 { base, armorDamage, penLevels }
 */
export function getBulletLevelData(caliber, level) {
  const caliberData = getCaliberData(caliber);
  if (!caliberData || !caliberData.levels) return null;
  return caliberData.levels[level] || null;
}

/**
 * 获取特殊子弹数据
 * @param {string} bulletName - 特殊子弹名称 (如 '9x19-RIP')
 * @returns {Object|null} 特殊子弹数据对象
 */
export function getSpecialBulletData(bulletName) {
  const data = bulletData[bulletName];
  if (data && data.type) {
    return data;
  }
  return null;
}

/**
 * 检查子弹是否为特殊子弹
 * @param {string} bulletKey - 子弹key
 * @returns {boolean} 是否为特殊子弹
 */
export function isSpecialBullet(bulletKey) {
  const data = bulletData[bulletKey];
  return data && data.type !== undefined && data.type !== null;
}

/**
 * 检查子弹是否为RIP/CT类型
 * @param {string} bulletKey - 子弹key
 * @returns {boolean} 是否为RIP/CT
 */
export function isRipBullet(bulletKey) {
  const data = bulletData[bulletKey];
  return data && (data.type === 'rip' || data.type === 'ct');
}

/**
 * 检查子弹是否为双头弹
 * @param {string} bulletKey - 子弹key
 * @returns {boolean} 是否为双头弹
 */
export function isDoubleBullet(bulletKey) {
  const data = bulletData[bulletKey];
  return data && data.type === 'double';
}

/**
 * 检查子弹是否为高穿透弹
 * @param {string} bulletKey - 子弹key
 * @returns {boolean} 是否为高穿透弹
 */
export function isHighPenBullet(bulletKey) {
  const data = bulletData[bulletKey];
  return data && data.type === 'highPen';
}

/**
 * 获取所有口径列表 (不包括特殊子弹)
 * @returns {string[]} 口径名称数组
 */
export function getAllCalibers() {
  return Object.keys(bulletData).filter(key => {
    const data = bulletData[key];
    return data && data.levels !== undefined && data.levels !== null;
  });
}

/**
 * 获取所有特殊子弹列表
 * @returns {string[]} 特殊子弹key数组
 */
export function getAllSpecialBullets() {
  return Object.keys(bulletData).filter(key => {
    const data = bulletData[key];
    return data && data.type !== undefined && data.type !== null;
  });
}

/**
 * 获取子弹的显示名称
 * @param {string} bulletKey - 子弹key
 * @param {number} level - 等级 (常规口径需要)
 * @returns {string} 显示名称
 */
export function getBulletDisplayName(bulletKey, level = null) {
  const data = bulletData[bulletKey];
  if (!data) return bulletKey;

  if (data.type) {
    return data.name || bulletKey;
  }

  if (data.name && level !== null) {
    return `${data.name} Lv.${level}`;
  }
  return data.name || bulletKey;
}

/**
 * 获取所有子弹项 (用于下拉选择等)
 * @param {number} defaultLevel - 默认等级
 * @returns {Array<{key: string, display: string, level: number, caliber: string, isSpecial: boolean}>}
 */
export function getAllBulletItems(defaultLevel = 4) {
  const items = [];

  getAllCalibers().forEach(caliber => {
    const data = bulletData[caliber];
    if (!data || !data.levels) return;

    const levels = Object.keys(data.levels).map(Number).sort((a, b) => a - b);
    levels.forEach(level => {
      items.push({
        key: caliber,
        display: `${data.name} Lv.${level}`,
        level: level,
        caliber: caliber,
        isSpecial: false,
        data: data.levels[level],
      });
    });
  });

  getAllSpecialBullets().forEach(key => {
    const data = bulletData[key];
    items.push({
      key: key,
      display: data.name || key,
      level: data.level || 0,
      caliber: key,
      isSpecial: true,
      data: data,
    });
  });

  return items;
}

/**
 * 获取护甲伤害衰减 (1~6级数组)
 * @param {string} bulletKey - 子弹key
 * @param {number} level - 等级
 * @returns {number[]} 护甲伤害衰减数组 [1级, 2级, 3级, 4级, 5级, 6级]
 */
export function getArmorDamage(bulletKey, level) {
  const data = bulletData[bulletKey];
  if (!data) return [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];

  if (data.type) {
    return data.armorDamage || [0, 0, 0, 0, 0, 0];
  }

  if (data.levels && data.levels[level]) {
    return data.levels[level].armorDamage || [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
  }
  return [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
}

/**
 * 获取护甲穿透水平 (1~6级数组)
 * @param {string} bulletKey - 子弹key
 * @param {number} level - 等级
 * @returns {number[]} 护甲穿透水平数组 [1级, 2级, 3级, 4级, 5级, 6级]
 */
export function getPenLevels(bulletKey, level) {
  const data = bulletData[bulletKey];
  if (!data) return [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];

  if (data.type) {
    return data.penLevels || [0, 0, 0, 0, 0, 0];
  }

  if (data.levels && data.levels[level]) {
    return data.levels[level].penLevels || [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
  }
  return [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
}

/**
 * 获取子弹的基础伤害比例
 * @param {string} bulletKey - 子弹key
 * @param {number} level - 等级
 * @returns {number} 基础伤害比例
 */
export function getBulletBase(bulletKey, level) {
  const data = bulletData[bulletKey];
  if (!data) return 1.0;

  if (data.type) {
    return data.base || 1.0;
  }

  if (data.levels && data.levels[level]) {
    return data.levels[level].base || 1.0;
  }
  return 1.0;
}

/**
 * 获取指定护甲等级的护甲伤害衰减值
 * @param {string} bulletKey - 子弹key
 * @param {number} level - 子弹等级
 * @param {number} armorLevel - 护甲等级 (1-6)
 * @returns {number} 护甲伤害衰减值
 */
export function getArmorDamageForLevel(bulletKey, level, armorLevel) {
  const armorDamage = getArmorDamage(bulletKey, level);
  const index = armorLevel - 1;
  if (index >= 0 && index < armorDamage.length) {
    return armorDamage[index];
  }
  return 1.0;
}

/**
 * 获取指定护甲等级的护甲穿透水平值
 * @param {string} bulletKey - 子弹key
 * @param {number} level - 子弹等级
 * @param {number} armorLevel - 护甲等级 (1-6)
 * @returns {number} 护甲穿透水平值
 */
export function getPenLevelForLevel(bulletKey, level, armorLevel) {
  const penLevels = getPenLevels(bulletKey, level);
  const index = armorLevel - 1;
  if (index >= 0 && index < penLevels.length) {
    return penLevels[index];
  }
  return 1.0;
}