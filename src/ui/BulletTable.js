/**
 * 子弹表格组件
 * 
 * 显示子弹数据表格，支持编辑和行操作（新增/删除）
 * 
 * 数据来源：DataManager.getBullets()
 * 
 * 列：
 * - 子弹口径（只读，新增行为输入框）
 * - 等级（只读，新增行为下拉选择，支持特殊子弹如 RIP, M61, BT+P, Double, SUPER, AP, CT）
 * - 基础伤害比例（数字编辑，新增行为输入框）
 * - 护甲伤害衰减 1-6级（文本编辑，新增行为输入框）
 * - 护甲穿透水平 1-6级（文本编辑，新增行为输入框）
 * - 价格（数字编辑，新增行为输入框）
 * - 操作（新增行 / 删除行）
 * - 新增行显示确认/取消按钮，显示在第一行
 */
import TableRenderer from './TableRenderer.js';

export class BulletTable {
  /**
   * 获取子弹表格列配置
   */
  static getColumns(options = {}) {
    const {
      onCellChange = null,
      onAddRow = null,
      onDeleteRow = null,
      caliberOptions = [],
      levelOptions = []
    } = options;

    return [
      // ==================== 子弹口径 ====================
      {
        key: 'caliber',
        label: '子弹口径',
        editable: false,
        headerAttrs: { style: 'min-width:100px;' },
        render: (row) => {
          if (row._isNewRow) {
            return `<input type="text" class="bullet-new-caliber" placeholder="如: 5.56x45mm" value="${TableRenderer.escapeHtml(row.caliber || '')}" />`;
          }
          return TableRenderer.escapeHtml(row.caliber || '-');
        }
      },

      // ==================== 等级 ====================
      {
        key: 'level',
        label: '等级',
        editable: false,
        headerAttrs: { style: 'min-width:60px;' },
        render: (row) => {
          if (row._isNewRow) {
            const levelOptions = ['1', '2', '3', '4', '5', 'RIP', 'M61', 'BT+P', 'Double', 'SUPER', 'AP', 'CT'];
            let html = `<select class="bullet-new-level">`;
            levelOptions.forEach(opt => {
              const selected = opt === String(row.level) ? ' selected' : '';
              html += `<option value="${opt}"${selected}>${opt}</option>`;
            });
            html += `</select>`;
            return html;
          }
          
          const level = row.level;
          if (level === undefined || level === null) return '-';
          
          const specialLevels = ['RIP', 'M61', 'BT+P', 'Double', 'SUPER', 'AP', 'CT'];
          if (typeof level === 'string' && specialLevels.includes(level)) {
            return `<span class="special-level-badge" data-level="${level}">${TableRenderer.escapeHtml(level)}</span>`;
          }
          
          return TableRenderer.escapeHtml(String(level));
        }
      },

      // ==================== 基础伤害比例 ====================
      {
        key: 'base',
        label: '基础伤害比例',
        editable: true,
        inputType: 'number',
        inputStep: 0.01,
        inputMin: 0,
        headerAttrs: { style: 'min-width:80px;' },
        render: (row) => {
          if (row._isNewRow) {
            return `<input type="number" class="bullet-new-base" value="${row.base ?? 1.0}" step="0.01" min="0" />`;
          }
          const val = row.base;
          if (val === undefined || val === null) return '-';
          return val.toFixed(2);
        }
      },

      // ==================== 护甲伤害衰减 1-6级 ====================
      {
        key: 'armorMult',
        label: '护甲伤害衰减 (1-6级)',
        editable: true,
        inputType: 'text',
        inputPlaceholder: '1.0,1.0,1.0,1.0,1.0,0.6',
        headerAttrs: { style: 'min-width:160px;' },
        render: (row) => {
          if (row._isNewRow) {
            const values = row._armorMultValues || [1.0, 1.0, 1.0, 1.0, 1.0, 0.6];
            return `<input type="text" class="bullet-new-armorMult" value="${values.join(',')}" placeholder="1.0,1.0,1.0,1.0,1.0,0.6" />`;
          }
          const armorData = row._armorData;
          if (!armorData) return '-';
          const values = [];
          for (let i = 1; i <= 6; i++) {
            const val = armorData[i]?.armorMult;
            values.push(val !== undefined && val !== null ? val.toFixed(2) : '1.0');
          }
          return values.join(',');
        }
      },

      // ==================== 护甲穿透水平 1-6级 ====================
      {
        key: 'pen',
        label: '护甲穿透水平 (1-6级)',
        editable: true,
        inputType: 'text',
        inputPlaceholder: '1.0,1.0,0.75,0.5,0,0',
        headerAttrs: { style: 'min-width:160px;' },
        render: (row) => {
          if (row._isNewRow) {
            const values = row._penValues || [1.0, 1.0, 0.75, 0.5, 0, 0];
            return `<input type="text" class="bullet-new-pen" value="${values.join(',')}" placeholder="1.0,1.0,0.75,0.5,0,0" />`;
          }
          const armorData = row._armorData;
          if (!armorData) return '-';
          const values = [];
          for (let i = 1; i <= 6; i++) {
            const val = armorData[i]?.pen;
            values.push(val !== undefined && val !== null ? val.toFixed(2) : '0');
          }
          return values.join(',');
        }
      },

      // ==================== 价格 ====================
      {
        key: 'price',
        label: '价格',
        editable: true,
        inputType: 'number',
        inputStep: 1,
        inputMin: 0,
        headerAttrs: { style: 'min-width:80px;' },
        render: (row) => {
          if (row._isNewRow) {
            return `<input type="number" class="bullet-new-price" value="${row.price ?? 0}" step="1" min="0" />`;
          }
          const price = row.price;
          if (price === undefined || price === null || price === 0) return '-';
          return `¥${Number(price).toLocaleString()}`;
        }
      },

      // ==================== 操作（新增/删除） ====================
      {
        key: 'actions',
        label: '操作',
        editable: false,
        headerAttrs: { style: 'min-width:60px;' },
        render: (row) => {
          if (row._isNewRow) {
            return `
              <button class="confirm-add-bullet-btn" data-row="${row._rowIndex || 0}" title="确认添加">✅ 确认</button>
              <button class="cancel-add-bullet-btn" data-row="${row._rowIndex || 0}" title="取消">❌ 取消</button>
            `;
          }
          return `<button class="delete-bullet-btn" data-row="${row._rowIndex || 0}" data-bullet-id="${row._bulletId || ''}" title="删除行">🗑️</button>`;
        }
      }
    ];
  }

