// 网格搜索: 预测周期 H × 权重估计窗口 K(滚动/全历史) → 样本外 IC / 回归斜率
// 目的: 用真实数据判断「横截面因子选行业」到底在哪个配置下有稳定信号, 而不是靠猜
const puppeteer=require('puppeteer-core');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--disable-setuid-sandbox']});
  const page=await browser.newPage();
  page.on('pageerror',e=>console.log('PAGEERR',e.message));
  await page.goto('http://localhost:8788/', {waitUntil:'networkidle2', timeout:60000}).catch(()=>{});
  await sleep(1200);
  await page.evaluate(()=>{ try{ goView('fund'); renderOpportunities(); }catch(e){} });
  let ready=false;
  for(let i=0;i<45;i++){ await sleep(2000); const ok=await page.evaluate(()=> !!(OPP_CACHE && (OPP_CACHE.rows||[]).length)); if(ok){ ready=true; break; } }
  if(!ready){ console.log('DATA_NOT_READY'); await browser.close(); process.exit(1); }

  const out = await page.evaluate(()=>{
    const rows=OPP_CACHE.rows||[];
    const allKl={}; rows.forEach(r=>{ if(r._kl && r._kl.length>=300) allKl[r.code]=r._kl; });
    const codes=Object.keys(allKl);
    const L=Math.min(...codes.map(c=>allKl[c].length));
    const FSET=['vol','mom120','rev5'];

    // 预计算：每个时点每只标的的因子值 + 各周期未来收益
    function run(H, K){                 // K=null 表示用全部历史估计
      const T0=130, step=10, TEnd=Math.max(T0, L-H);
      const times=[]; for(let T=T0;T<=TEnd;T+=step) times.push(T);
      if(times.length<6) return null;
      const cache={};
      const facAt=T=>{ if(cache[T]) return cache[T]; const o={}; for(const c of codes){ const fv=factorsMine(allKl[c],T); if(fv) o[c]=fv; } cache[T]=o; return o; };
      const retAt=(T,h)=>{ const o={}; for(const c of codes){ const kl=allKl[c]; if(T>=kl.length) continue; const T2=Math.min(T+h,kl.length-1); o[c]=(kl[T2].close-kl[T].close)/kl[T].close*100; } return o; };
      const ics=[], samples=[];
      for(const T of times){
        let est=times.filter(t=> t<=T-H);
        if(K) est=est.slice(-K);
        if(est.length<3) continue;
        const eIC={};
        FSET.forEach(f=>{
          const a=[];
          for(const et of est){
            const fa=facAt(et), re=retAt(et,H);
            const cs=Object.keys(fa).filter(c=>re[c]!=null);
            if(cs.length>=8){ const v=spearman(cs.map(c=>fa[c][f]), cs.map(c=>re[c])); if(!isNaN(v)) a.push(v); }
          }
          eIC[f]=a.length?mean(a):0;
        });
        const s=FSET.reduce((x,f)=>x+Math.abs(eIC[f]),0)||1;
        const W={}, D={}; FSET.forEach(f=>{ W[f]=Math.abs(eIC[f])/s; D[f]=eIC[f]>=0?1:-1; });
        const fa=facAt(T), re=retAt(T,H);
        const cs=Object.keys(fa).filter(c=>re[c]!=null && FSET.every(f=>fa[c][f]!=null));
        if(cs.length<8) continue;
        const z={}; FSET.forEach(f=> z[f]=zscore(cs.map(c=>fa[c][f])));
        const comp=cs.map((c,i)=> FSET.reduce((x,f)=> x+W[f]*D[f]*z[f][i], 0));
        const v=spearman(comp, cs.map(c=>re[c])); if(!isNaN(v)) ics.push(v);
        const mr=mean(cs.map(c=>re[c]));
        cs.forEach((c,i)=> samples.push([comp[i], re[c]-mr]));
      }
      if(ics.length<5) return null;
      const m=mean(ics), sd=std(ics), t= sd===0?0:m/(sd/Math.sqrt(ics.length));
      // 回归斜率
      const xs=samples.map(s=>s[0]), ys=samples.map(s=>s[1]);
      const mx=mean(xs), my=mean(ys); let sxy=0,sxx=0;
      for(let i=0;i<xs.length;i++){ sxy+=(xs[i]-mx)*(ys[i]-my); sxx+=(xs[i]-mx)*(xs[i]-mx); }
      const b= sxx?sxy/sxx:0, a=my-b*mx;
      let ssr=0; for(let i=0;i<xs.length;i++){ const yh=a+b*xs[i]; ssr+=(ys[i]-yh)*(ys[i]-yh); }
      const se= sxx? Math.sqrt(ssr/(xs.length-2)/sxx) : 0;
      return { ic:+m.toFixed(4), t:+t.toFixed(2), n:ics.length, b:+b.toFixed(3), bt:+(se?b/se:0).toFixed(2), ns:samples.length };
    }

    const res=[];
    [20,40,60,90,120].forEach(H=>{
      [null,4,6,8,12].forEach(K=>{
        let r=null; try{ r=run(H,K); }catch(e){ r={err:e.message}; }
        if(r) res.push(Object.assign({H, K:K||'all'}, r));
      });
    });
    return {codes:codes.length, L, res};
  });

  console.log('CODES', out.codes, 'MINLEN', out.L);
  console.log('H\tK\tIC\t\tt\tn\tslope\tslopeT');
  out.res.forEach(r=> console.log([r.H, r.K, r.ic, r.t, r.n, r.b, r.bt].join('\t')));
  // 找出 |t|>=2 的配置
  const sig=out.res.filter(r=>Math.abs(r.t)>=2);
  console.log('\nSIGNIFICANT (|t|>=2):');
  sig.sort((a,b)=>Math.abs(b.t)-Math.abs(a.t)).forEach(r=> console.log(JSON.stringify(r)));
  const pos=out.res.filter(r=>r.t>=1.8);
  console.log('\nPOSITIVE & STRONG (t>=1.8):', JSON.stringify(pos));
  await browser.close();
})().catch(e=>{ console.error(e); process.exit(1); });
