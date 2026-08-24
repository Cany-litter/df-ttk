import { 
  TIME_UNITS, 
  CHART_CONFIG, 
  SIMULATION_CONFIG 
} from '../core/config.js';
import { SimulationEngine } from '../core/SimulationEngine.js';
import { BulletStrategyFactory } from '../core/BulletStrategy.js';
import { formatTime } from '../utils/formatters.js';
import { resetSeed } from '../utils/rng.js';
import { getCacheManager } from '../core/CacheManager.js';

/**
 * 垂直线插件
 * 在距离图表上绘制垂直参考线
 */
const verticalLinePlugin = {
  id: 'verticalLine',
  afterDraw(chart) {
    const ctx = chart.ctx;
    const tooltip = chart.tooltip;
    if (!tooltip._active || !tooltip._active.length) return;

    const x = tooltip._active[0].element.x;
    const yTop = chart.scales.y.top;
    const yBottom = chart.scales.y.bottom;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, yBottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(33, 15, 199, 0.89)';
    ctx.stroke();
    ctx.restore();
  }
};

/**
 * 距离折线图专用类
 */
export class DistanceChart {
  constructor() {
    this.chart = null;
    this.showAllWeapons = false;
    this.lastStats = null;
    this.lastDistances = null;
    this.lastParams = null;
    this.lastArmed = null;
    this.lastAttachments = null;
    
    // 真实模拟相关
    this.isRealMode = false;
    this.selectedWeaponIndex = -1;
    this.cacheManager = getCacheManager();
    this.cachedBatchData = null;
    this.isCalculating = false;
    this.simProgress = 0;
    
    // 控制台日志控制
    this._hitRateLogPrinted = false;
    this._keyDistancesLogged = false;
    
    // 防重入锁
    this._isUpdating = false;
  }

  /**
   * 设置缓存管理器（允许外部注入）
   * @param {CacheManager} cacheManager
   */
  setCacheManager(cacheManager) {
    this.cacheManager = cacheManager;
  }

  // ============================================================
  // 1. 主更新方法
  // ============================================================

  /**
   * 更新距离图表
   */
  async update(armed, attachments, params) {
    // 防重入锁
    if (this._isUpdating) {
      console.log('⏳ 图表正在更新中，跳过本次请求');
      return;
    }
    this._isUpdating = true;
    
    try {
      resetSeed();
      
      // 读取真实模拟开关状态
      const toggle = document.getElementById('realSimulationToggle');
      this.isRealMode = toggle ? toggle.checked : false;
      
      // 更新状态提示
      this.updateStatusDisplay();
      
      const showAllCheckbox = document.getElementById('showAllWeapons');
      this.showAllWeapons = showAllCheckbox ? showAllCheckbox.checked : false;
      
      const distances = Array.from({ length: 101 }, (_, i) => i);
      
      // 保存参数供导出使用
      this.lastParams = params;
      this.lastArmed = armed;
      this.lastAttachments = attachments;
      this.lastDistances = distances;
      
      // 重置日志标记
      this._hitRateLogPrinted = false;
      this._keyDistancesLogged = false;
      
      // 根据模式选择计算方式
      let stats;
      if (this.isRealMode) {
        // 真实模拟模式：同时计算真实模拟和快速模式的数据
        stats = await this.calculateRealModeWithComparison(armed, attachments, params, distances);
      } else {
        // 快速模式：6个关键点插值，显示所有武器
        stats = this.calculateFastMode(armed, attachments, params, distances);
      }
      
      if (!stats || stats.length === 0) {
        console.warn('DistanceChart: 没有可用的统计数据');
        return;
      }
      
      stats.sort((a, b) => a.avg35 - b.avg35);
      
      // 保存数据供导出使用
      this.lastStats = stats;
      
      this.renderChart(distances, stats);
    } finally {
      this._isUpdating = false;
    }
  }

  // ============================================================
  // 2. 快速模式（原有逻辑）
  // ============================================================

