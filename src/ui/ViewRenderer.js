import { formatRanges, formatMultipliers } from '../utils/formatters.js';

/**
 * 视图渲染器
 * 负责武器表格的渲染和更新
 */
export class ViewRenderer {
  /**
   * 渲染附件选择表格（双列显示版）
   * @param {Array} weapons - 武器数据
   * @param {Array} muzzles - 枪口数据
   * @param {Function} onEditChange - 编辑回调，传递 (index, property, value)
   * @param {Array} clonedWeapons - 副本武器数据
   * @param {Function} onAddClone - 添加副本回调
   * @param {Function} onRemoveClone - 删除副本回调
   */
  renderAttachmentTable(weapons, muzzles, onEditChange, clonedWeapons = [], onAddClone = null, onRemoveClone = null) {
    const tbody = document.querySelector('#attachmentTable tbody');
    tbody.innerHTML = '';
    
    // 获取全局枪管类型设置
    const globalBarrelType = document.getElementById('globalBarrelType')?.value || 'longest';
    
    // 渲染原始武器（全部可编辑）
    weapons.forEach((w, idx) => {
      // 如果数据包含_original和_current结构，使用双列显示
      // 否则使用单列显示（兼容旧数据）
      const hasDualColumns = w._original && w._current;
      
      // 获取原始值和计算值
      const original = hasDualColumns ? w._original : w;
      const current = hasDualColumns ? w._current : w;
      
      // 根据全局设置选择默认枪管
      let defaultBarrelIndex = 0;
      if (globalBarrelType === 'longest') {
        const getScore = (weapon, barrel) => {
          if (!barrel) return -Infinity;
          const hasAdd = typeof barrel.rangeAdd === 'number';
          const mult = hasAdd ? 1.0 : (typeof barrel.rangeMult === 'number' ? barrel.rangeMult : 1.0);
          const ranges = weapon.ranges.map(r => r === Infinity ? Infinity : (Math.round(r * mult)));
          const adjusted = hasAdd ? ranges.map(r => r === Infinity ? Infinity : (r + barrel.rangeAdd)) : ranges;
          const finite = adjusted.filter(Number.isFinite);
          return finite.length ? Math.max(...finite) : -Infinity;
        };
        const bestIdx = w.barrels.reduce((best, cur, curIdx) => {
          const sb = getScore(w, w.barrels[best]);
          const sc = getScore(w, cur);
          return sc > sb ? curIdx : best;
        }, 0);
        defaultBarrelIndex = bestIdx + 1;
      }
      
      const barrelItems = [{ name: '无', rangeMult: 0 }, ...w.barrels];
      const muzzleItems = muzzles;
      const bulletItems = w.allowedBullets || [];

      const tr = document.createElement('tr');
      tr.dataset.weaponIndex = idx;
      
      // 计算部位伤害
      const partDamageDisplay = this.formatPartDamage(current.flesh, current.mult);
      
      // 构建双列显示的行 - 所有输入框添加 data-property 和 data-weapon 属性
      tr.innerHTML = `
        <td><input type="text" class="weapon-name-input editable-input" data-weapon="${idx}" data-property="name" value="${this.escapeHtml(w.name)}" style="width:100%;border:1px solid #ddd;border-radius:3px;padding:2px 4px;background:#fafafa;font-size:inherit;box-sizing:border-box;"/></td>
        <td><input type="text" class="weapon-type-input editable-input" data-weapon="${idx}" data-property="type" value="${this.escapeHtml(w.type)}" style="width:100%;border:1px solid #ddd;border-radius:3px;padding:2px 4px;background:#fafafa;font-size:inherit;box-sizing:border-box;"/></td>
        <!-- 射速：原始（可编辑） + 当前（只读） -->
        <td><input type="number" class="weapon-rof-input editable-input" data-weapon="${idx}" data-property="rof" value="${Math.round(original.rof)}" style="width:55px;border:1px solid #ddd;border-radius:3px;padding:2px 4px;background:#fafafa;font-size:inherit;"/></td>
        <td><span class="current-value rof-current">${Math.round(current.rof)}</span></td>
        <!-- 初速：原始（可编辑） + 当前（只读） -->
        <td><input type="number" class="weapon-velocity-input editable-input" data-weapon="${idx}" data-property="velocity" value="${Math.round(original.velocity)}" style="width:55px;border:1px solid #ddd;border-radius:3px;padding:2px 4px;background:#fafafa;font-size:inherit;"/></td>
        <td><span class="current-value velocity-current">${Math.round(current.velocity)}</span></td>
        <!-- 射程：原始（可编辑） + 当前（只读） -->
        <td><input type="text" class="weapon-ranges-input editable-input" data-weapon="${idx}" data-property="ranges" value="${this.formatRangesForInput(original.ranges)}" style="width:100%;border:1px solid #ddd;border-radius:3px;padding:2px 4px;background:#fafafa;font-size:inherit;box-sizing:border-box;"/></td>
        <td><span class="current-value ranges-current">${this.formatRangesForDisplay(current.ranges)}</span></td>
        <!-- 基础伤害：原始（可编辑） + 当前（只读） -->
        <td><input type="number" class="weapon-flesh-input editable-input" data-weapon="${idx}" data-property="flesh" value="${original.flesh}" style="width:45px;border:1px solid #ddd;border-radius:3px;padding:2px 4px;background:#fafafa;font-size:inherit;"/></td>
        <td><span class="current-value damage-current">${Math.round(current.flesh)}</span></td>
        <!-- 护甲伤害：原始（可编辑） + 当前（只读） -->
        <td><input type="number" class="weapon-armor-input editable-input" data-weapon="${idx}" data-property="armor" value="${original.armor}" style="width:45px;border:1px solid #ddd;border-radius:3px;padding:2px 4px;background:#fafafa;font-size:inherit;"/></td>
        <td><span class="current-value armor-current">${Math.round(current.armor)}</span></td>
        <!-- 部位倍率：原始（可编辑） + 当前（只读） -->
        <td><input type="text" class="weapon-mult-input editable-input" data-weapon="${idx}" data-property="mult" value="${this.formatMultipliersForInput(original.mult)}" style="width:100%;border:1px solid #ddd;border-radius:3px;padding:2px 4px;background:#fafafa;font-size:inherit;box-sizing:border-box;"/></td>
        <td><span class="current-value mult-current">${this.formatMultipliersForDisplay(current.mult)}</span></td>
        <!-- 部位伤害（新增列） -->
        <td class="part-damage-cell" data-weapon="${idx}">${partDamageDisplay}</td>
        <!-- 枪管选择 -->
        <td>${this.createSelectHTML('barrelSel', idx, barrelItems, defaultBarrelIndex)}</td>
        <!-- 枪口选择 -->
        <td>${this.createSelectHTML('muzzleSel', idx, muzzleItems, 0)}</td>
        <!-- 子弹类型 -->
        <td>${this.createSelectHTML('bulletSel', idx, bulletItems, 0)}</td>
        <!-- 命中率 -->
        <td><input type="number" data-weapon="${idx}" class="hitRateInput editable-input" min="0" max="1" step="0.01" style="width:50px;border:1px solid #ddd;border-radius:3px;padding:2px 4px;background:#fafafa;font-size:inherit;" /></td>
        <!-- 枪口初速精校 -->
        <td>${this.createVelocityPrecisionSlider(idx, false, 0.09)}</td>
        <!-- 操作按钮 -->
        <td>${this.createActionButton(idx, 'add', onAddClone)}</td>
      `;
      tbody.appendChild(tr);
    });
    
    // 渲染副本武器（只读）
    clonedWeapons.forEach((clone, cloneIdx) => {
      const tr = document.createElement('tr');
      tr.className = 'clone-row';
      tr.dataset.cloneIndex = cloneIdx;
      
      // 副本武器使用计算后的显示数据
      const displayData = clone._current || clone;
      const originalData = clone._original || clone;
      
      // 计算部位伤害
      const partDamageDisplay = this.formatPartDamage(displayData.flesh, displayData.mult);
      
      tr.innerHTML = `
        <td>${this.escapeHtml(clone.name)}</td>
        <td>${this.escapeHtml(clone.type)}</td>
        <td>${Math.round(originalData.rof)}</td>
        <td><span class="current-value rof-current">${Math.round(displayData.rof)}</span></td>
        <td>${Math.round(originalData.velocity)}</td>
        <td><span class="current-value velocity-current">${Math.round(displayData.velocity)}</span></td>
        <td>${this.formatRangesForDisplay(originalData.ranges)}</td>
        <td><span class="current-value ranges-current">${this.formatRangesForDisplay(displayData.ranges)}</span></td>
        <td>${Math.round(originalData.flesh)}</td>
        <td><span class="current-value damage-current">${Math.round(displayData.flesh)}</span></td>
        <td>${Math.round(originalData.armor)}</td>
        <td><span class="current-value armor-current">${Math.round(displayData.armor)}</span></td>
        <td>${this.formatMultipliersForDisplay(originalData.mult)}</td>
        <td><span class="current-value mult-current">${this.formatMultipliersForDisplay(displayData.mult)}</span></td>
        <td class="part-damage-cell" data-clone="${cloneIdx}">${partDamageDisplay}</td>
        <td>${clone.attachmentConfig.barrelIndex > 0 ? this.escapeHtml(clone.barrels[clone.attachmentConfig.barrelIndex - 1].name) : '无'}</td>
        <td>${clone.attachmentConfig.muzzleIndex > 0 ? this.escapeHtml(muzzles[clone.attachmentConfig.muzzleIndex].name) : '无'}</td>
        <td>${clone.attachmentConfig.bulletType || '全局'}</td>
        <td>${clone.attachmentConfig.hitRate || ''}</td>
        <td>${this.createVelocityPrecisionDisplay(clone.attachmentConfig.velocityPrecision || 0)}</td>
        <td>${this.createActionButton(cloneIdx, 'remove', onRemoveClone)}</td>
      `;
      tbody.appendChild(tr);
    });
    
    // 渲染新增枪械行
    this.renderAddWeaponRow(tbody);
    
    // 绑定事件监听器
    // 传入 onEditChange 回调，用于处理编辑事件
    this.bindAttachmentChangeListeners(onEditChange);
    this.bindEditChangeListeners(onEditChange);
    
    // 绑定副本操作按钮事件
    this.bindCloneActionListeners(onAddClone, onRemoveClone);
  }

