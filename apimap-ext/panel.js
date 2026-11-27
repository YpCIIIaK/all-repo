/* API Map — DevTools panel UI. Passive: only observes traffic the browser already makes. */
(() => {
  "use strict";
  const Engine = window.APIMapEngine;
  const hasDT = !!(window.chrome && chrome.devtools && chrome.devtools.network);
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const col = s => s >= 9 ? "var(--crit)" : s >= 6 ? "var(--hot)" : s >= 3 ? "var(--warn)" : "var(--ok)";
  const store = {
    get: k => new Promise(r => { try { chrome.storage.local.get(k, v => r(v[k])); } catch (e) { r(null); } }),
    set: (k, v) => { try { chrome.storage.local.set({ [k]: v }); } catch (e) { } },
    del: k => { try { chrome.storage.local.remove(k); } catch (e) { } },
  };

  let eng = new Engine(), site = null, recording = true, selEp = null, selRec = null, reveal = false, recSeq = 0;
  const collapsed = new Set();
  const recById = new Map();

  // ---------- theme ----------
  try { const t = localStorage.getItem("apimap-theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) { }
  $("b-theme").onclick = () => { const r = document.documentElement; r.dataset.theme = r.dataset.theme === "light" ? "dark" : "light"; try { localStorage.setItem("apimap-theme", r.dataset.theme); } catch (e) { } };

  // ---------- capture ----------
  function add(rec, save = true) {
    if (!recording && save) return;
    rec.id = rec.id || "r" + (++recSeq);
    const r = eng.ingest(rec);
    if (r) { recById.set(r.id, r); tlAdd(r); }
    schedule(); if (save) persist();
  }
  if (hasDT) {
    chrome.devtools.inspectedWindow.eval("location.hostname", h => { if (h) setSite(h); });
    chrome.devtools.network.onNavigated.addListener(url => { try { setSite(new URL(url).hostname); } catch (e) { } });
    chrome.devtools.network.onRequestFinished.addListener(req => {
      if (!recording) return;
      req.getContent((body, enc) => {
        add({
          t: Date.now(), method: req.request.method, url: req.request.url, status: req.response.status,
          reqHeaders: req.request.headers, reqBody: (req.request.postData || {}).text || "", reqMime: (req.request.postData || {}).mimeType || "",
          resHeaders: req.response.headers, mime: (req.response.content || {}).mimeType || "",
          resBody: enc === "base64" ? "" : (body || ""), initiator: req._initiator || null, time: req.time || 0,
        });
      });
    });
  }
  async function setSite(host) {
    const s = Engine.siteOf(host);
    if (s === site) return;
    site = s; document.title = "API Map — " + site;
    // restore stored traffic for this site
    eng = new Engine(); recById.clear(); $("tl").innerHTML = ""; selEp = selRec = null;
    const saved = await store.get("apimap:" + site);
    if (saved && saved.records) saved.records.forEach(r => add(r, false));
    schedule(true);
  }
  let saveT = null;
  function persist() {
    if (!site) return;
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const d = eng.dump(); if (d.records.length > 3000) d.records = d.records.slice(-3000);
      store.set("apimap:" + site, d);
    }, 2500);
  }

  // ---------- header controls ----------
  $("rec").onclick = () => { recording = !recording; $("rec").classList.toggle("off", !recording); $("rec-t").textContent = recording ? "запись" : "пауза"; };
  $("b-clear").onclick = () => { if (!confirm("Очистить данные " + (site || "") + "?")) return; eng = new Engine(); recById.clear(); $("tl").innerHTML = ""; collapsed.clear(); selEp = selRec = null; if (site) store.del("apimap:" + site); schedule(true); };
  $("f-har").onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    const har = JSON.parse(await f.text());
    const recs = Engine.fromHarEntries(har.log.entries.sort((a, b) => (a.startedDateTime || "").localeCompare(b.startedDateTime || "")));
    if (!site && recs.length) { const u = recs.find(r => /^https?:/.test(r.url)); if (u) site = Engine.siteOf(new URL(u.url).hostname); }
    recs.forEach(r => add(r, false)); persist(); schedule(true); fit();
  };
  $("b-export").onclick = () => {
    const eps = eng.list().map(e => ({ host: e.host, path: e.path, methods: [...e.methods], count: e.count, status: e.status, score: e.score, why: e.why,
      query: [...e.queryKeys], req: [...e.reqKeys], res: [...e.resKeys].slice(0, 200), findings: e.findings.map(f => ({ sev: f.sev, type: f.type, text: f.text })),
      flowsIn: [...e.flowsIn], flowsOut: [...e.flowsOut], observed: e.observed }));
    const blob = new Blob([JSON.stringify({ site, exported: new Date().toISOString(), endpoints: eps, flows: eng.flowList(), tech: [...eng.tech.keys()], jwts: [...eng.jwts.values()].map(j => ({ where: j.where, alg: j.header.alg, notes: j.notes, claims: Object.keys(j.payload) })) }, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "apimap-" + (site || "site") + ".json"; a.click();
  };
  ["q", "minsc", "scope"].forEach(id => $(id).addEventListener("input", () => schedule(true)));
  $("b-flow").onclick = e => { e.target.classList.toggle("on"); schedule(true); };
  $("b-exp").onclick = () => { collapsed.clear(); schedule(true); };
  $("b-col").onclick = () => { lastRoot && lastRoot.descendants().forEach(d => { if (d.depth >= 2 && (d.children || d._children)) collapsed.add(d.id); }); schedule(true); };
  $("b-fit").onclick = () => fit();
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => tab(b.dataset.t));
  function tab(t) {
    document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.t === t));
    document.querySelectorAll(".pane").forEach(p => p.classList.toggle("on", p.id === "p-" + t));
  }

  // ---------- map ----------
  const svg = d3.select("#svg"), g = svg.append("g");
  const gl = g.append("g"), gf = g.append("g"), gn = g.append("g");
  const zoom = d3.zoom().scaleExtent([0.08, 3]).on("zoom", ev => g.attr("transform", ev.transform));
  svg.call(zoom).on("dblclick.zoom", null);
  svg.on("click", ev => { if (ev.target === svg.node()) { selEp = null; highlight(); } });
  let lastRoot = null, firstFit = true, renderT = null, pending = false;
  const DX = 26, DY = 210;

  function schedule(now) {
    if (now) { clearTimeout(renderT); renderT = null; render(); return; }
    if (renderT) { pending = true; return; }
    renderT = setTimeout(() => { renderT = null; render(); if (pending) { pending = false; schedule(); } }, 450);
  }

  function filterFn() {
    const q = $("q").value.toLowerCase().trim(), min = +$("minsc").value, onlySite = $("scope").value === "site";
    return ep => {
      if (onlySite && site && Engine.siteOf(ep.host) !== site) return false;
      if ((ep.score || 0) < min) return false;
      if (q) {
        const t = (ep.host + "/" + ep.path + " " + [...ep.reqKeys, ...ep.queryKeys, ...ep.resKeys].join(" ") + " " + (ep.why || []).join(" ") + " " + ep.findings.map(f => f.text).join(" ")).toLowerCase();
        if (!t.includes(q)) return false;
      }
      return true;
    };
  }

  function render() {
    const list = eng.list();
    const ff = filterFn();
    $("st-ep").textContent = eng.eps.size + " эндпоинтов";
    $("st-req").textContent = eng.records.length + " запросов";
    $("st-find").textContent = eng.findings.length + " находок";
    $("st-flow").textContent = eng.flows.size + " потоков";
    $("empty-map").style.display = eng.eps.size ? "none" : "flex";

    const data = eng.tree(ff);
    const root = d3.hierarchy(data);
    root.each(d => { d.id = d.ancestors().reverse().map(a => a.data.name).join("/"); });
    root.eachAfter(d => { const e = d.data.ep && eng.endpoint(d.data.ep); d.max = Math.max(e ? (e.score || 0) : 0, ...(d.children || []).map(c => c.max)); });
    root.each(d => { d._children = d.children; if (d.children && collapsed.has(d.id)) d.children = null; });
    d3.tree().nodeSize([DX, DY]).separation((a, b) => a.parent === b.parent ? 1 : 1.25)(root);
    lastRoot = root;
    const nodes = root.descendants().filter(d => d.depth > 0), links = root.links().filter(l => l.source.depth > 0);
    const pos = new Map(nodes.filter(n => n.data.ep).map(n => [n.data.ep, n]));

    gl.selectAll("path").data(links, d => d.target.id).join("path").attr("class", "link")
      .attr("d", d3.linkHorizontal().x(d => d.y).y(d => d.x));

    const sel = gn.selectAll("g.node").data(nodes, d => d.id);
    const en = sel.enter().append("g").attr("class", "node");
    en.append("rect").attr("class", "box");
    en.append("text").attr("class", "lbl").attr("x", 8).attr("dy", "0.32em");
    en.append("text").attr("class", "meta").attr("dy", "0.32em");
    const tg = en.append("g").attr("class", "togg");
    tg.append("circle").attr("class", "tog").attr("r", 7);
    tg.append("text").attr("class", "tog-t").attr("text-anchor", "middle").attr("dy", "0.33em");
    en.on("click", (ev, d) => {
      ev.stopPropagation();
      if (ev.target.closest(".togg")) { toggle(d); return; }
      if (d.data.ep) { selEp = d.data.ep; showEp(d.data.ep); highlight(); } else { toggle(d); }
    }).on("dblclick", (ev, d) => { ev.stopPropagation(); toggle(d); });

    const all = en.merge(sel);
    all.attr("transform", d => `translate(${d.y},${d.x})`).classed("host", d => !!d.data.host);
    all.each(function (d) {
      const e = d.data.ep && eng.endpoint(d.data.ep);
      const node = d3.select(this);
      node.select(".lbl").text(d.data.name);
      const lw = this.querySelector(".lbl").getComputedTextLength();
      const meta = e ? ` ${[...e.methods].join("·")}${e.count ? " ×" + e.count : " (код)"}${e.findings.length ? " ⚑" + e.findings.length : ""}` : "";
      node.select(".meta").attr("x", 10 + lw).text(meta);
      const mw = meta ? this.querySelector(".meta").getComputedTextLength() : 0;
      const w = lw + mw + 18;
      node.select("rect.box").attr("x", 0).attr("y", -10).attr("width", w).attr("height", 20).attr("stroke", col(d.max))
        .attr("stroke-dasharray", e && !e.observed ? "3 3" : null);
      const hasKids = !!d._children;
      node.select(".togg").style("display", hasKids ? null : "none").attr("transform", `translate(${w + 10},0)`);
      node.select(".tog-t").text(d.children ? "−" : "+" + (d._children ? d._children.length : ""));
      if (e && e.isNew) { node.classed("new", false); void this.offsetWidth; node.classed("new", true); e.isNew = false; }
    });
    sel.exit().remove();

    const showFlows = $("b-flow").classList.contains("on");
    const fdata = showFlows ? eng.flowList().map(f => ({ f, a: pos.get(f.from), b: pos.get(f.to) })).filter(x => x.a && x.b) : [];
    gf.selectAll("path").data(fdata, x => x.f.from + ">" + x.f.to + x.f.field).join("path").attr("class", "flow")
      .attr("d", x => { const a = [x.a.y, x.a.x], b = [x.b.y, x.b.x], mx = Math.max(a[0], b[0]) + 90; return `M${a[0]},${a[1]} C${mx},${a[1]} ${mx},${b[1]} ${b[0]},${b[1]}`; })
      .each(function (x) { d3.select(this).selectAll("title").data([x]).join("title").text(`${x.f.field} ×${x.f.count}\n${x.f.from}\n→ ${x.f.to}`); });

    highlight();
    rank(list.filter(ff)); findings(); flows(); tech();
    if (firstFit && nodes.length) { firstFit = false; fit(); }
  }
  function toggle(d) { if (!d._children) return; if (collapsed.has(d.id)) collapsed.delete(d.id); else collapsed.add(d.id); schedule(true); }
  function fit() {
    const b = g.node().getBBox(), W = svg.node().clientWidth, H = svg.node().clientHeight;
    if (!b.width) return;
    const k = Math.min(1.2, 0.92 * Math.min(W / b.width, H / b.height));
    svg.transition().duration(350).call(zoom.transform, d3.zoomIdentity.translate(W / 2 - k * (b.x + b.width / 2), H / 2 - k * (b.y + b.height / 2)).scale(k));
  }
  function highlight() {
    const nb = new Set();
    if (selEp) {
      const e = eng.endpoint(selEp);
      nb.add(selEp); if (e) { e.flowsIn.forEach(x => nb.add(x)); e.flowsOut.forEach(x => nb.add(x)); }
    }
    const anc = new Set();
    if (selEp && lastRoot) lastRoot.descendants().filter(d => nb.has(d.data.ep)).forEach(d => d.ancestors().forEach(a => anc.add(a.id)));
    gn.selectAll("g.node").classed("sel", d => d.data.ep === selEp).classed("dim", d => !!selEp && !anc.has(d.id));
    gl.selectAll("path").classed("hl", d => !!selEp && anc.has(d.target.id));
    gf.selectAll("path").classed("hl", x => selEp && (x.f.from === selEp || x.f.to === selEp));
  }
  function focusEp(k) {
    if (!lastRoot) return;
    // expand ancestors if collapsed
    const parts = k.split("/"); let id = "root";
    let changed = false;
    for (const p of parts) { id += "/" + p; if (collapsed.delete(id)) changed = true; }
    if (changed) render();
    const n = lastRoot.descendants().find(d => d.data.ep === k);
    if (!n) return;
    const t = d3.zoomTransform(svg.node()), W = svg.node().clientWidth, H = svg.node().clientHeight;
    svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity.translate(W / 2.6 - t.k * n.y, H / 2 - t.k * n.x).scale(t.k));
  }

  // ---------- timeline ----------
  function tlAdd(r) {
    if ($("tl-onlyapi").checked && !r.ep) return;
    const row = document.createElement("div");
    row.className = "tl-row"; row.dataset.id = r.id;
    const st = String(r.status || 0)[0];
    const ep = eng.endpoint(r.ep);
    row.innerHTML = `<span>${new Date(r.t).toLocaleTimeString("ru-RU")}</span><span class="m-${esc(r.method)}">${esc(r.method)}</span><span class="s${st}">${r.status || "—"}</span><span class="u" title="${esc(r.url)}">${esc(r.host + "/" + r.path)}</span><span class="f">${ep && ep.findings.some(f => f.rec === r.id) ? "⚑" : ""}</span>`;
    row.onclick = () => { selRec = r.id; selEp = r.ep; showRec(r.id); focusEp(r.ep); highlight(); document.querySelectorAll(".tl-row.sel").forEach(x => x.classList.remove("sel")); row.classList.add("sel"); };
    const tl = $("tl"); tl.appendChild(row);
    while (tl.childElementCount > 2000) tl.firstElementChild.remove();
    if ($("tl-follow").checked) tl.scrollTop = tl.scrollHeight;
  }

  // ---------- side panes ----------
  function rank(list) {
    $("p-rank").innerHTML = list.length ? list.slice(0, 300).map(e => `<div class="row" data-k="${esc(e.key)}">
      <div class="sc" style="background:${col(e.score)}">${e.score}</div>
      <div><div class="path" style="font-size:12px">${[...e.methods].map(m => `<span class="m-${m}">${m}</span>`).join(" ")} ${esc(e.path)}</div>
      <div class="sub">${esc(e.host)} · ${e.count ? "×" + e.count : "только в коде"}${e.why.length ? " · " + esc(e.why.slice(0, 3).join(" · ")) : ""}</div></div></div>`).join("")
      : `<div class="empty">Пока пусто.</div>`;
    $("p-rank").querySelectorAll(".row").forEach(r => r.onclick = () => { selEp = r.dataset.k; showEp(r.dataset.k); focusEp(r.dataset.k); highlight(); });
  }
  function findings() {
    const f = [...eng.findings].sort((a, b) => ({ high: 0, med: 1, low: 2 }[a.sev] - { high: 0, med: 1, low: 2 }[b.sev]) || b.t - a.t);
    $("p-find").innerHTML = f.length ? f.map(x => `<div class="find ${x.sev}" data-k="${esc(x.ep)}" data-r="${esc(x.rec)}"><div class="t">${esc(x.text)}</div><div class="e">${esc(x.ep)}</div></div>`).join("")
      : `<div class="empty">Детекторы пассивные: чувствительные поля, данные без авторизации, ID-объекты, ошибки и стеки, CORS, секреты в URL, GraphQL.</div>`;
    $("p-find").querySelectorAll(".find").forEach(r => r.onclick = () => { selEp = r.dataset.k; if (r.dataset.r && recById.has(r.dataset.r)) showRec(r.dataset.r); else showEp(r.dataset.k); focusEp(r.dataset.k); highlight(); });
  }
  function flows() {
    const f = eng.flowList();
    $("p-flow").innerHTML = f.length ? `<div class="sub" style="margin-bottom:8px">Значение из ответа одного запроса ушло в другой запрос — так видно, откуда атакующий берёт ID.</div>` + f.map(x => `<div class="find low" data-a="${esc(x.from)}" data-b="${esc(x.to)}">
      <div class="t"><span class="badge">${esc(x.field)}</span> ×${x.count}</div><div class="e">${esc(x.from)}<br>→ ${esc(x.to)}</div></div>`).join("")
      : `<div class="empty">Пока нет. Потоки появляются, когда ID из ответа уходит в следующий запрос (список → объект → действие). Включите «Disable cache» в Network, чтобы ответы не приходили пустыми (304).</div>`;
    $("p-flow").querySelectorAll(".find").forEach(r => r.onclick = () => { selEp = r.dataset.b; showEp(r.dataset.b); focusEp(r.dataset.b); highlight(); });
  }
  function tech() {
    const t = [...eng.tech.entries()].sort((a, b) => b[1] - a[1]);
    const j = [...eng.jwts.values()];
    $("p-tech").innerHTML = `<h3>Заголовки сервера и шлюзов</h3>${t.length ? t.map(([k, n]) => `<span class="badge">${esc(k)} ×${n}</span>`).join("") : '<div class="sub">—</div>'}
      <h3>JWT</h3>${j.length ? j.map(x => `<div class="find ${x.notes.some(n => /none|HS/.test(n)) ? "med" : "low"}"><div class="t">${esc(x.where)} · alg ${esc(x.header.alg)} ${x.notes.length ? "· " + esc(x.notes.join(", ")) : ""}</div>
        <pre>${esc(JSON.stringify(x.payload, null, 1))}</pre></div>`).join("") : '<div class="sub">JWT в заголовках и куках не найден.</div>'}`;
  }

  function chips(set, max = 60) { const a = [...set]; return a.length ? a.slice(0, max).map(x => `<span class="badge">${esc(x)}</span>`).join("") + (a.length > max ? ` <span class="sub">+${a.length - max}</span>` : "") : '<span class="sub">—</span>'; }

  function showEp(k) {
    const e = eng.endpoint(k); if (!e) return; tab("det");
    const flIn = eng.flowList().filter(f => f.to === k), flOut = eng.flowList().filter(f => f.from === k);
    const recs = e.recs.slice(-12).reverse().map(id => recById.get(id)).filter(Boolean);
    $("p-det").innerHTML = `
      <div class="path">${esc(e.path)}</div><div class="sub">${esc(e.host)}</div>
      <div style="margin-top:6px">${[...e.methods].map(m => `<span class="badge m-${m}">${m}</span>`).join("")}
        <span class="badge" style="border-color:${col(e.score)}">риск ${e.score}</span>
        <span class="badge">${e.observed ? "запросов ×" + e.count : "найден только в JS"}</span>
        ${e.observed ? `<span class="badge">авторизация: ${e.authSeen ? (e.noAuthSeen ? "с ней и без" : "есть") : "нет"}</span>` : ""}
        ${Object.entries(e.status).map(([s, n]) => `<span class="badge s${String(s)[0]}">${s} ×${n}</span>`).join("")}</div>
      ${e.why.length ? `<h3>Почему интересен</h3><ul class="why">${e.why.map(w => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
      ${e.findings.length ? `<h3>Находки</h3>${e.findings.map(f => `<div class="find ${f.sev}" data-r="${esc(f.rec)}"><div class="t">${esc(f.text)}</div></div>`).join("")}` : ""}
      <h3>Откуда приходят данные</h3>${flIn.length ? flIn.map(f => `<span class="badge go" data-go="${esc(f.from)}">← ${esc(f.from.split("/").slice(1).join("/"))} <i>${esc(f.field)}</i></span>`).join("") : '<span class="sub">—</span>'}
      <h3>Куда уходят его данные</h3>${flOut.length ? flOut.map(f => `<span class="badge go" data-go="${esc(f.to)}">→ ${esc(f.to.split("/").slice(1).join("/"))} <i>${esc(f.field)}</i></span>`).join("") : '<span class="sub">—</span>'}
      <h3>Параметры запроса</h3>${chips(e.queryKeys)}
      <h3>Поля тела запроса</h3>${chips(e.reqKeys)}
      <h3>Поля ответа</h3>${chips(e.resKeys, 80)}
      ${recs.length ? `<h3>Последние запросы</h3>${recs.map(r => `<div class="tl-row" data-id="${esc(r.id)}" style="grid-template-columns:62px 50px 40px 1fr"><span>${new Date(r.t).toLocaleTimeString("ru-RU")}</span><span class="m-${esc(r.method)}">${esc(r.method)}</span><span class="s${String(r.status)[0]}">${r.status}</span><span class="u">${esc(r.url.replace(/^https?:\/\/[^/]+/, ""))}</span></div>`).join("")}` : ""}
      ${e.static.length ? `<h3>Где в коде</h3>${e.static.map(s => `<div class="sub">${esc(s.src)}</div><pre>${esc(s.ctx)}</pre>`).join("")}` : ""}`;
    $("p-det").querySelectorAll("[data-go]").forEach(b => b.onclick = () => { selEp = b.dataset.go; showEp(b.dataset.go); focusEp(b.dataset.go); highlight(); });
    $("p-det").querySelectorAll("[data-id]").forEach(b => b.onclick = () => { selRec = b.dataset.id; showRec(b.dataset.id); });
    $("p-det").querySelectorAll(".find[data-r]").forEach(b => b.onclick = () => { if (recById.has(b.dataset.r)) showRec(b.dataset.r); });
  }

  function pretty(text, mime) {
    if (!text) return "—";
    const j = (() => { try { return JSON.parse(text); } catch (e) { return null; } })();
    const s = j ? JSON.stringify(j, null, 1) : text;
    return s.length > 30000 ? s.slice(0, 30000) + "\n… (обрезано)" : s;
  }
  function hdrs(arr) {
    const a = reveal ? (arr || []) : Engine.maskHeaders(arr);
    return a.length ? `<div class="kv">${a.map(h => `<div title="${esc(h.name)}">${esc(h.name)}</div><div>${esc(h.value)}</div>`).join("")}</div>` : '<span class="sub">—</span>';
  }
  function showRec(id) {
    const r = recById.get(id); if (!r) return; tab("det");
    const ep = eng.endpoint(r.ep);
    const init = r.initiator && r.initiator.stack && r.initiator.stack.callFrames ? r.initiator.stack.callFrames.slice(0, 6) : null;
    let jwt = null;
    (r.reqHeaders || []).forEach(h => { if (/authorization/i.test(h.name)) jwt = Engine.decodeJwt(h.value.replace(/^Bearer\s+/i, "")); });
    $("p-det").innerHTML = `
      <div class="path"><span class="m-${esc(r.method)}">${esc(r.method)}</span> ${esc(r.url)}</div>
      <div style="margin-top:6px"><span class="badge s${String(r.status)[0]}">${r.status}</span><span class="badge">${esc(r.mime || "")}</span>
        ${ep ? `<span class="badge go" data-go="${esc(ep.key)}">эндпоинт: ${esc(ep.path)}</span>` : ""}</div>
      <div class="subtabs"><button id="rv">${reveal ? "скрыть секреты" : "показать секреты"}</button></div>
      ${init ? `<h3>Кто вызвал (стек)</h3><pre>${esc(init.map(f => `${f.functionName || "(anon)"}  ${f.url.split("/").pop()}:${f.lineNumber + 1}`).join("\n"))}</pre>` : ""}
      <h3>Заголовки запроса</h3>${hdrs(r.reqHeaders)}
      ${r.reqBody ? `<h3>Тело запроса</h3><pre>${esc(pretty(r.reqBody))}</pre>` : ""}
      ${jwt ? `<h3>JWT</h3><pre>${esc(JSON.stringify({ header: jwt.header, payload: jwt.payload }, null, 1))}</pre>` : ""}
      <h3>Заголовки ответа</h3>${hdrs(r.resHeaders)}
      <h3>Ответ</h3><pre>${esc(pretty(r.resBody, r.mime))}</pre>`;
    $("rv").onclick = () => { reveal = !reveal; showRec(id); };
    $("p-det").querySelectorAll("[data-go]").forEach(b => b.onclick = () => { selEp = b.dataset.go; showEp(b.dataset.go); focusEp(b.dataset.go); highlight(); });
  }

  // standalone mode (opened as a page, not in DevTools): HAR import only
  if (!hasDT) { $("rec").classList.add("off"); $("rec-t").textContent = "нет DevTools — откройте HAR"; recording = false; }
  window.addEventListener("resize", () => schedule());
  schedule(true);
})();
