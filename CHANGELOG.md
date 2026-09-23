# Changelog

## 0.1.0 — Unreleased

- `toonkit-project-manager` skill for planning, credit gates, AI generation and canvas delivery,
  replacing the initial `toonkit-generation` skill. Bundled guidance carries judgment rules only;
  model specs, prices and styles are read live.
- `3dref` skill for deterministic 3D previz, with a Codex runtime and a step-helper route
  (`scripts/direct.py`) for Claude Code.
- Production MCP endpoint without a fixed OAuth client ID; clients identify themselves via CIMD.
- Local marketplace catalogs for both clients.
- English-first README with a separate Korean translation.
- MIT license for the plugin package.
