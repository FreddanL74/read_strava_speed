/* Strava analysis chart sampler. Run in DevTools Console on an activity analysis page.
   Click the chart you want to sample. Synthetic pointer events may not work on all Strava versions. */
(async () => {
  if (window.__stravaSamplerRunning) { console.warn("Sampler already running"); return; }
  window.__stravaSamplerRunning = true;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const read = () => {
    const text = document.body.innerText;
    const match = (re) => [...text.matchAll(re)].map(m => m[1]).at(-1);
    const num = s => s == null ? null : Number(s.replace(/\s/g, "").replace(/,(?=\d{3}(?:\D|$))/g, "").replace(",", "."));
    const time = match(/\b(\d{1,2}:\d{2}:\d{2})\b/g);
    const parts = time?.split(":").map(Number);
    return {
      distance_km: num(match(/([\d.,]+)\s*km\b(?!\s*\/)/gi)),
      elapsed_s: parts ? parts[0]*3600+parts[1]*60+parts[2] : null,
      elevation_m: num(match(/([\d.,]+)\s*m\b/gi)),
      grade_pct: num(match(/([-\d.,]+)\s*%/g)),
      speed_kmh: num(match(/([\d.,]+)\s*km\s*\/\s*h/gi)),
      cadence_rpm: num(match(/([\d.,]+)\s*rpm/gi)),
      temperature_c: num(match(/([-\d.,]+)\s*°\s*C/gi))
    };
  };
  console.log("Click once inside the speed chart (not a button). Sampling will start.");
  const click = await new Promise(resolve => document.addEventListener("click", function pick(e) {
    e.preventDefault(); e.stopPropagation(); resolve({x:e.clientX,y:e.clientY,target:e.target});
  }, {capture:true,once:true}));
  try {
    const chart = click.target.closest("svg,canvas") ||
      [...document.querySelectorAll("svg,canvas")].filter(e => {
        const b=e.getBoundingClientRect(); return b.width>300 && b.height>35 && click.x>=b.left && click.x<=b.right && click.y>=b.top && click.y<=b.bottom;
      }).sort((a,b)=>a.getBoundingClientRect().height-b.getBoundingClientRect().height)[0];
    if (!chart) throw new Error("No SVG/canvas chart at click. Try clicking directly on the plotted line.");
    const b=chart.getBoundingClientRect();
    const y=Math.max(b.top+3,Math.min(b.bottom-3,click.y));
    const rows=[], step=2;
    const fire=(x,type) => {
      const target=document.elementFromPoint(x,y) || chart;
      const ev=new MouseEvent(type,{bubbles:true,composed:true,clientX:x,clientY:y,view:window});
      target.dispatchEvent(ev);
    };
    console.log("Chart bounds:",b.width,b.height,"Initial readout:",read());
    for(let i=2;i<b.width-2;i+=step){
      const x=b.left+i;
      fire(x,"mousemove"); fire(x,"mouseover"); fire(x,"pointermove");
      await sleep(50);
      const data=read();
      if(data.distance_km!=null && data.elapsed_s!=null) rows.push(data);
    }
    const distinct = new Set(rows.map(r=>r.distance_km+"|"+r.elapsed_s)).size;
    console.log("Readings:",rows.length,"Distinct distance/time pairs:",distinct,"First:",rows[0],"Last:",rows.at(-1));
    if(distinct<5) {
      console.warn("Hover data did not update. Strava may ignore synthetic mouse events. No CSV exported. Copy the console diagnostics.");
      return;
    }
    const fields=["distance_km","elapsed_s","elevation_m","grade_pct","speed_kmh","cadence_rpm","temperature_c"];
    const csv=[fields.join(","),...rows.map(r=>fields.map(k=>r[k]??"").join(","))].join("\r\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob);a.download="samples.csv";
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),10000);
    console.log("Saved samples.csv. Check the data before GPX merging.");
  } catch(e) { console.error("Sampler error:",e); }
  finally { window.__stravaSamplerRunning=false; }
})();
