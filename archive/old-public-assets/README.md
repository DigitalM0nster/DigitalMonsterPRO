# Archived public assets

This directory contains files that had no literal runtime reference in `src/`
or `index.html` during the July 2026 performance cleanup.

They intentionally live outside `public/`, so Vite does not copy roughly
411 MB of source files, experiments, archives, and unused exports into every
production build. Preserve the original relative path below this directory if
an asset needs to be restored.

