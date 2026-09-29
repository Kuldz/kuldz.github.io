# kuldz.github.io

Static site built with [Astro](https://astro.build). Page content comes from a public Google Sheet at build time.

## How it works

- `src/lib/sheet.ts` fetches the sheet's tabs (Games, Backlog, Masterpieces, Info) as CSV and turns them into data for the pages.
- `scripts/fetch-covers.mjs` runs before every build. It downloads the sheet's XLSX export and extracts the in-cell icons into `public/covers/` (generated, not committed).
- `src/data/franchises.ts` and `src/data/platforms.ts` hold small lookup lists used for franchise grouping and platform tags.
- Pages: `/games`, `/backlog`, `/masterpieces`, `/setup`.

## Commands

| Command           | Action                                        |
| :---------------- | :-------------------------------------------- |
| `npm install`     | Install dependencies                          |
| `npm run dev`     | Start the dev server at `localhost:4321`      |
| `npm run build`   | Fetch icons and build the site into `./dist/` |
| `npm run preview` | Preview the built site locally                |

Node 22.12 or newer is required.

## Deployment

`.github/workflows/deploy.yml` builds the site and publishes it to GitHub Pages. It runs on every push to `main`, every 6 hours (to pick up sheet changes), and manually from the Actions tab.
