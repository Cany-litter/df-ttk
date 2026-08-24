/**
 * 缓存管理器
 * 
 * 负责 TTK 计算结果的缓存管理，包括：
 * 1. 内存缓存 (Map) - 运行时快速访问
 * 2. 缓存 Key 构建 - 基于武器 + 附件 + 参数生成唯一标识
 * 3. 导出缓存 - 将内存缓存导出为 JSON 文件
 * 4. 导入缓存 - 从 JSON 文件加载缓存
 * 5. 缓存统计 - 命中率、条目数等
 * 
 * 缓存粒度：每个武器 + 每个距离点 + 每个参数组合
 */

export class CacheManager {
    constructor() {
        this.memoryCache = new Map();
        this.maxSize = 50000;          // 最大缓存条目数
        this.hits = 0;
        this.misses = 0;
        this._stats = {
            loadedFromFile: false,
            filePath: null,
            exportedAt: null
        };
    }

    // ============================================================
    // 1. 缓存 Key 构建
    // ============================================================

    /**
     * 构建缓存 Key
     * 包含所有影响 TTK 计算结果的参数
     * 
     * @param {Object} weapon - 武器对象
     * @param {Object} params - 计算参数
     * @param {Object} attachment - 附件配置 { barrelName, muzzleName, bulletId }
     * @returns {string} 缓存 Key
     */
    buildKey(weapon, params, attachment = {}) {
        const {
            barrelName = '无',
            muzzleName = '无',
            bulletId = 'default'
        } = attachment;

        // 部位命中概率排序，确保顺序不影响 Key
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

        // 构建 Key
        const parts = [
            weapon.id || weapon.name || 'unknown',
            barrelName,
            muzzleName,
            bulletId,
            params.armorLevel || 4,
            params.armorValue || 110,
            params.helmetLevel || 4,
            params.helmetValue || 48,
            params.healthValue || 100,
            params.distance || 30,
            params.hitRate || 0.85,
            JSON.stringify(sortedHitProb),
            sortedHitRateMap,
            params.triggerDelayEnable ? '1' : '0',
            params.bulletLevel || 4
        ];

        return parts.join('|');
    }

    /**
     * 构建折线图批量缓存 Key（用于真实模拟）
     * 包含武器 + 附件 + 除距离外的所有参数
     * 
     * @param {Object} weapon - 武器对象
     * @param {Object} params - 计算参数（不包含 distance）
     * @param {Object} attachment - 附件配置
     * @returns {string} 批量缓存 Key
     */
    buildBatchKey(weapon, params, attachment = {}) {
        const {
            barrelName = '无',
            muzzleName = '无',
            bulletId = 'default'
        } = attachment;

        const hitProb = params.hitProb || { head: 0.1, chest: 0.3, stomach: 0.3, limbs: 0.3 };
        const sortedHitProb = {
            head: hitProb.head || 0,
            chest: hitProb.chest || 0,
            stomach: hitProb.stomach || 0,
            limbs: hitProb.limbs || 0
        };

        const hitRateMap = params.hitRateMap || [];
        const sortedHitRateMap = [...hitRateMap]
            .sort((a, b) => a.distance - b.distance)
            .map(p => `${p.distance}:${p.rate}`)
            .join('|');

        const parts = [
            weapon.id || weapon.name || 'unknown',
            barrelName,
            muzzleName,
            bulletId,
            params.armorLevel || 4,
            params.armorValue || 110,
            params.helmetLevel || 4,
            params.helmetValue || 48,
            params.healthValue || 100,
            JSON.stringify(sortedHitProb),
            sortedHitRateMap,
            params.triggerDelayEnable ? '1' : '0',
            params.bulletLevel || 4
        ];

        return parts.join('|');
    }

    // ============================================================
    // 2. 缓存操作
    // ============================================================

    /**
     * 获取缓存
     * @param {string} key - 缓存 Key
     * @returns {*} 缓存值，不存在则返回 null
     */
    get(key) {
        if (this.memoryCache.has(key)) {
            this.hits++;
            return this.memoryCache.get(key);
        }
        this.misses++;
        return null;
    }

    /**
     * 设置缓存
     * @param {string} key - 缓存 Key
     * @param {*} value - 缓存值
     */
    set(key, value) {
        // LRU 淘汰：如果超过最大容量，删除最早的 20%
        if (this.memoryCache.size >= this.maxSize) {
            const entries = Array.from(this.memoryCache.keys());
            const toDelete = Math.floor(entries.length * 0.2);
            for (let i = 0; i < toDelete; i++) {
                this.memoryCache.delete(entries[i]);
            }
            console.log(`🗑️ 缓存已满，淘汰 ${toDelete} 条旧条目`);
        }
        this.memoryCache.set(key, value);
    }

