import { TIME_UNITS } from '../core/config.js';

/**
 * 格式化射程显示，将Infinity转换为∞符号
 * @param {Array} ranges - 射程数组
 * @returns {string} 格式化后的射程字符串
 */
export function formatRanges(ranges) {
  return ranges.map(r => r === Infinity ? '∞' : r).join(', ');
}

/**
 * 格式化时间显示
 * @param {number} value - 时间值
 * @param {string} unit - 单位 ('ms', 's', 'min', 'ms_raw')
 * @param {boolean} isMs - 传入的值是否已经是毫秒（默认 false，即传入的是秒）
 * @returns {string} 格式化后的时间字符串
 */
export function formatTime(value, unit = 'ms', isMs = false) {
  // 如果传入的已经是毫秒，直接使用，否则转换
  const msValue = isMs ? value : value * TIME_UNITS.SECONDS_TO_MS;
  
  switch (unit) {
    case 'ms':
      return `${Math.round(msValue)}ms`;
    case 'ms_raw':
      return Math.round(msValue);
    case 's':
      return `${(msValue / TIME_UNITS.SECONDS_TO_MS).toFixed(3)}s`;
    case 'min':
      return `${(msValue / (TIME_UNITS.SECONDS_TO_MS * TIME_UNITS.MINUTES_TO_SECONDS)).toFixed(3)}min`;
    default:
      return `${Math.round(msValue)}ms`;
  }
}

/**
 * 格式化百分比显示
 * @param {number} value - 数值
 * @param {number} total - 总值
 * @param {number} decimals - 小数位数
 * @returns {string} 格式化后的百分比字符串
 */
export function formatPercentage(value, total, decimals = 1) {
  if (total === 0) return '0%';
  const percentage = (value / total) * 100;
  return `${percentage.toFixed(decimals)}%`;
}

/**
 * 格式化武器属性显示
 * @param {Object} weapon - 武器对象
 * @returns {Object} 格式化后的武器属性
 */
export function formatWeaponStats(weapon) {
  return {
    name: weapon.name,
    type: weapon.type,
    rof: Math.round(weapon.rof),
    velocity: Math.round(weapon.velocity),
    ranges: formatRanges(weapon.ranges.map(r => Math.round(r))),
    flesh: weapon.flesh,
    armor: weapon.armor
  };
}

/**
 * 格式化排名变化显示
 * @param {number} rankChange - 排名变化
 * @returns {Object} 格式化后的排名变化信息
 */
export function formatRankChange(rankChange) {
  if (rankChange === 0) {
    return { text: '0', color: '#000000' };
  } else if (rankChange > 0) {
    return { text: `↓${Math.abs(rankChange)}`, color: '#00ff00' };
  } else {
    return { text: `↑${Math.abs(rankChange)}`, color: '#ff0000' };
  }
}

/**
 * 格式化延迟变化显示
 * @param {number} delayChange - 延迟变化
 * @returns {string} 格式化后的延迟变化字符串
 */
export function formatDelayChange(delayChange) {
  if (delayChange === 0) {
    return '0';
  } else if (delayChange > 0) {
    return `+${delayChange}`;
  } else {
    return delayChange.toString();
  }
}

/**
 * 格式化图表标签
 * @param {string} label - 原始标签
 * @param {number} maxLength - 最大长度
 * @returns {string} 格式化后的标签
 */
export function formatChartLabel(label, maxLength = 20) {
  if (label.length <= maxLength) {
    return label;
  }
  return label.substring(0, maxLength - 3) + '...';
}

/**
 * 格式化数值范围
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @param {string} separator - 分隔符
 * @returns {string} 格式化后的范围字符串
 */
export function formatRange(min, max, separator = ' - ') {
  return `${min}${separator}${max}`;
}

/**
 * 格式化部位倍率显示
 * @param {Object} mult - 部位倍率对象
 * @returns {string} 格式化后的倍率字符串
 */
export function formatMultipliers(mult) {
  if (!mult) return '';
  const round = (v, n = 2) => {
    if (typeof v !== 'number') return v;
    const p = Math.pow(10, n);
    return Math.round((v + Number.EPSILON) * p) / p;
  };
  const h = round(mult.head);
  const c = round(mult.chest);
  const s = round(mult.stomach);
  const l = round(mult.limbs);
  return `${h}/${c}/${s}/${l}`;
}