// src/core/pricingManager.js

/**
 * 价格管理器
 * 统一管理子弹价格和武器价格
 * 
 * 数据来源：
 * 1. 初始化时从 prices.json 加载默认数据
 * 2. 用户修改后保存到 localStorage
 * 3. 支持导入/导出 JSON
 * 
 * 数据结构：
 * {
 *   version: "1.0",
 *   updatedAt: "2026-08-21",
 *   bulletPrices: { "5.45x39_1": 40, ... },
 *   weaponPrices: { "AK-12": { "cfg-1": 45000, ... }, ... }
 * }
 */

const STORAGE_KEY = 'ttk_prices';
const DEFAULT_PRICES_URL = './prices.json';

// ==================== 价格数据存储 ====================

let bulletPrices = {};
let weaponPrices = {};
let isLoaded = false;

// ==================== 加载/保存 ====================

/**
 * 从 prices.json 加载默认价格数据
 * @returns {Promise<Object>} 价格数据对象
 */
export async function loadDefaultPrices() {
  try {
    const response = await fetch(DEFAULT_PRICES_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.warn('⚠️ 加载默认价格数据失败:', error.message);
    // 返回空数据，让调用方处理
    return { bulletPrices: {}, weaponPrices: {} };
  }
}

/**
 * 从 localStorage 加载价格数据
 * @returns {Object|null} 价格数据对象，如果不存在则返回 null
 */
export function loadPricesFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      // 验证数据结构
      if (data && typeof data === 'object') {
        return data;
      }
    }
  } catch (error) {
    console.error('加载价格数据失败:', error);
  }
  return null;
}

/**
 * 保存价格数据到 localStorage
 * @param {Object} data - 价格数据对象
 */
export function savePricesToStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.log('✅ 价格数据已保存到 localStorage');
  } catch (error) {
    console.error('保存价格数据失败:', error);
  }
}

/**
 * 初始化价格数据
 * 优先从 localStorage 加载，如果没有则从 prices.json 加载默认值
 * @returns {Promise<Object>} 初始化后的价格数据
 */
export async function initializePrices() {
  // 1. 尝试从 localStorage 加载
  const savedData = loadPricesFromStorage();
  if (savedData) {
    bulletPrices = savedData.bulletPrices || {};
    weaponPrices = savedData.weaponPrices || {};
    isLoaded = true;
    console.log('✅ 从 localStorage 加载价格数据');
    return savedData;
  }

  // 2. 从 prices.json 加载默认值
  try {
    const defaultData = await loadDefaultPrices();
    bulletPrices = defaultData.bulletPrices || {};
    weaponPrices = defaultData.weaponPrices || {};
    isLoaded = true;
    // 保存到 localStorage 以便后续使用
    savePricesToStorage(defaultData);
    console.log('✅ 从 prices.json 加载默认价格数据');
    return defaultData;
  } catch (error) {
    console.error('❌ 初始化价格数据失败:', error);
    bulletPrices = {};
    weaponPrices = {};
    isLoaded = true;
    return { bulletPrices: {}, weaponPrices: {} };
  }
}

/**
 * 获取当前完整的价格数据
 * @returns {Object} { bulletPrices, weaponPrices }
 */
export function getPrices() {
  return {
    bulletPrices: { ...bulletPrices },
    weaponPrices: { ...weaponPrices }
  };
}

/**
 * 获取子弹价格
 * @param {string} bulletKey - 子弹key (如 '5.45x39_1' 或 '9x19-RIP')
 * @param {number} defaultPrice - 默认价格（当找不到时返回）
 * @returns {number} 价格
 */
export function getBulletPrice(bulletKey, defaultPrice = 0) {
  if (!bulletKey) return defaultPrice;
  const price = bulletPrices[bulletKey];
  return price !== undefined ? price : defaultPrice;
}

/**
 * 设置子弹价格
 * @param {string} bulletKey - 子弹key
 * @param {number} price - 价格
 */
export function setBulletPrice(bulletKey, price) {
  if (!bulletKey) return;
  if (typeof price !== 'number' || price < 0) return;
  bulletPrices[bulletKey] = price;
  savePrices();
}

/**
 * 获取武器配置价格
 * @param {string} weaponName - 武器名称
 * @param {string} configId - 配置ID (如 'cfg-1')
 * @param {number} defaultPrice - 默认价格
 * @returns {number} 价格
 */
export function getWeaponPrice(weaponName, configId, defaultPrice = 0) {
  if (!weaponName || !configId) return defaultPrice;
  const weaponPrice = weaponPrices[weaponName];
  if (!weaponPrice) return defaultPrice;
  const price = weaponPrice[configId];
  return price !== undefined ? price : defaultPrice;
}

/**
 * 设置武器配置价格
 * @param {string} weaponName - 武器名称
 * @param {string} configId - 配置ID
 * @param {number} price - 价格
 */