  /**
   * 快速模式：在衰减边界两侧模拟，中间点插值
   * ⭐ 修复：返回毫秒值
   */
  calculateFastMode(armed, attachments, params, distances) {
    const dm = window.__app__?.dataManager;
    if (!dm) {
      console.error('DistanceChart: DataManager 未找到');
      return [];
    }

    return armed.map((w, idx) => {
      const selectedBulletType = attachments[idx]?.bulletType;
      
      let realBulletKey = SimulationEngine.getRealBulletKey(selectedBulletType, w, params, dm);
      
      if (!realBulletKey) {
        console.warn(`武器 ${w.name} 没有匹配的子弹，跳过`);
        return null;
      }
      
      const bulletData = dm.getBulletById(realBulletKey);
      if (!bulletData) {
        console.warn(`武器 ${w.name} 的子弹 ${realBulletKey} 不存在，跳过`);
        return null;
      }
      
      const strategy = BulletStrategyFactory.getStrategy(realBulletKey);
      
      // 关键点：在衰减边界两侧都添加模拟点
      const keyDistances = this.getKeyDistances(
        w.ranges || [40, 70, Infinity, Infinity],
        CHART_CONFIG.MAX_DISTANCE
      );
      
      if (!this._keyDistancesLogged) {
        console.log(`📊 [快速模式] ${w.name} 关键模拟点:`, keyDistances);
        this._keyDistancesLogged = true;
      }
      
      const simulationCache = new Map();
      
      // 在关键点执行模拟
      keyDistances.forEach(distance => {
        const hitRateAtDistance = this.getHitRateForDistance(
          params.hitRateMap,
          distance,
          0.85
        );
        
        const simParams = { 
          ...params, 
          distance, 
          hitRate: hitRateAtDistance, 
          bulletLevel: realBulletKey 
        };
        
        const { avgTime } = SimulationEngine.calculateAvgStats(
          w, 
          simParams, 
          SIMULATION_CONFIG.DEFAULT_SIM_COUNT, 
          strategy, 
          bulletData
        );
        
        const trigger = params.triggerDelayEnable 
          ? (w._current?.triggerDelay ?? w.triggerDelay ?? 0) / TIME_UNITS.SECONDS_TO_MS 
          : 0;
        
        // 存储秒值
        simulationCache.set(distance, avgTime + trigger);
      });
      
      // 对所有距离点计算 TTK（插值），返回秒
      const times = distances.map(d => {
        if (simulationCache.has(d)) {
          return simulationCache.get(d);
        } else {
          return this.calculateTTKByFormula(
            w, 
            d, 
            params, 
            strategy, 
            simulationCache,
            params.hitRateMap
          );
        }
      });
      
      const cutoff = distances.findIndex(d => d > CHART_CONFIG.CUTOFF_DISTANCE);
      const slice = cutoff === -1 ? times : times.slice(0, cutoff);
      const avg35 = slice.reduce((s, t) => s + t, 0) / slice.length;
      
      // 获取显示名称（优先使用 _displayName）
      const displayName = w._displayName || w.name;
      
      // ⭐ 关键修复：将秒转换为毫秒
      const timesMs = times.map(t => t * TIME_UNITS.SECONDS_TO_MS);
      const avg35Ms = avg35 * TIME_UNITS.SECONDS_TO_MS;
      
      return { weapon: w, times: timesMs, avg35: avg35Ms, displayName };
    }).filter(Boolean);
  }

  // ============================================================
  // 3. 真实模拟模式 + 对比
  // ============================================================

