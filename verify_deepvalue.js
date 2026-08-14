/* 验证 sectorDeepValue（极低估·长持 信号）核心逻辑 —— jsdom/VM 实跑纯函数
 * 场景：A 极低估(触发) / B 平稳(不触发) / C 数据不足(null) / D 仅估值低但不暴跌(不触发)
 */
const fs=require('fs'), vm=require('vm');
const ROOT='C:/Users/Mloong/stock-fund-manager';
const ctx={Math,Date,console,JSON,Array,Object,Number,isFinite,document:{},window:{},fetch:async()=>null};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT+'/js/sectors.js','utf8'), ctx);
const fn=ctx.sectorDeepValue;
let pass=0, fail=0;
function assert(name, cond){ if(cond){ pass++; console.log('  PASS '+name); } else { fail++; console.log('  FAIL '+name); } }

// 生成日线：前 n-5 日平稳 base，最后5日(1周)暴跌到 drop
function makeKL(n, base, drop){
  const kl=[]; let d=new Date(2020,0,1);
  for(let i=0;i<n;i++){
    const close = (i<n-5) ? base + Math.sin(i/9)*2 : drop;
    kl.push({date: d.toISOString().slice(0,10), open:close, close, high:close+1, low:close-1, volume:1e6});
    d.setDate(d.getDate()+1);
  }
  return kl;
}
const A=fn(makeKL(1300,100,20));    // 极低估：最新周=20 远低于历史，单周-80%，RSI≈0
const B=fn(makeKL(1300,100,100));   // 平稳：全100
const C=fn(makeKL(1000,100,20));    // 数据不足(<1250日)
const D=fn(makeKL(1300,100,95));    // 估值低但仅跌5%(不<-3%)

console.log('A(极低估):', JSON.stringify(A));
assert('A 触发', A && A.triggered===true);
assert('A 估值分位<5%', A && A.frac<0.05);
assert('A 周RSI<22', A && A.rsi<22);
assert('A 单周跌幅<-3%', A && A.wkDrop<-3);
assert('B 平稳不触发', B && B.triggered===false);
assert('C 数据不足返回null', C===null);
assert('D 仅小跌不触发', D && D.triggered===false);

console.log('\n结果: '+pass+' PASS, '+fail+' FAIL');
process.exit(fail?1:0);
