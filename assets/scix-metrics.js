/* ---------- Publications: interactive SciX metrics ----------
   Data: data/scix.json → metrics (written by scripts/update_scix_graphs.py). Needs d3 v7. */
(() => {
  const root = document.getElementById("scix-metrics");
  if (!root || !window.d3) return;

  // Validated for the dark surface (scripts: dataviz validate_palette, mode dark)
  const C = { amber: "#c9822a", blue: "#4a86e0", rose: "#e0604f" };
  const fmt = d3.format(",");
  const fmtNum = (v) => (v == null || Number.isNaN(v) ? "–" : Number.isInteger(v) ? fmt(v) : d3.format(",.1f")(v));

  const tip = document.createElement("div");
  tip.className = "viz-tip m-tip";
  tip.hidden = true;
  document.body.appendChild(tip);
  function showTip(ev, title, rows) {
    tip.replaceChildren();
    const h = document.createElement("div");
    h.className = "m-tip-title";
    h.textContent = title;
    tip.appendChild(h);
    rows.forEach((r) => {
      const row = document.createElement("div");
      row.className = "m-tip-row";
      const key = document.createElement("i");
      key.style.background = r.color || "transparent";
      const val = document.createElement("b");
      val.textContent = fmtNum(r.value);
      const lab = document.createElement("span");
      lab.textContent = r.label;
      row.append(key, val, lab);
      tip.appendChild(row);
    });
    tip.hidden = false;
    const x = Math.min(ev.clientX + 14, innerWidth - tip.offsetWidth - 10);
    tip.style.left = `${x}px`;
    tip.style.top = `${ev.clientY + 14}px`;
  }
  const hideTip = () => (tip.hidden = true);

  let M, scope = "all", view = "citations";

  /* ---- data shaping ---- */
  const val = (obj, y) => +(obj?.[y] ?? 0) || 0;
  function years(...objs) {
    const ys = objs.flatMap((o) => Object.keys(o || {})).map(Number).filter(Boolean);
    if (!ys.length) return [];
    const nowY = new Date().getFullYear();
    // start at the first year with a non-zero value
    const nz = objs.flatMap((o) => Object.entries(o || {}).filter(([, v]) => +v > 0).map(([y]) => +y));
    const lo = nz.length ? Math.min(...nz) : Math.min(...ys);
    return d3.range(lo, Math.min(Math.max(...ys), nowY) + 1);
  }

  function seriesFor(kind) {
    if (kind === "citations") {
      const c = M.citations;
      const toRef = scope === "refereed";
      const fromRef = (y) => val(c.ref_to_ref, y) + (toRef ? 0 : val(c.ref_to_nonref, y));
      const fromOther = (y) => val(c.nonref_to_ref, y) + (toRef ? 0 : val(c.nonref_to_nonref, y));
      return {
        years: years(c.ref_to_ref, c.ref_to_nonref, c.nonref_to_ref, c.nonref_to_nonref),
        series: [
          { label: "From refereed papers", color: C.amber, get: fromRef },
          { label: "From other papers", color: C.blue, get: fromOther },
        ],
        unit: "citations",
      };
    }
    const h = M[kind]; // papers / reads: { all, refereed }
    const ref = (y) => val(h.refereed, y);
    const other = (y) => (scope === "refereed" ? 0 : Math.max(0, val(h.all, y) - val(h.refereed, y)));
    return {
      years: years(h.all, h.refereed),
      series: scope === "refereed"
        ? [{ label: "Refereed papers", color: C.amber, get: ref }]
        : [{ label: "Refereed papers", color: C.amber, get: ref }, { label: "Other papers", color: C.blue, get: other }],
      unit: kind === "reads" ? "reads" : "papers",
    };
  }

  /* ---- tiles ---- */
  const TILES = [
    ["papers", "Papers", "Number of papers in the library"],
    ["citations", "Citations", "Total citations to these papers"],
    ["h", "h-index", "h papers with at least h citations each"],
    ["g", "g-index", "Top g papers have at least g² citations together"],
    ["i10", "i10-index", "Papers with at least 10 citations"],
    ["tori", "tori", "Total research impact: citations normalised by the citing papers' reference counts and author counts"],
    ["reads", "Reads", "Total reads on SciX / NASA ADS"],
  ];
  function drawTiles() {
    const box = root.querySelector(".m-tiles");
    box.replaceChildren();
    const s = M[scope] || {};
    TILES.forEach(([k, label, help]) => {
      if (s[k] == null) return;
      const t = document.createElement("div");
      t.className = "stat m-tile";
      t.title = help;
      const b = document.createElement("b");
      b.className = "grad-text";
      b.textContent = fmtNum(s[k]);
      const sp = document.createElement("span");
      sp.textContent = label;
      t.append(b, sp);
      box.appendChild(t);
    });
  }

  /* ---- legend + table ---- */
  function drawLegend(series, kind) {
    const lg = root.querySelector(".m-legend");
    lg.replaceChildren();
    series.forEach((s) => {
      const item = document.createElement("span");
      const key = document.createElement("i");
      key.className = kind === "line" ? "line" : "";
      key.style.background = s.color;
      item.append(key, document.createTextNode(s.label));
      lg.appendChild(item);
    });
  }
  function drawTable(ys, series) {
    const t = document.createElement("table");
    const head = t.createTHead().insertRow();
    ["Year", ...series.map((s) => s.label), ...(series.length > 1 && view !== "indices" ? ["Total"] : [])].forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h;
      head.appendChild(th);
    });
    const body = t.createTBody();
    ys.slice().reverse().forEach((y) => {
      const r = body.insertRow();
      const vals = series.map((s) => s.get(y));
      [y, ...vals.map(fmtNum), ...(series.length > 1 && view !== "indices" ? [fmtNum(d3.sum(vals))] : [])]
        .forEach((v) => (r.insertCell().textContent = v));
    });
    root.querySelector(".m-table").replaceChildren(t);
  }

  /* ---- charts ---- */
  const roundedTop = (x, y, w, h, r) => {
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  };

  function frame() {
    const el = root.querySelector(".m-plot");
    el.replaceChildren();
    const W = el.clientWidth || 800, H = el.clientHeight || 320;
    const m = { t: 16, r: 64, b: 28, l: 44 };
    const svg = d3.select(el).append("svg").attr("viewBox", [0, 0, W, H]).attr("role", "img");
    return { svg, W, H, m };
  }

  function bars() {
    const { years: ys, series, unit } = seriesFor(view);
    drawLegend(series, "bar");
    drawTable(ys, series);
    const { svg, W, H, m } = frame();
    if (!ys.length) return;
    const x = d3.scaleBand().domain(ys).range([m.l, W - m.r]).padding(0.28);
    const totals = ys.map((y) => d3.sum(series, (s) => s.get(y)));
    const yS = d3.scaleLinear().domain([0, Math.max(1, d3.max(totals))]).nice(4).range([H - m.b, m.t]);
    grid(svg, yS, W, m);
    svg.append("g").attr("class", "m-axis").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).tickSize(0).tickPadding(8).tickValues(ys.filter((_, i) => ys.length < 14 || i % 2 === 0)));

    ys.forEach((y, i) => {
      const g = svg.append("g").attr("class", "m-col");
      let base = 0;
      const vals = series.map((s) => s.get(y));
      const top = vals.reduce((k, v, j) => (v > 0 ? j : k), -1);
      series.forEach((s, j) => {
        const v = vals[j];
        if (v <= 0) return;
        const y0 = yS(base), y1 = yS(base + v);
        const h = Math.max(0, y0 - y1 - (base > 0 ? 2 : 0)); // 2px surface gap between segments
        if (j === top) g.append("path").attr("d", roundedTop(x(y), y1, x.bandwidth(), h, 4)).attr("fill", s.color);
        else g.append("rect").attr("x", x(y)).attr("y", y1).attr("width", x.bandwidth()).attr("height", h).attr("fill", s.color);
        base += v;
      });
      // Hit target: the whole column, wider than the bar
      g.append("rect").attr("class", "m-hit").attr("x", x(y) - (x.step() - x.bandwidth()) / 2).attr("y", m.t)
        .attr("width", x.step()).attr("height", H - m.t - m.b).attr("fill", "transparent").attr("tabindex", 0)
        .attr("aria-label", `${y}: ${fmtNum(totals[i])} ${unit}`)
        .on("pointermove focus", (ev) => {
          const e = ev.type === "focus" ? { clientX: ev.target.getBoundingClientRect().right, clientY: ev.target.getBoundingClientRect().top + 40 } : ev;
          showTip(e, `${y}`, [
            ...series.map((s, j) => ({ label: s.label, value: vals[j], color: s.color })),
            ...(series.length > 1 ? [{ label: `Total ${unit}`, value: totals[i] }] : []),
          ]);
        })
        .on("pointerleave blur", hideTip);
    });
  }

  function lines() {
    const ts = M.timeseries || {};
    const defs = [["h", "h-index", C.amber], ["g", "g-index", C.blue], ["i10", "i10-index", C.rose]]
      .filter(([k]) => ts[k] && Object.keys(ts[k]).length);
    const series = defs.map(([k, label, color]) => ({ label, color, get: (y) => val(ts[k], y) }));
    const ys = years(...defs.map(([k]) => ts[k]));
    drawLegend(series, "line");
    drawTable(ys, series);
    const { svg, W, H, m } = frame();
    if (!ys.length) return;
    const x = d3.scalePoint().domain(ys).range([m.l + 10, W - m.r]);
    const yS = d3.scaleLinear().domain([0, Math.max(1, d3.max(series, (s) => d3.max(ys, s.get)))]).nice(4).range([H - m.b, m.t]);
    grid(svg, yS, W, m);
    svg.append("g").attr("class", "m-axis").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).tickSize(0).tickPadding(8).tickValues(ys.filter((_, i) => ys.length < 14 || i % 2 === 0)));
    const line = d3.line().x((y) => x(y)).curve(d3.curveMonotoneX);
    series.forEach((s) => {
      svg.append("path").attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 2)
        .attr("d", line.y((y) => yS(s.get(y)))(ys));
      const last = ys[ys.length - 1];
      svg.append("text").attr("class", "m-direct").attr("x", x(last) + 8).attr("y", yS(s.get(last)) + 4)
        .text(`${s.label.replace("-index", "")} ${fmtNum(s.get(last))}`);
    });
    // Crosshair snapping to the nearest year
    const hair = svg.append("line").attr("class", "m-hair").attr("y1", m.t).attr("y2", H - m.b).style("opacity", 0);
    const dots = svg.append("g");
    svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r + 10).attr("height", H - m.t - m.b)
      .attr("fill", "transparent")
      .on("pointermove", (ev) => {
        const [px] = d3.pointer(ev);
        const y = ys.reduce((a, b) => (Math.abs(x(b) - px) < Math.abs(x(a) - px) ? b : a));
        hair.attr("x1", x(y)).attr("x2", x(y)).style("opacity", 1);
        dots.selectAll("circle").data(series).join("circle").attr("r", 4.5).attr("cx", x(y))
          .attr("cy", (s) => yS(s.get(y))).attr("fill", (s) => s.color).attr("stroke", "#0b1020").attr("stroke-width", 2);
        showTip(ev, `${y}`, series.map((s) => ({ label: s.label, value: s.get(y), color: s.color })));
      })
      .on("pointerleave", () => { hair.style("opacity", 0); dots.selectAll("*").remove(); hideTip(); });
  }

  function grid(svg, yS, W, m) {
    svg.append("g").attr("class", "m-grid").attr("transform", `translate(${m.l},0)`)
      .call(d3.axisLeft(yS).ticks(4).tickSize(-(W - m.l - m.r)).tickPadding(8).tickFormat(d3.format("~s")))
      .call((g) => g.select(".domain").remove());
  }

  function draw() {
    drawTiles();
    root.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-selected", b.dataset.view === view));
    root.querySelectorAll("[data-scope]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.scope === scope));
    root.querySelector(".m-scope-note").hidden = view !== "indices";
    view === "indices" ? lines() : bars();
  }

  fetch("data/scix.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((data) => {
      M = data.metrics;
      if (!M || !M.all || M.all.papers == null) return;
      root.querySelector(".m-fallback")?.remove();
      root.querySelector(".m-live").hidden = false;
      if (data.updated) {
        const d = new Date(data.updated);
        root.querySelector(".m-updated").textContent =
          `Updated ${d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`;
      }
      root.querySelectorAll("[data-scope]").forEach((b) => b.addEventListener("click", () => { scope = b.dataset.scope; draw(); }));
      root.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => { view = b.dataset.view; draw(); }));
      const tb = root.querySelector(".m-table-btn"), table = root.querySelector(".m-table");
      tb.addEventListener("click", () => {
        table.hidden = !table.hidden;
        tb.textContent = table.hidden ? "Show as table" : "Hide table";
      });
      draw();
      let w = root.clientWidth;
      addEventListener("resize", () => { if (root.clientWidth !== w) { w = root.clientWidth; draw(); } });
    })
    .catch(() => {});
})();