  /**
   * 真实模拟模式：同时计算真实模拟和快速模式的数据用于对比
   * 返回两个数据集：真实模拟曲线 + 快速模式曲线
   */
  async calculateRealModeWithComparison(armed, attachments, params, distances) {
    const dm = window.__app__?.dataManager;
    if (!dm) {
      console.error('DistanceChart: DataManager 未找到');
      return [];
    }

    // 获取选中的武器索引（价格表格中第一个启用的配置）
    const selectedIndex = this.getSelectedWeaponIndex(armed, attachments);
    
    if (selectedIndex === -1) {
      console.warn('⚠️ 真实模拟模式：没有找到启用的价格配置，请到"价格数据" Tab 中启用至少一个配置');
      this.showNoConfigWarning();
      return [];
    }

    this.selectedWeaponIndex = selectedIndex;
    const weapon = armed[selectedIndex];
    const attachment = attachments[selectedIndex] || {};
    
    // 获取显示名称
    const displayName = weapon._displayName || weapon.name;
    
    // 更新状态信息栏
    this.updateRealSimInfo(weapon, '准备计算...');
    
    // 获取子弹
    const selectedBulletType = attachment.bulletType;
    let realBulletKey = SimulationEngine.getRealBulletKey(selectedBulletType, weapon, params, dm);
    
    if (!realBulletKey) {
      console.warn(`武器 ${weapon.name} 没有匹配的子弹`);
      return [];
    }
    
    const bulletData = dm.getBulletById(realBulletKey);
    if (!bulletData) {
      console.warn(`武器 ${weapon.name} 的子弹 ${realBulletKey} 不存在`);
      return [];
    }
    
    const strategy = BulletStrategyFactory.getStrategy(realBulletKey);
    
    // ============================================================
    // 第一部分：计算真实模拟数据（101点精确模拟）
    // ============================================================
    const realTimes = await this.calculateRealSimulationData(
      weapon, attachment, params, distances, realBulletKey, bulletData, strategy, displayName
    );
    
    // ============================================================
    // 第二部分：计算快速模式数据（6点插值）- 用于对比
    // ============================================================
    console.log(`📊 [对比模式] 计算快速模式数据: ${displayName}`);
    this.updateRealSimInfo(weapon, '⏳ 计算快速模式对比数据...');
    
    const fastTimes = this.calculateFastModeForSingleWeapon(
      weapon, params, distances, realBulletKey, bulletData, strategy
    );
    
    // 计算 avg35
    const cutoff = distances.findIndex(d => d > CHART_CONFIG.CUTOFF_DISTANCE);
    const realSlice = cutoff === -1 ? realTimes : realTimes.slice(0, cutoff);
    const fastSlice = cutoff === -1 ? fastTimes : fastTimes.slice(0, cutoff);
    const realAvg35 = realSlice.reduce((s, t) => s + t, 0) / realSlice.length;
    const fastAvg35 = fastSlice.reduce((s, t) => s + t, 0) / fastSlice.length;
    
    this.updateRealSimInfo(weapon, '✅ 对比数据准备完成');
    
    // 返回两个数据集：真实模拟和快速模式
    return [
      { 
        weapon, 
        times: realTimes, 
        avg35: realAvg35, 
        displayName: `${displayName} (真实模拟)`,
        isRealSim: true 
      },
      { 
        weapon, 
        times: fastTimes, 
        avg35: fastAvg35, 
        displayName: `${displayName} (快速模式)`,
        isRealSim: false 
      }
    ];
  }

  /**
   * 计算真实模拟数据（101点精确模拟）
   * 修复：缓存读取时使用与写入时完全相同的参数
   */
  async calculateRealSimulationData(weapon, attachment, params, distances, realBulletKey, bulletData, strategy, displayName) {
    // 构建批量缓存 Key
    const batchKey = this.cacheManager.buildBatchKey(weapon, params, {
      barrelName: attachment.barrelName || '无',
      muzzleName: attachment.muzzleName || '无',
      bulletId: realBulletKey
    });
    
    // 检查是否有批量缓存
    const cachedBatch = this.cacheManager.get(batchKey);
    if (cachedBatch) {
      console.log(`📦 [真实模拟] 缓存命中: ${displayName}`);
      this.updateRealSimInfo(weapon, '✅ 缓存命中，立即显示');
      
      // 从缓存恢复数据，使用与写入时完全相同的参数
      const times = distances.map(d => {
        // 计算该点的命中率（与写入时保持一致）
        const hitRateAtDistance = this.getHitRateForDistance(
          params.hitRateMap,
          d,
          0.85
        );
        // 构建与写入时完全相同的 simParams
        // 关键：使用 realBulletKey 而不是 params.bulletLevel
        const simParams = { 
          ...params, 
          distance: d, 
          hitRate: hitRateAtDistance, 
          bulletLevel: realBulletKey
        };
        const pointKey = this.cacheManager.buildKey(weapon, simParams, {
          barrelName: attachment.barrelName || '无',
          muzzleName: attachment.muzzleName || '无',
          bulletId: realBulletKey
        });
        const cached = this.cacheManager.get(pointKey);
        return cached !== null ? cached : 0;
      });
      
      return times;
    }
    
    // 缓存未命中，执行真实模拟
    console.log(`🔬 [真实模拟] 开始计算: ${displayName} (101点 × 20000次模拟)`);
    this.updateRealSimInfo(weapon, '⏳ 计算真实模拟数据...');
    this.isCalculating = true;
    
    const times = [];
    const totalPoints = distances.length;
    const batchEntries = new Map();
    
    // 逐点计算
    for (let i = 0; i < totalPoints; i++) {
      const distance = distances[i];
      
      // 更新进度
      this.simProgress = ((i + 1) / totalPoints * 100);
      this.updateRealSimInfo(weapon, `⏳ 真实模拟 ${i + 1}/${totalPoints} (${Math.round(this.simProgress)}%)`);
      
      // 计算该点的命中率
      const hitRateAtDistance = this.getHitRateForDistance(
        params.hitRateMap,
        distance,
        0.85
      );
      
      const simParams = { 
        ...params, 
        distance, 
        hitRate: hitRateAtDistance, 
        bulletLevel: realBulletKey
      };
      
      // 执行 20000 次模拟，返回平均 TTK（秒）
      const avgTime = SimulationEngine.calculateSinglePoint(
        weapon, 
        simParams, 
        SIMULATION_CONFIG.DEFAULT_SIM_COUNT, 
        strategy, 
        bulletData
      );
      
      // 计算扳机延迟（秒）
      const trigger = params.triggerDelayEnable 
        ? (weapon._current?.triggerDelay ?? weapon.triggerDelay ?? 0) / TIME_UNITS.SECONDS_TO_MS 
        : 0;
      
      // 转换为毫秒
      const totalTimeMs = (avgTime + trigger) * TIME_UNITS.SECONDS_TO_MS;
      times.push(totalTimeMs);
      
      // 存入缓存（毫秒）
      const pointKey = this.cacheManager.buildKey(weapon, simParams, {
        barrelName: attachment.barrelName || '无',
        muzzleName: attachment.muzzleName || '无',
        bulletId: realBulletKey
      });
      batchEntries.set(pointKey, totalTimeMs);
    }
    
    // 批量存入缓存
    this.cacheManager.setBatch(batchEntries);
    this.cacheManager.set(batchKey, 'cached');
    
    this.isCalculating = false;
    
    console.log(`✅ [真实模拟] ${displayName} 计算完成，已缓存 ${times.length} 个点 (单位: ms)`);
    this.cacheManager.logStats();
    
    return times;
  }

