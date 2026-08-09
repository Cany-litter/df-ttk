import { WeaponManager } from '../core/WeaponManager.js';
import { ViewRenderer } from './ViewRenderer.js';
import { formatMultipliers } from '../utils/formatters.js';
import { CacheManager } from '../utils/cacheManager.js';
import { BarrelEditor } from './BarrelEditor.js';

/**
 * DOM控制器
 * 负责DOM操作、数据读取和协调其他组件
 */
export class DOMController {
  constructor(weaponManager) {
    this.weaponManager = weaponManager;
    this.viewRenderer = new ViewRenderer();
    this.cacheManager = new CacheManager();
    this.isUpdating = false;
    
    // 初始化枪管编辑器
    this.barrelEditor = null;
    
    // 加载武器数据（直接从 WeaponManager 获取）
    // 此时数据应该已经由 main.js 加载完成
    this.loadWeaponData();
    
    // 延迟加载保存的配置（页面参数配置）
    setTimeout(() => {
      this.loadSavedConfig();
    }, 0);
    
    // 设置参数自动保存（只保存页面参数，不保存武器数据）
    this.setupAutoSave();
    
    // 延迟初始化枪管编辑器（等待DOM完全渲染）
    setTimeout(() => {
      this.setupBarrelEditor();
    }, 100);
  }

  /**
   * 加载武器数据（直接从 WeaponManager 获取）
   * 此时数据应该已经由 main.js 加载完成
   */
  loadWeaponData() {
    const weapons = this.weaponManager.getWeapons();
    if (weapons && weapons.length > 0) {
      console.log(`📂 从 WeaponManager 加载了 ${weapons.length} 把武器`);
      return;
    }
    
    // 如果 WeaponManager 没有数据，说明加载顺序有问题
    console.error('❌ WeaponManager 中没有武器数据，请确保 main.js 先加载 weapons.json');
    this.showError('武器数据加载失败，请刷新页面重试');
  }

  /**
   * 由外部（main.js）调用，加载从 JSON 获取的数据
   * @param {Array} data - 武器数据数组
   */
  loadWeaponsFromJSON(data) {
    if (!data || data.length === 0) {
      console.error('❌ JSON 数据为空');
      this.showError('武器数据为空，请检查 weapons.json 文件');
      return;
    }
    
    // 加载数据到 WeaponManager
    this.weaponManager.loadWeapons(data);
    
    // 重新渲染表格
    this.renderAttachmentTable();
    
    // 重新应用全局枪管设置
    this.updateGlobalBarrelSelections();
    
    console.log(`✅ 从 JSON 加载了 ${data.length} 把武器数据`);
  }

  /**
   * 加载保存的配置（只加载页面参数配置）
   */
  loadSavedConfig() {
    try {
      const savedConfig = this.cacheManager.loadConfig();
      this.applyConfigToPage(savedConfig);
    } catch (error) {
      console.error('加载配置时出错:', error);
    }
  }

  /**
   * 将配置应用到页面控件
   * @param {Object} config - 配置对象
   */
  applyConfigToPage(config) {
    document.getElementById('bulletLevel').value = config.bulletLevel;
    document.getElementById('armorLevel').value = config.armorLevel;
    document.getElementById('armorValue').value = config.armorValue;
    document.getElementById('helmetLevel').value = config.helmetLevel;
    document.getElementById('helmetValue').value = config.helmetValue;
    document.getElementById('distance').value = config.distance;
    document.getElementById('healthValue').value = config.healthValue || 100;
    document.getElementById('hitRate').value = config.hitRate;
    document.getElementById('triggerDelayEnable').checked = config.triggerDelayEnable;
    document.getElementById('globalBarrelType').value = config.globalBarrelType;

    const hitKeys = ['head', 'chest', 'stomach', 'limbs'];
    hitKeys.forEach(key => {
      const el = document.getElementById('p' + key.charAt(0).toUpperCase() + key.slice(1));
      el.value = config.hitProb[key];
    });

    this.applyVelocityPrecisionSettings(config.velocityPrecisionSettings);
  }

