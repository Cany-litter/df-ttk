/**
 * TTK 多维缓存管理器
 * 
 * 职责：
 * 1. 生成四层缓存 key（weaponKey / bulletId / defenderKey / scenarioKey）
 * 2. 读取/写入缓存
 * 3. 从 keyPoints 插值任意距离的 TTK / 枪数
 * 4. 哈弗币消耗估算
 * 5. 清空/统计缓存
 * 
 * 不负责：
 * - 数据的存储（由 DataManager 负责）
 * - TTK 的计算（由 SimulationEngine / KeyPointsComputer 负责）
 * 
 * ⭐ 缓存结构（四层嵌套）：
 * 
 *   ttkCache.v1
 *     └─ weaponKey: "41#1_0_2_009"          (武器+附件)
 *         └─ bulletId: "5.8x42mm#3"         (子弹 ID)
 *             └─ defenderKey: "a4v110_h4v48" (敌方甲头)
 *                 └─ scenarioKey: "hr30:1:..._hp0.1:0.3:0.3:0.3_td1_hp100"
 *                     ├─ keyPoints: [...]     (关键点数组)
 *                     ├─ avgBurstInterval: 0
 *                     ├─ cachedAt: "..."
 *                     └─ version: 1           (⭐ 缓存版本号)
 * 
 * ⭐ Key 格式：
 * - weaponKey   = {weaponId}#{configId}_{barrelId}_{muzzleId}_{precision×100}
 *                 例：41#1_0_2_009
 * - bulletId    = 直接是 bullet.id
 *                 例：5.8x42mm#3
 * - defenderKey = a{armorLevel}v{armorValue}_h{helmetLevel}v{helmetValue}
 *                 例：a4v110_h4v48
 * - scenarioKey = hr{d1}:{r1}:{d2}:{r2}..._hp{h}:{c}:{s}:{l}_td{0|1}_hp{health}
 *                 例：hr30:1:50:0.9:100:0.6_hp0.1:0.3:0.3:0.3_td1_hp100
 * 
 * ⭐ 为什么距离不参与 key：
 * - keyPoints 已经包含各关键点的 TTK
 * - 查询任意距离时从 keyPoints 插值
 * - 用户改距离无需重算，只需插值
 * 
 * ⭐ 缓存版本号（CACHE_VERSION）：
 * - 用于标记缓存结构版本
 * - 当缓存结构变更时（如 keyPoints 字段重命名），递增此版本号
 * - get() 时校验版本，不匹配则视为未命中
 * - 与旧的 ConfigCacheManager 独立
 * 
 * ⭐ 缓存复用策略：
 * - 缓存跨推荐/跨计算复用
 * - 只有"重置数据"或显式 clearAll() 时才清空
 * 
 * ⭐ 统一缓存后：
 * - 主界面 TTK 计算、折线图、单枪更新、哈弗币估算全部走 ttkCache
 * - ConfigCacheManager 已废弃
 */

// ⭐ 缓存结构版本号（递增即让所有旧缓存失效）
const CACHE_VERSION = 1;

export class TtkCacheManager {
  /**
   * @param {DataManager} dataManager - DataManager 实例
   */
  constructor(dataManager) {
    this.dataManager = dataManager;
  }

  // ============================================================
  // 1. Key 生成
  // ============================================================

  /**
   * 生成 weaponKey
   * 格式：{weaponId}#{configId}_{barrelId}_{muzzleId}_{precision×100}
   * 
   * 注意：
   * - barrelId 用 -1 表示"无"
   * - muzzleId 用 0 表示"无"
   * - precision 用 3 位补零（如 0.09 → "009"，0.1 → "010"）
   * 
   * @param {number|string} weaponId
   * @param {string} configId - 如 "#1"
   * @param {number} barrelId - 枪管索引，-1 表示无
   * @param {number} muzzleId - 枪口 ID，0 表示无
   * @param {number} precision - 精校值（-0.09 ~ 0.09）
   * @returns {string}
   */
  makeWeaponKey(weaponId, configId, barrelId, muzzleId, precision) {
    const b = (barrelId === undefined || barrelId === null) ? -1 : barrelId;
    const m = (muzzleId === undefined || muzzleId === null) ? 0 : muzzleId;
    const p = Math.round((precision ?? 0.09) * 100);
    const pStr = String(Math.abs(p)).padStart(3, '0');
    const pSign = p < 0 ? '-' : '';
    const cid = configId || '#1';
    return `${weaponId}${cid}_${b}_${m}_${pSign}${pStr}`;
  }

