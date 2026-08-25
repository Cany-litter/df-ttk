/**
 * 武器表格组件
 * 
 * 显示武器数据表格，支持双列显示（原始值可编辑 + 当前值只读）
 * 当前值根据原始值 + 枪管/枪口附件自动计算
 * 
 * 数据流向：
 * 1. 用户编辑"原始值"列 → 触发 onCellChange → 更新 DataManager
 * 2. 用户选择"枪管/枪口" → 触发 onAttachmentChange → 重新计算"当前值"
 * 3. 用户调整"精校滑块" → 触发 onPrecisionChange → 重新计算"初速当前值"
 */
import TableRenderer from './TableRenderer.js';

export class WeaponTable {
  /**
   * 获取武器表格列配置
   * @param {Object} options - 配置选项
   * @param {Function} options.onCellChange - 单元格变更回调
   * @param {Function} options.onAttachmentChange - 附件变更回调
   * @param {Function} options.onPrecisionChange - 精校变更回调
   * @param {Function} options.onAddClone - 添加副本回调
   * @param {Function} options.onEditBarrel - 编辑枪管回调
   * @param {Array} options.muzzleOptions - 全局枪口选项
   * @param {Function} options.getBarrelOptions - 获取武器枪管选项的函数
   * @param {Function} options.getDataManager - 获取 DataManager 的函数
   * @returns {Array} 列配置数组
   */
  static getColumns(options = {}) {
    const {
      onCellChange = null,
      onAttachmentChange = null,
      onPrecisionChange = null,
      onAddClone = null,
      onEditBarrel = null,
      muzzleOptions = [],
      getBarrelOptions = null,
      getDataManager = null
    } = options;

    return [
      // ==================== 基本信息 ====================
      {
        key: 'name',
        label: '武器',
        editable: true,
        inputType: 'text',
        inputPlaceholder: '输入武器名称',
        headerAttrs: { style: 'min-width:80px;' },
        render: (row) => {
          if (row.isClone) {
            return `<span class="clone-name">${TableRenderer.escapeHtml(row.name)}</span>`;
          }
          return TableRenderer.escapeHtml(row.name);
        }
      },
      {
        key: 'type',
        label: '类型',
        editable: true,
        inputType: 'select',
        inputOptions: ['步枪', '冲锋枪', '轻机枪', '精确射手步枪', '手枪'],
        headerAttrs: { style: 'min-width:60px;' },
        render: (row) => {
          if (row.isClone) {
            return `<span class="clone-type">${TableRenderer.escapeHtml(row.type)}</span>`;
          }
          return TableRenderer.escapeHtml(row.type);
        }
      },

      // ==================== 射速（原始 + 当前） ====================
      {
        key: 'rof',
        label: '射速',
        editable: true,
        inputType: 'number',
        inputStep: 1,
        inputMin: 0,
        headerAttrs: { style: 'min-width:50px;' },
        render: (row) => {
          const val = row.rof;
          return val !== undefined && val !== null ? String(val) : '-';
        }
      },
      {
        key: 'rofCurrent',
        label: '当前射速',
        editable: false,
        headerAttrs: { style: 'min-width:50px;background:#f0f4ff;' },
        render: (row) => {
          const val = row.rofCurrent !== undefined ? row.rofCurrent : row.rof;
          return `<span class="current-value rof-current">${Math.round(val)}</span>`;
        }
      },

      // ==================== 初速（原始 + 当前） ====================
      {
        key: 'velocity',
        label: '初速',
        editable: true,
        inputType: 'number',
        inputStep: 1,
        inputMin: 0,
        headerAttrs: { style: 'min-width:50px;' },
        render: (row) => {
          const val = row.velocity;
          return val !== undefined && val !== null ? String(val) : '-';
        }
      },
      {
        key: 'velocityCurrent',
        label: '当前初速',
        editable: false,
        headerAttrs: { style: 'min-width:50px;background:#f0f4ff;' },
        render: (row) => {
          const val = row.velocityCurrent !== undefined ? row.velocityCurrent : row.velocity;
          return `<span class="current-value velocity-current">${Math.round(val)}</span>`;
        }
      },

      // ==================== 射程（原始 + 当前） ====================
      {
        key: 'ranges',
        label: '射程',
        editable: true,
        inputType: 'text',
        inputPlaceholder: '40,70,∞,∞',
        headerAttrs: { style: 'min-width:80px;' },
        render: (row) => {
          const ranges = row.ranges;
          if (!Array.isArray(ranges)) return '-';
          return ranges.map(r => r === Infinity ? '∞' : r).join(',');
        }
      },
      {
        key: 'rangesCurrent',
        label: '当前射程',
        editable: false,
        headerAttrs: { style: 'min-width:80px;background:#f0f4ff;' },
        render: (row) => {
          const ranges = row.rangesCurrent || row.ranges;
          if (!Array.isArray(ranges)) return '-';
          return `<span class="current-value ranges-current">${ranges.map(r => r === Infinity ? '∞' : Math.round(r)).join(',')}</span>`;
        }
      },

      // ==================== 肉伤（原始 + 当前） ====================
      {
        key: 'flesh',
        label: '肉伤',
        editable: true,
        inputType: 'number',
        inputStep: 0.1,
        inputMin: 0,
        headerAttrs: { style: 'min-width:40px;' },
        render: (row) => {
          const val = row.flesh;
          return val !== undefined && val !== null ? String(val) : '-';
        }
      },
      {
        key: 'fleshCurrent',
        label: '当前肉伤',
        editable: false,
        headerAttrs: { style: 'min-width:40px;background:#f0f4ff;' },
        render: (row) => {
          const val = row.fleshCurrent !== undefined ? row.fleshCurrent : row.flesh;
          return `<span class="current-value damage-current">${Math.round(val)}</span>`;
        }
      },

      // ==================== 甲伤（原始 + 当前） ====================
      {
        key: 'armor',
        label: '甲伤',
        editable: true,
        inputType: 'number',
        inputStep: 0.1,
        inputMin: 0,
        headerAttrs: { style: 'min-width:40px;' },
        render: (row) => {
          const val = row.armor;
          return val !== undefined && val !== null ? String(val) : '-';
        }
      },
      {
        key: 'armorCurrent',
        label: '当前甲伤',
        editable: false,
        headerAttrs: { style: 'min-width:40px;background:#f0f4ff;' },
        render: (row) => {
          const val = row.armorCurrent !== undefined ? row.armorCurrent : row.armor;
          return `<span class="current-value armor-current">${Math.round(val)}</span>`;
        }
      },

      // ==================== 部位倍率（原始 + 当前） ====================
      {
        key: 'mult',
        label: '部位倍率',
        editable: true,
        inputType: 'text',
        inputPlaceholder: '1.9,1,0.9,0.4',
        headerAttrs: { style: 'min-width:80px;' },
        render: (row) => {
          const mult = row.mult;
          if (!mult || typeof mult !== 'object') return '-';
          const round = (v) => {
            if (typeof v !== 'number') return v;
            return Math.round((v + Number.EPSILON) * 100) / 100;
          };
          return `${round(mult.head)},${round(mult.chest)},${round(mult.stomach)},${round(mult.limbs)}`;
        }
      },
      {
        key: 'multCurrent',
        label: '当前倍率',
        editable: false,
        headerAttrs: { style: 'min-width:80px;background:#f0f4ff;' },
        render: (row) => {
          const mult = row.multCurrent || row.mult;
          if (!mult || typeof mult !== 'object') return '-';
          const round = (v) => {
            if (typeof v !== 'number') return v;
            return Math.round((v + Number.EPSILON) * 100) / 100;
          };
          return `<span class="current-value mult-current">${round(mult.head)},${round(mult.chest)},${round(mult.stomach)},${round(mult.limbs)}</span>`;
        }
      },

      // ==================== 部位伤害（只读） ====================
      {
        key: 'partDamage',
        label: '部位伤害',
        editable: false,
        headerAttrs: { style: 'min-width:80px;' },
        render: (row) => {
          const flesh = row.fleshCurrent !== undefined ? row.fleshCurrent : row.flesh;
          const mult = row.multCurrent || row.mult;
          if (!mult || typeof mult !== 'object') return '-';
          
          const parts = ['head', 'chest', 'stomach', 'limbs'];
          const values = parts.map(part => {
            const multiplier = mult[part] ?? 1;
            const damage = flesh * multiplier;
            return damage.toFixed(1);
          });
          return `<span class="part-damage-cell">${values.join(',')}</span>`;
        }
      },

      // ==================== 枪管选择（动态选项） ====================
      {
        key: 'barrel',
        label: '枪管',
        editable: true,
        inputType: 'select',
        headerAttrs: { style: 'min-width:80px;' },
        render: (row) => {
          const barrelName = row.barrelName || '无';
          return TableRenderer.escapeHtml(barrelName);
        },
        getOptions: (row) => {
          if (row._barrelOptions && row._barrelOptions.length > 0) {
            return row._barrelOptions;
          }
          if (typeof getBarrelOptions === 'function') {
            return getBarrelOptions(row);
          }
          return ['无'];
        }
      },

      // ==================== 枪口选择（动态选项） ====================
      {
        key: 'muzzle',
        label: '枪口',
        editable: true,
        inputType: 'select',
        headerAttrs: { style: 'min-width:60px;' },
        render: (row) => {
          return TableRenderer.escapeHtml(row.muzzleName || '无');
        },
        getOptions: (row) => {
          if (row._muzzleOptions && row._muzzleOptions.length > 0) {
            return row._muzzleOptions;
          }
          return muzzleOptions.length > 0 ? muzzleOptions : ['无'];
        }
      },

      // ==================== 精校滑块 ====================
      {
        key: 'precision',
        label: '精校',
        editable: false,
        headerAttrs: { style: 'min-width:80px;' },
        render: (row) => {
          const val = row.precision !== undefined ? row.precision : 0.09;
          const percentage = Math.round(val * 100);
          return `
            <div class="velocity-precision-container" data-weapon-row="${row._rowIndex || 0}">
              <input type="range" 
                     class="velocity-precision-slider" 
                     data-weapon-id="${row.id || ''}"
                     data-row="${row._rowIndex || 0}"
                     min="-0.09" 
                     max="0.09" 
                     step="0.01" 
                     value="${val}" />
              <span class="velocity-precision-value">${percentage}%</span>
            </div>
          `;
        }
      },

      // ==================== 操作按钮 ====================
      {
        key: 'actions',
        label: '操作',
        editable: false,
        headerAttrs: { style: 'min-width:60px;' },
        render: (row) => {
          const isClone = row.isClone || false;
          let html = '';
          
          if (isClone) {
            html += `<button class="remove-clone-btn" data-weapon-id="${row.id || ''}" data-row="${row._rowIndex || 0}" title="删除副本">−</button>`;
          } else {
            html += `<button class="add-clone-btn" data-weapon-id="${row.id || ''}" data-row="${row._rowIndex || 0}" title="添加副本">+</button>`;
            html += `<button class="edit-barrel-btn" data-weapon-id="${row.id || ''}" data-row="${row._rowIndex || 0}" title="编辑枪管">🔧</button>`;
          }
          
          return html;
        }
      }
    ];
  }

