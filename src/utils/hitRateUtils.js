/**
 * 命中率工具函数
 * 实现距离-命中率曲线的计算和拟合
 * 
 * 核心规则:
 * 1. 用户可配置 0~3 个距离-命中率点
 * 2. 0个点: 使用统一命中率 (默认80%)
 * 3. 1个点: 每靠近1m增加1%命中率，每远离1m减少1%命中率
 * 4. 2~3个点: 相邻点之间线性插值，外侧线性外推
 * 5. 所有计算结果限制在 0% ~ 100% 之间
 * 6. 特殊边界: 命中率100%的点之前全为100%，0%的点之后全为0%
 * 
 * 适配新的 configs 结构：
 * - hitRatePoints 存储在 config 中
 * - 函数本身不关心数据来源，只处理传入的 points 数组
 */

/**
 * 将命中率限制在 0~1 之间
 * @param {number} rate - 原始命中率
 * @returns {number} 限制后的命中率
 */
function clampRate(rate) {
  return Math.max(0, Math.min(1, rate));
}

/**
 * 根据配置的距离-命中率点计算指定距离的命中率
 * 
 * @param {Array<{distance: number, rate: number}>} points - 配置的命中率点，最多3个
 * @param {number} distance - 当前交战距离 (米)
 * @param {number} defaultHitRate - 统一命中率 (当points为空时使用)
 * @returns {number} 命中率 (0~1)
 */
export function calculateHitRate(points, distance, defaultHitRate = 0.80) {
  // 参数校验
  if (typeof distance !== 'number' || distance < 0) {
    return defaultHitRate;
  }
  
  // 1. 无配置点 → 使用统一命中率
  if (!points || points.length === 0) {
    return clampRate(defaultHitRate);
  }
  
  // 过滤有效点 (distance >= 0, rate在0~1之间)
  const validPoints = points
    .filter(p => 
      typeof p.distance === 'number' && p.distance >= 0 &&
      typeof p.rate === 'number' && p.rate >= 0 && p.rate <= 1
    )
    .sort((a, b) => a.distance - b.distance);
  
  if (validPoints.length === 0) {
    return clampRate(defaultHitRate);
  }

  // ========== 特殊边界处理 ==========
  // 检查第一个点：如果第一个点的命中率是100%，则该点之前全为100%
  if (validPoints[0].rate >= 1) {
    if (distance <= validPoints[0].distance) {
      return 1.0;
    }
  }
  // 检查最后一个点：如果最后一个点的命中率是0%，则该点之后全为0%
  if (validPoints[validPoints.length - 1].rate <= 0) {
    if (distance >= validPoints[validPoints.length - 1].distance) {
      return 0.0;
    }
  }
  
  // 2. 只有1个点：线性外推，每米±1%
  if (validPoints.length === 1) {
    const p = validPoints[0];
    // 距离差: 正值表示远离，负值表示靠近
    const diff = distance - p.distance;
    // 每米变化1% (0.01)
    const rate = p.rate - diff * 0.01;
    return clampRate(rate);
  }
  
  // 3. 多个点 (2~3个)：线性插值 + 外推
  
  // 如果距离在第一个点之前，使用第一个点和第二个点的斜率外推
  if (distance <= validPoints[0].distance) {
    const p0 = validPoints[0];
    const p1 = validPoints[1];
    const slope = (p1.rate - p0.rate) / (p1.distance - p0.distance);
    const rate = p0.rate + (p0.distance - distance) * slope;
    return clampRate(rate);
  }
  
  // 如果距离在最后一个点之后，使用最后两个点的斜率外推
  if (distance >= validPoints[validPoints.length - 1].distance) {
    const p0 = validPoints[validPoints.length - 2];
    const p1 = validPoints[validPoints.length - 1];
    const slope = (p1.rate - p0.rate) / (p1.distance - p0.distance);
    const rate = p1.rate + (distance - p1.distance) * slope;
    return clampRate(rate);
  }
  
  // 在两点之间：线性插值
  for (let i = 0; i < validPoints.length - 1; i++) {
    const p0 = validPoints[i];
    const p1 = validPoints[i + 1];
    if (distance >= p0.distance && distance <= p1.distance) {
      const t = (distance - p0.distance) / (p1.distance - p0.distance);
      const rate = p0.rate + (p1.rate - p0.rate) * t;
      return clampRate(rate);
    }
  }
  
  // 理论上不会到这里，但作为兜底
  return clampRate(defaultHitRate);
}

/**
 * 获取命中率曲线的描述文本 (用于UI显示)
 * @param {Array<{distance: number, rate: number}>} points - 配置的命中率点
 * @param {number} defaultHitRate - 统一命中率
 * @returns {string} 描述文本
 */