  /**
   * 生成 defenderKey
   * 格式：a{armorLevel}v{armorValue}_h{helmetLevel}v{helmetValue}
   * 
   * @param {number} armorLevel - 护甲等级（1-6）
   * @param {number} armorValue - 护甲值（如 110）
   * @param {number} helmetLevel - 头盔等级（1-6）
   * @param {number} helmetValue - 头盔值（如 48）
   * @returns {string}
   */
  makeDefenderKey(armorLevel, armorValue, helmetLevel, helmetValue) {
    const al = armorLevel ?? 4;
    const av = armorValue ?? 0;
    const hl = helmetLevel ?? 4;
    const hv = helmetValue ?? 0;
    return `a${al}v${av}_h${hl}v${hv}`;
  }

  /**
   * 生成 scenarioKey
   * 格式：hr{d1}:{r1}:{d2}:{r2}..._hp{h}:{c}:{s}:{l}_td{0|1}_hp{health}
   * 
   * 注意：
   * - hitRateMap 按距离排序后拼接
   * - hitProb 顺序固定：head / chest / stomach / limbs
   * - triggerDelayEnable 用 '1' / '0'
   * - healthValue 默认 100
   * 
   * @param {Array} hitRateMap - [{ distance, rate }, ...]
   * @param {Object} hitProb - { head, chest, stomach, limbs }
   * @param {boolean} triggerDelayEnable
   * @param {number} healthValue
   * @returns {string}
   */
  makeScenarioKey(hitRateMap, hitProb, triggerDelayEnable, healthValue) {
    // 命中率映射：按距离排序后拼接
    const sortedMap = [...(hitRateMap || [])]
      .sort((a, b) => a.distance - b.distance)
      .map(p => `${p.distance}:${p.rate}`)
      .join(':');
    const hrPart = sortedMap || 'default';

    // 命中分布：头:胸:腹:肢
    const hp = hitProb || { head: 0.1, chest: 0.3, stomach: 0.3, limbs: 0.3 };
    const hpPart = `${hp.head}:${hp.chest}:${hp.stomach}:${hp.limbs}`;

    // 扳机延迟
    const tdPart = triggerDelayEnable ? '1' : '0';

    // 生命值
    const healthPart = healthValue ?? 100;

    return `hr${hrPart}_hp${hpPart}_td${tdPart}_hp${healthPart}`;
  }

  // ============================================================
  // 2. 读取缓存
  // ============================================================

  /**
   * 查询缓存的 keyPoints
   * 
   * ⭐ 版本校验：entry.version 必须等于 CACHE_VERSION，
   *    否则视为未命中（返回 null）
   * 
   * @param {string} weaponKey
   * @param {string} bulletId
   * @param {string} defenderKey
   * @param {string} scenarioKey
   * @returns {Array|null} keyPoints 数组，或 null（未命中）
   */
  get(weaponKey, bulletId, defenderKey, scenarioKey) {
    const cache = this.dataManager.getTtkCache();
    const entry = cache?.v1?.[weaponKey]?.[bulletId]?.[defenderKey]?.[scenarioKey];
    if (!entry) return null;
    if (entry.version !== CACHE_VERSION) return null;
    return entry.keyPoints || null;
  }

