# Spawn website

Static marketing site for spawnmy.ai. No build step, no dependencies.

- `index.html` — single page: hero, features, architecture, open source, pricing, FAQ.
- `styles.css` — Nocturne design language (tokens mirror `packages/desktop/src/nocturne.css`).

## Preview

This site is **fully isolated** from the Spawn desktop app: a top-level `website/`
dir, not in the root `package.json` workspaces, no build step, no monorepo deps.
Preview it as a standalone static server on a distinct port — never on the app's
ports (daemon `:8810`, desktop vite), and never run root or `packages/desktop`
`npm run dev` for this.

```sh
# From repo root — zero-dependency static server on an unused port
/usr/bin/python3 -m http.server 4321 --bind 127.0.0.1 --directory website
# then open http://127.0.0.1:4321  and kill the server when done

# Or just open the file directly (no server):
open website/index.html
```

## Deploy

Any static host. Point spawnmy.ai at the `website/` directory:

- **Cloudflare Pages / Vercel / Netlify** — root dir `website`, no build command, output `.`
- **GitHub Pages** — serve `website/` from a workflow or move contents to a `gh-pages` branch.