  /**
   * 渲染武器表格
   * @param {Object} config - 表格配置
   * @param {Array} config.data - 武器数据数组（已包含原始值和当前值）
   * @param {Function} config.onCellChange - 单元格变更回调 (rowIndex, key, value, row)
   * @param {Function} config.onAttachmentChange - 附件变更回调 (rowIndex, type, value)
   * @param {Function} config.onPrecisionChange - 精校变更回调 (rowIndex, value)
   * @param {Function} config.onAddClone - 添加副本回调 (rowIndex)
   * @param {Function} config.onEditBarrel - 编辑枪管回调 (rowIndex)
   * @param {Array} config.muzzleOptions - 枪口选项
   * @param {Function} config.getBarrelOptions - 获取枪管选项的函数
   * @param {Function} config.getDataManager - 获取 DataManager 的函数
   * @param {string} config.emptyText - 空数据提示
   * @returns {Object} 表格实例
   */
  static render(config) {
    console.log('🔧 WeaponTable.render 被调用了');

    const {
      data,
      onCellChange = null,
      onAttachmentChange = null,
      onPrecisionChange = null,
      onAddClone = null,
      onEditBarrel = null,
      muzzleOptions = ['无', '死寂', '先进/轻语/勇火', '冲锋枪回声消音器'],
      getBarrelOptions = null,
      getDataManager = null,
      emptyText = '暂无武器数据'
    } = config;

    // 为数据添加 _rowIndex 并预计算枪管选项
    const indexedData = data.map((row, index) => {
      let barrelOptions = ['无'];
      if (typeof getBarrelOptions === 'function') {
        const opts = getBarrelOptions(row);
        if (opts && opts.length > 0) {
          barrelOptions = opts;
        }
      }
      return {
        ...row,
        _rowIndex: index,
        _barrelOptions: barrelOptions,
        _muzzleOptions: muzzleOptions
      };
    });

    // 构建列配置
    const columns = this.getColumns({
      onCellChange,
      onAttachmentChange,
      onPrecisionChange,
      onAddClone,
      onEditBarrel,
      muzzleOptions,
      getBarrelOptions,
      getDataManager
    });

    // 渲染表格
    const table = TableRenderer.render({
      id: 'weaponTable',
      columns: columns,
      data: indexedData,
      emptyText: emptyText,
      showRowIndex: false,
      rowClass: (row) => {
        return row.isClone ? 'clone-row' : '';
      },
      onCellChange: (rowIndex, key, value, row) => {
        // 处理枪管选择
        if (key === 'barrel') {
          let barrelIndex = -1;
          
          if (value === '无') {
            if (onAttachmentChange) {
              onAttachmentChange(rowIndex, 'barrel', -1);
            }
            return;
          }
          
          const options = row._barrelOptions || ['无'];
          const optionIndex = options.indexOf(value);
          if (optionIndex > 0) {
            barrelIndex = optionIndex - 1;
          }
          
          if (barrelIndex === -1) {
            const dm = typeof getDataManager === 'function' ? getDataManager() : null;
            if (dm) {
              const weapon = dm.getWeaponById(row.id);
              if (weapon && weapon.barrels) {
                barrelIndex = weapon.barrels.findIndex(b => b.name === value);
              }
            }
          }
          
          if (onAttachmentChange) {
            onAttachmentChange(rowIndex, 'barrel', barrelIndex);
          }
          return;
        }
        
        // 处理枪口选择
        if (key === 'muzzle') {
          const options = row._muzzleOptions || ['无'];
          const muzzleIndex = options.indexOf(value);
          if (onAttachmentChange) {
            onAttachmentChange(rowIndex, 'muzzle', muzzleIndex >= 0 ? muzzleIndex : 0);
          }
          return;
        }
        
        // 普通单元格变更
        if (onCellChange) {
          onCellChange(rowIndex, key, value, row);
        }
      }
    });

    // 绑定自定义事件
    this.bindCustomEvents(table, {
      onAttachmentChange,
      onPrecisionChange,
      onAddClone,
      onEditBarrel,
      muzzleOptions,
      getDataManager
    });

    return table;
  }