  /**
   * 查询完整缓存对象（含 avgBurstInterval、cachedAt、version）
   * 
   * ⭐ 同样做版本校验
   * 
   * @returns {Object|null} { keyPoints, avgBurstInterval, cachedAt, version } 或 null
   */
  getFull(weaponKey, bulletId, defenderKey, scenarioKey) {
    const cache = this.dataManager.getTtkCache();
    const entry = cache?.v1?.[weaponKey]?.[bulletId]?.[defenderKey]?.[scenarioKey];
    if (!entry) return null;
    if (entry.version !== CACHE_VERSION) return null;
    return entry;
  }

  /**
   * 检查缓存是否存在（且版本匹配）
   */
  has(weaponKey, bulletId, defenderKey, scenarioKey) {
    return this.get(weaponKey, bulletId, defenderKey, scenarioKey) !== null;
  }

  // ============================================================
  // 3. 写入缓存
  // ============================================================

  /**
   * 写入缓存
   * 
   * @param {string} weaponKey
   * @param {string} bulletId
   * @param {string} defenderKey
   * @param {string} scenarioKey
   * @param {Array} keyPoints - [{ d, t, shots, bulletPrice }, ...]
   * @param {number} avgBurstInterval - 平均连发间隔（秒）
   */
  set(weaponKey, bulletId, defenderKey, scenarioKey, keyPoints, avgBurstInterval = 0) {
    const cache = this.dataManager.getTtkCache();
    if (!cache.v1) cache.v1 = {};

    if (!cache.v1[weaponKey]) cache.v1[weaponKey] = {};
    if (!cache.v1[weaponKey][bulletId]) cache.v1[weaponKey][bulletId] = {};
    if (!cache.v1[weaponKey][bulletId][defenderKey]) {
      cache.v1[weaponKey][bulletId][defenderKey] = {};
    }

    cache.v1[weaponKey][bulletId][defenderKey][scenarioKey] = {
      keyPoints,
      avgBurstInterval,
      cachedAt: new Date().toISOString(),
      version: CACHE_VERSION
    };
  }

  // ============================================================
  // 4. 插值 - TTK
  // ============================================================

  /**
   * 从 keyPoints 插值指定距离的 TTK
   * 
   * @param {Array} keyPoints - [{ d, t }, ...]
   * @param {number} distance - 目标距离
   * @returns {number} TTK（毫秒）
   */
  interpolateTTK(keyPoints, distance) {
    if (!keyPoints || keyPoints.length === 0) return 0;
    if (keyPoints.length === 1) return keyPoints[0].t;

    const sorted = [...keyPoints].sort((a, b) => a.d - b.d);

    if (distance <= sorted[0].d) return sorted[0].t;
    if (distance >= sorted[sorted.length - 1].d) {
      return sorted[sorted.length - 1].t;
    }

    for (let i = 0; i < sorted.length - 1; i++) {
      const p1 = sorted[i];
      const p2 = sorted[i + 1];
      if (distance >= p1.d && distance <= p2.d) {
        const range = p2.d - p1.d;
        if (range === 0) return p1.t;
        const t = (distance - p1.d) / range;
        return p1.t + t * (p2.t - p1.t);
      }
    }

    return sorted[sorted.length - 1].t;
  }

  /**
   * 从 keyPoints 生成完整距离-TTK 数组（用于折线图）
   * 
   * @param {Array} keyPoints - [{ d, t }, ...]
   * @param {number} maxDistance - 最大距离（默认 100）
   * @param {number} step - 步长（默认 1）
   * @returns {Array<{d, t}>} 每个距离点的 TTK
   */
  interpolateFullRange(keyPoints, maxDistance = 100, step = 1) {
    if (!keyPoints || keyPoints.length === 0) return [];

    const result = [];
    for (let d = 0; d <= maxDistance; d += step) {
      result.push({
        d,
        t: this.interpolateTTK(keyPoints, d)
      });
    }
    return result;
  }

  // ============================================================
  // 5. 插值 - 平均致死枪数
  // ============================================================

