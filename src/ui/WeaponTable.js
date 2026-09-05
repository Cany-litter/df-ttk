/**
 * 武器表格组件
 * 
 * 显示武器数据表格，支持双列显示（原始值可编辑 + 当前值只读）
 * 当前值根据原始值 + 枪管/枪口附件自动计算
 */
import TableRenderer from './TableRenderer.js';

export class WeaponTable {
  /**
   * 获取武器表格列配置
   */
  static getColumns(options = {}) {
    const {
      onCellChange = null,
      onAttachmentChange = null,
      onPrecisionChange = null,
      onEditBarrel = null,
      onAddRow = null,
      onDeleteRow = null,
      muzzleOptions = [],
      getBarrelOptions = null,
      getDataManager = null
    } = options;

    // 获取口径选项的辅助函数
    const getCaliberOptions = () => {
      const dm = typeof getDataManager === 'function' ? getDataManager() : null;
      if (dm) {
        const bullets = dm.getBullets();
        const caliberSet = new Set();
        bullets.forEach(b => {
          if (b.caliber) caliberSet.add(b.caliber);
        });
        const options = Array.from(caliberSet).sort();
        if (options.length > 0) {
          return options;
        }
      }
      return ['5.45x39mm', '5.56x45mm', '5.8x42mm', '7.62x39mm', '7.62x51mm', '7.62x54R', '6.8x51mm', '9x39mm', '9x19mm', '.45ACP', '.300BLK', '4.6x30mm', '5.7x28mm', '12.7x55mm'];
    };

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
          if (row._isNewRow) {
            return `<input type="text" class="weapon-new-name" placeholder="武器名称" value="${TableRenderer.escapeHtml(row.name || '')}" />`;
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
          if (row._isNewRow) {
            return `<select class="weapon-new-type">
              <option value="步枪" ${row.type === '步枪' ? 'selected' : ''}>步枪</option>
              <option value="冲锋枪" ${row.type === '冲锋枪' ? 'selected' : ''}>冲锋枪</option>
              <option value="轻机枪" ${row.type === '轻机枪' ? 'selected' : ''}>轻机枪</option>
              <option value="精确射手步枪" ${row.type === '精确射手步枪' ? 'selected' : ''}>精确射手步枪</option>
              <option value="手枪" ${row.type === '手枪' ? 'selected' : ''}>手枪</option>
            </select>`;
          }
          return TableRenderer.escapeHtml(row.type);
        }
      },

