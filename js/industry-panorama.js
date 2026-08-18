/* =========================================================================
 * industry-panorama.js
 * 模块：工作台「行业全景」聚合面板（纯前端·零Key）
 * 把散落在「行业雷达 / 行业温度计 / 资金流向」里的全行业信息聚到一个面板：
 *   七态状态 + 冷热分位(3年) + 主力资金净流入 + 今日涨跌 + 技术强弱分
 * 复用 sectors.js 的 computeIndustryRows()（七态分析）、moneyflow.js 的主力资金流。
 * 数据不足/接口连不上 → 诚实标灰「连不上」，绝不显示假数据。
 * ========================================================================= */
(function(){
  // 七态强弱排序权重（强→弱）；缺数据排最末
  const PAN_STRENGTH = { bull:6, reversal:5, shortbottom:4, deepvalue:3.5, flat:2, downrebound:1, down:0, miss:-1 };

  // 当前价在最近 days 日价格区间的位置（0=最低/最便宜/最冷，1=最高/最贵/最热）
  function pricePercentile(kl, days){
    if(!kl||kl.length<2) return null;
    const w=kl.slice(-days); const closes=w.map(x=>x.close);
    const cur=closes[closes.length-1], lo=Math.min.apply(null,closes), hi=Math.max.apply(null,closes);
    return hi>lo ? (cur-lo)/(hi-lo) : 0.5;
  }

  function sortIndustryRows(rows){
    return rows.slice().sort((a,b)=>{
      const sa=a.klMiss?-1e9:(PAN_STRENGTH[(a._st&&a._st.state)||'miss']!=null?PAN_STRENGTH[a._st.state]:-1e9);
      const sb=b.klMiss?-1e9:(PAN_STRENGTH[(b._st&&b._st.state)||'miss']!=null?PAN_STRENGTH[b._st.state]:-1e9);
      if(sb!==sa) return sb-sa;                         // 先按七态强弱
      const ca=a.c20==null?-1e9:a.c20, cb=b.c20==null?-1e9:b.c20; return cb-ca; // 同档按近20日涨跌
    });
  }

  function paintIndustryPanorama(rows){
    const el=document.getElementById('homePanoramaBody'); if(!el) return;
    const sorted=sortIndustryRows(rows);
    let h='<table class="pan-table"><thead><tr>'
      +'<th>行业</th><th>七态状态</th><th class="num">今日</th><th class="num">近20日</th><th class="num">冷热分位(3年)</th><th class="num">主力资金流</th><th class="num">技术强弱分</th>'
      +'</tr></thead><tbody>';
    for(const r of sorted){
      const st=r.klMiss?null:r._st;
      const stTag=st?('<span class="op-state st-'+st.state+'" data-tip="'+st.tip+'">'+st.label+'</span>'+(st.lean?'<div class="op-lean">'+st.lean+'</div>':'')):'<span class="op-state st-miss">连不上</span>';
      const day=r.day==null?'—':('<span class="'+(r.day>=0?'cls-up':'cls-dn')+'">'+(r.day>=0?'+':'')+r.day.toFixed(2)+'%</span>');
      const c20=r.c20==null?'—':('<span class="'+(r.c20>=0?'cls-up':'cls-dn')+'">'+(r.c20>=0?'+':'')+r.c20.toFixed(1)+'%</span>');
      const pctCell=r._pct3y==null?'—':('<span class="'+(r._pct3y<0.3?'cls-up':(r._pct3y>0.7?'cls-dn':'cls-flat'))+'">'+Math.round(r._pct3y*100)+'%</span>');
      const flow=r._flow==null?'<span class="pan-pend">…</span>':(r._flow.err?'—':('<span class="'+(r._flow.main>=0?'cls-up':'cls-dn')+'">'+fmtMoney(r._flow.main)+'</span>'));
      const score=(r._F&&r._F.score!=null)?r._F.score.toFixed(1):'—';
      h+='<tr data-code="'+r.code+'" class="'+(r.klMiss?'pan-miss':'')+'">'
        +'<td class="pan-name">'+escapeHtml(r.name)+'<span class="pan-etf">'+(r.etf||'')+'</span></td>'
        +'<td>'+stTag+'</td>'
        +'<td class="num">'+day+'</td>'
        +'<td class="num">'+c20+'</td>'
        +'<td class="num">'+pctCell+'</td>'
        +'<td class="num" data-flow="'+r.code+'">'+flow+'</td>'
        +'<td class="num">'+score+'</td>'
        +'</tr>';
    }
    h+='</tbody></table>';
    el.innerHTML=h;
    el.querySelectorAll('tr[data-code]').forEach(tr=>tr.onclick=()=>{ const c=tr.dataset.code; if(typeof selectCode==='function') selectCode(c); if(typeof showView==='function') showView('market'); });
  }

  async function renderIndustryPanorama(){
    const box=document.getElementById('homePanorama'); if(!box) return;
    const body=document.getElementById('homePanoramaBody');
    if(body) body.innerHTML='<div class="empty">正在聚合全行业信息（实时行情+K线+七态+冷热+资金流，约数秒）…</div>';
    const POOL=INDUSTRY_POOL.concat((typeof loadCustomSectors==='function')?loadCustomSectors():[]);
    let data;
    try{ data=await computeIndustryRows(POOL); }
    catch(e){ console.warn('computeIndustryRows failed',e); if(body) body.innerHTML='<div class="empty">行业数据加载失败，请稍后点「刷新」重试。</div>'; return; }
    const rows=data.rows||[];
    rows.forEach(r=>{ r._pct3y=r.klMiss?null:pricePercentile(r._kl,756); });
    paintIndustryPanorama(rows);
    const warnEl=document.getElementById('homePanoramaWarn'); if(warnEl) warnEl.innerHTML=(data.demoWarn)?('<div class="demo-warn">'+data.demoWarn+'</div>'):'';
    const tt=document.getElementById('homePanoramaTime'); if(tt&&typeof ts==='function') tt.textContent='更新 '+ts();
    // 渐进加载主力资金流（不阻塞首屏；东财连不上则标「—」，诚实降级）
    rows.forEach(r=>{ if(r.klMiss||typeof loadFundFlow!=='function') return;
      loadFundFlow(r.code, res=>{ const cell=document.querySelector('[data-flow="'+r.code+'"]'); if(!cell) return;
        if(res&&!res.err){ r._flow=res; cell.innerHTML='<span class="'+(res.main>=0?'cls-up':'cls-dn')+'">'+fmtMoney(res.main)+'</span>'; }
        else cell.innerHTML='—';
      });
    });
  }

  window.renderIndustryPanorama=renderIndustryPanorama;
  window.refreshIndustryPanorama=renderIndustryPanorama;
  window.__pan={ PAN_STRENGTH, pricePercentile, sortIndustryRows, paintIndustryPanorama };
})();
