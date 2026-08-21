/* =========================================================================
 * assetmap.js — 二期 大类资产全景：看钱往哪去
 * 黄金/债券/海外/商品 六大类各选一只代表 ETF（全部走腾讯行情，必通）：
 *   今日涨跌 + 近5日/20日走势（K线），帮你感知资金在避险还是进攻。
 * 纯行情描述，不构成投资建议。
 * ========================================================================= */
var ASSET_MAP = [
  { code:'sh518880', name:'黄金',    tag:'避险·抗通胀', tip:'金价涨 → 避险情绪浓、钱在躲风险' },
  { code:'sh511260', name:'十年国债', tag:'避险·利率',   tip:'债价涨 → 市场预期利率下行' },
  { code:'sh513100', name:'纳指',    tag:'海外·科技',   tip:'美股科技风向标' },
  { code:'sz159920', name:'恒生',    tag:'海外·港股',   tip:'港股风向标' },
  { code:'sh501018', name:'原油',    tag:'商品·能源',   tip:'油价 → 通胀与能源板块' },
  { code:'sh512400', name:'有色',    tag:'商品·周期',   tip:'铜铝锂 → 经济周期敏感' }
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
      if(!keys.length){ el.innerHTML = '<div class="pan-sub-note">行情源（腾讯）暂时连不上，点「🔄 刷新」重试。</div>'; return; }
      let h = '';
      ASSET_MAP.forEach(x => {
        const q = d[x.code]; if(!q) return;
        const up = (q.changePct != null && q.changePct >= 0);
        h += '<div class="am-card"><div class="am-h"><b>' + escapeHtml(x.name) + '</b>'
          + '<span class="am-tag">' + x.tag + '</span>'
          + '<span class="am-p ' + (up ? 'cls-up' : 'cls-dn') + '">' + (q.changePct == null ? '—' : (q.changePct >= 0 ? '+' : '') + q.changePct.toFixed(2) + '%') + '</span></div>'
          + '<div class="am-price">' + fmt(q.price) + '</div>'
          + '<div class="am-tip">' + x.tip + '</div>'
          + '<div class="am-kline" id="amK_' + x.code + '">近20日走势计算中…</div></div>';
      });
      el.innerHTML = '<div class="am-grid">' + h + '</div>';
      if(typeof loadKlineP === 'function' && typeof klinePct === 'function'){
        ASSET_MAP.forEach(x => {
          loadKlineP(x.code, 'd').then(kl => {
            const node = $('amK_' + x.code); if(!node) return;
            if(kl && kl.length){
              const c5 = klinePct(kl, 5), c20 = klinePct(kl, 20);
              node.innerHTML = '近5日 ' + (c5 == null ? '—' : (c5 >= 0 ? '+' : '') + c5.toFixed(1) + '%')
                + ' · 近20日 ' + (c20 == null ? '—' : (c20 >= 0 ? '+' : '') + c20.toFixed(1) + '%');
            } else node.innerHTML = 'K线暂连不上';
          }).catch(() => { const node = $('amK_' + x.code); if(node) node.innerHTML = 'K线暂连不上'; });
        });
      }
    })
    .catch(() => { el.innerHTML = '<div class="pan-sub-note">行情源（腾讯）暂时连不上，点「🔄 刷新」重试。</div>'; });
}
