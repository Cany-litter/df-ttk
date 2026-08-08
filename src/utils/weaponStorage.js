/**
 * 武器数据存储管理器
 * 负责武器数据的保存和加载
 */
export class WeaponStorage {
  constructor() {
    this.storageKey = 'ttk_weapon_data';
    this.defaultWeaponData = this.getDefaultWeaponData();
  }

  /**
   * 获取默认武器数据（从 weapons.js 读取）
   */
  getDefaultWeaponData() {
    // 这个会在初始化时从 weapons.js 读取
    return null;
  }

  /**
   * 保存所有武器数据
   * @param {Array} weapons - 武器数据数组
   * @returns {boolean} 是否保存成功
   */
  saveWeapons(weapons) {
    try {
      // 在保存前验证数据
      const validatedWeapons = this.validateWeaponData(weapons);
      
      // 深拷贝数据，去除不可序列化的属性
      const serializableData = validatedWeapons.map(w => this.serializeWeapon(w));
      localStorage.setItem(this.storageKey, JSON.stringify(serializableData));
      return true;
    } catch (error) {
      console.error('保存武器数据失败:', error);
      return false;
    }
  }

  /**
   * 验证武器数据，防止保存异常值
   * @param {Array} weapons - 武器数据数组
   * @returns {Array} 验证后的武器数据
   */
  validateWeaponData(weapons) {
    if (!Array.isArray(weapons) || weapons.length === 0) {
      return weapons;
    }

    return weapons.map((w, index) => {
      const validated = { ...w };
      
      // 验证必要字段是否存在
      if (!validated.name) {
        console.warn(`武器 ${index} 缺少名称，使用默认值`);
        validated.name = `武器 ${index + 1}`;
      }
      
      if (!validated.type) {
        validated.type = '步枪';
      }
      
      // 验证数值字段
      if (typeof validated.velocity !== 'number' || validated.velocity < 100 || validated.velocity > 2000) {
        console.warn(`武器 "${validated.name}" 的初速异常 (${validated.velocity})，使用默认值 575`);
        validated.velocity = 575;
      }
      
      if (typeof validated.rof !== 'number' || validated.rof < 100 || validated.rof > 3000) {
        console.warn(`武器 "${validated.name}" 的射速异常 (${validated.rof})，使用默认值 600`);
        validated.rof = 600;
      }
      
      if (typeof validated.flesh !== 'number' || validated.flesh < 1 || validated.flesh > 200) {
        console.warn(`武器 "${validated.name}" 的肉伤异常 (${validated.flesh})，使用默认值 30`);
        validated.flesh = 30;
      }
      
      if (typeof validated.armor !== 'number' || validated.armor < 1 || validated.armor > 200) {
        console.warn(`武器 "${validated.name}" 的甲伤异常 (${validated.armor})，使用默认值 35`);
        validated.armor = 35;
      }
      
      // 验证射程数组
      if (!Array.isArray(validated.ranges) || validated.ranges.length !== 4) {
        console.warn(`武器 "${validated.name}" 的射程格式异常，使用默认值`);
        validated.ranges = [40, 70, Infinity, Infinity];
      } else {
        validated.ranges = validated.ranges.map(r => {
          if (r === Infinity) return Infinity;
          if (typeof r === 'number' && r > 0) return r;
          return 40;
        });
      }
      
      // 验证衰减系数数组
      if (!Array.isArray(validated.decays) || validated.decays.length !== 5) {
        console.warn(`武器 "${validated.name}" 的衰减系数格式异常，使用默认值`);
        validated.decays = [1.0, 0.85, 0.7, 0.7, 0.7];
      } else {
        validated.decays = validated.decays.map(d => {
          if (typeof d === 'number' && d >= 0 && d <= 1) return d;
          return 0.7;
        });
      }
      
      // 验证部位倍率
      if (!validated.mult || typeof validated.mult !== 'object') {
        validated.mult = { head: 1.9, chest: 1, stomach: 0.9, limbs: 0.4 };
      } else {
        if (typeof validated.mult.head !== 'number' || validated.mult.head < 0.1) validated.mult.head = 1.9;
        if (typeof validated.mult.chest !== 'number' || validated.mult.chest < 0.1) validated.mult.chest = 1;
        if (typeof validated.mult.stomach !== 'number' || validated.mult.stomach < 0.1) validated.mult.stomach = 0.9;
        if (typeof validated.mult.limbs !== 'number' || validated.mult.limbs < 0.1) validated.mult.limbs = 0.4;
      }
      
      // 验证枪管数组
      if (!Array.isArray(validated.barrels)) {
        validated.barrels = [];
      }
      
      // 验证可用子弹数组
      if (!Array.isArray(validated.allowedBullets)) {
        validated.allowedBullets = [1, 2, 3, 4, 5];
      }
      
      // 确保扳机延迟是数字
      if (typeof validated.triggerDelay !== 'number' || validated.triggerDelay < 0) {
        validated.triggerDelay = 0;
      }
      
      return validated;
    });
  }

