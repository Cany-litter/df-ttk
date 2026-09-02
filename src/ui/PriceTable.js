/**
 * 价格表格组件
 * 
 * 显示武器价格配置表格，支持编辑和行操作（新增/删除）
 * 
 * 数据来源：DataManager.getPriceRows()
 * 
 * 列：
 * - 武器（只读）
 * - 序号（只读，显示 #1, #2, #3）
 * - 枪管（下拉选择，从武器.barrels 读取）
 * - 枪口（下拉选择，从全局枪口列表读取）
 * - 改枪码（文本编辑）
 * - 整枪价格（数字编辑，单位：万）
 * - 命中率（文本编辑，格式：30:0.9,50:0.8,100:0.6）
 * - 子弹（下拉选择，从武器口径对应的子弹列表读取）
 * - ⭐ 哈弗币消耗（只读，新增）
 * - 操作（新增行 / 删除行）
 * - 启用（复选框）
 */
import TableRenderer from './TableRenderer.js';

export class PriceTable {
  /**
   * 获取价格表格列配置
   * @param {Object} options - 配置选项
   * @param {Function} options.onCellChange - 单元格变更回调
   * @param {Function} options.onAddRow - 新增行回调
   * @param {Function} options.onDeleteRow - 删除行回调
   * @param {Function} options.getBarrelOptions - 获取枪管选项函数
   * @param {Function} options.getBulletOptions - 获取子弹选项函数
   * @param {Array} options.muzzleOptions - 全局枪口选项
   * @param {Function} options.onEnabledChange - 启用状态变更回调 (rowIndex, enabled, row)
   * @param {Object} options.havocCosts - ⭐ 哈弗币消耗数据 { uniqueKey: { totalCost, ... } }
   * @returns {Array} 列配置数组
   */
  static getColumns(options = {}) {
    const {
      onCellChange = null,
      onAddRow = null,
      onDeleteRow = null,
      getBarrelOptions = null,
      getBulletOptions = null,
      muzzleOptions = ['无', '死寂', '先进/轻语/勇火', '冲锋枪回声消音器'],
      onEnabledChange = null,
      havocCosts = {}
    } = options;

    return [
      // ==================== 武器（只读） ====================
      {
        key: 'weaponName',
        label: '武器',
        editable: false,
        headerAttrs: { style: 'min-width:80px;' },
        render: (row) => {
          return TableRenderer.escapeHtml(row.weaponName || '-');
        }
      },

      // ==================== 序号（只读，直接显示 #1, #2, #3） ====================
      {
        key: 'configId',
        label: '序号',
        editable: false,
        headerAttrs: { style: 'min-width:50px;' },
        render: (row) => {
          return TableRenderer.escapeHtml(row.configId || '#1');
        }
      },

      // ==================== 枪管（下拉选择） ====================
      {
        key: 'barrel',
        label: '枪管',
        editable: true,
        inputType: 'select',
        headerAttrs: { style: 'min-width:80px;' },
        render: (row) => {
          return TableRenderer.escapeHtml(row.barrel || '无');
        },
        getOptions: (row) => {
          if (row._barrelOptions && row._barrelOptions.length > 0) {
            return row._barrelOptions;
          }
          if (typeof getBarrelOptions === 'function') {
            const opts = getBarrelOptions(row);
            if (opts && opts.length > 0) {
              return opts;
            }
          }
          return ['无'];
        }
      },

      // ==================== 枪口（下拉选择） ====================
      {
        key: 'muzzle',
        label: '枪口',
        editable: true,
        inputType: 'select',
        headerAttrs: { style: 'min-width:60px;' },
        render: (row) => {
          return TableRenderer.escapeHtml(row.muzzle || '无');
        },
        getOptions: (row) => {
          if (row._muzzleOptions && row._muzzleOptions.length > 0) {
            return row._muzzleOptions;
          }
          return muzzleOptions.length > 0 ? muzzleOptions : ['无'];
        }
      },

      // ==================== 改枪码（文本编辑） ====================
      {
        key: 'buildCode',
        label: '改枪码',
        editable: true,
        inputType: 'text',
        inputPlaceholder: '输入改枪码',
        headerAttrs: { style: 'min-width:80px;' },
        render: (row) => {
          return TableRenderer.escapeHtml(row.buildCode || '-');
        }
      },

      // ==================== 整枪价格（数字编辑，单位：万） ====================
      {
        key: 'price',
        label: '整枪价格 (W)',
        editable: true,
        inputType: 'number',
        inputStep: 1,
        inputMin: 0,
        inputPlaceholder: '输入万为单位',
        headerAttrs: { style: 'min-width:90px;' },
        render: (row) => {
          const price = row.price;
          if (price === undefined || price === null || price === 0) return '-';
          const priceInW = price / 10000;
          return `¥${priceInW.toFixed(1)}W`;
        },
        getEditValue: (row) => {
          const price = row.price;
          if (price === undefined || price === null || price === 0) return '';
          const priceInW = price / 10000;
          return priceInW.toFixed(1);
        }
      },

      // ==================== 命中率（文本编辑） ====================
      {
        key: 'hitRateRaw',
        label: '命中率',
        editable: true,
        inputType: 'text',
        inputPlaceholder: '30:0.9,50:0.8,100:0.6',
        headerAttrs: { style: 'min-width:140px;' },
        render: (row) => {
          const raw = row.hitRateRaw || '';
          if (!raw) return '-';
          
          try {
            const parts = raw.split(',').map(p => p.trim());
            const displayParts = parts.map(p => {
              const [dist, rate] = p.split(':');
              if (dist && rate) {
                const percentage = Math.round(parseFloat(rate) * 100);
                return `${dist}m:${percentage}%`;
              }
              return p;
            });
            return displayParts.join(' ');
          } catch (e) {
            return raw;
          }
        }
      },

      // ==================== 子弹（下拉选择） ====================
      {
        key: 'bulletDisplay',
        label: '子弹',
        editable: true,
        inputType: 'select',
        headerAttrs: { style: 'min-width:100px;' },
        render: (row) => {
          return TableRenderer.escapeHtml(row.bulletDisplay || '-');
        },
        getOptions: (row) => {
          if (row._bulletOptions && row._bulletOptions.length > 0) {
            if (!row._bulletOptions.includes('无')) {
              return ['无', ...row._bulletOptions];
            }
            return row._bulletOptions;
          }
          if (typeof row._getBulletOptions === 'function') {
            const opts = row._getBulletOptions(row);
            if (opts && opts.length > 0) {
              if (!opts.includes('无')) {
                return ['无', ...opts];
              }
              return opts;
            }
          }
          return ['无'];
        }
      },

      // ==================== ⭐ 哈弗币消耗估算 ====================
      {
        key: 'havocCost',
        label: '哈弗币消耗 (W)',
        editable: false,
        headerAttrs: { 
          style: 'min-width:100px;background:#fff3e0;border-bottom:2px solid #ff9800;' 
        },
        render: (row) => {
          // ⭐ 从 row._havocCost 读取
          const costData = row._havocCost;
          
          if (!costData || costData.totalCost === undefined || costData.totalCost === 0) {
            return '<span style="color:#bbb;">-</span>';
          }
          
          // ⭐ 使用保留1位小数的 avgShots 重新计算
          const avgShotsDisplay = Math.round(costData.avgShots * 10) / 10;
          const effectiveKd = costData.kdRatio * 5;
          const bulletConsumption = effectiveKd * avgShotsDisplay + costData.extraCost;
          
          // ⭐ 重新计算子弹消耗和总消耗（使用保留1位小数的值）
          const bulletCost = bulletConsumption * costData.bulletPrice;
          const weaponLossCost = costData.weaponLossCost;
          const totalCost = weaponLossCost + bulletCost;
          
          const costInW = totalCost / 10000;
          const weaponLossInW = weaponLossCost / 10000;
          const bulletCostInW = bulletCost / 10000;
          const weaponPriceInW = costData.weaponPrice / 10000;
          
          let color = '#4caf50';
          if (costInW > 30) color = '#ff9800';
          if (costInW > 60) color = '#f44336';
          
          const tooltipLines = [
            `═══════════════════════════════`,
            `💰 哈弗币消耗: ¥${costInW.toFixed(1)}W`,
            `═══════════════════════════════`,
            ``,
            `📐 计算公式:`,
            `  总消耗 = 整枪价格 × (1 - 撤离率) + 子弹消耗量 × 子弹单价`,
            ``,
            `📊 计算明细:`,
            `  整枪价格: ¥${weaponPriceInW.toFixed(1)}W`,
            `  撤离率: ${(costData.extractRate * 100).toFixed(0)}%`,
            `  → 整枪损失: ¥${weaponLossInW.toFixed(1)}W`,
            ``,
            `  平均致死枪数: ${avgShotsDisplay.toFixed(1)}发`,
            `  KD: ${costData.kdRatio}`,
            `  ⭐ KD放大: ×${effectiveKd} (KD×5)`,
            `  其他消耗: ${costData.extraCost}发`,
            `  → 子弹消耗量: ${bulletConsumption.toFixed(1)}发`,
            ``,
            `  子弹单价: ¥${costData.bulletPrice}`,
            `  → 子弹消耗: ¥${bulletCostInW.toFixed(1)}W`,
            ``,
            `───────────────────────────────`,
            `  ✅ 总消耗: ¥${costInW.toFixed(1)}W`
          ];
          
          return `<span class="havoc-cost" 
                       style="font-weight:600;color:${color};cursor:help;border-bottom:1px dashed #ccc;"
                       title="${tooltipLines.join('\n')}">
                    ¥${costInW.toFixed(1)}W
                  </span>`;
        }
      },

      // ==================== 操作（新增/删除） ====================
      {
        key: 'actions',
        label: '操作',
        editable: false,
        headerAttrs: { style: 'min-width:60px;' },
        render: (row) => {
          const isNewRow = row._isNewRow || false;
          let html = '';
          
          if (isNewRow) {
            html += `<button class="confirm-add-price-btn" data-row="${row._rowIndex || 0}" title="确认添加">✅</button>`;
            html += `<button class="cancel-add-price-btn" data-row="${row._rowIndex || 0}" title="取消">❌</button>`;
          } else {
            html += `<button class="delete-price-btn" data-row="${row._rowIndex || 0}" data-weapon-id="${row._weaponId || ''}" data-config-id="${row._rawConfigId || row._configId || ''}" title="删除行">🗑️</button>`;
          }
          
          return html;
        }
      },

      // ==================== 启用（复选框） ====================
      {
        key: 'enabled',
        label: '启用',
        editable: false,
        headerAttrs: { style: 'min-width:50px;' },
        render: (row) => {
          const checked = row.enabled !== false ? 'checked' : '';
          return `<input type="checkbox" class="price-enabled-checkbox" data-row="${row._rowIndex || 0}" ${checked} />`;
        }
      }
    ];
  }