  /**
   * 渲染子弹表格
   */
  static render(config) {
    const {
      data,
      onCellChange = null,
      onAddRow = null,
      onDeleteRow = null,
      caliberOptions = [],
      levelOptions = ['1', '2', '3', '4', '5', 'RIP', 'M61', 'BT+P', 'Double', 'SUPER', 'AP', 'CT'],
      emptyText = '暂无子弹数据'
    } = config;

    const indexedData = data.map((row, index) => ({
      ...row,
      _rowIndex: index,
      _isNewRow: row._isNewRow || false
    }));

    const columns = this.getColumns({
      onCellChange,
      onAddRow,
      onDeleteRow,
      caliberOptions,
      levelOptions
    });

    const tableHtml = this.renderFullTable(columns, indexedData, emptyText);

    const table = TableRenderer.createInstance(
      {
        id: 'bulletTable',
        columns,
        data: indexedData,
        rowClass: (row) => row._isNewRow ? 'new-bullet-row' : '',
        onCellChange: (rowIndex, key, value, row) => {
          if (key === 'base' || key === 'price') {
            const numValue = parseFloat(value);
            if (!isNaN(numValue) && numValue >= 0) {
              if (onCellChange) onCellChange(rowIndex, key, numValue, row);
            }
            return;
          }
          if (key === 'armorMult') {
            const values = value.split(',').map(v => parseFloat(v.trim()));
            if (values.length === 6 && values.every(v => !isNaN(v) && v >= 0)) {
              if (onCellChange) onCellChange(rowIndex, key, values, row);
            }
            return;
          }
          if (key === 'pen') {
            const values = value.split(',').map(v => parseFloat(v.trim()));
            if (values.length === 6 && values.every(v => !isNaN(v) && v >= 0 && v <= 1)) {
              if (onCellChange) onCellChange(rowIndex, key, values, row);
            }
            return;
          }
          if (onCellChange) onCellChange(rowIndex, key, value, row);
        }
      },
      tableHtml
    );

    // ⭐ 使用全局事件委托
    this.bindGlobalEvents(table, {
      onCellChange,
      onAddRow,
      onDeleteRow,
      caliberOptions,
      levelOptions
    });

    return table;
  }

