/* =========================================================================
 * verify_ensure_today.js —— 真根因验收：腾讯 fqkline 滞后时，用实时行情合成今日K线bar
 * 并验证 ETF/LOF 实时行情价格单位自动校准（分 vs 元）。
 *
 * 背景（boss 真实反馈）：添加 515050 后 K 线仍停在 8/10。根因不是刷新链/缓存，
 * 而是腾讯日K线接口在收盘后数小时才发布当日bar，而实时行情(qt.gtimg.cn)已到今天。
 * 此外腾讯 qt 对 ETF 的价格字段单位不统一：有些返回“分”（105.26）、有些返回“元”（0.55），
 * 必须以 K 线（fqkline，单位元）为基准自动校准，不能按代码前缀硬除。
 *
 * 本测试构造：
 *   - 一段停在 8/10 的 K 线缓存（模拟 fqkline 滞后）
 *   - 一条“今天 8/11、带真实 OHLC”的实时行情（模拟 qt 已更新）
 * 然后断言 ensureTodayBar() 用行情合成出 8/11 bar，并自动校准行情价格单位。
 * ========================================================================= */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
const ORDER = ['config.js', 'utils.js', 'demo.js', 'calibrator.js', 'kline.js', 'quotes.js'];

let pass = true; const log = [];
function check(name, cond, detail){ if(cond) log.push('✅ '+name+(detail?' · '+detail:'')); else { pass=false; log.push('❌ '+name+(detail?' · '+detail:'')); } }

// 受控时钟：今天 = 2026-08-11（北京时间 15:00）
const FIXED = Date.UTC(2026, 7, 11, 7, 0, 0);
class FakeDate extends Date {
  constructor(...a){ if(a.length===0) super(FIXED); else super(...a); }
  static now(){ return FIXED; }
}

function bar(date, close){ return { date, open:+(close-0.01).toFixed(3), close:+close.toFixed(3), high:+(close+0.02).toFixed(3), low:+(close-0.03).toFixed(3), vol:100 }; }

// 真实形态行情（对应 parseTencent 的 f[3]/f[5]/f[33]/f[34]/f[36]/f[30]）
function realQuote(time, o, h, l, c, v){
  return { code:'sh515050', name:'515050', price:c, prevClose:o, open:o, time:time, change:0, changePct:0, high:h, low:l, volume:v, amount:0 };
}