  /**
   * 格式化部位伤害
   * 计算：当前基础伤害 × 各部位倍率，保留1位小数
   * 格式：头,胸,腹,四肢（如 72.2,38,38,15.2）
   * @param {number} flesh - 当前基础伤害
   * @param {Object} mult - 部位倍率对象 { head, chest, stomach, limbs }
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
   * HTML转义，防止XSS
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 渲染新增枪械行
   * @param {HTMLElement} tbody - 表格体元素
   */
  renderAddWeaponRow(tbody) {
    const tr = document.createElement('tr');
    tr.className = 'add-weapon-row';
    tr.id = 'addWeaponRow';
    tr.innerHTML = `
      <td><input type="text" id="newWeaponName" placeholder="武器名称" style="width:100%;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#f0fff0;font-size:inherit;box-sizing:border-box;"/></td>
      <td><input type="text" id="newWeaponType" placeholder="类型" style="width:100%;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#f0fff0;font-size:inherit;box-sizing:border-box;"/></td>
      <td><input type="number" id="newWeaponRof" placeholder="射速" style="width:55px;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#f0fff0;font-size:inherit;"/></td>
      <td style="background:#f0f0f0;font-size:0.8rem;color:#999;">自动</td>
      <td><input type="number" id="newWeaponVelocity" placeholder="初速" style="width:55px;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#f0fff0;font-size:inherit;"/></td>
      <td style="background:#f0f0f0;font-size:0.8rem;color:#999;">自动</td>
      <td><input type="text" id="newWeaponRanges" placeholder="40,70,∞,∞" style="width:100%;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#f0fff0;font-size:inherit;box-sizing:border-box;"/></td>
      <td style="background:#f0f0f0;font-size:0.8rem;color:#999;">自动</td>
      <td><input type="number" id="newWeaponFlesh" placeholder="肉伤" style="width:45px;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#f0fff0;font-size:inherit;"/></td>
      <td style="background:#f0f0f0;font-size:0.8rem;color:#999;">自动</td>
      <td><input type="number" id="newWeaponArmor" placeholder="甲伤" style="width:45px;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#f0fff0;font-size:inherit;"/></td>
      <td style="background:#f0f0f0;font-size:0.8rem;color:#999;">自动</td>
      <td><input type="text" id="newWeaponMult" placeholder="1.9,1,0.9,0.4" style="width:100%;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#f0fff0;font-size:inherit;box-sizing:border-box;"/></td>
      <td style="background:#f0f0f0;font-size:0.8rem;color:#999;">自动</td>
      <td style="background:#f0f0f0;font-size:0.8rem;color:#999;">自动</td>
      <td colspan="6" style="text-align:left;">
        <button class="confirm-add-btn" id="confirmAddWeapon">✅ 确认添加</button>
        <button class="cancel-add-btn" id="cancelAddWeapon">❌ 取消</button>
        <span style="font-size:0.8rem;color:#666;margin-left:8px;">填完数据后点击"确认添加"</span>
      </td>
    `;
    tbody.appendChild(tr);
  }

