/**
 * 子弹表格组件
 * 
 * 显示子弹数据表格，支持编辑和行操作（新增/删除）
 * 
 * 数据来源：DataManager.getBullets()
 * 
 * 列：
 * - 子弹口径（只读）
 * - 等级（只读，支持特殊子弹如 RIP, M61, BT+P, Double, SUPER）
 * - 基础伤害比例（数字编辑）
 * - 护甲伤害衰减 1-6级（文本编辑，逗号分隔6个值）
 * - 护甲穿透水平 1-6级（文本编辑，逗号分隔6个值）
 * - 价格（数字编辑）
 * - 操作（新增行 / 删除行）
 */
import { TableRenderer } from './TableRenderer.js';

export class BulletTable {
  /**
   * 获取子弹表格列配置
   * @param {Object} options - 配置选项
   * @param {Function} options.onCellChange - 单元格变更回调
   * @param {Function} options.onAddRow - 新增行回调
   * @param {Function} options.onDeleteRow - 删除行回调
   * @param {Array} options.caliberOptions - 口径选项列表（用于新增行）
   * @param {Array} options.levelOptions - 等级选项列表（用于新增行）
   * @returns {Array} 列配置数组
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
      // ==================== 子弹口径（只读） ====================
      {
        key: 'caliber',
        label: '子弹口径',
        editable: false,
        headerAttrs: { style: 'min-width:100px;' },
        render: (row) => {
          return TableRenderer.escapeHtml(row.caliber || '-');
        }
      },

      // ==================== 等级（只读，支持特殊子弹） ====================
      {
        key: 'level',
        label: '等级',
        editable: false,
        headerAttrs: { style: 'min-width:60px;' },
        render: (row) => {
          const level = row.level;
          if (level === undefined || level === null) return '-';
          
          // 特殊子弹显示为带样式的标签
          const specialLevels = ['RIP', 'M61', 'BT+P', 'Double', 'SUPER', 'AP', 'CT'];
          if (typeof level === 'string' && specialLevels.includes(level)) {
            return `<span class="special-level-badge" data-level="${level}">${TableRenderer.escapeHtml(level)}</span>`;
          }
          
          return TableRenderer.escapeHtml(String(level));
        }
      },

      // ==================== 基础伤害比例（数字编辑） ====================
      {
        key: 'base',
        label: '基础伤害比例',
        editable: true,
        inputType: 'number',
        inputStep: 0.01,
        inputMin: 0,
        headerAttrs: { style: 'min-width:80px;' },
        render: (row) => {
          const val = row.base;
          if (val === undefined || val === null) return '-';
          return val.toFixed(2);
        }
      },

      // ==================== 护甲伤害衰减 1-6级（文本编辑） ====================
      {
        key: 'armorMult',
        label: '护甲伤害衰减 (1-6级)',
        editable: true,
        inputType: 'text',
        inputPlaceholder: '1.0,1.0,1.0,1.0,1.0,0.6',
        headerAttrs: { style: 'min-width:160px;' },
        render: (row) => {
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

      // ==================== 护甲穿透水平 1-6级（文本编辑） ====================
      {
        key: 'pen',
        label: '护甲穿透水平 (1-6级)',
        editable: true,
        inputType: 'text',
        inputPlaceholder: '1.0,1.0,0.75,0.5,0,0',
        headerAttrs: { style: 'min-width:160px;' },
        render: (row) => {
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

      // ==================== 价格（数字编辑） ====================
      {
        key: 'price',
        label: '价格',
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
            // 新增行：显示确认和取消按钮
            html += `<button class="confirm-add-bullet-btn" data-row="${row._rowIndex || 0}" title="确认添加">✅</button>`;
            html += `<button class="cancel-add-bullet-btn" data-row="${row._rowIndex || 0}" title="取消">❌</button>`;
          } else {
            // 现有行：显示删除按钮
            html += `<button class="delete-bullet-btn" data-row="${row._rowIndex || 0}" data-bullet-id="${row._bulletId || ''}" title="删除行">🗑️</button>`;
          }
          
          return html;
        }
      }
    ];
  }

  /**
   * 渲染子弹表格
   * @param {Object} config - 表格配置
   * @param {Array} config.data - 子弹数据数组
   * @param {Function} config.onCellChange - 单元格变更回调 (rowIndex, key, value, row)
   * @param {Function} config.onAddRow - 新增行回调 (rowIndex, rowData)
   * @param {Function} config.onDeleteRow - 删除行回调 (rowIndex, bulletId)
   * @param {Array} config.caliberOptions - 口径选项列表
   * @param {Array} config.levelOptions - 等级选项列表
   * @param {string} config.emptyText - 空数据提示
   * @returns {Object} 表格实例
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

    // 为数据添加 _rowIndex
    const indexedData = data.map((row, index) => ({
      ...row,
      _rowIndex: index,
      _isNewRow: row._isNewRow || false
    }));

    // 构建列配置
    const columns = this.getColumns({
      onCellChange,
      onAddRow,
      onDeleteRow,
      caliberOptions,
      levelOptions
    });

    // 渲染表格
    const table = TableRenderer.render({
      id: 'bulletTable',
      columns: columns,
      data: indexedData,
      emptyText: emptyText,
      showRowIndex: false,
      rowClass: (row) => {
        return row._isNewRow ? 'new-bullet-row' : '';
      },
      onCellChange: (rowIndex, key, value, row) => {
        // 处理数字字段的转换
        if (key === 'base' || key === 'price') {
          const numValue = parseFloat(value);
          if (!isNaN(numValue) && numValue >= 0) {
            if (onCellChange) {
              onCellChange(rowIndex, key, numValue, row);
            }
          }
          return;
        }
        
        // 处理护甲伤害衰减 1-6级（逗号分隔）
        if (key === 'armorMult') {
          const values = value.split(',').map(v => parseFloat(v.trim()));
          if (values.length === 6 && values.every(v => !isNaN(v) && v >= 0)) {
            if (onCellChange) {
              onCellChange(rowIndex, key, values, row);
            }
          } else {
            console.warn('护甲伤害衰减格式错误，需要6个数值，用逗号分隔');
          }
          return;
        }
        
        // 处理护甲穿透水平 1-6级（逗号分隔）
        if (key === 'pen') {
          const values = value.split(',').map(v => parseFloat(v.trim()));
          if (values.length === 6 && values.every(v => !isNaN(v) && v >= 0 && v <= 1)) {
            if (onCellChange) {
              onCellChange(rowIndex, key, values, row);
            }
          } else {
            console.warn('护甲穿透水平格式错误，需要6个数值，用逗号分隔');
          }
          return;
        }
        
        // 其他字段
        if (onCellChange) {
          onCellChange(rowIndex, key, value, row);
        }
      }
    });

    // 绑定自定义事件
    this.bindCustomEvents(table, {
      onCellChange,
      onAddRow,
      onDeleteRow,
      caliberOptions,
      levelOptions
    });

    return table;
  }

  /**
   * 绑定自定义事件
   * @param {Object} table - 表格实例
   * @param {Object} handlers - 事件处理器
   */
  static bindCustomEvents(table, handlers) {
    const {
      onCellChange,
      onAddRow,
      onDeleteRow,
      caliberOptions,
      levelOptions
    } = handlers;

    const el = table.getElement();
    if (!el) return;

    // ===== 操作按钮 =====
    el.addEventListener('click', (e) => {
      // 确认新增
      const confirmBtn = e.target.closest('.confirm-add-bullet-btn');
      if (confirmBtn) {
        const row = confirmBtn.closest('tr');
        const rowIndex = parseInt(row?.dataset.index);
        if (!isNaN(rowIndex) && onAddRow) {
          const rowData = table.getData()[rowIndex];
          onAddRow(rowIndex, rowData);
        }
        return;
      }
      
      // 取消新增
      const cancelBtn = e.target.closest('.cancel-add-bullet-btn');
      if (cancelBtn) {
        const row = cancelBtn.closest('tr');
        const rowIndex = parseInt(row?.dataset.index);
        if (!isNaN(rowIndex) && onDeleteRow) {
          // 取消新增 = 删除新增行
          onDeleteRow(rowIndex, null, true);
        }
        return;
      }
      
      // 删除行
      const deleteBtn = e.target.closest('.delete-bullet-btn');
      if (deleteBtn) {
        const row = deleteBtn.closest('tr');
        const rowIndex = parseInt(row?.dataset.index);
        const bulletId = deleteBtn.dataset.bulletId;
        if (!isNaN(rowIndex) && onDeleteRow) {
          const bulletName = row?.querySelector('td:first-child')?.textContent || '该';
          if (confirm(`确定要删除子弹 "${bulletName}" 吗？`)) {
            onDeleteRow(rowIndex, bulletId, false);
          }
        }
        return;
      }
    });
  }

