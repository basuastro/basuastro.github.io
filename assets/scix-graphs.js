/* ---------- Publications: SciX author network, paper network and concept cloud ----------
   Data comes from data/scix.json (written by scripts/update_scix_graphs.py).
   Needs d3 v7 and d3-cloud, loaded from a CDN on publications.html. */
(() => {
  const root = document.getElementById("scix-graphs");
  if (!root || !window.d3) return;

  const LIB_Q = "docs(library/Lyo_uP6QR2OPkW6iGUMGhA)";
  const scixSearch = (q) =>
    `https://scixplorer.org/search?p=1&q=${encodeURIComponent(q)}&sort=date+desc&d=astrophysics`;
  const COLORS = ["#ffb259", "#ff7a6b", "#79acff", "#b48cff", "#5fd3b3", "#ffd86b", "#ff8fc7", "#8fe3ff", "#c9e27a", "#ffa07a"];
  const color = (d) => (d.hub ? "#ffffff" : COLORS[Math.abs(+d.group || 0) % COLORS.length]);

  const tip = document.createElement("div");
  tip.className = "viz-tip";
  tip.hidden = true;
  document.body.appendChild(tip);
  const showTip = (ev, html) => {
    tip.innerHTML = html;
    tip.hidden = false;
    const x = Math.min(ev.clientX + 14, innerWidth - tip.offsetWidth - 10);
    tip.style.left = `${x}px`;
    tip.style.top = `${ev.clientY + 14}px`;
  };
  const hideTip = () => (tip.hidden = true);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  /* Force-directed graph with zoom, drag, hover-highlight and click-through */
  function forceGraph(el, data, opt) {
    el.innerHTML = "";
    const W = el.clientWidth || 900, H = el.clientHeight || 560;
    const nodes = data.nodes.map((d) => ({ ...d }));
    const links = data.links.map((d) => ({ ...d }));
    const svg = d3.select(el).append("svg").attr("viewBox", [0, 0, W, H]);
    const g = svg.append("g");
    const zoom = d3.zoom().scaleExtent([0.2, 6]).on("zoom", (e) => g.attr("transform", e.transform));
    svg.call(zoom);

    const maxV = d3.max(links, (l) => l.value) || 1;
    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d) => d.id)
        .distance((l) => (l.hub ? 160 : opt.distance || 60))
        .strength((l) => (l.hub ? 0.02 : 0.2 + 0.6 * (l.value / maxV))))
      .force("charge", d3.forceManyBody().strength(opt.charge || -120))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collide", d3.forceCollide().radius((d) => opt.radius(d) + 3));

    const link = g.append("g").attr("class", "viz-links").selectAll("line").data(links).join("line")
      .attr("stroke-width", (l) => (l.hub ? 0.4 : 0.6 + 3 * (l.value / maxV)))
      .attr("stroke-opacity", (l) => (l.hub ? 0.08 : 0.35));

    const node = g.append("g").selectAll("g").data(nodes).join("g").attr("class", "viz-node")
      .call(d3.drag()
        .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
    node.append("circle").attr("r", opt.radius).attr("fill", color);
    node.append("text").text(opt.label).attr("dy", (d) => opt.radius(d) + 11)
      .attr("class", (d) => (opt.alwaysLabel?.(d) ? "on" : ""));

    const nbrs = new Map(nodes.map((n) => [n.id, new Set([n.id])]));
    links.forEach((l) => {
      if (l.hub) return;
      const s = l.source.id ?? l.source, t = l.target.id ?? l.target;
      nbrs.get(s)?.add(t);
      nbrs.get(t)?.add(s);
    });
    const focus = (d) => {
      const set = d && nbrs.get(d.id);
      node.classed("dim", (n) => set && !set.has(n.id)).classed("hl", (n) => set && set.has(n.id));
      link.classed("hl", (l) => d && !l.hub && (l.source.id === d.id || l.target.id === d.id))
        .classed("dim", (l) => d && !(l.source.id === d.id || l.target.id === d.id));
    };
    node.on("mouseenter", (e, d) => { focus(d); showTip(e, opt.tip(d)); })
      .on("mousemove", (e, d) => showTip(e, opt.tip(d)))
      .on("mouseleave", () => { focus(null); hideTip(); })
      .on("click", (e, d) => { if (!e.defaultPrevented) window.open(opt.href(d), "_blank", "noopener"); });

    sim.on("tick", () => {
      link.attr("x1", (l) => l.source.x).attr("y1", (l) => l.source.y)
        .attr("x2", (l) => l.target.x).attr("y2", (l) => l.target.y);
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return {
      reset: () => { svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity); sim.alpha(0.8).restart(); },
      search: (q) => {
        q = q.trim().toLowerCase();
        node.classed("match", (d) => q && opt.label(d).toLowerCase().includes(q))
          .classed("dim", (d) => q && !opt.label(d).toLowerCase().includes(q));
      },
    };
  }

  /* Word cloud: d3-cloud layout, click a word to search for it in the library */
  function wordCloud(el, words) {
    el.innerHTML = "";
    const W = el.clientWidth || 900, H = el.clientHeight || 560;
    const max = d3.max(words, (w) => w.weight) || 1, min = d3.min(words, (w) => w.weight) || 0;
    const size = d3.scaleSqrt().domain([min, max]).range([13, 64]);
    const layout = () => {
      el.innerHTML = "";
      const svg = d3.select(el).append("svg").attr("viewBox", [0, 0, W, H]);
      const g = svg.append("g").attr("transform", `translate(${W / 2},${H / 2})`);
      d3.layout.cloud().size([W, H])
        .words(words.map((w) => ({ ...w, text: w.word, size: size(w.weight) })))
        .padding(3).rotate(() => (Math.random() < 0.2 ? 90 : 0))
        .font("Inter").fontSize((d) => d.size)
        .on("end", (placed) => {
          g.selectAll("text").data(placed).join("text").attr("class", "viz-word")
            .attr("text-anchor", "middle")
            .attr("transform", (d) => `translate(${d.x},${d.y}) rotate(${d.rotate})`)
            .style("font-size", (d) => `${d.size}px`)
            .attr("fill", (d, i) => COLORS[i % 3])
            .text((d) => d.text)
            .on("mousemove", (e, d) => showTip(e, `<b>${esc(d.text)}</b><br>${d.count} mentions in ${d.papers} paper${d.papers === 1 ? "" : "s"}<br><span>Click to search SciX</span>`))
            .on("mouseleave", hideTip)
            .on("click", (e, d) => window.open(scixSearch(`${LIB_Q} abs:"${d.text}"`), "_blank", "noopener"));
        })
        .start();
    };
    layout();
    return { reset: layout };
  }

  const builders = {
    authors: (el, data) => forceGraph(el, data, {
      radius: (d) => (d.hub ? 14 : 4 + Math.sqrt(d.size || 5) * 0.9),
      label: (d) => d.name,
      alwaysLabel: (d) => d.hub || (d.size || 0) > 60,
      charge: -90,
      tip: (d) => `<b>${esc(d.name)}</b>` + (d.papers ? `<br>${d.papers} shared paper${d.papers === 1 ? "" : "s"}` : "") +
        (d.citations ? `<br>${d.citations} citations` : "") + `<br><span>Click to open on SciX</span>`,
      href: (d) => scixSearch(`author:"${d.name}"`),
    }),
    papers: (el, data) => forceGraph(el, data, {
      radius: (d) => 7 + Math.sqrt(d.citations || 0) * 2,
      label: (d) => `${(d.first_author || "").split(",")[0]} ${d.year || ""}`.trim(),
      alwaysLabel: () => true,
      distance: 130, charge: -260,
      tip: (d) => `<b>${esc(d.title)}</b><br>${esc(d.first_author)}${d.year ? `, ${d.year}` : ""}<br>${d.citations} citations<br><span>Click to open on SciX</span>`,
      href: (d) => `https://scixplorer.org/abs/${encodeURIComponent(d.bibcode)}/abstract`,
    }),
    concepts: (el, words) => wordCloud(el, words),
  };

  fetch("data/scix.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((data) => {
      const panels = root.querySelectorAll("[data-viz]");
      const charts = {};
      const draw = (panel) => {
        const key = panel.dataset.viz, el = panel.querySelector(".viz-canvas");
        const d = data[key];
        const empty = !d || (Array.isArray(d) ? !d.length : !d.nodes?.length);
        if (empty) return;
        if (!charts[key]) charts[key] = builders[key](el, d);
      };
      panels.forEach((panel) => {
        const key = panel.dataset.viz;
        if (!data[key]) return;
        panel.querySelector(".viz-empty")?.remove();
        panel.querySelector(".viz-reset")?.addEventListener("click", () => charts[key]?.reset());
        panel.querySelector(".viz-search")?.addEventListener("input", (e) => charts[key]?.search?.(e.target.value));
        new MutationObserver(() => !panel.hidden && draw(panel)).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
        if (!panel.hidden) draw(panel);
      });
      if (data.updated) {
        const note = root.querySelector(".viz-updated");
        const d = new Date(data.updated);
        note.textContent = `Graphs from SciX, updated ${d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`;
      }
    })
    .catch(() => {});
})();