  /**
   * 读取新增枪械的数据
   * @returns {Object|null} 武器数据对象
   */
  readNewWeaponData() {
    const name = document.getElementById('newWeaponName')?.value.trim();
    const type = document.getElementById('newWeaponType')?.value.trim() || '步枪';
    const rof = parseFloat(document.getElementById('newWeaponRof')?.value);
    const velocity = parseFloat(document.getElementById('newWeaponVelocity')?.value);
    const rangesStr = document.getElementById('newWeaponRanges')?.value.trim();
    const flesh = parseFloat(document.getElementById('newWeaponFlesh')?.value);
    const armor = parseFloat(document.getElementById('newWeaponArmor')?.value);
    const multStr = document.getElementById('newWeaponMult')?.value.trim();
    
    if (!name) {
      alert('请输入武器名称！');
      return null;
    }
    if (isNaN(rof) || rof <= 0) {
      alert('请输入有效的射速！');
      return null;
    }
    if (isNaN(velocity) || velocity <= 0) {
      alert('请输入有效的初速！');
      return null;
    }
    if (isNaN(flesh) || flesh <= 0) {
      alert('请输入有效的基础伤害！');
      return null;
    }
    if (isNaN(armor) || armor <= 0) {
      alert('请输入有效的护甲伤害！');
      return null;
    }
    
    const ranges = this.parseRangesInput(rangesStr || '40,70,∞,∞');
    const mult = this.parseMultInput(multStr || '1.9,1,0.9,0.4');
    
    return {
      name,
      type,
      ranges,
      decays: [1.0, 0.85, 0.7, 0.7, 0.7],
      velocity,
      flesh,
      armor,
      rof,
      triggerDelay: 0,
      barrels: [],
      mult,
      allowedBullets: [1, 2, 3, 4, 5]
    };
  }

