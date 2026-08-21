// src/core/bulletPricing.js

/**
 * 子弹价格数据
 * 
 * 注意：此文件已重构，价格数据现在由 pricingManager 统一管理
 * 这里只保留价格操作的便捷方法，实际数据存储在 pricingManager 中
 * 
 * 数据结构说明：
 * - 常规口径价格: key = "口径_等级"，如 "5.45x39_1"
 * - 特殊子弹价格: key = 子弹名称，如 "9x19-RIP"
 * 
 * 与 bulletData 中的子弹数据对应
 * 价格独立管理，方便用户调整
 */

import {
  getBulletPrice as getPrice,
  setBulletPrice as setPrice,
  getBulletPriceStats as getStats,
  getPrices as getPricingData,
  importPrices as importPricingData,
  exportPrices as exportPricingData,
  downloadPrices as downloadPricingData,
  uploadPrices as uploadPricingData,
  resetPrices as resetPricingData,
  isPricesLoaded,
  initializePrices
} from './pricingManager.js';

// ==================== 重新导出 pricingManager 的方法 ====================

/**
 * 获取子弹价格
 * @param {string} bulletKey - 子弹key (口径_等级 或 特殊子弹名称)
 * @returns {number} 价格，如果不存在则返回0
 */
export function getBulletPrice(bulletKey) {
  return getPrice(bulletKey, 0);
}

/**
 * 设置子弹价格
 * @param {string} bulletKey - 子弹key
 * @param {number} price - 价格
 * @returns {boolean} 是否设置成功
 */
export function setBulletPrice(bulletKey, price) {
  if (!bulletKey) return false;
  if (typeof price !== 'number' || price < 0) return false;
  setPrice(bulletKey, price);
  return true;
}

/**
 * 获取所有子弹价格数据（完整副本）
 * @returns {Object} 完整的子弹价格数据
 */
export function getBulletPricingData() {
  const data = getPricingData();
  return { ...data.bulletPrices };
}

/**
 * 设置完整的子弹价格数据（用于导入）
 * @param {Object} data - 子弹价格数据
 */
export function setBulletPricingData(data) {
  if (!data || typeof data !== 'object') return;
  // 导入到 pricingManager
  const fullData = getPricingData();
  fullData.bulletPrices = { ...data };
  // 使用 importPrices 保存
  importPricingData(fullData);
}

/**
 * 获取子弹价格统计
 * @returns {Object} { total, maxPrice, minPrice, avgPrice }
 */
export function getBulletPriceStats() {
  return getStats();
}

/**
 * 生成子弹价格的key
 * @param {string} caliber - 口径
 * @param {number} level - 等级
 * @returns {string} key
 */
export function getPriceKey(caliber, level) {
  return `${caliber}_${level}`;
}

/**
 * 从key解析口径和等级
 * @param {string} key - 价格key
 * @returns {Object|null} { caliber, level } 或 null
 */
export function parsePriceKey(key) {
  if (!key) return null;
  // 特殊子弹直接返回
  if (key.includes('-') || key.includes('SUPER') || key.includes('AP') || key.includes('M61')) {
    return { caliber: key, level: null, isSpecial: true };
  }
  // 常规口径: 口径_等级
  const parts = key.split('_');
  if (parts.length === 2) {
    const level = parseInt(parts[1]);
    if (!isNaN(level)) {
      return { caliber: parts[0], level, isSpecial: false };
    }
  }
  return null;
}

// ==================== 向后兼容 ====================

/**
 * @deprecated 请使用 pricingManager 的导出方法
 */
export function exportBulletPrices() {
  return exportPricingData();
}

/**
 * @deprecated 请使用 pricingManager 的导入方法
 */
export function importBulletPrices(jsonStr) {
  return importPricingData(jsonStr);
}

/**
 * @deprecated 请使用 pricingManager 的下载方法
 */
export function downloadBulletPrices() {
  downloadPricingData();
}

/**
 * @deprecated 请使用 pricingManager 的上传方法
 */
export function uploadBulletPrices(file) {
  return uploadPricingData(file);
}

/**
 * @deprecated 请使用 pricingManager 的初始化方法
 */
export function loadBulletPricesFromStorage() {
  return isPricesLoaded();
}

/**
 * @deprecated 请使用 pricingManager 的初始化方法
 */
export function saveBulletPricesToStorage() {
  // 由 pricingManager 自动处理
  console.warn('⚠️ saveBulletPricesToStorage 已废弃，价格由 pricingManager 自动保存');
}

// ==================== 重新导出 pricingManager 的初始化方法 ====================

// 导出初始化方法，方便调用
export { 
  initializePrices, 
  isPricesLoaded, 
  resetPricingData as resetPrices,
  resetPricingData as resetBulletPrices
};

// 重新导出为兼容名称
export const loadPrices = initializePrices;