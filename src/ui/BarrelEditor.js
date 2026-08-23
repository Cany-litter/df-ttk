/**
 * 枪管编辑器
 * 负责枪管的增删改查，以及弹窗管理
 */
export class BarrelEditor {
  constructor(weaponManager, viewRenderer, onDataChange) {
    this.weaponManager = weaponManager;
    this.viewRenderer = viewRenderer;
    this.onDataChange = onDataChange;
    this.currentWeaponIndex = -1;
    this.barrelCache = [];

    // 绑定弹窗事件
    this.bindModalEvents();
  }

  /**
   * 打开枪管编辑弹窗
   * @param {number} weaponIndex - 武器索引
   */
  openEditor(weaponIndex) {
    this.currentWeaponIndex = weaponIndex;

    const weapons = this.weaponManager.getWeapons();
    const weapon = weapons[weaponIndex];
    if (!weapon) {
      alert('未找到该武器');
      return;
    }

    // 显示弹窗
    const modal = document.getElementById('barrelEditorModal');
    const nameSpan = document.getElementById('barrelEditorWeaponName');
    nameSpan.textContent = weapon.name || '未命名武器';
    modal.style.display = 'flex';

    // 渲染枪管列表
    this.renderBarrelList(weapon);
  }

  /**
   * 渲染枪管列表
   * @param {Object} weapon - 武器对象
   */
  renderBarrelList(weapon) {
    const container = document.getElementById('barrelEditorContainer');
    const barrels = weapon.barrels || [];

    if (barrels.length === 0) {
      container.innerHTML = `
        <div class="empty-barrel-msg">
          <p>📭 暂无枪管数据</p>
          <span class="hint">点击下方 "新增枪管" 添加</span>
        </div>
      `;
      return;
    }

    // 构建表格HTML
    let html = `
      <table class="barrel-editor-table">
        <thead>
          <tr>
            <th style="min-width:60px;">名称</th>
            <th style="min-width:50px;">射程倍率</th>
            <th style="min-width:50px;">射程增量</th>
            <th style="min-width:50px;">初速倍率</th>
            <th style="min-width:50px;">初速增量</th>
            <th style="min-width:50px;">射速倍率</th>
            <th style="min-width:45px;">肉伤加成</th>
            <th style="min-width:45px;">甲伤加成</th>
            <th style="min-width:55px;">扳机延迟Δ</th>
            <th style="min-width:80px;">自定义射程</th>
            <th style="min-width:80px;">自定义衰减</th>
            <th style="min-width:60px;">操作</th>
          </tr>
        </thead>
        <tbody>
    `;

    barrels.forEach((barrel, index) => {
      // 格式化自定义射程和衰减显示
      const rangesStr = barrel.ranges && Array.isArray(barrel.ranges)
        ? barrel.ranges.map(r => r === Infinity ? '∞' : r).join(',')
        : '';
      const decaysStr = barrel.decays && Array.isArray(barrel.decays)
        ? barrel.decays.join(',')
        : '';

      html += `
        <tr data-barrel-index="${index}">
          <td><input type="text" class="barrel-edit-name" value="${this.escapeHtml(barrel.name || '')}" placeholder="枪管名称" /></td>
          <td><input type="number" class="barrel-edit-rangeMult" step="0.01" value="${barrel.rangeMult ?? 1.0}" /></td>
          <td><input type="number" class="barrel-edit-rangeAdd" step="0.01" value="${barrel.rangeAdd ?? 0}" /></td>
          <td><input type="number" class="barrel-edit-velocityMult" step="0.01" value="${barrel.velocityMult ?? 1.0}" /></td>
          <td><input type="number" class="barrel-edit-velocityAdd" step="1" value="${barrel.velocityAdd ?? 0}" /></td>
          <td><input type="number" class="barrel-edit-rofMult" step="0.01" value="${barrel.rofMult ?? 1.0}" /></td>
          <td><input type="number" class="barrel-edit-damageBonus" step="0.1" value="${barrel.damageBonus ?? 0}" /></td>
          <td><input type="number" class="barrel-edit-armorDamageBonus" step="0.1" value="${barrel.armorDamageBonus ?? 0}" /></td>
          <td><input type="number" class="barrel-edit-triggerDelayDelta" step="1" value="${barrel.triggerDelayDelta ?? 0}" /></td>
          <td><input type="text" class="barrel-edit-ranges" value="${rangesStr}" placeholder="40,70,∞,∞" /></td>
          <td><input type="text" class="barrel-edit-decays" value="${decaysStr}" placeholder="1.0,0.85,0.7,0.7,0.7" /></td>
          <td>
            <button class="barrel-delete-btn" data-index="${index}">删除</button>
          </td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    container.innerHTML = html;

    // 绑定删除事件
    container.querySelectorAll('.barrel-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.deleteBarrel(index);
      });
    });

    // 绑定Enter键快速保存
    container.querySelectorAll('input').forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.target.blur();
        }
      });
    });
  }

  /**
   * 删除枪管
   * @param {number} index - 枪管索引
   */
  deleteBarrel(index) {
    const weapons = this.weaponManager.getWeapons();
    const weapon = weapons[this.currentWeaponIndex];
    if (!weapon || !weapon.barrels) return;

    const barrelName = weapon.barrels[index]?.name || `枪管 #${index + 1}`;
    if (!confirm(`确定要删除枪管 "${barrelName}" 吗？`)) {
      return;
    }

    weapon.barrels.splice(index, 1);
    this.renderBarrelList(weapon);
  }

  /**
   * 保存所有枪管编辑
   */
  saveBarrels() {
    const weapons = this.weaponManager.getWeapons();
    const weapon = weapons[this.currentWeaponIndex];
    if (!weapon) {
      alert('未找到该武器');
      return;
    }

    // 从表格读取所有枪管数据
    const rows = document.querySelectorAll('#barrelEditorContainer tbody tr');
    const newBarrels = [];

    rows.forEach(row => {
      const name = row.querySelector('.barrel-edit-name')?.value?.trim() || '';
      if (!name) return; // 跳过名称为空的行

      const rangeMult = parseFloat(row.querySelector('.barrel-edit-rangeMult')?.value) || 1.0;
      const rangeAdd = parseFloat(row.querySelector('.barrel-edit-rangeAdd')?.value) || 0;
      const velocityMult = parseFloat(row.querySelector('.barrel-edit-velocityMult')?.value) || 1.0;
      const velocityAdd = parseFloat(row.querySelector('.barrel-edit-velocityAdd')?.value) || 0;
      const rofMult = parseFloat(row.querySelector('.barrel-edit-rofMult')?.value) || 1.0;
      const damageBonus = parseFloat(row.querySelector('.barrel-edit-damageBonus')?.value) || 0;
      const armorDamageBonus = parseFloat(row.querySelector('.barrel-edit-armorDamageBonus')?.value) || 0;
      const triggerDelayDelta = parseFloat(row.querySelector('.barrel-edit-triggerDelayDelta')?.value) || 0;

      const barrel = {
        name,
        rangeMult,
        rangeAdd,
        velocityMult,
        velocityAdd,
        rofMult,
        damageBonus,
        armorDamageBonus,
        triggerDelayDelta
      };

      // 自定义射程
      const rangesVal = row.querySelector('.barrel-edit-ranges')?.value?.trim() || '';
      if (rangesVal) {
        barrel.ranges = this.parseRangesString(rangesVal);
      }

      // 自定义衰减
      const decaysVal = row.querySelector('.barrel-edit-decays')?.value?.trim() || '';
      if (decaysVal) {
        barrel.decays = decaysVal.split(',').map(v => parseFloat(v.trim()) || 1.0);
      }

      newBarrels.push(barrel);
    });

    // 更新武器数据
    weapon.barrels = newBarrels;

    // 关闭弹窗
    this.closeEditor();

    // 触发数据变化回调
    if (this.onDataChange) {
      this.onDataChange();
    }

    // 更新武器统计显示
    if (this.viewRenderer && typeof this.viewRenderer.updateWeaponStats === 'function') {
      this.viewRenderer.updateWeaponStats();
    }

    console.log(`✅ 已保存 ${newBarrels.length} 个枪管数据`);
  }

  /**
   * 打开新增枪管弹窗
   */
  openAddBarrelModal() {
    const modal = document.getElementById('addBarrelModal');
    modal.style.display = 'flex';

    // 重置表单
    document.getElementById('newBarrelName').value = '';
    document.getElementById('newBarrelRangeMult').value = '1.0';
    document.getElementById('newBarrelRangeAdd').value = '0';
    document.getElementById('newBarrelVelocityMult').value = '1.0';
    document.getElementById('newBarrelVelocityAdd').value = '0';
    document.getElementById('newBarrelRofMult').value = '1.0';
    document.getElementById('newBarrelDamageBonus').value = '0';
    document.getElementById('newBarrelArmorDamageBonus').value = '0';
    document.getElementById('newBarrelTriggerDelayDelta').value = '0';
    document.getElementById('newBarrelRanges').value = '';
    document.getElementById('newBarrelDecays').value = '';
    document.getElementById('newBarrelPartMultAdd').value = '';
    document.getElementById('newBarrelFireMode').value = '';
    document.getElementById('newBarrelBurstCount').value = '3';
    document.getElementById('newBarrelBurstInternalROF').value = '800';
    document.getElementById('newBarrelBurstInterval').value = '0.1';
    document.getElementById('newBarrelBurstFields').style.display = 'none';

    // 聚焦到名称输入框
    setTimeout(() => {
      document.getElementById('newBarrelName').focus();
    }, 100);
  }

  /**
   * 确认添加枪管
   */
  confirmAddBarrel() {
    const name = document.getElementById('newBarrelName').value.trim();
    if (!name) {
      alert('请输入枪管名称');
      document.getElementById('newBarrelName').focus();
      return;
    }

    const weapons = this.weaponManager.getWeapons();
    const weapon = weapons[this.currentWeaponIndex];
    if (!weapon) {
      alert('未找到该武器');
      return;
    }

    // 检查是否已存在同名枪管
    if (weapon.barrels && weapon.barrels.some(b => b.name === name)) {
      if (!confirm(`已存在名为 "${name}" 的枪管，是否继续添加？`)) {
        return;
      }
    }

    // 构建枪管对象
    const barrel = {
      name: name,
      rangeMult: parseFloat(document.getElementById('newBarrelRangeMult').value) || 1.0,
      rangeAdd: parseFloat(document.getElementById('newBarrelRangeAdd').value) || 0,
      velocityMult: parseFloat(document.getElementById('newBarrelVelocityMult').value) || 1.0,
      velocityAdd: parseFloat(document.getElementById('newBarrelVelocityAdd').value) || 0,
      rofMult: parseFloat(document.getElementById('newBarrelRofMult').value) || 1.0,
      damageBonus: parseFloat(document.getElementById('newBarrelDamageBonus').value) || 0,
      armorDamageBonus: parseFloat(document.getElementById('newBarrelArmorDamageBonus').value) || 0,
      triggerDelayDelta: parseFloat(document.getElementById('newBarrelTriggerDelayDelta').value) || 0
    };

    // 可选字段：自定义射程
    const rangesVal = document.getElementById('newBarrelRanges').value.trim();
    if (rangesVal) {
      barrel.ranges = this.parseRangesString(rangesVal);
    }

    // 可选字段：自定义衰减
    const decaysVal = document.getElementById('newBarrelDecays').value.trim();
    if (decaysVal) {
      barrel.decays = decaysVal.split(',').map(v => parseFloat(v.trim()) || 1.0);
    }

    // 可选字段：部位倍率加成
    const partMultAddVal = document.getElementById('newBarrelPartMultAdd').value.trim();
    if (partMultAddVal) {
      try {
        barrel.partMultAdd = JSON.parse(partMultAddVal);
        if (typeof barrel.partMultAdd !== 'object' || Array.isArray(barrel.partMultAdd)) {
          throw new Error('部位倍率加成必须是对象格式');
        }
      } catch (e) {
        alert('部位倍率加成格式错误，请使用有效的JSON格式\n例如: {"head":0.1,"chest":0.05}');
        return;
      }
    }

    // 可选字段：开火模式
    const fireMode = document.getElementById('newBarrelFireMode').value;
    if (fireMode) {
      barrel.fireMode = fireMode;
      if (fireMode === 'burst') {
        barrel.burstCount = parseInt(document.getElementById('newBarrelBurstCount').value) || 3;
        barrel.burstInternalROF = parseInt(document.getElementById('newBarrelBurstInternalROF').value) || 800;
        barrel.burstInterval = parseFloat(document.getElementById('newBarrelBurstInterval').value) || 0.1;
      }
    }

    // 添加到武器
    if (!weapon.barrels) {
      weapon.barrels = [];
    }
    weapon.barrels.push(barrel);

    // 关闭新增弹窗
    document.getElementById('addBarrelModal').style.display = 'none';

    // 刷新枪管列表
    this.renderBarrelList(weapon);

    // 自动保存
    this.saveBarrels();
  }

  /**
   * 关闭编辑器
   */
  closeEditor() {
    document.getElementById('barrelEditorModal').style.display = 'none';
  }

  /**
   * 关闭新增枪管弹窗
   */
  closeAddBarrelModal() {
    document.getElementById('addBarrelModal').style.display = 'none';
  }

  /**
   * 绑定弹窗事件
   */
  bindModalEvents() {
    // ========== 枪管编辑弹窗 ==========
    const editorModal = document.getElementById('barrelEditorModal');

    // 关闭按钮
    document.getElementById('barrelEditorClose')?.addEventListener('click', () => {
      this.closeEditor();
    });
    document.getElementById('cancelBarrelBtn')?.addEventListener('click', () => {
      this.closeEditor();
    });

    // 保存按钮
    document.getElementById('saveBarrelBtn')?.addEventListener('click', () => {
      this.saveBarrels();
    });

    // 新增枪管按钮
    document.getElementById('addBarrelBtn')?.addEventListener('click', () => {
      this.openAddBarrelModal();
    });

    // 点击外部关闭
    editorModal?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.closeEditor();
      }
    });

