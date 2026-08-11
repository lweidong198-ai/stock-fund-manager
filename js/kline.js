/* =========================================================================
 * kline.js
 * 模块来源小节：K线：A股/ETF 腾讯前复权; 港/美 新浪 JSONP
 * 说明：本文件由单文件 index.html 按原小节注释机械拆分而来，
 *       代码逐字保留，函数仍为全局（经典 script 加载，双击 file 可用）。
 * ========================================================================= */

/* ============ K线：A股/ETF 腾讯前复权; 港/美 新浪 JSONP ============ */
function loadKline(code, period, cb, opt){
  code = normCode(code) || code;   // 归一化：纯数字 A股/ETF 补 sh/sz 前缀(如 159992→sz159992)；否则腾讯 fqkline 返回空 → K线崩(本 bug 曾导致创新药等无前缀行业ETF K线白屏/假数据)
  opt = opt || {};
  const reqKey = code+'-'+period;           // 当前请求身份
  if(!opt.ignoreReqKey) state._klineReqKey = reqKey; // 只认最后一次请求（并行批量拉取时忽略该守卫，否则其余请求会被提前 return 永不回调）
  let done=false;
  const fin=(v, isDemo=false)=>{
    if(done)return; done=true;
    clearTimeout(tm);
    // 如果用户已经切到别的代码/周期，丢弃这次回调，避免旧数据覆盖新图；ignoreReqKey 时无论如何都要回调（批量扫描并行请求互不干扰）
    if(!opt.ignoreReqKey && state._klineReqKey !== reqKey) return;
    // —— 数据校准：K线质量自检（静默后台，仅异常时角标提醒）——
    if(window.DataCalibrator){
      // 降级文案明确区分「数据源连不上」与「K线本身错误」，避免误判（沙箱/断网时拉不到腾讯源会走这里）
      const DEMO = 'K线数据源暂连不上(演示数据)：'+code;
      const DEMO2 = DEMO+'（可能超时/无网络/接口异常，沙箱环境常见）';
      if(opt.tailOnly){
        if(isDemo) DataCalibrator.reportFetch(DEMO); else DataCalibrator.clearFetch(DEMO);
      } else {
        const reasons = DataCalibrator.checkKline(code, v);
        DataCalibrator.reportKline(code, isDemo ? [] : reasons);
        if(isDemo) DataCalibrator.reportFetch(DEMO2);
        else { DataCalibrator.clearFetch(DEMO); DataCalibrator.clearFetch(DEMO2); } // 成功拉到真实数据 → 清除之前的降级标记，否则角标永久挂着
      }
    }
    cb(sanitizeKline(v), isDemo);   // 过滤周末等脏数据 bar 后再交给绘图/缓存
  };
  const tm=setTimeout(()=>fin(demoKline(code, period), true), 8000); // 8秒未返回 → 演示数据

  // A股/ETF 用腾讯前复权，消除除权/拆分/分红导致的BOLL/MA/MACD椭圆失真
  if(/^sh|^sz/i.test(code)){
    const ptype = period==='w'?'week':'day';
    const fQ = period==='w'?'qfqweek':'qfqday';   // 前复权字段
    const fR = period==='w'?'week':'day';         // 原始（未复权）字段
    const _td=new Date(); const today=_td.getFullYear()+'-'+String(_td.getMonth()+1).padStart(2,'0')+'-'+String(_td.getDate()).padStart(2,'0');
    // 腾讯 fqkline 单次最多返回约 640 根；日期区间参数有效，可用「滚动 end 日期」分段向前翻页
    const SEG = 640, MAX_SEG = 5;   // 5 段 ≈ 3200 根（日线约 12~13 年），覆盖绝大多数标的完整历史，不止于首屏 640 根
    const rowsToKl = rows => rows.map(x=>({ date:x[0], open:+x[1], high:+x[3], low:+x[4], close:+x[2], vol:+x[5] }))
                                 .filter(x=>x.close>0 && x.date);
    const fetchSeg = (endDate) => {
      const url='https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param='+code+','+ptype+',1990-01-01,'+endDate+','+SEG+',qfq&_='+Date.now()+Math.random();
      return fetch(url).then(r=>r.json()).then(j=>{
        const d = (((j||{}).data||{})[code])||{};
        // 关键：未发生过除权/分红的标的（多数ETF、全部指数）腾讯只返回 day/week，没有 qfqday/qfqweek。
        // 旧版只认 qfq 字段 → 取空 → 回退演示假数据。此处必须回退到原始字段（无除权时两者等价）。
        const rows = (d[fQ] && d[fQ].length) ? d[fQ] : (d[fR] || []);
        return rowsToKl(rows);
      });
    };
    // 带重试的段抓取：腾讯对来自同 IP 的突发多次请求会偶发限流/返回空（浏览器里首屏+多段连发尤其易触发），
    // 一次空段就会让「补全更早历史」中断、K线永远停在首屏 640 根（日线≈2.5年，表现为“最远只到某年某月”）。
    // 加重试(最多 3 次、递增退避 300/600ms)可自愈，避免历史被截断。
    const fetchSegR = (endDate, attempt=0) => fetchSeg(endDate).then(seg=>{
      if((!seg || !seg.length) && attempt<2) return new Promise(r=>setTimeout(()=>r(fetchSegR(endDate, attempt+1)), 300*(attempt+1)));
      return seg || [];
    }).catch(()=> attempt<2 ? new Promise(r=>setTimeout(()=>r(fetchSegR(endDate, attempt+1)), 300*(attempt+1))) : []);
    const prevDay = ds => { const y=+ds.slice(0,4), m=+ds.slice(5,7)-1, d=+ds.slice(8,10); const t=new Date(Date.UTC(y,m,d)); t.setUTCDate(t.getUTCDate()-1); return t.toISOString().slice(0,10); };
    // 轻量刷新模式：只拉最近若干根（含当日），用于盘中定时更新当日K线，避免每次重拉全部历史
    if(opt.tailOnly){
      const turl='https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param='+code+','+ptype+','+prevDay(today)+','+today+',8,qfq&_='+Date.now()+Math.random();
      fetch(turl).then(r=>r.json()).then(j=>{
        const d=(((j||{}).data||{})[code])||{};
        const rows=(d[fQ]&&d[fQ].length)?d[fQ]:(d[fR]||[]);
        const kl=rowsToKl(rows);
        if(!kl.length){ fin(demoKline(code, period), true); return; }
        fin(kl, false);
      }).catch(()=>fin(demoKline(code, period), true));
      return;
    }
    // 后台补全更早历史（带重试，抗限流）：resolved 时返回 {all, stopped}
    //   stopped: 'maxseg'  达到预读段数上限（已尽力，一般无需告警）
    //            'noearlier' 末段返回了数据但无更早 bar → 已到真实历史尽头（非截断，不告警）
    //            'empty'     末段重试后仍为空 → 多半是接口偶发限流，历史可能未拉全（需告警）
    const pullHistory = (seed) => new Promise(resolve=>{
      let all = seed.slice(), guard = 0, stopped = 'maxseg';
      const step = () => {
        if(guard++ >= MAX_SEG-1){ stopped='maxseg'; resolve({all, stopped}); return; }
        const endDate = prevDay(all[0].date);
        fetchSegR(endDate).then(seg=>{
          if(!seg || !seg.length){ stopped='empty'; resolve({all, stopped}); return; }   // 重试后仍空 → 疑似限流
          const cut = all[0].date;
          const add = seg.filter(x=>x.date < cut);            // 去重，避免边界重复
          if(!add.length){ stopped='noearlier'; resolve({all, stopped}); return; }        // 无更早数据 → 真实尽头
          all = add.concat(all);
          step();
        });
      };
      step();
    });
    // 首屏立即出图，再后台补全历史
    fetchSeg(today).then(first=>{
      if(!first.length){ fin(demoKline(code, period), true); return; }
      fin(first, false);                       // 首屏立即渲染
      // 仅当调用方接了 onHistory（详情页交互视图）才做补全+自检；批量扫描不接 onHistory，跳过以免刷屏告警
      if(typeof opt.onHistory === 'function'){
        const extend = (round) => pullHistory(first).then(({all, stopped})=>{
          const fullS = sanitizeKline(all);   // 关键：补全的历史也必须清洗，否则脏负价/周末 bar 混进缓存→曾修好的“一条线”复发
          if(fullS.length > first.length) opt.onHistory(fullS);
          // —— 历史完整性自检（每次加载都检测，防“最远只到某近期日期”）——
          // 判据：首屏触到单段上限(640) 且 后台因“空段”(限流)中止 且 实际未扩展 → 补全失败，K线停在≈2.5年。
          // 命中“真实历史尽头”(noearlier) 或 已正常扩展 都不告警，避免误报。
          const warn = klineTruncWarn(first.length, fullS.length, period, stopped);
          const DC = window.DataCalibrator;
          if(warn){
            if(round < 1){ setTimeout(()=>extend(round+1), 900); return; }   // 自动重试一次，自愈偶发限流
            if(DC) DC.reportKline(code, [warn]);                            // 仍失败 → 角标提示（行情区「重试」可补）
          } else if(DC) DC.reportKline(code, []);                           // 正常 → 清除可能的历史告警
        });
        extend(0);
      }
    }).catch(e=>{ console.error('loadKline tencent error', code, e); fin(demoKline(code, period), true); });
    return;
  }

  // 港股/美股仍走新浪JSONP
  const sym = sinaSymbol(code);
  const scale = period==='w'?1200:240;
  const name = 'kcb'+Math.random().toString(36).slice(2)+Date.now();
  const s=document.createElement('script');
  s.onload=function(){
    const arr = window[name];
    try{
      const kl = (arr||[]).map(x=>({ date:x.day, open:+x.open, high:+x.high, low:+x.low, close:+x.close, vol:+x.volume })).filter(x=>x.close>0);
      fin(kl.length?kl:demoKline(code, period), kl.length===0);
    }catch(e){ console.error('loadKline parse error', code, e); fin(demoKline(code, period), true); }
  };
  s.onerror=function(e){ console.error('loadKline network error', code, e); fin(demoKline(code, period), true); };
  s.src='https://money.finance.sina.com.cn/quotes_service/api/jsonp_v2.php/var%20'+name+'=/CN_MarketData.getKLineData?symbol='+sym+'&scale='+scale+'&ma=5&datalen=5000&_='+Date.now();
  document.body.appendChild(s);
}

