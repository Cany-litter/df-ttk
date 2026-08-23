/**
 * 缓存管理器
 * 
 * 负责用户页面参数配置的自动保存和加载
 * 
 * 保存的内容（页面参数）：
 * - 子弹等级
 * - 护甲等级 / 护甲值
 * - 头盔等级 / 头盔值
 * - 生命值
 * - 距离
 * - 命中率
 * - 扳机延迟启用
 * - 命中概率（头部/胸部/腹部/四肢）
 * - 武器精校值（velocityPrecisionSettings）
 * 
 * 注意：武器数据、子弹数据、价格数据由 DataManager 管理，不在此保存
 */
export class CacheManager {
  constructor() {
    this.storageKey = 'ttk_calculator_config';
    this.defaultConfig = this.getDefaultConfig();
  }

  /**
   * 获取默认配置
   * @returns {Object} 默认配置对象
   */
  getDefaultConfig() {
    return {
      // 战斗参数
      bulletLevel: 4,
      armorLevel: 4,
      armorValue: 80,
      helmetLevel: 4,
      helmetValue: 35,
      distance: 30,
      healthValue: 100,
      hitRate: 0.85,
      triggerDelayEnable: true,
      
      // 命中概率
      hitProb: {
        head: 0.18,
        chest: 0.3,
        stomach: 0.22,
        limbs: 0.3
      },
      
      // 武器精校值（每个武器的枪口初速精校）
      velocityPrecisionSettings: {
        weaponSettings: {}
      }
    };
  }

  /**
   * 保存配置到本地存储
   * @param {Object} config - 要保存的配置对象
   */
  saveConfig(config) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(config));
    } catch (error) {
      console.error('保存配置失败:', error);
    }
  }

  /**
   * 从本地存储加载配置
   * @returns {Object} 加载的配置对象，如果失败则返回默认配置
   */
  loadConfig() {
    try {
      const savedConfig = localStorage.getItem(this.storageKey);
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        // 合并默认配置和保存的配置，确保新字段有默认值
        return { ...this.defaultConfig, ...parsedConfig };
      }
    } catch (error) {
      console.error('加载配置失败:', error);
    }
    return this.defaultConfig;
  }

  /**
   * 清除保存的配置
   */
  clearConfig() {
    try {
      localStorage.removeItem(this.storageKey);
      console.log('🗑️ 已清除页面参数缓存');
    } catch (error) {
      console.error('清除配置失败:', error);
    }
  }

  /**
   * 检查是否有保存的配置
   * @returns {boolean} 是否有保存的配置
   */
  hasSavedConfig() {
    return !!localStorage.getItem(this.storageKey);
  }

  /**
   * 获取保存的配置（仅当存在时）
   * @returns {Object|null} 保存的配置，如果不存在则返回 null
   */
  getSavedConfig() {
    try {
      const savedConfig = localStorage.getItem(this.storageKey);
      if (savedConfig) {
        return JSON.parse(savedConfig);
      }
    } catch (error) {
      console.error('读取配置失败:', error);
    }
    return null;
  }

  /**
   * 更新配置的部分字段（合并保存）
   * @param {Object} updates - 要更新的字段
   */
  updateConfig(updates) {
    const current = this.loadConfig();
    const merged = { ...current, ...updates };
    this.saveConfig(merged);
  }

  /**
   * 获取当前配置的深拷贝
   * @returns {Object} 配置对象的深拷贝
   */
  getConfig() {
    return JSON.parse(JSON.stringify(this.loadConfig()));
  }
}

// 导出单例
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

// 导出默认
export default CacheManager;