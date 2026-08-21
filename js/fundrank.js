/* =========================================================================
 * fundrank.js — 二期 基金排行筛选
 * 数据源：东方财富天天基金排行（rankhandler.aspx，script 注入读全局 rankData）
 * 排序：近1年涨幅降序，展示 代码/名称/单位净值/日增长率/近1周~近1年
 * ⚠️ 东财在你的网络下可能被拦 → 诚实提示「排行源被拦，本机双击 index.html 可用」
 * 排行仅作筛选参考，不构成投资建议。
 * ========================================================================= */
var RANK_URL = 'https://fund.eastmoney.com/data/rankhandler.aspx?op=ph&dt=kf&ft=all&rs=&gs=0&sc=1nzf&st=desc&pi=1&pn=30&dx=1&v=';
/* 纯解析：rankData.datas 每项 "代码,名称,日期,单位净值,日增长率,近1周,近1月,近3月,近6月,近1年,..."
   返回 [{code,name,date,nav,day,w1,m1,m3,m6,y1}]（字段可能缺，缺则 null） */
function parseRank(datas){
  if(!Array.isArray(datas)) return [];
  return datas.map(s => {
    const a = String(s || '').split(',');
    const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
    return {
      code: a[0] || '', name: a[1] || '', date: a[2] || '',
      nav: num(a[3]), day: num(a[4]), w1: num(a[5]), m1: num(a[6]), m3: num(a[7]), m6: num(a[8]), y1: num(a[9])
    };
  }).filter(x => x.code && x.name);
}
function loadFundRank(cb){
  const cbName = 'fr_' + Math.random().toString(36).slice(2, 8);
  let done = false;
  function finish(res){ if(done) return; done = true; try{ delete window[cbName]; }catch(e){} cb(res); }
  window[cbName] = function(){ finish({ err:'parse' }); };   // 万一返回函数式 JSONP 也不崩
  const s = document.createElement('script');
  s.src = RANK_URL + Date.now() + '&cb=' + cbName;
  s.onerror = function(){ finish({ err:'net' }); if(s.parentNode) s.parentNode.removeChild(s); };
  s.onload = function(){
    if(s.parentNode) s.parentNode.removeChild(s);
    try{
      const rd = window.rankData;
      const list = parseRank(rd && rd.datas);
      if(list.length) finish({ err:null, list, total: rd && rd.allRecords });
      else finish({ err:'empty' });
    }catch(e){ finish({ err:'parse' }); }
  };
  document.body.appendChild(s);
  setTimeout(function(){ finish({ err:'timeout' }); }, 9000);
}
function renderFundRank(){
  const el = $('rankBody'); if(!el) return;
  el.innerHTML = '<div class="sig-load">基金排行加载中…（近1年涨幅降序 · 东方财富）</div>';
  loadFundRank(function(res){
    if(!el) return;
    if(!res || res.err){
      el.innerHTML = '<div class="pan-sub-note">⚠ 基金排行源（东方财富）在当前网络连不上（可能被广告拦截/网络限制）。<br>解决：① 本机<b>双击 index.html</b> 打开 ② 给 fund.eastmoney.com 加白名单 ③ 换网络重试。<br>排行只是筛选工具，功能不受影响。</div>';
      return;
    }
    let h = '<div class="rank-note">按「近1年涨幅」降序 · 共 ' + (res.total || res.list.length) + ' 条（显示前 ' + res.list.length + '）· 仅供参考不构成建议</div>'
      + '<div class="rank-table-wrap"><table class="rank-table"><thead><tr><th>#</th><th>代码</th><th>名称</th><th>单位净值</th><th>日涨%</th><th>近1周%</th><th>近1月%</th><th>近3月%</th><th>近6月%</th><th>近1年%</th><th></th></tr></thead><tbody>';
    res.list.forEach((x, i) => {
      const p = v => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2);
      h += '<tr><td>' + (i + 1) + '</td><td>' + x.code + '</td><td class="rank-nm">' + escapeHtml(x.name) + '</td>'
        + '<td>' + (x.nav == null ? '—' : x.nav.toFixed(4)) + '</td>'
        + '<td class="' + (x.day >= 0 ? 'cls-up' : 'cls-dn') + '">' + p(x.day) + '</td>'
        + '<td class="' + (x.w1 >= 0 ? 'cls-up' : 'cls-dn') + '">' + p(x.w1) + '</td>'
        + '<td class="' + (x.m1 >= 0 ? 'cls-up' : 'cls-dn') + '">' + p(x.m1) + '</td>'
        + '<td class="' + (x.m3 >= 0 ? 'cls-up' : 'cls-dn') + '">' + p(x.m3) + '</td>'
        + '<td class="' + (x.m6 >= 0 ? 'cls-up' : 'cls-dn') + '">' + p(x.m6) + '</td>'
        + '<td class="' + (x.y1 >= 0 ? 'cls-up' : 'cls-dn') + '">' + p(x.y1) + '</td>'
        + '<td><button class="ghost" style="font-size:11px;padding:2px 8px;" onclick="addWatch(\'' + x.code + '\')">加自选</button></td></tr>';
    });
    h += '</tbody></table></div>';
    el.innerHTML = h;
  });
}
