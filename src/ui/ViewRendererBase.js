import { getBulletPrice, getBulletType } from '../core/bulletPricing.js';

/**
 * ViewRenderer 基类
 * 包含所有工具方法、公共方法和内联编辑功能
 * 
 * 子类:
 * - TabRenderers: 三个Tab的渲染和事件绑定
 * - BulletManagerRenderer: 子弹管理 + 命中率弹窗 + 新增枪械
 */
export class ViewRendererBase {
  // ==================== HTML工具方法 ====================

  /**
   * HTML转义
   * @param {string} text - 需要转义的文本
   * @returns {string} 转义后的文本
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==================== 格式化方法 ====================

  /**
   * 格式化货币
   * @param {number} value - 数值
   * @returns {string} 格式化后的货币字符串
   */
  formatCurrency(value) {
    if (typeof value !== 'number') return '0';
    if (value >= 10000) {
      return (value / 10000).toFixed(1) + '万';
    }
    return value.toLocaleString();
  }

  /**
   * 格式化射程用于显示
   * @param {Array} ranges - 射程数组
   * @returns {string} 格式化后的射程字符串
   */
  formatRangesForDisplay(ranges) {
    if (!Array.isArray(ranges)) return '';
    return ranges.map(r => r === Infinity ? '∞' : Math.round(r)).join(',');
  }

  /**
   * 格式化衰减用于显示
   * @param {Array} decays - 衰减数组
   * @returns {string} 格式化后的衰减字符串
   */
  formatDecaysForDisplay(decays) {
    if (!Array.isArray(decays)) return '';
    return decays.map(d => typeof d === 'number' ? d.toFixed(2) : d).join(',');
  }

  /**
   * 格式化倍率用于显示
   * @param {Object} mult - 倍率对象
   * @returns {string} 格式化后的倍率字符串
   */
  formatMultipliersForDisplay(mult) {
    if (!mult) return '';
    const round = (v) => {
      if (typeof v !== 'number') return v;
      return Math.round((v + Number.EPSILON) * 100) / 100;
    };
    return `${round(mult.head)},${round(mult.chest)},${round(mult.stomach)},${round(mult.limbs)}`;
  }

  /**
   * 格式化部位伤害
   * @param {number} flesh - 基础伤害
   * @param {Object} mult - 倍率对象
   * @returns {string} 格式化后的部位伤害字符串
   */
  formatPartDamage(flesh, mult) {
    if (!mult || typeof mult !== 'object') {
      return '-';
    }
    const parts = ['head', 'chest', 'stomach', 'limbs'];
    const values = parts.map(part => {
      const multiplier = mult[part] ?? 1;
      const damage = flesh * multiplier;
      return damage.toFixed(1);
    });
    return values.join(',');
  }

  /**
   * 获取命中率显示文本
   * @param {Array} points - 命中率点数组
   * @param {number} defaultHitRate - 默认命中率
   * @returns {string} 显示文本
   */
  getHitRateDisplayText(points, defaultHitRate = 0.80) {
    if (!points || points.length === 0) {
      return `📌 统一: ${Math.round(defaultHitRate * 100)}%`;
    }
    const sorted = [...points].sort((a, b) => a.distance - b.distance);
    const parts = sorted.map(p => `${p.distance}m:${Math.round(p.rate * 100)}%`);
    return parts.join(' ');
  }

  // ==================== 内联编辑方法 ====================

