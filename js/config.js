/* =========================================================================
 * config.js
 * 模块来源小节：配置与状态
 * 说明：本文件由单文件 index.html 按原小节注释机械拆分而来，
 *       代码逐字保留，函数仍为全局（经典 script 加载，双击 file 可用）。
 * ========================================================================= */

/* ============ 配置与状态 ============ */
const CFG = { refreshMs: 5000 };
const APP_VER = '2026-08-10y';  // y=机会精选算法核心修复: 因子权重/方向估计从「全历史」改为「近期滚动窗口(≈24时点≈1年)」, 只学当前regime风格避免动量市/反转市切换时方向被稀释致RankIC≈0; 推荐更靠谱; x=修复降级角标永久清不掉; w=UI调整; v=周末bar检测+过滤; u=数据校准守护; t/s/r=历史迭代
// r=全局贯穿十字线: 主图与MACD/KDJ/RSI副图坐标系统一(padL=8/padR=58), 光标竖线贯穿全部图表+副图图例实时显示当前值+副图反向联动主图。
// q=股票/ETF K线源切换: 新浪不复权→腾讯前复权(qfq), 消除除权/拆分/分红导致的BOLL椭圆/MA/MACD/KDJ/RSI失真; 港股/美股仍走新浪JSONP。
const CHART_PADL = 8, CHART_PADR = 58;   // 主图/副图共用的左右边距 —— 保证十字线跨图严格对齐，勿单独修改
const LS_WATCH = 'sfm_watch_v2';
const LS_HOLD  = 'sfm_hold_v2';
const LS_WATCH_CATS = 'sfm_watch_cats_v1';
const UP='#e01f22', DOWN='#0f9d58', FLAT='#3a4250', GRID='#e6eaf1', GRIDC='#c7cfdb';

let state = {
  watch: [],
  hold: [],
  watchCats: [{id:'def', name:'默认'}],   // 自选自定义分类
  watchCat: 'all',                         // 当前选中的分类筛选：'all'=全部，否则=分类id
  selected: null,
  period: 'd',
  view: 'market',
  ind: {ma:true,boll:true,macd:true,kdj:true,rsi:true},
  auto: true,
  quotes: {},
  fundData: {},
  kcache: {},
  faCode: null,
  faPeriod: 90,
  faLoading: false,
  demo: false,
  anaMode: 'single',  // 建仓分析视图模式：'single'=单只研判，'portfolio'=按当前持仓组合研判（组合模式下 renderAnalysis 闸门跳过重绘，避免被单只K线/行情刷新回调覆盖）
  macdParam: { fast:12, slow:26, signal:9 }  // MACD 副图/速览参数（预设档位可选），大师评级仍走标准 12/26/9（macd() 不传参即默认）
};

