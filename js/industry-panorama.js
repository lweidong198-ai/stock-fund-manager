/* =========================================================================
 * industry-panorama.js
 * 模块：工作台「行业全景」作战图（纯前端·零Key）
 * 把散落在「行业雷达 / 行业温度计 / 资金流向 / 公开新闻」里的全行业信息聚成一张图：
 *   [全局状态条] + [行业热力图矩阵(整体全图)] + [资金走向/轮动] + [涨跌机会清单] + [新闻方向]
 * 七态分析复用 sectors.js 的 computeIndustryRows()；资金流复用东财 JSONP；新闻用新浪滚动 JSONP。
 * 数据不足/接口连不上 → 对应区块诚实标「连不上/暂无」，绝不显示假数据。
 * ========================================================================= */
(function(){
  const PAN_STRENGTH = { bull:6, reversal:5, shortbottom:4, deepvalue:3.5, flat:2, downrebound:1, down:0, miss:-1 };

  // 当前价在最近 days 日价格区间的位置（0=最低/最便宜/最冷，1=最高/最贵/最热）
  function pricePercentile(kl, days){
    if(!kl||kl.length<2) return null;
    const w=kl.slice(-days); const closes=w.map(x=>x.close);
    const cur=closes[closes.length-1], lo=Math.min.apply(null,closes), hi=Math.max.apply(null,closes);
    return hi>lo ? (cur-lo)/(hi-lo) : 0.5;
  }

  // 行业 → 新闻关键词（基于 INDUSTRY_POOL.name 分词 + 少量别名），用于把公开新闻标题映射到行业方向
  function buildIndustryKW(){
    const POOL=INDUSTRY_POOL.concat((typeof loadCustomSectors==='function')?loadCustomSectors():[]);
    const extra={
      '159992':['创新药','生物','CXO','药明','恒瑞','百济'],           // 医药/医疗
      '512690':['白酒','茅台','五粮液','食品饮料'],                     // 白酒/消费
      '515030':['电动车','锂电','充电桩'],                             // 新能源车
      '515790':['光伏','硅料','组件'],                                 // 光伏
      '512760':['集成电路','晶圆','中芯','半导体设备'],                 // 芯片/半导体
      '512400':['铜','铝','锂矿','黄金','小金属'],                     // 有色金属
      '515220':['煤炭','动力煤','焦煤'],                               // 煤炭
      '512200':['地产','房企','房地产','楼市'],                         // 房地产
      '515880':['5G','光模块','通信'],                                // 通信
      '515050':['5G','通信'],                                         // 5G通信
      '159755':['电池','储能','锂电'],                                // 电池
      '515980':['AI','人工智能','算力','大模型'],                       // 人工智能
      '562500':['机器人','人形机器人','减速器'],                       // 机器人
      '516510':['云计算','算力','数据中心'],                           // 云计算
      '159667':['工业母机','数控机床'],                               // 工业母机
      '159892':['医美','美容','护肤'],                                // 医美
      '518880':['黄金','避险'],                                       // 黄金
      '516780':['稀土','永磁'],                                       // 稀土
    };
    const map={};
    POOL.forEach(it=>{
      const base=String(it.name).split('/').map(s=>s.trim()).filter(Boolean);
      const al=(extra[it.code]||[]);
      map[it.code]={ name:it.name, keys: base.concat(al) };
    });
    return map;
  }
  const INDUSTRY_KW=buildIndustryKW();

  // 情感词（粗判新闻利好/利空方向，仅供参考）
  const BULL_W=['利好','大涨','上涨','增持','获批','超预期','扩产','中标','回购','上调','增长','订单','放量','突破','签约','净利润增','营收增','机构看好','政策利好'];
  const BEAR_W=['利空','大跌','下跌','减持','暴雷','处罚','下调','亏损','诉讼','风险','退市','质疑','调查','净利降','营收降','停产','违约','澄清','警示'];

  function newsSentiment(t){
    let b=0,k=0;
    for(const w of BULL_W) if(t.indexOf(w)>=0) b++;
    for(const w of BEAR_W) if(t.indexOf(w)>=0) k++;
    return {bull:b, bear:k};
  }

  // 把公开新闻标题数组映射成 行业→{count,bull,bear,dir}
  function matchNewsToIndustry(titles){
    const out={};
    (titles||[]).forEach(t=>{
      const s=String(t||''); if(!s) return;
      const sent=newsSentiment(s);
      for(const code in INDUSTRY_KW){
        const ks=INDUSTRY_KW[code].keys;
        let hit=false;
        for(const k of ks){ if(k && s.indexOf(k)>=0){ hit=true; break; } }
        if(hit){
          if(!out[code]) out[code]={count:0,bull:0,bear:0,name:INDUSTRY_KW[code].name};
          out[code].count++; out[code].bull+=sent.bull; out[code].bear+=sent.bear;
        }
      }
    });
    for(const c in out){ const o=out[c]; o.dir = o.bull>o.bear?'up':(o.bear>o.bull?'down':'flat'); }
    return out;
  }

  // 裸6位代码 → 东财 secid（toSecid 只认 sh/sz 前缀，行业池是裸码，这里补齐推断，避免资金流永远 nosecid 失败）
  function ffSecid(code){
    if(code.startsWith('sh')) return '1.'+code.slice(2);
    if(code.startsWith('sz')) return '0.'+code.slice(2);
    if(code.startsWith('hk')) return '116.'+code.slice(2);
    if(code.startsWith('us')) return '100.'+code.slice(3).toUpperCase();
    if(/^(60|68|90|51|56|58|59|5[2-5])/.test(code)) return '1.'+code;   // 上交所
    if(/^(00|30|15|13|16|18|20|39|12|200|159)/.test(code)) return '0.'+code; // 深交所
    return '1.'+code;
  }
  // 东财 主力资金流 历史（JSONP 绕过 CORS）。push2his 的 daykline 才真正返回近 N 日（klt=101 日K），
  // push2 的 fflow/kline 对 lmt 不生效、只给今日1根。返回 {days:[近N日主力净流入(元)], last, cont, sum}
  function loadFundFlowDays(code, days, cb){
    const secid=ffSecid(code);
    if(!secid){ cb({err:'nosecid'}); return; }
    const cbName='emffd'+Math.random().toString(36).slice(2,10);
    const t=Date.now();
    const url='https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?lmt='+(days||5)+'&klt=101&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&secid='+encodeURIComponent(secid)+'&cb='+cbName+'&_='+t;
    let done=false;
    function finish(res){ if(done) return; done=true; try{ if(window[cbName]) delete window[cbName]; }catch(e){} cb(res); }
    window[cbName]=function(json){
      if(done) return;
      try{ finish(parseFundFlow(json)); }catch(e){ finish({err:'parse'}); }
    };
    const s=document.createElement('script');
    s.src=url;
    s.onerror=function(){ finish({err:'net'}); if(s.parentNode) s.parentNode.removeChild(s); };
    s.onload=function(){ if(s.parentNode) s.parentNode.removeChild(s); };
    document.body.appendChild(s);
    setTimeout(function(){ finish({err:'timeout'}); }, 9000);
  }
  // 东财资金流原始 JSON → {err, days:[近N日主力净流入], last, cont, sum}（纯解析，便于单测）
  function parseFundFlow(json){
    const kl=json&&json.data&&json.data.klines;
    if(!kl||!kl.length) return {err:'empty'};
    const arr=kl.map(p=>{ const a=p.split(','); return parseFloat(a[1]); }); // f52 主力净流入(元)
    const sum=arr.reduce((x,y)=>x+(isNaN(y)?0:y),0);
    return {err:null, days:arr, last:arr[arr.length-1], cont:contPos(arr), sum};
  }
  // 限并发拉全行业资金流（东财对同 IP 高频会 WAF，限制 6 路并发，避免整批失败）
  function runFundFlows(rows){
    return new Promise(function(resolve){
      const targets=rows.filter(function(r){ return !r.klMiss; });
      const total=targets.length;
      if(!total){ resolve(); return; }
      let idx=0, active=0, finished=0; const CONC=6;
      function step(){
        while(active<CONC && idx<total){
          const r=targets[idx++]; active++;
          loadFundFlowDays(r.code,5,function(res){ r._flowDays=res; active--; finished++; if(finished>=total) resolve(); else step(); });
        }
      }
      step();
    });
  }
  // 从最新往前数连续净流入(>0)天数
  function contPos(arr){
    let n=0; for(let i=arr.length-1;i>=0;i--){ if(arr[i]>0) n++; else if(arr[i]<0) break; else break; }
    return n;
  }

  // 新浪滚动财经新闻（JSONP 绕过 CORS），返回标题数组
  function loadSinaNews(num, cb){
    const cbName='snan'+Math.random().toString(36).slice(2,10);
    const t=Date.now();
    const url='https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2509&num='+(num||60)+'&page=1&callback='+cbName+'&_='+t;
    let done=false;
    function finish(res){ if(done) return; done=true; try{ if(window[cbName]) delete window[cbName]; }catch(e){} cb(res); }
    window[cbName]=function(json){
      if(done) return;
      try{
        const data=json&&json.result&&json.result.data;
        if(!data||!data.length){ finish({err:'empty'}); return; }
        const titles=data.map(d=>(d&&d.title)||'').filter(Boolean);
        finish({err:null, titles});
      }catch(e){ finish({err:'parse'}); }
    };
    const s=document.createElement('script');
    s.src=url;
    s.onerror=function(){ finish({err:'net'}); if(s.parentNode) s.parentNode.removeChild(s); };
    s.onload=function(){ if(s.parentNode) s.parentNode.removeChild(s); };
    document.body.appendChild(s);
    setTimeout(function(){ finish({err:'timeout'}); }, 9000);
  }

  // ---------- 子渲染 ----------
  function heatColor(pct){
    if(pct==null) return '#e9edf3';
    if(pct>=0.03) return '#c0152f';
    if(pct>=0.01) return '#e23b3b';
    if(pct>0)     return '#f0a0a0';
    if(pct<=-0.03) return '#0c7a47';
    if(pct<=-0.01) return '#1aa260';
    if(pct<0)     return '#8fd9b6';
    return '#e9edf3';
  }

  function renderGlobalBar(rows, fundReady, newsReady, newsCount){
    const el=document.getElementById('panGlobal'); if(!el) return;
    let strong=0, weak=0, upCnt=0, downCnt=0, fundSum=0, fundKnown=0;
    rows.forEach(r=>{
      const st=r.klMiss?null:r._st;
      if(st){ if(['bull','reversal','shortbottom','deepvalue'].indexOf(st.state)>=0) strong++; if(['down','downrebound'].indexOf(st.state)>=0) weak++; }
      if(r.day!=null){ if(r.day>=0) upCnt++; else downCnt++; }
      if(r._flowDays && !r._flowDays.err){ fundSum+=(r._flowDays.last||0); fundKnown++; }
    });
    const total=rows.length||1;
    const fundDir = fundKnown? (fundSum>0?'整体资金净流入':'整体资金净流出') : '资金数据加载中…';
    const concl = strong>=weak
      ? ('市况偏强：'+strong+' 个行业处上行/拐点/底部信号，'+weak+' 个偏弱。')
      : ('市况偏弱：仅 '+strong+' 个行业上行信号，'+weak+' 个偏弱，注意风险。');
    el.innerHTML=
      '<div class="gb-item"><b>'+strong+'</b><span>强势行业</span></div>'
      +'<div class="gb-item"><b>'+weak+'</b><span>弱势行业</span></div>'
      +'<div class="gb-item"><b>'+upCnt+'<i>/'+total+'</i></b><span>今日上涨行业</span></div>'
      +'<div class="gb-item"><b class="'+(fundSum>=0?'cls-up':'cls-dn')+'">'+(fundKnown?fmtMoney(fundSum):'…')+'</b><span>'+fundDir+'</span></div>'
      +'<div class="gb-item gb-concl">'+concl+(newsReady?(' 公开新闻覆盖 '+newsCount+' 个行业。'):'')+'</div>';
  }

  function renderHeatmap(rows){
    const el=document.getElementById('panHeat'); if(!el) return;
    const sorted=rows.slice().sort((a,b)=> (b.day==null?-1e9:b.day)-(a.day==null?-1e9:a.day));
    let h='<div class="heat-grid">';
    for(const r of sorted){
      const pct=r.day==null?0:r.day/100;
      const bg=heatColor(r.day==null?null:r.day/100);
      const txt=r.day==null?'—':((r.day>=0?'+':'')+r.day.toFixed(2)+'%');
      h+='<div class="heat-cell" data-code="'+r.code+'" style="background:'+bg+'" title="'+escapeHtml(r.name)+'  '+txt+'">'
        +'<div class="hc-name">'+escapeHtml(r.name)+'</div>'
        +'<div class="hc-pct">'+txt+'</div></div>';
    }
    h+='</div>';
    el.innerHTML=h;
    el.querySelectorAll('.heat-cell').forEach(c=>c.onclick=()=>{ const code=c.dataset.code; if(typeof selectCode==='function') selectCode(code); if(typeof showView==='function') showView('market'); });
  }

  function renderFundTrend(rows){
    const el=document.getElementById('panFund'); if(!el) return;
    const known=rows.filter(r=>r._flowDays && !r._flowDays.err && r._flowDays.last!=null);
    if(!known.length){ el.innerHTML='<div class="pan-sub-note">资金流加载中或暂不可用（东财源连不上时显示此提示，非故障）。</div>'; return; }
    const sumAll=known.reduce((a,r)=>a+(r._flowDays.sum||0),0);
    const byToday=known.slice().sort((a,b)=>b._flowDays.last-a._flowDays.last);
    const topIn=byToday.slice(0,6), topOut=byToday.slice(-6).reverse();
    const cont=known.filter(r=>r._flowDays.cont>=2).sort((a,b)=>b._flowDays.cont-a._flowDays.cont).slice(0,6);
    const row=(r,tag)=>'<div class="fl-row"><span class="fl-name">'+escapeHtml(r.name)+'</span><span class="fl-val '+(r._flowDays.last>=0?'cls-up':'cls-dn')+'">'+fmtMoney(r._flowDays.last)+'</span>'+(tag?'<span class="fl-tag">'+tag+'</span>':'')+'</div>';
    let h='<div class="fl-sum '+(sumAll>=0?'cls-up':'cls-dn')+'">全行业近5日主力净流入合计：'+(sumAll>=0?'+':'')+fmtMoney(sumAll)+'</div>';
    h+='<div class="fl-grid">'
      +'<div class="fl-col"><div class="fl-h">今日资金净流入 Top6</div>'+topIn.map(r=>row(r)).join('')+'</div>'
      +'<div class="fl-col"><div class="fl-h">今日资金净流出 Top6</div>'+topOut.map(r=>row(r)).join('')+'</div>';
    if(cont.length) h+='<div class="fl-col"><div class="fl-h">资金连续净流入·持续看好</div>'+cont.map(r=>row(r,'连'+r._flowDays.cont+'日')).join('')+'</div>';
    h+='</div><div class="pan-sub-note">数据：东方财富主力资金净流入（超大单+大单），仅供参考、不构成建议。</div>';
    el.innerHTML=h;
  }

  function renderOpps(rows){
    const el=document.getElementById('panOpps'); if(!el) return;
    const opp=rows.filter(r=>r._st && ['bull','reversal','shortbottom','deepvalue','downrebound'].indexOf(r._st.state)>=0);
    opp.sort((a,b)=> (PAN_STRENGTH[b._st.state]-PAN_STRENGTH[a._st.state]) || ((b.c20==null?-1e9:b.c20)-(a.c20==null?-1e9:a.c20)));
    const top=opp.slice(0,12);
    if(!top.length){ el.innerHTML='<div class="pan-sub-note">当前无明确上行/拐点/底部信号行业（按七态判定，描述性、不喊抄底）。</div>'; return; }
    let h='<div class="opp-list">';
    top.forEach(r=>{
      const st=r._st;
      h+='<div class="opp-row" data-code="'+r.code+'">'
        +'<span class="op-state st-'+st.state+'" data-tip="'+st.tip+'">'+st.label+'</span>'
        +'<span class="opp-name">'+escapeHtml(r.name)+'</span>'
        +'<span class="opp-sig">'+(st.tip?st.tip.slice(0,46):'')+'</span>'
        +'<span class="opp-day '+(r.day>=0?'cls-up':'cls-dn')+'">'+(r.day==null?'':((r.day>=0?'+':'')+r.day.toFixed(1)+'%'))+'</span>'
        +'</div>';
    });
    h+='</div>';
    el.innerHTML=h;
    el.querySelectorAll('.opp-row').forEach(c=>c.onclick=()=>{ const code=c.dataset.code; if(typeof selectCode==='function') selectCode(code); if(typeof showView==='function') showView('market'); });
  }

  function renderNewsDir(newsDir, err){
    const el=document.getElementById('panNews'); if(!el) return;
    if(err){ el.innerHTML='<div class="pan-sub-note">新闻源暂不可用（公开源连不上时显示此提示）。方向判断请以「七态+资金走向」为准。</div>'; return; }
    const arr=Object.keys(newsDir).map(c=>({code:c, name:newsDir[c].name, count:newsDir[c].count, dir:newsDir[c].dir, bull:newsDir[c].bull, bear:newsDir[c].bear}))
      .sort((a,b)=>b.count-a.count).slice(0,16);
    if(!arr.length){ el.innerHTML='<div class="pan-sub-note">近期公开新闻未命中行业关键词（或源为空）。</div>'; return; }
    const arrow=d=> d==='up'?'<span class="nd-up">▲利好</span>':(d==='down'?'<span class="nd-dn">▼利空</span>':'<span class="nd-flat">▬中性</span>');
    let h='<div class="nd-list">';
    arr.forEach(it=>{
      h+='<div class="nd-row"><span class="nd-name">'+escapeHtml(it.name)+'</span>'
        +'<span class="nd-cnt">'+it.count+'条</span>'+arrow(it.dir)+'</div>';
    });
    h+='</div><div class="pan-sub-note">基于新浪公开新闻标题关键词匹配，粗判方向，仅供参考、不构成建议。</div>';
    el.innerHTML=h;
  }

  // ---------- 主渲染 ----------
  let _busy=false, _done=false;   // 重入guard + 已渲染标志：根治行情定时器反复整屏重渲染导致的频闪
  async function renderIndustryPanorama(force){
    if(_busy) return;                          // 正在渲染 → 直接返回，防并发重入
    if(_done && !force) return;               // 已渲染过且非强制刷新 → 不重绘（频闪根治点）
    const box=document.getElementById('homePanorama'); if(!box) return;
    _busy=true;
    if(force) _done=false;                     // 强制刷新（🔄按钮）：重置，走完整流程
    ['panGlobal','panHeat','panFund','panOpps','panNews'].forEach(id=>{ const e=document.getElementById(id); if(e) e.innerHTML='<div class="pan-sub-note">加载中…</div>'; });
    const warnEl=document.getElementById('homePanoramaWarn'); if(warnEl) warnEl.innerHTML='';
    const POOL=INDUSTRY_POOL.concat((typeof loadCustomSectors==='function')?loadCustomSectors():[]);
    let data;
    try{ data=await computeIndustryRows(POOL); }
    catch(e){ console.warn('computeIndustryRows failed',e); const b=document.getElementById('panHeat'); if(b) b.innerHTML='<div class="pan-sub-note">行业数据加载失败，请点「刷新」重试。</div>'; _busy=false; return; }
    const rows=data.rows||[];
    rows.forEach(r=>{ r._pct3y=r.klMiss?null:pricePercentile(r._kl,756); });

    // 同步渲染（行情+七态+冷热已就绪）
    renderGlobalBar(rows,false,false,0);
    renderHeatmap(rows);
    renderOpps(rows);

    // 渐进加载：资金流（近5日，限并发6路防WAF）——全部到位才一次性渲染，不每只重绘
    let fundDone=false, newsReadyFlag=false, newsCountVal=0;
    runFundFlows(rows).then(function(){
      fundDone=true;
      renderFundTrend(rows);
      renderGlobalBar(rows,true,newsReadyFlag,newsCountVal);
    });

    // 渐进加载：新闻方向（最后一步，完成即标记 _done）
    const markDone=()=>{ _done=true; _busy=false; };
    if(typeof loadSinaNews==='function'){
      loadSinaNews(60, res=>{
        if(res&&!res.err&&res.titles&&res.titles.length){
          const dir=matchNewsToIndustry(res.titles);
          newsCountVal=Object.keys(dir).length;
          renderNewsDir(dir,null);
          newsReadyFlag=true;
          renderGlobalBar(rows,fundDone,true,newsCountVal);
        } else {
          renderNewsDir(null,true);
          renderGlobalBar(rows,fundDone,true,0);
        }
        markDone();
      });
    } else { renderNewsDir(null,true); markDone(); }

    const tt=document.getElementById('homePanoramaTime'); if(tt&&typeof ts==='function') tt.textContent='更新 '+ts();
  }

  window.renderIndustryPanorama=renderIndustryPanorama;
  window.refreshIndustryPanorama=renderIndustryPanorama;
  window.__pan={ PAN_STRENGTH, pricePercentile, matchNewsToIndustry, contPos, newsSentiment, INDUSTRY_KW, heatColor, renderHeatmap, renderFundTrend, renderOpps, renderNewsDir, renderGlobalBar, ffSecid, parseFundFlow, resetPanorama:()=>{_done=false;}, isPanoramaDone:()=>_done };
})();