  /**
   * 渲染完整表格（包含控制栏）
   */
  static renderFullTable(columns, data, emptyText) {
    const totalCount = data.length;
    
    let html = `
      <div class="bullet-table-controls">
        <button class="add-bullet-btn" data-table="bulletTable">➕ 新增子弹</button>
        <span class="control-hint">（点击新增后在表格顶部填写数据，然后点击"✅ 确认"保存）</span>
        <span class="bullet-count">共 ${totalCount} 种子弹</span>
      </div>
      <div class="table-scroll">
        <table id="bulletTable" data-table-id="bulletTable">
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
      let html = `<tr data-index="${index}" class="${isNewRow ? 'new-bullet-row' : ''}">`;
      
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
      onCellChange,
      onAddRow,
      onDeleteRow,
      caliberOptions = [],
      levelOptions = []
    } = handlers;

    // 防止重复绑定
    if (window._bulletTableGlobalBound) {
      return;
    }
    window._bulletTableGlobalBound = true;

    // ============================================================
    // 新增子弹按钮
    // ============================================================
    document.addEventListener('click', function(e) {
      const tableEl = document.getElementById('bulletTable');
      if (!tableEl) return;
      if (!tableEl.contains(e.target) && !e.target.closest('#tab-bullet')) return;

      const addBtn = e.target.closest('.add-bullet-btn');
      if (addBtn) {
        e.stopPropagation();
        e.preventDefault();
        
        const existingNewRow = tableEl.querySelector('.new-bullet-row');
        if (existingNewRow) {
          alert('⚠️ 已有新增行，请先完成或取消当前新增操作');
          return;
        }
        
        if (typeof onAddRow === 'function') {
          // 创建一个空的新增行数据
          const newRow = BulletTable.createNewRow();
          const tableData = table.getData() || [];
          // ⭐ 插入到第一行
          tableData.unshift(newRow);
          table.setData(tableData);
          
          // 刷新表格
          const container = document.getElementById('tab-bullet');
          if (container) {
            const columns = BulletTable.getColumns({ onCellChange, onAddRow, onDeleteRow, caliberOptions, levelOptions });
            const indexedData = tableData.map((row, idx) => ({ ...row, _rowIndex: idx }));
            BulletTable.update(container, indexedData, { onCellChange, onAddRow, onDeleteRow, caliberOptions, levelOptions });
          }
          
          // 滚动到新增行
          setTimeout(() => {
            const newRowEl = tableEl.querySelector('.new-bullet-row');
            if (newRowEl) {
              newRowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              const nameInput = newRowEl.querySelector('.bullet-new-caliber');
              if (nameInput) nameInput.focus();
            }
          }, 100);
        }
        return;
      }

      // ============================================================
      // 确认新增按钮
      // ============================================================
      const confirmBtn = e.target.closest('.confirm-add-bullet-btn');
      if (confirmBtn) {
        e.stopPropagation();
        e.preventDefault();
        const row = confirmBtn.closest('tr');
        const rowIndex = parseInt(row?.dataset.index);
        if (isNaN(rowIndex)) return;
        
        // 收集新增行数据
        const caliber = row.querySelector('.bullet-new-caliber')?.value?.trim() || '';
        const level = row.querySelector('.bullet-new-level')?.value || '1';
        const base = parseFloat(row.querySelector('.bullet-new-base')?.value) || 1.0;
        const armorMultStr = row.querySelector('.bullet-new-armorMult')?.value || '1.0,1.0,1.0,1.0,1.0,0.6';
        const penStr = row.querySelector('.bullet-new-pen')?.value || '1.0,1.0,0.75,0.5,0,0';
        const price = parseFloat(row.querySelector('.bullet-new-price')?.value) || 0;
        
        if (!caliber) {
          alert('⚠️ 请输入子弹口径');
          return;
        }
        
        // 解析护甲数据
        const armorMultValues = armorMultStr.split(',').map(v => parseFloat(v.trim()) || 1.0);
        const penValues = penStr.split(',').map(v => parseFloat(v.trim()) || 0);
        
        // 确保有6个值
        while (armorMultValues.length < 6) armorMultValues.push(1.0);
        while (penValues.length < 6) penValues.push(0);
        
        const armorData = {};
        for (let i = 1; i <= 6; i++) {
          armorData[i] = {
            armorMult: armorMultValues[i - 1] || 1.0,
            pen: penValues[i - 1] || 0
          };
        }
        
        const bulletId = `${caliber}_${level}`;
        
        const rowData = {
          id: bulletId,
          caliber: caliber,
          level: level,
          base: base,
          armorMult: armorMultValues[0] || 1.0,
          pen: penValues[0] || 0.5,
          price: price,
          armorData: armorData,
          _isNewRow: false
        };
        
        if (typeof onAddRow === 'function') {
          onAddRow(rowIndex, rowData);
        }
        return;
      }

      // ============================================================
      // 取消新增按钮
      // ============================================================
      const cancelBtn = e.target.closest('.cancel-add-bullet-btn');
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

      // ============================================================
      // 删除已有子弹
      // ============================================================
      const deleteBtn = e.target.closest('.delete-bullet-btn');
      if (deleteBtn) {
        e.stopPropagation();
        e.preventDefault();
        const row = deleteBtn.closest('tr');
        const rowIndex = parseInt(row?.dataset.index);
        const bulletId = deleteBtn.dataset.bulletId;
        if (!isNaN(rowIndex) && bulletId && typeof onDeleteRow === 'function') {
          const bulletName = row?.querySelector('td:first-child')?.textContent || '该';
          if (confirm(`确定要删除子弹 "${bulletName}" 吗？`)) {
            onDeleteRow(rowIndex, bulletId, false);
          }
        }
        return;
      }
    });

    // ============================================================
    // 单元格编辑变更（全局委托）
    // ============================================================
    document.addEventListener('change', function(e) {
      const tableEl = document.getElementById('bulletTable');
      if (!tableEl) return;
      if (!tableEl.contains(e.target)) return;

      const input = e.target.closest('input, select');
      if (!input) return;
      
      const td = input.closest('td');
      if (!td) return;
      
      const colKey = td.dataset.col;
      if (!colKey) return;
      
      const row = td.closest('tr');
      if (!row) return;
      
      const rowIndex = parseInt(row.dataset.index);
      if (isNaN(rowIndex)) return;
      
      // 跳过新增行的变更（由确认按钮统一处理）
      if (row.classList.contains('new-bullet-row')) {
        return;
      }
      
      const value = input.value;
      const tableData = table.getData();
      const rowData = tableData?.[rowIndex];
      
      if (!rowData) return;
      
      // 处理护甲伤害衰减
      if (colKey === 'armorMult') {
        const values = value.split(',').map(v => parseFloat(v.trim()));
        if (values.length === 6 && values.every(v => !isNaN(v) && v >= 0)) {
          if (onCellChange) onCellChange(rowIndex, colKey, values, rowData);
        } else {
          console.warn('护甲伤害衰减格式错误，需要6个数值，用逗号分隔');
        }
        return;
      }
      
      // 处理护甲穿透水平
      if (colKey === 'pen') {
        const values = value.split(',').map(v => parseFloat(v.trim()));
        if (values.length === 6 && values.every(v => !isNaN(v) && v >= 0 && v <= 1)) {
          if (onCellChange) onCellChange(rowIndex, colKey, values, rowData);
        } else {
          console.warn('护甲穿透水平格式错误，需要6个数值，用逗号分隔');
        }
        return;
      }
      
      // 处理数字字段
      if (colKey === 'base' || colKey === 'price') {
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue >= 0) {
          if (onCellChange) onCellChange(rowIndex, colKey, numValue, rowData);
        }
        return;
      }
      
      // 其他字段
      if (onCellChange) {
        onCellChange(rowIndex, colKey, value, rowData);
      }
    });

    console.log('✅ BulletTable: 全局事件委托已绑定');
  }

  /**
   * 更新子弹表格数据
   */
  static update(container, data, config = {}) {
    const target = typeof container === 'string' 
      ? document.querySelector(container) 
      : container;
    
    if (!target) {
      console.warn('BulletTable: 容器不存在');
      return;
    }

    const {
      onCellChange,
      onAddRow,
      onDeleteRow,
      caliberOptions = [],
      levelOptions = ['1', '2', '3', '4', '5', 'RIP', 'M61', 'BT+P', 'Double', 'SUPER', 'AP', 'CT']
    } = config;

    const indexedData = data.map((row, index) => ({
      ...row,
      _rowIndex: index,
      _isNewRow: row._isNewRow || false
    }));

    const columns = this.getColumns({
      onCellChange,
      onAddRow,
      onDeleteRow,
      caliberOptions,
      levelOptions
    });

    const tableEl = target.querySelector('#bulletTable');
    
    if (tableEl) {
      const tbody = tableEl.querySelector('tbody');
      if (tbody) {
        tbody.innerHTML = this.renderBody(columns, indexedData, '暂无子弹数据');
      }
      const countEl = target.querySelector('.bullet-count');
      if (countEl) {
        countEl.textContent = `共 ${indexedData.length} 种子弹`;
      }
    } else {
      target.innerHTML = this.renderFullTable(columns, indexedData, '暂无子弹数据');
    }
    
    if (window._tableInstances && window._tableInstances.bulletTable) {
      window._tableInstances.bulletTable._data = indexedData;
      if (typeof window._tableInstances.bulletTable.setData === 'function') {
        window._tableInstances.bulletTable.setData(indexedData);
      }
    }
    
    return indexedData;
  }

  /**
   * 构建子弹行数据
   */
  static buildRowData(bullet, extra = {}) {
    const armorData = bullet.armorData || {};
    const armorMultValues = [];
    const penValues = [];
    
    for (let i = 1; i <= 6; i++) {
      const levelData = armorData[i] || { armorMult: 1.0, pen: 0 };
      armorMultValues.push(levelData.armorMult !== undefined ? levelData.armorMult : 1.0);
      penValues.push(levelData.pen !== undefined ? levelData.pen : 0);
    }
    
    return {
      caliber: bullet.caliber || '-',
      level: bullet.level ?? '-',
      base: bullet.base ?? 1.0,
      price: bullet.price ?? 0,
      
      _armorData: armorData,
      _armorMultValues: armorMultValues,
      _penValues: penValues,
      
      _bulletId: bullet.id || '',
      _isNewRow: false,
      
      ...extra
    };
  }

  /**
   * 创建新增行数据
   */
  static createNewRow(defaults = {}) {
    const defaultArmorData = {};
    for (let i = 1; i <= 6; i++) {
      defaultArmorData[i] = {
        armorMult: defaults.armorMult ?? 1.0,
        pen: defaults.pen ?? 0.5
      };
    }
    
    return {
      caliber: defaults.caliber || '',
      level: defaults.level || '1',
      base: defaults.base ?? 1.0,
      price: defaults.price ?? 0,
      _armorData: defaultArmorData,
      _armorMultValues: [1.0, 1.0, 1.0, 1.0, 1.0, 0.6],
      _penValues: [1.0, 1.0, 0.75, 0.5, 0, 0],
      _bulletId: `new_${Date.now()}`,
      _isNewRow: true
    };
  }
}

export default BulletTable;