  /**
   * 设置自动保存功能（只保存页面参数）
   */
  setupAutoSave() {
    const paramElements = [
      'bulletLevel', 'armorLevel', 'armorValue', 'helmetLevel', 'helmetValue',
      'distance', 'healthValue', 'hitRate', 'triggerDelayEnable',
      'globalBarrelType', 'pHead', 'pChest', 'pStomach', 'pLimbs'
    ];

    paramElements.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('change', () => {
          this.saveCurrentConfig();
        });
        
        if (element.type === 'number') {
          element.addEventListener('input', () => {
            this.saveCurrentConfig();
          });
        }
      }
    });

    this.setupVelocityPrecisionAutoSave();
  }

  /**
   * 设置枪口初速精校滑块的自动保存
   */
  setupVelocityPrecisionAutoSave() {
    document.addEventListener('input', (e) => {
      if (e.target.classList.contains('velocity-precision-slider')) {
        this.saveCurrentConfig();
      }
    });
  }

  /**
   * 保存当前配置（只保存页面参数）
   */
  saveCurrentConfig() {
    const currentConfig = this.readPageParams();
    this.cacheManager.saveConfig(currentConfig);
  }

  /**
   * 读取页面参数
   * @returns {Object} 页面参数对象
   */
  readPageParams() {
    const toNum = id => Number(document.getElementById(id).value);
    const params = {
      bulletLevel: toNum('bulletLevel'),
      armorLevel: toNum('armorLevel'),
      armorValue: toNum('armorValue'),
      helmetLevel: toNum('helmetLevel'),
      helmetValue: toNum('helmetValue'),
      distance: toNum('distance'),
      healthValue: toNum('healthValue'),
      hitProb: {},
      hitRate: toNum('hitRate'),
      triggerDelayEnable: document.getElementById('triggerDelayEnable').checked,
      globalBarrelType: document.getElementById('globalBarrelType').value 
    };
    
    const hitKeys = ['head', 'chest', 'stomach', 'limbs'];
    hitKeys.forEach(key => {
      const el = document.getElementById('p' + key.charAt(0).toUpperCase() + key.slice(1));
      params.hitProb[key] = Number(el.value);
    });
    
    params.velocityPrecisionSettings = this.getVelocityPrecisionSettings();
    
    return params;
  }

  /**
   * 获取枪口初速精校设置
   * @returns {Object} 精校设置对象
   */
  getVelocityPrecisionSettings() {
    const settings = {
      weaponSettings: {}
    };

    const sliders = document.querySelectorAll('.velocity-precision-slider');
    
    sliders.forEach(slider => {
      const weaponIndex = slider.dataset.weapon;
      const cloneIndex = slider.dataset.clone;
      const precisionValue = parseFloat(slider.value);
      
      if (weaponIndex !== undefined) {
        settings.weaponSettings[`weapon_${weaponIndex}`] = precisionValue;
      } else if (cloneIndex !== undefined) {
        settings.weaponSettings[`clone_${cloneIndex}`] = precisionValue;
      }
    });

    return settings;
  }

  /**
   * 应用枪口初速精校设置
   * @param {Object} settings - 精校设置对象
   */
  applyVelocityPrecisionSettings(settings) {
    const sliders = document.querySelectorAll('.velocity-precision-slider');
    
    if (settings && settings.weaponSettings) {
      Object.keys(settings.weaponSettings).forEach(key => {
        const precisionValue = settings.weaponSettings[key];
        let slider = null;
        
        if (key.startsWith('weapon_')) {
          const weaponIndex = key.replace('weapon_', '');
          slider = document.querySelector(`.velocity-precision-slider[data-weapon="${weaponIndex}"]`);
        } else if (key.startsWith('clone_')) {
          const cloneIndex = key.replace('clone_', '');
          slider = document.querySelector(`.velocity-precision-slider[data-clone="${cloneIndex}"]`);
        }
        
        if (slider) {
          slider.value = precisionValue;
          const valueSpan = slider.parentElement.querySelector('.velocity-precision-value');
          if (valueSpan) {
            valueSpan.textContent = `${Math.round(precisionValue * 100)}%`;
          }
        }
      });
    }
    
    sliders.forEach(slider => {
      if (slider.value === '0' || slider.value === '') {
        slider.value = 0.09;
        const valueSpan = slider.parentElement.querySelector('.velocity-precision-value');
        if (valueSpan) {
          valueSpan.textContent = '9%';
        }
      } else {
        const valueSpan = slider.parentElement.querySelector('.velocity-precision-value');
        if (valueSpan) {
          const percentage = Math.round(parseFloat(slider.value) * 100);
          valueSpan.textContent = `${percentage}%`;
        }
      }
    });
  }

  /**
   * 读取每把枪的子弹类型选择
   * @returns {Array} 每把枪的子弹类型（未选为null）
   */
  readWeaponBullets() {
    const bulletSelects = document.querySelectorAll('.bulletSel');
    return Array.from(bulletSelects).map(sel => sel.value || null);
  }

  /**
   * 收集附件选择数据
   * @returns {Object} 包含 barrelValues, muzzleValues, hitRateValues 的对象
   */
  collectAttachmentData() {
    const barrelValues = Array.from(document.querySelectorAll('.barrelSel')).map(el => el.value);
    const muzzleValues = Array.from(document.querySelectorAll('.muzzleSel')).map(el => el.value);
    const hitRateValues = Array.from(document.querySelectorAll('.hitRateInput')).map(el => el.value || '');
    
    return { barrelValues, muzzleValues, hitRateValues };
  }

  /**
   * 渲染附件选择表格
   */
  renderAttachmentTable() {
    const weapons = this.weaponManager.getWeapons();
    const muzzles = this.weaponManager.getMuzzles();
    const clonedWeapons = this.weaponManager.getClonedWeapons();
    
    // 传入编辑回调
    this.viewRenderer.renderAttachmentTable(
      weapons, 
      muzzles, 
      (index, property, value) => {
        this.handleWeaponEdit(index, property, value);
      },
      clonedWeapons,
      (weaponIndex) => this.handleAddClone(weaponIndex),
      (cloneIndex) => this.handleRemoveClone(cloneIndex)
    );
    
    // 绑定新增枪械的确认和取消事件
    this.setupAddWeaponListeners();
    
    // 绑定枪管编辑按钮事件
    this.viewRenderer.bindBarrelEditListeners((weaponIndex) => {
      if (this.barrelEditor) {
        this.barrelEditor.openEditor(weaponIndex);
      }
    });
    
    setTimeout(() => {
      this.updateWeaponStats();
    }, 0);
  }

  /**
   * 初始化枪管编辑器
   */
  setupBarrelEditor() {
    this.barrelEditor = new BarrelEditor(
      this.weaponManager,
      this.viewRenderer,
      () => {
        // 数据变化回调 - 刷新表格和枪管选择下拉框
        this.renderAttachmentTable();
        this.updateGlobalBarrelSelections();
      }
    );
    console.log('🔧 枪管编辑器已初始化');
  }

  /**
   * 处理武器属性编辑（核心修改）
   * @param {number} index - 武器索引
   * @param {string} property - 属性名
   * @param {*} value - 新值
   */
  handleWeaponEdit(index, property, value) {
    // 如果是附件变化（_attachment, _bullet, _precision, _clonePrecision），不需要更新武器数据，只需要刷新显示
    // ⚠️ _hitRate 不再在这里处理，单独处理
    if (property === '_attachment' || property === '_bullet' || property === '_precision' || 
        property === '_clonePrecision') {
      // 附件变化时，直接刷新统计显示
      setTimeout(() => {
        this.updateWeaponStats();
      }, 10);
      return;
    }
    
    // ✅ 单独处理 _hitRate，保存到 WeaponManager
    if (property === '_hitRate') {
      // 将值保存到 WeaponManager
      const success = this.weaponManager.updateWeaponProperty(index, 'hitRate', value);
      if (success) {
        setTimeout(() => {
          this.updateWeaponStats();
        }, 10);
        console.log(`✅ 保存命中率成功: [${index}] ${value}`);
      } else {
        console.warn(`⚠️ 保存命中率失败: [${index}] ${value}`);
      }
      return;
    }
    
    // 更新 WeaponManager 中的数据源
    const success = this.weaponManager.updateWeaponProperty(index, property, value);
    
    if (success) {
      // 使用 setTimeout 确保数据更新后再刷新 UI
      setTimeout(() => {
        // 刷新表格显示
        this.updateWeaponStats();
      }, 10);
      
      console.log(`✏️ 更新武器 [${index}] ${property} = ${value}`);
    } else {
      console.warn(`⚠️ 更新武器属性失败: [${index}] ${property} = ${value}`);
    }
  }

  /**
   * 设置新增枪械的事件监听器
   */
  setupAddWeaponListeners() {
    const confirmBtn = document.getElementById('confirmAddWeapon');
    if (confirmBtn) {
      const newConfirmBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
      
      newConfirmBtn.addEventListener('click', () => {
        this.handleAddWeapon();
      });
    }
    
    const cancelBtn = document.getElementById('cancelAddWeapon');
    if (cancelBtn) {
      const newCancelBtn = cancelBtn.cloneNode(true);
      cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
      
      newCancelBtn.addEventListener('click', () => {
        this.viewRenderer.clearNewWeaponInputs();
      });
    }
  }

  /**
   * 处理新增枪械
   */
  handleAddWeapon() {
    try {
      const weaponData = this.viewRenderer.readNewWeaponData();
      if (!weaponData) return;
      
      // 添加到武器管理器
      const weapons = this.weaponManager.getWeapons();
      weapons.push(weaponData);
      
      // 重新渲染表格
      this.renderAttachmentTable();
      
      // 重新应用全局枪管设置
      this.updateGlobalBarrelSelections();
      
      console.log(`✅ 已添加新武器: ${weaponData.name}`);
      
      setTimeout(() => {
        const rows = document.querySelectorAll('#attachmentTable tbody tr:not(.clone-row):not(.add-weapon-row)');
        const lastRow = rows[rows.length - 1];
        if (lastRow) {
          lastRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          lastRow.style.backgroundColor = '#e8f5e9';
          setTimeout(() => {
            lastRow.style.backgroundColor = '';
          }, 2000);
        }
      }, 100);
      
    } catch (error) {
      console.error('添加武器失败:', error);
      this.showError('添加武器失败: ' + error.message);
    }
  }

  /**
   * 处理添加副本
   * @param {number} weaponIndex - 原始武器索引
   */
  handleAddClone(weaponIndex) {
    if (!this.weaponManager.canAddClone()) {
      alert('最多添加5个副本~');
      return;
    }

    const bulletTypes = this.readWeaponBullets();
    const { barrelValues, muzzleValues, hitRateValues } = this.collectAttachmentData();
    
    const attachmentConfig = {
      barrelIndex: this.parseBarrelIndex(barrelValues[weaponIndex]),
      muzzleIndex: this.parseMuzzleIndex(muzzleValues[weaponIndex]),
      hitRate: hitRateValues[weaponIndex] === '' ? null : Number(hitRateValues[weaponIndex]),
      bulletType: bulletTypes[weaponIndex]
    };

    const currentWeaponState = this.readCurrentWeaponState(weaponIndex);

    if (this.weaponManager.addClone(weaponIndex, attachmentConfig, currentWeaponState)) {
      this.addCloneRow(weaponIndex, attachmentConfig);
      this.updateWeaponStats();
    }
  }

  /**
   * 处理删除副本
   * @param {number} cloneIndex - 副本索引
   */
  handleRemoveClone(cloneIndex) {
    this.weaponManager.removeClone(cloneIndex);
    this.removeCloneRow(cloneIndex);
    this.updateWeaponStats();
  }

  /**
   * 解析枪管索引
   * @param {string} barrelValue - 枪管选择值
   * @returns {number} 枪管索引
   */
  parseBarrelIndex(barrelValue) {
    if (!barrelValue) return 0;
    const [, index] = barrelValue.split('|').map(Number);
    return index === -1 ? 0 : index;
  }

  /**
   * 解析枪口索引
   * @param {string} muzzleValue - 枪口选择值
   * @returns {number} 枪口索引
   */
  parseMuzzleIndex(muzzleValue) {
    if (!muzzleValue) return 0;
    const [, index] = muzzleValue.split('|').map(Number);
    return index === -1 ? 0 : index;
  }

  /**
   * 从页面上读取当前武器的状态（已经应用了附件）
   * @param {number} weaponIndex - 武器索引
   * @returns {Object} 当前武器状态
   */
  readCurrentWeaponState(weaponIndex) {
    const rof = Number(document.querySelector(`.currentRof[data-weapon="${weaponIndex}"]`).textContent);
    const velocity = Number(document.querySelector(`.currentVelocity[data-weapon="${weaponIndex}"]`).textContent);
    const rangesText = document.querySelector(`.currentRanges[data-weapon="${weaponIndex}"]`).textContent;
    const flesh = Number(document.querySelector(`.currentFlesh[data-weapon="${weaponIndex}"]`).textContent);
    const armor = Number(document.querySelector(`.currentArmor[data-weapon="${weaponIndex}"]`).textContent);
    
    const ranges = rangesText.split(',').map(r => {
      const trimmed = r.trim();
      if (trimmed === '∞' || trimmed === 'Infinity') {
        return Infinity;
      }
      const num = Number(trimmed);
      if (isNaN(num)) {
        return 0; 
      }
      return num;
    });
    
    const weapons = this.weaponManager.getWeapons();
    const originalWeapon = weapons[weaponIndex];
    
    return {
      ...originalWeapon,
      rof: rof,
      velocity: velocity,
      ranges: ranges,
      flesh: flesh,
      armor: armor
    };
  }

  /**
   * 添加副本行到表格
   * @param {number} weaponIndex - 原始武器索引
   * @param {Object} attachmentConfig - 附件配置
   */
  addCloneRow(weaponIndex, attachmentConfig) {
    const weapons = this.weaponManager.getWeapons();
    const muzzles = this.weaponManager.getMuzzles();
    const clonedWeapons = this.weaponManager.getClonedWeapons();
    
    const newClone = clonedWeapons[clonedWeapons.length - 1];
    const cloneIndex = clonedWeapons.length - 1;
    
    const params = this.readPageParams();
    const displayData = this.weaponManager.calculateCloneDisplayData(newClone, params);
    
    const tbody = document.querySelector('#attachmentTable tbody');
    const tr = document.createElement('tr');
    tr.className = 'clone-row';
    tr.innerHTML = `
      <td>${newClone.name}</td>
      <td>${newClone.type}</td>
      <td class="currentRof" data-clone="${cloneIndex}">${displayData.rof}</td>
      <td class="currentVelocity" data-clone="${cloneIndex}">${displayData.velocity}</td>
      <td class="currentRanges" data-clone="${cloneIndex}">${this.formatRanges(displayData.ranges)}</td>
      <td class="currentFlesh" data-clone="${cloneIndex}">${displayData.flesh}</td>
      <td class="currentArmor" data-clone="${cloneIndex}">${displayData.armor}</td>
      <td class="multipliers" data-clone="${cloneIndex}">${formatMultipliers(displayData.mult)}</td>
      <td>${attachmentConfig.barrelIndex > 0 ? weapons[weaponIndex].barrels[attachmentConfig.barrelIndex - 1].name : '无'}</td>
      <td>${attachmentConfig.muzzleIndex > 0 ? muzzles[attachmentConfig.muzzleIndex].name : '无'}</td>
      <td>${attachmentConfig.bulletType || '全局'}</td>
      <td>${attachmentConfig.hitRate || ''}</td>
      <td><button class="remove-clone-btn" data-clone="${cloneIndex}" title="删除副本">-</button></td>
    `;
    tbody.appendChild(tr);
    
    const removeBtn = tr.querySelector('.remove-clone-btn');
    removeBtn.addEventListener('click', () => this.handleRemoveClone(cloneIndex));
  }

  /**
   * 删除副本行
   * @param {number} cloneIndex - 副本索引
   */
  removeCloneRow(cloneIndex) {
    const cloneRows = document.querySelectorAll('.clone-row');
    if (cloneRows[cloneIndex]) {
      cloneRows[cloneIndex].remove();
    }
    this.renumberCloneRows();
  }

  /**
   * 重新编号副本行
   */
  renumberCloneRows() {
    const cloneRows = document.querySelectorAll('.clone-row');
    cloneRows.forEach((row, index) => {
      const cells = row.querySelectorAll('[data-clone]');
      cells.forEach(cell => {
        cell.setAttribute('data-clone', index);
      });
      
      const removeBtn = row.querySelector('.remove-clone-btn');
      if (removeBtn) {
        removeBtn.setAttribute('data-clone', index);
        removeBtn.onclick = () => this.handleRemoveClone(index);
      }
    });
  }

  /**
   * 格式化射程显示
   */
  formatRanges(ranges) {
    return ranges.map(r => r === Infinity ? '∞' : Math.round(r)).join(', ');
  }

  /**
   * 更新武器统计数据（当附件选择变化时调用）
   */
  updateWeaponStats() {
    if (this.isUpdating) {
      console.log('⏳ 正在更新中，跳过重复调用');
      return;
    }
    
    this.isUpdating = true;
    
    try {
      const bulletTypes = this.readWeaponBullets();
      const { barrelValues, muzzleValues, hitRateValues } = this.collectAttachmentData();
      
      const params = this.readPageParams();
      
      // 构建附件配置
      const attachmentConfigs = this.weaponManager.readAttachmentsWithBullet(
        barrelValues, 
        muzzleValues, 
        hitRateValues, 
        bulletTypes
      );
      
      // 从 WeaponManager 获取最新数据（已包含用户编辑的值）
      const updatedWeapons = this.weaponManager.applyAttachments(attachmentConfigs, params);
      
      // 更新UI
      this.viewRenderer.updateWeaponStats(updatedWeapons);
      
    } catch (error) {
      console.error('更新武器统计失败:', error);
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * 显示错误信息
   * @param {string} message - 错误信息
   */
  showError(message) {
    alert(message);
  }

  /**
   * 获取图表上下文
   * @param {string} chartId - 图表ID
   * @returns {CanvasRenderingContext2D} 图表上下文
   */
  getChartContext(chartId) {
    return document.getElementById(chartId).getContext('2d');
  }

  /**
   * 获取全局枪管类型设置
   * @returns {string} 'none' 或 'longest'
   */
  getGlobalBarrelType() {
    return document.getElementById('globalBarrelType').value;
  }

  /**
   * 根据全局设置更新所有武器的枪管选择
   */
  updateGlobalBarrelSelections() {
    const globalBarrelType = this.getGlobalBarrelType();
    const barrelSelects = document.querySelectorAll('.barrelSel');
    
    barrelSelects.forEach((select, index) => {
      const weapon = this.weaponManager.getWeapons()[index];
      if (!weapon) return;
      
      if (globalBarrelType === 'none') {
        select.value = '无|-1';
      } else if (globalBarrelType === 'longest') {
        if (weapon.barrels && weapon.barrels.length > 0) {
          const getScore = (w, barrel) => {
            if (!barrel) return -Infinity;
            const hasAdd = typeof barrel.rangeAdd === 'number';
            const barrelMult = hasAdd ? 1.0 : (typeof barrel.rangeMult === 'number' ? barrel.rangeMult : 1.0);
            const ranges = w.ranges.map(r => r === Infinity ? Infinity : (r * barrelMult));
            const adjusted = hasAdd ? ranges.map(r => r === Infinity ? Infinity : (r + barrel.rangeAdd)) : ranges;
            const finite = adjusted.filter(Number.isFinite);
            return finite.length ? Math.max(...finite) : -Infinity;
          };
          const longestBarrelIndex = weapon.barrels.reduce((best, cur, curIdx) => {
            const sb = getScore(weapon, weapon.barrels[best]);
            const sc = getScore(weapon, cur);
            return sc > sb ? curIdx : best;
          }, 0);
          select.value = `${weapon.barrels[longestBarrelIndex].name}|${longestBarrelIndex + 1}`;
        } else {
          select.value = '无|-1';
        }
      }
      
      select.dispatchEvent(new Event('change'));
    });
  }

  /**
   * 重置武器数据为默认值
   * 这个方法现在由 main.js 的 resetToDefault 调用
   * @param {Array} defaultData - 默认武器数据
   */
  resetWeaponsToDefault(defaultData) {
    if (!defaultData || defaultData.length === 0) {
      console.warn('默认武器数据为空，无法重置');
      return;
    }
    
    this.weaponManager.loadWeapons(defaultData);
    this.renderAttachmentTable();
    this.updateGlobalBarrelSelections();
    console.log('✅ 已重置为默认武器数据');
  }
}