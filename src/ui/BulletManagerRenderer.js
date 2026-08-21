// src/ui/BulletManagerRenderer.js

import { ViewRendererBase } from './ViewRendererBase.js';
import {
  bulletData,
  getAllCalibers,
  getAllSpecialBullets,
  getBulletLevelData,
  getSpecialBulletData,
  isSpecialBullet,
  isRipBullet,
  isDoubleBullet,
  isHighPenBullet,
  getBulletDisplayName,
} from '../core/bullets.js';
import {
  getBulletPrice,
  setBulletPrice,
  getBulletPriceStats,
  getBulletPricingData,
  setBulletPricingData,
  getPriceKey,
} from '../core/bulletPricing.js';
import { generateHitRatePreview } from '../utils/hitRateUtils.js';

/**
 * 子弹管理和命中率弹窗渲染器
 * 
 * 负责：
 * - 子弹管理表格的渲染 (按口径分组折叠)
 * - 子弹的增删改查
 * - 命中率配置弹窗的渲染和预览
 * - 新增枪械数据的读取
 */
export class BulletManagerRenderer extends ViewRendererBase {
  constructor() {
    super();
    // 存储每个子弹组的折叠状态
    this._groupExpandState = {};
    this._specialExpandState = false;
  }

  /**
   * 保存当前折叠状态
   */
  _saveExpandState() {
    document.querySelectorAll('.bullet-group').forEach(group => {
      const caliber = group.dataset.caliber;
      const groupType = group.dataset.groupType;
      const body = group.querySelector('.bullet-group-body');
      if (body) {
        const isOpen = body.style.display !== 'none';
        if (groupType === 'special') {
          this._specialExpandState = isOpen;
        } else if (caliber) {
          this._groupExpandState[caliber] = isOpen;
        }
      }
    });
  }

  /**
   * 恢复折叠状态
   */
  _restoreExpandState() {
    document.querySelectorAll('.bullet-group').forEach(group => {
      const caliber = group.dataset.caliber;
      const groupType = group.dataset.groupType;
      const body = group.querySelector('.bullet-group-body');
      const toggle = group.querySelector('.bullet-group-toggle');
      if (!body) return;

      let isOpen = false;
      if (groupType === 'special') {
        isOpen = this._specialExpandState;
      } else if (caliber && this._groupExpandState[caliber] !== undefined) {
        isOpen = this._groupExpandState[caliber];
      } else {
        // 默认折叠（除了首次加载时特殊组默认展开）
        isOpen = groupType === 'special' ? false : false;
      }

      body.style.display = isOpen ? 'block' : 'none';
      if (toggle) {
        toggle.textContent = isOpen ? '▼' : '▶';
      }
    });
  }

  // ==================== 子弹管理主渲染 ====================