  /**
   * 计算单把武器的快速模式数据（用于对比）
   * ⭐ 修复：返回毫秒值
   */
  calculateFastModeForSingleWeapon(weapon, params, distances, realBulletKey, bulletData, strategy) {
    // 关键点：在衰减边界两侧都添加模拟点
    const keyDistances = this.getKeyDistances(
      weapon.ranges || [40, 70, Infinity, Infinity],
      CHART_CONFIG.MAX_DISTANCE
    );
    
    const simulationCache = new Map();
    
    // 在关键点执行模拟
    keyDistances.forEach(distance => {
      const hitRateAtDistance = this.getHitRateForDistance(
        params.hitRateMap,
        distance,
        0.85
      );
      
      const simParams = { 
        ...params, 
        distance, 
        hitRate: hitRateAtDistance, 
        bulletLevel: realBulletKey 
      };
      
      const { avgTime } = SimulationEngine.calculateAvgStats(
        weapon, 
        simParams, 
        SIMULATION_CONFIG.DEFAULT_SIM_COUNT, 
        strategy, 
        bulletData
      );
      
      const trigger = params.triggerDelayEnable 
        ? (weapon._current?.triggerDelay ?? weapon.triggerDelay ?? 0) / TIME_UNITS.SECONDS_TO_MS 
        : 0;
      
      simulationCache.set(distance, avgTime + trigger);
    });
    
    // 对所有距离点计算 TTK（插值）
    const times = distances.map(d => {
      if (simulationCache.has(d)) {
        return simulationCache.get(d);
      } else {
        return this.calculateTTKByFormula(
          weapon, 
          d, 
          params, 
          strategy, 
          simulationCache,
          params.hitRateMap
        );
      }
    });
    
    // ⭐ 关键修复：将秒转换为毫秒
    const timesMs = times.map(t => t * TIME_UNITS.SECONDS_TO_MS);
    return timesMs;
  }

  // ============================================================
  // 4. 辅助方法
  // ============================================================

  /**
   * 获取选中的武器索引（价格表格中第一个启用的配置）
   */
  getSelectedWeaponIndex(armed, attachments) {
    // 尝试从价格表格读取启用的配置
    const priceTable = document.getElementById('priceTable');
    if (!priceTable) return -1;
    
    const rows = priceTable.querySelectorAll('tbody tr');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const checkbox = row.querySelector('.price-enabled-checkbox');
      if (checkbox && checkbox.checked) {
        if (i < armed.length) {
          return i;
        }
      }
    }
    
