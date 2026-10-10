# Docs Alive

Upload a document. Read it, don't scroll it.

Drop in a `.docx`, `.md`, or `.txt` file and Docs Alive renders it as a focused
reading view: a sticky table of contents, scroll-spy highlighting, fade-in
transitions as sections come into view, and a marker sweep over emphasized text.
Everything runs client-side — files never leave the browser.

## Features

- **Client-side conversion** — `.docx` via [mammoth](https://github.com/mwilliamson/mammoth.js), `.md`/`.txt` via [marked](https://github.com/markedjs/marked)
- **Sanitized output** — everything is run through [DOMPurify](https://github.com/cure53/DOMPurify) before rendering
- **Table of contents** — generated from H1–H3, with scroll-spy via `IntersectionObserver`
- **Reading progress bar** — spring-smoothed via framer-motion's `useScroll`
- **Cursor-reactive background** — depth-based parallax blobs, grid, and comet trail
- **Custom cursor** — dot + trailing ring that reacts to hover and press
- **Dark mode** — persisted to `localStorage`, no flash on load, respects `prefers-color-scheme`
- **Accessible by default** — full `prefers-reduced-motion` support, keyboard focus rings, semantic markup

## Getting started

```bash
git clone https://github.com/akshaypalekar15/docs-alive.git
cd docs-alive
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) and drop in a file.

## Scripts

| Command         | Description                        |
| --------------- | ---------------------------------- |
| `npm run dev`   | Start the dev server               |
| `npm run build` | Production build                   |
| `npm start`     | Serve the production build         |
| `npm run lint`  | Run ESLint                         |

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · framer-motion · Tailwind-free
hand-written CSS with custom properties for theming.

## Project structure

```
app/
  layout.tsx      Root layout, fonts, no-flash theme script
  page.tsx        Upload + conversion
  globals.css     Design tokens and all styling
components/
  Viewer.tsx      Document view, TOC, scroll-spy
  Background.tsx  Cursor-reactive parallax background
  Cursor.tsx      Custom cursor and trail
  ThemeToggle.tsx Dark/light toggle
global.d.ts       Ambient module declaration for mammoth
```

## Contributing

Issues and pull requests are welcome. Please run `npm run lint` and
`npm run build` before submitting.

## License

[MIT](./LICENSE)
