# Moyers Duck Hunt

Static browser arcade game for Moyers Firearms. No backend, build step, account system, or online leaderboard is required.

## Run Locally

```powershell
npm run dev
```

Open:

- Standalone page: `http://127.0.0.1:5173/`
- Embed page: `http://127.0.0.1:5173/embed.html`
- Embed mode on main page: `http://127.0.0.1:5173/?embed=1`

## Website Embed

Upload this folder to static hosting, then embed `embed.html` in an iframe.

```html
<iframe
  src="https://example.com/moyers-duck-hunt/embed.html?cta=https%3A%2F%2Fwww.moyersfirearms.com%2F"
  title="Moyers Duck Hunt"
  loading="lazy"
  allow="fullscreen"
  style="width: 100%; aspect-ratio: 16 / 9; border: 0; display: block;"
></iframe>
```

Recommended desktop embed size: full width with a 16:9 aspect ratio, minimum 900px wide when possible. On mobile, place the iframe in a full-width section and let it use the available viewport width.

## URL Options

- `?embed=1`: enables full-bleed embed styling on `index.html`.
- `?cta=https%3A%2F%2Fwww.moyersfirearms.com%2F`: sets the final-screen `Visit Moyers Firearms` link.

The page sets `window.MoyersDuckHuntReady = true` and `data-moyers-duck-hunt-ready="true"` on the body after the game initializes, which can be used by host pages for a simple readiness check.

## Files To Host

- `index.html`
- `embed.html`
- `src/main.js`
- `src/game.js`
- `src/styles.css`
- everything in `assets/`

## Notes

High scores and recent run history are saved in the visitor's browser with `localStorage`. They are local to that browser and are not uploaded anywhere.
