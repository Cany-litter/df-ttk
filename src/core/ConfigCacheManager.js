/**
 * 配置缓存管理器
 * 
 * 职责：
 * 1. 生成影响 TTK 计算的参数哈希
 * 2. 检查缓存有效性
 * 3. 关键点线性插值（供柱状图和折线图共用）
 * 4. 插值计算平均致死枪数
 * 5. 计算哈弗币消耗估算
 * 
 * 不负责：
 * - 缓存的读写（由 DataManager 负责）
 * - 模拟计算（由 SimulationEngine 负责）
 * 
 * ⭐ CACHE_VERSION：缓存结构版本号。
 *    任何影响"缓存内容含义/结构"的改动都应递增此版本号，
 *    从而让所有旧缓存立即失效（无需手动清理）。
 * 
 *    版本历史：
 *    - v1：初始版本
 *    - v2：连发字段纳入 hash（fireMode / burstCount / burstInternalROF / burstInterval）
 *    - v3：cache 对象新增 avgBurstInterval 字段（柱状图展示平均连发间隔）
 *    - v4：分段射速字段纳入 hash（rofStages）
 */

// ⭐ 缓存版本号（递增即强制所有旧缓存失效）
const CACHE_VERSION = 7;

export class ConfigCacheManager {
    constructor(dataManager) {
        this.dataManager = dataManager;
    }

    // ============================================================
    // 1. 参数哈希生成
    // ============================================================