  /**
   * 更新启用计数显示
   */
  static updateEnabledCount(container, data) {
    const countEl = container?.querySelector('.enabled-count');
    if (!countEl) return;
    
    const total = data ? data.length : 0;
    const enabled = data ? data.filter(row => row.enabled !== false).length : 0;
    countEl.textContent = `已选: ${enabled}/${total}`;
  }

  /**
   * 渲染价格表格
   */
  static render(config) {
    const {
      data,
      onCellChange = null,
      onAddRow = null,
      onDeleteRow = null,
      onEnabledChange = null,
      getBarrelOptions = null,
      getBulletOptions = null,
      muzzleOptions = ['无', '死寂', '先进/轻语/勇火', '冲锋枪回声消音器'],
      emptyText = '暂无价格数据',
      havocCosts = {}
    } = config;

    const indexedData = data.map((row, index) => {
      let barrelOptions = ['无'];
      if (typeof getBarrelOptions === 'function') {
        try {
          const opts = getBarrelOptions(row);
          if (opts && opts.length > 0) {
            barrelOptions = opts;
          }
        } catch (e) {
          console.warn('计算枪管选项失败:', e);
        }
      }
      
      const currentBarrel = row.barrel || '无';
      if (!barrelOptions.includes(currentBarrel) && currentBarrel !== '无') {
        barrelOptions.push(currentBarrel);
      }
      
      let muzzleOpts = muzzleOptions;
      if (row._muzzleOptions && row._muzzleOptions.length > 0) {
        muzzleOpts = row._muzzleOptions;
      }
      
      let bulletOptions = ['无'];
      if (typeof getBulletOptions === 'function') {
        try {
          const opts = getBulletOptions(row);
          if (opts && opts.length > 0) {
            bulletOptions = opts;
          }
        } catch (e) {
          console.warn('计算子弹选项失败:', e);
        }
      }
      
      if (!bulletOptions.includes('无')) {
        bulletOptions = ['无', ...bulletOptions];
      }
      
      const weaponId = row._weaponId;
      const configId = row.configId || row._configId || '#1';
      const uniqueKey = `${weaponId}_${configId}`;
      const costData = havocCosts[uniqueKey] || null;
      
      return {
        ...row,
        _rowIndex: index,
        _barrelOptions: barrelOptions,
        _muzzleOptions: muzzleOpts,
        _bulletOptions: bulletOptions,
        _getBulletOptions: getBulletOptions,
        _isNewRow: row._isNewRow || false,
        enabled: row.enabled !== false,
        _cache: row._cache || row.cache || null,
        _configId: row.configId || '#1',
        _havocCost: costData
      };
    });

    const columns = this.getColumns({
      onCellChange,
      onAddRow,
      onDeleteRow,
      onEnabledChange,
      getBarrelOptions,
      getBulletOptions,
      muzzleOptions,
      havocCosts
    });

    const totalCount = indexedData.length;
    const enabledCount = indexedData.filter(row => row.enabled !== false).length;

    const tableId = 'priceTable';
    const dataAttr = `data-table-id="${tableId}"`;

    const html = `
      <div class="price-table-controls">
        <span class="control-label">☑ 启用配置：</span>
        <button class="select-all-btn" data-table="${tableId}">全选</button>
        <button class="select-none-btn" data-table="${tableId}">全不选</button>
        <span class="control-hint">（取消勾选的配置将不参与 TTK 计算）</span>
        <span class="enabled-count">已选: ${enabledCount}/${totalCount}</span>
        <button class="add-config-btn" data-table="${tableId}" style="margin-left:8px;padding:2px 12px;border:1px solid #4caf50;border-radius:3px;font-size:11px;cursor:pointer;background:#4caf50;color:#fff;height:24px;display:inline-flex;align-items:center;gap:4px;">
          ➕ 新增配置
        </button>
      </div>
      <div class="table-scroll">
        <table id="${tableId}" ${dataAttr}>
          <thead>${this.renderHeader(columns)}</thead>
          <tbody>${this.renderBody(columns, indexedData)}</tbody>
        </table>
      </div>
    `;

    const table = TableRenderer.createInstance(
      {
        id: tableId,
        columns,
        data: indexedData,
        rowClass: (row) => row._isNewRow ? 'new-price-row' : '',
        onCellChange: (rowIndex, key, value, row) => {
          if (key === 'price') {
            const priceInW = parseFloat(value);
            if (!isNaN(priceInW) && priceInW >= 0) {
              if (onCellChange) onCellChange(rowIndex, key, priceInW * 10000, row);
            }
            return;
          }
          if (key === 'hitRateRaw') {
            if (onCellChange) onCellChange(rowIndex, key, value, row);
            return;
          }
          if (key === 'barrel' || key === 'muzzle' || key === 'bulletDisplay') {
            if (onCellChange) onCellChange(rowIndex, key, value, row);
            return;
          }
          if (onCellChange) onCellChange(rowIndex, key, value, row);
        }
      },
      html
    );

    table._config = {
      onEnabledChange,
      onCellChange,
      onAddRow,
      onDeleteRow,
      getBarrelOptions,
      getBulletOptions,
      muzzleOptions,
      havocCosts
    };

    const container = document.getElementById('tab-price');
    if (container) {
      this.bindCustomEvents(container, table, {
        onCellChange,
        onAddRow,
        onDeleteRow,
        onEnabledChange,
        getBarrelOptions,
        getBulletOptions,
        muzzleOptions,
        havocCosts
      });
    }

    return table;
  }

