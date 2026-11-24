#!/usr/bin/env python3
"""Fetch the SciX / NASA ADS library (data/library.json, used to build the
publication list) plus its author network, paper network and concept cloud
(data/scix.json) for publications.html.

The SciX visualisation API needs a token, which must not be put in the browser,
so this runs in the GitHub Action (or locally) and the page reads the saved JSON.

Usage:
    ADS_TOKEN=your-token python3 scripts/update_scix_graphs.py

Get a free token at https://scixplorer.org/user/settings/token
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "scix.json"
LIB_OUT = ROOT / "data" / "library.json"
API = "https://api.adsabs.harvard.edu/v1"
LIBRARY = "Lyo_uP6QR2OPkW6iGUMGhA"
QUERY = f"docs(library/{LIBRARY})"


def call(path, token, body=None, params=None, tries=4):
    """GET (or POST JSON when body is given), retrying on network errors and 429/5xx."""
    url = f"{API}/{path}" + (f"?{urllib.parse.urlencode(params)}" if params else "")
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Authorization": f"Bearer {token}"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=headers)
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or attempt == tries - 1:
                raise RuntimeError(f"{path}: HTTP {e.code} {e.read()[:300]!r}") from None
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt == tries - 1:
                raise RuntimeError(f"{path}: {e}") from None
        time.sleep(5 * 2 ** attempt)


def library_papers(token):
    res = call("search/query", token, params={
        "q": QUERY,
        "fl": "bibcode,scix_id,title,author,first_author,year,pubdate,pub,volume,page,doi,identifier,doctype,citation_count",
        "rows": 200, "sort": "date desc",
    })
    return res["response"]["docs"]


def author_network(token, bibcodes):
    data = call("vis/author-network", token, body={"bibcodes": bibcodes}).get("data", {})
    if "Error" in data:
        raise RuntimeError(data["Error"])
    nodes, links = [], []
    if "fullGraph" in data:  # small networks (< 30 authors)
        g = data["fullGraph"]
        for i, n in enumerate(g["nodes"]):
            nodes.append({"id": i, "name": n["nodeName"], "size": n.get("nodeWeight", 1), "group": 1})
        for l in g["links"]:
            links.append({"source": l["source"], "target": l["target"], "value": l.get("value", 1)})
    else:  # large networks: grouped tree + link list
        root = data["root"]
        for group in root.get("children", []):
            for a in group.get("children", []):
                nodes.append({
                    "id": a["numberName"], "name": a["name"], "size": a.get("size", 5),
                    "group": group["name"], "papers": len(a.get("papers", [])),
                    "citations": a.get("citation_count", 0),
                })
        ids = {n["id"] for n in nodes}
        for s, t, w in data.get("link_data", []):
            if s in ids and t in ids:
                links.append({"source": s, "target": t, "value": w})
        # "Connector" authors appear on (nearly) every paper and are removed before
        # grouping; put them back as hubs linked to every group.
        for k, c in enumerate(root.get("name", []) or []):
            hub = f"hub{k}"
            nodes.append({"id": hub, "name": c["nodeName"], "size": 150, "group": 0, "hub": True})
            for n in nodes:
                if not n.get("hub"):
                    links.append({"source": hub, "target": n["id"], "value": 0.5, "hub": True})
    return {"nodes": nodes, "links": links}


def paper_network(token, bibcodes, by_scix):
    data = call("vis/paper-network", token, body={"bibcodes": bibcodes}).get("data", {})
    if "Error" in data:
        raise RuntimeError(data["Error"])
    g = data["fullGraph"]
    raw = g["nodes"]
    idmap = {n.get("id", i): i for i, n in enumerate(raw)}
    nodes = []
    for i, n in enumerate(raw):
        paper = by_scix.get(n.get("node_name"), {})
        title = n.get("title") or paper.get("title") or ""
        nodes.append({
            "id": i, "bibcode": paper.get("bibcode", n.get("node_name")),
            "title": title[0] if isinstance(title, list) else title,
            "first_author": n.get("first_author") or paper.get("first_author", ""),
            "year": paper.get("year", ""), "citations": n.get("citation_count", 0),
            "group": n.get("group", 0),
        })
    links = []
    for l in g["links"]:
        s, t = idmap.get(l["source"], l["source"]), idmap.get(l["target"], l["target"])
        links.append({"source": s, "target": t, "value": l.get("value", 1), "shared": len(l.get("overlap", []))})
    return {"nodes": nodes, "links": links}


def concept_cloud(token, n_papers):
    rows = max(n_papers, 1)
    try:  # the ADS UI sends Solr-style list values
        res = call("vis/word-cloud", token, body={"q": [QUERY], "rows": [rows], "sort": ["date desc"]})
    except RuntimeError:
        res = call("vis/word-cloud", token, body={"q": QUERY, "rows": rows, "sort": "date desc"})
    if "Error" in res:
        raise RuntimeError(res["Error"])
    words = [
        {"word": w, "count": v.get("total_occurrences", 0), "papers": v.get("record_count", 0),
         "weight": round(v.get("total_occurrences", 0) * v.get("idf", 1), 3)}
        for w, v in res.items() if isinstance(v, dict)
    ]
    words.sort(key=lambda w: -w["weight"])
    return words[:80]


def main():
    token = os.environ.get("ADS_TOKEN")
    if not token:
        sys.exit("Set ADS_TOKEN (https://scixplorer.org/user/settings/token)")

    previous = json.loads(OUT.read_text()) if OUT.exists() else {}
    papers = library_papers(token)
    bibcodes = [p["bibcode"] for p in papers]
    by_scix = {p.get("scix_id"): p for p in papers if p.get("scix_id")}
    print(f"Library: {len(bibcodes)} papers")
    LIB_OUT.parent.mkdir(exist_ok=True)
    LIB_OUT.write_text(json.dumps({"library": LIBRARY, "papers": papers}, indent=1, ensure_ascii=False) + "\n")

    out = {"updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "library": LIBRARY}
    jobs = {
        "authors": lambda: author_network(token, bibcodes),
        "papers": lambda: paper_network(token, bibcodes, by_scix),
        "concepts": lambda: concept_cloud(token, len(bibcodes)),
    }
    ok = 0
    for key, job in jobs.items():
        try:
            out[key] = job()
            ok += 1
            size = len(out[key]["nodes"]) if isinstance(out[key], dict) else len(out[key])
            print(f"  {key}: {size} items")
        except Exception as e:  # keep the last good copy if one endpoint fails
            print(f"  ! {key}: {e}", file=sys.stderr)
            if key in previous:
                out[key] = previous[key]

    if not ok:
        sys.exit("All SciX visualisation requests failed; data/scix.json left unchanged")
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print(f"Wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
