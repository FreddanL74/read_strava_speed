/* Diagnostic for Strava Analysis: detects changing text nodes and their DOM locations.
   Paste in DevTools Console on your logged-in Analysis page, then move your mouse
   manually between two different positions in the graph, waiting ~1 s each time. */
(() => {
  if (window.__stravaProbe?.stop) window.__stravaProbe.stop();
  const observed = new Map();
  const isVisible = el => {
    if (!el || !el.isConnected) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length > 0;
  };
  const describe = el => {
    if (!el) return "";
    const id = el.id ? "#"+el.id : "";
    const cls = typeof el.className === "string" ? "."+el.className.trim().split(/\s+/).slice(0,3).join(".") : "";
    return (el.tagName||"node").toLowerCase()+id+cls;
  };
  const path = el => {
    const parts=[];
    for(let p=el; p && p.nodeType===1 && parts.length<5; p=p.parentElement) parts.unshift(describe(p));
    return parts.join(" > ");
  };
  const textOf = el => (el?.textContent || "").trim().replace(/\s+/g," ").slice(0,120);
  const take = () => {
    const map=new Map();
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())) {
      const el=node.parentElement;
      if (!isVisible(el)) continue;
      const value=(node.nodeValue||"").trim();
      if (!value || value.length>80 || !/\d/.test(value)) continue;
      map.set(node,value);
    }
    return map;
  };
  let previous=take(), count=0;
  const timer=setInterval(() => {
    const current=take();
    const changes=[];
    for(const [node,value] of current) {
      if(previous.get(node)!==value) {
        const el=node.parentElement;
        const entry={value,previous:previous.get(node)||"",element:path(el)};
        changes.push(entry);
        observed.set(entry.element+"|"+value,entry);
      }
    }
    previous=current;
    if(changes.length) {
      console.log("STRAVA CHANGES",++count,changes.slice(0,30));
    }
  },250);
  const stop=() => {
    clearInterval(timer);
    const rows=[...observed.values()];
    console.log("Strava probe stopped. Changed text nodes:",rows.length);
    console.table(rows.slice(0,100));
    const blob=new Blob([JSON.stringify(rows,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="strava_dom_diagnostic.json";
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  };
  window.__stravaProbe={stop};
  console.log("Probe started. Move mouse manually to 3-4 different positions in the Strava chart. Then run: window.__stravaProbe.stop()");
})();