export function getHitRateDisplayText(points, defaultHitRate = 0.80) {
  if (!points || points.length === 0) {
    return `📌 统一: ${Math.round(defaultHitRate * 100)}%`;
  }
  
  const sorted = [...points].sort((a, b) => a.distance - b.distance);
  const parts = sorted.map(p => 
    `${p.distance}m: ${Math.round(p.rate * 100)}%`
  );
  return parts.join(', ');
}

/**
 * 生成用于曲线预览的数据点
 * @param {Array<{distance: number, rate: number}>} points - 配置的命中率点
 * @param {number} defaultHitRate - 统一命中率
 * @param {number} steps - 采样点数
 * @param {number} maxDistance - 最大距离
 * @returns {Array<{distance: number, rate: number}>} 预览数据点
 */
export function generateHitRatePreview(points, defaultHitRate = 0.80, steps = 50, maxDistance = 150) {
  const result = [];
  const stepSize = maxDistance / steps;
  
  for (let i = 0; i <= steps; i++) {
    const distance = i * stepSize;
    const rate = calculateHitRate(points, distance, defaultHitRate);
    result.push({ distance, rate });
  }
  
  return result;
}

/**
 * 获取命中率曲线的统计信息
 * @param {Array<{distance: number, rate: number}>} points - 配置的命中率点
 * @param {number} defaultHitRate - 统一命中率
 * @param {number} maxDistance - 最大距离
 * @returns {Object} 统计信息
 */
export function getHitRateStats(points, defaultHitRate = 0.80, maxDistance = 150) {
  const preview = generateHitRatePreview(points, defaultHitRate, 100, maxDistance);
  
  let minRate = 1;
  let maxRate = 0;
  let totalRate = 0;
  
  for (const point of preview) {
    if (point.rate < minRate) minRate = point.rate;
    if (point.rate > maxRate) maxRate = point.rate;
    totalRate += point.rate;
  }
  
  return {
    minRate: Math.round(minRate * 100) + '%',
    maxRate: Math.round(maxRate * 100) + '%',
    avgRate: Math.round((totalRate / preview.length) * 100) + '%'
  };
}

/**
 * 验证命中率点是否有效
 * @param {Array<{distance: number, rate: number}>} points - 配置的命中率点
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateHitRatePoints(points) {
  const errors = [];
  
  if (!points) {
    return { valid: true, errors: [] };
  }
  
  if (points.length > 3) {
    errors.push('最多只能配置3个命中率点');
  }
  
  const distances = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (typeof p.distance !== 'number' || p.distance < 0) {
      errors.push(`第${i+1}个点的距离无效，必须为非负数字`);
    }
    if (typeof p.rate !== 'number' || p.rate < 0 || p.rate > 1) {
      errors.push(`第${i+1}个点的命中率无效，必须在0~100%之间`);
    }
    if (p.distance !== undefined && distances.includes(p.distance)) {
      errors.push(`距离 ${p.distance}m 重复配置`);
    }
    distances.push(p.distance);
  }
  
  // 检查距离是否递增
  const sortedDistances = [...distances].sort((a, b) => a - b);
  for (let i = 0; i < sortedDistances.length - 1; i++) {
    if (sortedDistances[i] === sortedDistances[i+1]) {
      // 重复距离已在上面检查
      break;
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * 从命中率点数组创建深拷贝
 * @param {Array<{distance: number, rate: number}>} points - 原始点
 * @returns {Array<{distance: number, rate: number}>} 深拷贝
 */
export function cloneHitRatePoints(points) {
  if (!points) return [];
  return points.map(p => ({
    distance: p.distance,
    rate: p.rate
  }));
}

/**
 * 检查两个命中率配置是否相同
 * @param {Array<{distance: number, rate: number}>} a - 配置A
 * @param {Array<{distance: number, rate: number}>} b - 配置B
 * @returns {boolean} 是否相同
 */
export function areHitRatePointsEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  
  const sortedA = [...a].sort((x, y) => x.distance - y.distance);
  const sortedB = [...b].sort((x, y) => x.distance - y.distance);
  
  for (let i = 0; i < sortedA.length; i++) {
    if (sortedA[i].distance !== sortedB[i].distance) return false;
    if (sortedA[i].rate !== sortedB[i].rate) return false;
  }
  
  return true;
}

/**
 * 获取默认的命中率点（空数组）
 * @returns {Array} 空数组
 */
export function getDefaultHitRatePoints() {
  return [];
}

/**
 * 创建单个命中率点
 * @param {number} distance - 距离
 * @param {number} rate - 命中率 (0~1)
 * @returns {Object} 命中率点对象
 */
export function createHitRatePoint(distance, rate) {
  return {
    distance: Math.max(0, distance),
    rate: Math.max(0, Math.min(1, rate))
  };
}