    /**
     * 生成影响 TTK 计算的参数哈希
     * 
     * 包含所有影响 TTK 计算结果的参数：
     * - ⭐ 缓存版本号（CACHE_VERSION）
     * - 武器基础属性（rof, velocity, flesh, armor, ranges, mult, decays, triggerDelay）
     * - 连发字段（fireMode, burstCount, burstInternalROF, burstInterval）
     * - ⭐ 分段射速（rofStages）
     * - 枪管选择（barrelId，经过名字反查解析）
     * - 枪口选择（muzzleId，经过名字反查解析）
     * - 实际使用的子弹（包含口径 + 全局子弹等级）
     * - 战斗参数（护甲等级/值、头盔等级/值、生命值）
     * - 命中率映射（hitRateMap）
     * - 命中概率分布（hitProb）
     * - 扳机延迟开关（triggerDelayEnable）
     * - 精校值（precision）
     * 
     * @param {Object} weapon - 武器对象（已应用附件的"武装后"武器）
     * @param {Object} config - 价格配置
     * @param {Object} params - 战斗参数
     * @param {Object} attachment - 附件信息 { precision }
     * @returns {string} 参数哈希
     */
    generateParamsHash(weapon, config, params, attachment = {}) {
        // 提取武器关键属性（优先使用 _current 的当前值）
        const cur = weapon._current || weapon;

        // ⭐ 分段射速：标准化后参与 hash（保证顺序无关）
        const normalizedRofStages = this._normalizeRofStages(
            cur.rofStages ?? weapon.rofStages
        );

        const weaponKey = {
            id: weapon.id,
            rof: cur.rof,
            velocity: cur.velocity,
            flesh: cur.flesh,
            armor: cur.armor,
            ranges: cur.ranges || weapon.ranges || [],
            mult: cur.mult || weapon.mult || { head: 1.9, chest: 1, stomach: 0.9, limbs: 0.4 },
            decays: cur.decays || weapon.decays || [1, 0.9, 0.7, 0.7, 0.7],
            triggerDelay: weapon.triggerDelay || 0,

            // ⭐ 连发字段（优先读 _current，其次读 weapon 本身）
            fireMode: cur.fireMode ?? weapon.fireMode ?? null,
            burstCount: cur.burstCount ?? weapon.burstCount ?? null,
            burstInternalROF: cur.burstInternalROF ?? weapon.burstInternalROF ?? null,
            burstInterval: cur.burstInterval ?? weapon.burstInterval ?? null,

            // ⭐ 分段射速（标准化后）
            rofStages: normalizedRofStages
        };

        // ⭐ 获取实际使用的子弹 ID（包含全局子弹等级）
        let actualBulletId = config.bullet || '';
        
        // 如果没有指定子弹，根据口径和全局子弹等级查找
        if (!actualBulletId && weapon.allowedBullet && this.dataManager) {
            const bullet = this.dataManager.getBulletByCaliberAndLevel(
                weapon.allowedBullet,
                params.bulletLevel || 4
            );
            if (bullet) {
                actualBulletId = bullet.id;
            }
        }

        // ⭐ 解析 config 的 barrelId（兼容"只有 barrel 名字、没有 barrelId"的历史配置）
        let resolvedBarrelId = config.barrelId;
        if ((resolvedBarrelId === undefined || resolvedBarrelId === null || resolvedBarrelId < 0)
            && config.barrel && config.barrel !== '无' && this.dataManager) {
            const idx = this.dataManager.findBarrelIdByName(weapon.id, config.barrel);
            if (idx >= 0) resolvedBarrelId = idx;
        }
        if (resolvedBarrelId === undefined || resolvedBarrelId === null) {
            resolvedBarrelId = -1;
        }

        // ⭐ 解析 config 的 muzzleId（兼容只有 muzzle 名字的配置）
        let resolvedMuzzleId = config.muzzleId;
        if (resolvedMuzzleId === undefined || resolvedMuzzleId === null) {
            if (config.muzzle && config.muzzle !== '无' && this.dataManager) {
                const muzzles = this.dataManager.getMuzzles ? this.dataManager.getMuzzles() : [];
                const found = muzzles.find(m => m.name === config.muzzle);
                if (found) resolvedMuzzleId = found.id;
            }
        }
        if (resolvedMuzzleId === undefined || resolvedMuzzleId === null) {
            resolvedMuzzleId = 0;
        }

        // 命中概率排序（确保顺序不影响哈希）
        const hitProb = params.hitProb || { head: 0.1, chest: 0.3, stomach: 0.3, limbs: 0.3 };
        const sortedHitProb = {
            head: hitProb.head || 0,
            chest: hitProb.chest || 0,
            stomach: hitProb.stomach || 0,
            limbs: hitProb.limbs || 0
        };

        // 命中率映射排序
        const hitRateMap = params.hitRateMap || [];
        const sortedHitRateMap = [...hitRateMap]
            .sort((a, b) => a.distance - b.distance)
            .map(p => `${p.distance}:${p.rate}`)
            .join('|');

        // 构建哈希字符串
        const parts = [
            // ⭐ 缓存版本号（版本变更 → 所有旧缓存失效）
            `v${CACHE_VERSION}`,

            // 武器属性
            weaponKey.id,
            weaponKey.rof,
            weaponKey.velocity,
            weaponKey.flesh,
            weaponKey.armor,
            JSON.stringify(weaponKey.ranges),
            JSON.stringify(weaponKey.mult),
            JSON.stringify(weaponKey.decays),
            weaponKey.triggerDelay,

            // ⭐ 连发字段
            weaponKey.fireMode ?? '',
            weaponKey.burstCount ?? '',
            weaponKey.burstInternalROF ?? '',
            weaponKey.burstInterval ?? '',

            // ⭐ 分段射速（标准化后的 JSON）
            JSON.stringify(weaponKey.rofStages),
            
            // 配置选择（用解析后的值，与 getPriceRowsForWeapon 一致）
            resolvedBarrelId,
            resolvedMuzzleId,
            // ⭐ 关键修复：使用实际子弹 ID（包含全局子弹等级）
            actualBulletId || '',
            // ⭐ 额外包含子弹等级作为双重保险
            params.bulletLevel || 4,
            
            // 战斗参数
            params.armorLevel || 4,
            params.armorValue || 110,
            params.helmetLevel || 4,
            params.helmetValue || 48,
            params.healthValue || 100,
            
            // 命中率
            sortedHitRateMap,
            JSON.stringify(sortedHitProb),
            
            // 扳机延迟
            params.triggerDelayEnable ? '1' : '0',
            
            // 精校值
            (attachment.precision !== undefined ? attachment.precision : 0.09)
        ];

        return this._simpleHash(parts.join('|'));
    }

    /**
     * ⭐ 标准化 rofStages（用于 hash，保证顺序无关 / 结构稳定）
     * 
     * 输入可能为 null、undefined、非数组、数组含非法项，
     * 统一返回"规范化后的数组"或 null。
     * 
     * @param {any} rofStages
     * @returns {Array|null} 标准化后的 rofStages
     * @private
     */
    _normalizeRofStages(rofStages) {
        if (!Array.isArray(rofStages) || rofStages.length === 0) {
            return null;
        }

        return rofStages.map(stage => {
            if (!stage || typeof stage !== 'object') return { rofAdd: 0 };
            const normalized = { rofAdd: stage.rofAdd || 0 };
            if (stage.untilShot !== undefined && stage.untilShot !== null) {
                normalized.untilShot = stage.untilShot;
            }
            return normalized;
        });
    }

