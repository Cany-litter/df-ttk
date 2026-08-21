/**
 * 武器数据存储管理器
 * 负责武器数据的导入导出（JSON 格式）
 * 
 * 适配新的 configs 结构：
 * - 导出时序列化 configs 数组
 * - 导入时反序列化 configs 数组
 * - 处理 Infinity 值的序列化/反序列化
 */
export class WeaponStorage {
  constructor() {
    this.storageKey = 'ttk_weapon_data';
  }

  /**
   * 导出武器数据为 JSON 字符串
   * @param {Array} weapons - 武器数据数组
   * @returns {string|null} JSON 字符串
   */
  exportToJSON(weapons) {
    try {
      const serializable = weapons.map(w => this.serializeWeapon(w));
      return JSON.stringify(serializable, null, 2);
    } catch (error) {
      console.error('导出 JSON 失败:', error);
      return null;
    }
  }

  /**
   * 从 JSON 字符串导入武器数据
   * @param {string} jsonStr - JSON 字符串
   * @returns {Array|null} 武器数据数组
   */
  importFromJSON(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('无效的数据格式');
      }
      return parsed.map(w => this.deserializeWeapon(w));
    } catch (error) {
      console.error('导入 JSON 失败:', error);
      return null;
    }
  }

  /**
   * 序列化武器对象（处理 Infinity 和特殊值）
   * @param {Object} weapon - 武器对象
   * @returns {Object} 序列化后的武器对象
   */
  serializeWeapon(weapon) {
    const serialized = { ...weapon };
    
    // 处理主 ranges
    if (serialized.ranges) {
      serialized.ranges = serialized.ranges.map(r => 
        r === Infinity ? 'Infinity' : r
      );
    }
    
    // 处理 barrels 中的嵌套数据
    if (Array.isArray(serialized.barrels)) {
      serialized.barrels = serialized.barrels.map(barrel => {
        const b = { ...barrel };
        
        // 处理 barrel 中的 ranges
        if (Array.isArray(b.ranges)) {
          b.ranges = b.ranges.map(r => 
            r === Infinity ? 'Infinity' : r
          );
        }
        
        // 处理 barrel 中的 decays
        if (Array.isArray(b.decays)) {
          b.decays = b.decays.map(d => 
            d === Infinity ? 'Infinity' : d
          );
        }
        
        return b;
      });
    }
    
    // 处理 decays
    if (Array.isArray(serialized.decays)) {
      serialized.decays = serialized.decays.map(d => 
        d === Infinity ? 'Infinity' : d
      );
    }
    
    // 处理 configs（新增）
    if (Array.isArray(serialized.configs)) {
      serialized.configs = serialized.configs.map(config => {
        const c = { ...config };
        // 命中率点不需要特殊处理（都是数字）
        // 但确保 hitRatePoints 是数组
        if (!Array.isArray(c.hitRatePoints)) {
          c.hitRatePoints = [];
        }
        return c;
      });
    }
    
    // 移除废弃字段（如果有）
    delete serialized.variants;
    delete serialized.clonedWeapons;
    
    return serialized;
  }

  /**
   * 反序列化武器对象（恢复 Infinity）
   * @param {Object} weapon - 序列化的武器对象
   * @returns {Object} 反序列化后的武器对象
   */
  deserializeWeapon(weapon) {
    const deserialized = { ...weapon };
    
    // 恢复主 ranges
    if (deserialized.ranges) {
      deserialized.ranges = deserialized.ranges.map(r => 
        r === 'Infinity' ? Infinity : r
      );
    }
    
    // 恢复 barrels 中的嵌套数据
    if (Array.isArray(deserialized.barrels)) {
      deserialized.barrels = deserialized.barrels.map(barrel => {
        const b = { ...barrel };
        
        // 恢复 barrel 中的 ranges
        if (Array.isArray(b.ranges)) {
          b.ranges = b.ranges.map(r => 
            r === 'Infinity' ? Infinity : r
          );
        }
        
        // 恢复 barrel 中的 decays
        if (Array.isArray(b.decays)) {
          b.decays = b.decays.map(d => 
            d === 'Infinity' ? Infinity : d
          );
        }
        
        // 恢复数值字段（防止字符串）
        if (b.rangeMult !== undefined && typeof b.rangeMult === 'string') {
          b.rangeMult = parseFloat(b.rangeMult) || 1.0;
        }
        if (b.rangeAdd !== undefined && typeof b.rangeAdd === 'string') {
          b.rangeAdd = parseFloat(b.rangeAdd) || 0;
        }
        if (b.velocityMult !== undefined && typeof b.velocityMult === 'string') {
          b.velocityMult = parseFloat(b.velocityMult) || 1.0;
        }
        if (b.velocityAdd !== undefined && typeof b.velocityAdd === 'string') {
          b.velocityAdd = parseFloat(b.velocityAdd) || 0;
        }
        if (b.rofMult !== undefined && typeof b.rofMult === 'string') {
          b.rofMult = parseFloat(b.rofMult) || 1.0;
        }
        if (b.damageBonus !== undefined && typeof b.damageBonus === 'string') {
          b.damageBonus = parseFloat(b.damageBonus) || 0;
        }
        if (b.armorDamageBonus !== undefined && typeof b.armorDamageBonus === 'string') {
          b.armorDamageBonus = parseFloat(b.armorDamageBonus) || 0;
        }
        if (b.triggerDelayDelta !== undefined && typeof b.triggerDelayDelta === 'string') {
          b.triggerDelayDelta = parseFloat(b.triggerDelayDelta) || 0;
        }
        if (b.burstCount !== undefined && typeof b.burstCount === 'string') {
          b.burstCount = parseInt(b.burstCount) || 3;
        }
        if (b.burstInternalROF !== undefined && typeof b.burstInternalROF === 'string') {
          b.burstInternalROF = parseInt(b.burstInternalROF) || 800;
        }
        if (b.burstInterval !== undefined && typeof b.burstInterval === 'string') {
          b.burstInterval = parseFloat(b.burstInterval) || 0.1;
        }
        
        return b;
      });
    }
    
    // 恢复 decays
    if (Array.isArray(deserialized.decays)) {
      deserialized.decays = deserialized.decays.map(d => 
        d === 'Infinity' ? Infinity : d
      );
    }
    
    // 恢复 configs（新增）
    if (Array.isArray(deserialized.configs)) {
      deserialized.configs = deserialized.configs.map(config => {
        const c = { ...config };
        // 确保必要字段存在
        if (c.id === undefined) c.id = 'cfg-1';
        if (c.code === undefined) c.code = `${deserialized.name}-01`;
        if (c.price === undefined) c.price = 0;
        if (c.selectedBarrel === undefined) c.selectedBarrel = 0;
        if (c.selectedMuzzle === undefined) c.selectedMuzzle = 0;
        if (c.precision === undefined) c.precision = 0.09;
        if (!Array.isArray(c.hitRatePoints)) c.hitRatePoints = [];
        if (c.bulletType === undefined) c.bulletType = 4;
        if (c.ammoCount === undefined) c.ammoCount = 120;
        return c;
      });
    } else {
      // 如果没有 configs，创建一个默认的
      deserialized.configs = [{
        id: 'cfg-1',
        code: `${deserialized.name || 'Weapon'}-01`,
        price: 0,
        selectedBarrel: 0,
        selectedMuzzle: 0,
        precision: 0.09,
        hitRatePoints: [],
        bulletType: 4,
        ammoCount: 120
      }];
    }
    
    // 移除废弃字段
    delete deserialized.variants;
    delete deserialized.clonedWeapons;
    delete deserialized.selectedBarrel;
    delete deserialized.selectedMuzzle;
    delete deserialized.precision;
    
    return deserialized;
  }

  /**
   * 下载武器数据为 JSON 文件
   * @param {Array} weapons - 武器数据数组
   * @param {string} filename - 文件名（可选）
   */
  downloadJSON(weapons, filename = null) {
    const jsonStr = this.exportToJSON(weapons);
    if (!jsonStr) {
      alert('导出失败！');
      return;
    }
    
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `ttk_weapons_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * 从文件上传 JSON 数据
   * @param {File} file - 文件对象
   * @returns {Promise<Array|null>} 武器数据数组
   */
  uploadJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = this.importFromJSON(event.target.result);
          if (data) {
            resolve(data);
          } else {
            reject(new Error('数据格式无效'));
          }
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

  // ==================== 兼容性方法（已废弃） ====================

  /**
   * @deprecated 不再使用 localStorage 自动保存
   */
  saveWeapons(weapons) {
    console.warn('⚠️ saveWeapons 已废弃，不再自动保存到 localStorage');
    return false;
  }

  /**
   * @deprecated 不再使用 localStorage 自动加载
   */
  loadWeapons(defaultWeapons) {
    console.warn('⚠️ loadWeapons 已废弃，不再从 localStorage 加载');
    return defaultWeapons;
  }

  /**
   * @deprecated 清除保存的数据
   */
  clearSavedData() {
    localStorage.removeItem(this.storageKey);
    console.log('🗑️ 已清除 localStorage 中的武器数据');
  }

  /**
   * @deprecated 检查是否有保存的数据
   */
  hasSavedData() {
    return !!localStorage.getItem(this.storageKey);
  }
}