  /**
   * 从 keyPoints 插值指定距离的平均致死枪数
   * 
   * @param {Array} keyPoints - [{ d, shots }, ...]
   * @param {number} distance
   * @returns {number}
   */
  interpolateShots(keyPoints, distance) {
    if (!keyPoints || keyPoints.length === 0) return 0;
    if (keyPoints.length === 1) return keyPoints[0].shots || 0;

    const sorted = [...keyPoints].sort((a, b) => a.d - b.d);

    if (distance <= sorted[0].d) return sorted[0].shots || 0;
    if (distance >= sorted[sorted.length - 1].d) {
      return sorted[sorted.length - 1].shots || 0;
    }

    for (let i = 0; i < sorted.length - 1; i++) {
      const p1 = sorted[i];
      const p2 = sorted[i + 1];
      if (distance >= p1.d && distance <= p2.d) {
        const range = p2.d - p1.d;
        if (range === 0) return p1.shots || 0;
        const t = (distance - p1.d) / range;
        return (p1.shots || 0) + t * ((p2.shots || 0) - (p1.shots || 0));
      }
    }

    return sorted[sorted.length - 1].shots || 0;
  }

  /**
   * 计算所有关键点的平均致死枪数
   * 
   * @param {Array} keyPoints - [{ d, shots }, ...]
   * @returns {number}
   */
  averageShots(keyPoints) {
    if (!keyPoints || keyPoints.length === 0) return 0;

    let totalShots = 0;
    let count = 0;

    for (const point of keyPoints) {
      if (point.shots !== undefined && point.shots !== null) {
        totalShots += point.shots;
        count++;
      }
    }

    return count > 0 ? totalShots / count : 0;
  }

  /**
   * 获取关键点中的子弹单价
   * 
   * @param {Array} keyPoints - [{ d, t, shots, bulletPrice }, ...]
   * @returns {number}
   */
  getBulletPrice(keyPoints) {
    if (!keyPoints || keyPoints.length === 0) return 0;
    return keyPoints[0]?.bulletPrice || 0;
  }

  // ============================================================
  // 6. 哈弗币消耗估算
  // ============================================================

  /**
   * 计算指定距离的哈弗币消耗估算
   * 
   * 公式：
   *   哈弗币消耗 = 整枪价格 × (1 - 撤离率) 
   *              + (KD × 5 × 平均致死枪数 + 其他消耗) × 子弹单价
   * 
   * @param {Array} keyPoints - 关键点数组
   * @param {number} distance - 目标距离
   * @param {Object} economicParams - 经济参数
   * @returns {Object} 消耗明细
   */
  calculateHavocCost(keyPoints, distance, economicParams = {}) {
    const {
      weaponPrice = 0,
      kdRatio = 1.0,
      extractRate = 0.5,
      extraCost = 30
    } = economicParams;

    const avgShots = this.interpolateShots(keyPoints, distance);
    const bulletPrice = this.getBulletPrice(keyPoints);

    const weaponLossCost = weaponPrice * (1 - extractRate);

    const effectiveKd = kdRatio * 5;
    const effectiveShots = effectiveKd * avgShots + extraCost;

    const bulletCost = effectiveShots * bulletPrice;

    const totalCost = weaponLossCost + bulletCost;

    return {
      totalCost,
      weaponLossCost,
      bulletCost,
      weaponPrice,
      avgShots,
      bulletPrice,
      effectiveShots,
      kdRatio,
      extractRate,
      extraCost
    };
  }

  /**
   * 计算所有关键点平均的哈弗币消耗估算
   * 
   * @param {Array} keyPoints - 关键点数组
   * @param {Object} economicParams - 经济参数
   * @returns {Object} 消耗明细
   */
  calculateHavocCostAverage(keyPoints, economicParams = {}) {
    const {
      weaponPrice = 0,
      kdRatio = 1.0,
      extractRate = 0.5,
      extraCost = 30
    } = economicParams;

    const avgShots = this.averageShots(keyPoints);
    const bulletPrice = this.getBulletPrice(keyPoints);

    const weaponLossCost = weaponPrice * (1 - extractRate);

    const effectiveKd = kdRatio * 5;
    const effectiveShots = effectiveKd * avgShots + extraCost;

    const bulletCost = effectiveShots * bulletPrice;

    const totalCost = weaponLossCost + bulletCost;

    return {
      totalCost,
      weaponLossCost,
      bulletCost,
      weaponPrice,
      avgShots,
      bulletPrice,
      effectiveShots,
      kdRatio,
      extractRate,
      extraCost
    };
  }

