/**
 * 价格表格组件
 * 
 * 显示武器价格配置表格，支持编辑和行操作（新增/删除）
 * 
 * 数据来源：DataManager.getPriceRows()
 * 
 * 列：
 * - 武器（只读）
 * - 序号（只读，cfg-1, cfg-2, cfg-3）
 * - 枪管（下拉选择，从武器.barrels 读取）
 * - 枪口（下拉选择，从全局枪口列表读取）
 * - 改枪码（文本编辑）
 * - 整枪价格（数字编辑）
 * - 命中率（文本编辑，格式：30:0.9,50:0.8,100:0.6）
 * - 子弹（下拉选择，从武器口径对应的子弹列表读取）
 * - 操作（新增行 / 删除行）
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
   * @returns {Array} 列配置数组
   */
  static getColumns(options = {}) {
    const {
      onCellChange = null,
      onAddRow = null,
      onDeleteRow = null,
      getBarrelOptions = null,
      getBulletOptions = null,
      muzzleOptions = ['无', '死寂', '先进/轻语/勇火', '冲锋枪回声消音器']
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

      // ==================== 序号（只读） ====================
      {
        key: 'configId',
        label: '序号',
        editable: false,
        headerAttrs: { style: 'min-width:60px;' },
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
        // 🔥 动态获取选项
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
            html += `<button class="delete-price-btn" data-row="${row._rowIndex || 0}" data-weapon-id="${row._weaponId || ''}" data-config-id="${row.configId || ''}" title="删除行">🗑️</button>`;
          }
          
          return html;
        }
      }
    ];
  }

  /**
   * 渲染价格表格
   * @param {Object} config - 表格配置
   * @param {Array} config.data - 价格数据数组
   * @param {Function} config.onCellChange - 单元格变更回调 (rowIndex, key, value, row)
   * @param {Function} config.onAddRow - 新增行回调 (weaponId, configId)
   * @param {Function} config.onDeleteRow - 删除行回调 (rowIndex, weaponId, configId)
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
      getBarrelOptions = null,
      getBulletOptions = null,
      muzzleOptions = ['无', '死寂', '先进/轻语/勇火', '冲锋枪回声消音器'],
      emptyText = '暂无价格数据'
    } = config;

    // 🔥 为数据添加 _rowIndex 并预计算枪管和枪口选项
    const indexedData = data.map((row, index) => {
      // 🔥 关键：从 getBarrelOptions 获取枪管选项
      let barrelOptions = ['无'];
      if (typeof getBarrelOptions === 'function') {
        const opts = getBarrelOptions(row);
        if (opts && opts.length > 0) {
          barrelOptions = opts;
        }
      }
      
      // 确保 barrelOptions 包含 "无" 且去重
      if (!barrelOptions.includes('无')) {
        barrelOptions = ['无', ...barrelOptions];
      }
      barrelOptions = [...new Set(barrelOptions)];
      
      // 获取枪口选项
      let muzzleOpts = muzzleOptions;
      if (row._muzzleOptions && row._muzzleOptions.length > 0) {
        muzzleOpts = row._muzzleOptions;
      }
      
      return {
        ...row,
        _rowIndex: index,
        _barrelOptions: barrelOptions,
        _muzzleOptions: muzzleOpts,
        _isNewRow: row._isNewRow || false
      };
    });

    // 构建列配置
    const columns = this.getColumns({
      onCellChange,
      onAddRow,
      onDeleteRow,
      getBarrelOptions,
      getBulletOptions,
      muzzleOptions
    });

    // 渲染表格
    const table = TableRenderer.render({
      id: 'priceTable',
      columns: columns,
      data: indexedData,
      emptyText: emptyText,
      showRowIndex: false,
      rowClass: (row) => {
        return row._isNewRow ? 'new-price-row' : '';
      },
      onCellChange: (rowIndex, key, value, row) => {
        if (key === 'price') {
          const numValue = parseFloat(value);
          if (!isNaN(numValue) && numValue >= 0) {
            if (onCellChange) {
              onCellChange(rowIndex, key, numValue, row);
            }
          }
          return;
        }
        
        if (key === 'hitRateRaw') {
          if (onCellChange) {
            onCellChange(rowIndex, key, value, row);
          }
          return;
        }
        
        if (key === 'barrel' || key === 'muzzle' || key === 'bulletDisplay') {
          if (onCellChange) {
            onCellChange(rowIndex, key, value, row);
          }
          return;
        }
        
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
      getBarrelOptions,
      getBulletOptions,
      muzzleOptions
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
      getBarrelOptions,
      getBulletOptions,
      muzzleOptions
    } = handlers;

    const el = table.getElement();
    if (!el) return;

    // ===== 枪管选择变更 =====
    el.addEventListener('change', (e) => {
      const select = e.target.closest('select[data-price-barrel="true"]');
      if (!select) return;
      
      const td = select.closest('td');
      const row = td?.closest('tr');
      if (!row) return;
      
      const rowIndex = parseInt(row.dataset.index);
      if (isNaN(rowIndex)) return;
      
      const value = select.value;
      
      // 🔥 获取武器名称
      const rowData = table.getData()[rowIndex];
      const weaponName = rowData?.weaponName || '未知武器';
      
      console.log(`🔄 [价格表格] 枪管变更: 行 ${rowIndex}, 武器: ${weaponName}, 值: ${value}`);
      
      if (onCellChange) {
        if (rowData) {
          onCellChange(rowIndex, 'barrel', value, rowData);
        }
      }
    });

    // ===== 枪口选择变更 =====
    el.addEventListener('change', (e) => {
      const select = e.target.closest('select[data-price-muzzle="true"]');
      if (!select) return;
      
      const td = select.closest('td');
      const row = td?.closest('tr');
      if (!row) return;
      
      const rowIndex = parseInt(row.dataset.index);
      if (isNaN(rowIndex)) return;
      
      const value = select.value;
      
      // 🔥 获取武器名称
      const rowData = table.getData()[rowIndex];
      const weaponName = rowData?.weaponName || '未知武器';
      
      console.log(`🔄 [价格表格] 枪口变更: 行 ${rowIndex}, 武器: ${weaponName}, 值: ${value}`);
      
      if (onCellChange) {
        if (rowData) {
          onCellChange(rowIndex, 'muzzle', value, rowData);
        }
      }
    });

    // ===== 子弹选择变更 =====
    el.addEventListener('change', (e) => {
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
    el.addEventListener('click', (e) => {
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
  }

  /**
   * 更新价格表格数据
   * @param {string|HTMLElement} container - 容器元素或选择器
   * @param {Array} data - 新的价格数据
   * @param {Object} config - 额外配置
   * @returns {Array} 处理后的数据（包含 _barrelOptions）
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
      getBarrelOptions,
      getBulletOptions,
      muzzleOptions = ['无', '死寂', '先进/轻语/勇火', '冲锋枪回声消音器']
    } = config;

    // 🔥 为数据添加 _rowIndex 并预计算枪管和枪口选项
    const indexedData = data.map((row, index) => {
      // 🔥 关键：从 getBarrelOptions 获取枪管选项
      let barrelOptions = ['无'];
      if (typeof getBarrelOptions === 'function') {
        const opts = getBarrelOptions(row);
        if (opts && opts.length > 0) {
          barrelOptions = opts;
        }
      }
      
      // 确保 barrelOptions 包含 "无" 且去重
      if (!barrelOptions.includes('无')) {
        barrelOptions = ['无', ...barrelOptions];
      }
      barrelOptions = [...new Set(barrelOptions)];
      
      // 获取枪口选项
      let muzzleOpts = muzzleOptions;
      if (row._muzzleOptions && row._muzzleOptions.length > 0) {
        muzzleOpts = row._muzzleOptions;
      }
      
      return {
        ...row,
        _rowIndex: index,
        _barrelOptions: barrelOptions,
        _muzzleOptions: muzzleOpts,
        _isNewRow: row._isNewRow || false
      };
    });

    const columns = this.getColumns({
      onCellChange,
      onAddRow,
      onDeleteRow,
      getBarrelOptions,
      getBulletOptions,
      muzzleOptions
    });

    TableRenderer.updateTable('priceTable', columns, indexedData, {
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
    });
    
    // 🔥 返回处理后的数据，供调用方更新缓存
    return indexedData;
  }

  /**
   * 构建价格行数据（从 DataManager 的原始数据转换）
   * @param {Object} rowData - DataManager.getPriceRows() 返回的行数据
   * @param {Object} extra - 额外字段
   * @returns {Object} 完整的行数据
   */
  static buildRowData(rowData, extra = {}) {
    // 从 rowData 中提取命中率原始格式
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

    // 🔥 修复：确保 _weaponId 正确传递
    const weaponId = rowData._weaponId !== undefined ? rowData._weaponId : rowData.weaponId;
    
    const result = {
      weaponName: rowData.weaponName || '-',
      configId: rowData.configId || '-',
      barrel: rowData.barrel || '无',
      muzzle: rowData.muzzle || '无',
      buildCode: rowData.buildCode || '',
      price: rowData.price || 0,
      hitRateRaw: hitRateRaw,
      bulletDisplay: rowData.bulletDisplay || '-',
      
      // 🔥 确保 _weaponId 被正确设置
      _weaponId: weaponId,
      _configId: rowData.configId,
      _distance: rowData.distance || [],
      _hitRate: rowData.hitRate || [],
      _bulletId: rowData.bulletId || '',
      _rawConfig: rowData._rawConfig || {},
      _isNewRow: false,
      
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
    return {
      weaponName: weaponName || '-',
      configId: nextConfigId || 'cfg-new',
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
      _isNewRow: true
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

// 导出默认
export default PriceTable;