  /**
   * 绑定自定义事件（附件变更、精校变更、操作按钮）
   * ⭐ 修复：使用捕获阶段绑定，确保在 TableRenderer 的监听器之前执行
   * @param {Object} table - 表格实例
   * @param {Object} handlers - 事件处理器
   */
  static bindCustomEvents(table, handlers) {
    const {
      onAttachmentChange,
      onPrecisionChange,
      onAddClone,
      onEditBarrel,
      muzzleOptions = ['无', '死寂', '先进/轻语/勇火', '冲锋枪回声消音器'],
      getDataManager = null
    } = handlers;

    const el = table.getElement();
    if (!el) return;

    // ⭐ 如果已经绑定过，避免重复绑定
    if (el._weaponTableBound) {
      return;
    }
    el._weaponTableBound = true;

    // ============================================================
    // ⭐ 核心修复：使用捕获阶段绑定按钮点击事件
    //    确保在 TableRenderer 的冒泡阶段监听器之前执行
    // ============================================================
    el.addEventListener('click', function(e) {
      // 添加副本
      const addBtn = e.target.closest('.add-clone-btn');
      if (addBtn) {
        e.stopPropagation();
        const row = addBtn.closest('tr');
        const rowIndex = parseInt(row?.dataset.index);
        if (!isNaN(rowIndex) && typeof onAddClone === 'function') {
          onAddClone(rowIndex);
        }
        return;
      }
      
      // 删除副本
      const removeBtn = e.target.closest('.remove-clone-btn');
      if (removeBtn) {
        e.stopPropagation();
        const row = removeBtn.closest('tr');
        const rowIndex = parseInt(row?.dataset.index);
        if (!isNaN(rowIndex) && typeof onAddClone === 'function') {
          onAddClone(rowIndex, true);
        }
        return;
      }
      
      // ⭐ 编辑枪管（核心修复）
      const editBtn = e.target.closest('.edit-barrel-btn');
      if (editBtn) {
        e.stopPropagation();
        e.preventDefault();
        const row = editBtn.closest('tr');
        const rowIndex = parseInt(row?.dataset.index);
        if (!isNaN(rowIndex) && typeof onEditBarrel === 'function') {
          onEditBarrel(rowIndex);
        } else {
          console.warn('⚠️ 编辑枪管: onEditBarrel 未定义或不是函数');
        }
        return;
      }
    }, true); // ⭐ 关键：使用捕获阶段 (true)

    // ============================================================
    // 枪管/枪口选择变更（使用 change 事件，不受 click 影响）
    // ============================================================
    el.addEventListener('change', (e) => {
      const select = e.target.closest('select');
      if (!select) return;
      
      const td = select.closest('td');
      if (!td) return;
      
      const colKey = td.dataset.col;
      if (!colKey) return;
      
      const row = td.closest('tr');
      if (!row) return;
      
      const rowIndex = parseInt(row.dataset.index);
      if (isNaN(rowIndex)) return;
      
      const value = select.value;
      const rowData = table.getData()[rowIndex];
      
      // 枪管选择
      if (colKey === 'barrel') {
        let barrelIndex = -1;
        
        if (value !== '无') {
          if (rowData?._barrelOptions) {
            const optionIndex = rowData._barrelOptions.indexOf(value);
            if (optionIndex > 0) {
              barrelIndex = optionIndex - 1;
            }
          }
          
          if (barrelIndex === -1) {
            const dm = typeof getDataManager === 'function' ? getDataManager() : null;
            if (dm) {
              const weapon = dm.getWeaponById(rowData?.id);
              if (weapon && weapon.barrels) {
                barrelIndex = weapon.barrels.findIndex(b => b.name === value);
              }
            }
          }
        }
        
        if (typeof onAttachmentChange === 'function') {
          onAttachmentChange(rowIndex, 'barrel', barrelIndex);
        }
        return;
      }
      
      // 枪口选择
      if (colKey === 'muzzle') {
        const options = muzzleOptions;
        const muzzleIndex = options.indexOf(value);
        if (typeof onAttachmentChange === 'function') {
          onAttachmentChange(rowIndex, 'muzzle', muzzleIndex >= 0 ? muzzleIndex : 0);
        }
        return;
      }
    });

    // ============================================================
    // 精校滑块变更
    // ============================================================
    el.addEventListener('input', (e) => {
      const slider = e.target.closest('.velocity-precision-slider');
      if (!slider) return;
      
      const row = slider.closest('tr');
      if (!row) return;
      
      const rowIndex = parseInt(row.dataset.index);
      if (isNaN(rowIndex)) return;
      
      const value = parseFloat(slider.value);
      const valueSpan = slider.parentElement.querySelector('.velocity-precision-value');
      if (valueSpan) {
        valueSpan.textContent = `${Math.round(value * 100)}%`;
      }
      
      if (typeof onPrecisionChange === 'function') {
        onPrecisionChange(rowIndex, value);
      }
    });
  }