  /**
   * 加载武器数据
   * @param {Array} defaultWeapons - 默认武器数据（从 weapons.js 导入）
   * @returns {Array} 武器数据数组
   */
  loadWeapons(defaultWeapons) {
    try {
      const savedData = localStorage.getItem(this.storageKey);
      if (savedData) {
        const parsed = JSON.parse(savedData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // 反序列化保存的数据（恢复 Infinity）
          const deserialized = parsed.map(w => this.deserializeWeapon(w));
          // 验证解析的数据
          const validated = this.validateWeaponData(deserialized);
          // 合并默认数据，确保新增字段存在
          return this.mergeWithDefaults(validated, defaultWeapons);
        }
      }
    } catch (error) {
      console.error('加载武器数据失败:', error);
    }
    return defaultWeapons;
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
    return deserialized;
  }

  /**
   * 合并保存的数据与默认数据
   * @param {Array} savedWeapons - 保存的武器数据
   * @param {Array} defaultWeapons - 默认武器数据
   * @returns {Array} 合并后的武器数据
   */
  mergeWithDefaults(savedWeapons, defaultWeapons) {
    if (savedWeapons.length !== defaultWeapons.length) {
      console.warn('保存的武器数量与默认武器数量不一致，使用默认数据');
      return defaultWeapons;
    }

    return savedWeapons.map((saved, index) => {
      const defaultWeapon = defaultWeapons[index];
      if (!defaultWeapon) return saved;
      
      const merged = {
        ...defaultWeapon,
        ...saved,
        barrels: Array.isArray(saved.barrels) ? saved.barrels : defaultWeapon.barrels || []
      };
      
      // 验证并修复关键数值
      if (merged.velocity > defaultWeapon.velocity * 2.5 || merged.velocity < defaultWeapon.velocity * 0.5) {
        console.warn(`武器 "${merged.name}" 的初速异常，从 ${merged.velocity} 恢复为 ${defaultWeapon.velocity}`);
        merged.velocity = defaultWeapon.velocity;
      }
      
      if (merged.rof > defaultWeapon.rof * 1.8 || merged.rof < defaultWeapon.rof * 0.4) {
        console.warn(`武器 "${merged.name}" 的射速异常，从 ${merged.rof} 恢复为 ${defaultWeapon.rof}`);
        merged.rof = defaultWeapon.rof;
      }
      
      if (merged.flesh > defaultWeapon.flesh * 2.5 || merged.flesh < defaultWeapon.flesh * 0.5) {
        console.warn(`武器 "${merged.name}" 的肉伤异常，从 ${merged.flesh} 恢复为 ${defaultWeapon.flesh}`);
        merged.flesh = defaultWeapon.flesh;
      }
      
      if (merged.armor > defaultWeapon.armor * 2.5 || merged.armor < defaultWeapon.armor * 0.5) {
        console.warn(`武器 "${merged.name}" 的甲伤异常，从 ${merged.armor} 恢复为 ${defaultWeapon.armor}`);
        merged.armor = defaultWeapon.armor;
      }
      
      if (merged.mult) {
        const parts = ['head', 'chest', 'stomach', 'limbs'];
        parts.forEach(part => {
          const defaultVal = defaultWeapon.mult?.[part] || 1;
          const currentVal = merged.mult[part];
          if (typeof currentVal !== 'number' || currentVal > defaultVal * 2.5 || currentVal < defaultVal * 0.3) {
            console.warn(`武器 "${merged.name}" 的 ${part} 倍率异常，从 ${currentVal} 恢复为 ${defaultVal}`);
            merged.mult[part] = defaultVal;
          }
        });
      }
      
      return merged;
    });
  }

  /**
   * 清除保存的数据
   */
  clearSavedData() {
    localStorage.removeItem(this.storageKey);
  }

  /**
   * 检查是否有保存的数据
   * @returns {boolean} 是否有保存的数据
   */
  hasSavedData() {
    return !!localStorage.getItem(this.storageKey);
  }

  /**
   * 导出武器数据为 JSON 字符串
   * @param {Array} weapons - 武器数据数组
   * @returns {string} JSON 字符串
   */
  exportToJSON(weapons) {
    try {
      // 序列化数据（处理 Infinity）
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
      // 反序列化（恢复 Infinity）
      return parsed.map(w => this.deserializeWeapon(w));
    } catch (error) {
      console.error('导入 JSON 失败:', error);
      return null;
    }
  }

  /**
   * 下载武器数据为 JSON 文件
   * @param {Array} weapons - 武器数据数组
   * @param {string} filename - 文件名
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
}