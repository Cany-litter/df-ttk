/**
 * 通用表格渲染器 - 支持可编辑列（含动态 select 选项）
 * 
 * 配置驱动的表格渲染引擎，通过列配置和数据生成表格 HTML
 * 支持单元格编辑、输入验证、变更回调
 * 
 * 新增功能：
 * - 支持动态 select 选项：从行数据的 _barrelOptions / _muzzleOptions 读取
 * - 支持列配置中的 getOptions 函数
 * 
 * 使用示例：
 * ```javascript
 * const table = TableRenderer.render({
 *   id: 'myTable',
 *   columns: [
 *     { 
 *       key: 'barrel', 
 *       label: '枪管', 
 *       editable: true,
 *       inputType: 'select',
 *       getOptions: (row) => ['无', '长枪管', '短枪管']
 *     }
 *   ],
 *   data: [...],
 *   onCellChange: (rowIndex, key, value, row) => { /* 处理变更 * / }
 * });
 * ```
 */
export class TableRenderer {
  /**
   * 渲染表格
   * @param {Object} config - 表格配置
   * @param {string} config.id - 表格 ID
   * @param {Array} config.columns - 列配置数组
   * @param {Array} config.data - 数据数组
   * @param {string} config.emptyText - 空数据提示文本
   * @param {string|Function} config.rowClass - 行类名或动态行类名函数
   * @param {Function} config.onCellChange - 单元格变更回调 (rowIndex, key, value, row)
   * @param {Function} config.onRowClick - 行点击回调
   * @param {Object} config.extraAttrs - 表格额外属性
   * @param {boolean} config.showRowIndex - 是否显示行号
   * @param {string} config.rowIndexLabel - 行号列标题
   * @returns {Object} 表格实例
   */
  static render(config) {
    const {
      id,
      columns,
      data,
      emptyText = '暂无数据',
      rowClass = '',
      onCellChange = null,
      onRowClick = null,
      extraAttrs = {},
      showRowIndex = false,
      rowIndexLabel = '#'
    } = config;

    const instanceConfig = {
      id,
      columns,
      data: data || [],
      rowClass,
      onRowClick,
      onCellChange,
      showRowIndex,
      rowIndexLabel
    };

    if (!data || data.length === 0) {
      const html = this.renderEmptyState(emptyText);
      return this.createInstance(instanceConfig, html);
    }

    const attrsStr = this.buildAttributes(extraAttrs);
    const dataAttr = `data-table-id="${id}"`;

    const html = `
      <div class="table-scroll">
        <table id="${id}" ${attrsStr} ${dataAttr}>
          <thead>${this.renderHeader(columns, showRowIndex, rowIndexLabel)}</thead>
          <tbody>${this.renderBody(columns, data, rowClass, onRowClick, onCellChange, showRowIndex)}</tbody>
        </table>
      </div>
    `;

    return this.createInstance(instanceConfig, html);
  }

  /**
   * 创建表格实例
   * @param {Object} config - 表格配置
   * @param {string} html - 表格 HTML
   * @returns {Object} 表格实例
   */
  static createInstance(config, html) {
    const {
      id,
      columns,
      data,
      rowClass,
      onRowClick,
      onCellChange,
      showRowIndex,
      rowIndexLabel
    } = config;

    let currentData = data || [];
    let currentColumns = columns || [];
    let currentOnCellChange = onCellChange || null;
    let currentOnRowClick = onRowClick || null;
    let currentRowClass = rowClass || '';

    // 🔥 注册到全局，供 exitEditMode 使用
    if (!window._tableInstances) {
      window._tableInstances = {};
    }
    window._tableInstances[id] = {
      getData: () => currentData,
      getColumns: () => currentColumns,
      setData: (newData) => {
        currentData = newData;
        return this.updateTable(id, currentColumns, currentData, {
          rowClass: currentRowClass,
          onRowClick: currentOnRowClick,
          onCellChange: currentOnCellChange,
          showRowIndex: showRowIndex
        });
      }
    };

    return {
      getHTML() { return html; },
      getElement() { return document.getElementById(id); },
      setData(newData) {
        currentData = newData;
        return this.update(newData);
      },
      update(data, options = {}) {
        const dataToUse = data || currentData;
        return TableRenderer.updateTable(id, currentColumns, dataToUse, {
          rowClass: currentRowClass,
          onRowClick: currentOnRowClick,
          onCellChange: currentOnCellChange,
          showRowIndex: showRowIndex,
          ...options
        });
      },
      getData() { return currentData; },
      bindEdit(onChange) {
        if (onChange) {
          currentOnCellChange = onChange;
        }
        const el = this.getElement();
        if (el) {
          TableRenderer.bindEditEvents(el, currentOnCellChange);
        }
        return this;
      },
      onCellChange(callback) {
        currentOnCellChange = callback;
        return this;
      },
      onRowClick(callback) {
        currentOnRowClick = callback;
        return this;
      },
      getColumns() { return currentColumns; },
      setColumns(newColumns) {
        currentColumns = newColumns;
        return this;
      },
      destroy() {
        const el = this.getElement();
        if (el) {
          const newEl = el.cloneNode(true);
          el.parentNode?.replaceChild(newEl, el);
        }
        if (window._tableInstances) {
          delete window._tableInstances[id];
        }
      }
    };
  }