  /**
   * 更新武器表格数据
   * @param {string|HTMLElement} container - 容器元素或选择器
   * @param {Array} data - 新的武器数据
   * @param {Object} config - 额外配置
   */
  static update(container, data, config = {}) {
    const target = typeof container === 'string' 
      ? document.querySelector(container) 
      : container;
    
    if (!target) {
      console.warn('WeaponTable: 容器不存在');
      return;
    }

    const {
      onCellChange,
      onAttachmentChange,
      onPrecisionChange,
      onAddClone,
      onEditBarrel,
      muzzleOptions = ['无', '死寂', '先进/轻语/勇火', '冲锋枪回声消音器'],
      getBarrelOptions = null,
      getDataManager = null
    } = config;

    const indexedData = data.map((row, index) => {
      let barrelOptions = row._barrelOptions || ['无'];
      
      if (barrelOptions.length === 1 && barrelOptions[0] === '无' && typeof getBarrelOptions === 'function') {
        const opts = getBarrelOptions(row);
        if (opts && opts.length > 0) {
          barrelOptions = opts;
        }
      }
      
      if (barrelOptions.length === 1 && barrelOptions[0] === '无') {
        const dm = typeof getDataManager === 'function' ? getDataManager() : null;
        if (dm) {
          const weapon = dm.getWeaponById(row.id);
          if (weapon && weapon.barrels && Array.isArray(weapon.barrels) && weapon.barrels.length > 0) {
            const opts = weapon.barrels.map(b => b.name || '无');
            if (opts.length > 0) {
              barrelOptions = ['无', ...opts];
            }
          }
        }
      }
      
      if (!barrelOptions.includes('无')) {
        barrelOptions = ['无', ...barrelOptions];
      }
      barrelOptions = [...new Set(barrelOptions)];
      
      return {
        ...row,
        _rowIndex: index,
        _barrelOptions: barrelOptions,
        _muzzleOptions: row._muzzleOptions || muzzleOptions
      };
    });

    const columns = this.getColumns({
      onCellChange,
      onAttachmentChange,
      onPrecisionChange,
      onAddClone,
      onEditBarrel,
      muzzleOptions,
      getBarrelOptions,
      getDataManager
    });

    TableRenderer.updateTable('weaponTable', columns, indexedData, {
      rowClass: (row) => row.isClone ? 'clone-row' : '',
      onCellChange: (rowIndex, key, value, row) => {
        if (key === 'barrel') {
          let barrelIndex = -1;
          
          if (value === '无') {
            if (onAttachmentChange) {
              onAttachmentChange(rowIndex, 'barrel', -1);
            }
            return;
          }
          
          const options = row._barrelOptions || ['无'];
          const optionIndex = options.indexOf(value);
          if (optionIndex > 0) {
            barrelIndex = optionIndex - 1;
          }
          
          if (barrelIndex === -1) {
            const dm = typeof getDataManager === 'function' ? getDataManager() : null;
            if (dm) {
              const weapon = dm.getWeaponById(row.id);
              if (weapon && weapon.barrels) {
                barrelIndex = weapon.barrels.findIndex(b => b.name === value);
              }
            }
          }
          
          if (onAttachmentChange) {
            onAttachmentChange(rowIndex, 'barrel', barrelIndex);
          }
          return;
        }
        if (key === 'muzzle') {
          const options = row._muzzleOptions || ['无'];
          const muzzleIndex = options.indexOf(value);
          if (onAttachmentChange) {
            onAttachmentChange(rowIndex, 'muzzle', muzzleIndex >= 0 ? muzzleIndex : 0);
          }
          return;
        }
        if (onCellChange) {
          onCellChange(rowIndex, key, value, row);
        }
      }
    });
  }