  /**
   * 渲染表头
   */
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

  /**
   * 渲染表体
   */
  static renderBody(columns, data) {
    if (!data || data.length === 0) {
      const colCount = columns.length;
      return `<tr><td colspan="${colCount}" class="empty-cell">暂无数据</td></tr>`;
    }
    
    return data.map((row, index) => {
      let html = `<tr data-index="${index}">`;
      html += columns.map(col => {
        let cellValue;
        if (typeof col.render === 'function') {
          cellValue = col.render(row, index);
        } else {
          const val = row[col.key];
          cellValue = val !== undefined && val !== null ? TableRenderer.escapeHtml(String(val)) : '-';
        }
        const colKey = col.key;
        const isEditable = col.editable !== false;
        
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
        
        if (colKey === 'barrel' && row._barrelOptions && row._barrelOptions.length > 0) {
          cellAttrs['data-barrel-options'] = JSON.stringify(row._barrelOptions);
        }
        if (colKey === 'muzzle' && row._muzzleOptions && row._muzzleOptions.length > 0) {
          cellAttrs['data-muzzle-options'] = JSON.stringify(row._muzzleOptions);
        }
        if (colKey === 'bulletDisplay' && row._bulletOptions && row._bulletOptions.length > 0) {
          cellAttrs['data-bullet-options'] = JSON.stringify(row._bulletOptions);
        }
        
        if (isEditable && col.inputType === 'select' && typeof col.getOptions === 'function') {
          try {
            const opts = col.getOptions(row);
            if (opts && opts.length > 0) {
              const optionsStr = JSON.stringify(opts);
              if (colKey === 'barrel' && !cellAttrs['data-barrel-options']) {
                cellAttrs['data-barrel-options'] = optionsStr;
              }
              if (colKey === 'muzzle' && !cellAttrs['data-muzzle-options']) {
                cellAttrs['data-muzzle-options'] = optionsStr;
              }
              if (colKey === 'bulletDisplay' && !cellAttrs['data-bullet-options']) {
                cellAttrs['data-bullet-options'] = optionsStr;
              }
            }
          } catch(e) {
            // 忽略 getOptions 错误
          }
        }
        
        if (colKey === 'configId' && row.configId) {
          cellAttrs['data-config-id'] = row.configId;
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
   * 绑定自定义事件
   */
  static bindCustomEvents(container, table, handlers) {
    const {
      onCellChange,
      onAddRow,
      onDeleteRow,
      onEnabledChange,
      getBarrelOptions,
      getBulletOptions,
      muzzleOptions,
      havocCosts
    } = handlers;

    if (!container) return;
    
    if (container._priceTableBound) {
      const newContainer = container.cloneNode(true);
      container.parentNode?.replaceChild(newContainer, container);
      container = document.getElementById('tab-price');
      if (!container) return;
    }
    container._priceTableBound = true;

    // ⭐ 新增配置按钮
    container.addEventListener('click', (e) => {
      const addBtn = e.target.closest('.add-config-btn');
      if (addBtn) {
        const event = new CustomEvent('price-add-config', {
          detail: { table: table, data: table.getData() },
          bubbles: true
        });
        document.dispatchEvent(event);
        e.preventDefault();
      }
    });

    // ===== 枪管选择变更 =====
    container.addEventListener('change', (e) => {
      const select = e.target.closest('select[data-price-barrel="true"]');
      if (!select) return;
      
      const td = select.closest('td');
      const row = td?.closest('tr');
      if (!row) return;
      
      const rowIndex = parseInt(row.dataset.index);
      if (isNaN(rowIndex)) return;
      
      const value = select.value;
      
      if (onCellChange) {
        const rowData = table.getData()[rowIndex];
        if (rowData) {
          onCellChange(rowIndex, 'barrel', value, rowData);
        }
      }
    });

    // ===== 枪口选择变更 =====
    container.addEventListener('change', (e) => {
      const select = e.target.closest('select[data-price-muzzle="true"]');
      if (!select) return;
      
      const td = select.closest('td');
      const row = td?.closest('tr');
      if (!row) return;
      
      const rowIndex = parseInt(row.dataset.index);
      if (isNaN(rowIndex)) return;
      
      const value = select.value;
      
      if (onCellChange) {
        const rowData = table.getData()[rowIndex];
        if (rowData) {
          onCellChange(rowIndex, 'muzzle', value, rowData);
        }
      }
    });

    // ===== 子弹选择变更 =====
    container.addEventListener('change', (e) => {
      const select = e.target.closest('select[data-price-bullet="true"]');
      if (!select) return;
      
      const td = select.closest('td');
      const row = td?.closest('tr');
      if (!row) return;
      
      const rowIndex = parseInt(row.dataset.index);
      if (isNaN(rowIndex)) return;
      
      const value = select.value;
      
      if (onCellChange) {
        const rowData = table.getData()[rowIndex];
        if (rowData) {
          onCellChange(rowIndex, 'bulletDisplay', value, rowData);
        }
      }
    });

    // ===== 操作按钮 =====
    container.addEventListener('click', (e) => {
      const confirmBtn = e.target.closest('.confirm-add-price-btn');
      if (confirmBtn) {
        const row = confirmBtn.closest('tr');
        const rowIndex = parseInt(row?.dataset.index);
        if (!isNaN(rowIndex) && onAddRow) {
          const rowData = table.getData()[rowIndex];
          onAddRow(rowIndex, rowData);
        }
        return;
      }
      
      const cancelBtn = e.target.closest('.cancel-add-price-btn');
      if (cancelBtn) {
        const row = cancelBtn.closest('tr');
        const rowIndex = parseInt(row?.dataset.index);
        if (!isNaN(rowIndex) && onDeleteRow) {
          onDeleteRow(rowIndex, null, null, true);
        }
        return;
      }
      
      const deleteBtn = e.target.closest('.delete-price-btn');
      if (deleteBtn) {
        const row = deleteBtn.closest('tr');
        const rowIndex = parseInt(row?.dataset.index);
        const weaponId = deleteBtn.dataset.weaponId;
        const configId = deleteBtn.dataset.configId;
        if (!isNaN(rowIndex) && onDeleteRow) {
          if (confirm(`确定要删除 ${row?.querySelector('td:first-child')?.textContent || '该'} 配置吗？`)) {
            onDeleteRow(rowIndex, weaponId, configId, false);
          }
        }
        return;
      }
    });

    // ===== 全选/取消全选 =====
    container.addEventListener('click', (e) => {
      const target = e.target;
      
      if (target.classList.contains('select-all-btn') || target.classList.contains('select-none-btn')) {
        const isAll = target.classList.contains('select-all-btn');
        const checkboxes = container.querySelectorAll('.price-enabled-checkbox');
        const tableData = table.getData();
        
        checkboxes.forEach((cb, index) => {
          cb.checked = isAll;
          if (tableData && tableData[index]) {
            tableData[index].enabled = isAll;
          }
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        });
        
        this.updateEnabledCount(container, tableData);
        
        const event = new CustomEvent('price-enabled-batch-change', {
          detail: { enabled: isAll }
        });
        document.dispatchEvent(event);
        
        if (onEnabledChange && tableData) {
          tableData.forEach((row, index) => {
            onEnabledChange(index, isAll, row);
          });
        }
        
        e.preventDefault();
      }
    });

    // ===== 复选框变更 =====
    container.addEventListener('change', (e) => {
      const cb = e.target.closest('.price-enabled-checkbox');
      if (!cb) return;
      
      const row = cb.closest('tr');
      const rowIndex = parseInt(row?.dataset.index);
      if (isNaN(rowIndex)) return;
      
      const rowData = table.getData()[rowIndex];
      if (rowData) {
        rowData.enabled = cb.checked;
      }
      
      const tableData = table.getData();
      this.updateEnabledCount(container, tableData);
      
      const event = new CustomEvent('price-enabled-change', {
        detail: { rowIndex, enabled: cb.checked, rowData }
      });
      document.dispatchEvent(event);
      
      if (onEnabledChange && rowData) {
        onEnabledChange(rowIndex, cb.checked, rowData);
      }
    });
  }

  /**
   * ⭐ 更新价格表格数据（修复：同步更新表格实例内部数据）
   */
  static update(container, data, config = {}) {
    const target = typeof container === 'string' 
      ? document.querySelector(container) 
      : container;
    
    if (!target) {
      console.warn('PriceTable: 容器不存在');
      return data;
    }

    const {
      onCellChange,
      onAddRow,
      onDeleteRow,
      onEnabledChange,
      getBarrelOptions,
      getBulletOptions,
      muzzleOptions = ['无', '死寂', '先进/轻语/勇火', '冲锋枪回声消音器'],
      havocCosts = {}
    } = config;

    const indexedData = data.map((row, index) => {
      let barrelOptions = ['无'];
      if (typeof getBarrelOptions === 'function') {
        try {
          const opts = getBarrelOptions(row);
          if (opts && opts.length > 0) {
            barrelOptions = opts;
          }
        } catch (e) {
          console.warn('计算枪管选项失败:', e);
        }
      }
      
      const currentBarrel = row.barrel || '无';
      if (!barrelOptions.includes(currentBarrel) && currentBarrel !== '无') {
        barrelOptions.push(currentBarrel);
      }
      
      let muzzleOpts = muzzleOptions;
      if (row._muzzleOptions && row._muzzleOptions.length > 0) {
        muzzleOpts = row._muzzleOptions;
      }
      
      let bulletOptions = ['无'];
      if (typeof getBulletOptions === 'function') {
        try {
          const opts = getBulletOptions(row);
          if (opts && opts.length > 0) {
            bulletOptions = opts;
          }
        } catch (e) {
          // 忽略
        }
      }
      
      if (!bulletOptions.includes('无')) {
        bulletOptions = ['无', ...bulletOptions];
      }
      
      const weaponId = row._weaponId;
      const configId = row.configId || row._configId || '#1';
      const uniqueKey = `${weaponId}_${configId}`;
      const costData = havocCosts[uniqueKey] || null;
      
      return {
        ...row,
        _rowIndex: index,
        _barrelOptions: barrelOptions,
        _muzzleOptions: muzzleOpts,
        _bulletOptions: bulletOptions,
        _getBulletOptions: getBulletOptions,
        _isNewRow: row._isNewRow || false,
        enabled: row.enabled !== false,
        _cache: row._cache || row.cache || null,
        _configId: row.configId || '#1',
        _havocCost: costData
      };
    });

    const columns = this.getColumns({
      onCellChange,
      onAddRow,
      onDeleteRow,
      onEnabledChange,
      getBarrelOptions,
      getBulletOptions,
      muzzleOptions,
      havocCosts
    });

    this.updateEnabledCount(target, indexedData);

    const tableEl = target.querySelector('#priceTable');
    const tableId = 'priceTable';
    
    if (tableEl) {
      // 更新 tbody
      const tbody = tableEl.querySelector('tbody');
      if (tbody) {
        tbody.innerHTML = this.renderBody(columns, indexedData);
      }
      
      // ⭐ 关键修复：同步更新表格实例的内部数据
      if (window._tableInstances && window._tableInstances[tableId]) {
        // 更新内部数据
        window._tableInstances[tableId]._data = indexedData;
        // 如果有 setData 方法，也调用
        if (typeof window._tableInstances[tableId].setData === 'function') {
          window._tableInstances[tableId].setData(indexedData);
        }
      }
    } else {
      // 如果表格不存在，重新渲染整个内容
      const totalCount = indexedData.length;
      const enabledCount = indexedData.filter(row => row.enabled !== false).length;
      
      target.innerHTML = `
        <div class="price-table-controls">
          <span class="control-label">☑ 启用配置：</span>
          <button class="select-all-btn" data-table="priceTable">全选</button>
          <button class="select-none-btn" data-table="priceTable">全不选</button>
          <span class="control-hint">（取消勾选的配置将不参与 TTK 计算）</span>
          <span class="enabled-count">已选: ${enabledCount}/${totalCount}</span>
          <button class="add-config-btn" data-table="priceTable" style="margin-left:8px;padding:2px 12px;border:1px solid #4caf50;border-radius:3px;font-size:11px;cursor:pointer;background:#4caf50;color:#fff;height:24px;display:inline-flex;align-items:center;gap:4px;">
            ➕ 新增配置
          </button>
        </div>
        <div class="table-scroll">
          <table id="priceTable">
            <thead>${this.renderHeader(columns)}</thead>
            <tbody>${this.renderBody(columns, indexedData)}</tbody>
          </table>
        </div>
      `;
    }
    
    return indexedData;
  }

  /**
   * 获取所有启用的价格行索引
   */
  static getEnabledRows(data) {
    return data
      .map((row, index) => row.enabled !== false ? index : -1)
      .filter(index => index >= 0);
  }

  /**
   * 获取所有启用的价格行数据
   */
  static getEnabledData(data) {
    return data.filter(row => row.enabled !== false);
  }

  /**
   * ⭐ 构建价格行数据（确保 barrelId 被正确保留）
   */
  static buildRowData(rowData, extra = {}) {
    let hitRateRaw = '';
    if (rowData.distance && rowData.hitRate && 
        Array.isArray(rowData.distance) && Array.isArray(rowData.hitRate) &&
        rowData.distance.length > 0 && rowData.hitRate.length > 0) {
      const parts = [];
      const len = Math.min(rowData.distance.length, rowData.hitRate.length);
      for (let i = 0; i < len; i++) {
        parts.push(`${rowData.distance[i]}:${rowData.hitRate[i]}`);
      }
      hitRateRaw = parts.join(',');
    }

    const weaponId = rowData._weaponId !== undefined ? rowData._weaponId : rowData.weaponId;
    const configId = rowData.configId || '#1';
    
    // ⭐ 确保 barrelId 有值（关键修复）
    const barrelId = rowData.barrelId !== undefined ? rowData.barrelId : -1;
    
    const result = {
      weaponName: rowData.weaponName || '-',
      configId: configId,
      _rawConfigId: configId,
      _configId: configId,
      // ⭐ 显式保留 barrelId
      barrelId: barrelId,
      barrel: rowData.barrel || '无',
      muzzle: rowData.muzzle || '无',
      buildCode: rowData.buildCode || '',
      price: rowData.price || 0,
      hitRateRaw: hitRateRaw,
      bulletDisplay: rowData.bulletDisplay || '-',
      
      _weaponId: weaponId,
      _distance: rowData.distance || [],
      _hitRate: rowData.hitRate || [],
      _bulletId: rowData.bulletId || '',
      _rawConfig: rowData._rawConfig || {},
      _isNewRow: false,
      enabled: rowData.enabled !== undefined ? rowData.enabled : true,
      _cache: rowData._cache || rowData.cache || null,
      
      ...extra
    };
    
    return result;
  }

  /**
   * 创建新增行数据
   */
  static createNewRow(weaponId, weaponName, nextConfigId, defaults = {}) {
    const rawId = nextConfigId || '#new';
    const displayId = rawId;
    
    return {
      weaponName: weaponName || '-',
      configId: displayId,
      _rawConfigId: rawId,
      _configId: rawId,
      barrel: defaults.barrel || '无',
      muzzle: defaults.muzzle || '无',
      buildCode: defaults.buildCode || '',
      price: (defaults.price || 0) * 10000,
      hitRateRaw: defaults.hitRateRaw || '',
      bulletDisplay: defaults.bulletDisplay || '-',
      _weaponId: weaponId,
      _distance: [],
      _hitRate: [],
      _bulletId: '',
      _rawConfig: {},
      _isNewRow: true,
      enabled: true,
      _cache: null
    };
  }

  /**
   * 解析命中率字符串
   */
  static parseHitRateRaw(hitRateRaw) {
    const distance = [];
    const hitRate = [];
    
    if (!hitRateRaw || hitRateRaw.trim() === '') {
      return { distance, hitRate };
    }
    
    try {
      const parts = hitRateRaw.split(',').map(p => p.trim());
      for (const part of parts) {
        const [dist, rate] = part.split(':');
        if (dist && rate) {
          const d = parseFloat(dist);
          const r = parseFloat(rate);
          if (!isNaN(d) && !isNaN(r) && d >= 0 && r >= 0 && r <= 1) {
            distance.push(d);
            hitRate.push(r);
          }
        }
      }
    } catch (e) {
      console.warn('解析命中率失败:', e);
    }
    
    return { distance, hitRate };
  }

  /**
   * 格式化命中率为显示字符串
   */
  static formatHitRateDisplay(hitRateRaw) {
    if (!hitRateRaw || hitRateRaw.trim() === '') return '-';
    
    try {
      const parts = hitRateRaw.split(',').map(p => p.trim());
      const displayParts = parts.map(p => {
        const [dist, rate] = p.split(':');
        if (dist && rate) {
          const percentage = Math.round(parseFloat(rate) * 100);
          return `${dist}m:${percentage}%`;
        }
        return p;
      });
      return displayParts.join(' ');
    } catch (e) {
      return hitRateRaw;
    }
  }
}

export default PriceTable;