  /**
   * 清空新增枪械输入框
   */
  clearNewWeaponInputs() {
    const inputs = [
      'newWeaponName', 'newWeaponType', 'newWeaponRof', 
      'newWeaponVelocity', 'newWeaponRanges', 'newWeaponFlesh', 
      'newWeaponArmor', 'newWeaponMult'
    ];
    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  /**
   * 格式化射程用于输入框
   * @param {Array} ranges - 射程数组
   * @returns {string} 格式化后的射程字符串
   */
  formatRangesForInput(ranges) {
    if (!Array.isArray(ranges)) return '';
    return ranges.map(r => r === Infinity ? '∞' : r).join(',');
  }

  /**
   * 格式化射程用于显示（只读）
   * @param {Array} ranges - 射程数组
   * @returns {string} 格式化后的射程字符串
   */
  formatRangesForDisplay(ranges) {
    if (!Array.isArray(ranges)) return '';
    return ranges.map(r => r === Infinity ? '∞' : Math.round(r)).join(',');
  }

  /**
   * 格式化倍率用于输入框
   * @param {Object} mult - 部位倍率对象
   * @returns {string} 格式化后的倍率字符串
   */
  formatMultipliersForInput(mult) {
    if (!mult) return '';
    const round = (v) => {
      if (typeof v !== 'number') return v;
      return Math.round((v + Number.EPSILON) * 100) / 100;
    };
    return `${round(mult.head)},${round(mult.chest)},${round(mult.stomach)},${round(mult.limbs)}`;
  }

  /**
   * 格式化倍率用于显示（只读）
   * @param {Object} mult - 部位倍率对象
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
   * 绑定编辑框变化监听器（核心修改）
   * 当用户编辑输入框时，调用 onEditChange 回调传递 (index, property, value)
   * @param {Function} onEditChange - 编辑回调函数
   */
  bindEditChangeListeners(onEditChange) {
    const inputs = document.querySelectorAll(
      '.weapon-name-input, .weapon-type-input, .weapon-rof-input, ' +
      '.weapon-velocity-input, .weapon-ranges-input, .weapon-flesh-input, ' +
      '.weapon-armor-input, .weapon-mult-input'
    );
    
    inputs.forEach(input => {
      // 使用 change 事件：只在失去焦点（用户完成输入）时触发
      input.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.weapon);
        const property = e.target.dataset.property;
        const value = e.target.value;
        
        if (!isNaN(index) && property) {
          // 使用 setTimeout 确保事件处理不会阻塞 UI
          setTimeout(() => {
            onEditChange(index, property, value);
          }, 0);
        }
      });
      
      // 按 Enter 键时触发保存
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.target.blur(); // 失去焦点，触发 change 事件
          const index = parseInt(e.target.dataset.weapon);
          const property = e.target.dataset.property;
          const value = e.target.value;
          
          if (!isNaN(index) && property) {
            setTimeout(() => {
              onEditChange(index, property, value);
            }, 0);
          }
        }
      });
    });
  }

  /**
   * 从表格读取编辑后的武器数据（只读取原始值）
   * @param {Array} originalWeapons - 原始武器数据
   * @returns {Array} 编辑后的武器数据
   */
  readEditedWeapons(originalWeapons) {
    const rows = document.querySelectorAll('#attachmentTable tbody tr:not(.clone-row):not(.add-weapon-row)');
    const editedWeapons = [];
    
    rows.forEach((row, index) => {
      const weapon = { ...originalWeapons[index] };
      
      const nameInput = row.querySelector('.weapon-name-input');
      const typeInput = row.querySelector('.weapon-type-input');
      const rofInput = row.querySelector('.weapon-rof-input');
      const velocityInput = row.querySelector('.weapon-velocity-input');
      const rangesInput = row.querySelector('.weapon-ranges-input');
      const fleshInput = row.querySelector('.weapon-flesh-input');
      const armorInput = row.querySelector('.weapon-armor-input');
      const multInput = row.querySelector('.weapon-mult-input');
      
      if (nameInput) weapon.name = nameInput.value;
      if (typeInput) weapon.type = typeInput.value;
      if (rofInput) weapon.rof = parseFloat(rofInput.value);
      if (velocityInput) weapon.velocity = parseFloat(velocityInput.value);
      if (fleshInput) weapon.flesh = parseFloat(fleshInput.value);
      if (armorInput) weapon.armor = parseFloat(armorInput.value);
      
      if (rangesInput) {
        weapon.ranges = this.parseRangesInput(rangesInput.value);
      }
      
      if (multInput) {
        weapon.mult = this.parseMultInput(multInput.value);
      }
      
      editedWeapons.push(weapon);
    });
    
    return editedWeapons;
  }

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
   * 创建操作按钮（加号或减号）
   * @param {number} index - 武器或副本索引
   * @param {string} type - 按钮类型：'add' 或 'remove'
   * @param {Function} callback - 回调函数
   * @returns {string} 按钮HTML
   */
  createActionButton(index, type, callback) {
    if (type === 'add') {
      return `<button class="add-clone-btn" data-weapon="${index}" title="添加副本">+</button>`;
    } else {
      return `<button class="remove-clone-btn" data-clone="${index}" title="删除副本">-</button>`;
    }
  }

  /**
   * 创建枪口初速精校滑块
   * @param {number} index - 武器或副本索引
   * @param {boolean} isClone - 是否为副本
   * @param {number} defaultValue - 默认值
   * @returns {string} 滑块HTML
   */
  createVelocityPrecisionSlider(index, isClone = false, defaultValue = 0.09) {
    const dataAttr = isClone ? `data-clone="${index}"` : `data-weapon="${index}"`;
    const percentage = Math.round(defaultValue * 100);
    return `
      <div class="velocity-precision-container">
        <input type="range" 
               class="velocity-precision-slider" 
               ${dataAttr}
               min="-0.09" 
               max="0.09" 
               step="0.01" 
               value="${defaultValue}" />
        <span class="velocity-precision-value">${percentage}%</span>
      </div>
    `;
  }

  /**
   * 创建枪口初速精校只读显示（用于副本）
   * @param {number} precisionValue - 精校值
   * @returns {string} 只读显示HTML
   */
  createVelocityPrecisionDisplay(precisionValue = 0) {
    const percentage = Math.round(precisionValue * 100);
    return `
      <div class="velocity-precision-display">
        <span class="velocity-precision-value">${percentage}%</span>
      </div>
    `;
  }

  /**
   * 绑定副本操作按钮事件
   * @param {Function} onAddClone - 添加副本回调
   * @param {Function} onRemoveClone - 删除副本回调
   */
  bindCloneActionListeners(onAddClone, onRemoveClone) {
    if (onAddClone) {
      const addButtons = document.querySelectorAll('.add-clone-btn');
      addButtons.forEach(button => {
        button.addEventListener('click', (e) => {
          const weaponIndex = parseInt(e.target.dataset.weapon);
          onAddClone(weaponIndex);
        });
      });
    }

    if (onRemoveClone) {
      const removeButtons = document.querySelectorAll('.remove-clone-btn');
      removeButtons.forEach(button => {
        button.addEventListener('click', (e) => {
          const cloneIndex = parseInt(e.target.dataset.clone);
          onRemoveClone(cloneIndex);
        });
      });
    }
  }

  /**
   * 更新武器统计数据（包括副本）
   * 更新原始值和计算值两列
   * @param {Array} allWeapons - 所有武器数据（原始+副本）
   */
  updateWeaponStats(allWeapons) {
    // 计算原始武器行数
    const originalRows = document.querySelectorAll('#attachmentTable tbody tr:not(.clone-row):not(.add-weapon-row)');
    const originalCount = originalRows.length;
    
    allWeapons.forEach((weapon, idx) => {
      const isClone = weapon.isClone || (idx >= originalCount);
      
      // 获取原始值和计算值
      const original = weapon._original || weapon;
      const current = weapon._current || weapon;
      
      if (isClone) {
        // 更新副本武器数据
        const cloneIndex = idx - originalCount;
        const cloneRow = document.querySelector(`.clone-row[data-clone-index="${cloneIndex}"]`);
        if (!cloneRow) return;
        
        const rofCell = cloneRow.querySelector('.rof-current');
        if (rofCell) rofCell.textContent = Math.round(current.rof);
        
        const velocityCell = cloneRow.querySelector('.velocity-current');
        if (velocityCell) velocityCell.textContent = Math.round(current.velocity);
        
        const rangesCell = cloneRow.querySelector('.ranges-current');
        if (rangesCell) rangesCell.textContent = this.formatRangesForDisplay(current.ranges);
        
        const fleshCell = cloneRow.querySelector('.damage-current');
        if (fleshCell) fleshCell.textContent = Math.round(current.flesh);
        
        const armorCell = cloneRow.querySelector('.armor-current');
        if (armorCell) armorCell.textContent = Math.round(current.armor);
        
        const multCell = cloneRow.querySelector('.mult-current');
        if (multCell) multCell.textContent = this.formatMultipliersForDisplay(current.mult);
        
        // 更新部位伤害
        const partDamageCell = cloneRow.querySelector('.part-damage-cell');
        if (partDamageCell) {
          partDamageCell.textContent = this.formatPartDamage(current.flesh, current.mult);
        }
      } else {
        // 更新原始武器数据 - 只更新原始值输入框和当前值显示
        const row = document.querySelector(`tr[data-weapon-index="${idx}"]`);
        if (!row) return;
        
        const rofInput = row.querySelector('.weapon-rof-input');
        if (rofInput) rofInput.value = Math.round(original.rof);
        
        const velocityInput = row.querySelector('.weapon-velocity-input');
        if (velocityInput) velocityInput.value = Math.round(original.velocity);
        
        const rangesInput = row.querySelector('.weapon-ranges-input');
        if (rangesInput) rangesInput.value = this.formatRangesForInput(original.ranges);
        
        const fleshInput = row.querySelector('.weapon-flesh-input');
        if (fleshInput) fleshInput.value = original.flesh;
        
        const armorInput = row.querySelector('.weapon-armor-input');
        if (armorInput) armorInput.value = original.armor;

        const multInput = row.querySelector('.weapon-mult-input');
        if (multInput) multInput.value = this.formatMultipliersForInput(original.mult);
        
        // 更新当前值显示（只读列）
        const rofCurrent = row.querySelector('.rof-current');
        if (rofCurrent) rofCurrent.textContent = Math.round(current.rof);
        
        const velocityCurrent = row.querySelector('.velocity-current');
        if (velocityCurrent) velocityCurrent.textContent = Math.round(current.velocity);
        
        const rangesCurrent = row.querySelector('.ranges-current');
        if (rangesCurrent) rangesCurrent.textContent = this.formatRangesForDisplay(current.ranges);
        
        const fleshCurrent = row.querySelector('.damage-current');
        if (fleshCurrent) fleshCurrent.textContent = Math.round(current.flesh);
        
        const armorCurrent = row.querySelector('.armor-current');
        if (armorCurrent) armorCurrent.textContent = Math.round(current.armor);
        
        const multCurrent = row.querySelector('.mult-current');
        if (multCurrent) multCurrent.textContent = this.formatMultipliersForDisplay(current.mult);
        
        // 更新部位伤害
        const partDamageCell = row.querySelector('.part-damage-cell');
        if (partDamageCell) {
          partDamageCell.textContent = this.formatPartDamage(current.flesh, current.mult);
        }
      }
    });
  }

  /**
   * 创建下拉框HTML
   */
  createSelectHTML(className, index, items, defaultIndex) {
    let options;
    
    if (className === 'bulletSel') {
      // 子弹类型选择框特殊处理
      options = ['<option value="">全局</option>']
        .concat(items.map(item => `<option value="${item}">${item}</option>`))
        .join('');
    } else {
      // 枪管和枪口选择框
      options = items.map((item, itemIndex) => {
        const selected = itemIndex === defaultIndex ? ' selected' : '';
        // 对于枪管和枪口，特殊处理"无"选项，使用-1表示无附件
        const value = itemIndex === 0 ? 
          `${item.name}|-1` : `${item.name}|${itemIndex}`;
        return `<option value="${value}"${selected}>${this.escapeHtml(item.name)}</option>`;
      }).join('');
    }
    
    return `<select data-weapon="${index}" class="${className}">${options}</select>`;
  }

  /**
   * 绑定附件选择变化的事件监听器
   * @param {Function} onEditChange - 编辑回调（附件变化时也需要刷新）
   */
  bindAttachmentChangeListeners(onEditChange) {
    // 监听枪管选择变化
    const barrelSelects = document.querySelectorAll('.barrelSel');
    barrelSelects.forEach(select => {
      select.addEventListener('change', () => {
        const index = parseInt(select.dataset.weapon);
        if (!isNaN(index)) {
          onEditChange(index, '_attachment', select.value);
        }
      });
    });
    
    // 监听枪口选择变化
    const muzzleSelects = document.querySelectorAll('.muzzleSel');
    muzzleSelects.forEach(select => {
      select.addEventListener('change', () => {
        const index = parseInt(select.dataset.weapon);
        if (!isNaN(index)) {
          onEditChange(index, '_attachment', select.value);
        }
      });
    });
    
    // 监听枪口初速满精校复选框变化
    const muzzlePrecisionCheckbox = document.getElementById('muzzlePrecisionEnable');
    if (muzzlePrecisionCheckbox) {
      muzzlePrecisionCheckbox.addEventListener('change', () => {
        onEditChange(-1, '_precision', '');
      });
    }
    
    // 监听子弹类型选择变化
    const bulletSelects = document.querySelectorAll('.bulletSel');
    bulletSelects.forEach(select => {
      select.addEventListener('change', () => {
        const index = parseInt(select.dataset.weapon);
        if (!isNaN(index)) {
          onEditChange(index, '_bullet', select.value);
        }
      });
    });
    
    // 监听命中率输入变化
    const hitRateInputs = document.querySelectorAll('.hitRateInput');
    hitRateInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.weapon);
        if (!isNaN(index)) {
          onEditChange(index, '_hitRate', e.target.value);
        }
      });
    });
    
    // 监听枪口初速精校滑块变化
    const velocitySliders = document.querySelectorAll('.velocity-precision-slider');
    velocitySliders.forEach(slider => {
      slider.addEventListener('input', (e) => {
        // 更新显示值
        const valueSpan = e.target.parentElement.querySelector('.velocity-precision-value');
        const percentage = Math.round(e.target.value * 100);
        valueSpan.textContent = `${percentage}%`;
        
        // 触发重新计算
        const index = parseInt(e.target.dataset.weapon);
        if (!isNaN(index)) {
          onEditChange(index, '_precision', e.target.value);
        } else {
          const cloneIndex = parseInt(e.target.dataset.clone);
          if (!isNaN(cloneIndex)) {
            onEditChange(cloneIndex, '_clonePrecision', e.target.value);
          }
        }
      });
    });
  }
}