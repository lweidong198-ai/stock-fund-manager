/* =========================================================================
 * calendar.js
 * 交易日历：本地日期计算 + 内置主要节假日，零 API Key
 * 说明：显示今日是否交易日、本月第几个交易日、剩余交易日、近期节假日提示。
 *       节假日数据覆盖 2024-2026 主要假期，2026 未公布日期按惯例预估并标注"预计"。
 * ========================================================================= */

const HOLIDAYS={
  '2024-01-01':{name:'元旦'},
  '2024-02-09':{name:'春节'},'2024-02-10':{name:'春节'},'2024-02-11':{name:'春节'},'2024-02-12':{name:'春节'},'2024-02-13':{name:'春节'},'2024-02-14':{name:'春节'},'2024-02-15':{name:'春节'},'2024-02-16':{name:'春节'},'2024-02-17':{name:'春节'},
  '2024-04-04':{name:'清明'},'2024-04-05':{name:'清明'},'2024-04-06':{name:'清明'},
  '2024-05-01':{name:'劳动节'},'2024-05-02':{name:'劳动节'},'2024-05-03':{name:'劳动节'},'2024-05-04':{name:'劳动节'},'2024-05-05':{name:'劳动节'},
  '2024-06-10':{name:'端午'},
  '2024-09-15':{name:'中秋'},'2024-09-16':{name:'中秋'},'2024-09-17':{name:'中秋'},
  '2024-10-01':{name:'国庆'},'2024-10-02':{name:'国庆'},'2024-10-03':{name:'国庆'},'2024-10-04':{name:'国庆'},'2024-10-05':{name:'国庆'},'2024-10-06':{name:'国庆'},'2024-10-07':{name:'国庆'},
  '2025-01-01':{name:'元旦'},
  '2025-01-28':{name:'春节'},'2025-01-29':{name:'春节'},'2025-01-30':{name:'春节'},'2025-01-31':{name:'春节'},
  '2025-02-01':{name:'春节'},'2025-02-02':{name:'春节'},'2025-02-03':{name:'春节'},'2025-02-04':{name:'春节'},
  '2025-04-04':{name:'清明'},'2025-04-05':{name:'清明'},'2025-04-06':{name:'清明'},
  '2025-05-01':{name:'劳动节'},'2025-05-02':{name:'劳动节'},'2025-05-03':{name:'劳动节'},'2025-05-04':{name:'劳动节'},'2025-05-05':{name:'劳动节'},
  '2025-05-31':{name:'端午'},'2025-06-01':{name:'端午'},'2025-06-02':{name:'端午'},
  '2025-10-01':{name:'国庆/中秋'},'2025-10-02':{name:'国庆/中秋'},'2025-10-03':{name:'国庆/中秋'},'2025-10-04':{name:'国庆/中秋'},'2025-10-05':{name:'国庆/中秋'},'2025-10-06':{name:'国庆/中秋'},'2025-10-07':{name:'国庆/中秋'},'2025-10-08':{name:'国庆/中秋'},
  '2026-01-01':{name:'元旦'},
  '2026-02-17':{name:'春节(预计)'},'2026-02-18':{name:'春节(预计)'},'2026-02-19':{name:'春节(预计)'},'2026-02-20':{name:'春节(预计)'},'2026-02-21':{name:'春节(预计)'},'2026-02-22':{name:'春节(预计)'},'2026-02-23':{name:'春节(预计)'},'2026-02-24':{name:'春节(预计)'},'2026-02-25':{name:'春节(预计)'},
  '2026-04-04':{name:'清明(预计)'},'2026-04-05':{name:'清明(预计)'},'2026-04-06':{name:'清明(预计)'},
  '2026-05-01':{name:'劳动节(预计)'},'2026-05-02':{name:'劳动节(预计)'},'2026-05-03':{name:'劳动节(预计)'},'2026-05-04':{name:'劳动节(预计)'},'2026-05-05':{name:'劳动节(预计)'},
  '2026-06-19':{name:'端午(预计)'},'2026-06-20':{name:'端午(预计)'},'2026-06-21':{name:'端午(预计)'},
  '2026-09-23':{name:'中秋(预计)'},'2026-09-24':{name:'中秋(预计)'},'2026-09-25':{name:'中秋(预计)'},'2026-09-26':{name:'国庆调休(预计)'},
  '2026-10-01':{name:'国庆(预计)'},'2026-10-02':{name:'国庆(预计)'},'2026-10-03':{name:'国庆(预计)'},'2026-10-04':{name:'国庆(预计)'},'2026-10-05':{name:'国庆(预计)'},'2026-10-06':{name:'国庆(预计)'},'2026-10-07':{name:'国庆(预计)'}
};

function dateKey(d){ const y=d.getFullYear(), m=d.getMonth()+1, day=d.getDate(); return y+'-'+(m<10?'0':'')+m+'-'+(day<10?'0':'')+day; }
function isHoliday(d){ return !!HOLIDAYS[dateKey(d)]; }
function isTradingDay(d){ const day=d.getDay(); return day!==0 && day!==6 && !isHoliday(d); }
function copyDate(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function tradingDayOfMonth(d){
  const start=new Date(d.getFullYear(), d.getMonth(), 1);
  let cnt=0;
  for(let i=copyDate(start); i<=d; i.setDate(i.getDate()+1)){
    if(isTradingDay(i)) cnt++;
  }
  return cnt;
}
function remainingTradingDays(d){
  const end=new Date(d.getFullYear(), d.getMonth()+1, 0);
  let cnt=0;
  for(let i=copyDate(d); i<=end; i.setDate(i.getDate()+1)){
    if(isTradingDay(i) && i>d) cnt++;
  }
  return cnt;
}
function nextEvents(d, limit){
  const out=[]; let cur=copyDate(d); let guard=0;
  while(out.length<limit && guard<400){
    cur.setDate(cur.getDate()+1); guard++;
    const h=HOLIDAYS[dateKey(cur)];
    if(h && !out.some(x=>x.name===h.name)){
      let len=1; let j=copyDate(cur); j.setDate(j.getDate()+1);
      while(HOLIDAYS[dateKey(j)] && HOLIDAYS[dateKey(j)].name.replace('(预计)','')===h.name.replace('(预计)','')){ len++; j.setDate(j.getDate()+1); }
      const tradingDaysUntil=(function(){
        let c=0, k=copyDate(d);
        while(k<cur){ k.setDate(k.getDate()+1); if(isTradingDay(k)) c++; }
        return c;
      })();
      out.push({name:h.name, start:dateKey(cur), len:len, days:tradingDaysUntil});
      cur=j; cur.setDate(cur.getDate()-1);
    }
  }
  return out;
}
function weekdayName(d){ const arr=['周日','周一','周二','周三','周四','周五','周六']; return arr[d.getDay()]; }
function fmtMD(d){ return (d.getMonth()+1)+'月'+d.getDate()+'日'; }
function fmtMDShort(key){ const [y,m,day]=key.split('-').map(Number); return m+'月'+day+'日'; }

/* 日历现嵌入指数条末端（renderIndexBar 已调用 buildTradeCalendarChip）。
   保留 renderTradeCalendar 作为手动刷新入口：重渲染指数条即可同步更新日历色块。 */
function renderTradeCalendar(){
  if(typeof renderIndexBar==='function') renderIndexBar();
}
