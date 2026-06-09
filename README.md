# han-oqo.github.io

Personal site of Hankyu Jang. Source for [https://han-oqo.github.io/](https://han-oqo.github.io/).

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
