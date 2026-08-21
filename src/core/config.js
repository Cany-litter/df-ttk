// 命中部位常量
export const HIT_KEYS = ['head', 'chest', 'stomach', 'limbs'];

// 命中概率校验容差
export const HIT_PROB_TOLERANCE = 1e-6;

// 图表配置
export const CHART_CONFIG = {
  // 距离图表配置
  MAX_DISTANCE: 100,
  CUTOFF_DISTANCE: 35,
  // 显示配置
  TOP_WEAPONS_COUNT: 10,
  PADDING_TOP: 40
};

// 模拟配置
export const SIMULATION_CONFIG = {
  DEFAULT_SIM_COUNT: 20000,
  DISTANCE_SIM_COUNT: 20000
};

// 枪口精度加成
export const MUZZLE_PRECISION_BONUS = 1.09;

// 时间单位转换
export const TIME_UNITS = {
  SECONDS_TO_MS: 1000,
  MINUTES_TO_SECONDS: 60
};

// 图表颜色配置
export const CHART_COLORS = {
  NO_MISS_FIRE: 'rgba(54, 162, 235, 0.7)',
  EMPTY_DELAY: 'rgba(75, 192, 192, 0.7)',
  FLIGHT_DELAY: 'rgba(255, 159, 64, 0.7)',
  BURST_INTERVAL: 'rgba(255, 99, 132, 0.7)',
  TRIGGER_DELAY: 'rgba(153, 102, 255, 0.7)'
};

// 排名变化颜色
export const RANK_COLORS = {
  NO_CHANGE: '#000000',  // 黑色表示无变化
  RANK_UP: '#ff0000',    // 红色表示排名提升
  RANK_DOWN: '#00ff00'   // 绿色表示排名下降
};

// ==================== 新增配置 ====================

// 默认改枪配置
export const DEFAULT_CONFIG = {
  id: 'cfg-1',
  code: 'default-01',
  price: 0,
  selectedBarrel: 0,
  selectedMuzzle: 0,
  precision: 0.09,
  hitRatePoints: [],
  bulletType: 4,
  ammoCount: 120
};

// 默认武器基础属性
export const DEFAULT_WEAPON = {
  ranges: [40, 70, Infinity, Infinity],
  decays: [1.0, 0.85, 0.7, 0.7, 0.7],
  velocity: 575,
  flesh: 30,
  armor: 35,
  rof: 600,
  triggerDelay: 0,
  barrels: [],
  mult: { head: 1.9, chest: 1, stomach: 0.9, limbs: 0.4 },
  allowedBullets: [1, 2, 3, 4, 5]
};

// 武器类型对应的默认弹药携带数量
export const DEFAULT_AMMO_COUNT_BY_TYPE = {
  '手枪': 30,
  '冲锋枪': 90,
  '步枪': 120,
  '精确射手步枪': 60,
  '轻机枪': 200,
  '机枪': 200
};

// 最大改枪配置数量
export const MAX_CONFIGS_PER_WEAPON = 20;

// 最大命中率点数量
export const MAX_HITRATE_POINTS = 3;

// 精校值范围
export const PRECISION_RANGE = {
  MIN: -0.09,
  MAX: 0.09,
  STEP: 0.01
};

// 子弹等级范围
export const BULLET_LEVELS = [1, 2, 3, 4, 5];

// 护甲等级范围
export const ARMOR_LEVELS = [1, 2, 3, 4, 5, 6];

// 武器类型列表
export const WEAPON_TYPES = [
  '步枪',
  '冲锋枪',
  '轻机枪',
  '精确射手步枪',
  '手枪'
];

// 枪口类型列表
export const MUZZLE_TYPES = [
  '无',
  '死寂',
  '先进/轻语/勇火',
  '冲锋枪回声消音器'
];

// 命中率点默认值
export const DEFAULT_HITRATE_POINT = {
  distance: 30,
  rate: 0.80
};

// 价格格式化选项
export const PRICE_FORMAT = {
  THOUSAND_SEPARATOR: true,
  DECIMAL_PLACES: 0
};