  /**
   * 渲染子弹管理模块
   * @param {Function} onEdit - 编辑回调 (key, field, value)
   * @param {Function} onDelete - 删除回调 (key, info)
   * @param {Function} onAdd - 添加回调 (caliber, level, data, price)
   * @param {number} defaultLevel - 默认子弹等级
   * @param {boolean} preserveState - 是否保留折叠状态（默认true）
   */
  renderBulletManagement(onEdit, onDelete, onAdd, defaultLevel = 4, preserveState = true) {
    const container = document.getElementById('bulletManagementContainer');
    if (!container) return;

    // 如果需要保留状态，先保存当前折叠状态
    if (preserveState) {
      this._saveExpandState();
    }

    const stats = getBulletPriceStats();
    const calibers = getAllCalibers();
    const specialBullets = getAllSpecialBullets();

    let html = `
      <div class="bullet-management-header">
        <span class="bullet-stats">
          共 ${calibers.length + specialBullets.length} 个口径/子弹
          <span class="bullet-stats-divider">|</span>
          最高价: ${this.formatCurrency(stats.maxPrice)}
          <span class="bullet-stats-divider">|</span>
          最低价: ${this.formatCurrency(stats.minPrice)}
          <span class="bullet-stats-divider">|</span>
          均价: ${this.formatCurrency(stats.avgPrice)}
        </span>
        <div class="bullet-toolbar">
          <input type="text" id="bulletSearchInput" placeholder="🔍 搜索口径或子弹..." class="bullet-search-input" />
        </div>
      </div>
      <div class="bullet-table-wrapper" id="bulletTableWrapper">
        <div id="bulletGroupsContainer">
    `;

    // 渲染常规口径组
    calibers.forEach(caliber => {
      html += this.renderBulletGroup(caliber, defaultLevel);
    });

    // 渲染特殊子弹组
    if (specialBullets.length > 0) {
      html += this.renderSpecialGroup(specialBullets, defaultLevel);
    }

    html += `
        </div>
      </div>
      <div class="bullet-add-caliber-row">
        <span style="font-size:0.85rem;color:#666;margin-right:8px;">添加新口径:</span>
        <input type="text" id="newCaliberInput" placeholder="新口径名称 (如 6.8x51)" style="border:1px solid #4caf50;border-radius:3px;padding:4px 8px;font-size:0.85rem;width:150px;" />
        <button id="addNewCaliberBtn" class="btn-primary" style="padding:4px 14px;font-size:0.85rem;">+ 添加口径</button>
        <span style="font-size:0.75rem;color:#999;margin-left:8px;">添加后自动创建Lv.1~Lv.5</span>
      </div>
    `;

    container.innerHTML = html;

    // 恢复折叠状态
    if (preserveState) {
      this._restoreExpandState();
    }

    this.bindBulletEvents(onEdit, onDelete, onAdd, defaultLevel);

    // 绑定搜索
    const searchInput = document.getElementById('bulletSearchInput');
    if (searchInput) {
      // 移除旧监听器防止重复绑定
      const newSearchInput = searchInput.cloneNode(true);
      searchInput.parentNode.replaceChild(newSearchInput, searchInput);
      newSearchInput.addEventListener('input', () => {
        this.filterBulletGroups(newSearchInput.value);
      });
    }

    // 绑定新增口径
    const addBtn = document.getElementById('addNewCaliberBtn');
    if (addBtn) {
      const newAddBtn = addBtn.cloneNode(true);
      addBtn.parentNode.replaceChild(newAddBtn, addBtn);
      newAddBtn.addEventListener('click', () => {
        const input = document.getElementById('newCaliberInput');
        const name = input?.value?.trim();
        if (name && onAdd) {
          if (bulletData[name]) {
            alert(`口径 "${name}" 已存在`);
            return;
          }
          const baseValues = [1.10, 1.10, 1.00, 1.00, 1.00];
          for (let level = 1; level <= 5; level++) {
            const levelData = {
              base: baseValues[level - 1],
              armorDamage: this.getDefaultArmorDamage(level),
              penLevels: this.getDefaultPenLevels(level)
            };
            onAdd(name, level, levelData, 0);
          }
          input.value = '';
        } else if (!name) {
          alert('请输入口径名称');
        }
      });
    }

    const input = document.getElementById('newCaliberInput');
    if (input) {
      const newInput = input.cloneNode(true);
      input.parentNode.replaceChild(newInput, input);
      newInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          document.getElementById('addNewCaliberBtn')?.click();
        }
      });
    }
  }

  /**
   * 获取默认护甲伤害衰减 (1~6级)
   */
  getDefaultArmorDamage(level) {
    const map = {
      1: [0.60, 0.60, 0.40, 0.30, 0.20, 0.20],
      2: [0.70, 0.70, 0.70, 0.50, 0.40, 0.30],
      3: [0.90, 0.90, 0.90, 0.90, 0.50, 0.40],
      4: [1.00, 1.00, 1.00, 1.00, 1.00, 0.60],
      5: [1.10, 1.10, 1.10, 1.10, 1.10, 1.10],
    };
    return map[level] || [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
  }

  /**
   * 获取默认护甲穿透水平 (1~6级)
   */
  getDefaultPenLevels(level) {
    const map = {
      1: [1.00, 0.75, 0.50, 0.00, 0.00, 0.00],
      2: [1.00, 1.00, 0.75, 0.50, 0.00, 0.00],
      3: [1.00, 1.00, 1.00, 0.75, 0.50, 0.00],
      4: [1.00, 1.00, 1.00, 1.00, 0.75, 0.50],
      5: [1.00, 1.00, 1.00, 1.00, 1.00, 0.75],
    };
    return map[level] || [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
  }

  // ==================== 渲染口径组 ====================

  /**
   * 渲染单个口径组
   */
  renderBulletGroup(caliber, defaultLevel) {
    const data = bulletData[caliber];
    if (!data || !data.levels) return '';

    const levels = Object.keys(data.levels).map(Number).sort((a, b) => a - b);
    const displayName = data.name || caliber;
    const defaultLevelData = data.levels[defaultLevel] || data.levels[levels[0]];

    // 获取默认等级的护甲伤害衰减和护甲穿透水平摘要
    const armorDamage = defaultLevelData.armorDamage || [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
    const penLevels = defaultLevelData.penLevels || [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
    const armorSummary = armorDamage.map(v => Math.round(v * 100) + '%').join(' ');
    const penSummary = penLevels.map(v => Math.round(v * 100) + '%').join(' ');
    const price = getBulletPrice(getPriceKey(caliber, defaultLevel));

    const summary = `
      默认 Lv.${defaultLevel} │ 基础: ${Math.round(defaultLevelData.base * 100)}% │ 护甲伤: ${armorSummary} │ 穿透: ${penSummary} │ 价格: ${this.formatCurrency(price)}
    `;

    let rowsHtml = '';
    levels.forEach(level => {
      const levelData = data.levels[level];
      const isDefault = level === defaultLevel;
      rowsHtml += this.renderLevelRow(caliber, level, levelData, isDefault);
    });

    rowsHtml += this.renderAddLevelRow(caliber);

    return `
      <div class="bullet-group" data-caliber="${caliber}" data-group-type="caliber">
        <div class="bullet-group-header" data-caliber="${caliber}">
          <span class="bullet-group-toggle">▶</span>
          <span class="bullet-group-name">${this.escapeHtml(displayName)}</span>
          <span class="bullet-group-summary">${summary}</span>
          <span class="bullet-group-count">(${levels.length} 个等级)</span>
          <button class="bullet-group-add-btn" data-caliber="${caliber}" title="添加等级">+</button>
        </div>
        <div class="bullet-group-body" style="display:none;">
          <table class="bullet-management-table">
            <thead>
              <tr>
                <th style="min-width:70px;">等级</th>
                <th style="min-width:70px;">基础伤害比例</th>
                <th style="min-width:180px;">护甲伤害衰减 (1~6级)</th>
                <th style="min-width:180px;">护甲穿透水平 (1~6级)</th>
                <th style="min-width:60px;">价格(元)</th>
                <th style="min-width:80px;">操作</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * 渲染特殊子弹组
   */
  renderSpecialGroup(specialBullets, defaultLevel) {
    let rowsHtml = '';
    specialBullets.forEach(key => {
      const data = getSpecialBulletData(key);
      if (!data) return;
      rowsHtml += this.renderSpecialRow(key, data);
    });

    rowsHtml += this.renderAddSpecialRow();

    return `
      <div class="bullet-group" data-group-type="special">
        <div class="bullet-group-header" data-group-type="special">
          <span class="bullet-group-toggle">▶</span>
          <span class="bullet-group-name">🎯 特殊子弹</span>
          <span class="bullet-group-count">(${specialBullets.length} 种)</span>
          <button class="bullet-group-add-btn" data-group-type="special" title="添加特殊子弹">+</button>
        </div>
        <div class="bullet-group-body" style="display:none;">
          <table class="bullet-management-table">
            <thead>
              <tr>
                <th style="min-width:100px;">子弹名称</th>
                <th style="min-width:60px;">等级</th>
                <th style="min-width:70px;">基础伤害比例</th>
                <th style="min-width:180px;">护甲伤害衰减 (1~6级)</th>
                <th style="min-width:180px;">护甲穿透水平 (1~6级)</th>
                <th style="min-width:60px;">价格(元)</th>
                <th style="min-width:80px;">操作</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==================== 渲染行 ====================

  /**
   * 渲染等级行
   */
  renderLevelRow(caliber, level, levelData, isDefault) {
    const priceKey = getPriceKey(caliber, level);
    const price = getBulletPrice(priceKey);

    const armorDamage = levelData.armorDamage || [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
    const armorDamageHtml = armorDamage.map(v => 
      `<span class="pen-level-badge" style="background:${this.getPenLevelColor(v)};">${Math.round(v * 100)}%</span>`
    ).join('');

    const penLevels = levelData.penLevels || [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
    const penLevelsHtml = penLevels.map(v => 
      `<span class="pen-level-badge" style="background:${this.getPenLevelColor(v)};">${Math.round(v * 100)}%</span>`
    ).join('');

    const defaultMark = isDefault ? ' ⭐默认' : '';

    return `
      <tr data-caliber="${caliber}" data-level="${level}" data-is-default="${isDefault}">
        <td class="bullet-level-cell">
          <strong>Lv.${level}${defaultMark}</strong>
        </td>
        <td>${Math.round(levelData.base * 100)}%</td>
        <td class="pen-levels-cell">${armorDamageHtml}</td>
        <td class="pen-levels-cell">${penLevelsHtml}</td>
        <td class="bullet-price-cell">
          <span class="bullet-price-display" data-caliber="${caliber}" data-level="${level}">${this.formatCurrency(price)}</span>
        </td>
        <td>
          <button class="bullet-edit-btn" data-caliber="${caliber}" data-level="${level}" title="编辑价格">✏️</button>
          <button class="bullet-delete-btn" data-caliber="${caliber}" data-level="${level}" title="删除该等级">🗑</button>
        </td>
      </tr>
    `;
  }

  /**
   * 渲染特殊子弹行
   */
  renderSpecialRow(key, data) {
    const price = getBulletPrice(key);

    const armorDamage = data.armorDamage || [0, 0, 0, 0, 0, 0];
    const armorDamageHtml = armorDamage.map(v => 
      `<span class="pen-level-badge" style="background:${this.getPenLevelColor(v)};">${Math.round(v * 100)}%</span>`
    ).join('');

    const penLevels = data.penLevels || [0, 0, 0, 0, 0, 0];
    const penLevelsHtml = penLevels.map(v => 
      `<span class="pen-level-badge" style="background:${this.getPenLevelColor(v)};">${Math.round(v * 100)}%</span>`
    ).join('');

    let typeLabel = '';
    let typeColor = '';
    if (isRipBullet(key)) {
      typeLabel = 'RIP/CT';
      typeColor = '#9c27b0';
    } else if (isDoubleBullet(key)) {
      typeLabel = '双头弹';
      typeColor = '#ff6f00';
    } else if (isHighPenBullet(key)) {
      typeLabel = '高穿透';
      typeColor = '#0d47a1';
    }

    const typeTag = typeLabel ? `<span class="special-type-tag" style="background:${typeColor};color:#fff;padding:1px 6px;border-radius:3px;font-size:0.7rem;">${typeLabel}</span>` : '';
    const note = data.specialNote ? `<div class="special-note">${data.specialNote}</div>` : '';

    let armorDisplay = armorDamageHtml;
    let penDisplay = penLevelsHtml;

    if (isDoubleBullet(key)) {
      armorDisplay = '固定甲伤11';
      penDisplay = '钝伤: 5甲40%, 6甲30%';
    } else if (isRipBullet(key)) {
      penDisplay = '无视护甲 (全算四肢)';
    }

    return `
      <tr data-special-key="${key}" class="special-row">
        <td class="bullet-name-cell">
          <strong>${this.escapeHtml(data.name || key)}</strong>
          ${typeTag}
          ${note}
        </td>
        <td>Lv.${data.level || 0}</td>
        <td>${data.base ? Math.round(data.base * 100) + '%' : '固定'}</td>
        <td class="pen-levels-cell">${armorDisplay}</td>
        <td class="pen-levels-cell">${penDisplay}</td>
        <td class="bullet-price-cell">
          <span class="bullet-price-display" data-special="${key}">${this.formatCurrency(price)}</span>
        </td>
        <td>
          <button class="bullet-edit-btn" data-special="${key}" title="编辑价格">✏️</button>
          <button class="bullet-delete-btn" data-special="${key}" title="删除特殊子弹">🗑</button>
        </td>
      </tr>
    `;
  }

  /**
   * 渲染添加等级行
   */
  renderAddLevelRow(caliber) {
    return `
      <tr class="bullet-add-row" data-caliber="${caliber}">
        <td><input type="number" class="bullet-add-level" placeholder="等级" min="1" max="10" style="width:50px;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#fafffa;font-size:0.85rem;" /></td>
        <td><input type="number" class="bullet-add-base" placeholder="基础" step="0.01" min="0.5" max="1.5" style="width:55px;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#fafffa;font-size:0.85rem;" /></td>
        <td>
          <div class="bullet-add-pen-levels" style="display:flex;gap:2px;">
            <input type="number" class="bullet-add-armor-lv" placeholder="Lv1" step="0.01" min="0" max="2" style="width:38px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.75rem;text-align:center;" />
            <input type="number" class="bullet-add-armor-lv" placeholder="Lv2" step="0.01" min="0" max="2" style="width:38px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.75rem;text-align:center;" />
            <input type="number" class="bullet-add-armor-lv" placeholder="Lv3" step="0.01" min="0" max="2" style="width:38px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.75rem;text-align:center;" />
            <input type="number" class="bullet-add-armor-lv" placeholder="Lv4" step="0.01" min="0" max="2" style="width:38px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.75rem;text-align:center;" />
            <input type="number" class="bullet-add-armor-lv" placeholder="Lv5" step="0.01" min="0" max="2" style="width:38px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.75rem;text-align:center;" />
            <input type="number" class="bullet-add-armor-lv" placeholder="Lv6" step="0.01" min="0" max="2" style="width:38px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.75rem;text-align:center;" />
          </div>
        </td>
        <td>
          <div class="bullet-add-pen-levels" style="display:flex;gap:2px;">
            <input type="number" class="bullet-add-pen-lv" placeholder="Lv1" step="0.01" min="0" max="2" style="width:38px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.75rem;text-align:center;" />
            <input type="number" class="bullet-add-pen-lv" placeholder="Lv2" step="0.01" min="0" max="2" style="width:38px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.75rem;text-align:center;" />
            <input type="number" class="bullet-add-pen-lv" placeholder="Lv3" step="0.01" min="0" max="2" style="width:38px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.75rem;text-align:center;" />
            <input type="number" class="bullet-add-pen-lv" placeholder="Lv4" step="0.01" min="0" max="2" style="width:38px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.75rem;text-align:center;" />
            <input type="number" class="bullet-add-pen-lv" placeholder="Lv5" step="0.01" min="0" max="2" style="width:38px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.75rem;text-align:center;" />
            <input type="number" class="bullet-add-pen-lv" placeholder="Lv6" step="0.01" min="0" max="2" style="width:38px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.75rem;text-align:center;" />
          </div>
        </td>
        <td><input type="number" class="bullet-add-price" placeholder="价格" min="0" step="10" style="width:60px;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#fafffa;font-size:0.85rem;" /></td>
        <td>
          <button class="bullet-add-confirm-btn" data-caliber="${caliber}">✅ 确认</button>
          <button class="bullet-add-cancel-btn">❌</button>
        </td>
      </tr>
    `;
  }

  /**
   * 渲染添加特殊子弹行
   */
  renderAddSpecialRow() {
    return `
      <tr class="bullet-add-row" data-group-type="special">
        <td>
          <input type="text" class="bullet-add-special-name" placeholder="子弹名称" style="width:100px;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#fafffa;font-size:0.85rem;" />
          <select class="bullet-add-special-type" style="border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#fafffa;font-size:0.85rem;">
            <option value="rip">RIP</option>
            <option value="ct">CT</option>
            <option value="double">双头弹</option>
            <option value="highPen">高穿透弹</option>
          </select>
        </td>
        <td><input type="number" class="bullet-add-special-level" placeholder="等级" min="1" max="5" style="width:45px;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#fafffa;font-size:0.85rem;" /></td>
        <td><input type="number" class="bullet-add-special-base" placeholder="基础" step="0.01" min="0.5" max="1.5" style="width:55px;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#fafffa;font-size:0.85rem;" /></td>
        <td>
          <div class="bullet-add-pen-levels" style="display:flex;gap:2px;">
            <input type="number" class="bullet-add-special-armor-lv" placeholder="Lv1" step="0.01" min="0" max="2" style="width:32px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.7rem;text-align:center;" />
            <input type="number" class="bullet-add-special-armor-lv" placeholder="Lv2" step="0.01" min="0" max="2" style="width:32px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.7rem;text-align:center;" />
            <input type="number" class="bullet-add-special-armor-lv" placeholder="Lv3" step="0.01" min="0" max="2" style="width:32px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.7rem;text-align:center;" />
            <input type="number" class="bullet-add-special-armor-lv" placeholder="Lv4" step="0.01" min="0" max="2" style="width:32px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.7rem;text-align:center;" />
            <input type="number" class="bullet-add-special-armor-lv" placeholder="Lv5" step="0.01" min="0" max="2" style="width:32px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.7rem;text-align:center;" />
            <input type="number" class="bullet-add-special-armor-lv" placeholder="Lv6" step="0.01" min="0" max="2" style="width:32px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.7rem;text-align:center;" />
          </div>
        </td>
        <td>
          <div class="bullet-add-pen-levels" style="display:flex;gap:2px;">
            <input type="number" class="bullet-add-special-pen-lv" placeholder="Lv1" step="0.01" min="0" max="2" style="width:32px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.7rem;text-align:center;" />
            <input type="number" class="bullet-add-special-pen-lv" placeholder="Lv2" step="0.01" min="0" max="2" style="width:32px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.7rem;text-align:center;" />
            <input type="number" class="bullet-add-special-pen-lv" placeholder="Lv3" step="0.01" min="0" max="2" style="width:32px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.7rem;text-align:center;" />
            <input type="number" class="bullet-add-special-pen-lv" placeholder="Lv4" step="0.01" min="0" max="2" style="width:32px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.7rem;text-align:center;" />
            <input type="number" class="bullet-add-special-pen-lv" placeholder="Lv5" step="0.01" min="0" max="2" style="width:32px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.7rem;text-align:center;" />
            <input type="number" class="bullet-add-special-pen-lv" placeholder="Lv6" step="0.01" min="0" max="2" style="width:32px;border:1px solid #4caf50;border-radius:3px;padding:1px 2px;background:#fafffa;font-size:0.7rem;text-align:center;" />
          </div>
        </td>
        <td><input type="number" class="bullet-add-special-price" placeholder="价格" min="0" step="10" style="width:60px;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#fafffa;font-size:0.85rem;" /></td>
        <td>
          <button class="bullet-add-confirm-btn" data-group-type="special">✅ 确认</button>
          <button class="bullet-add-cancel-btn">❌</button>
        </td>
      </tr>
    `;
  }

  // ==================== 辅助方法 ====================

  /**
   * 获取穿透等级颜色
   */
  getPenLevelColor(value) {
    if (value >= 1.0) return '#4caf50';
    if (value >= 0.5) return '#ff9800';
    if (value > 0) return '#f44336';
    return '#9e9e9e';
  }

  // ==================== 事件绑定 ====================

  /**
   * 绑定子弹管理事件
   */
  bindBulletEvents(onEdit, onDelete, onAdd, defaultLevel) {
    // ===== 折叠展开 =====
    document.querySelectorAll('.bullet-group-header').forEach(header => {
      // 移除旧监听器防止重复绑定
      const newHeader = header.cloneNode(true);
      header.parentNode.replaceChild(newHeader, header);
      
      newHeader.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const body = newHeader.nextElementSibling;
        const toggle = newHeader.querySelector('.bullet-group-toggle');
        if (body) {
          const isOpen = body.style.display !== 'none';
          body.style.display = isOpen ? 'none' : 'block';
          if (toggle) toggle.textContent = isOpen ? '▶' : '▼';
          
          // 保存状态到内存
          const group = newHeader.closest('.bullet-group');
          const caliber = group?.dataset.caliber;
          const groupType = group?.dataset.groupType;
          if (groupType === 'special') {
            this._specialExpandState = !isOpen;
          } else if (caliber) {
            this._groupExpandState[caliber] = !isOpen;
          }
        }
      });
    });

    // ===== 组内添加按钮 =====
    document.querySelectorAll('.bullet-group-add-btn').forEach(btn => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      
      newBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const group = newBtn.closest('.bullet-group');
        const body = group?.querySelector('.bullet-group-body');
        if (body) {
          body.style.display = 'block';
          const toggle = group?.querySelector('.bullet-group-toggle');
          if (toggle) toggle.textContent = '▼';
          
          // 更新状态
          const caliber = group?.dataset.caliber;
          const groupType = group?.dataset.groupType;
          if (groupType === 'special') {
            this._specialExpandState = true;
          } else if (caliber) {
            this._groupExpandState[caliber] = true;
          }
          
          const addRow = body.querySelector('.bullet-add-row');
          if (addRow) {
            setTimeout(() => addRow.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
          }
        }
      });
    });

    // ===== 编辑价格 =====
    document.querySelectorAll('.bullet-price-display').forEach(el => {
      const newEl = el.cloneNode(true);
      el.parentNode.replaceChild(newEl, el);
      
      newEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const currentText = newEl.textContent.replace(/[^0-9.]/g, '') || '0';
        const currentPrice = parseFloat(currentText) || 0;

        const caliber = newEl.dataset.caliber;
        const level = newEl.dataset.level;
        const special = newEl.dataset.special;
        const key = special || (caliber && level ? getPriceKey(caliber, parseInt(level)) : null);

        if (!key) return;

        this.makeBulletEditable(newEl, 'number', (value) => {
          const newPrice = parseFloat(value);
          if (!isNaN(newPrice) && newPrice >= 0 && onEdit) {
            onEdit(key, 'price', newPrice);
          }
        });
      });
    });

    // ===== 删除按钮 =====
    document.querySelectorAll('.bullet-delete-btn').forEach(btn => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      
      newBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const caliber = newBtn.dataset.caliber;
        const level = newBtn.dataset.level;
        const special = newBtn.dataset.special;

        let key = special;
        let info = { isSpecial: !!special };
        if (caliber && level) {
          key = getPriceKey(caliber, parseInt(level));
          info = { caliber, level: parseInt(level), isSpecial: false };
        }

        if (key && onDelete) {
          onDelete(key, info);
        }
      });
    });

    // ===== 确认添加（常规等级） =====
    document.querySelectorAll('.bullet-add-confirm-btn[data-caliber]').forEach(btn => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      
      newBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = newBtn.closest('tr');
        const caliber = newBtn.dataset.caliber;

        const levelInput = row.querySelector('.bullet-add-level');
        const baseInput = row.querySelector('.bullet-add-base');
        const armorLvInputs = row.querySelectorAll('.bullet-add-armor-lv');
        const penLvInputs = row.querySelectorAll('.bullet-add-pen-lv');
        const priceInput = row.querySelector('.bullet-add-price');

        const level = parseInt(levelInput?.value);
        const base = parseFloat(baseInput?.value) || 1.0;
        const armorDamage = Array.from(armorLvInputs).map(inp => parseFloat(inp.value) || 0);
        const penLevels = Array.from(penLvInputs).map(inp => parseFloat(inp.value) || 0);
        const price = parseFloat(priceInput?.value) || 0;

        if (isNaN(level) || level < 1) {
          alert('请输入有效的等级');
          return;
        }

        if (onAdd) {
          onAdd(caliber, level, { base, armorDamage, penLevels }, price);
        }
      });
    });

    // ===== 确认添加（特殊子弹） =====
    document.querySelectorAll('.bullet-add-confirm-btn[data-group-type="special"]').forEach(btn => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      
      newBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = newBtn.closest('tr');

        const nameInput = row.querySelector('.bullet-add-special-name');
        const typeSelect = row.querySelector('.bullet-add-special-type');
        const levelInput = row.querySelector('.bullet-add-special-level');
        const baseInput = row.querySelector('.bullet-add-special-base');
        const armorLvInputs = row.querySelectorAll('.bullet-add-special-armor-lv');
        const penLvInputs = row.querySelectorAll('.bullet-add-special-pen-lv');
        const priceInput = row.querySelector('.bullet-add-special-price');

        const name = nameInput?.value?.trim();
        const type = typeSelect?.value;
        const level = parseInt(levelInput?.value) || 4;
        const base = parseFloat(baseInput?.value) || 1.0;
        const armorDamage = Array.from(armorLvInputs).map(inp => parseFloat(inp.value) || 0);
        const penLevels = Array.from(penLvInputs).map(inp => parseFloat(inp.value) || 0);
        const price = parseFloat(priceInput?.value) || 0;

        if (!name) {
          alert('请输入子弹名称');
          return;
        }

        if (bulletData[name]) {
          alert(`子弹 "${name}" 已存在`);
          return;
        }

        if (onAdd) {
          onAdd(name, null, { type, level, base, armorDamage, penLevels, isSpecial: true, name }, price);
        }
      });
    });

    // ===== 取消按钮 =====
    document.querySelectorAll('.bullet-add-cancel-btn').forEach(btn => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      
      newBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = newBtn.closest('tr');
        row.querySelectorAll('input').forEach(inp => inp.value = '');
      });
    });
  }

  // ==================== 搜索过滤 ====================

  /**
   * 过滤子弹组
   */
  filterBulletGroups(searchText) {
    const groups = document.querySelectorAll('.bullet-group');
    const text = searchText?.toLowerCase().trim() || '';

    groups.forEach(group => {
      const header = group.querySelector('.bullet-group-header');
      const nameEl = group.querySelector('.bullet-group-name');
      const name = nameEl?.textContent?.toLowerCase() || '';
      const match = !text || name.includes(text);
      group.style.display = match ? '' : 'none';
    });
  }

  // ==================== 刷新 ====================

  /**
   * 刷新子弹表格（保留折叠状态）
   */
  refreshBulletTable(defaultLevel = 4) {
    const container = document.getElementById('bulletManagementContainer');
    if (!container) return;

    // 重新渲染，保留折叠状态
    this.renderBulletManagement(
      window._bulletCallbacks?.onEdit,
      window._bulletCallbacks?.onDelete,
      window._bulletCallbacks?.onAdd,
      defaultLevel,
      true  // preserveState = true
    );
  }

  /**
   * 更新子弹统计信息
   */
  updateBulletStats() {
    const stats = getBulletPriceStats();
    const container = document.querySelector('.bullet-stats');
    if (container) {
      const calibers = getAllCalibers();
      const specials = getAllSpecialBullets();
      container.innerHTML = `
        共 ${calibers.length + specials.length} 个口径/子弹
        <span class="bullet-stats-divider">|</span>
        最高价: ${this.formatCurrency(stats.maxPrice)}
        <span class="bullet-stats-divider">|</span>
        最低价: ${this.formatCurrency(stats.minPrice)}
        <span class="bullet-stats-divider">|</span>
        均价: ${this.formatCurrency(stats.avgPrice)}
      `;
    }
  }

  // ==================== 命中率弹窗 ====================

  /**
   * 渲染命中率配置弹窗内容
   */
  renderHitRateModal(weaponName, configId, points, defaultHitRate = 0.80) {
    const sortedPoints = points ? [...points].sort((a, b) => a.distance - b.distance) : [];

    let pointsHtml = '';
    if (sortedPoints.length === 0) {
      pointsHtml = `
        <tr class="hitrate-empty-row">
          <td colspan="3" style="text-align:center;color:#999;padding:20px 0;">
            暂无配置，将使用统一命中率 ${Math.round(defaultHitRate * 100)}%
          </td>
        </tr>
      `;
    } else {
      sortedPoints.forEach((p, idx) => {
        pointsHtml += `
          <tr data-point-index="${idx}">
            <td><input type="number" class="hitrate-distance-input" value="${p.distance}" min="0" step="5" style="width:70px;border:1px solid #ddd;border-radius:3px;padding:2px 4px;text-align:center;" /></td>
            <td><input type="number" class="hitrate-rate-input" value="${Math.round(p.rate * 100)}" min="0" max="100" step="1" style="width:70px;border:1px solid #ddd;border-radius:3px;padding:2px 4px;text-align:center;" /></td>
            <td><button class="hitrate-remove-point-btn" data-index="${idx}" style="background:#f44336;color:#fff;border:none;border-radius:3px;padding:2px 8px;cursor:pointer;">删除</button></td>
          </tr>
        `;
      });
    }

    return `
      <div class="hitrate-modal-content">
        <div class="hitrate-modal-header">
          <h3>编辑命中率曲线 - ${this.escapeHtml(weaponName)} (${this.escapeHtml(configId)})</h3>
          <span class="modal-close" id="hitrateModalClose">&times;</span>
        </div>
        <div class="hitrate-modal-body">
          <div class="hitrate-info">
            <p>配置距离与命中率的对应关系，可配置 <strong>1~3</strong> 个点。</p>
            <p>未配置时使用页面顶部的统一命中率 (<strong>${Math.round(defaultHitRate * 100)}%</strong>)。</p>
            <p>💡 只配置1个点时，每靠近1m增加1%命中率，每远离1m减少1%命中率。</p>
          </div>
          <div class="hitrate-table-wrapper">
            <table class="hitrate-points-table">
              <thead>
                <tr>
                  <th>距离 (m)</th>
                  <th>命中率 (%)</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody id="hitratePointsBody">
                ${pointsHtml}
              </tbody>
            </table>
          </div>
          <div class="hitrate-actions">
            <button id="hitrateAddPointBtn" class="btn-primary" ${sortedPoints.length >= 3 ? 'disabled' : ''}>
              + 添加点 (${sortedPoints.length}/3)
            </button>
            <button id="hitrateClearBtn" class="btn-secondary">清空 (使用统一命中率)</button>
          </div>
          <div class="hitrate-preview">
            <canvas id="hitratePreviewCanvas" width="400" height="150"></canvas>
          </div>
        </div>
        <div class="hitrate-modal-footer">
          <button id="hitrateSaveBtn" class="btn-success">💾 保存</button>
          <button id="hitrateCancelBtn" class="btn-secondary">取消</button>
        </div>
      </div>
    `;
  }

  /**
   * 绘制命中率曲线预览
   */
  drawHitRatePreview(canvas, points, defaultHitRate = 0.80) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const padding = { top: 20, right: 20, bottom: 30, left: 40 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 10; i++) {
      const x = padding.left + (i / 10) * chartWidth;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, height - padding.bottom);
      ctx.stroke();
    }
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (1 - i / 5) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    const previewPoints = generateHitRatePreview(points, defaultHitRate, 50, 150);
    if (previewPoints.length < 2) {
      ctx.fillStyle = '#999';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('无数据', width / 2, height / 2);
      return;
    }

    ctx.beginPath();
    ctx.strokeStyle = '#2196F3';
    ctx.lineWidth = 2.5;

    previewPoints.forEach((p, i) => {
      const x = padding.left + (p.distance / 150) * chartWidth;
      const y = padding.top + (1 - p.rate) * chartHeight;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    const sortedPoints = points ? [...points].sort((a, b) => a.distance - b.distance) : [];
    sortedPoints.forEach(p => {
      const x = padding.left + (p.distance / 150) * chartWidth;
      const y = padding.top + (1 - p.rate) * chartHeight;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff5722';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('距离(m)', width / 2, height - 4);
    ctx.textAlign = 'center';
    ctx.fillText('0', padding.left, height - padding.bottom + 14);
    ctx.fillText('150', width - padding.right, height - padding.bottom + 14);
    ctx.textAlign = 'right';
    ctx.fillText('100%', padding.left - 4, padding.top + 4);
    ctx.textAlign = 'right';
    ctx.fillText('0%', padding.left - 4, height - padding.bottom + 4);
  }

  /**
   * 解析命中率点数据
   */
  parseHitRatePointsFromModal(container) {
    const rows = container.querySelectorAll('#hitratePointsBody tr:not(.hitrate-empty-row)');
    const points = [];
    rows.forEach(row => {
      const distanceInput = row.querySelector('.hitrate-distance-input');
      const rateInput = row.querySelector('.hitrate-rate-input');
      if (distanceInput && rateInput) {
        const distance = parseFloat(distanceInput.value);
        const rate = parseFloat(rateInput.value) / 100;
        if (!isNaN(distance) && distance >= 0 && !isNaN(rate) && rate >= 0 && rate <= 1) {
          points.push({ distance, rate });
        }
      }
    });
    return points.sort((a, b) => a.distance - b.distance);
  }

  // ==================== 新增枪械 ====================

  /**
   * 读取新增枪械的数据
   */
  readNewWeaponData() {
    const name = document.getElementById('newWeaponName')?.value?.trim();
    const type = document.getElementById('newWeaponType')?.value?.trim() || '步枪';
    const rof = parseFloat(document.getElementById('newWeaponRof')?.value);
    const velocity = parseFloat(document.getElementById('newWeaponVelocity')?.value);
    const rangesStr = document.getElementById('newWeaponRanges')?.value?.trim();
    const flesh = parseFloat(document.getElementById('newWeaponFlesh')?.value);
    const armor = parseFloat(document.getElementById('newWeaponArmor')?.value);
    const decaysStr = document.getElementById('newWeaponDecays')?.value?.trim();
    const multStr = document.getElementById('newWeaponMult')?.value?.trim();

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
    const decays = this.parseDecaysInput(decaysStr || '1.0,0.85,0.7,0.7,0.7');
    const mult = this.parseMultInput(multStr || '1.9,1,0.9,0.4');

    return {
      name,
      type,
      ranges,
      decays,
      velocity,
      flesh,
      armor,
      rof,
      triggerDelay: 0,
      barrels: [],
      mult,
      allowedBullets: ['5.56x45'],
      configs: [
        {
          id: 'cfg-1',
          code: `${name}-01`,
          price: 0,
          selectedBarrel: 0,
          selectedMuzzle: 0,
          precision: 0.09,
          hitRatePoints: [],
          bulletType: '5.56x45',
          bulletLevel: 4,
          ammoCount: this.getDefaultAmmoCount(type)
        }
      ]
    };
  }

  /**
   * 清空新增枪械输入框
   */
  clearNewWeaponInputs() {
    const inputs = [
      'newWeaponName', 'newWeaponType', 'newWeaponRof',
      'newWeaponVelocity', 'newWeaponRanges', 'newWeaponFlesh',
      'newWeaponArmor', 'newWeaponDecays', 'newWeaponMult'
    ];
    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  // ==================== 子弹价格导入导出 ====================

  getBulletPricingData() {
    return getBulletPricingData();
  }

  setBulletPricingData(data) {
    setBulletPricingData(data);
    this.refreshBulletTable();
  }
}