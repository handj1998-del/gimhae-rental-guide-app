// Shared static renderer (Node): turns one language's data into HTML.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function block(b) {
  switch (b.t) {
    case "p": return `<p>${esc(b.v)}</p>`;
    case "ul": return `<ul class="list">${b.v.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
    case "steps": return `<ol class="steps">${b.v.map((x, i) => `<li><span class="n">${i + 1}</span><div><b>${esc(x[0])}</b>${x[1] ? `<div class="sd">${esc(x[1])}</div>` : ""}</div></li>`).join("")}</ol>`;
    case "table": return `<div class="tw"><table><thead><tr>${b.c.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${b.r.map((r) => `<tr>${r.map((c, i) => `<td data-l="${esc(b.c[i])}">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    case "note": return `<div class="note${b.warn ? " warn" : ""}"><b>${esc(b.lead)}</b><div>${esc(b.v)}</div></div>`;
  }
  return "";
}
function panel(k, d) {
  const id = (s) => `${k}-${s}`;
  let h = (k !== "en" ? `<p class="loc">${esc(d.title)}</p>` : "") + `<p class="summary">${esc(d.summary)}</p>`;
  h += `<section class="card toc"><h2>${esc(d.toc)}</h2><ol>${d.secs.map((s) => `<li><a href="#${id(s.id)}">${esc(s.h.replace(/^\d+\.\s*/, ""))}</a></li>`).join("")}</ol></section>`;
  for (const s of d.secs) {
    h += `<section class="card sec" id="${id(s.id)}"><h2>${esc(s.h)}</h2>`;
    (s.b || []).forEach((b) => (h += block(b)));
    (s.subs || []).forEach((u) => { h += `<div class="sub"><h3>${esc(u.h)}</h3>${u.b.map(block).join("")}</div>`; });
    h += `</section>`;
  }
  return `<div class="lp" id="P-${k}" lang="${esc(d.htmlLang || k)}">${h}</div>`;
}
module.exports = { esc, panel };