    return armed.length > 0 ? 0 : -1;
  }

  /**
   * 获取射程边界点两侧的关键距离
   */
  getKeyDistances(ranges, maxDistance) {
    const validRanges = ranges.filter(r => r !== Infinity && r <= maxDistance);
    
    const keyDistances = [0];
    
    for (const range of validRanges) {
      const before = Math.max(0, range - 1);
      if (before > 0 && !keyDistances.includes(before)) {
        keyDistances.push(before);
      }
      if (!keyDistances.includes(range)) {
        keyDistances.push(range);
      }
    }
    
    if (!keyDistances.includes(maxDistance)) {
      keyDistances.push(maxDistance);
    }
    
    return [...new Set(keyDistances)].sort((a, b) => a - b);
  }

  /**
   * 根据距离从命中率映射中获取对应的命中率
   */
  getHitRateForDistance(hitRateMap, distance, fallback = 0.85) {
    const dm = window.__app__?.dataManager;
    if (dm && typeof dm.getHitRateFromMap === 'function') {
      const result = dm.getHitRateFromMap(hitRateMap, distance, fallback);
      this._logHitRateOnce(hitRateMap, distance, result);
      return result;
    }
    return fallback;
  }

  /**
   * 控制台日志输出 - 只输出一次
   */
  _logHitRateOnce(hitRateMap, distance, rate) {
    if (this._hitRateLogPrinted) return;
    
    const logDistances = [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100];
    if (!logDistances.includes(Math.round(distance))) return;
    
    const mapStr = hitRateMap && hitRateMap.length > 0
      ? hitRateMap.map(p => `${p.distance}m:${Math.round(p.rate * 100)}%`).join(', ')
      : '无映射';
    
    console.log(
      `📊 [距离-命中率] ${Math.round(distance)}m → ${Math.round(rate * 100)}%  ` +
      `(映射: ${mapStr})`
    );
    
    if (Math.round(distance) === 100) {
      this._hitRateLogPrinted = true;
      console.log('✅ 距离-命中率日志输出完成 (仅输出关键距离点)');
    }
  }

  /**
   * 使用公式计算TTK（在模拟点之间线性插值）
   */
  calculateTTKByFormula(weapon, distance, params, strategy, simulationCache, hitRateMap) {
    const keys = Array.from(simulationCache.keys()).filter(k => k <= distance);
    const startDistance = keys.length ? Math.max(...keys) : 0;
    const startTTK = simulationCache.get(startDistance);
    
    if (!startTTK) {
      return 0;
    }
    
    if (distance === startDistance) {
      return startTTK;
    }
    
    const nextKeys = Array.from(simulationCache.keys())
      .filter(k => k > distance)
      .sort((a, b) => a - b);
    
    if (nextKeys.length > 0) {
      const nextDistance = nextKeys[0];
      const nextTTK = simulationCache.get(nextDistance);
      
      if (nextTTK !== undefined && nextTTK !== null) {
        const t = (distance - startDistance) / (nextDistance - startDistance);
        return startTTK + t * (nextTTK - startTTK);
      }
    }
    
    const velocity = weapon._current?.velocity ?? weapon.velocity ?? 575;
    const flightTimeDiff = (distance - startDistance) / velocity;
    return startTTK + flightTimeDiff;
  }

  // ============================================================
  // 5. UI 状态更新
  // ============================================================

  /**
   * 更新状态显示
   */
  updateStatusDisplay() {
    const statusEl = document.getElementById('simStatus');
    if (!statusEl) return;
    
    if (this.isRealMode) {
      statusEl.textContent = '(真实模拟+对比)';
      statusEl.className = 'hint-text mode-real';
    } else {
      statusEl.textContent = '(快速模式)';
      statusEl.className = 'hint-text mode-fast';
    }
  }

  /**
   * 更新真实模拟信息栏
   */
  updateRealSimInfo(weapon, status) {
    const infoEl = document.getElementById('realSimInfo');
    const nameEl = document.getElementById('simWeaponName');
    const progressEl = document.getElementById('simProgress');
    
    if (!infoEl) return;
    
    if (this.isRealMode) {
      infoEl.style.display = 'flex';
      if (nameEl && weapon) {
        const displayName = weapon._displayName || weapon.name;
        nameEl.textContent = displayName || '未知武器';
      }
      if (progressEl) {
        progressEl.textContent = status;
      }
    } else {
      infoEl.style.display = 'none';
    }
  }

  /**
   * 显示无配置警告
   */
  showNoConfigWarning() {
    const infoEl = document.getElementById('realSimInfo');
    if (infoEl) {
      infoEl.style.display = 'flex';
      infoEl.style.background = '#fff3e0';
      infoEl.style.borderColor = '#ffcc80';
      const nameEl = document.getElementById('simWeaponName');
      if (nameEl) {
        nameEl.textContent = '⚠️ 请先在"价格数据" Tab 中启用至少一个配置';
      }
      const progressEl = document.getElementById('simProgress');
      if (progressEl) {
        progressEl.textContent = '';
      }
    }
  }

  // ============================================================
  // 6. 缓存管理（导出/导入/清除）
  // ============================================================

  /**
   * 导出当前缓存
   */
  exportCache() {
    const stats = this.cacheManager.getStats();
    if (stats.size === 0) {
      alert('⚠️ 缓存为空，请先执行真实模拟后再导出！');
      return;
    }

    let weaponName = 'unknown';
    let weaponId = null;
    let barrelName = '无';
    let muzzleName = '无';
    let bulletId = 'default';
    
    if (this.selectedWeaponIndex >= 0 && this.lastArmed) {
      const weapon = this.lastArmed[this.selectedWeaponIndex];
      if (weapon) {
        weaponName = weapon._displayName || weapon.name || 'unknown';
        weaponId = weapon.id || null;
      }
    }
    
    if (this.lastAttachments && this.lastAttachments[this.selectedWeaponIndex]) {
      const att = this.lastAttachments[this.selectedWeaponIndex];
      barrelName = att.barrelName || '无';
      muzzleName = att.muzzleName || '无';
      bulletId = att.bulletType || 'default';
    }
    
    const meta = {
      weaponName,
      weaponId,
      barrelName,
      muzzleName,
      bulletId,
      distancePoints: 101,
      simCount: SIMULATION_CONFIG.DEFAULT_SIM_COUNT,
      params: this.lastParams || {}
    };
    
    this.cacheManager.exportToFile(meta);
    this.updateCacheStats();
  }

  /**
   * 导入缓存文件
   */
  async importCache() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    return new Promise((resolve) => {
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) {
          resolve(false);
          return;
        }
        
        try {
          const result = await this.cacheManager.importFromFile(file);
          this.updateCacheStats();
          
          alert(
            `✅ 缓存导入成功！\n` +
            `武器: ${result.weaponName}\n` +
            `导入: ${result.imported} 条新条目\n` +
            `跳过: ${result.skipped} 条已存在\n` +
            `导出时间: ${result.exportedAt || '未知'}`
          );
          
          console.log('💡 缓存已导入，请点击"距离折线图"按钮刷新图表');
          
          resolve(true);
        } catch (error) {
          alert(`❌ 导入失败: ${error.message}`);
          resolve(false);
        }
      };
      
      input.click();
    });
  }

  /**
   * 清除缓存
   */
  clearCache() {
    if (!confirm('⚠️ 确定要清除所有缓存数据吗？\n（清除后将需要重新计算）')) {
      return;
    }
    
    const count = this.cacheManager.clear();
    this.updateCacheStats();
    alert(`✅ 已清除 ${count} 条缓存`);
    
    if (this.lastParams && this.lastArmed && this.lastAttachments) {
      this.update(this.lastArmed, this.lastAttachments, this.lastParams);
    }
  }

  /**
   * 更新缓存统计显示
   */
  updateCacheStats() {
    const statsEl = document.getElementById('cacheStats');
    if (!statsEl) return;
    
    const stats = this.cacheManager.getStats();
    statsEl.textContent = `缓存: ${stats.size}条`;
    statsEl.className = 'cache-stats' + (stats.size > 0 ? ' has-cache' : '');
  }

  // ============================================================
  // 7. 渲染图表
  // ============================================================

  /**
   * 渲染距离图表
   * 修复：Y轴和tooltip传入 isMs: true，因为数据已经是毫秒
   */
  renderChart(distances, stats) {
    // 真实模拟模式下，显示两条曲线（真实模拟 + 快速模式对比）
    let displayStats = stats;
    
    // 如果是真实模拟模式，但 stats 中可能包含多个武器，我们只取与当前选中武器相关的
    if (this.isRealMode) {
      // 过滤出与当前选中武器相关的数据（真实模拟和快速模式）
      const weaponId = this.lastArmed?.[this.selectedWeaponIndex]?.id;
      if (weaponId) {
        displayStats = stats.filter(s => s.weapon.id === weaponId);
      }
      // 如果过滤后为空，使用全部
      if (displayStats.length === 0) {
        displayStats = stats;
      }
    }
    
    const maxDisplay = this.showAllWeapons ? displayStats.length : CHART_CONFIG.TOP_WEAPONS_COUNT;
    const displayCount = Math.min(maxDisplay, displayStats.length);

    // 构建数据集
    const datasets = displayStats.map((s, i) => {
      const isRealSim = s.isRealSim === true;
      
      return {
        label: s.displayName || s.weapon.name,
        data: s.times,
        fill: false,
        tension: 0,
        hidden: i >= displayCount,
        pointRadius: 0,
        pointHoverRadius: 3,
        // 真实模拟：红色粗实线；快速模式：蓝色虚线
        borderColor: isRealSim ? '#f44336' : '#2196f3',
        borderWidth: isRealSim ? 3 : 2,
        borderDash: isRealSim ? [] : [8, 4],
        // 图例标记样式
        pointStyle: isRealSim ? 'circle' : 'rectRot',
        pointBackgroundColor: isRealSim ? '#f44336' : '#2196f3',
      };
    });

    if (datasets.length > 0 && displayCount === 0) {
      datasets[0].hidden = false;
    }

    if (this.chart) this.chart.destroy();
    
    const distCtx = this.getChartContext('distanceChart');
    this.chart = new Chart(distCtx, {
      type: 'line',
      data: { labels: distances, datasets },
      options: {
        scales: {
          x: { title: { display: true, text: '距离 (m)' } },
          y: { 
            beginAtZero: true, 
            title: { display: true, text: '平均 TTK (ms)' }, 
            ticks: { 
              // 传入 isMs: true，因为数据已经是毫秒
              callback: v => formatTime(v, 'ms_raw', true) 
            } 
          }
        },
        plugins: {
          datalabels: { display: false },
          tooltip: {
            mode: 'index', 
            intersect: false, 
            itemSort: (a, b) => a.parsed.y - b.parsed.y, 
            callbacks: {
              title: items => `${items[0].label}m`,
              label: i => {
                const label = i.dataset.label || '武器';
                // 传入 isMs: true，因为数据已经是毫秒
                const value = formatTime(i.raw, 'ms', true);
                // 真实模拟模式添加标记
                const isReal = i.dataset.borderColor === '#f44336' || i.dataset.label?.includes('真实模拟');
                const marker = isReal ? ' 🎯' : ' 📊';
                return `${label}${marker}: ${value}`;
              }
            }
          },
          legend: { 
            position: 'bottom', 
            labels: { 
              usePointStyle: true,
              font: displayStats.length > 20 ? { size: 10 } : { size: 12 },
              padding: displayStats.length > 20 ? 4 : 8
            } 
          }
        },
        hover: {
          mode: 'index',
          intersect: false
        },
        interaction: {
          mode: 'index',
          intersect: false
        }
      },
      plugins: [ChartDataLabels, verticalLinePlugin]
    });
    
    // 更新缓存统计
    this.updateCacheStats();
  }

  /**
   * 获取图表上下文
   */
  getChartContext(chartId) {
    return document.getElementById(chartId).getContext('2d');
  }

  /**
   * 销毁图表
   */
  destroy() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

  /**
   * 切换显示模式
   */
  setShowAllWeapons(showAll) {
    this.showAllWeapons = showAll;
  }

  // ============================================================
  // 8. 导出功能
  // ============================================================

  getWeaponsTableData(armed, attachments, muzzles) {
    return armed.map((w, idx) => {
      const attach = attachments[idx] || {};
      
      const current = w._current || w;
      const original = w._original || w;
      
      const rangesStr = (current.ranges || []).map(r => 
        r === Infinity ? '∞' : Math.round(r)
      ).join(',');
      
      const mult = current.mult || { head: 1, chest: 1, stomach: 1, limbs: 1 };
      const partDamage = [
        (current.flesh * (mult.head || 1)).toFixed(1),
        (current.flesh * (mult.chest || 1)).toFixed(1),
        (current.flesh * (mult.stomach || 1)).toFixed(1),
        (current.flesh * (mult.limbs || 1)).toFixed(1)
      ].join(',');
      
      let barrelName = '无';
      const barrelIndex = attach.barrelIndex || 0;
      if (barrelIndex > 0 && w.barrels && w.barrels[barrelIndex - 1]) {
        barrelName = w.barrels[barrelIndex - 1].name || '无';
      }
      
      let muzzleName = '无';
      const muzzleIndex = attach.muzzleIndex || 0;
      if (muzzleIndex > 0 && muzzles && muzzles[muzzleIndex]) {
        muzzleName = muzzles[muzzleIndex].name || '无';
      }
      
      const hitRate = attach.hitRate !== undefined && attach.hitRate !== null 
        ? attach.hitRate 
        : (original.hitRate !== undefined && original.hitRate !== null ? original.hitRate : '');
      
      let velocityPrecision = '0%';
      const precisionSlider = document.querySelector(`.velocity-precision-slider[data-weapon="${idx}"]`);
      if (precisionSlider) {
        const val = parseFloat(precisionSlider.value) || 0;
        velocityPrecision = `${Math.round(val * 100)}%`;
      }
      
      return {
        name: w._displayName || w.name || '未知',
        type: w.type || '未知',
        rof: Math.round(current.rof || 0),
        ranges: rangesStr,
        flesh: Math.round(current.flesh || 0),
        armor: Math.round(current.armor || 0),
        partDamage: partDamage,
        barrel: barrelName,
        muzzle: muzzleName,
        bulletType: attach.bulletType || '全局',
        hitRate: hitRate,
        velocityPrecision: velocityPrecision
      };
    });
  }

  /**
   * 获取距离数据并计算排名
   * 修复：times 已经是毫秒，不再乘以 1000
   */
  getDistanceDataWithRanks(stats, distances, step = 5) {
    const filteredDistances = distances.filter((d, i) => i % step === 0);
    
    const weaponsData = stats.map((s) => {
      const ttkValues = filteredDistances.map(d => {
        const idx = distances.indexOf(d);
        const value = s.times[idx];
        // 移除 * 1000，因为 times 已经是毫秒
        return value !== undefined ? parseFloat(value.toFixed(2)) : null;
      });
      
      const ranks = filteredDistances.map((d, distIdx) => {
        const currentTtk = ttkValues[distIdx];
        if (currentTtk === null || currentTtk === undefined) return null;
        
        const allTtks = stats.map((other) => {
          const idx = distances.indexOf(d);
          const val = other.times[idx];
          // 移除 * 1000，因为 times 已经是毫秒
          return val !== undefined ? parseFloat(val.toFixed(2)) : Infinity;
        });
        
        const sorted = [...allTtks].sort((a, b) => a - b);
        let rankIndex = sorted.findIndex(v => v === currentTtk);
        if (rankIndex === -1) {
          rankIndex = sorted.findIndex(v => Math.abs(v - currentTtk) < 0.01);
        }
        if (rankIndex === -1) {
          rankIndex = sorted.indexOf(currentTtk);
        }
        const rank = rankIndex + 1;
        
        return rank;
      });
      
      return {
        name: s.displayName || s.weapon.name,
        ttk: ttkValues,
        ranks: ranks
      };
    });
    
    const orderedWeaponsData = stats.map(s => 
      weaponsData.find(w => w.name === (s.displayName || s.weapon.name))
    ).filter(Boolean);
    
    return {
      distances: filteredDistances,
      weapons: orderedWeaponsData
    };
  }

  exportAsJSON() {
    if (!this.lastStats || !this.lastDistances) {
      alert('⚠️ 请先生成折线图再导出数据！');
      return;
    }

    const stats = this.lastStats;
    const distances = this.lastDistances;
    const params = this.lastParams || {};
    const armed = this.lastArmed || [];
    const attachments = this.lastAttachments || [];

    let muzzles = [];
    if (window.__app__?.dataManager) {
      muzzles = window.__app__.dataManager.getMuzzles() || [];
    }

    const weaponsTableData = this.getWeaponsTableData(armed, attachments, muzzles);
    const distanceData = this.getDistanceDataWithRanks(stats, distances, 5);

    const data = {
      meta: {
        exportedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
        description: 'TTK计算器 - 折线图数据导出',
        mode: this.isRealMode ? 'real_simulation_with_comparison' : 'fast',
        params: {
          bulletLevel: params.bulletLevel,
          armorLevel: params.armorLevel,
          armorValue: params.armorValue,
          helmetLevel: params.helmetLevel,
          helmetValue: params.helmetValue,
          healthValue: params.healthValue,
          hitRate: params.hitRate,
          triggerDelayEnable: params.triggerDelayEnable,
          distance: params.distance
        },
        note: 'TTK值单位: 毫秒(ms)，数据点间隔5米。真实模拟模式同时显示真实模拟(红色实线)和快速模式(蓝色虚线)对比数据。'
      },
      weapons: weaponsTableData,
      distanceData: {
        distances: distanceData.distances,
        weapons: distanceData.weapons
      }
    };

    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    this.downloadBlob(blob, `ttk_distance_data_${new Date().toISOString().slice(0, 10)}.json`);
  }

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`✅ 已导出: ${filename}`);
  }
}

export default DistanceChart;