/**
 * 简单的随机种子管理
 * 使用固定种子确保模拟结果的一致性
 * 
 * 适配新的 configs 结构：
 * - 随机数生成与 configs 无关
 * - 保持种子一致性，确保模拟结果可重现
 */

let currentSeed = 12345; // 固定种子

/**
 * 设置随机种子
 * @param {number} seed - 种子值
 */
export function setSeed(seed) {
  currentSeed = seed;
}

/**
 * 重置到默认种子
 */
export function resetSeed() {
  currentSeed = 12345;
}

/**
 * 生成带种子的随机数
 * 使用简单的线性同余生成器
 * @returns {number} 0-1之间的随机数
 */
export function seededRandom() {
  // LCG参数：a = 1664525, c = 1013904223, m = 2^32
  currentSeed = (1664525 * currentSeed + 1013904223) % Math.pow(2, 32);
  return currentSeed / Math.pow(2, 32);
}

/**
 * 生成指定范围内的随机整数（包含边界）
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {number} 随机整数
 */
export function seededRandomInt(min, max) {
  return Math.floor(seededRandom() * (max - min + 1)) + min;
}

/**
 * 生成指定范围内的随机浮点数
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {number} 随机浮点数
 */
export function seededRandomFloat(min, max) {
  return seededRandom() * (max - min) + min;
}

/**
 * 从数组中随机选择一个元素
 * @param {Array} arr - 数组
 * @returns {*} 随机选择的元素
 */
export function seededRandomChoice(arr) {
  if (!arr || arr.length === 0) return undefined;
  return arr[seededRandomInt(0, arr.length - 1)];
}

/**
 * 打乱数组（Fisher-Yates 洗牌算法）
 * @param {Array} arr - 要打乱的数组
 * @returns {Array} 打乱后的数组（原数组会被修改）
 */
export function seededShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = seededRandomInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 获取当前种子值
 * @returns {number} 当前种子
 */
export function getCurrentSeed() {
  return currentSeed;
}

/**
 * 生成随机布尔值
 * @param {number} probability - 返回 true 的概率 (0-1)
 * @returns {boolean} 随机布尔值
 */
export function seededRandomBoolean(probability = 0.5) {
  return seededRandom() < probability;
}