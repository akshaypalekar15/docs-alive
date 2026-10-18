# Docs Alive

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Upload a document. Read it, don't scroll it.

Drop in a `.docx`, `.md`, or `.txt` file and Docs Alive renders it as a focused
reading view: a sticky table of contents, scroll-spy highlighting, fade-in
transitions as sections come into view, and a reading progress bar. Rearrange
the sections the way you want to read them, sort the tables, correct anything
that reads wrong, then export the result. Everything runs client-side — files
never leave the browser.

## Features

### Reading

- **Client-side conversion** — `.docx` via [mammoth](https://github.com/mwilliamson/mammoth.js), `.md`/`.txt` via [marked](https://github.com/markedjs/marked)
- **Sanitized output** — everything is run through [DOMPurify](https://github.com/cure53/DOMPurify) before rendering
- **Table of contents** — an accordion built from H1–H3, with scroll-spy and per-section progress; falls back to treating bold paragraphs as headings, since most `.docx` files fake headings with bold text
- **Neon tables** — real data tables get a pulsing glow; single-cell layout wrappers are left alone
- **Hover lift** — paragraphs and lists tint and scale slightly
- **Reading progress bar** — spring-smoothed via framer-motion's `useScroll`
- **Link previews** — hovering an external link shows its image, title and description
- **Cursor-reactive background** — depth-based parallax blobs, grid, and drifting motes that follow the pointer
- **Dark mode** — persisted to `localStorage`, no flash on load, respects `prefers-color-scheme`
- **Respectful of `prefers-reduced-motion`** — animation, transitions and parallax are all reduced or removed

### Rearranging

- **Drag to reorder** — grab a section by the handle beside it, or by its grip in the table of contents. The two stay in step: what you do in one shows in the other, because the outline is built from the reader's order rather than the parse order
- **Arrangement is remembered** — the order is saved per document in `localStorage`, so reopening the same file restores it. A **Reset order** control puts it back
- **Sortable tables** — click a column header to sort. Numeric columns sort by value, so 2 comes before 10. Merged headers map to the right data columns, bold sub-header rows stay pinned, and the header keeps its table alignment

### Editing

- **Double-click a section** to edit its text in place. Blur or `Ctrl`/`Cmd`+`Enter` saves, `Escape` cancels
- **Double-click a table cell** to edit just that cell — as a single-line field sitting over the cell, so the table never reflows while you type
- **Editing does not cost you the document.** The round-trip is a light markup dialect — `[text](url)`, `**bold**`, `*italic*`, and `- ` / `1. ` with two-space indentation per nesting level — so links, emphasis and nested lists survive. Data tables and images are held back from the textarea entirely and put back exactly where they were. Only `http`, `https`, `mailto` and relative link targets are allowed through
- **A heading keeps its id**, so the table of contents and the scroll-spy keep working after a reword. Reworded paragraphs are matched back to their original position, so editing one does not shift the blocks after it
- **Edits are session-only.** Nothing is written back to the uploaded file; upload it again to start fresh

### Export

- **Four formats** — `.docx`, `.md`, `.html`, and PDF via the print stylesheet
- **Exports what you see** — the reader's section order and any sorting you applied are carried into the output, and content below the fold is exported at full opacity rather than mid-fade
- **Tells you when the document has been changed** — the export control is marked once you reorder or re-sort, and editing counts too

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

Next.js 16 (App Router) · React 19 · TypeScript · framer-motion · mammoth ·
marked · DOMPurify · [docx](https://github.com/dolanmiu/docx) for writing
`.docx` exports. Tailwind-free, hand-written CSS with custom properties for
theming.

## Project structure

```
app/
  layout.tsx               Root layout, fonts, no-flash theme script
  page.tsx                 Upload + conversion
  globals.css              Design tokens and all styling
components/
  Viewer.tsx               Document view, section reordering, scroll-spy, editing
  TocNav.tsx               Accordion table of contents, draggable to reorder
  SectionEditor.tsx        Inline field for editing a section or a table cell
  TableSort.tsx            Click-to-sort wiring for table headers
  LinkPreview.tsx          External link hover cards
  ExportMenu.tsx           Download as .docx / .md / .html / PDF
  Background.tsx           Cursor-reactive parallax background
  ThemeToggle.tsx          Dark/light toggle
lib/
  sections.ts              Blocks, section grouping, per-document storage key
  sectionText.ts           Markup round-trip for editing a section's text
  sorttable.ts             Header mapping, numeric detection, sorting
  useDragSelectionGuard.ts Suppresses text selection during a drag
  exporter.ts              Reads the rendered document for export
  toc.ts                   Heading tree builder
global.d.ts                Ambient module declaration for mammoth
```

## Accessibility notes

Keyboard focus rings, semantic headings and table markup, and a
`prefers-reduced-motion` path are all in place, and the mobile layout collapses
the sidebar behind a **Contents** button. Drag handles are decorative and
marked `aria-hidden`: reordering is pointer-only for now, with the **Reset
order** control as the keyboard-reachable way to undo a rearrangement.

## Contributing

Issues and pull requests are welcome. Please run `npm run lint` and
`npm run build` before submitting.

## License

[MIT](./LICENSE)