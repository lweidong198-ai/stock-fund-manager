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

  // 把带 url 的新闻条目数组映射成「可点击」列表：每条归属首个命中行业，并粗判方向
  // 输入 items:[{title,url}] → 输出 [{title,url,dir,bull,bear,code,name}]，按相关度排序
  function matchNewsToItems(items){
    const out=[];
    (items||[]).forEach(it=>{
      const s=String(it.title||''); if(!s) return;
      const sent=newsSentiment(s);
      let hitCode=null;
      for(const code in INDUSTRY_KW){
        const ks=INDUSTRY_KW[code].keys;
        let hit=false;
        for(const k of ks){ if(k && s.indexOf(k)>=0){ hit=true; break; } }
        if(hit){ hitCode=code; break; }
      }
      const dir = sent.bull>sent.bear?'up':(sent.bear>sent.bull?'down':'flat');
      out.push({ title:s, url:it.url||'', dir, bull:sent.bull, bear:sent.bear,
                 code:hitCode, name:hitCode?INDUSTRY_KW[hitCode].name:'' });
    });
    // 相关度：命中行业 + 情感强 + 有链接 优先
    out.sort((a,b)=> ((b.code?2:0)+(b.bull-b.bear)+(b.url?1:0)) - ((a.code?2:0)+(a.bull-a.bear)+(a.url?1:0)) );
    return out.slice(0,18);
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
  // 东财 push2his 主力资金流历史（JSONP 绕过 CORS）。daykline 才真正返回近 N 日（klt=101 日K）。
  // tries>1 时带自动重试（抗限流/拦截误伤），onerror/超时各重试 tries-1 次，每次间隔 500ms。
  // 返回 {err, days:[近N日主力净流入(元)], dates:[日期], last, cont, sum}
  function loadFundFlowDays(code, days, cb, tries){
    const secid=ffSecid(code);
    if(!secid){ cb({err:'nosecid'}); return; }
    let triesLeft=(tries&&tries>0)?tries:1;
    let done=false, curCb='';
    function finish(res){ if(done) return; done=true; try{ if(window[curCb]) delete window[curCb]; }catch(e){} cb(res); }
    function attempt(){
      if(done) return;
      triesLeft--;
      curCb='emffd'+Math.random().toString(36).slice(2,10);
      const t=Date.now();
      const url='https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?lmt='+(days||5)+'&klt=101&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&secid='+encodeURIComponent(secid)+'&cb='+curCb+'&_='+t;
      window[curCb]=function(json){
        if(done) return;
        try{ finish(parseFundFlow(json)); }catch(e){ finish({err:'parse'}); }
      };
      const s=document.createElement('script');
      s.src=url;
      s.onerror=function(){ if(s.parentNode) s.parentNode.removeChild(s); if(triesLeft>0) setTimeout(attempt,500); else finish({err:'net'}); };
      s.onload=function(){ if(s.parentNode) s.parentNode.removeChild(s); };
      document.body.appendChild(s);
      setTimeout(function(){
        if(done) return;
        try{ if(window[curCb]) delete window[curCb]; }catch(e){}
        if(triesLeft>0) setTimeout(attempt,500); else finish({err:'timeout'});
      }, 9000);
    }
    attempt();
  }
  // 东财资金流原始 JSON → {err, days:[近N日主力净流入], dates:[对应日期], last, cont, sum}（纯解析，便于单测）
  function parseFundFlow(json){
    const kl=json&&json.data&&json.data.klines;
    if(!kl||!kl.length) return {err:'empty'};
    const arr=kl.map(p=>{ const a=p.split(','); return parseFloat(a[1]); }); // f52 主力净流入(元)
    const dates=kl.map(p=>{ const a=p.split(','); return a[0]||''; });      // 日期列
    const sum=arr.reduce((x,y)=>x+(isNaN(y)?0:y),0);
    return {err:null, days:arr, dates:dates, last:arr[arr.length-1], cont:contPos(arr), sum};
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
  // 东财 clist 行业板块主力净流入（当日，一次请求全行业，比逐只ETF拉更稳、不受并发限流）
  // 返回 {err, map:{poolCode:{net(元),pct(%),name}}, raw:[{code,name,net,pct}]}
  function matchClistToPool(bkName, POOL){
    if(!bkName) return null;
    const bk=String(bkName);
    for(const it of POOL){
      const segs=String(it.name).split('/').map(s=>s.trim()).filter(Boolean);
      for(const s of segs){ if(s && (bk.indexOf(s)>=0 || s.indexOf(bk)>=0)) return it.code; }
    }
    return null;
  }
  function loadClistFlow(cb){
    const cbName='emcl'+Math.random().toString(36).slice(2,10);
    const POOL=INDUSTRY_POOL.concat((typeof loadCustomSectors==='function')?loadCustomSectors():[]);
    const url='https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=500&fs=m:90+t:2&fields=f12,f14,f62,f184&cb='+cbName+'&_='+Date.now();
    let done=false;
    function finish(res){ if(done) return; done=true; try{ if(window[cbName]) delete window[cbName]; }catch(e){} cb(res); }
    window[cbName]=function(json){
      if(done) return;
      try{
        const diff=json&&json.data&&json.data.diff;
        if(!diff) return finish({err:'empty'});
        const raw=[]; const map={};
        Object.keys(diff).forEach(k=>{
          const d=diff[k]; if(!d) return; const name=d.f14; const net=d.f62; const pct=d.f184;
          raw.push({code:d.f12, name, net, pct});
          const pc=matchClistToPool(name, POOL);
          if(pc && net!=null && map[pc]==null) map[pc]={name:name, net:net, pct:pct};
        });
        finish({err:null, raw, map});
      }catch(e){ finish({err:'parse'}); }
    };
    const s=document.createElement('script'); s.src=url;
    s.onerror=function(){ finish({err:'net'}); if(s.parentNode) s.parentNode.removeChild(s); };
    s.onload=function(){ if(s.parentNode) s.parentNode.removeChild(s); };
    document.body.appendChild(s);
    setTimeout(function(){ finish({err:'timeout'}); }, 9000);
  }
  // 东财 ulist 单只ETF当日主力净流入（push2 域；daykline(push2his) 连不上时的降级，带2次重试抗限流）
  // 返回 {err, name, net:主力净流入(元), pct:净占比(万分之，东财 f184)}
  function loadUlistFlow(code, cb){
    const secid=ffSecid(code);
    if(!secid){ cb({err:'nosecid'}); return; }
    let triesLeft=2, done=false, curCb='';
    function finish(res){ if(done) return; done=true; try{ if(window[curCb]) delete window[curCb]; }catch(e){} cb(res); }
    function attempt(){
      if(done) return;
      triesLeft--;
      curCb='emul'+Math.random().toString(36).slice(2,10);
      const url='https://push2.eastmoney.com/api/qt/ulist.np/get?secids='+encodeURIComponent(secid)+'&fields=f12,f14,f62,f184&cb='+curCb+'&_='+Date.now();
      window[curCb]=function(json){
        if(done) return;
        try{
          const diff=json&&json.data&&json.data.diff;
          const it=diff&&diff[0];
          if(!it||it.f62==null) return finish({err:'empty'});
          finish({err:null, name:it.f14, net:it.f62, pct:it.f184});
        }catch(e){ finish({err:'parse'}); }
      };
      const s=document.createElement('script'); s.src=url;
      s.onerror=function(){ if(s.parentNode) s.parentNode.removeChild(s); if(triesLeft>0) setTimeout(attempt,400); else finish({err:'net'}); };
      s.onload=function(){ if(s.parentNode) s.parentNode.removeChild(s); };
      document.body.appendChild(s);
      setTimeout(function(){
        if(done) return;
        try{ if(window[curCb]) delete window[curCb]; }catch(e){}
        if(triesLeft>0) setTimeout(attempt,400); else finish({err:'timeout'});
      }, 7000);
    }
    attempt();
  }
  // 从最新往前数连续净流入(>0)天数
  function contPos(arr){
    let n=0; for(let i=arr.length-1;i>=0;i--){ if(arr[i]>0) n++; else if(arr[i]<0) break; else break; }
    return n;
  }

  // ---------- 新闻源（多源自动降级：谁先通就用谁）----------
  // 通用 JSONP 加载（带 onload/onerror/timeout 兜底，避免某源挂死整块）
  function jsonpGet(cbName, url, onOk, onErr){
    let done=false;
    function finish(fn){ if(done) return; done=true; try{ if(window[cbName]) delete window[cbName]; }catch(e){} fn(); }
    window[cbName]=function(json){ finish(function(){ onOk(json); }); };
    const s=document.createElement('script');
    s.src=url;
    s.onerror=function(){ finish(function(){ onErr('net'); if(s.parentNode) s.parentNode.removeChild(s); }); };
    s.onload=function(){ if(s.parentNode) s.parentNode.removeChild(s); };
    document.body.appendChild(s);
    setTimeout(function(){ finish(function(){ onErr('timeout'); }); }, 9000);
  }

  // 源1：新浪滚动财经（JSONP，feed.mix.sina.com.cn）。注意：该域名常被广告拦截插件屏蔽 → 失败即降级
  function loadSinaNews(num, cb){
    const label='新浪财经';
    const cbName='snan'+Math.random().toString(36).slice(2,10);
    const t=Date.now();
    const url='https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2509&num='+(num||60)+'&page=1&callback='+cbName+'&_='+t;
    jsonpGet(cbName, url,
      function(json){
        try{
          const data=json&&json.result&&json.result.data;
          if(!data||!data.length) return cb({err:'empty', label});
          const items=data.map(d=>({title:(d&&d.title)||'', url:(d&&d.url)||''})).filter(x=>x.title);
          if(!items.length) return cb({err:'empty', label});
          cb({err:null, titles:items.map(x=>x.title), items, label});
        }catch(e){ cb({err:'parse', label}); }
      },
      function(){ cb({err:'net', label}); }
    );
  }

  // 源2：同花顺快讯（JSONP，news.10jqka.com.cn，ACAO=* 且支持 callback）。不同域名，绕过新浪被屏蔽问题
  function loadThsNews(num, cb){
    const label='同花顺快讯';
    const cbName='thsn'+Math.random().toString(36).slice(2,10);
    const t=Date.now();
    const url='https://news.10jqka.com.cn/tapp/news/push/stock/?page=1&tag=&track=website&pagesize=50&callback='+cbName+'&_='+t;
    jsonpGet(cbName, url,
      function(json){
        try{
          const list=json&&json.data&&json.data.list;
          if(!list||!list.length) return cb({err:'empty', label});
          const items=list.map(d=>({title:(d&&(d.title||d.digest))||'', url:(d&&d.url)||''})).filter(x=>x.title);
          if(!items.length) return cb({err:'empty', label});
          cb({err:null, titles:items.map(x=>x.title), items, label});
        }catch(e){ cb({err:'parse', label}); }
      },
      function(){ cb({err:'net', label}); }
    );
  }

  // 多源降级：依次尝试，第一个返回有效标题的源即采用源，并把源名带回展示
  const NEWS_SOURCES=[loadSinaNews, loadThsNews];
  function loadAnyNews(cb){
    let i=0;
    (function next(){
      if(i>=NEWS_SOURCES.length){ cb({err:'allfailed', label:null}); return; }
      const fn=NEWS_SOURCES[i++];
      fn(60, function(res){
        if(res&&!res.err&&res.titles&&res.titles.length) cb(res);
        else next();
      });
    })();
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

  // —— 单ETF资金流查询（状态 + 辅助）——
  let _fundQuery={code:null,days:5}, _lastRows=[], _lastCl=null;
  function _fundPool(){ return INDUSTRY_POOL.concat((typeof loadCustomSectors==='function')?loadCustomSectors():[]); }
  function fundNameOf(code){
    const r=_lastRows.find(x=>x.code===code);
    if(r&&r.name) return r.name;
    const p=_fundPool().find(x=>x.code===code);
    return p?p.name:'';
  }
  function buildFundQueryBar(){
    const POOL=_fundPool(); const cur=_fundQuery.code||'';
    const inPool=cur&&POOL.some(x=>x.code===cur);
    let opts='<option value="">— 选择行业ETF —</option>';
    POOL.forEach(it=>{ opts+='<option value="'+it.code+'"'+(it.code===cur?' selected':'')+'>'+escapeHtml(it.name)+'（'+it.code+'）</option>'; });
    const daysBtns=[5,10,20,60].map(d=>'<button type="button" class="ff-qbtn'+(d===_fundQuery.days?' on':'')+'" data-days="'+d+'">'+d+'日</button>').join('');
    return '<div class="ff-qbar">'
      +'<select class="ff-qsel" data-role="qsel" title="选择行业ETF">'+opts+'</select>'
      +'<input class="ff-qinp" data-role="qinp" placeholder="或输入6位代码" value="'+(cur&&!inPool?cur:'')+'">'
      +'<span class="ff-qdays">'+daysBtns+'</span>'
      +'<button type="button" class="ff-qgo" data-role="qgo">查询</button>'
      +'</div>';
  }
  function doFundQuery(){
    const sel=document.querySelector('#panFund [data-role="qsel"]');
    const inp=document.querySelector('#panFund [data-role="qinp"]');
    let code=sel?sel.value:'';
    const manual=(inp?inp.value:'').trim();
    if(manual) code=manual;
    if(!code){ if(typeof toast==='function') toast('请先选择或输入ETF代码'); return; }
    _fundQuery.code=code;
    renderFundTrend(_lastRows,_lastCl);
  }
  function loadSingleFlow(code, days){
    const el=document.getElementById('panFundSingle'); if(!el) return;
    const name=fundNameOf(code);
    // tries=3：历史源抗限流重试（onerror/超时各重试2次），3次全挂才降级 ulist 当日
    loadFundFlowDays(code, days, function(res){
      if(!el) return;
      if(res&&res.err){
        // 历史资金流源(push2his)连不上 → 降级用 ulist(当日)，给出诊断与解决指引
        loadUlistFlow(code, function(ul){
          if(!el) return;
          if(ul&&!ul.err){
            const v=ul.net||0;
            el.innerHTML='<div class="ff-single">'
              +'<div class="ff-single-h"><b>'+escapeHtml(name||ul.name||code)+'</b> 当日主力资金<button type="button" class="ff-qback">回总览</button></div>'
              +'<div class="fl-sum '+(v>=0?'cls-up':'cls-dn')+'">当日主力净流入：'+(v>=0?'+':'')+fmtMoney(v)+(ul.pct!=null?'　净占比 '+(ul.pct>0?'+':'')+(ul.pct/100).toFixed(2)+'%':'')+'</div>'
              +'<div class="pan-sub-note">近'+days+'日历史资金流（东方财富 push2his）当前网络连不上（多被广告拦截插件屏蔽或接口限流），已降级显示当日主力资金。<br>解决：①本页加白名单/关闭广告拦截插件 ②换网络（如手机热点）③<button type="button" class="ff-qretry">再试一次</button></div>'
              +'</div>';
            return;
          }
          // ulist 也失败：大概率整个东方财富域被网络/插件拦截。给今日涨跌(腾讯，可正常显示)+明确诊断+解法
          const row=_lastRows.find(x=>x.code===code);
          const day=(row&&row.day!=null)?row.day:null;
          el.innerHTML='<div class="ff-single">'
            +'<div class="ff-single-h"><b>'+escapeHtml(name||code)+'</b> 资金流查询<button type="button" class="ff-qback">回总览</button></div>'
            +(day!=null?'<div class="fl-sum '+(day>=0?'cls-up':'cls-dn')+'">今日涨跌：'+(day>=0?'+':'')+day.toFixed(2)+'%（腾讯行情，正常显示）</div>':'')
            +'<div class="pan-sub-note">主力资金流数据源（东方财富）在当前网络连不上（含当日接口，疑似被广告拦截插件或网络拦截），无法获取该ETF的资金流入/流出。<br>解决：①本站加白名单/关闭广告拦截插件 ②换网络（如手机热点）③本地双击 index.html 打开试试（file:// 大多能绕开拦截）④<button type="button" class="ff-qretry">再试一次</button></div>'
            +'</div>';
        });
        return;
      }
      const arr=res.days||[]; const dates=res.dates||[];
      const sum=arr.reduce((x,y)=>x+(isNaN(y)?0:y),0);
      const pos=arr.filter(v=>v>0).length, neg=arr.filter(v=>v<0).length;
      const maxAbs=Math.max.apply(null, arr.map(v=>Math.abs(v||0)).concat([1]));
      let bars='';
      arr.forEach(function(v,i){
        const pct=Math.max(3, Math.round(Math.abs(v||0)/maxAbs*100));
        const lbl=dates[i]?dates[i].slice(5):('T'+(i+1));
        bars+='<div class="ff-bar-wrap" title="'+(dates[i]||'')+' '+fmtMoney(v)+'"><div class="ff-bar '+(v>=0?'up':'dn')+'" style="height:'+pct+'%"></div><div class="ff-bar-date">'+lbl+'</div></div>';
      });
      let rowsH='';
      for(let i=arr.length-1;i>=0;i--){
        const v=arr[i], d=dates[i]||'';
        rowsH+='<div class="ff-row"><span class="ff-date">'+d+'</span><span class="ff-val '+(v>=0?'cls-up':'cls-dn')+'">'+(v>=0?'+':'')+fmtMoney(v)+'</span></div>';
      }
      el.innerHTML='<div class="ff-single">'
        +'<div class="ff-single-h"><b>'+escapeHtml(name||code)+'</b> 近'+days+'日主力净流入<button type="button" class="ff-qback">回总览</button></div>'
        +'<div class="fl-sum '+(sum>=0?'cls-up':'cls-dn')+'">区间合计：'+(sum>=0?'+':'')+fmtMoney(sum)+'　流入'+pos+'日/流出'+neg+'日'+(res.cont>=2?'　连流入'+res.cont+'日':'')+'</div>'
        +'<div class="ff-bars">'+bars+'</div>'
        +'<div class="ff-list">'+(rowsH||'<div class="pan-sub-note">暂无数据</div>')+'</div>'
        +'<div class="pan-sub-note">数据：东方财富主力资金（超大单+大单），仅供参考、不构成建议。</div>'
        +'</div>';
    }, 3);
  }

  function renderFundTrend(rows, cl){
    const el=document.getElementById('panFund'); if(!el) return;
    _lastRows=rows; _lastCl=cl;
    // 事件委托绑定一次（innerHTML 替换不影响容器本身）
    if(el && !el._ffBound){
      el._ffBound=true;
      el.addEventListener('click', function(e){
        const t=e.target;
        if(!t||!t.classList) return;
        if(t.classList.contains('ff-qbtn')){
          _fundQuery.days=parseInt(t.getAttribute('data-days'),10)||5;
          renderFundTrend(_lastRows,_lastCl);
        } else if(t.classList.contains('ff-qgo')){
          doFundQuery();
        } else if(t.classList.contains('ff-qretry')){
          const el0=document.getElementById('panFundSingle'); if(el0) el0.innerHTML='<div class="pan-sub-note">重试中…</div>';
          loadSingleFlow(_fundQuery.code, _fundQuery.days);
        } else if(t.classList.contains('ff-qback')){
          _fundQuery.code=null;
          renderFundTrend(_lastRows,_lastCl);
        }
      });
      el.addEventListener('change', function(e){
        if(e.target && e.target.getAttribute && e.target.getAttribute('data-role')==='qsel'){
          _fundQuery.code=e.target.value||null;
        }
      });
    }
    let h=buildFundQueryBar();
    // —— 单ETF查询模式：查询条 + 结果占位，数据到位后由 loadSingleFlow 填充 ——
    if(_fundQuery.code){
      h+='<div id="panFundSingle" class="pan-sub-note">'+escapeHtml(fundNameOf(_fundQuery.code)||_fundQuery.code)+' 近'+_fundQuery.days+'日资金流加载中…</div>';
      el.innerHTML=h;
      loadSingleFlow(_fundQuery.code, _fundQuery.days);
      return;
    }
    // —— 行业总览（默认）：当日 clist 主源 + 近5日增强 + 板块轮动兜底 ——
    const known=rows.filter(r=>r._flowDays && !r._flowDays.err && r._flowDays.last!=null);
    const clistRows=rows.filter(r=>r._clistNet && r._clistNet.net!=null);
    const rot=rows.filter(r=>r.day!=null).slice().sort((a,b)=>b.day-a.day);
    const lead=rot.slice(0,5), lag=rot.slice(-5).reverse();
    const rowRot=(r)=>'<div class="fl-row"><span class="fl-name">'+escapeHtml(r.name)+'</span><span class="fl-val '+(r.day>=0?'cls-up':'cls-dn')+'">'+(r.day>=0?'+':'')+r.day.toFixed(2)+'%</span></div>';
    const rowCl=(r)=>'<div class="fl-row"><span class="fl-name">'+escapeHtml(r.name)+'</span><span class="fl-val '+(r._clistNet.net>=0?'cls-up':'cls-dn')+'">'+fmtMoney(r._clistNet.net)+'</span></div>';
    const row5=(r,tag)=>'<div class="fl-row"><span class="fl-name">'+escapeHtml(r.name)+'</span><span class="fl-val '+(r._flowDays.last>=0?'cls-up':'cls-dn')+'">'+fmtMoney(r._flowDays.last)+'</span>'+(tag?'<span class="fl-tag">'+tag+'</span>':'')+'</div>';
    let srcNote='';
    if(clistRows.length){
      const sumAll=clistRows.reduce((a,r)=>a+(r._clistNet.net||0),0);
      const byNet=clistRows.slice().sort((a,b)=>b._clistNet.net-a._clistNet.net);
      const topIn=byNet.slice(0,6), topOut=byNet.slice(-6).reverse();
      h+='<div class="fl-sum '+(sumAll>=0?'cls-up':'cls-dn')+'">行业主力净流入合计（当日）：'+(sumAll>=0?'+':'')+fmtMoney(sumAll)+'</div>';
      h+='<div class="fl-block"><div class="fl-h">今日主力净流入 Top6</div>'+topIn.map(r=>rowCl(r)).join('')+'</div>';
      h+='<div class="fl-block"><div class="fl-h">今日主力净流出 Top6</div>'+topOut.map(r=>rowCl(r)).join('')+'</div>';
      srcNote='东方财富·行业板块主力净流入(当日)';
    } else {
      h+='<div class="pan-sub-note">行业板块资金流（东方财富）暂连不上，下面用「今日涨跌」展示板块轮动。</div>';
    }
    if(known.length){
      const sum5=known.reduce((a,r)=>a+(r._flowDays.sum||0),0);
      const cont=known.filter(r=>r._flowDays.cont>=2).sort((a,b)=>b._flowDays.cont-a._flowDays.cont).slice(0,6);
      h+='<div class="fl-block"><div class="fl-h">近5日主力净流入合计</div><div class="fl-sum '+(sum5>=0?'cls-up':'cls-dn')+'">'+(sum5>=0?'+':'')+fmtMoney(sum5)+'</div></div>';
      if(cont.length) h+='<div class="fl-block"><div class="fl-h">资金连续净流入·持续看好</div>'+cont.map(r=>row5(r,'连'+r._flowDays.cont+'日')).join('')+'</div>';
      srcNote+=(srcNote?' + ':'')+'个股近5日';
    }
    h+='<div class="fl-block"><div class="fl-h">板块轮动 · 今日领涨</div>'+(lead.length?lead.map(r=>rowRot(r)).join(''):'<div class="pan-sub-note">暂无</div>')+'</div>';
    h+='<div class="fl-block"><div class="fl-h">板块轮动 · 今日领跌</div>'+(lag.length?lag.map(r=>rowRot(r)).join(''):'<div class="pan-sub-note">暂无</div>')+'</div>';
    h+='<div class="pan-sub-note">数据：'+(srcNote||'今日涨跌轮动')+'；仅供参考、不构成建议。</div>';
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

  // 新闻方向：按「利好 / 利空 / 中性」分组展示，每条可点击跳转原文；无某方向则不显示该组
  function renderNewsDir(items, dirMap, err, srcLabel){
    const el=document.getElementById('panNews'); if(!el) return;
    if(err){ el.innerHTML='<div class="pan-sub-note">新闻源暂不可用（公开源连不上时显示此提示）。方向判断请以「七态+资金走向」为准。</div>'; return; }
    if(!items || !items.length){ el.innerHTML='<div class="pan-sub-note">近期公开新闻未命中行业关键词（或源为空）。</div>'; return; }
    const arrow=d=> d==='up'?'<span class="nd-up">▲利好</span>':(d==='down'?'<span class="nd-dn">▼利空</span>':'<span class="nd-flat">▬中性</span>');
    const byDir={up:[],down:[],flat:[]};
    items.forEach(it=>{ const d=(it.dir==='up'||it.dir==='down')?it.dir:'flat'; byDir[d].push(it); });
    const groups=[['up','利好','nd-up'],['down','利空','nd-dn'],['flat','中性','nd-flat']];
    let h='<div class="nd-list">';
    groups.forEach(g=>{
      const list=byDir[g[0]]; if(!list || !list.length) return;
      h+='<div class="nd-grp"><div class="nd-grp-h '+g[2]+'">'+g[1]+'（'+list.length+'条）</div>';
      list.forEach(it=>{
        const inner='<span class="nd-arrow">'+arrow(it.dir)+'</span>'
          +'<span class="nd-title">'+escapeHtml(it.title)+'</span>'
          + (it.name?'<span class="nd-tag">'+escapeHtml(it.name)+'</span>':'');
        if(it.url){
          h+='<a class="nd-link" href="'+String(it.url).replace(/"/g,'%22')+'" target="_blank" rel="noopener noreferrer" title="点击跳转原文">'+inner+'</a>';
        } else {
          h+='<span class="nd-link nd-nolink">'+inner+'</span>';
        }
      });
      h+='</div>';
    });
    h+='</div><div class="pan-sub-note">新闻来源：'+(srcLabel||'公开源')+'（标题关键词匹配，粗判方向；点击标题可跳转原文，仅供参考、不构成建议）。</div>';
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

    // 渐进加载：资金流（近5日 push2his best-effort + 行业板块当日 clist 主源）
    let fundDone=false, newsReadyFlag=false, newsCountVal=0;
    runFundFlows(rows).then(function(){
      // 近5日就绪后，再拉行业板块当日主力净流入（更稳主源）；clist 挂也不影响板块轮动
      loadClistFlow(function(cl){
        rows.forEach(r=>{ if(cl && !cl.err && cl.map && cl.map[r.code]) r._clistNet=cl.map[r.code]; });
        fundDone=true;
        renderFundTrend(rows, cl);
        renderGlobalBar(rows,true,newsReadyFlag,newsCountVal);
      });
    });

    // 渐进加载：新闻方向（多源降级，最后一步，完成即标记 _done）
    const markDone=()=>{ _done=true; _busy=false; };
    if(typeof loadAnyNews==='function'){
      loadAnyNews(res=>{
        if(res&&!res.err&&res.titles&&res.titles.length){
          const dir=matchNewsToIndustry(res.titles);
          const items=matchNewsToItems(res.items||res.titles.map(t=>({title:t})));
          newsCountVal=Object.keys(dir).length;
          renderNewsDir(items,dir,null,res.label);
          newsReadyFlag=true;
          renderGlobalBar(rows,fundDone,true,newsCountVal);
        } else {
          renderNewsDir(null,null,true,null);
          renderGlobalBar(rows,fundDone,true,0);
        }
        markDone();
      });
    } else { renderNewsDir(null,true,null); markDone(); }

    const tt=document.getElementById('homePanoramaTime'); if(tt&&typeof ts==='function') tt.textContent='更新 '+ts();
  }

  window.renderIndustryPanorama=renderIndustryPanorama;
  window.refreshIndustryPanorama=renderIndustryPanorama;
  window.__pan={ PAN_STRENGTH, pricePercentile, matchNewsToIndustry, matchNewsToItems, contPos, newsSentiment, INDUSTRY_KW, heatColor, renderHeatmap, renderFundTrend, renderOpps, renderNewsDir, renderGlobalBar, ffSecid, parseFundFlow, loadClistFlow, matchClistToPool, loadUlistFlow, fundNameOf, buildFundQueryBar, doFundQuery, loadSingleFlow, loadSinaNews, loadThsNews, loadAnyNews, jsonpGet, resetPanorama:()=>{_done=false;}, isPanoramaDone:()=>_done };
})();
