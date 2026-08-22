/* =========================================================================
 * sparkline.js — 迷你走势曲线（纯内联 SVG，零依赖、零 Key）
 * 用于大类资产 / 宏观温度等卡片内嵌近 N 日走势。
 * 配色遵循 A 股习惯：涨=红、跌=绿。
 * ========================================================================= */
function sparklineSVG(closes, opts){
  opts = opts || {};
  var w = opts.w || 220, h = opts.h || 38, pad = 5;
  if(!closes || !closes.length || closes.length < 2) return '';
  var min = Math.min.apply(null, closes), max = Math.max.apply(null, closes);
  if(max - min < 1e-9){ max = min + 1; min = min - 1; }
  var X = function(i){ return pad + i * (w - 2*pad) / (closes.length - 1); };
  var Y = function(v){ return pad + (1 - (v - min) / (max - min)) * (h - 2*pad); };
  var pts = '';
  for(var i = 0; i < closes.length; i++){
    pts += (i ? ' ' : '') + X(i).toFixed(1) + ',' + Y(closes[i]).toFixed(1);
  }
  var up = closes[closes.length - 1] >= closes[0];
  var col = up ? '#e8403d' : '#1aa35a'; /* 红涨绿跌 */
  var lx = X(closes.length - 1), ly = Y(closes[closes.length - 1]);
  return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" width="100%" height="' + h + '">'
    + '<polyline fill="none" stroke="' + col + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" points="' + pts + '"/>'
    + '<circle cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" r="2.3" fill="' + col + '"/></svg>';
}
