# arghyadeepbasu — personal website

Plain HTML/CSS/JS with no build step. Open `index.html` in a browser to preview.

```
index.html          Home: intro, news, projects
research.html       Research interests, CV, thesis, BUGS poster
publications.html   Papers and thesis
about.html          Bio, timeline, hobbies
network.html        "Friendly" scientists
contact.html        Email / LinkedIn
assets/style.css    All styling (colours are CSS variables at the top)
assets/main.js      Starfield, mobile menu, tabs, scroll animations
images/             All images
```

## Common edits

- **Add a news item**: copy a `<div class="news-item">` block in `index.html`.
- **Add a paper**: copy an `<li class="pub">` block in `publications.html` and update the counts in the `.stats` boxes at the top.
- **Add a colleague**: copy an `<a class="person">` block in `network.html`; put their photo in `images/people/`.
- **Nav / footer**: these are repeated in every `.html` file, so change them in all six.

## Publishing (free options)

- **GitHub Pages**: push this folder to a repo named `<username>.github.io`; the site goes live at `https://<username>.github.io`.
- **Netlify / Cloudflare Pages**: drag and drop this folder at app.netlify.com/drop, or connect the repo.

Both support a custom domain (e.g. `arghyadeepbasu.com`) later.

### For pushing and committing

cd ~/Documents/website
git init -b main
git remote add origin https://github.com/basuastro/basuastro.github.io.git
git fetch origin
git reset origin/main

After that, each update is:


git add -A
git commit -m "Add news item"
git push
The site updates about a minute after each push.
## Citation counts (NASA/ADS)

Each paper in `publications.html` has a `data-ads="..."` attribute holding an ADS search
(a DOI, arXiv id or bibcode). `scripts/update_citations.py` runs those searches and writes
`data/citations.json`, which the page reads to show a citation badge on each paper and the total.

One-time setup:

1. Get a free ADS token: https://ui.adsabs.harvard.edu/user/settings/token
2. On GitHub: repo **Settings → Secrets and variables → Actions → New repository secret**,
   name `ADS_TOKEN`, paste the token.
3. On the **Actions** tab, open "Update ADS citations" and click **Run workflow**.

After that the counts refresh automatically every Monday.

To refresh by hand instead: `ADS_TOKEN=your-token python3 scripts/update_citations.py`, then commit `data/citations.json`.

When you add a new paper, give its `<li class="pub">` a `data-ads` attribute, e.g.
`data-ads='identifier:"arXiv:2601.12345"'` or `data-ads='doi:"10.1093/mnras/xxxx"'`.

Note: the badges don't appear when you open the HTML file directly (file://) because browsers
block loading the JSON; they work on the live site or with `python3 -m http.server`.