  /**
   * 更新子弹表格数据
   * @param {string|HTMLElement} container - 容器元素或选择器
   * @param {Array} data - 新的子弹数据
   * @param {Object} config - 额外配置
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

    TableRenderer.updateTable('bulletTable', columns, indexedData, {
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
    });
  }

  /**
   * 构建子弹行数据
   * @param {Object} bullet - 原始子弹数据
   * @param {Object} extra - 额外字段
   * @returns {Object} 完整的行数据
   */
  static buildRowData(bullet, extra = {}) {
    // 从 armorData 中提取 1-6 级的 armorMult 和 pen
    const armorData = bullet.armorData || {};
    const armorMultValues = [];
    const penValues = [];
    
    for (let i = 1; i <= 6; i++) {
      const levelData = armorData[i] || { armorMult: 1.0, pen: 0 };
      armorMultValues.push(levelData.armorMult !== undefined ? levelData.armorMult : 1.0);
      penValues.push(levelData.pen !== undefined ? levelData.pen : 0);
    }
    
    return {
      // 显示字段
      caliber: bullet.caliber || '-',
      level: bullet.level ?? '-',
      base: bullet.base ?? 1.0,
      price: bullet.price ?? 0,
      
      // 护甲数据（用于显示和编辑）
      _armorData: armorData,
      _armorMultValues: armorMultValues,
      _penValues: penValues,
      
      // 原始数据引用
      _bulletId: bullet.id || '',
      _isNewRow: false,
      
      // 额外字段
      ...extra
    };
  }

  /**
   * 创建新增行数据
   * @param {Object} defaults - 默认值
   * @returns {Object} 新增行数据
   */
  static createNewRow(defaults = {}) {
    // 默认 armorData 1-6级
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
      _bulletId: `new_${Date.now()}`,
      _isNewRow: true
    };
  }
}

// 导出默认
export default BulletTable;