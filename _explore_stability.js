// 反向信号稳定性检验（按交易日期对齐版）
// 若各时间段方向一致且均显著 → 可反向使用；否则不可用
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
    const H=60, WARM=121, step=10;
    const idx={}; codes.forEach(c=>{ const m=Object.create(null); allKl[c].forEach((k,i)=>{ m[k.date]=i; }); idx[c]=m; });
    const cnt=Object.create(null); codes.forEach(c=>{ for(const d in idx[c]) cnt[d]=(cnt[d]||0)+1; });
    const axis=Object.keys(cnt).filter(d=>cnt[d]===codes.length).sort();
    let start=-1; for(let p=0;p<axis.length;p++){ if(codes.every(c=> idx[c][axis[p]]>=WARM)){ start=p; break; } }
    const times=[]; for(let p=start;p<=axis.length-1-H;p+=step) times.push(p);
    const FSET=['vol','mom120','rev5'];
    const fc={}, rc={};
    const facAt=p=>{ if(fc[p]) return fc[p]; const o={},d=axis[p]; for(const c of codes){ const fv=factorsMine(allKl[c],idx[c][d]); if(fv) o[c]=fv; } fc[p]=o; return o; };
    const retAt=p=>{ if(rc[p]) return rc[p]; const o={},d=axis[p],d2=axis[Math.min(p+H,axis.length-1)];
      for(const c of codes){ const a=idx[c][d],b=idx[c][d2]; if(a==null||b==null) continue; o[c]=(allKl[c][b].close-allKl[c][a].close)/allKl[c][a].close*100; } rc[p]=o; return o; };

    const perT=[];
    for(const T of times){
      const est=times.filter(t=> t<=T-H);
      if(est.length<3) continue;
      const eIC={};
      FSET.forEach(f=>{ const a=[];
        for(const et of est){ const fa=facAt(et), re=retAt(et); const cs=Object.keys(fa).filter(c=>re[c]!=null);
          if(cs.length>=8){ const v=spearman(cs.map(c=>fa[c][f]), cs.map(c=>re[c])); if(!isNaN(v)) a.push(v); } }
        eIC[f]=a.length?mean(a):0; });
      const s=FSET.reduce((x,f)=>x+Math.abs(eIC[f]),0)||1;
      const W={},D={}; FSET.forEach(f=>{ W[f]=Math.abs(eIC[f])/s; D[f]=eIC[f]>=0?1:-1; });
      const fa=facAt(T), re=retAt(T);
      const cs=Object.keys(fa).filter(c=>re[c]!=null && FSET.every(f=>fa[c][f]!=null));
      if(cs.length<8) continue;
      const z={}; FSET.forEach(f=> z[f]=zscore(cs.map(c=>fa[c][f])));
      const comp=cs.map((c,i)=> FSET.reduce((x,f)=> x+W[f]*D[f]*z[f][i], 0));
      const raw={}; FSET.forEach(f=>{ raw[f]=spearman(cs.map(c=>fa[c][f]), cs.map(c=>re[c])); });
      perT.push({date:axis[T], icComp:spearman(comp, cs.map(c=>re[c])), raw});
    }
    const stat=a=>{ const b=a.filter(x=>!isNaN(x)); if(b.length<3) return null; const m=mean(b), sd=std(b);
      return {ic:+m.toFixed(4), t:+(sd===0?0:m/(sd/Math.sqrt(b.length))).toFixed(2), n:b.length}; };
    const seg=(f,t)=>{ const p=perT.slice(f,t); const o={range:[p.length?p[0].date:'-',p.length?p[p.length-1].date:'-'],n:p.length,comp:stat(p.map(x=>x.icComp))};
      FSET.forEach(k=> o[k]=stat(p.map(x=>x.raw[k]))); return o; };
    const n=perT.length,h=Math.floor(n/2),t3=Math.floor(n/3);
    return {codes:codes.length, axisLen:axis.length, axisFrom:axis[0], axisTo:axis[axis.length-1], nT:n,
      full:seg(0,n), half1:seg(0,h), half2:seg(h,n), third1:seg(0,t3), third2:seg(t3,2*t3), third3:seg(2*t3,n)};
  });

  const p=o=>o?('IC='+String(o.ic).padEnd(8)+' t='+String(o.t).padEnd(7)+' n='+o.n):'--';
  console.log('CODES',out.codes,'| 公共交易日轴',out.axisLen,'根:',out.axisFrom,'~',out.axisTo,'| 时点',out.nT);
  const show=(name,s)=>{
    console.log('\n['+name+'] '+s.range[0]+' ~ '+s.range[1]+'  (n='+s.n+')');
    console.log('  综合分     '+p(s.comp));
    console.log('  波动率原值 '+p(s.vol)+'  (正=高波动跑赢, 负=低波动跑赢)');
    console.log('  120日动量  '+p(s.mom120)+'  (正=动量有效, 负=反转有效)');
    console.log('  5日收益    '+p(s.rev5));
  };
  show('全样本',out.full); show('前半段',out.half1); show('后半段',out.half2);
  show('第1段',out.third1); show('第2段',out.third2); show('第3段',out.third3);

  const segs=[out.half1.comp,out.half2.comp];
  const t3s=[out.third1.comp,out.third2.comp,out.third3.comp];
  const sameSign2=segs.every(x=>x&&x.ic<0);
  const sig2=segs.every(x=>x&&Math.abs(x.t)>=1.5);
  const sameSign3=t3s.every(x=>x&&x.ic<0);
  const sig3=t3s.every(x=>x&&Math.abs(x.t)>=1.3);
  console.log('\n=== 结论 ===');
  console.log('两段均为负:',sameSign2,'| 两段均显著(|t|>=1.5):',sig2);
  console.log('三段均为负:',sameSign3,'| 三段均较显著(|t|>=1.3):',sig3);
  console.log((sameSign2&&sig2&&sameSign3) ? 'REVERSE_STABLE → 反向使用有依据' : 'REVERSE_UNSTABLE → 不可直接反向使用');
  await browser.close();
})().catch(e=>{ console.error(e); process.exit(1); });
