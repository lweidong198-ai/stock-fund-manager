/* =========================================================================
 * verify_ensure_today.js —— 真根因验收：腾讯 fqkline 滞后时，用实时行情合成今日K线bar
 *
 * 背景（boss 真实反馈）：添加 515050 后 K 线仍停在 8/10。根因不是刷新链/缓存，
 * 而是腾讯日K线接口在收盘后数小时才发布当日bar，而实时行情(qt.gtimg.cn)已到今天。
 * 之前 mock 测试假设“源里必有 8/11”，所以全绿却没查出真问题。
 *
 * 本测试不 mock loadKline，而是直接构造：
 *   - 一段停在 8/10 的 K 线缓存（模拟 fqkline 滞后）
 *   - 一条“今天 8/11、带真实 OHLC”的实时行情（模拟 qt 已更新）
 * 然后断言 ensureTodayBar() 确实用行情合成出 8/11 那根 bar 并写回缓存。
 *
 * 用法：node verify_ensure_today.js
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

  // 场景1：K线停在 8/10，实时行情是今天 8/11（收盘后典型场景）
  ev("state.quotes={}; state.kcache={};");
  ev("state.quotes['sh515050']="+JSON.stringify(realQuote('2026/08/11 16:02:00', 1.007, 1.038, 0.995, 1.017, 1234567))+";");
  ev("state.kcache['sh515050d']="+JSON.stringify([bar('2026-08-08',100),bar('2026-08-09',100.5),bar('2026-08-10',101)])+";");
  ev("state.kcache['sh515050d']._date='2026-08-10';");

  const r1 = ev("ensureTodayBar('sh515050','d')");
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

  console.log('\n==== ensureTodayBar 真根因验收（行情合成今日bar）====');
  log.forEach(l=>console.log(l));
  console.log('\n'+(pass?'🎉 全部通过':'⛔ 存在 FAIL'));
  process.exit(pass?0:1);
})();
