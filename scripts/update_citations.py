#!/usr/bin/env python3
"""Fetch NASA/ADS citation counts for every paper on publications.html.

Each <li class="pub" data-ads="..."> holds an ADS search query. This script runs
those queries and writes the results to data/citations.json, which the page reads.

Usage:
    ADS_TOKEN=your-token python3 scripts/update_citations.py

Get a free token at https://ui.adsabs.harvard.edu/user/settings/token
"""

import html
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "publications.html"
OUT = ROOT / "data" / "citations.json"
API = "https://api.adsabs.harvard.edu/v1/search/query"


def ads_lookup(query, token):
    params = urllib.parse.urlencode({"q": query, "fl": "bibcode,citation_count", "rows": 1})
    req = urllib.request.Request(f"{API}?{params}", headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        docs = json.load(resp)["response"]["docs"]
    if not docs:
        return None
    return {"bibcode": docs[0]["bibcode"], "citations": docs[0].get("citation_count", 0)}


def main():
    token = os.environ.get("ADS_TOKEN")
    if not token:
        sys.exit("Set ADS_TOKEN (https://ui.adsabs.harvard.edu/user/settings/token)")

    queries = [html.unescape(q) for q in re.findall(r'data-ads="([^"]+)"', PAGE.read_text())]
    previous = json.loads(OUT.read_text()).get("papers", {}) if OUT.exists() else {}

    papers = {}
    for q in queries:
        try:
            result = ads_lookup(q, token)
        except Exception as e:  # keep the last known value if ADS hiccups
            print(f"  ! {q}: {e}", file=sys.stderr)
            result = previous.get(q)
        if result is None:
            print(f"  ? {q}: not found in ADS", file=sys.stderr)
            continue
        papers[q] = result
        print(f"  {result['citations']:>4}  {result['bibcode']}  ({q})")

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "papers": papers,
    }, indent=2, ensure_ascii=False) + "\n")
    total = sum(p["citations"] for p in papers.values())
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(papers)}/{len(queries)} papers, {total} citations")


if __name__ == "__main__":
    main()
