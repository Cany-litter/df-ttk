// src/ui/TabRenderers.js

import { ViewRendererBase } from './ViewRendererBase.js';
import { getBulletPrice } from '../core/pricingManager.js';
import {
  getAllCalibers,
  getAllSpecialBullets,
  getBulletLevelData,
  getSpecialBulletData,
  getBulletDisplayName,
  isSpecialBullet,
} from '../core/bullets.js';

/**
 * Tab渲染器
 * 负责三个Tab的渲染和事件绑定
 * 
 * - Tab1 基础属性: 纯数据展示，无操作列，支持双击编辑
 * - Tab2 配件数据: 树状展开 武器 → 枪管（枪口作为下拉选择框，不展开）
 * - Tab3 价格数据: 树状展开 武器 → 枪管，每个枪管下展示所有匹配的改枪配置行
 * 
 * 价格数据现在由 pricingManager 统一管理，不再存储在 configs 中
 */
export class TabRenderers extends ViewRendererBase {
  // ==================== Tab1: 基础属性 ====================

  /**
   * 渲染基础属性Tab - 纯数据展示，无操作列
   * @param {Array} weapons - 武器数据数组
   * @param {Function} onEdit - 编辑回调 (weaponIndex, property, value)
   * @returns {string} HTML字符串
   */
  renderBasicTab(weapons, onEdit = null) {
    if (!weapons || weapons.length === 0) {
      return `
        <div class="empty-state">
          <p style="color:#999;text-align:center;padding:20px 0;">暂无武器数据</p>
        </div>
      `;
    }

    let html = `
      <div id="basicTabContent">
        <div class="tab-table-wrapper">
          <table class="basic-tab-table">
            <thead>
              <tr>
                <th style="min-width:80px;">武器</th>
                <th style="min-width:50px;">类型</th>
                <th style="min-width:50px;">射速</th>
                <th style="min-width:55px;">初速</th>
                <th style="min-width:90px;">射程</th>
                <th style="min-width:50px;">基础伤害</th>
                <th style="min-width:50px;">护甲伤害</th>
                <th style="min-width:110px;">伤害衰减</th>
                <th style="min-width:110px;">部位倍率</th>
                <th style="min-width:100px;">部位伤害</th>
              </tr>
            </thead>
            <tbody>
    `;

    weapons.forEach((weapon, idx) => {
      html += this.renderBasicTableRow(weapon, idx);
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    return html;
  }

  /**
   * 渲染基础属性表格单行 - 无操作列
   * @param {Object} weapon - 武器对象
   * @param {number} index - 武器索引
   * @returns {string} HTML字符串
   */
  renderBasicTableRow(weapon, index) {
    const partDamage = this.formatPartDamage(weapon.flesh, weapon.mult);
    const configCount = (weapon.configs && Array.isArray(weapon.configs)) ? weapon.configs.length : 1;

    return `
      <tr data-weapon-index="${index}">
        <td class="weapon-name-cell">
          <span class="weapon-name-display" data-weapon="${index}">${this.escapeHtml(weapon.name)}</span>
          <span class="config-count-badge">[${configCount}]</span>
        </td>
        <td><span class="weapon-type-display" data-weapon="${index}">${this.escapeHtml(weapon.type || '')}</span></td>
        <td><span class="weapon-rof-display" data-weapon="${index}">${Math.round(weapon.rof)}</span></td>
        <td><span class="weapon-velocity-display" data-weapon="${index}">${Math.round(weapon.velocity)}</span></td>
        <td><span class="weapon-ranges-display" data-weapon="${index}">${this.formatRangesForDisplay(weapon.ranges)}</span></td>
        <td><span class="weapon-flesh-display" data-weapon="${index}">${Math.round(weapon.flesh)}</span></td>
        <td><span class="weapon-armor-display" data-weapon="${index}">${Math.round(weapon.armor)}</span></td>
        <td><span class="weapon-decays-display" data-weapon="${index}">${this.formatDecaysForDisplay(weapon.decays)}</span></td>
        <td><span class="weapon-mult-display" data-weapon="${index}">${this.formatMultipliersForDisplay(weapon.mult)}</span></td>
        <td class="part-damage-cell">${partDamage}</td>
      </tr>
    `;
  }

  /**
   * 绑定基础属性Tab的编辑事件
   * @param {Function} onEdit - 编辑回调 (weaponIndex, property, value)
   */
  bindBasicTabEvents(onEdit) {
    const bindings = [
      { selector: '.weapon-name-display', prop: 'name', type: 'text' },
      { selector: '.weapon-type-display', prop: 'type', type: 'text' },
      { selector: '.weapon-rof-display', prop: 'rof', type: 'number' },
      { selector: '.weapon-velocity-display', prop: 'velocity', type: 'number' },
      { selector: '.weapon-ranges-display', prop: 'ranges', type: 'text' },
      { selector: '.weapon-flesh-display', prop: 'flesh', type: 'number' },
      { selector: '.weapon-armor-display', prop: 'armor', type: 'number' },
      { selector: '.weapon-decays-display', prop: 'decays', type: 'text' },
      { selector: '.weapon-mult-display', prop: 'mult', type: 'text' }
    ];

    bindings.forEach(({ selector, prop, type }) => {
      document.querySelectorAll(`#basicTabContent ${selector}`).forEach(el => {
        el.addEventListener('dblclick', (e) => {
          const weaponIdx = parseInt(e.target.dataset.weapon);
          if (!isNaN(weaponIdx)) {
            this.makeEditable(e.target, type, (value) => {
              if (onEdit) onEdit(weaponIdx, prop, value);
            });
          }
        });
      });
    });
  }

  // ==================== Tab2: 配件数据 ====================

  /**
   * 渲染配件数据Tab
   * @param {Array} weapons - 武器数据数组
   * @param {Array} muzzles - 枪口数据数组
   * @param {Object} params - 页面参数
   * @param {Function} onMuzzleChange - 枪口变化回调
   * @param {Function} onPrecisionChange - 精校变化回调
   * @param {Function} onEditBarrel - 编辑枪管回调
   * @param {Function} onTreeToggle - 树状展开/收起回调
   * @param {Object} expandedState - 展开状态
   * @param {Object} muzzleState - 枪口状态
   * @param {Object} precisionState - 精校状态
   * @returns {string} HTML字符串
   */
  renderAttachmentTab(weapons, muzzles, params = {},
    onMuzzleChange = null, onPrecisionChange = null, onEditBarrel = null,
    onTreeToggle = null, expandedState = null, muzzleState = null, precisionState = null) {

    if (!weapons || weapons.length === 0) {
      return `
        <div class="empty-state">
          <p style="color:#999;text-align:center;padding:20px 0;">暂无武器数据</p>
        </div>
      `;
    }

    const expandState = expandedState || {};
    const muzzleSelState = muzzleState || {};
    const precisionSelState = precisionState || {};
    const defaultMuzzle = 0;
    const defaultPrecision = 0.09;

    let html = `
      <div id="attachmentTabContent">
        <div class="tab-table-wrapper">
          <table class="attachment-tab-table">
            <thead>
              <tr>
                <th style="min-width:80px;">武器</th>
                <th style="min-width:140px;">枪管</th>
                <th style="min-width:120px;">枪口</th>
                <th style="min-width:50px;">射速</th>
                <th style="min-width:55px;">初速</th>
                <th style="min-width:90px;">射程</th>
                <th style="min-width:50px;">基础伤害</th>
                <th style="min-width:50px;">护甲伤害</th>
                <th style="min-width:110px;">伤害衰减</th>
                <th style="min-width:110px;">部位倍率</th>
                <th style="min-width:100px;">精校</th>
                <th style="min-width:40px;">操作</th>
              </tr>
            </thead>
            <tbody>
    `;

    weapons.forEach((weapon, wIdx) => {
      const isWeaponExpanded = expandState[`weapon_${wIdx}`] === true;
      const barrels = weapon.barrels || [];
      const allBarrels = [{ name: '无', isDefault: true, index: 0 }, ...barrels.map((b, i) => ({ ...b, index: i + 1 }))];
      const longestBarrelIndex = this.getLongestBarrelIndex(weapon);
      const previewBarrel = longestBarrelIndex > 0 && barrels[longestBarrelIndex - 1] ? barrels[longestBarrelIndex - 1] : null;
      const previewBarrelName = previewBarrel ? previewBarrel.name : '无';
      const hasBarrel = previewBarrel !== null;

      if (!isWeaponExpanded) {
        const previewBarrelIdx = longestBarrelIndex;
        const stateKey = `${wIdx}_${previewBarrelIdx}`;
        const selectedMuzzleIdx = muzzleSelState[stateKey] !== undefined ? muzzleSelState[stateKey] : defaultMuzzle;
        const selectedMuzzle = muzzles[selectedMuzzleIdx] || muzzles[0];
        const precision = precisionSelState[stateKey] !== undefined ? precisionSelState[stateKey] : defaultPrecision;

        const result = this.calculateAttachedStats(weapon, previewBarrel, selectedMuzzle, precision);
        const baseResult = this.calculateAttachedStats(weapon, null, muzzles[0], 0.09);
        const hasChanges = this.hasAttachmentChanges(result, baseResult);

        const diffVelocity = result.velocity - baseResult.velocity;
        const diffRanges = result.ranges.map((r, i) => {
          const base = baseResult.ranges[i] || 0;
          const diff = r - base;
          return diff === 0 ? '' : (diff > 0 ? `+${diff}` : `${diff}`);
        }).filter(d => d !== '').join(',');

        const muzzleOptions = muzzles.map((m, mIdx) => {
          const selected = mIdx === selectedMuzzleIdx ? 'selected' : '';
          return `<option value="${mIdx}" ${selected}>${this.escapeHtml(m.name)}</option>`;
        }).join('');

        const weaponDisplay = `
          <span class="tree-toggle" data-weapon="${wIdx}" data-type="weapon" style="cursor:pointer;">▶</span>
          ${this.escapeHtml(weapon.name)}
        `;

        html += `
          <tr class="weapon-row preview-row" data-weapon-index="${wIdx}" data-barrel-index="${previewBarrelIdx}" 
              style="cursor:pointer;" onclick="(function(e){e.stopPropagation(); 
                if(typeof window._onAttachmentTreeToggle === 'function') { 
                  window._onAttachmentTreeToggle(${wIdx}, null, 'weapon'); 
                }
              }).call(this, event)">
            <td style="text-align:left;padding-left:8px;font-weight:600;">
              ${weaponDisplay}
            </td>
            <td style="padding-left:8px;font-weight:500;font-size:0.85rem;">
              ${this.escapeHtml(previewBarrelName)}
              ${hasBarrel ? `<span style="font-size:0.7rem;color:#1565c0;margin-left:6px;">(射程最长)</span>` : ''}
            </td>
            <td>
              <select class="attachment-muzzle-select" data-weapon="${wIdx}" data-barrel="${previewBarrelIdx}" 
                      style="width:100%;padding:3px 4px;border:1px solid #ddd;border-radius:3px;background:#fff;font-size:0.85rem;cursor:pointer;outline:none;max-width:120px;">
                ${muzzleOptions}
              </select>
            </td>
            <td class="${hasChanges.rof ? 'highlight-green' : ''}">${result.rof}</td>
            <td class="${hasChanges.velocity ? 'highlight-green' : ''}">
              ${result.velocity}
              ${diffVelocity !== 0 ? `<span style="font-size:0.7rem;color:#1565c0;margin-left:4px;">(${diffVelocity > 0 ? '+' : ''}${diffVelocity})</span>` : ''}
            </td>
            <td class="${hasChanges.ranges ? 'highlight-green' : ''}">
              ${this.formatRangesForDisplay(result.ranges)}
              ${diffRanges ? `<span style="font-size:0.7rem;color:#1565c0;margin-left:4px;">(${diffRanges})</span>` : ''}
            </td>
            <td class="${hasChanges.flesh ? 'highlight-green' : ''}">${result.flesh}</td>
            <td class="${hasChanges.armor ? 'highlight-green' : ''}">${result.armor}</td>
            <td class="${hasChanges.decays ? 'highlight-green' : ''}">${this.formatDecaysForDisplay(result.decays)}</td>
            <td class="${hasChanges.mult ? 'highlight-green' : ''}">${this.formatMultipliersForDisplay(result.mult)}</td>
            <td>
              <div class="precision-container">
                <input type="range" class="attachment-precision-slider" 
                       data-weapon="${wIdx}" data-barrel="${previewBarrelIdx}"
                       min="-0.09" max="0.09" step="0.01" value="${precision}" />
                <span class="precision-value">${Math.round(precision * 100)}%</span>
              </div>
            </td>
            <td>
              <button class="edit-weapon-btn" data-weapon="${wIdx}" title="编辑枪管">🔧</button>
            </td>
          </tr>
        `;
        return;
      }

      // ========== 武器展开 ==========
      html += `
        <tr class="weapon-header-row" data-weapon-index="${wIdx}">
          <td colspan="12" style="background:#f0f4f8;font-weight:bold;cursor:pointer;text-align:left;padding:6px 12px;">
            <span class="tree-toggle" data-weapon="${wIdx}" data-type="weapon">▼</span>
            ${this.escapeHtml(weapon.name)}
            <span style="font-weight:normal;color:#999;font-size:0.8rem;margin-left:8px;">(${allBarrels.length} 枪管)</span>
          </td>
        </tr>
      `;

      allBarrels.forEach((barrel, bIdx) => {
        const barrelName = barrel.isDefault ? '无' : (barrel.name || `枪管${bIdx}`);
        const stateKey = `${wIdx}_${bIdx}`;
        const selectedMuzzleIdx = muzzleSelState[stateKey] !== undefined ? muzzleSelState[stateKey] : defaultMuzzle;
        const selectedMuzzle = muzzles[selectedMuzzleIdx] || muzzles[0];
        const precision = precisionSelState[stateKey] !== undefined ? precisionSelState[stateKey] : defaultPrecision;

        const result = this.calculateAttachedStats(weapon, barrel.isDefault ? null : barrel, selectedMuzzle, precision);
        const baseResult = this.calculateAttachedStats(weapon, null, muzzles[0], 0.09);
        const hasChanges = this.hasAttachmentChanges(result, baseResult);

        const diffVelocity = result.velocity - baseResult.velocity;
        const diffRanges = result.ranges.map((r, i) => {
          const base = baseResult.ranges[i] || 0;
          const diff = r - base;
          return diff === 0 ? '' : (diff > 0 ? `+${diff}` : `${diff}`);
        }).filter(d => d !== '').join(',');
        const diffFlesh = result.flesh - baseResult.flesh;
        const diffArmor = result.armor - baseResult.armor;

        const isLongest = bIdx === longestBarrelIndex && !barrel.isDefault;

        const muzzleOptions = muzzles.map((m, mIdx) => {
          const selected = mIdx === selectedMuzzleIdx ? 'selected' : '';
          return `<option value="${mIdx}" ${selected}>${this.escapeHtml(m.name)}</option>`;
        }).join('');

        html += `
          <tr class="barrel-row" data-weapon-index="${wIdx}" data-barrel-index="${bIdx}">
            <td></td>
            <td style="padding-left:28px;font-weight:500;font-size:0.85rem;">
              ${this.escapeHtml(barrelName)}
              ${isLongest ? `<span style="font-size:0.7rem;color:#1565c0;margin-left:6px;">(射程最长)</span>` : ''}
            </td>
            <td>
              <select class="attachment-muzzle-select" data-weapon="${wIdx}" data-barrel="${bIdx}" 
                      style="width:100%;padding:3px 4px;border:1px solid #ddd;border-radius:3px;background:#fff;font-size:0.85rem;cursor:pointer;outline:none;max-width:120px;">
                ${muzzleOptions}
              </select>
            </td>
            <td class="${hasChanges.rof ? 'highlight-green' : ''}">${result.rof}</td>
            <td class="${hasChanges.velocity ? 'highlight-green' : ''}">
              ${result.velocity}
              ${diffVelocity !== 0 ? `<span style="font-size:0.7rem;color:#1565c0;margin-left:4px;">(${diffVelocity > 0 ? '+' : ''}${diffVelocity})</span>` : ''}
            </td>
            <td class="${hasChanges.ranges ? 'highlight-green' : ''}">
              ${this.formatRangesForDisplay(result.ranges)}
              ${diffRanges ? `<span style="font-size:0.7rem;color:#1565c0;margin-left:4px;">(${diffRanges})</span>` : ''}
            </td>
            <td class="${hasChanges.flesh ? 'highlight-green' : ''}">
              ${result.flesh}
              ${diffFlesh !== 0 ? `<span style="font-size:0.7rem;color:#1565c0;margin-left:4px;">(${diffFlesh > 0 ? '+' : ''}${diffFlesh})</span>` : ''}
            </td>
            <td class="${hasChanges.armor ? 'highlight-green' : ''}">
              ${result.armor}
              ${diffArmor !== 0 ? `<span style="font-size:0.7rem;color:#1565c0;margin-left:4px;">(${diffArmor > 0 ? '+' : ''}${diffArmor})</span>` : ''}
            </td>
            <td class="${hasChanges.decays ? 'highlight-green' : ''}">${this.formatDecaysForDisplay(result.decays)}</td>
            <td class="${hasChanges.mult ? 'highlight-green' : ''}">${this.formatMultipliersForDisplay(result.mult)}</td>
            <td>
              <div class="precision-container">
                <input type="range" class="attachment-precision-slider" 
                       data-weapon="${wIdx}" data-barrel="${bIdx}"
                       min="-0.09" max="0.09" step="0.01" value="${precision}" />
                <span class="precision-value">${Math.round(precision * 100)}%</span>
              </div>
            </td>
            <td>
              <button class="edit-weapon-btn" data-weapon="${wIdx}" title="编辑枪管">🔧</button>
            </td>
          </tr>
        `;
      });
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    return html;
  }

  /**
   * 绑定配件数据Tab的事件
   */
  bindAttachmentTabEvents(onMuzzleChange, onPrecisionChange, onEditBarrel, onTreeToggle) {
    if (typeof onTreeToggle === 'function') {
      window._onAttachmentTreeToggle = onTreeToggle;
    } else {
      window._onAttachmentTreeToggle = null;
    }

    document.querySelectorAll('#attachmentTabContent .tree-toggle[data-type="weapon"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const weaponIdx = parseInt(el.dataset.weapon);
        if (typeof window._onAttachmentTreeToggle === 'function') {
          window._onAttachmentTreeToggle(weaponIdx, null, 'weapon');
        }
      });
    });

    document.querySelectorAll('#attachmentTabContent .weapon-header-row td').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.tree-toggle') || e.target.closest('button') || e.target.closest('select') || e.target.closest('input')) {
          return;
        }
        const row = e.currentTarget.closest('.weapon-header-row');
        if (row) {
          const weaponIdx = parseInt(row.dataset.weaponIndex);
          const toggle = row.querySelector('.tree-toggle');
          if (toggle && typeof window._onAttachmentTreeToggle === 'function') {
            window._onAttachmentTreeToggle(weaponIdx, null, 'weapon');
          }
        }
      });
    });

    document.querySelectorAll('#attachmentTabContent .weapon-row.preview-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('select') || e.target.closest('button') || e.target.closest('input')) {
          return;
        }
        const weaponIdx = parseInt(row.dataset.weaponIndex);
        if (typeof window._onAttachmentTreeToggle === 'function') {
          window._onAttachmentTreeToggle(weaponIdx, null, 'weapon');
        }
      });
    });

    document.querySelectorAll('#attachmentTabContent .attachment-muzzle-select').forEach(select => {
      select.addEventListener('change', (e) => {
        e.stopPropagation();
        const weaponIdx = parseInt(e.target.dataset.weapon);
        const barrelIdx = parseInt(e.target.dataset.barrel);
        const value = parseInt(e.target.value);
        if (!isNaN(weaponIdx) && !isNaN(barrelIdx) && typeof onMuzzleChange === 'function') {
          onMuzzleChange(weaponIdx, barrelIdx, value);
        }
      });
    });

    document.querySelectorAll('#attachmentTabContent .attachment-precision-slider').forEach(slider => {
      slider.addEventListener('input', (e) => {
        e.stopPropagation();
        const weaponIdx = parseInt(e.target.dataset.weapon);
        const barrelIdx = parseInt(e.target.dataset.barrel);
        const value = parseFloat(e.target.value);
        const valueSpan = e.target.parentElement.querySelector('.precision-value');
        if (valueSpan) {
          valueSpan.textContent = Math.round(value * 100) + '%';
        }
        if (typeof onPrecisionChange === 'function') {
          onPrecisionChange(weaponIdx, barrelIdx, value);
        }
      });
    });

    document.querySelectorAll('#attachmentTabContent .edit-weapon-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const weaponIdx = parseInt(e.target.dataset.weapon);
        if (!isNaN(weaponIdx) && typeof onEditBarrel === 'function') {
          onEditBarrel(weaponIdx);
        }
      });
    });
  }

  // ==================== Tab3: 价格数据 ====================

  /**
   * 构建子弹下拉选项 - 按口径分组
   * @param {Array} allowedBullets - 允许的口径列表
   * @param {string} selected - 当前选中的子弹key
   * @param {number} selectedLevel - 当前选中的等级
   * @param {Function} getPriceFn - 获取价格函数（可选）
   * @returns {string} 选项HTML
   */
  buildBulletOptionsWithLevel(allowedBullets, selected, selectedLevel = null, getPriceFn = null) {
    if (!allowedBullets || allowedBullets.length === 0) {
      return `<option value="">无可用子弹</option>`;
    }

    let optionsHtml = '';

    // 常规口径
    const calibers = allowedBullets.filter(b => !isSpecialBullet(b));
    const specials = allowedBullets.filter(b => isSpecialBullet(b));

    if (calibers.length > 0) {
      optionsHtml += `<optgroup label="常规口径">`;
      calibers.forEach(caliber => {
        // 获取该口径的所有等级
        const levels = [1, 2, 3, 4, 5];
        levels.forEach(level => {
          const levelData = getBulletLevelData(caliber, level);
          if (!levelData) return;
          // 使用传入的价格获取函数或默认的 getBulletPrice
          const priceFn = getPriceFn || getBulletPrice;
          const price = priceFn(`${caliber}_${level}`);
          const displayName = `${getBulletDisplayName(caliber, level)}`;
          const selectedAttr = (selected === caliber && selectedLevel === level) ? 'selected' : '';
          optionsHtml += `
            <option value="${caliber}" data-level="${level}" ${selectedAttr}>
              ${displayName} (${this.formatCurrency(price)})
            </option>
          `;
        });
      });
      optionsHtml += `</optgroup>`;
    }

    // 特殊子弹
    if (specials.length > 0) {
      optionsHtml += `<optgroup label="特殊子弹">`;
      specials.forEach(key => {
        const data = getSpecialBulletData(key);
        if (!data) return;
        const priceFn = getPriceFn || getBulletPrice;
        const price = priceFn(key);
        const displayName = data.name || key;
        const selectedAttr = (selected === key) ? 'selected' : '';
        optionsHtml += `
          <option value="${key}" ${selectedAttr}>
            ${displayName} (${this.formatCurrency(price)})
          </option>
        `;
      });
      optionsHtml += `</optgroup>`;
    }

    return optionsHtml;
  }

  /**
   * 渲染价格数据Tab
   * @param {Array} weapons - 武器数据
   * @param {Array} muzzles - 枪口数据
   * @param {Object} params - 页面参数
   * @param {number} defaultHitRate - 默认命中率
   * @param {Function} onEditConfig - 编辑配置回调
   * @param {Function} onAddConfig - 新增配置回调
   * @param {Function} onRemoveConfig - 删除配置回调
   * @param {Function} onCopyCode - 复制改枪码回调
   * @param {Function} onEditHitRate - 编辑命中率回调
   * @param {Function} onTreeToggle - 树状展开回调
   * @param {Function} onBulletChange - 子弹切换回调
   * @param {Function} onMuzzleChange - 枪口切换回调
   * @param {Object} expandedState - 展开状态
   * @param {Object} muzzleState - 枪口状态
   * @param {Function} getWeaponPriceFn - 获取武器价格函数（从 pricingManager）
   * @returns {string} HTML字符串
   */
  renderPriceTab(weapons, muzzles, params = {}, defaultHitRate = 0.80,
    onEditConfig = null, onAddConfig = null, onRemoveConfig = null,
    onCopyCode = null, onEditHitRate = null, onTreeToggle = null,
    onBulletChange = null, onMuzzleChange = null, expandedState = null, muzzleState = null,
    getWeaponPriceFn = null) {

    if (!weapons || weapons.length === 0) {
      return `
        <div class="empty-state">
          <p style="color:#999;text-align:center;padding:20px 0;">暂无武器数据</p>
        </div>
      `;
    }

    const expandState = expandedState || {};
    const muzzleSelState = muzzleState || {};
    const defaultMuzzle = 0;

    let html = `
      <div id="priceTabContent">
        <div class="tab-table-wrapper">
          <table class="price-tab-table">
            <thead>
              <tr>
                <th style="min-width:70px;">武器</th>
                <th style="min-width:100px;">枪管</th>
                <th style="min-width:80px;">枪口</th>
                <th style="min-width:100px;">改枪码</th>
                <th style="min-width:70px;">本体价格</th>
                <th style="min-width:120px;">命中率</th>
                <th style="min-width:100px;">子弹</th>
                <th style="min-width:70px;">弹药单价</th>
                <th style="min-width:65px;">携带数量</th>
                <th style="min-width:80px;">弹药总价</th>
                <th style="min-width:85px;">武器总价</th>
                <th style="min-width:110px;">操作</th>
              </tr>
            </thead>
            <tbody>
    `;

    weapons.forEach((weapon, wIdx) => {
      const isWeaponExpanded = expandState[`price_weapon_${wIdx}`] === true;
      const configs = weapon.configs || [];
      const barrels = weapon.barrels || [];
      const allBarrels = [{ name: '无', isDefault: true, index: 0 }, ...barrels.map((b, i) => ({ ...b, index: i + 1 }))];
      const allowedBullets = weapon.allowedBullets || [];

      if (configs.length === 0) {
        html += `
          <tr class="price-empty-row" data-weapon-index="${wIdx}">
            <td colspan="12" style="text-align:center;color:#999;padding:8px 0;">
              ${this.escapeHtml(weapon.name)} - 暂无改枪配置
            </td>
          </tr>
        `;
        return;
      }

      const previewConfig = configs[0];
      const previewConfigIndex = 0;
      const previewBarrelName = this.getBarrelName(weapon, previewConfig.selectedBarrel || 0);
      const previewMuzzleName = this.getMuzzleName(muzzles, previewConfig.selectedMuzzle || 0);

      if (!isWeaponExpanded) {
        const hitRateDisplay = this.getHitRateDisplayText(previewConfig.hitRatePoints, defaultHitRate);
        // 使用新的子弹选项构建
        const bulletOptions = this.buildBulletOptionsWithLevel(
          allowedBullets,
          previewConfig.bulletType,
          previewConfig.bulletLevel
        );
        
        // 获取子弹价格 - 使用 pricingManager
        const bulletPrice = this._getBulletPrice(previewConfig.bulletType, previewConfig.bulletLevel);
        const ammoTotal = bulletPrice * (previewConfig.ammoCount || 0);
        
        // 获取武器价格 - 使用 pricingManager
        const weaponPrice = this._getWeaponPrice(getWeaponPriceFn, weapon.name, previewConfig.id, 0);
        const weaponTotal = weaponPrice + ammoTotal;

        const weaponDisplay = `
          <span class="price-tree-toggle" data-weapon="${wIdx}" data-type="price-weapon" style="cursor:pointer;">▶</span>
          ${this.escapeHtml(weapon.name)}
          <span style="font-weight:normal;color:#999;font-size:0.7rem;margin-left:6px;">(${configs.length} 配置)</span>
        `;

        html += `
          <tr class="price-weapon-row preview-row" data-weapon-index="${wIdx}" 
              style="cursor:pointer;" onclick="(function(e){e.stopPropagation(); 
                if(typeof window._onPriceTreeToggle === 'function') { 
                  window._onPriceTreeToggle(${wIdx}, null, null, 'price-weapon'); 
                }
              }).call(this, event)">
            <td style="text-align:left;padding-left:8px;font-weight:600;">
              ${weaponDisplay}
            </td>
            <td style="font-size:0.85rem;color:#333;">${this.escapeHtml(previewBarrelName)}</td>
            <td style="font-size:0.85rem;color:#333;">${this.escapeHtml(previewMuzzleName)}</td>
            <td>
              <input type="text" class="price-code-input" data-weapon="${wIdx}" data-config="${previewConfigIndex}" 
                     value="${this.escapeHtml(previewConfig.code || '')}" 
                     style="width:90px;border:1px solid #ddd;border-radius:3px;padding:2px 4px;font-size:inherit;text-align:center;" 
                     onclick="event.stopPropagation();" />
            </td>
            <td>
              <input type="number" class="price-input" data-weapon="${wIdx}" data-config="${previewConfigIndex}" 
                     value="${weaponPrice}" min="0" step="1000" 
                     style="width:70px;border:1px solid #ddd;border-radius:3px;padding:2px 4px;font-size:inherit;text-align:right;" 
                     onclick="event.stopPropagation();" />
            </td>
            <td>
              <button class="hitrate-edit-btn" data-weapon="${wIdx}" data-config="${previewConfigIndex}" 
                      title="编辑命中率曲线" onclick="event.stopPropagation();">
                ${hitRateDisplay}
              </button>
            </td>
            <td>
              <select class="price-bullet-select" data-weapon="${wIdx}" data-config="${previewConfigIndex}" 
                      style="width:100px;border:1px solid #ddd;border-radius:3px;padding:2px 4px;font-size:inherit;" 
                      onclick="event.stopPropagation();">
                ${bulletOptions}
              </select>
            </td>
            <td class="bullet-price-display-cell">${this.formatCurrency(bulletPrice)}</td>
            <td>
              <input type="number" class="price-ammo-input" data-weapon="${wIdx}" data-config="${previewConfigIndex}" 
                     value="${previewConfig.ammoCount || 0}" min="0" step="10" 
                     style="width:55px;border:1px solid #ddd;border-radius:3px;padding:2px 4px;font-size:inherit;text-align:right;" 
                     onclick="event.stopPropagation();" />
            </td>
            <td class="ammo-total-display">${this.formatCurrency(ammoTotal)}</td>
            <td class="weapon-total-display" style="font-weight:bold;color:#1565c0;">${this.formatCurrency(weaponTotal)}</td>
            <td>
              <button class="copy-code-btn" data-weapon="${wIdx}" data-config="${previewConfigIndex}" 
                      title="复制改枪码" onclick="event.stopPropagation();">📋</button>
              <button class="add-config-btn" data-weapon="${wIdx}" data-config="${previewConfigIndex}" 
                      title="新增改枪配置" onclick="event.stopPropagation();">+</button>
              <button class="remove-config-btn" data-weapon="${wIdx}" data-config="${previewConfigIndex}" 
                      title="删除改枪配置" ${configs.length <= 1 ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''} 
                      onclick="event.stopPropagation();">-</button>
            </td>
          </tr>
        `;
        return;
      }

      // ========== 武器展开 ==========
      html += `
        <tr class="price-weapon-header-row" data-weapon-index="${wIdx}">
          <td colspan="12" style="background:#f0f4f8;font-weight:bold;cursor:pointer;text-align:left;padding:6px 12px;">
            <span class="price-tree-toggle" data-weapon="${wIdx}" data-type="price-weapon">▼</span>
            ${this.escapeHtml(weapon.name)}
            <span style="font-weight:normal;color:#999;font-size:0.8rem;margin-left:8px;">
              (${allBarrels.length} 枪管, ${configs.length} 配置)
            </span>
          </td>
        </tr>
      `;

      allBarrels.forEach((barrel, bIdx) => {
        const barrelName = barrel.isDefault ? '无' : (barrel.name || `枪管${bIdx}`);
        const barrelIndex = barrel.index;

        const matchedConfigs = configs.filter((config) => {
          const configBarrel = config.selectedBarrel || 0;
          return configBarrel === barrelIndex;
        });

        const stateKey = `${wIdx}_${bIdx}`;
        const selectedMuzzleIdx = muzzleSelState[stateKey] !== undefined ? muzzleSelState[stateKey] : defaultMuzzle;

        const muzzleOptions = muzzles.map((m, mIdx) => {
          const selected = mIdx === selectedMuzzleIdx ? 'selected' : '';
          return `<option value="${mIdx}" ${selected}>${this.escapeHtml(m.name)}</option>`;
        }).join('');

        if (matchedConfigs.length === 0) {
          // 空配置行
          const emptyConfigIdx = -1;
          const defaultBullet = allowedBullets.length > 0 ? allowedBullets[0] : null;
          const defaultLevel = params.bulletLevel || 4;
          const defaultAmmoCount = this.getDefaultAmmoCount(weapon.type);

          // 获取默认子弹价格
          let bulletPrice = 0;
          let bulletOptions = '';
          if (defaultBullet) {
            bulletPrice = this._getBulletPrice(defaultBullet, defaultLevel);
            bulletOptions = this.buildBulletOptionsWithLevel(allowedBullets, defaultBullet, defaultLevel);
          } else {
            bulletOptions = `<option value="">无可用子弹</option>`;
          }

          const ammoTotal = bulletPrice * defaultAmmoCount;
          // 空配置价格默认为0
          const weaponTotal = 0 + ammoTotal;
          const hitRateDisplay = this.getHitRateDisplayText([], defaultHitRate);

          html += `
            <tr class="price-config-row" data-weapon="${wIdx}" data-barrel="${bIdx}" data-config="${emptyConfigIdx}" data-is-empty="true">
              <td style="padding-left:12px;font-size:0.8rem;color:#999;">
                ${this.escapeHtml(weapon.name)}-${configs.length + 1} (新)
              </td>
              <td style="padding-left:28px;font-weight:500;font-size:0.85rem;">
                ${this.escapeHtml(barrelName)}
              </td>
              <td>
                <select class="price-muzzle-select" data-weapon="${wIdx}" data-barrel="${bIdx}" 
                        style="width:100%;padding:3px 4px;border:1px solid #ddd;border-radius:3px;background:#fff;font-size:0.85rem;cursor:pointer;outline:none;max-width:120px;">
                  ${muzzleOptions}
                </select>
              </td>
              <td>
                <input type="text" class="price-code-input price-code-input-empty" data-weapon="${wIdx}" data-barrel="${bIdx}" data-config="${emptyConfigIdx}"
                       value="" placeholder="输入改枪码" 
                       style="width:90px;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;font-size:inherit;text-align:center;background:#fafffa;" />
              </td>
              <td>
                <input type="number" class="price-input price-input-empty" data-weapon="${wIdx}" data-barrel="${bIdx}" data-config="${emptyConfigIdx}"
                       value="0" min="0" step="1000" 
                       style="width:70px;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;font-size:inherit;text-align:right;background:#fafffa;" />
              </td>
              <td>
                <button class="hitrate-edit-btn hitrate-edit-btn-empty" data-weapon="${wIdx}" data-config="${emptyConfigIdx}" 
                        title="编辑命中率曲线" style="border-color:#4caf50;">
                  ${hitRateDisplay}
                </button>
              </td>
              <td>
                <select class="price-bullet-select price-bullet-select-empty" data-weapon="${wIdx}" data-barrel="${bIdx}" data-config="${emptyConfigIdx}"
                        style="width:100px;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;font-size:inherit;background:#fafffa;">
                  ${bulletOptions}
                </select>
              </td>
              <td class="bullet-price-display-cell">${this.formatCurrency(bulletPrice)}</td>
              <td>
                <input type="number" class="price-ammo-input price-ammo-input-empty" data-weapon="${wIdx}" data-barrel="${bIdx}" data-config="${emptyConfigIdx}"
                       value="${defaultAmmoCount}" min="0" step="10" 
                       style="width:55px;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;font-size:inherit;text-align:right;background:#fafffa;" />
              </td>
              <td class="ammo-total-display">${this.formatCurrency(ammoTotal)}</td>
              <td class="weapon-total-display" style="font-weight:bold;color:#1565c0;">${this.formatCurrency(weaponTotal)}</td>
              <td>
                <button class="add-config-btn add-config-btn-empty" data-weapon="${wIdx}" data-barrel="${bIdx}" 
                        title="新增改枪配置到该枪管" style="background:#4caf50;">+</button>
                <span style="font-size:0.7rem;color:#999;">(空配置)</span>
              </td>
            </tr>
          `;
          return;
        }

        // 有匹配的配置：每个配置占一行
        matchedConfigs.forEach((config, configIdx) => {
          const configIndex = configs.indexOf(config);
          const hitRateDisplay = this.getHitRateDisplayText(config.hitRatePoints, defaultHitRate);

          // 使用新的子弹选项构建
          const bulletOptions = this.buildBulletOptionsWithLevel(
            allowedBullets,
            config.bulletType,
            config.bulletLevel
          );

          // 获取子弹价格 - 使用 pricingManager
          const bulletPrice = this._getBulletPrice(config.bulletType, config.bulletLevel);
          const ammoTotal = bulletPrice * (config.ammoCount || 0);
          
          // 获取武器价格 - 使用 pricingManager
          const weaponPrice = this._getWeaponPrice(getWeaponPriceFn, weapon.name, config.id, 0);
          const weaponTotal = weaponPrice + ammoTotal;

          // 显示武器名称-配置序号（从1开始）
          const configDisplayNumber = configIndex + 1;

          html += `
            <tr class="price-config-row" data-weapon="${wIdx}" data-barrel="${bIdx}" data-config="${configIndex}">
              <td style="padding-left:12px;font-size:0.8rem;color:#666;">
                ${this.escapeHtml(weapon.name)}-${configDisplayNumber}
              </td>
              <td style="padding-left:28px;font-weight:500;font-size:0.85rem;color:#666;">
                ${this.escapeHtml(barrelName)}
              </td>
              <td>
                <select class="price-muzzle-select" data-weapon="${wIdx}" data-barrel="${bIdx}" 
                        style="width:100%;padding:3px 4px;border:1px solid #ddd;border-radius:3px;background:#fff;font-size:0.85rem;cursor:pointer;outline:none;max-width:120px;">
                  ${muzzleOptions}
                </select>
              </td>
              <td>
                <input type="text" class="price-code-input" data-weapon="${wIdx}" data-config="${configIndex}" 
                       value="${this.escapeHtml(config.code || '')}" 
                       style="width:90px;border:1px solid #ddd;border-radius:3px;padding:2px 4px;font-size:inherit;text-align:center;" />
              </td>
              <td>
                <input type="number" class="price-input" data-weapon="${wIdx}" data-config="${configIndex}" 
                       value="${weaponPrice}" min="0" step="1000" 
                       style="width:70px;border:1px solid #ddd;border-radius:3px;padding:2px 4px;font-size:inherit;text-align:right;" />
              </td>
              <td>
                <button class="hitrate-edit-btn" data-weapon="${wIdx}" data-config="${configIndex}" title="编辑命中率曲线">
                  ${hitRateDisplay}
                </button>
              </td>
              <td>
                <select class="price-bullet-select" data-weapon="${wIdx}" data-config="${configIndex}" 
                        style="width:100px;border:1px solid #ddd;border-radius:3px;padding:2px 4px;font-size:inherit;">
                  ${bulletOptions}
                </select>
              </td>
              <td class="bullet-price-display-cell">${this.formatCurrency(bulletPrice)}</td>
              <td>
                <input type="number" class="price-ammo-input" data-weapon="${wIdx}" data-config="${configIndex}" 
                       value="${config.ammoCount || 0}" min="0" step="10" 
                       style="width:55px;border:1px solid #ddd;border-radius:3px;padding:2px 4px;font-size:inherit;text-align:right;" />
              </td>
              <td class="ammo-total-display">${this.formatCurrency(ammoTotal)}</td>
              <td class="weapon-total-display" style="font-weight:bold;color:#1565c0;">${this.formatCurrency(weaponTotal)}</td>
              <td>
                <button class="copy-code-btn" data-weapon="${wIdx}" data-config="${configIndex}" title="复制改枪码">📋</button>
                <button class="add-config-btn" data-weapon="${wIdx}" data-config="${configIndex}" title="新增改枪配置">+</button>
                <button class="remove-config-btn" data-weapon="${wIdx}" data-config="${configIndex}" 
                        title="删除改枪配置" ${configs.length <= 1 ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}>-</button>
              </td>
            </tr>
          `;
        });
      });
    });

    html += `
            </tbody>
          </table>
        </div>
        <div class="price-tab-actions">
          <button id="addConfigGlobalBtn" class="btn-primary">➕ 新增改枪配置</button>
          <span style="font-size:0.8rem;color:#999;margin-left:12px;">为当前选中的武器新增改枪配置</span>
        </div>
      </div>
    `;

    return html;
  }

  /**
   * 获取子弹价格（内部辅助方法）
   * @private
   */
  _getBulletPrice(bulletType, bulletLevel) {
    if (!bulletType) return 0;
    if (isSpecialBullet(bulletType)) {
      return getBulletPrice(bulletType);
    }
    const key = `${bulletType}_${bulletLevel || 4}`;
    return getBulletPrice(key);
  }

  /**
   * 获取武器价格（内部辅助方法）
   * @private
   */
  _getWeaponPrice(getWeaponPriceFn, weaponName, configId, defaultPrice) {
    if (typeof getWeaponPriceFn === 'function') {
      return getWeaponPriceFn(weaponName, configId) || defaultPrice;
    }
    return defaultPrice;
  }

  /**
   * 绑定价格数据Tab的事件
   */
  bindPriceTabEvents(onEditConfig, onAddConfig, onRemoveConfig, onCopyCode, onEditHitRate, onTreeToggle, onBulletChange, onMuzzleChange) {
    if (typeof onTreeToggle === 'function') {
      window._onPriceTreeToggle = onTreeToggle;
    } else {
      window._onPriceTreeToggle = null;
    }

    // 树状展开/收起
    document.querySelectorAll('#priceTabContent .price-tree-toggle[data-type="price-weapon"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const weaponIdx = parseInt(el.dataset.weapon);
        if (typeof window._onPriceTreeToggle === 'function') {
          window._onPriceTreeToggle(weaponIdx, null, null, 'price-weapon');
        }
      });
    });

    document.querySelectorAll('#priceTabContent .price-weapon-header-row td').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.price-tree-toggle') || e.target.closest('button') || e.target.closest('select') || e.target.closest('input')) {
          return;
        }
        const row = e.currentTarget.closest('.price-weapon-header-row');
        if (row) {
          const weaponIdx = parseInt(row.dataset.weaponIndex);
          const toggle = row.querySelector('.price-tree-toggle');
          if (toggle && typeof window._onPriceTreeToggle === 'function') {
            window._onPriceTreeToggle(weaponIdx, null, null, 'price-weapon');
          }
        }
      });
    });

    document.querySelectorAll('#priceTabContent .price-weapon-row.preview-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('select') || e.target.closest('button') || e.target.closest('input')) {
          return;
        }
        const weaponIdx = parseInt(row.dataset.weaponIndex);
        if (typeof window._onPriceTreeToggle === 'function') {
          window._onPriceTreeToggle(weaponIdx, null, null, 'price-weapon');
        }
      });
    });

    // 枪口下拉变化
    document.querySelectorAll('#priceTabContent .price-muzzle-select').forEach(select => {
      select.addEventListener('change', (e) => {
        e.stopPropagation();
        const weaponIdx = parseInt(e.target.dataset.weapon);
        const barrelIdx = parseInt(e.target.dataset.barrel);
        const value = parseInt(e.target.value);
        if (!isNaN(weaponIdx) && !isNaN(barrelIdx) && typeof onMuzzleChange === 'function') {
          onMuzzleChange(weaponIdx, barrelIdx, value);
        }
      });
    });

    // 价格输入
    document.querySelectorAll('#priceTabContent .price-input:not(.price-input-empty)').forEach(input => {
      input.addEventListener('change', (e) => {
        e.stopPropagation();
        const weaponIdx = parseInt(e.target.dataset.weapon);
        const configIdx = parseInt(e.target.dataset.config);
        const value = parseFloat(e.target.value) || 0;
        if (!isNaN(weaponIdx) && !isNaN(configIdx) && typeof onEditConfig === 'function') {
          onEditConfig(weaponIdx, configIdx, 'price', value);
          this.updatePriceRowTotal(e.target.closest('tr'));
        }
      });
    });

    // 价格输入（空配置）
    document.querySelectorAll('#priceTabContent .price-input-empty').forEach(input => {
      input.addEventListener('change', (e) => {
        e.stopPropagation();
        const weaponIdx = parseInt(e.target.dataset.weapon);
        const barrelIdx = parseInt(e.target.dataset.barrel);
        this.handleEmptyConfigCreation(e.target.closest('tr'), weaponIdx, barrelIdx, onAddConfig);
      });
    });

    // 改枪码输入
    document.querySelectorAll('#priceTabContent .price-code-input:not(.price-code-input-empty)').forEach(input => {
      input.addEventListener('change', (e) => {
        e.stopPropagation();
        const weaponIdx = parseInt(e.target.dataset.weapon);
        const configIdx = parseInt(e.target.dataset.config);
        const value = e.target.value.trim();
        if (!isNaN(weaponIdx) && !isNaN(configIdx) && typeof onEditConfig === 'function') {
          onEditConfig(weaponIdx, configIdx, 'code', value);
        }
      });
    });

    // 改枪码输入（空配置）
    document.querySelectorAll('#priceTabContent .price-code-input-empty').forEach(input => {
      input.addEventListener('change', (e) => {
        e.stopPropagation();
        const weaponIdx = parseInt(e.target.dataset.weapon);
        const barrelIdx = parseInt(e.target.dataset.barrel);
        this.handleEmptyConfigCreation(e.target.closest('tr'), weaponIdx, barrelIdx, onAddConfig);
      });
    });

    // 携带数量输入
    document.querySelectorAll('#priceTabContent .price-ammo-input:not(.price-ammo-input-empty)').forEach(input => {
      input.addEventListener('change', (e) => {
        e.stopPropagation();
        const weaponIdx = parseInt(e.target.dataset.weapon);
        const configIdx = parseInt(e.target.dataset.config);
        const value = parseFloat(e.target.value) || 0;
        if (!isNaN(weaponIdx) && !isNaN(configIdx) && typeof onEditConfig === 'function') {
          onEditConfig(weaponIdx, configIdx, 'ammoCount', value);
          this.updatePriceRowTotal(e.target.closest('tr'));
        }
      });
    });

    // 携带数量输入（空配置）
    document.querySelectorAll('#priceTabContent .price-ammo-input-empty').forEach(input => {
      input.addEventListener('change', (e) => {
        e.stopPropagation();
        const weaponIdx = parseInt(e.target.dataset.weapon);
        const barrelIdx = parseInt(e.target.dataset.barrel);
        this.handleEmptyConfigCreation(e.target.closest('tr'), weaponIdx, barrelIdx, onAddConfig);
      });
    });

    // 子弹下拉 - 使用新的处理方式，同时传递选中的等级
    document.querySelectorAll('#priceTabContent .price-bullet-select:not(.price-bullet-select-empty)').forEach(select => {
      select.addEventListener('change', (e) => {
        e.stopPropagation();
        const weaponIdx = parseInt(e.target.dataset.weapon);
        const configIdx = parseInt(e.target.dataset.config);
        const value = e.target.value;
        // 获取选中的等级
        const selectedOption = e.target.options[e.target.selectedIndex];
        const level = selectedOption ? parseInt(selectedOption.dataset.level) : null;

        if (!isNaN(weaponIdx) && !isNaN(configIdx)) {
          if (typeof onEditConfig === 'function') {
            onEditConfig(weaponIdx, configIdx, 'bulletType', value);
            if (level !== null && !isNaN(level)) {
              onEditConfig(weaponIdx, configIdx, 'bulletLevel', level);
            }
          }
          if (typeof onBulletChange === 'function') {
            onBulletChange(weaponIdx, configIdx, value, level);
          }
          this.updatePriceRowTotal(e.target.closest('tr'));
        }
      });
    });

    // 子弹下拉（空配置）
    document.querySelectorAll('#priceTabContent .price-bullet-select-empty').forEach(select => {
      select.addEventListener('change', (e) => {
        e.stopPropagation();
        const weaponIdx = parseInt(e.target.dataset.weapon);
        const barrelIdx = parseInt(e.target.dataset.barrel);
        this.handleEmptyConfigCreation(e.target.closest('tr'), weaponIdx, barrelIdx, onAddConfig);
      });
    });

    // 命中率编辑按钮
    document.querySelectorAll('#priceTabContent .hitrate-edit-btn:not(.hitrate-edit-btn-empty)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const weaponIdx = parseInt(e.target.dataset.weapon);
        const configIdx = parseInt(e.target.dataset.config);
        if (!isNaN(weaponIdx) && !isNaN(configIdx) && typeof onEditHitRate === 'function') {
          onEditHitRate(weaponIdx, configIdx);
        }
      });
    });

    // 命中率编辑按钮（空配置）
    document.querySelectorAll('#priceTabContent .hitrate-edit-btn-empty').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tr = e.target.closest('tr');
        const weaponIdx = parseInt(e.target.dataset.weapon);
        const barrelIdx = parseInt(tr?.dataset.barrel);
        this.handleEmptyConfigCreation(tr, weaponIdx, barrelIdx, onAddConfig, (newConfigIdx) => {
          if (typeof onEditHitRate === 'function') {
            onEditHitRate(weaponIdx, newConfigIdx);
          }
        });
      });
    });

    // 复制改枪码
    document.querySelectorAll('#priceTabContent .copy-code-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const weaponIdx = parseInt(e.target.dataset.weapon);
        const configIdx = parseInt(e.target.dataset.config);
        if (!isNaN(weaponIdx) && !isNaN(configIdx) && typeof onCopyCode === 'function') {
          onCopyCode(weaponIdx, configIdx);
        }
      });
    });

    // 新增改枪配置
    document.querySelectorAll('#priceTabContent .add-config-btn:not(.add-config-btn-empty)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const weaponIdx = parseInt(e.target.dataset.weapon);
        const configIdx = parseInt(e.target.dataset.config);
        if (!isNaN(weaponIdx) && !isNaN(configIdx) && typeof onAddConfig === 'function') {
          onAddConfig(weaponIdx, configIdx);
        }
      });
    });

    // 新增改枪配置（空配置）
    document.querySelectorAll('#priceTabContent .add-config-btn-empty').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tr = e.target.closest('tr');
        const weaponIdx = parseInt(e.target.dataset.weapon);
        const barrelIdx = parseInt(tr?.dataset.barrel);
        this.handleEmptyConfigCreation(tr, weaponIdx, barrelIdx, onAddConfig);
      });
    });

    // 删除改枪配置
    document.querySelectorAll('#priceTabContent .remove-config-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const weaponIdx = parseInt(e.target.dataset.weapon);
        const configIdx = parseInt(e.target.dataset.config);
        if (!isNaN(weaponIdx) && !isNaN(configIdx) && typeof onRemoveConfig === 'function') {
          onRemoveConfig(weaponIdx, configIdx);
        }
      });
    });
  }

  /**
   * 处理空配置行的创建
   */
  handleEmptyConfigCreation(tr, weaponIdx, barrelIdx, onAddConfig, callback = null) {
    if (!tr || tr.dataset.isEmpty !== 'true') return;

    const codeInput = tr.querySelector('.price-code-input-empty');
    const priceInput = tr.querySelector('.price-input-empty');
    const bulletSelect = tr.querySelector('.price-bullet-select-empty');
    const ammoInput = tr.querySelector('.price-ammo-input-empty');

    const code = codeInput?.value?.trim() || '';
    const price = parseFloat(priceInput?.value) || 0;
    const bulletType = bulletSelect?.value || null;
    const ammoCount = parseFloat(ammoInput?.value) || 0;

    // 获取选中的等级
    const selectedOption = bulletSelect?.options[bulletSelect.selectedIndex];
    const bulletLevel = selectedOption ? parseInt(selectedOption.dataset.level) : null;

    if (typeof onAddConfig === 'function') {
      // 使用源配置索引0，让DOMController处理
      onAddConfig(weaponIdx, 0);
    }
  }

  /**
   * 更新价格行的总计显示
   */
  updatePriceRowTotal(tr) {
    if (!tr) return;

    const priceInput = tr.querySelector('.price-input, .price-input-empty');
    const ammoInput = tr.querySelector('.price-ammo-input, .price-ammo-input-empty');
    const bulletSelect = tr.querySelector('.price-bullet-select, .price-bullet-select-empty');
    const ammoTotalDisplay = tr.querySelector('.ammo-total-display');
    const weaponTotalDisplay = tr.querySelector('.weapon-total-display');

    if (!priceInput || !ammoInput || !bulletSelect || !ammoTotalDisplay || !weaponTotalDisplay) return;

    const price = parseFloat(priceInput.value) || 0;
    const ammoCount = parseFloat(ammoInput.value) || 0;

    // 获取子弹价格
    const bulletValue = bulletSelect.value;
    let bulletPrice = 0;
    if (bulletValue) {
      const selectedOption = bulletSelect.options[bulletSelect.selectedIndex];
      const level = selectedOption ? parseInt(selectedOption.dataset.level) : null;
      const priceKey = (level !== null && !isNaN(level) && !isSpecialBullet(bulletValue)) ? `${bulletValue}_${level}` : bulletValue;
      bulletPrice = getBulletPrice(priceKey);
    }

    const ammoTotal = bulletPrice * ammoCount;
    const weaponTotal = price + ammoTotal;

    ammoTotalDisplay.textContent = this.formatCurrency(ammoTotal);
    weaponTotalDisplay.textContent = this.formatCurrency(weaponTotal);
  }

  /**
   * 渲染新增枪械行
   */
  renderAddWeaponRow() {
    return `
      <tr class="add-weapon-row" id="addWeaponRow">
        <td><input type="text" id="newWeaponName" placeholder="武器名称" style="width:100%;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#f0fff0;font-size:inherit;box-sizing:border-box;"/></td>
        <td><input type="text" id="newWeaponType" placeholder="类型" style="width:100%;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#f0fff0;font-size:inherit;box-sizing:border-box;"/></td>
        <td><input type="number" id="newWeaponRof" placeholder="射速" style="width:55px;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#f0fff0;font-size:inherit;"/></td>
        <td><input type="number" id="newWeaponVelocity" placeholder="初速" style="width:55px;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#f0fff0;font-size:inherit;"/></td>
        <td><input type="text" id="newWeaponRanges" placeholder="40,70,∞,∞" style="width:100%;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#f0fff0;font-size:inherit;box-sizing:border-box;"/></td>
        <td><input type="number" id="newWeaponFlesh" placeholder="肉伤" style="width:45px;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#f0fff0;font-size:inherit;"/></td>
        <td><input type="number" id="newWeaponArmor" placeholder="甲伤" style="width:45px;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#f0fff0;font-size:inherit;"/></td>
        <td><input type="text" id="newWeaponDecays" placeholder="1.0,0.85,0.7,0.7,0.7" style="width:100%;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#f0fff0;font-size:inherit;box-sizing:border-box;"/></td>
        <td><input type="text" id="newWeaponMult" placeholder="1.9,1,0.9,0.4" style="width:100%;border:1px solid #4caf50;border-radius:3px;padding:2px 4px;background:#f0fff0;font-size:inherit;box-sizing:border-box;"/></td>
        <td style="background:#f0f0f0;font-size:0.8rem;color:#999;">自动</td>
        <td colspan="1" style="text-align:left;">
          <button class="confirm-add-btn" id="confirmAddWeapon">✅ 确认添加</button>
          <button class="cancel-add-btn" id="cancelAddWeapon">❌ 取消</button>
          <span style="font-size:0.8rem;color:#666;margin-left:8px;">填完数据后点击"确认添加"</span>
        </td>
      </tr>
    `;
  }
}