  /**
   * 构建武器行数据（原始值 + 计算后的当前值）
   * @param {Object} weapon - 原始武器数据
   * @param {Object} attachment - 附件配置 { barrelId, muzzleId, precision }
   * @param {Array} muzzleOptions - 枪口选项
   * @returns {Object} 完整的行数据
   */
  static buildRowData(weapon, attachment = {}, muzzleOptions = []) {
    let barrelId = attachment.barrelId !== undefined ? attachment.barrelId : -1;
    if (typeof barrelId === 'string') {
      barrelId = parseInt(barrelId);
    }
    if (isNaN(barrelId)) {
      barrelId = -1;
    }
    
    const muzzleId = typeof attachment.muzzleId === 'string' 
      ? parseInt(attachment.muzzleId) 
      : (attachment.muzzleId || 0);
    const precision = typeof attachment.precision === 'string'
      ? parseFloat(attachment.precision)
      : (attachment.precision || 0.09);

    let barrel = null;
    let barrelName = '无';
    if (barrelId >= 0 && weapon.barrels && weapon.barrels[barrelId]) {
      barrel = weapon.barrels[barrelId];
      barrelName = barrel.name || '无';
    }

    const barrelOptions = ['无'];
    if (weapon.barrels && Array.isArray(weapon.barrels) && weapon.barrels.length > 0) {
      weapon.barrels.forEach(b => {
        if (b.name) {
          barrelOptions.push(b.name);
        }
      });
    }

    let muzzleName = '无';
    const muzzleOptionsList = Array.isArray(muzzleOptions) ? muzzleOptions : ['无'];
    if (muzzleId > 0 && muzzleOptionsList[muzzleId]) {
      muzzleName = muzzleOptionsList[muzzleId];
    }

    const current = this.calculateCurrentValues(weapon, barrel, muzzleId, precision);

    return {
      id: weapon.id,
      name: weapon.name,
      type: weapon.type,
      rof: weapon.rof,
      velocity: weapon.velocity,
      ranges: weapon.ranges || [40, 70, Infinity, Infinity],
      flesh: weapon.flesh,
      armor: weapon.armor,
      mult: weapon.mult || { head: 1.9, chest: 1, stomach: 0.9, limbs: 0.4 },
      
      rofCurrent: current.rof,
      velocityCurrent: current.velocity,
      rangesCurrent: current.ranges,
      fleshCurrent: current.flesh,
      armorCurrent: current.armor,
      multCurrent: current.mult,
      
      barrelId: barrelId,
      barrelName: barrelName,
      muzzleId: muzzleId,
      muzzleName: muzzleName,
      precision: precision,
      
      _barrelOptions: barrelOptions,
      _muzzleOptions: muzzleOptionsList,
      
      barrels: weapon.barrels || [],
      allowedBullet: weapon.allowedBullet,
      isClone: weapon.isClone || false,
      originalIndex: weapon.originalIndex,
      
      _weapon: weapon,
      _barrel: barrel
    };
  }

