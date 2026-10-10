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