  /**
   * 使元素变为可编辑
   * @param {HTMLElement} element - 要编辑的元素
   * @param {string} type - 输入类型 ('text' | 'number')
   * @param {Function} onSave - 保存回调
   */
  makeEditable(element, type, onSave) {
    if (element.querySelector('input')) return;

    const currentValue = element.textContent.trim();
    const input = document.createElement('input');
    input.type = type;
    input.value = currentValue;
    input.className = 'edit-inline-input';
    input.style.width = Math.max(element.offsetWidth, 40) + 'px';
    input.style.border = '1px solid #2196F3';
    input.style.borderRadius = '3px';
    input.style.padding = '2px 4px';
    input.style.background = '#fff';
    input.style.fontSize = 'inherit';

    element.innerHTML = '';
    element.appendChild(input);
    input.focus();
    input.select();

    const save = () => {
      const newValue = input.value.trim();
      element.innerHTML = newValue || currentValue;
      if (newValue !== currentValue && onSave) {
        onSave(newValue);
      }
    };

    const cancel = () => {
      element.innerHTML = currentValue;
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        input.blur();
      } else if (e.key === 'Escape') {
        cancel();
      }
    });
  }

  /**
   * 使子弹价格可编辑
   * @param {HTMLElement} element - 要编辑的元素
   * @param {string} type - 输入类型
   * @param {Function} onSave - 保存回调
   */
  makeBulletEditable(element, type, onSave) {
    if (element.querySelector('input')) return;

    const currentValue = element.textContent.replace(/[^0-9.]/g, '') || '0';
    const input = document.createElement('input');
    input.type = type;
    input.value = currentValue;
    input.className = 'edit-inline-input';
    input.style.width = '80px';
    input.style.border = '1px solid #2196F3';
    input.style.borderRadius = '3px';
    input.style.padding = '2px 4px';
    input.style.background = '#fff';
    input.style.fontSize = 'inherit';

    element.innerHTML = '';
    element.appendChild(input);
    input.focus();
    input.select();

    const save = () => {
      const newValue = input.value.trim();
      const displayValue = newValue ? this.formatCurrency(parseFloat(newValue)) : '0';
      element.innerHTML = displayValue;
      if (newValue && newValue !== currentValue && onSave) {
        onSave(newValue);
      }
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        input.blur();
      } else if (e.key === 'Escape') {
        element.innerHTML = this.formatCurrency(parseFloat(currentValue));
      }
    });
  }

  /**
   * 使子弹类型可编辑
   * @param {HTMLElement} element - 要编辑的元素
   * @param {Function} onSave - 保存回调
   */
  makeBulletTypeEditable(element, onSave) {
    if (element.querySelector('select')) return;

    const currentValue = element.textContent.trim();
    const select = document.createElement('select');
    select.className = 'edit-inline-select';
    select.style.border = '1px solid #2196F3';
    select.style.borderRadius = '3px';
    select.style.padding = '2px 4px';
    select.style.background = '#fff';
    select.style.fontSize = 'inherit';

    ['普通', '高级', '特殊'].forEach(type => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      if (type === currentValue) option.selected = true;
      select.appendChild(option);
    });

    element.innerHTML = '';
    element.appendChild(select);
    select.focus();

    const save = () => {
      const newValue = select.value;
      element.innerHTML = newValue;
      if (newValue !== currentValue && onSave) {
        onSave(newValue);
      }
    };

    select.addEventListener('blur', save);
    select.addEventListener('change', save);
    select.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        element.innerHTML = currentValue;
      }
    });
  }

  // ==================== 样式工具方法 ====================

  /**
   * 获取高亮CSS类
   * @param {*} original - 原始值
   * @param {*} current - 当前值
   * @returns {string} CSS类名
   */
  getHighlightClass(original, current) {
    return this.isValueChanged(original, current) ? 'highlight-green' : '';
  }

  /**
   * 判断值是否变化
   * @param {*} original - 原始值
   * @param {*} current - 当前值
   * @returns {boolean} 是否变化
   */
  isValueChanged(original, current) {
    if (typeof original === 'number' && typeof current === 'number') {
      return Math.round(original) !== Math.round(current);
    }
    if (Array.isArray(original) && Array.isArray(current)) {
      if (original.length !== current.length) return true;
      for (let i = 0; i < original.length; i++) {
        const o = original[i] === Infinity ? '∞' : original[i];
        const c = current[i] === Infinity ? '∞' : current[i];
        if (String(o) !== String(c)) return true;
      }
      return false;
    }
    if (typeof original === 'string' && typeof current === 'string') {
      return original !== current;
    }
    if (typeof original === 'object' && typeof current === 'object') {
      return JSON.stringify(original) !== JSON.stringify(current);
    }
    return original !== current;
  }

  // ==================== 解析方法 ====================

  /**
   * 解析射程输入
   * @param {string} value - 射程字符串
   * @returns {Array} 射程数组
   */
  parseRangesInput(value) {
    if (!value) return [40, 70, Infinity, Infinity];
    return value.split(',').map(v => {
      const trimmed = v.trim();
      if (trimmed === '∞' || trimmed === 'Infinity' || trimmed === '') {
        return Infinity;
      }
      const num = parseFloat(trimmed);
      return isNaN(num) ? 40 : num;
    });
  }

  /**
   * 解析衰减输入
   * @param {string} value - 衰减字符串
   * @returns {Array} 衰减数组
   */
  parseDecaysInput(value) {
    if (!value) return [1.0, 0.85, 0.7, 0.7, 0.7];
    const parts = value.split(',').map(v => parseFloat(v.trim()));
    while (parts.length < 5) parts.push(1.0);
    return parts.slice(0, 5).map(d => isNaN(d) ? 1.0 : d);
  }

  /**
   * 解析倍率输入
   * @param {string} value - 倍率字符串
   * @returns {Object} 倍率对象
   */
  parseMultInput(value) {
    if (!value) return { head: 1.9, chest: 1, stomach: 0.9, limbs: 0.4 };
    const parts = value.split(',').map(v => parseFloat(v.trim()) || 1);
    return {
      head: parts[0] || 1.9,
      chest: parts[1] || 1,
      stomach: parts[2] || 0.9,
      limbs: parts[3] || 0.4
    };
  }

  /**
   * 根据武器类型获取默认携带弹药数量
   * @param {string} type - 武器类型
   * @returns {number} 默认携带数量
   */
  getDefaultAmmoCount(type) {
    if (!type) return 120;
    if (type.includes('手枪')) return 30;
    if (type.includes('冲锋枪')) return 90;
    if (type.includes('精确射手步枪')) return 60;
    if (type.includes('轻机枪') || type.includes('机枪')) return 200;
    return 120;
  }

  /**
   * 构建子弹下拉选项
   * @param {Array} allowedBullets - 允许的子弹列表
   * @param {string|number} selected - 当前选中的子弹
   * @returns {string} 选项HTML
   */
  buildBulletOptions(allowedBullets, selected) {
    if (!allowedBullets || allowedBullets.length === 0) {
      return `<option value="">无可用子弹</option>`;
    }
    return allowedBullets.map(bType => {
      const selectedAttr = String(bType) === String(selected) ? 'selected' : '';
      return `<option value="${this.escapeHtml(String(bType))}" ${selectedAttr}>${this.escapeHtml(String(bType))}</option>`;
    }).join('');
  }

  /**
   * 构建枪口下拉选项
   * @param {Array} muzzles - 枪口列表
   * @param {number} selected - 当前选中的枪口索引
   * @returns {string} 选项HTML
   */
  buildMuzzleOptions(muzzles, selected = 0) {
    if (!muzzles || muzzles.length === 0) {
      return `<option value="0">无</option>`;
    }
    return muzzles.map((m, mIdx) => {
      const selectedAttr = mIdx === selected ? 'selected' : '';
      return `<option value="${mIdx}" ${selectedAttr}>${this.escapeHtml(m.name)}</option>`;
    }).join('');
  }

  /**
   * 构建枪管选项列表（用于下拉选择）
   * @param {Array} weapons - 武器数据
   * @returns {Object} { weaponIndex: optionsArray }
   */
  buildBarrelOptions(weapons) {
    const options = {};
    weapons.forEach((weapon, idx) => {
      const barrels = weapon.barrels || [];
      options[idx] = [
        { value: '0', label: '无' },
        ...barrels.map((b, i) => ({
          value: String(i + 1),
          label: b.name || `枪管${i + 1}`
        }))
      ];
    });
    return options;
  }

  /**
   * 获取选中枪管名称
   * @param {Object} weapon - 武器对象
   * @param {number} barrelIndex - 枪管索引（0表示无）
   * @returns {string} 枪管名称
   */
  getBarrelName(weapon, barrelIndex) {
    if (barrelIndex === 0 || !weapon.barrels || barrelIndex > weapon.barrels.length) {
      return '无';
    }
    return weapon.barrels[barrelIndex - 1]?.name || '无';
  }

  /**
   * 获取选中枪口名称
   * @param {Array} muzzles - 枪口列表
   * @param {number} muzzleIndex - 枪口索引（0表示无）
   * @returns {string} 枪口名称
   */
  getMuzzleName(muzzles, muzzleIndex) {
    if (muzzleIndex === 0 || !muzzles || muzzleIndex >= muzzles.length) {
      return '无';
    }
    return muzzles[muzzleIndex]?.name || '无';
  }

  /**
   * 计算配件影响后的属性值
   * @param {Object} weapon - 武器对象
   * @param {Object|null} barrel - 枪管对象
   * @param {Object|null} muzzle - 枪口对象
   * @param {number} precision - 精校值
   * @returns {Object} 计算后的属性值
   */
  calculateAttachedStats(weapon, barrel, muzzle, precision) {
    // 计算射程倍率
    let rangeMult = 1.0;
    const hasRangeAdd = barrel && typeof barrel.rangeAdd === 'number';
    const barrelRange = hasRangeAdd ? 1.0 : (barrel ? barrel.rangeMult : 1.0);
    const muzzleAdd = muzzle ? muzzle.mult : 0.0;
    rangeMult *= (barrelRange + muzzleAdd);

    // 计算初速倍率（包含精校）
    let velocityMult = rangeMult;
    velocityMult *= (1 + precision);

    // 射速倍率
    let rofMult = barrel ? barrel.rofMult : 1.0;

    // 伤害加成
    let damageBonus = barrel && barrel.damageBonus !== undefined ? barrel.damageBonus : 0;
    let armorDamageBonus = barrel && barrel.armorDamageBonus !== undefined ? barrel.armorDamageBonus : 0;

    // 部位倍率加成
    const partAdd = barrel && barrel.partMultAdd ? barrel.partMultAdd : null;
    const newMult = { ...weapon.mult };
    if (partAdd) {
      for (const k in partAdd) {
        newMult[k] = (newMult[k] ?? 1) + partAdd[k];
      }
    }

    // 计算射程
    let newRanges;
    if (barrel && Array.isArray(barrel.ranges) && barrel.ranges.length > 0) {
      newRanges = barrel.ranges;
    } else {
      const hasRangeAddLocal = barrel && typeof barrel.rangeAdd === 'number';
      newRanges = hasRangeAddLocal
        ? weapon.ranges.map(r => (r === Infinity ? Infinity : Math.round(r * rangeMult + barrel.rangeAdd)))
        : weapon.ranges.map(r => {
            if (r === Infinity) return Infinity;
            return Math.round(r * rangeMult);
          });
    }

    // 计算衰减
    const newDecays = (barrel && Array.isArray(barrel.decays) && barrel.decays.length > 0)
      ? barrel.decays
      : weapon.decays;

    // 计算初速
    const hasVelocityAdd = barrel && typeof barrel.velocityAdd === 'number';
    const newVelocity = hasVelocityAdd
      ? Math.round((weapon.velocity + barrel.velocityAdd) * velocityMult)
      : Math.round(weapon.velocity * velocityMult);

    return {
      rof: Math.round(weapon.rof * rofMult * 100) / 100,
      velocity: newVelocity,
      ranges: newRanges,
      flesh: Math.round(weapon.flesh + damageBonus),
      armor: Math.round(weapon.armor + armorDamageBonus),
      decays: newDecays,
      mult: newMult
    };
  }

  /**
   * 检测配件变化
   * @param {Object} result - 计算后的属性值
   * @param {Object} baseResult - 基准属性值（无枪管+无枪口）
   * @returns {Object} 各项是否变化
   */
  hasAttachmentChanges(result, baseResult) {
    const round = (v) => typeof v === 'number' ? Math.round(v) : v;
    const compareArrays = (a, b) => {
      if (!Array.isArray(a) || !Array.isArray(b)) return false;
      if (a.length !== b.length) return true;
      for (let i = 0; i < a.length; i++) {
        const va = a[i] === Infinity ? '∞' : round(a[i]);
        const vb = b[i] === Infinity ? '∞' : round(b[i]);
        if (String(va) !== String(vb)) return true;
      }
      return false;
    };
    const compareObjects = (a, b) => {
      if (!a || !b) return false;
      return JSON.stringify(a) !== JSON.stringify(b);
    };

    return {
      rof: round(result.rof) !== round(baseResult.rof),
      velocity: round(result.velocity) !== round(baseResult.velocity),
      ranges: compareArrays(result.ranges, baseResult.ranges),
      flesh: round(result.flesh) !== round(baseResult.flesh),
      armor: round(result.armor) !== round(baseResult.armor),
      decays: compareArrays(result.decays, baseResult.decays),
      mult: compareObjects(result.mult, baseResult.mult)
    };
  }

  /**
   * 获取射程最长的枪管索引
   * @param {Object} weapon - 武器对象
   * @param {Object|null} muzzle - 枪口对象（可选）
   * @returns {number} 枪管索引（0表示无枪管，1-based表示有枪管）
   */
  getLongestBarrelIndex(weapon, muzzle = null) {
    const barrels = weapon.barrels || [];
    if (barrels.length === 0) return 0;

    const getScore = (barrel) => {
      if (!barrel) return -Infinity;
      const hasAdd = typeof barrel.rangeAdd === 'number';
      const barrelMult = hasAdd ? 1.0 : (typeof barrel.rangeMult === 'number' ? barrel.rangeMult : 1.0);
      const muzzleAdd = muzzle ? muzzle.mult : 0.0;
      const totalMult = barrelMult + muzzleAdd;
      const ranges = weapon.ranges.map(r => r === Infinity ? Infinity : (r * totalMult));
      const adjusted = hasAdd ? ranges.map(r => r === Infinity ? Infinity : (r + barrel.rangeAdd)) : ranges;
      const finite = adjusted.filter(Number.isFinite);
      return finite.length ? Math.max(...finite) : -Infinity;
    };

    let bestIndex = 0;
    let bestScore = -Infinity;
    barrels.forEach((barrel, idx) => {
      const score = getScore(barrel);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = idx + 1;
      }
    });
    return bestIndex;
  }

  /**
   * 获取射程最长的枪管名称
   * @param {Object} weapon - 武器对象
   * @param {Object|null} muzzle - 枪口对象（可选）
   * @returns {string} 枪管名称
   */
  getLongestBarrelName(weapon, muzzle = null) {
    const index = this.getLongestBarrelIndex(weapon, muzzle);
    return this.getBarrelName(weapon, index);
  }
}