    /**
     * 简单哈希函数
     * @param {string} str - 输入字符串
     * @returns {string} 哈希字符串
     */
    _simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为 32 位整数
        }
        return 'h' + Math.abs(hash).toString(36);
    }

    // ============================================================
    // 2. 缓存有效性检查
    // ============================================================

    /**
     * 检查缓存是否有效
     * 
     * ⭐ 除 hash 匹配外，还要求缓存里必须有 avgBurstInterval 字段
     *    （旧版本 v2 缓存没有这个字段，即使 hash 碰巧匹配也应视为失效）
     * 
     * @param {Object} weapon - 武器对象（已应用附件的"武装后"武器）
     * @param {Object} config - 价格配置
     * @param {Object} params - 战斗参数
     * @param {Object} attachment - 附件信息 { precision }
     * @returns {boolean} 是否有效
     */
    isCacheValid(weapon, config, params, attachment = {}) {
        // 没有缓存数据
        if (!config.cache) return false;
        if (!config.cache.keyPoints || config.cache.keyPoints.length === 0) return false;
        if (!config.cache.hash) return false;

        // ⭐ 缓存结构完整性校验：必须有 avgBurstInterval 字段
        // （即使 hash 匹配，若字段缺失也视为旧缓存，需重算）
        if (config.cache.avgBurstInterval === undefined) return false;

        // 计算当前哈希
        const currentHash = this.generateParamsHash(weapon, config, params, attachment);
        
        // 比较哈希
        return config.cache.hash === currentHash;
    }

    /**
     * 检查配置是否需要重新计算
     * 结合修改标记和缓存有效性
     * 
     * @param {Object} weapon - 武器对象
     * @param {Object} config - 价格配置
     * @param {Object} params - 战斗参数
     * @param {Object} attachment - 附件信息
     * @param {Set} modifiedWeaponIds - 已修改的武器 ID 集合
     * @returns {Object} { needsRecalc, reason, cacheData }
     */
    checkCacheStatus(weapon, config, params, attachment, modifiedWeaponIds) {
        const weaponId = weapon.id;
        
        // 1. 检查是否被标记为已修改
        if (modifiedWeaponIds.has(weaponId)) {
            return {
                needsRecalc: true,
                reason: 'modified',
                cacheData: null
            };
        }

        // 2. 检查缓存是否存在且有效
        const isValid = this.isCacheValid(weapon, config, params, attachment);
        
        if (isValid) {
            return {
                needsRecalc: false,
                reason: 'hit',
                cacheData: config.cache
            };
        }

        // 3. 缓存无效（哈希不匹配或不存在）
        return {
            needsRecalc: true,
            reason: 'stale_or_missing',
            cacheData: null
        };
    }

    // ============================================================
    // 3. 插值计算 - TTK
    // ============================================================

    /**
     * 从关键点插值计算指定距离的 TTK
     * 
     * @param {Array} keyPoints - 关键点数组 [{ d, t }, ...]
     * @param {number} distance - 目标距离
     * @returns {number} 插值后的 TTK（毫秒）
     */
    interpolateTTK(keyPoints, distance) {
        if (!keyPoints || keyPoints.length === 0) {
            return 0;
        }

        // 如果只有一个点，直接返回
        if (keyPoints.length === 1) {
            return keyPoints[0].t;
        }

        // 按距离排序
        const sorted = [...keyPoints].sort((a, b) => a.d - b.d);

        // 如果目标距离小于最小距离
        if (distance <= sorted[0].d) {
            return sorted[0].t;
        }

        // 如果目标距离大于最大距离
        if (distance >= sorted[sorted.length - 1].d) {
            return sorted[sorted.length - 1].t;
        }

        // 找到两个相邻的关键点进行线性插值
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

        // 理论上不会到达这里
        return sorted[sorted.length - 1].t;
    }

    /**
     * 从关键点插值生成完整的距离-TTK 数组
     * 用于折线图绘制
     * 
     * @param {Array} keyPoints - 关键点数组 [{ d, t }, ...]
     * @param {number} maxDistance - 最大距离（默认 100）
     * @param {number} step - 步长（默认 1）
     * @returns {Array} 距离-TTK 数组 [{ d, t }, ...]
     */
    interpolateFullRange(keyPoints, maxDistance = 100, step = 1) {
        if (!keyPoints || keyPoints.length === 0) {
            return [];
        }

        const result = [];
        for (let d = 0; d <= maxDistance; d += step) {
            result.push({
                d: d,
                t: this.interpolateTTK(keyPoints, d)
            });
        }
        return result;
    }

    /**
     * 批量插值：为多个配置计算指定距离的 TTK
     * 用于柱状图
     * 
     * @param {Array} configsWithCache - 配置数组，每个包含 config.cache
     * @param {number} distance - 目标距离
     * @returns {Array} 每个配置的 TTK 值
     */
    batchInterpolate(configsWithCache, distance) {
        return configsWithCache.map(item => {
            const cache = item.config.cache;
            if (!cache || !cache.keyPoints) {
                return { ...item, ttk: null };
            }
            return {
                ...item,
                ttk: this.interpolateTTK(cache.keyPoints, distance)
            };
        });
    }

    // ============================================================
    // 4. 插值计算 - 平均致死枪数
    // ============================================================

    /**
     * 从关键点插值计算指定距离的平均致死枪数
     * 
     * @param {Array} keyPoints - 关键点数组 [{ d, t, shots }, ...]
     * @param {number} distance - 目标距离
     * @returns {number} 插值后的平均枪数
     */
    interpolateShots(keyPoints, distance) {
        if (!keyPoints || keyPoints.length === 0) {
            return 0;
        }

        // 如果只有一个点，直接返回
        if (keyPoints.length === 1) {
            return keyPoints[0].shots || 0;
        }

        // 按距离排序
        const sorted = [...keyPoints].sort((a, b) => a.d - b.d);

        // 如果目标距离小于最小距离
        if (distance <= sorted[0].d) {
            return sorted[0].shots || 0;
        }

        // 如果目标距离大于最大距离
        if (distance >= sorted[sorted.length - 1].d) {
            return sorted[sorted.length - 1].shots || 0;
        }

        // 线性插值
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
     * 用于哈弗币消耗估算
     * 
     * @param {Array} keyPoints - 关键点数组 [{ d, t, shots }, ...]
     * @returns {number} 所有关键点 shots 的平均值
     */
    averageShots(keyPoints) {
        if (!keyPoints || keyPoints.length === 0) {
            return 0;
        }

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
     * @param {Array} keyPoints - 关键点数组 [{ d, t, shots, bulletPrice }, ...]
     * @returns {number} 子弹单价
     */
    getBulletPrice(keyPoints) {
        if (!keyPoints || keyPoints.length === 0) {
            return 0;
        }
        return keyPoints[0]?.bulletPrice || 0;
    }

    // ============================================================
    // 5. 哈弗币消耗估算（KD 放大 5 倍）
    // ============================================================

    /**
     * 计算指定距离的哈弗币消耗估算
     * 
     * 公式：
     *   哈弗币消耗 = 整枪价格 × (1 - 撤离率) + (KD × 5 × 平均致死枪数 + 其他消耗) × 子弹单价
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
            totalCost: totalCost,
            weaponLossCost: weaponLossCost,
            bulletCost: bulletCost,
            weaponPrice: weaponPrice,
            avgShots: avgShots,
            bulletPrice: bulletPrice,
            effectiveShots: effectiveShots,
            kdRatio: kdRatio,
            extractRate: extractRate,
            extraCost: extraCost
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
            totalCost: totalCost,
            weaponLossCost: weaponLossCost,
            bulletCost: bulletCost,
            weaponPrice: weaponPrice,
            avgShots: avgShots,
            bulletPrice: bulletPrice,
            effectiveShots: effectiveShots,
            kdRatio: kdRatio,
            extractRate: extractRate,
            extraCost: extraCost
        };
    }

    // ============================================================
    // 6. 工具方法
    // ============================================================

    /**
     * 获取配置的缓存数据（通过 DataManager）
     */
    getCache(weaponId, configId) {
        return this.dataManager.getConfigCache(weaponId, configId);
    }

    /**
     * 保存缓存（通过 DataManager）
     */
    saveCache(weaponId, configId, keyPoints, hash) {
        return this.dataManager.saveConfigCache(weaponId, configId, {
            keyPoints,
            hash
        });
    }

    /**
     * 清除武器缓存（通过 DataManager）
     */
    clearWeaponCache(weaponId) {
        return this.dataManager.clearWeaponCache(weaponId);
    }

    /**
     * 获取缓存统计（通过 DataManager）
     */
    getStats() {
        return this.dataManager.getCacheStats();
    }
}

// ============================================================
// 导出单例
// ============================================================

let instance = null;

/**
 * 获取 ConfigCacheManager 单例
 * @param {DataManager} dataManager - DataManager 实例
 * @returns {ConfigCacheManager}
 */
export function getConfigCacheManager(dataManager) {
    if (!instance) {
        instance = new ConfigCacheManager(dataManager);
    }
    return instance;
}

export default ConfigCacheManager;