  /**
   * 渲染空状态
   * @param {string} emptyText - 提示文本
   * @returns {string} 空状态 HTML
   */
  static renderEmptyState(emptyText) {
    return `
      <div class="empty-state">
        <span class="empty-icon">📭</span>
        <span class="empty-text">${this.escapeHtml(emptyText)}</span>
      </div>
    `;
  }

  /**
   * 渲染表头
   * @param {Array} columns - 列配置数组
   * @param {boolean} showRowIndex - 是否显示行号
   * @param {string} rowIndexLabel - 行号列标题
   * @returns {string} 表头 HTML
   */
  static renderHeader(columns, showRowIndex, rowIndexLabel) {
    let html = '<tr>';
    
    if (showRowIndex) {
      html += `<th class="row-index-header">${this.escapeHtml(rowIndexLabel)}</th>`;
    }
    
    html += columns.map(col => {
      const attrs = col.headerAttrs || {};
      const attrsStr = this.buildAttributes(attrs);
      const label = col.label || col.key || '';
      return `<th ${attrsStr}>${this.escapeHtml(label)}</th>`;
    }).join('');
    
    html += '</tr>';
    return html;
  }

  /**
   * 渲染表体
   * @param {Array} columns - 列配置数组
   * @param {Array} data - 数据数组
   * @param {string|Function} rowClass - 行类名
   * @param {Function} onRowClick - 行点击回调
   * @param {Function} onCellChange - 单元格变更回调
   * @param {boolean} showRowIndex - 是否显示行号
   * @returns {string} 表体 HTML
   */
  static renderBody(columns, data, rowClass, onRowClick, onCellChange, showRowIndex) {
    return data.map((row, index) => {
      let classNames = '';
      if (typeof rowClass === 'function') {
        classNames = rowClass(row, index);
      } else if (typeof rowClass === 'string') {
        classNames = rowClass;
      }
      
      const rowAttrs = {
        'data-index': index
      };
      
      if (onRowClick) {
        rowAttrs['data-clickable'] = 'true';
        rowAttrs['data-row-index'] = index;
        rowAttrs['style'] = 'cursor:pointer;';
      }
      
      if (classNames) {
        rowAttrs['class'] = classNames;
      }
      
      const attrsStr = this.buildAttributes(rowAttrs);
      
      let html = `<tr ${attrsStr}>`;
      
      if (showRowIndex) {
        html += `<td class="row-index-cell">${index + 1}</td>`;
      }
      
      html += columns.map(col => {
        const cellValue = this.getCellValue(row, col, index);
        const attrs = col.cellAttrs || {};
        const isEditable = col.editable !== false;
        const colKey = col.key;
        
        const cellAttrs = {
          'data-col': colKey,
          'data-row': index
        };
        
        if (isEditable) {
          cellAttrs['data-editable'] = 'true';
          if (col.inputType) {
            cellAttrs['data-input-type'] = col.inputType;
          }
          if (col.inputStep) {
            cellAttrs['data-input-step'] = col.inputStep;
          }
          if (col.inputMin !== undefined) {
            cellAttrs['data-input-min'] = col.inputMin;
          }
          if (col.inputMax !== undefined) {
            cellAttrs['data-input-max'] = col.inputMax;
          }
          if (col.inputPlaceholder) {
            cellAttrs['data-input-placeholder'] = col.inputPlaceholder;
          }
          if (col.inputOptions) {
            cellAttrs['data-input-options'] = JSON.stringify(col.inputOptions);
          }
        }
        
        // 🔥 关键：如果行数据中有预计算的选项，存储在 cell 的 dataset 中
        if (colKey === 'barrel' && row._barrelOptions && row._barrelOptions.length > 0) {
          cellAttrs['data-barrel-options'] = JSON.stringify(row._barrelOptions);
        }
        
        if (colKey === 'muzzle' && row._muzzleOptions && row._muzzleOptions.length > 0) {
          cellAttrs['data-muzzle-options'] = JSON.stringify(row._muzzleOptions);
        }
        
        // 🔥 也支持从列配置的 getOptions 获取选项（备用）
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
            }
          } catch(e) {
            // 忽略 getOptions 错误
          }
        }
        
        const finalAttrs = { ...attrs, ...cellAttrs };
        const finalAttrsStr = this.buildAttributes(finalAttrs);
        
        return `<td ${finalAttrsStr}>${cellValue}</td>`;
      }).join('');
      