/* ============ K线历史完整性自检 ============
 * 触发场景（用户多次反馈的“K线最远只到某近期日期”）：
 *   腾讯 fqkline 单请求上限≈640 根；首屏拉到上限后，后台本应翻页补全更早历史，
 *   但若补全请求被限流/返回空（无重试时），onHistory 永不触发，K线永远停在首屏≈2.5年。
 * 判据（不依赖“该标的历史应有几年”的先验知识，只看运行时信号）：
 *   首屏触到单段上限(firstLen≥637) 且 后台补全因“空段”中止(stopped==='empty'，多半限流)
 *   且 实际未扩展(fullLen≤firstLen+5) → 补全失败，告警并可由「重试」自愈。
 * 命中“真实历史尽头”(stopped==='noearlier'，末段有数据但无更早 bar) 或 已正常扩展 → 不告警，避免误报。 */
function klineTruncWarn(firstLen, fullLen, period, stopped){
  const SEG = 640;
  if(firstLen >= SEG - 3 && stopped === 'empty' && fullLen <= firstLen + 5){
    return 'K线可能未拉全：后台补全更早历史时接口偶发未返回数据（仅 '+fullLen+' 根，最早约到近期）。多为行情接口偶发限流，点行情区「重试」即可补全。';
  }
  return null;
}

