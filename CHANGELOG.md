# Changelog

## 0.2.2 — 2026-09-24

- Make the existing AI plan report explicit before paid generation even without
  a planning request: asset purposes/counts, exact models/settings and selection
  reasons, reference dependencies, quote inputs and cost status.
- Distinguish exact live quotes from provisional downstream costs. Preserve
  user choices and prior approvals; honor plan-only and approval checkpoints.
- Align image-route guidance: compare suitable ToonXL-to-GPT and direct GPT
  routes, show existing ToonXL samples, and avoid unrequested concept/sheet passes.
  Missing samples or later quotes affect only their dependent work.
- Scope reports to the request and reassess only changed assets. No changes to
  3dref, MCP/authentication, marketplaces, tool contracts or runtime code.

## 0.2.1 — 2026-09-24

- Restore the native MCP route for simple presets, existing-scene edits, catalog
  geometry/animals and existing uploaded assets. Compiler scope no longer limits
  the plugin; basic operations do not require Node/three/FBX setup.
- Treat renderer bundle filenames as maintenance provenance, not an execution
  gate. Preserve calibrated pivots, wall-roll, finite contact and shared slowmo.
- Recover Export readiness failures with durable confirmed-no-click evidence,
  while retaining duplicate-click protection for uncertain outcomes. Add a
  launcher/browser integration test for the complete recovery flow.
- Revalidate saved state on resume and check revision before browser handoff;
  compare primitive identity and exposed timing, and report missing readback.
- Count body animation when detecting holds; default hold observations are
  advisory and explicit shot limits remain enforced. Check camera movement
  segments for proxy collisions.
- Preserve AI production guidance, OAuth/MCP configuration, marketplace paths
  and host invocation conventions. Both host manifests carry the patch version.

Existing compiled runs retain their original runtime for recovery; start new
production with this version. No account migration is required.

## 0.2.0 — 2026-09-24

- Replace the one-actor compiler with `3dref-production-v2` and a single
  `3dref-run-v4` bridge for capacity-bound actor counts and existing/new canvases.
- Build only shot-relevant proxies. Resolve actual primitive pivots and finite
  support faces; validate full actor timelines, transfer/flight intent, wall-roll
  orientation, retimed source/root motion, framing, holds and collisions.
- Validate reduced keys against the profiled renderer; share pinned source bakes,
  compact diagnostics and dependency caches instead of model-written frame arrays.
- Preserve request journals, revision barriers, recovery, complete saved readback
  and one Export ticket. Match the source-linked output and decoded metadata;
  exclude the 3D node preview. Native Claude browser handoff uses the same bridge.
- Route deterministic previz without AI guides/quotes; preserve paid AI guidance,
  explicit invocation policy, MCP endpoint and both marketplace identities.
- Add reusable offline tests outside the installed skills, synchronized manifest
  versions, release checks, CI and reproducible archives with SHA256 manifests.

Migration: v1 input and old compiled runs are not converted in place. Complete or
recover an old run with its original plugin version. Use a new run directory and
v2 spec for 0.2.0; existing canvas nodes are preserved. The pre-1.0 minor bump marks
this incompatible input/runtime change. No plugin installation or account migration
is performed by repository scripts.

## 0.1.0 — Initial repository baseline

- `toonkit-project-manager` skill for planning, credit gates, AI generation and canvas delivery,
  replacing the initial `toonkit-generation` skill. Bundled guidance carries judgment rules only;
  model specs, prices and styles are read live.
- `3dref` skill for deterministic 3D previz, with a Codex runtime and a step-helper route
  (`scripts/direct.py`) for Claude Code.
- Production MCP endpoint without a fixed OAuth client ID; clients identify themselves via CIMD.
- Local marketplace catalogs for both clients.
- English-first README with a separate Korean translation.
- MIT license for the plugin package.