      // ==================== ⭐ 口径（可编辑下拉选择） ====================
      {
        key: 'allowedBullet',
        label: '口径',
        editable: true,
        inputType: 'select',
        headerAttrs: { style: 'min-width:80px;' },
        render: (row) => {
          if (row._isNewRow) {
            const options = getCaliberOptions();
            let html = `<select class="weapon-new-caliber">`;
            options.forEach(opt => {
              const selected = opt === row.allowedBullet ? ' selected' : '';
              html += `<option value="${opt}"${selected}>${opt}</option>`;
            });
            html += `</select>`;
            return html;
          }
          return TableRenderer.escapeHtml(row.allowedBullet || '-');
        },
        getOptions: (row) => {
          // ⭐ 为 TableRenderer 的编辑模式提供选项
          if (row._isNewRow) {
            return getCaliberOptions();
          }
          return getCaliberOptions();
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
          if (row._isNewRow) {
            return `<input type="number" class="weapon-new-rof" value="${row.rof || 600}" step="1" min="0" />`;
          }
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
          if (row._isNewRow) return '<span class="current-value rof-current">-</span>';
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
          if (row._isNewRow) {
            return `<input type="number" class="weapon-new-velocity" value="${row.velocity || 500}" step="1" min="0" />`;
          }
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
          if (row._isNewRow) return '<span class="current-value velocity-current">-</span>';
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
          if (row._isNewRow) {
            const ranges = row.ranges || [40, 70, Infinity, Infinity];
            const val = ranges.map(r => r === Infinity ? '∞' : r).join(',');
            return `<input type="text" class="weapon-new-ranges" value="${val}" placeholder="40,70,∞,∞" />`;
          }
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
          if (row._isNewRow) return '<span class="current-value ranges-current">-</span>';
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
          if (row._isNewRow) {
            return `<input type="number" class="weapon-new-flesh" value="${row.flesh || 30}" step="0.1" min="0" />`;
          }
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
          if (row._isNewRow) return '<span class="current-value damage-current">-</span>';
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
          if (row._isNewRow) {
            return `<input type="number" class="weapon-new-armor" value="${row.armor || 35}" step="0.1" min="0" />`;
          }
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
          if (row._isNewRow) return '<span class="current-value armor-current">-</span>';
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
          if (row._isNewRow) {
            const mult = row.mult || { head: 1.9, chest: 1, stomach: 0.9, limbs: 0.4 };
            const val = `${mult.head || 1.9},${mult.chest || 1},${mult.stomach || 0.9},${mult.limbs || 0.4}`;
            return `<input type="text" class="weapon-new-mult" value="${val}" placeholder="1.9,1,0.9,0.4" />`;
          }
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
          if (row._isNewRow) return '<span class="current-value mult-current">-</span>';
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
          if (row._isNewRow) return '-';
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
          if (row._isNewRow) {
            return `<select class="weapon-new-barrel"><option value="-1">无</option></select>`;
          }
          const barrelName = row.barrelName || '无';
          return TableRenderer.escapeHtml(barrelName);
        },
        getOptions: (row) => {
          if (row._isNewRow) return ['无'];
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
          if (row._isNewRow) {
            return `<select class="weapon-new-muzzle">
              ${muzzleOptions.map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>`;
          }
          return TableRenderer.escapeHtml(row.muzzleName || '无');
        },
        getOptions: (row) => {
          if (row._isNewRow) return muzzleOptions.length > 0 ? muzzleOptions : ['无'];
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
          if (row._isNewRow) return '-';
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
        headerAttrs: { style: 'min-width:80px;' },
        render: (row) => {
          if (row._isNewRow) {
            return `
              <button class="confirm-add-weapon-btn" data-row="${row._rowIndex || 0}" title="确认添加">✅ 确认</button>
              <button class="cancel-add-weapon-btn" data-row="${row._rowIndex || 0}" title="取消">❌ 取消</button>
            `;
          }
          return `<button class="edit-barrel-btn" data-weapon-id="${row.id || ''}" data-row="${row._rowIndex || 0}" title="编辑枪管">编辑枪管</button>`;
        }
      }
    ];
  }

  /**
   * 渲染武器表格
   */
  static render(config) {
    const {
      data,
      onCellChange = null,
      onAttachmentChange = null,
      onPrecisionChange = null,
      onEditBarrel = null,
      onAddRow = null,
      onDeleteRow = null,
      muzzleOptions = ['无', '死寂', '先进/轻语/勇火', '冲锋枪回声消音器'],
      getBarrelOptions = null,
      getDataManager = null,
      emptyText = '暂无武器数据'
    } = config;

    const indexedData = data.map((row, index) => {
      let barrelOptions = ['无'];
      if (typeof getBarrelOptions === 'function' && !row._isNewRow) {
        const opts = getBarrelOptions(row);
        if (opts && opts.length > 0) {
          barrelOptions = opts;
        }
      }
      return {
        ...row,
        _rowIndex: index,
        _barrelOptions: barrelOptions,
        _muzzleOptions: muzzleOptions,
        _isNewRow: row._isNewRow || false
      };
    });

    const columns = this.getColumns({
      onCellChange,
      onAttachmentChange,
      onPrecisionChange,
      onEditBarrel,
      onAddRow,
      onDeleteRow,
      muzzleOptions,
      getBarrelOptions,
      getDataManager
    });

    const tableHtml = this.renderFullTable(columns, indexedData, emptyText, muzzleOptions);

    const table = TableRenderer.createInstance(
      {
        id: 'weaponTable',
        columns,
        data: indexedData,
        rowClass: (row) => row._isNewRow ? 'new-weapon-row' : '',
        onCellChange: (rowIndex, key, value, row) => {
          if (key === 'barrel') {
            let barrelIndex = -1;
            if (value === '无') {
              if (onAttachmentChange) onAttachmentChange(rowIndex, 'barrel', -1);
              return;
            }
            const options = row._barrelOptions || ['无'];
            const optionIndex = options.indexOf(value);
            if (optionIndex > 0) barrelIndex = optionIndex - 1;
            if (barrelIndex === -1) {
              const dm = typeof getDataManager === 'function' ? getDataManager() : null;
              if (dm) {
                const weapon = dm.getWeaponById(row.id);
                if (weapon && weapon.barrels) {
                  barrelIndex = weapon.barrels.findIndex(b => b.name === value);
                }
              }
            }
            if (onAttachmentChange) onAttachmentChange(rowIndex, 'barrel', barrelIndex);
            return;
          }
          if (key === 'muzzle') {
            const options = row._muzzleOptions || ['无'];
            const muzzleIndex = options.indexOf(value);
            if (onAttachmentChange) onAttachmentChange(rowIndex, 'muzzle', muzzleIndex >= 0 ? muzzleIndex : 0);
            return;
          }
          // ⭐ 口径变更直接触发 onCellChange
          if (onCellChange) {
            onCellChange(rowIndex, key, value, row);
          }
        }
      },
      tableHtml
    );

    // ⭐ 使用全局事件委托
    this.bindGlobalEvents(table, {
      onAttachmentChange,
      onPrecisionChange,
      onEditBarrel,
      onAddRow,
      onDeleteRow,
      muzzleOptions,
      getDataManager
    });

    return table;
  }

  /**
   * 渲染完整表格（包含控制栏）
   */
  static renderFullTable(columns, data, emptyText, muzzleOptions) {
    const totalCount = data.length;
    
    let html = `
      <div class="weapon-table-controls">
        <button class="add-weapon-btn" data-table="weaponTable">➕ 新增枪械</button>
        <span class="control-hint">（点击新增后在表格顶部填写数据，然后点击"✅ 确认"保存）</span>
        <span class="weapon-count">共 ${totalCount} 把武器</span>
      </div>
      <div class="table-scroll">
        <table id="weaponTable" data-table-id="weaponTable">
          <thead>${this.renderHeader(columns)}</thead>
          <tbody>${this.renderBody(columns, data, emptyText)}</tbody>
        </table>
      </div>
    `;

    return html;
  }

  static renderHeader(columns) {
    let html = '<tr>';
    html += columns.map(col => {
      const attrs = col.headerAttrs || {};
      const attrsStr = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<th ${attrsStr}>${TableRenderer.escapeHtml(col.label || col.key || '')}</th>`;
    }).join('');
    html += '</tr>';
    return html;
  }

  static renderBody(columns, data, emptyText) {
    if (!data || data.length === 0) {
      const colCount = columns.length;
      return `<tr><td colspan="${colCount}" class="empty-cell">${TableRenderer.escapeHtml(emptyText)}</td></tr>`;
    }

    return data.map((row, index) => {
      const isNewRow = row._isNewRow || false;
      let html = `<tr data-index="${index}" class="${isNewRow ? 'new-weapon-row' : ''}">`;
      
      html += columns.map(col => {
        let cellValue;
        if (typeof col.render === 'function') {
          cellValue = col.render(row, index);
        } else {
          const val = row[col.key];
          cellValue = val !== undefined && val !== null ? TableRenderer.escapeHtml(String(val)) : '-';
        }
        
        const colKey = col.key;
        const isEditable = col.editable !== false && !isNewRow;
        
        const cellAttrs = {
          'data-col': colKey,
          'data-row': index
        };
        
        if (isEditable) {
          cellAttrs['data-editable'] = 'true';
          if (col.inputType) cellAttrs['data-input-type'] = col.inputType;
          if (col.inputStep) cellAttrs['data-input-step'] = col.inputStep;
          if (col.inputMin !== undefined) cellAttrs['data-input-min'] = col.inputMin;
          if (col.inputMax !== undefined) cellAttrs['data-input-max'] = col.inputMax;
          if (col.inputPlaceholder) cellAttrs['data-input-placeholder'] = col.inputPlaceholder;
        }
        
        // ⭐ 口径列特殊处理：存储选项到 dataset
        if (colKey === 'allowedBullet' && !isNewRow) {
          const dm = typeof getDataManager === 'function' ? getDataManager() : null;
          if (dm) {
            const bullets = dm.getBullets();
            const caliberSet = new Set();
            bullets.forEach(b => {
              if (b.caliber) caliberSet.add(b.caliber);
            });
            const options = Array.from(caliberSet).sort();
            if (options.length > 0) {
              cellAttrs['data-input-options'] = JSON.stringify(options);
            }
          }
        }
        
        if (colKey === 'barrel' && row._barrelOptions && row._barrelOptions.length > 0) {
          cellAttrs['data-barrel-options'] = JSON.stringify(row._barrelOptions);
        }
        if (colKey === 'muzzle' && row._muzzleOptions && row._muzzleOptions.length > 0) {
          cellAttrs['data-muzzle-options'] = JSON.stringify(row._muzzleOptions);
        }
        
        const finalAttrsStr = Object.entries(cellAttrs)
          .filter(([_, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => `${k}="${TableRenderer.escapeHtml(String(v))}"`)
          .join(' ');
        
        return `<td ${finalAttrsStr}>${cellValue}</td>`;
      }).join('');
      
      html += '</tr>';
      return html;
    }).join('');
  }

  /**
   * ⭐ 全局事件委托
   */
  static bindGlobalEvents(table, handlers) {
    const {
      onAttachmentChange,
      onPrecisionChange,
      onEditBarrel,
      onAddRow,
      onDeleteRow,
      muzzleOptions = ['无', '死寂', '先进/轻语/勇火', '冲锋枪回声消音器'],
      getDataManager = null
    } = handlers;

    if (window._weaponTableGlobalBound) {
      return;
    }
    window._weaponTableGlobalBound = true;

    document.addEventListener('click', function(e) {
      const tableEl = document.getElementById('weaponTable');
      if (!tableEl) return;
      
      const target = e.target;
      if (!tableEl.contains(target) && !target.closest('#tab-weapon')) return;

      const addBtn = target.closest('.add-weapon-btn');
      if (addBtn) {
        e.stopPropagation();
        e.preventDefault();
        
        const existingNewRow = tableEl.querySelector('.new-weapon-row');
        if (existingNewRow) {
          alert('⚠️ 已有新增行，请先完成或取消当前新增操作');
          return;
        }
        
        if (typeof onAddRow === 'function') {
          onAddRow(-1, null);
        }
        return;
      }

      const confirmBtn = target.closest('.confirm-add-weapon-btn');
      if (confirmBtn) {
        e.stopPropagation();
        e.preventDefault();
        const row = confirmBtn.closest('tr');
        const rowIndex = parseInt(row?.dataset.index);
        if (isNaN(rowIndex)) return;
        
        const rowData = {
          name: row.querySelector('.weapon-new-name')?.value?.trim() || '',
          type: row.querySelector('.weapon-new-type')?.value || '步枪',
          allowedBullet: row.querySelector('.weapon-new-caliber')?.value || '',
          rof: parseFloat(row.querySelector('.weapon-new-rof')?.value) || 600,
          velocity: parseFloat(row.querySelector('.weapon-new-velocity')?.value) || 500,
          flesh: parseFloat(row.querySelector('.weapon-new-flesh')?.value) || 30,
          armor: parseFloat(row.querySelector('.weapon-new-armor')?.value) || 35,
          ranges: row.querySelector('.weapon-new-ranges')?.value || '40,70,∞,∞',
          mult: row.querySelector('.weapon-new-mult')?.value || '1.9,1,0.9,0.4'
        };
        
        const rangesStr = rowData.ranges;
        const ranges = rangesStr.split(',').map(v => {
          const trimmed = v.trim();
          if (trimmed === '∞' || trimmed === 'Infinity' || trimmed === '') return Infinity;
          return parseFloat(trimmed) || 40;
        });
        rowData.ranges = ranges;
        
        const multParts = rowData.mult.split(',').map(v => parseFloat(v.trim()) || 1);
        rowData.mult = {
          head: multParts[0] || 1.9,
          chest: multParts[1] || 1,
          stomach: multParts[2] || 0.9,
          limbs: multParts[3] || 0.4
        };
        
        if (!rowData.name) {
          alert('⚠️ 请输入武器名称');
          return;
        }
        if (!rowData.allowedBullet) {
          alert('⚠️ 请选择口径');
          return;
        }
        
        if (typeof onAddRow === 'function') {
          onAddRow(rowIndex, rowData);
        }
        return;
      }

      const cancelBtn = target.closest('.cancel-add-weapon-btn');
      if (cancelBtn) {
        e.stopPropagation();
        e.preventDefault();
        const row = cancelBtn.closest('tr');
        const rowIndex = parseInt(row?.dataset.index);
        if (isNaN(rowIndex)) return;
        
        if (typeof onDeleteRow === 'function') {
          onDeleteRow(rowIndex, null, true);
        }
        return;
      }

      const editBtn = target.closest('.edit-barrel-btn');
      if (editBtn) {
        e.stopPropagation();
        e.preventDefault();
        const row = editBtn.closest('tr');
        const rowIndex = parseInt(row?.dataset.index);
        if (!isNaN(rowIndex) && typeof onEditBarrel === 'function') {
          onEditBarrel(rowIndex);
        }
        return;
      }
    });

    // ============================================================
    // 枪管/枪口/口径选择变更（全局委托）
    // ============================================================
    document.addEventListener('change', function(e) {
      const tableEl = document.getElementById('weaponTable');
      if (!tableEl) return;
      if (!tableEl.contains(e.target)) return;

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
      
      // 跳过新增行的变更（由确认按钮统一处理）
      if (row.classList.contains('new-weapon-row')) {
        return;
      }
      
      const value = select.value;
      const tableInstance = window._tableInstances?.weaponTable;
      const rowData = tableInstance?.getData?.()[rowIndex];
      
      // ⭐ 口径变更
      if (colKey === 'allowedBullet') {
        if (typeof onCellChange === 'function') {
          onCellChange(rowIndex, 'allowedBullet', value, rowData);
        }
        // 触发武器修改标记
        if (rowData && rowData.id) {
          const dm = typeof getDataManager === 'function' ? getDataManager() : null;
          if (dm && typeof dm.markWeaponModified === 'function') {
            dm.markWeaponModified(rowData.id);
          }
        }
        return;
      }
      
      if (colKey === 'barrel') {
        let barrelIndex = -1;
        if (value !== '无') {
          if (rowData?._barrelOptions) {
            const optionIndex = rowData._barrelOptions.indexOf(value);
            if (optionIndex > 0) barrelIndex = optionIndex - 1;
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
    // 精校滑块变更（全局委托）
    // ============================================================
    document.addEventListener('input', function(e) {
      const tableEl = document.getElementById('weaponTable');
      if (!tableEl) return;
      if (!tableEl.contains(e.target)) return;

      const slider = e.target.closest('.velocity-precision-slider');
      if (!slider) return;
      
      const row = slider.closest('tr');
      if (!row) return;
      
      const rowIndex = parseInt(row.dataset.index);
      if (isNaN(rowIndex)) return;
      
      if (row.classList.contains('new-weapon-row')) return;
      
      const value = parseFloat(slider.value);
      const valueSpan = slider.parentElement.querySelector('.velocity-precision-value');
      if (valueSpan) {
        valueSpan.textContent = `${Math.round(value * 100)}%`;
      }
      
      if (typeof onPrecisionChange === 'function') {
        onPrecisionChange(rowIndex, value);
      }
    });

    console.log('✅ WeaponTable: 全局事件委托已绑定');
  }

  /**
   * 更新武器表格数据
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
      onEditBarrel,
      onAddRow,
      onDeleteRow,
      muzzleOptions = ['无', '死寂', '先进/轻语/勇火', '冲锋枪回声消音器'],
      getBarrelOptions = null,
      getDataManager = null
    } = config;

    const indexedData = data.map((row, index) => {
      let barrelOptions = row._barrelOptions || ['无'];
      
      if (!row._isNewRow) {
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
      }
      
      if (!barrelOptions.includes('无')) {
        barrelOptions = ['无', ...barrelOptions];
      }
      barrelOptions = [...new Set(barrelOptions)];
      
      return {
        ...row,
        _rowIndex: index,
        _barrelOptions: barrelOptions,
        _muzzleOptions: row._muzzleOptions || muzzleOptions,
        _isNewRow: row._isNewRow || false
      };
    });

    const columns = this.getColumns({
      onCellChange,
      onAttachmentChange,
      onPrecisionChange,
      onEditBarrel,
      onAddRow,
      onDeleteRow,
      muzzleOptions,
      getBarrelOptions,
      getDataManager
    });

    const tableEl = target.querySelector('#weaponTable');
    
    if (tableEl) {
      const tbody = tableEl.querySelector('tbody');
      if (tbody) {
        tbody.innerHTML = this.renderBody(columns, indexedData, '暂无武器数据');
      }
      const countEl = target.querySelector('.weapon-count');
      if (countEl) {
        countEl.textContent = `共 ${indexedData.length} 把武器`;
      }
    } else {
      target.innerHTML = this.renderFullTable(columns, indexedData, '暂无武器数据', muzzleOptions);
    }
    
    if (window._tableInstances && window._tableInstances.weaponTable) {
      window._tableInstances.weaponTable._data = indexedData;
      if (typeof window._tableInstances.weaponTable.setData === 'function') {
        window._tableInstances.weaponTable.setData(indexedData);
      }
    }
  }

  /**
   * 构建武器行数据
   */
  static buildRowData(weapon, attachment = {}, muzzleOptions = [], isNewRow = false) {
    if (isNewRow) {
      return {
        id: `new_${Date.now()}`,
        name: '',
        type: '步枪',
        allowedBullet: '',
        rof: 600,
        velocity: 500,
        ranges: [40, 70, Infinity, Infinity],
        flesh: 30,
        armor: 35,
        mult: { head: 1.9, chest: 1, stomach: 0.9, limbs: 0.4 },
        rofCurrent: null,
        velocityCurrent: null,
        rangesCurrent: null,
        fleshCurrent: null,
        armorCurrent: null,
        multCurrent: null,
        barrelId: -1,
        barrelName: '无',
        muzzleId: 0,
        muzzleName: '无',
        precision: 0.09,
        _barrelOptions: ['无'],
        _muzzleOptions: muzzleOptions,
        barrels: [],
        isClone: false,
        _weapon: null,
        _barrel: null,
        _isNewRow: true
      };
    }

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
      allowedBullet: weapon.allowedBullet || '',
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
      isClone: weapon.isClone || false,
      originalIndex: weapon.originalIndex,
      
      _weapon: weapon,
      _barrel: barrel,
      _isNewRow: false
    };
  }

  /**
   * 创建新增行数据
   */
  static createNewRow(muzzleOptions = []) {
    return this.buildRowData(null, {}, muzzleOptions, true);
  }

  /**
   * 计算当前值（应用附件加成）
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

    let rangeMult = 1.0;
    if (barrel) {
      const hasRangeAdd = typeof barrel.rangeAdd === 'number' && barrel.rangeAdd !== 0;
      if (hasRangeAdd) {
        rangeMult = 1.0;
      } else {
        rangeMult = barrel.rangeMult ?? 1.0;
      }
    }
    rangeMult += muzzleRangeMult;

    if (!isFinite(rangeMult) || isNaN(rangeMult)) {
      rangeMult = 1.0;
    }

    let velocityMult = rangeMult * muzzleVelocityMult * (1 + precision);
    if (!isFinite(velocityMult) || isNaN(velocityMult)) {
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
      const hasRangeAdd = barrel && typeof barrel.rangeAdd === 'number' && barrel.rangeAdd !== 0;
      const rangeAddValue = hasRangeAdd ? barrel.rangeAdd : 0;
      newRanges = weapon.ranges.map(r => {
        if (r === Infinity) return Infinity;
        return Math.round(r * rangeMult + rangeAddValue);
      });
    }

    const hasVelocityAdd = barrel && typeof barrel.velocityAdd === 'number';
    let newVelocity = hasVelocityAdd
      ? Math.round((weapon.velocity + barrel.velocityAdd) * velocityMult)
      : Math.round(weapon.velocity * velocityMult);

    if (!isFinite(newVelocity) || isNaN(newVelocity) || newVelocity <= 0) {
      newVelocity = weapon.velocity || 500;
    }

    let rof = Math.round(weapon.rof * rofMult * 100) / 100;
    if (!isFinite(rof) || isNaN(rof) || rof <= 0) {
      rof = weapon.rof || 600;
    }

    let flesh = Math.round((weapon.flesh + damageBonus) * 10) / 10;
    if (!isFinite(flesh) || isNaN(flesh)) {
      flesh = weapon.flesh || 30;
    }

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