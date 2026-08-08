/**
 * 武器数据存储管理器
 * 现在只用于导出/导入功能，不再自动保存到 localStorage
 */
export class WeaponStorage {
  constructor() {
    this.storageKey = 'ttk_weapon_data';
  }

  /**
   * 导出武器数据为 JSON 字符串（用于导出功能）
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
   * 从 JSON 字符串导入武器数据（用于导入功能）
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
   * 序列化武器对象（处理 Infinity）
   * @param {Object} weapon - 武器对象
   * @returns {Object} 序列化后的武器对象
   */
  serializeWeapon(weapon) {
    const serialized = { ...weapon };
    if (serialized.ranges) {
      serialized.ranges = serialized.ranges.map(r => 
        r === Infinity ? 'Infinity' : r
      );
    }
    // 处理 barrels 中的 ranges（如果有）
    if (Array.isArray(serialized.barrels)) {
      serialized.barrels = serialized.barrels.map(barrel => {
        const b = { ...barrel };
        if (Array.isArray(b.ranges)) {
          b.ranges = b.ranges.map(r => 
            r === Infinity ? 'Infinity' : r
          );
        }
        return b;
      });
    }
    return serialized;
  }

  /**
   * 反序列化武器对象（恢复 Infinity）
   * @param {Object} weapon - 序列化的武器对象
   * @returns {Object} 反序列化后的武器对象
   */
  deserializeWeapon(weapon) {
    const deserialized = { ...weapon };
    if (deserialized.ranges) {
      deserialized.ranges = deserialized.ranges.map(r => 
        r === 'Infinity' ? Infinity : r
      );
    }
    // 处理 barrels 中的 ranges（如果有）
    if (Array.isArray(deserialized.barrels)) {
      deserialized.barrels = deserialized.barrels.map(barrel => {
        const b = { ...barrel };
        if (Array.isArray(b.ranges)) {
          b.ranges = b.ranges.map(r => 
            r === 'Infinity' ? Infinity : r
          );
        }
        return b;
      });
    }
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

  // ========== 以下方法已废弃，保留用于兼容性，但不再使用 ==========

  /**
   * @deprecated 不再使用 localStorage 自动保存，此方法仅用于兼容
   */
  saveWeapons(weapons) {
    console.warn('⚠️ saveWeapons 已废弃，不再自动保存到 localStorage');
    return false;
  }

  /**
   * @deprecated 不再使用 localStorage 自动加载，此方法仅用于兼容
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

  /**
   * @deprecated 验证武器数据
   */
  validateWeaponData(weapons) {
    console.warn('⚠️ validateWeaponData 已废弃');
    return weapons;
  }

  /**
   * @deprecated 合并保存的数据与默认数据
   */
  mergeWithDefaults(savedWeapons, defaultWeapons) {
    console.warn('⚠️ mergeWithDefaults 已废弃');
    return defaultWeapons;
  }
}