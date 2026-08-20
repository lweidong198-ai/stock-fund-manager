/* 资金流修复回归：验证 ①裸码→secid 推断（原 toSecid 不认裸码导致资金流恒失败）②真实东财 JSON 解析出 days/last/cont/sum */
const fs=require('fs'), path=require('path');
const {JSDOM}=require('jsdom');
const ROOT='C:/Users/Mloong/stock-fund-manager';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{runScripts:'outside-only',url:'https://localhost/'});
const {window}=dom; global.window=window; global.document=window.document;
window.INDUSTRY_POOL=[]; window.loadCustomSectors=()=>[]; window.escapeHtml=s=>s;
window.fmtMoney=v=>(v==null?'—':v); window.ts=()=>''; window.selectCode=()=>{}; window.showView=()=>{};
const code=fs.readFileSync(path.join(ROOT,'js/industry-panorama.js'),'utf8');
window.eval(code);
const P=window.__pan;

let fails=0;
function A(cond,msg){ console.log((cond?'  ✓ ':'  ✗ ')+msg); if(!cond) fails++; }

console.log('① 裸码 secid 推断（修复 toSecid 不认裸码）');
A(P.ffSecid('159992')==='0.159992','SZ 裸码 159992 → 0.159992');
A(P.ffSecid('512760')==='1.512760','SH 裸码 512760 → 1.512760');
A(P.ffSecid('159755')==='0.159755','SZ 裸码 159755 → 0.159755');
A(P.ffSecid('518880')==='1.518880','SH 裸码 518880 → 1.518880');
A(P.ffSecid('sh512760')==='1.512760','带前缀 sh512760 仍正确（不破坏独立模块）');
A(P.ffSecid('sz159992')==='0.159992','带前缀 sz159992 仍正确');

console.log('② 真实东财 JSON 解析（近5日主力净流入）');
// 取自 push2his daykline 实测：5 根，f52=主力净流入(元)
const fakeJson={data:{klines:[
  '2026-08-13,24581186.0,-1,-1,-1,-1,-1,-1,-1,-1,-1',
  '2026-08-14,17518321.0,-1,-1,-1,-1,-1,-1,-1,-1,-1',
  '2026-08-17,135471834.0,-1,-1,-1,-1,-1,-1,-1,-1,-1',
  '2026-08-18,-38356277.0,-1,-1,-1,-1,-1,-1,-1,-1,-1',
  '2026-08-19,-209274729.0,-1,-1,-1,-1,-1,-1,-1,-1,-1',
]}};
const r=P.parseFundFlow(fakeJson);
A(r.err===null,'解析无错误');
A(r.days.length===5,'解析出 5 日数组');
A(Math.round(r.last)===-209274729,'last=最新一日(-209274729)');
A(Math.round(r.sum)===(24581186+17518321+135471834-38356277-209274729),'sum=5日合计');
A(r.cont===0,'末尾为负 → 连续净流入=0');

// 连续 3 日净流入场景
const fakeUp={data:{klines:[
  '2026-08-15,-100.0,,,,,,,,,,',
  '2026-08-16,200.0,,,,,,,,,,',
  '2026-08-17,300.0,,,,,,,,,,',
  '2026-08-18,400.0,,,,,,,,,,',
  '2026-08-19,500.0,,,,,,,,,,',
]}};
const r2=P.parseFundFlow(fakeUp);
A(r2.cont===4,'末尾连涨4日 → cont=4（含最新今日）');
A(r2.last===500,'last=500');

console.log(fails? ('\n❌ '+fails+' 项失败') : '\n✅ 全部通过 (资金流修复：裸码secid + 5日解析)');
process.exit(fails?1:0);
