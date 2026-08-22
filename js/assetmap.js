/* =========================================================================
 * assetmap.js — 二期 大类资产全景：看钱往哪去
 * 黄金/债券/海外/商品 六大类各选一只代表 ETF（全部走腾讯行情，必通）：
 *   今日涨跌 + 近5日/20日走势（K线），帮你感知资金在避险还是进攻。
 * 纯行情描述，不构成投资建议。
 * ========================================================================= */
var ASSET_MAP = [
  { code:'sh518880', name:'黄金',    tag:'避险·抗通胀', group:'safe', tip:'金价涨 → 避险情绪浓、钱在躲风险' },
  { code:'sh511260', name:'十年国债', tag:'避险·利率',   group:'safe', tip:'债价涨 → 市场预期利率下行' },
  { code:'sh513100', name:'纳指',    tag:'海外·科技',   group:'risk', tip:'美股科技风向标' },
  { code:'sz159920', name:'恒生',    tag:'海外·港股',   group:'risk', tip:'港股风向标' },
  { code:'sh501018', name:'原油',    tag:'商品·能源',   group:'risk', tip:'油价 → 通胀与能源板块' },
  { code:'sh512400', name:'有色',    tag:'商品·周期',   group:'risk', tip:'铜铝锂 → 经济周期敏感' }
];
function renderAssetMap(){
  const el = $('assetBody'); if(!el) return;
  el.innerHTML = '<div class="sig-load">大类资产行情加载中…</div>';
  const url = 'https://qt.gtimg.cn/q=' + ASSET_MAP.map(x => x.code).join(',') + '&_=' + Date.now();
  fetch(url)
    .then(r => { if(!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
    .then(buf => {
      const d = (typeof parseTencent === 'function') ? parseTencent(new TextDecoder('gb18030').decode(buf)) : {};
      const keys = Object.keys(d);
      if(!keys.length){ el.innerHTML = '<div class="pan-sub-note">行情源（腾讯）暂时连不上，点「 刷新」重试。</div>'; return; }
      /* 总评：避险 vs 进攻 阵营今日涨跌对比 */
      var safeUp=0, safeTot=0, riskUp=0, riskTot=0;
      ASSET_MAP.forEach(x => { const q=d[x.code]; if(!q||q.changePct==null) return;
        if(x.group==='safe'){ safeTot++; if(q.changePct>=0) safeUp++; } else { riskTot++; if(q.changePct>=0) riskUp++; } });
      var verdict, detail;
      if(safeTot && riskTot){
        if(safeUp>=Math.ceil(safeTot/2) && riskUp<Math.ceil(riskTot/2)){ verdict='避险情绪浓'; detail='黄金/国债走强、风险资产走弱 — 钱在躲风险'; }
        else if(riskUp>=Math.ceil(riskTot/2) && safeUp<Math.ceil(safeTot/2)){ verdict='风险偏好回升'; detail='风险资产走强、避险资产走弱 — 钱在进攻'; }
        else { verdict='多空均衡'; detail='避险与进攻阵营互有涨跌，方向暂不明'; }
      } else { verdict='数据不足'; detail='等待行情加载'; }
      var summary = '<div class="am-summary"><span class="as-label">资金态度</span>'
        + '<span class="as-verdict">' + verdict + '</span>'
        + '<span class="as-detail">' + detail + '（基于今日涨跌）</span></div>';
      /* 分组渲染：避险阵营 / 进攻阵营 */
      var groups = [
        { key:'safe', title:'避险阵营', sub:'黄金 / 国债 — 市场恐慌时往往先涨' },
        { key:'risk', title:'进攻阵营', sub:'纳指 / 恒生 / 原油 / 有色 — 风险偏好高时走强' }
      ];
      var body = '';
      groups.forEach(g => {
        var cards = '';
        ASSET_MAP.filter(x => x.group===g.key).forEach(x => {
          const q = d[x.code]; if(!q) return;
          const up = (q.changePct != null && q.changePct >= 0);
          cards += '<div class="am-card"><div class="am-h"><b>' + escapeHtml(x.name) + '</b>'
            + '<span class="am-tag">' + x.tag + '</span>'
            + '<span class="am-p ' + (up ? 'cls-up' : 'cls-dn') + '">' + (q.changePct == null ? '—' : (q.changePct >= 0 ? '+' : '') + q.changePct.toFixed(2) + '%') + '</span></div>'
            + '<div class="am-price">' + fmt(q.price) + '</div>'
            + '<div class="am-spark" id="amS_' + x.code + '">走势计算中…</div>'
            + '<div class="am-kline" id="amK_' + x.code + '">近20日走势计算中…</div>'
            + '<div class="am-tip">' + x.tip + '</div></div>';
        });
        body += '<div class="am-group"><div class="am-group-h">' + g.title + '<span class="ag-sub">' + g.sub + '</span></div>'
          + '<div class="am-grid">' + cards + '</div></div>';
      });
      el.innerHTML = summary + body;
      /* 异步填 K线（文字 + sparkline） */
      if(typeof loadKlineP === 'function' && typeof klinePct === 'function'){
        ASSET_MAP.forEach(x => {
          loadKlineP(x.code, 'd').then(kl => {
            const node = $('amK_' + x.code), snode = $('amS_' + x.code);
            if(kl && kl.length){
              const cc = (kl.length>60 ? kl.slice(-60) : kl).map(z => z.close);
              const c5 = klinePct(kl, 5), c20 = klinePct(kl, 20);
              if(node) node.innerHTML = '近5日 ' + (c5 == null ? '—' : pct(c5)) + ' · 近20日 ' + (c20 == null ? '—' : pct(c20));
              if(snode) snode.innerHTML = (typeof sparklineSVG==='function') ? sparklineSVG(cc, {h:38}) : '';
            } else { if(node) node.innerHTML = 'K线暂连不上'; if(snode) snode.innerHTML = ''; }
          }).catch(() => { const node = $('amK_' + x.code), snode = $('amS_' + x.code); if(node) node.innerHTML = 'K线暂连不上'; if(snode) snode.innerHTML = ''; });
        });
      }
    })
    .catch(() => { el.innerHTML = '<div class="pan-sub-note">行情源（腾讯）暂时连不上，点「 刷新」重试。</div>'; });
}
