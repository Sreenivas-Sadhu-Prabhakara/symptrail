# symptrail

A **private, offline symptom journal** that turns your day-to-day log into a clean report you can hand your doctor.

- **Private by design.** No account, no server, no tracking. Every entry is stored only in your browser's `localStorage`.
- **It physically can't phone home.** The page ships a strict Content-Security-Policy with `connect-src 'none'`, so no network request can carry your health data off the device. Zero external libraries, fully offline once loaded.
- **Built for the appointment.** Log symptoms, severity (0–10), duration, body area, triggers and meds as tags, and notes — then export a printable summary for a chosen date range (Print → *Save as PDF*).

## What it does

- **Quick add** — date/time default to now, one or more symptoms with remembered recents, a 0–10 severity slider, optional duration and body area, comma-separated tags for triggers/meds, and free-text notes.
- **Timeline** — a chronological view grouped by day, with a timeline-spine motif and severity-scaled nodes.
- **Trends** — severity over time per symptom, drawn as inline SVG (no chart library, no network).
- **Filter** — by symptom, tag, and date range.
- **Doctor's report** — a print-optimised report for a chosen date range: header with the range, a summary table (per symptom: occurrences, average & peak severity, last seen), then every entry in chronological order. Uses a dedicated print stylesheet; `window.print()` → *Save as PDF*.
- **Your data** — JSON export and import for backup / moving between devices, plus a double-confirmed *Delete everything*. Sensible empty state with one-click **Load example entries** (clearable).
- **Accessible** — large tap targets, high contrast, keyboard operable, visible focus, an optional larger-text mode, `prefers-reduced-motion` support, and colour-blind-safe severity colours.

## Medical disclaimer

**symptrail is a personal record-keeping tool. It is NOT medical advice and NOT a diagnostic device.** It cannot diagnose, treat, or prevent any condition, and nothing in it is a substitute for professional judgement. Always consult a qualified health professional about your symptoms, and seek urgent care for anything severe or worsening. **The authors accept no liability** for any decisions made using this tool.

## Privacy

There is no back end. Entries live in your browser's `localStorage` and are never uploaded. The Content-Security-Policy blocks all outbound connections (`connect-src 'none'`), so your health information cannot leave the device. Clearing your browser data, or using a different browser or device, gives you a fresh empty log — which is exactly why the JSON backup export exists.

## Tech

- [Astro](https://astro.build) static build, output to `dist/`.
- 100% client-side vanilla JavaScript (`public/app.js`) served same-origin to satisfy `script-src 'self'`.
- No runtime dependencies, no analytics, no fonts or assets loaded from the network.

## Develop

```sh
npm install
npm run dev      # local dev server
npm run build    # production build to ./dist/
npm run preview  # preview the production build
```

The site is configured for GitHub Pages under a base path (`/symptrail`); every asset is referenced through `import.meta.env.BASE_URL` so nothing 404s when served from a subpath.
