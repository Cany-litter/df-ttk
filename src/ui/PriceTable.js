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
 * - 整枪价格（数字编辑）
 * - 命中率（文本编辑，格式：30:0.9,50:0.8,100:0.6）
 * - 子弹（下拉选择，从武器口径对应的子弹列表读取）
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
      onEnabledChange = null
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

      // ==================== 序号（只读，显示 #1, #2, #3） ====================
      {
        key: 'configId',
        label: '序号',
        editable: false,
        headerAttrs: { style: 'min-width:50px;' },
        render: (row) => {
          return TableRenderer.escapeHtml(row.configId || '-');
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

      // ==================== 整枪价格（数字编辑） ====================
      {
        key: 'price',
        label: '整枪价格',
        editable: true,
        inputType: 'number',
        inputStep: 1,
        inputMin: 0,
        headerAttrs: { style: 'min-width:80px;' },
        render: (row) => {
          const price = row.price;
          if (price === undefined || price === null || price === 0) return '-';
          return `¥${Number(price).toLocaleString()}`;
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
   * @param {HTMLElement} container - 表格容器
   * @param {Array} data - 数据数组
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
   * @param {Object} config - 表格配置
   * @param {Array} config.data - 价格数据数组
   * @param {Function} config.onCellChange - 单元格变更回调 (rowIndex, key, value, row)
   * @param {Function} config.onAddRow - 新增行回调 (rowIndex, rowData)
   * @param {Function} config.onDeleteRow - 删除行回调 (rowIndex, weaponId, configId, isCancelled)
   * @param {Function} config.onEnabledChange - 启用状态变更回调 (rowIndex, enabled, row)
   * @param {Function} config.getBarrelOptions - 获取枪管选项函数
   * @param {Function} config.getBulletOptions - 获取子弹选项函数
   * @param {Array} config.muzzleOptions - 枪口选项
   * @param {string} config.emptyText - 空数据提示
   * @returns {Object} 表格实例
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
      emptyText = '暂无价格数据'
    } = config;

    const indexedData = data.map((row, index) => {
      let barrelOptions = ['无'];
      if (typeof getBarrelOptions === 'function') {
        const opts = getBarrelOptions(row);
        if (opts && opts.length > 0) {
          barrelOptions = opts;
        }
      }
      
      if (!barrelOptions.includes('无')) {
        barrelOptions = ['无', ...barrelOptions];
      }
      barrelOptions = [...new Set(barrelOptions)];
      
      let muzzleOpts = muzzleOptions;
      if (row._muzzleOptions && row._muzzleOptions.length > 0) {
        muzzleOpts = row._muzzleOptions;
      }
      
      return {
        ...row,
        _rowIndex: index,
        _barrelOptions: barrelOptions,
        _muzzleOptions: muzzleOpts,
        _isNewRow: row._isNewRow || false,
        enabled: row.enabled !== false
      };
    });

    const columns = this.getColumns({
      onCellChange,
      onAddRow,
      onDeleteRow,
      onEnabledChange,
      getBarrelOptions,
      getBulletOptions,
      muzzleOptions
    });

    // 计算启用数量
    const totalCount = indexedData.length;
    const enabledCount = indexedData.filter(row => row.enabled !== false).length;

    // 构建完整 HTML（包含控制栏）
    const tableId = 'priceTable';
    const attrsStr = '';
    const dataAttr = `data-table-id="${tableId}"`;

    const html = `
      <div class="price-table-controls">
        <span class="control-label">☑ 启用配置：</span>
        <button class="select-all-btn" data-table="${tableId}">全选</button>
        <button class="select-none-btn" data-table="${tableId}">全不选</button>
        <span class="control-hint">（取消勾选的配置将不参与 TTK 计算）</span>
        <span class="enabled-count">已选: ${enabledCount}/${totalCount}</span>
      </div>
      <div class="table-scroll">
        <table id="${tableId}" ${attrsStr} ${dataAttr}>
          <thead>${this.renderHeader(columns)}</thead>
          <tbody>${this.renderBody(columns, indexedData)}</tbody>
        </table>
      </div>
    `;

    // 创建表格实例
    const table = TableRenderer.createInstance(
      {
        id: tableId,
        columns,
        data: indexedData,
        rowClass: (row) => row._isNewRow ? 'new-price-row' : '',
        onCellChange: (rowIndex, key, value, row) => {
          if (key === 'price') {
            const numValue = parseFloat(value);
            if (!isNaN(numValue) && numValue >= 0) {
              if (onCellChange) onCellChange(rowIndex, key, numValue, row);
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

    // 存储配置到表格实例
    table._config = {
      onEnabledChange,
      onCellChange,
      onAddRow,
      onDeleteRow
    };

    // 绑定事件（传入容器元素）
    const container = document.getElementById('tab-price');
    if (container) {
      this.bindCustomEvents(container, table, {
        onCellChange,
        onAddRow,
        onDeleteRow,
        onEnabledChange,
        getBarrelOptions,
        getBulletOptions,
        muzzleOptions
      });
    }

    return table;
  }

  /**
   * 渲染表头（内部使用）
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
   * 渲染表体（内部使用）
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
        
        const attrs = {
          'data-col': colKey,
          'data-row': index
        };
        
        if (isEditable) {
          attrs['data-editable'] = 'true';
          if (col.inputType) attrs['data-input-type'] = col.inputType;
          if (col.inputStep) attrs['data-input-step'] = col.inputStep;
          if (col.inputMin !== undefined) attrs['data-input-min'] = col.inputMin;
          if (col.inputMax !== undefined) attrs['data-input-max'] = col.inputMax;
          if (col.inputPlaceholder) attrs['data-input-placeholder'] = col.inputPlaceholder;
        }
        
        // 传递选项数据
        if (colKey === 'barrel' && row._barrelOptions) {
          attrs['data-barrel-options'] = JSON.stringify(row._barrelOptions);
        }
        if (colKey === 'muzzle' && row._muzzleOptions) {
          attrs['data-muzzle-options'] = JSON.stringify(row._muzzleOptions);
        }
        
        const attrsStr = Object.entries(attrs)
          .map(([k, v]) => `${k}="${v}"`)
          .join(' ');
        
        return `<td ${attrsStr}>${cellValue}</td>`;
      }).join('');
      html += '</tr>';
      return html;
    }).join('');
  }

  /**
   * 绑定自定义事件
   * @param {HTMLElement} container - 容器元素（#tab-price）
   * @param {Object} table - 表格实例
   * @param {Object} handlers - 事件处理器
   */
  static bindCustomEvents(container, table, handlers) {
    const {
      onCellChange,
      onAddRow,
      onDeleteRow,
      onEnabledChange,
      getBarrelOptions,
      getBulletOptions,
      muzzleOptions
    } = handlers;

    if (!container) return;
    
    // 移除旧的事件监听器（避免重复绑定）
    if (container._priceTableBound) {
      // 如果已经绑定，先移除所有监听器（通过克隆替换）
      const newContainer = container.cloneNode(true);
      container.parentNode?.replaceChild(newContainer, container);
      // 重新获取引用
      container = document.getElementById('tab-price');
      if (!container) return;
    }
    container._priceTableBound = true;

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

    // ===== 全选/取消全选按钮 =====
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
          // 触发 change 事件
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        });
        
        // 更新计数
        this.updateEnabledCount(container, tableData);
        
        // 触发全选变更事件
        const event = new CustomEvent('price-enabled-batch-change', {
          detail: { enabled: isAll }
        });
        document.dispatchEvent(event);
        
        // 调用每个行的启用变更回调
        if (onEnabledChange && tableData) {
          tableData.forEach((row, index) => {
            onEnabledChange(index, isAll, row);
          });
        }
        
        e.preventDefault();
      }
    });

    // ===== 复选框变更（更新计数） =====
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
      
      // 更新计数
      const tableData = table.getData();
      this.updateEnabledCount(container, tableData);
      
      // 触发自定义事件
      const event = new CustomEvent('price-enabled-change', {
        detail: { rowIndex, enabled: cb.checked, rowData }
      });
      document.dispatchEvent(event);
      
      // 调用回调
      if (onEnabledChange && rowData) {
        onEnabledChange(rowIndex, cb.checked, rowData);
      }
    });
  }

  /**
   * 更新价格表格数据
   * @param {string|HTMLElement} container - 容器元素或选择器
   * @param {Array} data - 新的价格数据
   * @param {Object} config - 额外配置
   * @returns {Array} 处理后的数据
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
      muzzleOptions = ['无', '死寂', '先进/轻语/勇火', '冲锋枪回声消音器']
    } = config;

    const indexedData = data.map((row, index) => {
      let barrelOptions = ['无'];
      if (typeof getBarrelOptions === 'function') {
        const opts = getBarrelOptions(row);
        if (opts && opts.length > 0) {
          barrelOptions = opts;
        }
      }
      
      if (!barrelOptions.includes('无')) {
        barrelOptions = ['无', ...barrelOptions];
      }
      barrelOptions = [...new Set(barrelOptions)];
      
      let muzzleOpts = muzzleOptions;
      if (row._muzzleOptions && row._muzzleOptions.length > 0) {
        muzzleOpts = row._muzzleOptions;
      }
      
      return {
        ...row,
        _rowIndex: index,
        _barrelOptions: barrelOptions,
        _muzzleOptions: muzzleOpts,
        _isNewRow: row._isNewRow || false,
        enabled: row.enabled !== false
      };
    });

    const columns = this.getColumns({
      onCellChange,
      onAddRow,
      onDeleteRow,
      onEnabledChange,
      getBarrelOptions,
      getBulletOptions,
      muzzleOptions
    });

    // 更新控制栏计数
    this.updateEnabledCount(target, indexedData);

    // 获取现有的表格元素
    const tableEl = target.querySelector('#priceTable');
    if (tableEl) {
      // 只更新 tbody
      const tbody = tableEl.querySelector('tbody');
      if (tbody) {
        tbody.innerHTML = this.renderBody(columns, indexedData);
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
   * @param {Array} data - 价格数据
   * @returns {Array} 启用的行索引数组
   */
  static getEnabledRows(data) {
    return data
      .map((row, index) => row.enabled !== false ? index : -1)
      .filter(index => index >= 0);
  }

  /**
   * 获取所有启用的价格行数据
   * @param {Array} data - 价格数据
   * @returns {Array} 启用的行数据数组
   */
  static getEnabledData(data) {
    return data.filter(row => row.enabled !== false);
  }

  /**
   * 构建价格行数据（从 DataManager 的原始数据转换）
   * @param {Object} rowData - DataManager.getPriceRows() 返回的行数据
   * @param {Object} extra - 额外字段
   * @returns {Object} 完整的行数据
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
    
    // 将 cfg-1 转换为 #1, cfg-2 转换为 #2
    const rawConfigId = rowData.configId || 'cfg-1';
    const displayConfigId = rawConfigId.replace('cfg-', '#');
    
    const result = {
      weaponName: rowData.weaponName || '-',
      configId: displayConfigId,
      _rawConfigId: rawConfigId,
      barrel: rowData.barrel || '无',
      muzzle: rowData.muzzle || '无',
      buildCode: rowData.buildCode || '',
      price: rowData.price || 0,
      hitRateRaw: hitRateRaw,
      bulletDisplay: rowData.bulletDisplay || '-',
      
      _weaponId: weaponId,
      _configId: rowData.configId,
      _distance: rowData.distance || [],
      _hitRate: rowData.hitRate || [],
      _bulletId: rowData.bulletId || '',
      _rawConfig: rowData._rawConfig || {},
      _isNewRow: false,
      enabled: true,
      
      ...extra
    };
    
    return result;
  }

  /**
   * 创建新增行数据
   * @param {number} weaponId - 武器 ID
   * @param {string} weaponName - 武器名称
   * @param {string} nextConfigId - 下一个配置 ID
   * @param {Object} defaults - 默认值
   * @returns {Object} 新增行数据
   */
  static createNewRow(weaponId, weaponName, nextConfigId, defaults = {}) {
    const rawId = nextConfigId || 'cfg-new';
    const displayId = rawId.replace('cfg-', '#');
    
    return {
      weaponName: weaponName || '-',
      configId: displayId,
      _rawConfigId: rawId,
      barrel: defaults.barrel || '无',
      muzzle: defaults.muzzle || '无',
      buildCode: defaults.buildCode || '',
      price: defaults.price || 0,
      hitRateRaw: defaults.hitRateRaw || '',
      bulletDisplay: defaults.bulletDisplay || '-',
      _weaponId: weaponId,
      _configId: nextConfigId,
      _distance: [],
      _hitRate: [],
      _bulletId: '',
      _rawConfig: {},
      _isNewRow: true,
      enabled: true
    };
  }

  /**
   * 解析命中率字符串为距离和命中率数组
   * @param {string} hitRateRaw - 格式 "30:0.9,50:0.8,100:0.6"
   * @returns {Object} { distance: [], hitRate: [] }
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
   * @param {string} hitRateRaw - 格式 "30:0.9,50:0.8,100:0.6"
   * @returns {string} 显示字符串 "30m:90% 50m:80% 100m:60%"
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