      html += '</tr>';
      return html;
    }).join('');
  }

  /**
   * 获取单元格值
   * @param {Object} row - 数据行
   * @param {Object} col - 列配置
   * @param {number} index - 行索引
   * @returns {string} 单元格 HTML
   */
  static getCellValue(row, col, index) {
    if (typeof col.render === 'function') {
      return col.render(row, index);
    }
    
    const value = row[col.key];
    
    if (value === null || value === undefined) {
      return '-';
    }
    
    if (typeof value === 'boolean') {
      return value ? '是' : '否';
    }
    
    return this.escapeHtml(String(value));
  }

  /**
   * 构建属性字符串
   * @param {Object} attrs - 属性对象
   * @returns {string} 属性字符串
   */
  static buildAttributes(attrs) {
    if (!attrs || Object.keys(attrs).length === 0) {
      return '';
    }
    
    return Object.entries(attrs)
      .filter(([_, value]) => value !== undefined && value !== null)
      .map(([key, value]) => {
        if (value === true) return key;
        return `${key}="${this.escapeHtml(String(value))}"`;
      })
      .join(' ');
  }

  /**
   * HTML 转义
   * @param {string} text - 需要转义的文本
   * @returns {string} 转义后的文本
   */
  static escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, function(m) { return map[m]; });
  }

  // ============================================================
  // 2. 事件绑定
  // ============================================================

  /**
   * 绑定表格编辑事件
   * @param {string|HTMLElement} table - 表格元素或选择器
   * @param {Function} onCellChange - 单元格变更回调
   * @param {Object} options - 额外选项
   */
  static bindEditEvents(table, onCellChange, options = {}) {
    const el = typeof table === 'string' ? document.querySelector(table) : table;
    if (!el) {
      console.warn('TableRenderer: 未找到表格元素');
      return;
    }

    if (el._tableRendererBound) {
      return;
    }
    el._tableRendererBound = true;

    el.addEventListener('click', (e) => {
      const cell = e.target.closest('td[data-editable="true"]');
      if (!cell) return;
      
      if (cell.querySelector('input, select')) return;
      
      const colKey = cell.dataset.col;
      const columns = this._getColumnsForTable(el);
      const col = columns.find(c => c.key === colKey);
      
      // 🔥 获取表格ID和行数据，用于显示当前操作位置
      const tableId = el.id || 'unknown';
      const rowIndex = parseInt(cell.dataset.row);
      const rowData = this._getTableData(el)?.[rowIndex] || {};
      const weaponName = rowData.weaponName || rowData.name || '未知武器';
      
      const tabName = tableId === 'weaponTable' ? '武器表格' : 
                      tableId === 'priceTable' ? '价格表格' : 
                      tableId === 'bulletTable' ? '子弹表格' : tableId;
      
      const colLabel = colKey === 'barrel' ? '枪管' : 
                       colKey === 'muzzle' ? '枪口' : colKey;
      
      console.log(`🖱️ [${tabName}] 点击编辑${colLabel}, 行 ${rowIndex}, 武器: ${weaponName}`);
      
      this.enterEditMode(cell, onCellChange, col, options);
    });

    if (options.clickOutsideToSave !== false) {
      const outsideHandler = (e) => {
        const activeEditor = el.querySelector('td.editing');
        if (activeEditor && !activeEditor.contains(e.target)) {
          this.exitEditMode(activeEditor, onCellChange, true);
        }
      };
      el._outsideHandler = outsideHandler;
      document.addEventListener('click', outsideHandler);
    }
  }

  /**
   * 获取表格的列配置
   * @param {HTMLElement} table - 表格元素
   * @returns {Array} 列配置数组
   */
  static _getColumnsForTable(table) {
    const tableId = table.id;
    if (window._tableInstances && window._tableInstances[tableId]) {
      return window._tableInstances[tableId].getColumns();
    }
    return [];
  }

  /**
   * 进入编辑模式
   * @param {HTMLElement} cell - 单元格元素
   * @param {Function} onCellChange - 变更回调
   * @param {Object} col - 列配置
   * @param {Object} options - 选项
   */
  static enterEditMode(cell, onCellChange, col, options = {}) {
    const rowIndex = parseInt(cell.dataset.row);
    const colKey = cell.dataset.col;
    const inputType = cell.dataset.inputType || 'text';
    
    let currentValue = cell.textContent.trim();
    if (currentValue === '-' || currentValue === '') {
      currentValue = '';
    }
    
    cell.dataset.originalValue = currentValue;
    cell.classList.add('editing');
    
    let editorHtml;
    if (inputType === 'select') {
      let optionList = [];
      let optionSource = '';
      
      // 🔥 从 cell dataset 中读取预计算的选项
      if (colKey === 'barrel' && cell.dataset.barrelOptions) {
        try {
          optionList = JSON.parse(cell.dataset.barrelOptions);
          optionSource = 'dataset.barrelOptions';
        } catch (e) {
          optionList = [];
        }
      } else if (colKey === 'muzzle' && cell.dataset.muzzleOptions) {
        try {
          optionList = JSON.parse(cell.dataset.muzzleOptions);
          optionSource = 'dataset.muzzleOptions';
        } catch (e) {
          optionList = [];
        }
      }
      
      // 从 data-input-options 读取（静态选项）
      if ((!optionList || optionList.length === 0)) {
        const optionsData = cell.dataset.inputOptions;
        if (optionsData) {
          try {
            const parsed = JSON.parse(optionsData);
            optionList = Array.isArray(parsed) ? parsed : Object.keys(parsed);
            optionSource = 'dataset.inputOptions';
          } catch (e) {
            optionList = [];
          }
        }
      }
      
      if (!optionList || optionList.length === 0) {
        optionList = ['无'];
        optionSource = 'default';
      }
      
      // 确保当前值在选项列表中
      if (!optionList.includes(currentValue) && currentValue !== '') {
        optionList.push(currentValue);
      }
      
      // 🔥 打印下拉选项列表
      const table = cell.closest('table');
      const tableId = table?.id || 'unknown';
      const tabName = tableId === 'weaponTable' ? '武器表格' : 
                      tableId === 'priceTable' ? '价格表格' : 
                      tableId === 'bulletTable' ? '子弹表格' : tableId;
      
      const rowData = this._getTableData(table)?.[rowIndex] || {};
      const weaponName = rowData.weaponName || rowData.name || '未知武器';
      const colLabel = colKey === 'barrel' ? '枪管' : 
                       colKey === 'muzzle' ? '枪口' : colKey;
      
      console.log(`📋 [${tabName}] ${colLabel}选项 (${optionSource}), 行 ${rowIndex}, 武器: ${weaponName}:`, optionList);
      
      editorHtml = this.createSelectEditorWithOptions(currentValue, optionList);
    } else {
      editorHtml = this.createInputEditor(cell, inputType, currentValue);
    }
    
    cell.innerHTML = editorHtml;
    
    const input = cell.querySelector('input, select');
    if (input) {
      input.focus();
      if (input.select && inputType !== 'select') {
        input.select();
      }
      
      input.addEventListener('blur', () => {
        this.exitEditMode(cell, onCellChange, true);
      });
      
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.exitEditMode(cell, onCellChange, true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.exitEditMode(cell, onCellChange, false);
        }
      });
      
      if (inputType === 'select') {
        input.addEventListener('change', () => {
          this.exitEditMode(cell, onCellChange, true);
        });
      }
    }
  }

  /**
   * 创建带选项的 select 编辑器
   * @param {string} value - 当前值
   * @param {Array} options - 选项列表
   * @returns {string} 编辑器 HTML
   */
  static createSelectEditorWithOptions(value, options) {
    let html = '<select class="table-editor-select">';
    if (!options || options.length === 0) {
      html += `<option value="">无选项</option>`;
    } else {
      options.forEach(opt => {
        const selected = opt === value ? ' selected' : '';
        html += `<option value="${this.escapeHtml(opt)}"${selected}>${this.escapeHtml(opt)}</option>`;
      });
    }
    html += '</select>';
    return html;
  }

  /**
   * 创建输入编辑器
   * @param {HTMLElement} cell - 单元格
   * @param {string} type - 输入类型
   * @param {string} value - 当前值
   * @returns {string} 编辑器 HTML
   */
  static createInputEditor(cell, type, value) {
    const step = cell.dataset.inputStep || '';
    const min = cell.dataset.inputMin || '';
    const max = cell.dataset.inputMax || '';
    const placeholder = cell.dataset.inputPlaceholder || '';
    
    let attrs = `type="${type}" value="${this.escapeHtml(value)}"`;
    if (step) attrs += ` step="${step}"`;
    if (min) attrs += ` min="${min}"`;
    if (max) attrs += ` max="${max}"`;
    if (placeholder) attrs += ` placeholder="${this.escapeHtml(placeholder)}"`;
    
    return `<input ${attrs} class="table-editor-input" />`;
  }

  /**
   * 退出编辑模式
   * @param {HTMLElement} cell - 单元格
   * @param {Function} onCellChange - 变更回调
   * @param {boolean} save - 是否保存
   */
  static exitEditMode(cell, onCellChange, save) {
    if (!cell.classList.contains('editing')) return;
    
    const rowIndex = parseInt(cell.dataset.row);
    const colKey = cell.dataset.col;
    const originalValue = cell.dataset.originalValue || '';
    let newValue = '';
    
    const input = cell.querySelector('input, select');
    if (input) {
      newValue = input.value;
    }
    
    cell.classList.remove('editing');
    
    // 🔥 获取表格信息用于日志
    const table = cell.closest('table');
    const tableId = table?.id || 'unknown';
    const tabName = tableId === 'weaponTable' ? '武器表格' : 
                    tableId === 'priceTable' ? '价格表格' : 
                    tableId === 'bulletTable' ? '子弹表格' : tableId;
    
    // 🔥 修复：使用 table.getData() 获取原始数据，而不是从 DOM 重新提取
    let rowData = {};
    if (tableId && window._tableInstances && window._tableInstances[tableId]) {
      const instance = window._tableInstances[tableId];
      const allData = instance.getData();
      if (allData && allData[rowIndex]) {
        rowData = allData[rowIndex];
      }
    }
    
    // 如果无法从实例获取，尝试从 DOM 提取（备用方案）
    if (!rowData || Object.keys(rowData).length === 0) {
      const allData = this._getTableData(table);
      rowData = allData?.[rowIndex] || {};
    }
    
    const weaponName = rowData.weaponName || rowData.name || '未知武器';
    const colLabel = colKey === 'barrel' ? '枪管' : 
                     colKey === 'muzzle' ? '枪口' : colKey;
    
    if (save && newValue !== originalValue) {
      console.log(`✅ [${tabName}] 用户选择: ${newValue}, 行 ${rowIndex}, 武器: ${weaponName}, ${colLabel}`);
      console.log(`  - rowData:`, { weaponName, _weaponId: rowData._weaponId, _configId: rowData._configId });
      
      if (typeof onCellChange === 'function') {
        onCellChange(rowIndex, colKey, newValue, rowData);
      }
    } else if (!save) {
      console.log(`↩️ [${tabName}] 取消编辑, 行 ${rowIndex}, 武器: ${weaponName}, ${colLabel}`);
    }
    
    cell.textContent = save ? newValue : originalValue;
    if (cell.textContent === '' || cell.textContent === null) {
      cell.textContent = '-';
    }
    
    // 🔥 打印当前显示的值
    if (save && newValue !== originalValue) {
      console.log(`📊 [${tabName}] 当前显示: ${cell.textContent}, 行 ${rowIndex}, 武器: ${weaponName}`);
    }
  }

  /**
   * 获取表格数据（从 DOM 中提取）
   * @param {HTMLElement} table - 表格元素
   * @returns {Array} 数据数组
   */
  static _getTableData(table) {
    if (!table) return [];
    
    const rows = table.querySelectorAll('tbody tr');
    const data = [];
    
    rows.forEach(row => {
      const rowData = {};
      const cells = row.querySelectorAll('td');
      
      // 🔥 从 tr 中读取 data-index
      const rowIndex = parseInt(row.dataset.index);
      if (!isNaN(rowIndex)) {
        rowData._rowIndex = rowIndex;
      }
      
      cells.forEach((cell, index) => {
        const colKey = cell.dataset.col || `col_${index}`;
        let value = cell.textContent.trim();
        
        // 如果是 select，获取选中的值
        const select = cell.querySelector('select');
        if (select) {
          value = select.value;
        }
        
        rowData[colKey] = value === '-' || value === '' ? null : value;
      });
      
      // 🔥 尝试从单元格的 dataset 中恢复 _barrelOptions 和 _muzzleOptions
      const barrelCell = row.querySelector('td[data-col="barrel"]');
      if (barrelCell && barrelCell.dataset.barrelOptions) {
        try {
          rowData._barrelOptions = JSON.parse(barrelCell.dataset.barrelOptions);
        } catch (e) {
          rowData._barrelOptions = ['无'];
        }
      }
      
      const muzzleCell = row.querySelector('td[data-col="muzzle"]');
      if (muzzleCell && muzzleCell.dataset.muzzleOptions) {
        try {
          rowData._muzzleOptions = JSON.parse(muzzleCell.dataset.muzzleOptions);
        } catch (e) {
          rowData._muzzleOptions = ['无'];
        }
      }
      
      data.push(rowData);
    });
    
    return data;
  }

  // ============================================================
  // 3. 更新方法
  // ============================================================

  /**
   * 更新表格数据（只更新 tbody，不重新创建整个表格）
   * @param {string} tableId - 表格 ID
   * @param {Array} columns - 列配置数组
   * @param {Array} data - 数据数组
   * @param {Object} options - 额外选项
   * @returns {boolean} 是否更新成功
   */
  static updateTable(tableId, columns, data, options = {}) {
    const table = document.getElementById(tableId);
    if (!table) {
      console.warn(`TableRenderer: 未找到表格 #${tableId}`);
      return false;
    }
    
    const tbody = table.querySelector('tbody');
    if (!tbody) {
      console.warn(`TableRenderer: 表格 #${tableId} 没有 tbody`);
      return false;
    }
    
    const {
      rowClass = '',
      onRowClick = null,
      onCellChange = null,
      showRowIndex = false
    } = options;
    
    if (!data || data.length === 0) {
      const colCount = columns.length + (showRowIndex ? 1 : 0);
      tbody.innerHTML = `
        <tr><td colspan="${colCount}" class="empty-cell">暂无数据</td></tr>
      `;
      return true;
    }
    
    tbody.innerHTML = this.renderBody(
      columns, 
      data, 
      rowClass, 
      onRowClick, 
      onCellChange, 
      showRowIndex
    );
    
    // 🔥 更新全局实例中的数据
    if (window._tableInstances && window._tableInstances[tableId]) {
      window._tableInstances[tableId]._data = data;
    }
    
    return true;
  }

  /**
   * 渲染表格到指定容器
   * @param {string|HTMLElement} container - 容器元素或选择器
   * @param {Object} config - 表格配置
   * @returns {Object} 表格实例
   */
  static renderTo(container, config) {
    const instance = this.render(config);
    const target = typeof container === 'string' 
      ? document.querySelector(container) 
      : container;
    
    if (!target) {
      console.warn(`TableRenderer: 容器 ${container} 不存在`);
      return instance;
    }
    
    target.innerHTML = instance.getHTML();
    return instance;
  }

  /**
   * 从表格获取数据
   * @param {string|HTMLElement} table - 表格元素或选择器
   * @param {Array} columns - 列配置
   * @returns {Array} 数据数组
   */
  static getTableData(table, columns) {
    const el = typeof table === 'string' ? document.querySelector(table) : table;
    if (!el) return [];
    
    const rows = el.querySelectorAll('tbody tr');
    const data = [];
    
    rows.forEach((row) => {
      const rowData = {};
      const cells = row.querySelectorAll('td');
      let colIndex = 0;
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (cell.classList.contains('row-index-cell')) continue;
        
        const col = columns[colIndex];
        if (col) {
          const value = cell.textContent.trim();
          rowData[col.key] = value === '-' ? null : value;
          colIndex++;
        }
      }
      data.push(rowData);
    });
    
    return data;
  }
}

// 导出默认
export default TableRenderer;