(async()=>{
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdomError: '+(e.detail||e.message||e)));
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT,'index.html'),'utf8').replace(/\r\n/g,'\n').split('\n').filter(l=>!/^\s*<script src="js\//.test(l)).join('\n'),
    { runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc, url:'file://'+ROOT+'/' });
  const { window } = dom;
  window.Date = FakeDate;
  for(const f of ORDER){ const s=window.document.createElement('script'); s.textContent=fs.readFileSync(path.join(ROOT,'js',f),'utf8'); window.document.body.appendChild(s); }
  if(errors.length){ check('模块加载无错', false, errors.slice(0,2).join(';')); }

  const ev = (code) => window.eval(code);

  // 场景1：K线停在 8/10（close≈1.0，与真实ETF价一致），实时行情是今天 8/11（元单位）
  ev("state.quotes={}; state.kcache={};");
  ev("state.quotes['sh515050']="+JSON.stringify(realQuote('2026/08/11 16:02:00', 1.007, 1.038, 0.995, 1.017, 1234567))+";");
  ev("state.kcache['sh515050d']="+JSON.stringify([bar('2026-08-08',1.00),bar('2026-08-09',1.005),bar('2026-08-10',1.010)])+";");
  ev("state.kcache['sh515050d']._date='2026-08-10';");

  const r1 = ev("ensureTodayBar('sh515050','d')")
  const k1 = ev("state.kcache['sh515050d']");
  const last1 = k1[k1.length-1];
  check('S1 ensureTodayBar 返回 true（成功合成今日bar）', r1===true, 'return='+r1);
  check('S2 缓存末日从 8/10 推进到 8/11', last1.date==='2026-08-11', '末日='+last1.date);
  check('S3 合成的今日bar OHLC 与行情一致', last1.open===1.007 && last1.high===1.038 && last1.low===0.995 && last1.close===1.017, 'O='+last1.open+' H='+last1.high+' L='+last1.low+' C='+last1.close);
  check('S4 _date 已标记为今日', k1._date==='2026-08-11', '_date='+k1._date);
  check('S5 缓存长度 +1（新增而非覆盖）', k1.length===4, 'len='+k1.length);

  // 场景2：同一行情时间戳再次调用，应跳过（不重复合成、不翻倍）
  const r2 = ev("ensureTodayBar('sh515050','d')");
  const k2 = ev("state.kcache['sh515050d']");
  check('S6 同时间戳重复调用返回 false（幂等）', r2===false, 'return='+r2);
  check('S7 不重复插入今日bar（len 仍为 4）', k2.length===4, 'len='+k2.length);

  // 场景3：行情不是今天（如周末/停牌/非交易）→ 不合成，防误植
  ev("state.quotes['sh515050']="+JSON.stringify(realQuote('2026/08/10 15:00:00', 1.007, 1.038, 0.995, 1.017, 100))+";");
  const r3 = ev("ensureTodayBar('sh515050','d')");
  const k3 = ev("state.kcache['sh515050d']");
  check('S8 行情非今日时不合成（返回 false）', r3===false, 'return='+r3);
  check('S9 行情非今日时不改变末日(仍 8/11)', k3[k3.length-1].date==='2026-08-11', '末日='+k3[k3.length-1].date);

  // 场景4：实时行情 OHLC 异常（高<开）→ 不合成，避免脏数据
  ev("state.quotes['sh515050']="+JSON.stringify(realQuote('2026/08/11 16:02:00', 1.5, 1.0, 0.9, 1.2, 100))+";");
  const r4 = ev("ensureTodayBar('sh515050','d')");
  check('S10 行情 OHLC 异常（high<open）时不合成', r4===false, 'return='+r4);

  // 场景5：缓存为空 / 演示数据 → 不合成
  ev("state.kcache['sh999999d']=[];");
  ev("state.kcache['sh999999d']._demo=true;");
  const r5 = ev("ensureTodayBar('sh999999','d')");
  check('S11 演示/空缓存不合成', r5===false, 'return='+r5);

  // 场景6：行情返回“分”单位（price=105.26），K线是元（close≈1.0）→ 自动 ÷100 校准
  ev("state.quotes={}; state.kcache={};");
  ev("state.quotes['sh515050']="+JSON.stringify(realQuote('2026/08/11 16:02:00', 100.7, 106.0, 99.5, 105.26, 1234567))+";");
  ev("state.kcache['sh515050d']="+JSON.stringify([bar('2026-08-08',1.00),bar('2026-08-09',1.005),bar('2026-08-10',1.010)])+";")
  ev("state.kcache['sh515050d']._date='2026-08-10';");
  const r6 = ev("ensureTodayBar('sh515050','d')");
  const k6 = ev("state.kcache['sh515050d']");
  const last6 = k6[k6.length-1];
  const q6 = ev("state.quotes['sh515050']");
  check('S12 行情“分”单位时自动÷100并合成正确bar', r6===true && Math.abs(last6.close-1.0526)<1e-9 && Math.abs(last6.open-1.007)<1e-9 && Math.abs(last6.high-1.06)<1e-9 && Math.abs(last6.low-0.995)<1e-9, 'C='+last6.close+' H='+last6.high+' q.price='+q6.price);

  // 场景7：行情返回“元”单位（price=0.55），K线也是元（close≈0.55）→ 不缩放
  ev("state.quotes={}; state.kcache={};");
  ev("state.quotes['sz159608']="+JSON.stringify(realQuote('2026/08/11 16:02:00', 0.54, 0.56, 0.53, 0.55, 987654))+";");
  ev("state.kcache['sz159608d']="+JSON.stringify([bar('2026-08-08',0.53),bar('2026-08-09',0.54),bar('2026-08-10',0.545)])+";");
  ev("state.kcache['sz159608d']._date='2026-08-10';");
  const r7 = ev("ensureTodayBar('sz159608','d')");
  const k7 = ev("state.kcache['sz159608d']");
  const last7 = k7[k7.length-1];
  const q7 = ev("state.quotes['sz159608']");
  check('S13 行情“元”单位时不误缩放', r7===true && last7.close===0.55 && q7.price===0.55, 'C='+last7.close+' q.price='+q7.price);

  console.log('\n==== ensureTodayBar 真根因验收（行情合成今日bar + 价格单位自动校准）====');
  log.forEach(l=>console.log(l));
  console.log('\n'+(pass?'🎉 全部通过':'⛔ 存在 FAIL'));
  process.exit(pass?0:1);
})();