  /**
   * 计算当前值（应用附件加成）
   * ⭐ 修复：处理枪管缺少 rangeMult 等属性时导致的 NaN 问题
   * 
   * @param {Object} weapon - 原始武器数据
   * @param {Object} barrel - 枪管数据
   * @param {number} muzzleId - 枪口 ID
   * @param {number} precision - 精校值
   * @returns {Object} 计算后的当前值
   */
  static calculateCurrentValues(weapon, barrel, muzzleId, precision) {
    let muzzleRangeMult = 0;
    let muzzleVelocityMult = 1.0;
    
    const dm = window.__app__?.dataManager || null;
    if (dm && typeof dm.getMuzzleBonuses === 'function') {
      const bonuses = dm.getMuzzleBonuses(muzzleId);
      muzzleRangeMult = bonuses.rangeMult || 0;
      muzzleVelocityMult = bonuses.velocityMult || 1.0;
    } else {
      const muzzleMap = {
        0: { rangeMult: 0, velocityMult: 1.0 },
        1: { rangeMult: 0.24, velocityMult: 1.24 },
        2: { rangeMult: 0.18, velocityMult: 1.18 },
        3: { rangeMult: 0.30, velocityMult: 1.30 }
      };
      const muzzleBonuses = muzzleMap[muzzleId] || muzzleMap[0];
      muzzleRangeMult = muzzleBonuses.rangeMult;
      muzzleVelocityMult = muzzleBonuses.velocityMult;
    }

    // ============================================================
    // ⭐ 核心修复：处理枪管缺少 rangeMult/rangeAdd 属性时的 NaN 问题
    // ============================================================
    let rangeMult = 1.0;
    const hasRangeAdd = barrel && typeof barrel.rangeAdd === 'number';
    
    // 如果 barrel 存在，但 rangeMult 不存在，默认为 1.0
    // 使用 ?? 运算符处理 undefined 和 null
    const barrelRange = hasRangeAdd ? 1.0 : (barrel ? (barrel.rangeMult ?? 1.0) : 1.0);
    rangeMult *= (barrelRange + muzzleRangeMult);

    // 确保 rangeMult 是有效数字
    if (!isFinite(rangeMult) || isNaN(rangeMult)) {
      console.warn(
        `⚠️ calculateCurrentValues: rangeMult 无效 (${rangeMult})，重置为 1.0`,
        `武器: ${weapon?.name || '未知'}, 枪管: ${barrel?.name || '无'}`
      );
      rangeMult = 1.0;
    }

    let velocityMult = rangeMult * muzzleVelocityMult * (1 + precision);
    
    // 确保 velocityMult 是有效数字
    if (!isFinite(velocityMult) || isNaN(velocityMult)) {
      console.warn(
        `⚠️ calculateCurrentValues: velocityMult 无效 (${velocityMult})，重置为 1.0`,
        `武器: ${weapon?.name || '未知'}`
      );
      velocityMult = 1.0;
    }

    let rofMult = barrel ? (barrel.rofMult ?? 1.0) : 1.0;
    let damageBonus = barrel && barrel.damageBonus !== undefined ? barrel.damageBonus : 0;
    let armorDamageBonus = barrel && barrel.armorDamageBonus !== undefined ? barrel.armorDamageBonus : 0;

    const partAdd = barrel && barrel.partMultAdd ? barrel.partMultAdd : null;
    const newMult = { ...weapon.mult };
    if (partAdd) {
      for (const k in partAdd) {
        newMult[k] = (newMult[k] ?? 1) + partAdd[k];
      }
    }

    let newRanges;
    if (barrel && Array.isArray(barrel.ranges) && barrel.ranges.length > 0) {
      newRanges = barrel.ranges;
    } else {
      const hasRangeAdd = barrel && typeof barrel.rangeAdd === 'number';
      newRanges = hasRangeAdd
        ? weapon.ranges.map(r => (r === Infinity ? Infinity : Math.round(r * rangeMult + barrel.rangeAdd)))
        : weapon.ranges.map(r => {
            if (r === Infinity) return Infinity;
            return Math.round(r * rangeMult);
          });
    }

    const hasVelocityAdd = barrel && typeof barrel.velocityAdd === 'number';
    let newVelocity = hasVelocityAdd
      ? Math.round((weapon.velocity + barrel.velocityAdd) * velocityMult)
      : Math.round(weapon.velocity * velocityMult);

    // 确保 newVelocity 是有效数字
    if (!isFinite(newVelocity) || isNaN(newVelocity) || newVelocity <= 0) {
      console.warn(
        `⚠️ calculateCurrentValues: velocity 无效 (${newVelocity})，使用原始值 ${weapon.velocity || 500}`,
        `武器: ${weapon?.name || '未知'}`
      );
      newVelocity = weapon.velocity || 500;
    }

    // 确保 rof 是有效数字
    let rof = Math.round(weapon.rof * rofMult * 100) / 100;
    if (!isFinite(rof) || isNaN(rof) || rof <= 0) {
      rof = weapon.rof || 600;
    }

    // 确保 flesh 是有效数字
    let flesh = Math.round((weapon.flesh + damageBonus) * 10) / 10;
    if (!isFinite(flesh) || isNaN(flesh)) {
      flesh = weapon.flesh || 30;
    }

    // 确保 armor 是有效数字
    let armor = Math.round((weapon.armor + armorDamageBonus) * 10) / 10;
    if (!isFinite(armor) || isNaN(armor)) {
      armor = weapon.armor || 35;
    }

    return {
      rof: rof,
      velocity: newVelocity,
      ranges: newRanges,
      flesh: flesh,
      armor: armor,
      mult: newMult
    };
  }
}

export default WeaponTable;