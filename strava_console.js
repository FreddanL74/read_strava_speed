/* Run on a logged-in Strava Analysis page via Edge F12 > Console.
   Click the chart when prompted. Samples changing readout DOM text, not whole-page text. */
(async () => {
  if (window.__stravaSamplerRunning) return console.warn("Sampler already running");
  window.__stravaSamplerRunning = true;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const number = s => {
    if (s == null) return null;
    s = s.replace(/\s/g, "");
    if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(".") > s.lastIndexOf(",") ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
    else if (s.includes(",")) s = /,\d{3}$/.test(s) ? s.replace(",", "") : s.replace(",", ".");
    return Number(s);
  };
  const fields = ["distance_km","elapsed_s","elevation_m","grade_pct","speed_kmh","cadence_rpm","temperature_c"];
  // Read only visible, small leaf elements. Unlike body.innerText, these reveal which readouts update.
  function snapshot() {
    const out = new Map();
    for (const el of document.querySelectorAll("span,div,p,strong,b,td")) {
      if (el.children.length && [...el.children].some(c => c.innerText?.trim())) continue;
      const t = (el.innerText || "").trim();
      if (!t || t.length > 55 || !/[\d]/.test(t)) continue;
      if (!el.getClientRects().length) continue;
      out.set(el, t);
    }
    return out;
  }
  function decode(texts) {
    const result = Object.fromEntries(fields.map(f => [f, null]));
    for (const t of texts) {
      const m = (re) => t.match(re)?.[1];
      let x;
      if ((x=m(/(?:^|[^\d])([\d.,\s]+)\s*km(?!\s*\/)/i))) result.distance_km=number(x);
      if ((x=m(/(\d{1,3}:\d{2}:\d{2})/))) {
        const [h,min,s]=x.split(":").map(Number); result.elapsed_s=h*3600+min*60+s;
      }
      if ((x=m(/([-+]?\d[\d.,\s]*)\s*km\s*\/\s*h/i))) result.speed_kmh=number(x);
      if ((x=m(/([-+]?\d[\d.,\s]*)\s*rpm/i))) result.cadence_rpm=number(x);
      if ((x=m(/([-+]?\d[\d.,\s]*)\s*°\s*C/i))) result.temperature_c=number(x);
      if ((x=m(/([-+]?\d[\d.,\s]*)\s*%/))) result.grade_pct=number(x);
      if ((x=m(/([-+]?\d[\d.,\s]*)\s*m\b/i)) && !/km\b/i.test(t)) result.elevation_m=number(x);
    }
    return result;
  }
  console.log("Click inside the chart to choose the sampling area.");
  const click = await new Promise(resolve => document.addEventListener("click", function(e) {
    e.preventDefault(); e.stopPropagation(); resolve({x:e.clientX,y:e.clientY,target:e.target});
  }, {once:true,capture:true}));
  try {
    const chart = click.target.closest("svg,canvas") ||
      [...document.querySelectorAll("svg,canvas")].filter(el => {
        const b=el.getBoundingClientRect();
        return b.width>300 && b.height>35 && click.x>=b.left && click.x<=b.right && click.y>=b.top && click.y<=b.bottom;
      }).sort((a,b)=>a.getBoundingClientRect().height-b.getBoundingClientRect().height)[0];
    if (!chart) throw Error("Could not identify chart. Click on the graph line.");
    const b=chart.getBoundingClientRect(), y=Math.min(b.bottom-3,Math.max(b.top+3,click.y));
    const samples=[], changes=[];
    const move = x => {
      const target=document.elementFromPoint(x,y) || chart;
      for (const type of ["pointermove","mousemove","mouseover"]) {
        const C=type.startsWith("pointer")?PointerEvent:MouseEvent;
        target.dispatchEvent(new C(type,{bubbles:true,composed:true,clientX:x,clientY:y,view:window,pointerId:1,pointerType:"mouse"}));
      }
    };
    let before=snapshot();
    for(let dx=2;dx<b.width-2;dx+=2) {
      move(b.left+dx);
      await sleep(65);
      const after=snapshot();
      const changed=[];
      for(const [el,t] of after) if(before.get(el)!==t) changed.push(t);
      // Track changed readouts; cache last known values when a readout does not change on this pixel.
      const parsed=decode(changed);
      changes.push(changed);
      samples.push(parsed);
      before=after;
    }
    // Propagate the last known readout value across pixels where it did not change.
    let last=Object.fromEntries(fields.map(f=>[f,null]));
    const rows=samples.map(r=>{
      for(const k of fields) if(r[k]!==null && Number.isFinite(r[k])) last[k]=r[k];
      return {...last};
    }).filter(r=>r.distance_km!==null && r.elapsed_s!==null);
    const unique=new Set(rows.map(r=>r.distance_km+"|"+r.elapsed_s)).size;
    console.log("Samples:",rows.length,"Unique distance/time pairs:",unique,"First:",rows[0],"Last:",rows.at(-1));
    console.log("First changed text samples:",changes.filter(a=>a.length).slice(0,8));
    if(unique<5) {
      console.warn("Could not reliably parse changing distance/time. No CSV exported. Please copy the console diagnostics.");
      return;
    }
    const csv=[fields.join(","),...rows.map(r=>fields.map(k=>r[k]??"").join(","))].join("\r\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="samples.csv";
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),10000);
    console.log("Exported samples.csv; verify first/last values before GPX merging.");
  } catch(e) {console.error(e)}
  finally {window.__stravaSamplerRunning=false}
})();