#!/usr/bin/env python3
"""Rebuild the paper lists on publications.html from the SciX library.

Reads data/library.json (written by update_scix_graphs.py) and rewrites the parts
of publications.html between these markers:

    <!-- scix:first -->  ... <!-- /scix:first -->   papers with Basu as first author
    <!-- scix:collab --> ... <!-- /scix:collab -->  all other papers

Anything outside the markers is hand-written and kept (e.g. "in preparation"
entries, the thesis). A library paper whose arXiv ID or bibcode already appears
outside the markers is skipped, so it is not listed twice.

Usage:
    python3 scripts/build_publications.py
"""

import html
import json
import re
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "publications.html"
LIB = ROOT / "data" / "library.json"
ME = "Basu, A"  # matches "Basu, Arghyadeep" / "Basu, A."
SECTIONS = {"first": "First-author papers", "collab": "Collaboration papers"}
STATS = {"first": "First-author papers", "collab": "Collaboration papers"}


def is_me(name):
    return name.startswith(ME)


def short(name):
    """'Hsiao, Tiger Yu-Yang' -> 'Hsiao, T. Y.-Y.'"""
    if "," not in name:
        return name
    last, given = (p.strip() for p in name.split(",", 1))
    if re.search(r"\b(Community|Collaboration|Team|Consortium|Survey)\b", last, re.I):
        return f"{given} {last}"  # "Community, Genesis" -> "Genesis Community"
    initials = " ".join("-".join(g[0] + "." for g in part.split("-") if g) for part in given.replace(".", ". ").split())
    return f"{last}, {initials}" if initials else last


def authors(names, show=4):
    out = ["<b>Basu, A.</b>" if is_me(n) else html.escape(short(n)) for n in names]
    me = next((i for i, n in enumerate(names) if is_me(n)), None)
    if len(out) <= 6:
        return ", ".join(out)
    if me is None or me < show + 1:
        return ", ".join(out[: max(show, (me or 0) + 1)]) + ", et al."
    return ", ".join(out[:show]) + ", et al., <b>Basu, A.</b>, et al."


def latex(m):
    s = m.group(1)
    for a, b in [(r"\sim", "∼"), (r"\alpha", "α"), (r"\beta", "β"), (r"\gamma", "γ"), (r"\lambda", "λ"),
                 (r"\mu", "μ"), (r"\odot", "⊙"), (r"\leq", "≤"), (r"\geq", "≥"), (r"\lesssim", "≲"),
                 (r"\gtrsim", "≳"), (r"\times", "×"), ("-", "–")]:
        s = s.replace(a, b)
    s = re.sub(r"\\(?:mathrm|rm|text|mathit)\{([^}]*)\}", r"\1", s)
    s = re.sub(r"\^\{([^}]*)\}|\^(\w)", lambda k: f"<sup>{k.group(1) or k.group(2)}</sup>", s)
    s = re.sub(r"_\{([^}]*)\}|_(\w)", lambda k: f"<sub>{k.group(1) or k.group(2)}</sub>", s)
    s = s.replace("{", "").replace("}", "").replace("\\", "")
    s = re.sub(r"(?<![<\w/])([a-zA-Z])(?![\w>])", r"<i>\1</i>", s)  # lone variables like z
    return s


def title(raw):
    t = raw[0] if isinstance(raw, list) else (raw or "")
    keep = {}  # protect the tags ADS uses (<SUP>, <SUB>, <i>) from escaping

    def stash(m):
        keep[f"\0{len(keep)}\0"] = m.group(0).lower()
        return f"\0{len(keep) - 1}\0"

    t = re.sub(r"</?(?:sup|sub|i|b)>", stash, t, flags=re.I)
    t = html.escape(t, quote=False)
    for k, v in keep.items():
        t = t.replace(k, v)
    return re.sub(r"\$([^$]+)\$", latex, t)


def venue(p):
    pub = p.get("pub") or ""
    if "arXiv" in pub or p.get("doctype") == "eprint":
        return "arXiv preprint"
    vol, page = p.get("volume"), (p.get("page") or [None])[0]
    return html.escape(", ".join(x for x in (pub, vol, page) if x))


def arxiv_id(p):
    for ident in p.get("identifier") or []:
        if ident.lower().startswith("arxiv:"):
            return ident.split(":", 1)[1]
    return None


def chip(href, label):
    return f'<a class="chip" href="{html.escape(href)}" target="_blank" rel="noopener">{label}</a>'


def entry(p):
    bib = p["bibcode"]
    links = []
    if p.get("doi"):
        links.append(chip(f"https://doi.org/{p['doi'][0]}", "DOI"))
    if aid := arxiv_id(p):
        links.append(chip(f"https://arxiv.org/abs/{aid}", f"arXiv:{aid}"))
    links.append(chip(f"https://scixplorer.org/abs/{urllib.parse.quote(bib)}/abstract", "SciX"))
    ads = html.escape(f'identifier:"{bib}"')
    sep = "\n                "
    return f"""          <li class="pub reveal" data-ads="{ads}">
            <span class="pub-year">{html.escape(p.get('year', ''))}</span>
            <div>
              <div class="pub-topic">{title(p.get('title'))}</div>
              <div class="pub-authors">{authors(p.get('author') or [])}</div>
              <div class="pub-venue">{venue(p)}</div>
              <div class="pub-links">
                {sep.join(links)}
              </div>
            </div>
          </li>"""


def main():
    if not LIB.exists():
        sys.exit("data/library.json not found: run update_scix_graphs.py first")
    papers = json.loads(LIB.read_text())["papers"]
    page = PAGE.read_text()

    marker = re.compile(r"(<!-- scix:(\w+) -->\n).*?(\s*<!-- /scix:\2 -->)", re.S)
    manual = marker.sub("", page)  # hand-written parts of the page
    papers = [p for p in papers
              if p["bibcode"] not in manual and not ((a := arxiv_id(p)) and a in manual)]
    papers.sort(key=lambda p: (p.get("pubdate") or p.get("year") or ""), reverse=True)

    groups = {"first": [], "collab": []}
    for p in papers:
        first = (p.get("author") or [""])[0]
        groups["first" if is_me(first) else "collab"].append(entry(p))

    page = marker.sub(lambda m: m.group(1) + "\n".join(groups[m.group(2)]) + m.group(3), page)

    # Update counts in the section headings and the stat boxes
    for key, heading in SECTIONS.items():
        block = re.search(rf"<h2[^>]*>{heading} <small>\d+</small></h2>\s*<ol class=\"pub-list\">(.*?)</ol>", page, re.S)
        if not block:
            continue
        n = block.group(1).count('<li class="pub')
        page = re.sub(rf"({heading} <small>)\d+(</small>)", rf"\g<1>{n}\2", page)
        page = re.sub(rf'(<b class="grad-text">)\d+(</b><span>{STATS[key]}</span>)', rf"\g<1>{n}\2", page)
        print(f"{heading}: {n}")

    PAGE.write_text(page)


if __name__ == "__main__":
    main()