export function setWeaponPrice(weaponName, configId, price) {
  if (!weaponName || !configId) return;
  if (typeof price !== 'number' || price < 0) return;
  if (!weaponPrices[weaponName]) {
    weaponPrices[weaponName] = {};
  }
  weaponPrices[weaponName][configId] = price;
  savePrices();
}

/**
 * 保存所有价格到 localStorage
 */
function savePrices() {
  const data = {
    bulletPrices: bulletPrices,
    weaponPrices: weaponPrices
  };
  savePricesToStorage(data);
}

// ==================== 导入/导出 ====================

/**
 * 导出价格数据为 JSON 字符串
 * @returns {string} JSON 字符串
 */
export function exportPrices() {
  const data = {
    version: '1.0',
    updatedAt: new Date().toISOString().slice(0, 10),
    bulletPrices: bulletPrices,
    weaponPrices: weaponPrices
  };
  return JSON.stringify(data, null, 2);
}

/**
 * 导入价格数据
 * @param {string|Object} data - JSON 字符串或解析后的对象
 * @returns {boolean} 是否导入成功
 */
export function importPrices(data) {
  try {
    let parsedData;
    if (typeof data === 'string') {
      parsedData = JSON.parse(data);
    } else {
      parsedData = data;
    }

    // 验证数据结构
    if (!parsedData || typeof parsedData !== 'object') {
      throw new Error('无效的数据格式');
    }

    // 导入子弹价格
    if (parsedData.bulletPrices && typeof parsedData.bulletPrices === 'object') {
      bulletPrices = { ...parsedData.bulletPrices };
    }

    // 导入武器价格
    if (parsedData.weaponPrices && typeof parsedData.weaponPrices === 'object') {
      weaponPrices = { ...parsedData.weaponPrices };
    }

    savePrices();
    return true;
  } catch (error) {
    console.error('导入价格数据失败:', error);
    return false;
  }
}

/**
 * 下载价格数据为 JSON 文件
 */
export function downloadPrices() {
  const jsonStr = exportPrices();
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ttk_prices_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 从文件上传导入价格数据
 * @param {File} file - JSON 文件
 * @returns {Promise<boolean>} 是否导入成功
 */
export function uploadPrices(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const success = importPrices(event.target.result);
        resolve(success);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => {
      reject(new Error('读取文件失败'));
    };
    reader.readAsText(file);
  });
}

/**
 * 重置价格数据为默认值
 * @returns {Promise<boolean>} 是否重置成功
 */
export async function resetPrices() {
  try {
    const defaultData = await loadDefaultPrices();
    bulletPrices = defaultData.bulletPrices || {};
    weaponPrices = defaultData.weaponPrices || {};
    savePrices();
    return true;
  } catch (error) {
    console.error('重置价格数据失败:', error);
    return false;
  }
}

// ==================== 统计信息 ====================

/**
 * 获取子弹价格统计信息
 * @returns {Object} { total, maxPrice, minPrice, avgPrice }
 */
export function getBulletPriceStats() {
  const entries = Object.entries(bulletPrices);
  if (entries.length === 0) {
    return { total: 0, maxPrice: 0, minPrice: 0, avgPrice: 0 };
  }

  const prices = entries.map(([, price]) => price);
  const total = entries.length;
  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / total;

  return { total, maxPrice, minPrice, avgPrice };
}

/**
 * 获取武器价格统计信息
 * @returns {Object} { total, maxPrice, minPrice, avgPrice }
 */
export function getWeaponPriceStats() {
  const allPrices = [];
  for (const weaponName in weaponPrices) {
    const configs = weaponPrices[weaponName];
    for (const configId in configs) {
      allPrices.push(configs[configId]);
    }
  }

  if (allPrices.length === 0) {
    return { total: 0, maxPrice: 0, minPrice: 0, avgPrice: 0 };
  }

  const total = allPrices.length;
  const maxPrice = Math.max(...allPrices);
  const minPrice = Math.min(...allPrices);
  const avgPrice = allPrices.reduce((a, b) => a + b, 0) / total;

  return { total, maxPrice, minPrice, avgPrice };
}

// ==================== 兼容性方法 ====================

/**
 * @deprecated 请使用 getBulletPrice
 */
export function getBulletPriceLegacy(bulletKey) {
  console.warn('⚠️ getBulletPriceLegacy 已废弃，请使用 getBulletPrice');
  return getBulletPrice(bulletKey);
}

/**
 * @deprecated 请使用 setBulletPrice
 */
export function setBulletPriceLegacy(bulletKey, price) {
  console.warn('⚠️ setBulletPriceLegacy 已废弃，请使用 setBulletPrice');
  setBulletPrice(bulletKey, price);
}

/**
 * 检查价格数据是否已加载
 * @returns {boolean}
 */
export function isPricesLoaded() {
  return isLoaded;
}