# han-oqo.github.io

AI Inference Study — notes on LLM inference internals. Source for [https://han-oqo.github.io/](https://han-oqo.github.io/).

## Structure

- `index.html` — landing page
- `study/` — study notes (inference architecture, etc.)
- `assets/` — shared CSS/JS (language toggle)

Each page supports an English ↔ Korean toggle (top-right). Default is English; the choice is remembered in `localStorage`.

## Local preview

Any static server works, e.g.:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Gated pages

Two pages under `study/` are encrypted client-side with [StatiCrypt](https://github.com/robinmoisson/staticrypt). The unencrypted sources are not committed (`*.unencrypted.html` is in `.gitignore`).

## Format & theme consistency (enforced)

All pages must share the same skeleton and the cream/warm palette defined in
`assets/theme.css`. The full conventions live in [CLAUDE.md](CLAUDE.md); they are
enforced automatically:

```sh
sh tools/install-hooks.sh        # once after cloning — enables the pre-push hook
python3 tools/check_theme.py     # run the consistency check manually
```

A failing check **blocks `git push`** (pre-push hook) and **blocks deployment**
(CI job in `.github/workflows/pages.yml`).
