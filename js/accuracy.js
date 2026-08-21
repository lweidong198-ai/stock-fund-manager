/* =========================================================================
 * accuracy.js — 准确性基建（钱管家工作台 v1 一期①）
 *
 * 四大能力：
 * 1) 数据时间戳：行情/净值/资金流/K线 各自记录「最后成功更新时间」，页脚数据条展示
 * 2) 过期自动警告：交易时段内行情停更 >5 分钟 → 顶部黄条（非交易时段不误报）
 * 3) 多源交叉校验：
 *    - 基金净值：东财 pingzhongdata（主） vs 腾讯 qt jj 前缀（校验，必通）
 *    - 场内行情：腾讯 qt（主） vs 东财 ulist（校验，可达才比，用涨跌幅对比避免单位陷阱）
 *    差异超阈值 → 顶栏校验药丸标黄显示差异数；校验源不可达 → 诚实标注「源不可达」，不假装正常
 * 4) 断源降级：各模块已有降级逻辑，此处统一提供汇总入口与页脚风险提示
 *
 * 全部能力降级友好：任一依赖缺失（元素/函数/网络）只影响该项，绝不抛错卡死页面。
 * ========================================================================= */
var Acc = (function(){
  'use strict';
  var stamps={}, cross={}, crossQuoteNote=null;
  var lastFundCheckAt=0, lastQuoteCheckAt=0;
  var STALE_MS=5*60*1000;      // 交易时段行情停更超过 5 分钟 → 警告
  var FUND_DIFF=0.5;           // 基金净值两源差异 >0.5% 标黄
  var QUOTE_DIFF=1.0;          // 行情涨跌幅两源差异 >1 个百分点 标黄
  var CHECK_GAP=45*1000;       // 多源校验节流：45 秒最多一次
  var TYPES={
    quotes:{label:'实时行情', rule:'腾讯财经 · 秒级~分钟级延迟'},
    fund:{label:'基金净值', rule:'T+1 确认 · 当日净值晚间公布'},
    flow:{label:'资金流', rule:'东方财富 · 延迟数据'},
    kline:{label:'K线', rule:'日线收盘后数小时才发当日bar'}
  };

  function pad2(n){ return String(n).padStart(2,'0'); }
  function hhmmss(ms){ if(!ms) return '—'; var d=new Date(ms); return pad2(d.getHours())+':'+pad2(d.getMinutes())+':'+pad2(d.getSeconds()); }
  function stamp(type){ if(TYPES[type]) stamps[type]=Date.now(); }
  function lastOf(type){ return stamps[type]||null; }

  /* ————— 页脚数据条：各类型「更新于」+ 延迟规则 ————— */
  function renderDataNotes(){
    var el=document.getElementById('dataNotes'); if(!el) return;
    var parts=[];
    Object.keys(TYPES).forEach(function(k){
      parts.push('<span class="dn-item"><b>'+TYPES[k].label+'</b> 更新于 '+hhmmss(stamps[k])+'<i>（'+TYPES[k].rule+'）</i></span>');
    });
    el.innerHTML=parts.join('<span class="dn-sep">·</span>');
  }

  /* ————— 过期自动警告 ————— */
  function checkStale(){
    var b=document.getElementById('staleBanner'); if(!b) return;
    try{
      if(typeof state!=='undefined' && state && state.demo){ b.className=''; return; }
      var t=stamps.quotes;
      if(t && typeof isTradingNow==='function' && isTradingNow()){
        var mins=Math.round((Date.now()-t)/60000);
        if(mins>5){
          b.className='show';
          b.innerHTML='⚠ 行情数据已停更 '+mins+' 分钟（上次更新 '+hhmmss(t)+'）。检查网络或点上方「数据」药丸重试。';
          return;
        }
      }
    }catch(e){}
    b.className='';
  }

  /* ————— 多源交叉校验：基金净值（东财 主 vs 腾讯 jj 校验，必通） ————— */
  function checkFundNav(){
    if(Date.now()-lastFundCheckAt<CHECK_GAP) return;
    if(typeof state==='undefined'||!state||!state.fundData) return;
    var codes=[];
    (state.hold||[]).concat(state.watch||[]).forEach(function(x){
      var c=x&&x.code; if(!c) return;
      if(typeof isFundKind==='function' && !isFundKind(c)) return;
      var bare=String(c).replace(/^(sh|sz|hk|us)/i,'');
      if(bare && codes.indexOf(bare)<0) codes.push(bare);
    });
    codes=codes.slice(0,8);
    if(!codes.length) return;
    lastFundCheckAt=Date.now();
    fetch('https://qt.gtimg.cn/q='+codes.map(function(c){return 'jj'+c;}).join(',')+'&_='+Date.now())
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.arrayBuffer(); })
      .then(function(buf){
        var text=new TextDecoder('gb18030').decode(buf);
        var segs=text.match(/v_jj\d+="[^"]*"/g)||[];
        var any=false;
        segs.forEach(function(seg){
          var mm=seg.match(/v_jj(\d+)="([^"]*)"/); if(!mm) return;
          var code=mm[1], f=mm[2].split('~');
          var tx=parseFloat(f[5]); if(!(tx>0)) return;           // 腾讯最新净值
          var fd=state.fundData[code]; var em=fd&&fd.latest; if(!(em>0)) return; // 东财最新净值
          any=true;
          var diff=Math.abs(tx-em)/em*100;
          cross['fund_'+code]={a:'东财',b:'腾讯',va:em,vb:tx,diff:diff,warn:diff>FUND_DIFF,at:Date.now()};
        });
        if(!any && !segs.length) crossQuoteNote='基金净值校验：腾讯源无返回，暂无法交叉核对';
        renderCross();
      })
      .catch(function(){ renderCross(); });
  }

  /* ————— 多源交叉校验：场内行情（腾讯 主 vs 东财 ulist 校验，可达才比） —————
   * 用「涨跌幅%」对比（f3 vs q.changePct），百分比无单位，规避腾讯/东财价格单位差异陷阱。
   * 东财不可达 → crossQuoteNote 诚实标注「校验源不可达，以腾讯为准」。 */
  function checkQuotes(){
    if(Date.now()-lastQuoteCheckAt<CHECK_GAP) return;
    if(typeof state==='undefined'||!state||!state.quotes) return;
    var codes=[];
    (state.watch||[]).forEach(function(x){
      var c=x&&x.code; if(!c) return;
      if(typeof isFundKind==='function' && isFundKind(c)) return;
      var n=String(c).toLowerCase();
      var bare=n.replace(/^(sh|sz)/,'');
      if(/^\d{6}$/.test(bare) && codes.indexOf(bare)<0) codes.push(bare);
    });
    codes=codes.slice(0,8);
    if(!codes.length) return;
    lastQuoteCheckAt=Date.now();
    var secids=codes.map(function(c){
      var sh=(c[0]==='6'||c[0]==='5');
      return (sh?'1.':'0.')+c;
    }).join(',');
    var cbName='accq'+(Math.random().toString(36).slice(2,9));
    var done=false;
    function finish(){
      if(done) return; done=true;
      try{ if(window[cbName]) delete window[cbName]; }catch(e){}
      renderCross();
    }
    window[cbName]=function(json){
      if(done) return;
      var diff=json&&json.data&&json.data.diff; if(!diff) return finish();
      var list=Array.isArray(diff)?diff:Object.keys(diff).map(function(k){return diff[k];});
      var any=false;
      list.forEach(function(it){
        var code=String(it.f12||'');
        var emPct=parseFloat(it.f3); if(isNaN(emPct)) return;
        var q=null;
        Object.keys(state.quotes).forEach(function(k){
          if(String(k).replace(/^(sh|sz)/,'')===code) q=state.quotes[k];
        });
        if(!q || q.changePct==null || isNaN(q.changePct)) return;
        any=true;
        var d=Math.abs(emPct-q.changePct);
        cross['q_'+code]={a:'腾讯',b:'东财',va:q.changePct,vb:emPct,diff:d,warn:d>QUOTE_DIFF,at:Date.now()};
      });
      finish();
    };
    var s=document.createElement('script');
    s.src='https://push2.eastmoney.com/api/qt/ulist.np/get?secids='+encodeURIComponent(secids)+'&fields=f12,f14,f3&cb='+cbName+'&_='+Date.now();
    s.onerror=function(){ crossQuoteNote='校验源(东方财富)当前不可达，以腾讯为准'; if(s.parentNode) s.parentNode.removeChild(s); finish(); };
    s.onload=function(){ if(s.parentNode) s.parentNode.removeChild(s); };
    document.body.appendChild(s);
    setTimeout(finish, 7000);
  }

  /* ————— 顶栏校验药丸 ————— */
  function renderCross(){
    var el=document.getElementById('crossStatus'); if(!el) return;
    var warns=[], title='';
    Object.keys(cross).forEach(function(k){
      var c=cross[k];
      if(c.warn) warns.push(k);
      title+=(c.a+' vs '+c.b+'：相差 '+c.diff.toFixed(2)+(typeof c.diff==='number'&&c.diff>10?'pp':'%')+' '+(c.warn?'⚠':'✓')+'  ');
    });
    if(crossQuoteNote && title) title=crossQuoteNote+'  '+title;
    var body=title||(crossQuoteNote||'');
    if(warns.length){
      el.className='pill ds warn'; el.textContent='校验：'+warns.length+'处差异';
      el.title='两源数据差异较大：\n'+body;
    } else if(crossQuoteNote){
      el.className='pill ds demoy'; el.textContent='校验：源不可达'; el.title=crossQuoteNote;
    } else if(Object.keys(cross).length){
      el.className='pill ds ok'; el.textContent='校验：正常'; el.title='多源数据一致\n'+body;
    } else {
      el.className='pill ds'; el.textContent='校验：检测中'; el.title='多源交叉校验（净值/行情）';
    }
  }

  /* ————— 挂钩入口（由各模块成功回调调用，节流内置） ————— */
  function afterQuotes(){ stamp('quotes'); renderDataNotes(); checkStale(); checkQuotes(); }
  function afterFundData(){ stamp('fund'); renderDataNotes(); checkFundNav(); }
  function afterFlow(){ stamp('flow'); renderDataNotes(); }
  function afterKline(){ stamp('kline'); renderDataNotes(); }

  function init(){
    setTimeout(renderDataNotes, 1200);
    setInterval(function(){ renderDataNotes(); checkStale(); }, 30000);
  }
  /* 重置节流与校验记录（测试/手动重试用；正常运行每45秒自动刷新不阻塞） */
  function resetCheck(){
    lastFundCheckAt=0; lastQuoteCheckAt=0; crossQuoteNote=null;
    Object.keys(cross).forEach(function(k){ delete cross[k]; });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return {
    stamp:stamp, lastOf:lastOf,
    renderDataNotes:renderDataNotes, checkStale:checkStale,
    checkFundNav:checkFundNav, checkQuotes:checkQuotes,
    afterQuotes:afterQuotes, afterFundData:afterFundData,
    afterFlow:afterFlow, afterKline:afterKline,
    resetCheck:resetCheck,
    cross:cross, getCrossNote:function(){ return crossQuoteNote; }
  };
})();
