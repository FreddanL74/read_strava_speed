/* Strava Analysis SVG sampler. Paste in Edge DevTools Console.
   Click the plot. Moves at 1 pixel / 350 ms and exports samples.csv.
   Based on strava_dom_diagnostic.json: values are SVG <text> elements. */
(async () => {
  if (window.__stravaSamplerRunning) return console.warn("Sampler already running");
  window.__stravaSamplerRunning=true;
  const STEP_PX=1, WAIT_MS=350;
  const fields=["distance_km","elapsed_s","elevation_m","grade_pct","speed_kmh","cadence_rpm","temperature_c"];
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const num=s=>{
    s=String(s).replace(/[\u00a0\u202f\s]/g,"").replace(/\u2212/g,"-").replace(",",".");
    return /^[-+]?\d+(?:\.\d+)?$/.test(s)?Number(s):null;
  };
  const seconds=s=>{
    if(!/^\d{1,3}:\d{2}(?::\d{2})?$/.test(s)) return null;
    const a=s.split(":").map(Number);
    return a.length===3?a[0]*3600+a[1]*60+a[2]:a[0]*60+a[1];
  };
  const visible=el=>el.getClientRects().length>0;
  const txt=el=>(el.textContent||"").trim().replace(/\s+/g," ");
  function readSVG() {
    // Read all SVG <text> elements in the chart, preserving their document order.
    // Each tooltip has distance, time, elevation, grade, speed, cadence, temperature.
    const nodes=[...document.querySelectorAll("div.base-chart svg text")].filter(visible);
    const values=nodes.map(txt);
    const candidates=[];
    for(let i=0;i<values.length;i++){
      const d=values[i].match(/^([\d.,\s]+)\s*km$/i);
      if(!d) continue;
      const distance=num(d[1]);
      if(distance===null) continue;
      // Find an immediately following elapsed time; avoid chart axes and static labels.
      const t=seconds(values[i+1]||"");
      if(t===null) continue;
      const elevationMatch=(values[i+2]||"").match(/^([−+\-\d.,\s]+)\s*m$/i);
      const gradeMatch=(values[i+3]||"").match(/^([−+\-\d.,\s]+)\s*%$/);
      if(!elevationMatch || !gradeMatch) continue;
      const row={
        distance_km:distance, elapsed_s:t,
        elevation_m:num(elevationMatch[1]), grade_pct:num(gradeMatch[1]),
        speed_kmh:num(values[i+4]||""),
        cadence_rpm:num(values[i+5]||""),
        temperature_c:num(values[i+6]||"")
      };
      if(row.distance_km>=0 && row.elapsed_s>=0) candidates.push(row);
    }
    return candidates.at(-1)||null;
  }
  function download(filename,content,type){
    const blob=new Blob([content],{type}),url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=filename;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  console.log("Click on the Strava Analysis chart to start.");
  const click=await new Promise(resolve=>document.addEventListener("click",function(e){
    e.preventDefault();e.stopPropagation();
    resolve({x:e.clientX,y:e.clientY,target:e.target});
  },{once:true,capture:true}));
  try{
    const charts=[...document.querySelectorAll("div.base-chart svg")].filter(el=>{
      const b=el.getBoundingClientRect();
      return b.width>300 && b.height>35 && click.x>=b.left && click.x<=b.right && click.y>=b.top && click.y<=b.bottom;
    });
    const chart=charts.sort((a,b)=>a.getBoundingClientRect().height-b.getBoundingClientRect().height)[0]
      ||click.target.closest("svg");
    if(!chart) throw Error("Chart not found. Click inside the Strava plot.");
    const b=chart.getBoundingClientRect();
    const y=Math.max(b.top+5,Math.min(click.y,b.bottom-5));
    const samples=[],failed=[];
    const move=x=>{
      const target=document.elementFromPoint(x,y)||chart;
      for(const type of ["pointermove","mousemove","mouseover"]){
        const C=type.startsWith("pointer")?PointerEvent:MouseEvent;
        target.dispatchEvent(new C(type,{bubbles:true,composed:true,clientX:x,clientY:y,view:window,pointerId:1,pointerType:"mouse"}));
      }
    };
    console.log("Sampling",Math.ceil((b.width-4)/STEP_PX),"positions; estimated minutes",Math.round(b.width*WAIT_MS/60000));
    for(let dx=2;dx<b.width-2;dx+=STEP_PX){
      move(b.left+dx);
      await sleep(WAIT_MS);
      const row=readSVG();
      if(row) samples.push({pixel_x:dx,...row});
      else failed.push(dx);
      if(dx%100===0) console.log("Progress",Math.round(100*dx/b.width)+"%","valid",samples.length,"missing",failed.length,"latest",row);
    }
    const unique=[...new Map(samples.map(r=>[r.distance_km+"|"+r.elapsed_s,r])).values()];
    const cols=["pixel_x",...fields];
    const csv=[cols.join(","),...unique.map(r=>cols.map(k=>r[k]??"").join(","))].join("\r\n");
    download("samples.csv",csv,"text/csv;charset=utf-8");
    console.log("CSV exported. Positions:",samples.length,"unique distance/time:",unique.length,"unreadable:",failed.length);
    console.log("First:",unique[0],"Last:",unique.at(-1));
    if(unique.length<5) console.warn("Very few points found. Please report Console output; do not merge GPX yet.");
  }catch(e){console.error(e)}
  finally{window.__stravaSamplerRunning=false}
})();