    /**
     * 检查缓存是否存在
     * @param {string} key - 缓存 Key
     * @returns {boolean} 是否存在
     */
    has(key) {
        return this.memoryCache.has(key);
    }

    /**
     * 批量获取缓存（用于折线图）
     * @param {Array} keys - 缓存 Key 数组
     * @returns {Map} 命中的缓存 Map
     */
    getBatch(keys) {
        const results = new Map();
        for (const key of keys) {
            const value = this.get(key);
            if (value !== null) {
                results.set(key, value);
            }
        }
        return results;
    }

    /**
     * 批量设置缓存
     * @param {Map} entries - 缓存条目 Map
     */
    setBatch(entries) {
        for (const [key, value] of entries) {
            this.set(key, value);
        }
    }

    // ============================================================
    // 3. 缓存清除
    // ============================================================

    /**
     * 清除所有缓存
     */
    clear() {
        const count = this.memoryCache.size;
        this.memoryCache.clear();
        this.hits = 0;
        this.misses = 0;
        this._stats.loadedFromFile = false;
        this._stats.filePath = null;
        this._stats.exportedAt = null;
        console.log(`🗑️ 已清除 ${count} 条缓存`);
        return count;
    }

    /**
     * 清除特定武器的缓存
     * @param {string|number} weaponId - 武器 ID
     * @returns {number} 清除的条目数
     */
    invalidateWeapon(weaponId) {
        let count = 0;
        const weaponIdStr = String(weaponId);
        for (const key of this.memoryCache.keys()) {
            if (key.startsWith(weaponIdStr + '|')) {
                this.memoryCache.delete(key);
                count++;
            }
        }
        console.log(`🗑️ 已清除武器 ${weaponId} 的 ${count} 条缓存`);
        return count;
    }

    /**
     * 清除特定附件配置的缓存
     * @param {string|number} weaponId - 武器 ID
     * @param {string} barrelName - 枪管名称
     * @param {string} muzzleName - 枪口名称
     * @returns {number} 清除的条目数
     */
    invalidateAttachment(weaponId, barrelName, muzzleName) {
        let count = 0;
        const prefix = `${weaponId}|${barrelName}|${muzzleName}|`;
        for (const key of this.memoryCache.keys()) {
            if (key.startsWith(prefix)) {
                this.memoryCache.delete(key);
                count++;
            }
        }
        return count;
    }

    // ============================================================
    // 4. 缓存导入/导出
    // ============================================================

    /**
     * 导出缓存为 JSON 对象
     * @param {Object} meta - 元数据（武器名称、计算参数等）
     * @returns {Object} 缓存数据对象
     */
    exportToObject(meta = {}) {
        const data = {
            version: '1.0',
            exportedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
            meta: {
                weaponName: meta.weaponName || '未知武器',
                weaponId: meta.weaponId || null,
                barrelName: meta.barrelName || '无',
                muzzleName: meta.muzzleName || '无',
                bulletId: meta.bulletId || 'default',
                distancePoints: meta.distancePoints || 101,
                simCount: meta.simCount || 20000,
                description: 'TTK 折线图真实模拟缓存数据'
            },
            params: {
                armorLevel: meta.params?.armorLevel || 4,
                armorValue: meta.params?.armorValue || 110,
                helmetLevel: meta.params?.helmetLevel || 4,
                helmetValue: meta.params?.helmetValue || 48,
                healthValue: meta.params?.healthValue || 100,
                hitProb: meta.params?.hitProb || { head: 0.1, chest: 0.3, stomach: 0.3, limbs: 0.3 },
                hitRateMap: meta.params?.hitRateMap || [],
                triggerDelayEnable: meta.params?.triggerDelayEnable !== undefined ? meta.params.triggerDelayEnable : true,
                bulletLevel: meta.params?.bulletLevel || 4
            },
            cache: []
        };

        // 将 Map 转换为数组
        for (const [key, value] of this.memoryCache) {
            data.cache.push({ key, value });
        }

        return data;
    }