    // ESC键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (editorModal && editorModal.style.display === 'flex') {
          this.closeEditor();
        }
        const addModal = document.getElementById('addBarrelModal');
        if (addModal && addModal.style.display === 'flex') {
          this.closeAddBarrelModal();
        }
      }
    });

    // ========== 新增枪管弹窗 ==========
    const addModal = document.getElementById('addBarrelModal');

    // 关闭按钮
    document.getElementById('addBarrelModalClose')?.addEventListener('click', () => {
      this.closeAddBarrelModal();
    });
    document.getElementById('cancelAddBarrelBtn')?.addEventListener('click', () => {
      this.closeAddBarrelModal();
    });

    // 确认添加按钮
    document.getElementById('confirmAddBarrelBtn')?.addEventListener('click', () => {
      this.confirmAddBarrel();
    });

    // 点击外部关闭
    addModal?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.closeAddBarrelModal();
      }
    });

    // 开火模式切换：显示/隐藏连发字段
    document.getElementById('newBarrelFireMode')?.addEventListener('change', (e) => {
      const burstFields = document.getElementById('newBarrelBurstFields');
      burstFields.style.display = e.target.value === 'burst' ? 'block' : 'none';
    });

    // 新增枪管弹窗中的Enter键支持
    document.getElementById('newBarrelName')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('newBarrelRangeMult').focus();
      }
    });

    // 在各输入框中按Enter跳转到下一个
    const addFormInputs = addModal?.querySelectorAll('input, select');
    addFormInputs?.forEach((input, index) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const next = addFormInputs[index + 1];
          if (next) {
            next.focus();
          } else {
            document.getElementById('confirmAddBarrelBtn').click();
          }
        }
      });
    });
  }

  /**
   * 解析射程字符串
   * @param {string} str - 射程字符串，如 "40,70,∞,∞"
   * @returns {Array} 射程数组
   */
  parseRangesString(str) {
    if (!str) return [];
    return str.split(',').map(v => {
      const trimmed = v.trim();
      if (trimmed === '∞' || trimmed === 'Infinity' || trimmed === '') {
        return Infinity;
      }
      const num = parseFloat(trimmed);
      return isNaN(num) ? 0 : num;
    });
  }

  /**
   * HTML转义，防止XSS
   * @param {string} text - 需要转义的文本
   * @returns {string} 转义后的文本
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 获取当前编辑的武器
   * @returns {Object|null} 武器对象
   */
  getCurrentWeapon() {
    const weapons = this.weaponManager.getWeapons();
    return weapons[this.currentWeaponIndex] || null;
  }

  /**
   * 检查是否有未保存的修改
   * @returns {boolean} 是否有修改
   */
  hasUnsavedChanges() {
    // 简单检查：比较当前表格数据和武器数据
    const weapon = this.getCurrentWeapon();
    if (!weapon) return false;

    const rows = document.querySelectorAll('#barrelEditorContainer tbody tr');
    if (rows.length === 0) return weapon.barrels && weapon.barrels.length > 0;

    // 获取表格中的枪管名称列表
    const tableNames = [];
    rows.forEach(row => {
      const name = row.querySelector('.barrel-edit-name')?.value?.trim() || '';
      if (name) tableNames.push(name);
    });

    const weaponNames = (weapon.barrels || []).map(b => b.name || '');

    // 简单比较长度和名称
    if (tableNames.length !== weaponNames.length) return true;
    for (let i = 0; i < tableNames.length; i++) {
      if (tableNames[i] !== weaponNames[i]) return true;
    }

    return false;
  }
}

export default BarrelEditor;