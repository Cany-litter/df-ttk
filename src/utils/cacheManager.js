/**
 * 缓存管理器
 * 负责用户参数配置的自动保存和加载
 * 
 * 适配新的 configs 结构：
 * - 保存武器级别的配置（globalBarrelType 等）
 * - 不保存武器数据本身（由武器数据文件管理）
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
      // 基础战斗参数
      bulletLevel: 4,
      armorLevel: 4,
      armorValue: 80,
      helmetLevel: 4,
      helmetValue: 35,
      distance: 30,
      healthValue: 100,
      
      // 命中概率
      hitProb: {
        head: 0.18,
        chest: 0.3,
        stomach: 0.22,
        limbs: 0.3
      },
      
      // 命中率与延迟
      hitRate: 0.85,
      triggerDelayEnable: true,
      
      // 全局设置
      globalBarrelType: 'longest',
      
      // 武器级别的精校设置（每个武器的默认精校值）
      // 注意：实际精校值存储在武器的 configs 中，这里只保存全局默认值
      velocityPrecisionSettings: {
        // 格式: { weaponName: precisionValue }
        // 例如: { "AK-12": 0.09, "M4A1": 0.05 }
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
      // 只保存用户可配置的参数，不保存武器数据
      const configToSave = {
        bulletLevel: config.bulletLevel,
        armorLevel: config.armorLevel,
        armorValue: config.armorValue,
        helmetLevel: config.helmetLevel,
        helmetValue: config.helmetValue,
        distance: config.distance,
        healthValue: config.healthValue,
        hitProb: config.hitProb,
        hitRate: config.hitRate,
        triggerDelayEnable: config.triggerDelayEnable,
        globalBarrelType: config.globalBarrelType,
        // 只保存用户自定义的武器精校设置
        velocityPrecisionSettings: config.velocityPrecisionSettings || { weaponSettings: {} }
      };
      localStorage.setItem(this.storageKey, JSON.stringify(configToSave));
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
      console.log('🗑️ 已清除保存的配置');
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
   * 获取特定武器的精校设置
   * @param {string} weaponName - 武器名称
   * @param {number} defaultPrecision - 默认精校值
   * @returns {number} 精校值
   */
  getWeaponPrecision(weaponName, defaultPrecision = 0.09) {
    const config = this.loadConfig();
    const settings = config.velocityPrecisionSettings?.weaponSettings || {};
    return settings[weaponName] !== undefined ? settings[weaponName] : defaultPrecision;
  }

  /**
   * 设置特定武器的精校值
   * @param {string} weaponName - 武器名称
   * @param {number} precision - 精校值
   */
  setWeaponPrecision(weaponName, precision) {
    const config = this.loadConfig();
    if (!config.velocityPrecisionSettings) {
      config.velocityPrecisionSettings = { weaponSettings: {} };
    }
    config.velocityPrecisionSettings.weaponSettings[weaponName] = precision;
    this.saveConfig(config);
  }
}