  // ============================================================
  // 7. 清理
  // ============================================================

  /**
   * 清空所有缓存
   */
  clearAll() {
    const cache = this.dataManager.getTtkCache();
    cache.v1 = {};
  }

  /**
   * 清空某个 weaponKey 的所有缓存
   * 
   * @param {string} weaponKey
   */
  clearWeapon(weaponKey) {
    const cache = this.dataManager.getTtkCache();
    if (cache.v1) {
      delete cache.v1[weaponKey];
    }
  }

  /**
   * 清空某个 weaponKey + bulletId 的所有缓存
   */
  clearWeaponBullet(weaponKey, bulletId) {
    const cache = this.dataManager.getTtkCache();
    if (cache?.v1?.[weaponKey]) {
      delete cache.v1[weaponKey][bulletId];
    }
  }

  // ============================================================
  // 8. 统计
  // ============================================================

  /**
   * 获取缓存统计
   * 
   * @returns {Object} {
   *   weaponCount: 武器 key 数,
   *   bulletCount: 子弹组合数,
   *   defenderCount: 甲头组合数,
   *   entryCount: 条目数（叶子节点数）,
   *   sizeKB: 估算大小（KB）,
   *   version: 当前缓存版本号
   * }
   */
  getStats() {
    const cache = this.dataManager.getTtkCache();
    if (!cache?.v1) {
      return {
        weaponCount: 0,
        bulletCount: 0,
        defenderCount: 0,
        entryCount: 0,
        sizeKB: 0,
        version: CACHE_VERSION
      };
    }

    const weaponKeys = Object.keys(cache.v1);
    let bulletCount = 0;
    let defenderCount = 0;
    let entryCount = 0;

    for (const wk of weaponKeys) {
      const bullets = Object.keys(cache.v1[wk]);
      bulletCount += bullets.length;

      for (const bid of bullets) {
        const defenders = Object.keys(cache.v1[wk][bid]);
        defenderCount += defenders.length;

        for (const dk of defenders) {
          entryCount += Object.keys(cache.v1[wk][bid][dk]).length;
        }
      }
    }

    // 估算大小：用 JSON.stringify 精确计算
    let sizeKB = 0;
    try {
      const json = JSON.stringify(cache);
      sizeKB = Math.round(json.length / 1024);
    } catch (e) {
      sizeKB = -1;
    }

    return {
      weaponCount: weaponKeys.length,
      bulletCount,
      defenderCount,
      entryCount,
      sizeKB,
      version: CACHE_VERSION
    };
  }

  /**
   * 在控制台打印缓存统计
   */
  printStats() {
    const stats = this.getStats();
    console.log('📊 TTK 缓存统计:');
    console.log(`   缓存版本: v${stats.version}`);
    console.log(`   武器配置: ${stats.weaponCount}`);
    console.log(`   子弹组合: ${stats.bulletCount}`);
    console.log(`   甲头组合: ${stats.defenderCount}`);
    console.log(`   缓存条目: ${stats.entryCount}`);
    console.log(`   估算大小: ${stats.sizeKB} KB`);
  }
}

// ============================================================
// 导出单例
// ============================================================

let instance = null;

/**
 * 获取 TtkCacheManager 单例
 * 
 * @param {DataManager} dataManager - DataManager 实例
 * @returns {TtkCacheManager}
 */
export function getTtkCacheManager(dataManager) {
  if (!instance) {
    instance = new TtkCacheManager(dataManager);
  }
  return instance;
}

export default TtkCacheManager;