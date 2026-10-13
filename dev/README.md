# Dev-only pages

Pages for looking at the app while working on it. Vite serves anything under
the project, so with `npm run dev` running they open at
`http://localhost:5174/dev/<file>`. None of them is part of the build.

- `standing-gallery.html` draws every case of the standing note on Home
  (`src/dev/standingGallery.jsx`).
- `seed-sample-data.html` loads a believable sample ledger into the
  browser's own database, and takes it away again. It refuses to run over a
  real ledger.
- `local/` holds seed scripts and demo-data pages that stay on this machine.
  It's ignored by git on purpose.
- `qa/` holds the browser checks: scripts that drive Chrome through the app
  against a stand-in for Supabase. See `qa/README.md`.