    /**
     * 导出缓存为 JSON 文件（下载）
     * @param {Object} meta - 元数据
     */
    exportToFile(meta = {}) {
        const data = this.exportToObject(meta);
        const jsonStr = JSON.stringify(data, null, 2);

        // 生成文件名
        const weaponName = meta.weaponName || 'unknown';
        const dateStr = new Date().toISOString().slice(0, 10);
        const filename = `ttk_cache_${weaponName}_${dateStr}.json`;

        // 下载
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`✅ 已导出缓存: ${filename} (${data.cache.length} 条)`);
        this._stats.exportedAt = data.exportedAt;
        return filename;
    }

    /**
     * 从 JSON 对象导入缓存
     * @param {Object} data - 缓存数据对象
     * @returns {Object} 导入统计信息
     */
    importFromObject(data) {
        if (!data || !data.cache || !Array.isArray(data.cache)) {
            throw new Error('无效的缓存数据格式');
        }

        if (data.version !== '1.0') {
            console.warn(`⚠️ 缓存版本不匹配: ${data.version}，尝试导入...`);
        }

        let imported = 0;
        let skipped = 0;

        for (const entry of data.cache) {
            if (entry.key && entry.value !== undefined) {
                if (this.memoryCache.has(entry.key)) {
                    skipped++;
                } else {
                    this.memoryCache.set(entry.key, entry.value);
                    imported++;
                }
            }
        }

        this._stats.loadedFromFile = true;
        this._stats.filePath = data.meta?.weaponName || '未知';
        this._stats.exportedAt = data.exportedAt || null;

        console.log(`✅ 已导入缓存: ${imported} 条新条目, ${skipped} 条已存在`);

        return {
            imported,
            skipped,
            total: data.cache.length,
            weaponName: data.meta?.weaponName || '未知',
            exportedAt: data.exportedAt
        };
    }

    /**
     * 从 JSON 文件导入缓存
     * @param {File} file - JSON 文件
     * @returns {Promise<Object>} 导入统计信息
     */
    importFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    const result = this.importFromObject(data);
                    resolve(result);
                } catch (error) {
                    reject(new Error(`解析缓存文件失败: ${error.message}`));
                }
            };
            reader.onerror = () => {
                reject(new Error('读取文件失败'));
            };
            reader.readAsText(file);
        });
    }

    // ============================================================
    // 5. 缓存统计
    // ============================================================

    /**
     * 获取缓存统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        const total = this.hits + this.misses;
        return {
            size: this.memoryCache.size,
            maxSize: this.maxSize,
            hits: this.hits,
            misses: this.misses,
            hitRate: total > 0 ? (this.hits / total * 100).toFixed(1) + '%' : '0%',
            loadedFromFile: this._stats.loadedFromFile,
            filePath: this._stats.filePath,
            exportedAt: this._stats.exportedAt
        };
    }

    /**
     * 输出缓存统计信息到控制台
     */
    logStats() {
        const stats = this.getStats();
        const fileInfo = stats.loadedFromFile
            ? ` (已导入: ${stats.filePath})`
            : '';
        console.log(
            `📊 缓存统计: ${stats.size} 条, ` +
            `命中 ${stats.hits} 次, ` +
            `命中率 ${stats.hitRate}${fileInfo}`
        );
        if (stats.exportedAt) {
            console.log(`   📅 最后导出: ${stats.exportedAt}`);
        }
    }

    /**
     * 获取缓存大小（字节）
     * @returns {number} 缓存大小（字节）
     */
    getSizeInBytes() {
        let total = 0;
        for (const [key, value] of this.memoryCache) {
            total += key.length * 2; // 粗略估算
            if (typeof value === 'object') {
                total += JSON.stringify(value).length * 2;
            } else {
                total += String(value).length * 2;
            }
        }
        return total;
    }

    /**
     * 获取缓存大小（可读格式）
     * @returns {string} 可读的大小字符串
     */
    getSizeReadable() {
        const bytes = this.getSizeInBytes();
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    // ============================================================
    // 6. 工具方法
    // ============================================================

    /**
     * 检查缓存是否包含特定武器的数据
     * @param {string|number} weaponId - 武器 ID
     * @returns {number} 该武器的缓存条目数
     */
    countWeaponCache(weaponId) {
        let count = 0;
        const prefix = String(weaponId) + '|';
        for (const key of this.memoryCache.keys()) {
            if (key.startsWith(prefix)) {
                count++;
            }
        }
        return count;
    }

    /**
     * 获取所有缓存的武器 ID 列表
     * @returns {Array} 武器 ID 列表
     */
    getCachedWeaponIds() {
        const ids = new Set();
        for (const key of this.memoryCache.keys()) {
            const firstPart = key.split('|')[0];
            if (firstPart) {
                ids.add(firstPart);
            }
        }
        return Array.from(ids);
    }

    /**
     * 打印缓存内容摘要（调试用）
     */
    debug() {
        console.log('=== 缓存调试信息 ===');
        console.log(`总数: ${this.memoryCache.size}`);
        console.log(`武器: ${this.getCachedWeaponIds().join(', ')}`);
        console.log(`大小: ${this.getSizeReadable()}`);
        console.log('====================');
    }
}

// ============================================================
// 导出单例
// ============================================================

let cacheManagerInstance = null;

/**
 * 获取 CacheManager 单例
 * @returns {CacheManager} CacheManager 实例
 */
export function getCacheManager() {
    if (!cacheManagerInstance) {
        cacheManagerInstance = new CacheManager();
    }
    return cacheManagerInstance;
}

export default CacheManager;