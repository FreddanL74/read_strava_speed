/* Strava hover diagnostic: run on the Analysis page in Edge DevTools.
   Uses REAL mouse movements. Does not collect credentials or send data anywhere.
   Stop with window.stopStravaDiagnostic(). */
(() => {
  if (window.stopStravaDiagnostic) window.stopStravaDiagnostic();
  const seen = new Map();
  let samples = 0, last = 0;
  const handler = (e) => {
    const now = performance.now();
    if (now - last < 250) return;
    last = now;
    samples++;
    const selector = el => {
      if (!el) return "";
      const parts = [];
      for (let node=el, n=0; node && n<4; node=node.parentElement,n++)
        parts.unshift(node.tagName.toLowerCase() +
          (node.id ? "#"+CSS.escape(node.id) : "") +
          (typeof node.className === "string" ? "."+node.className.trim().split(/\s+/).slice(0,2).map(CSS.escape).join(".") : ""));
      return parts.join(" > ");
    };
    const elements = [...document.querySelectorAll("body *")]
      .filter(el => el.children.length===0 && el.textContent?.trim() &&
        /(?:km\/h|km|rpm|°|%|\d:\d\d)/i.test(el.textContent) &&
        el.getBoundingClientRect().width>0)
      .slice(0,150);
    for (const el of elements) {
      const key = selector(el);
      const value = el.textContent.trim().slice(0,90);
      const record = seen.get(key) || new Set();
      record.add(value);
      seen.set(key,record);
    }
    if (samples%8===0) console.log("Recorded mouse samples:",samples);
  };
  document.addEventListener("mousemove",handler,true);
  window.stopStravaDiagnostic = () => {
    document.removeEventListener("mousemove",handler,true);
    const changed = [...seen].filter(([,v])=>v.size>1)
      .map(([selector,values])=>({selector,examples:[...values].slice(0,6),distinct:values.size}))
      .sort((a,b)=>b.distinct-a.distinct);
    console.log("REAL MOUSE EVENTS:",samples);
    console.table(changed);
    console.log("Changing fields (copy this output):",JSON.stringify(changed,null,2));
    if(!changed.length) console.warn("No changing text nodes detected; inspect chart tooltip, shadow DOM, canvas or SVG.");
    delete window.stopStravaDiagnostic;
    return changed;
  };
  console.log("Move your REAL mouse across the speed chart for 10-15 seconds, then run: window.stopStravaDiagnostic()");
})();
