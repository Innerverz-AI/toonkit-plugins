---
name: toonkit-motion-mv
description: 2D anime motion-graphics video production with ToonKit — kinetic typography and shapes composited with ToonKit-generated 2D anime characters, rendered locally with HyperFrames + GSAP. Use only when this skill is invoked explicitly, when the user explicitly asks for a 2D anime motion-graphics video made with ToonKit, or when toonkit-project-manager hands over a 2D anime motion-graphics video request. Not for ordinary image, clip or voice generation (toonkit-project-manager).
metadata:
  short-description: 2D anime motion-graphics videos with ToonKit characters
---

# ToonKit Motion-MV

Produce a finished MP4 in which **typography and shapes lead** and a ToonKit character performs inside them. Norms: [spec](references/MOTION-MV-SPEC.md). Prompts: [PROMPTS](references/PROMPTS.md). Composition contract, `shots.json` schema and tool commands: [COMPOSITION](references/COMPOSITION.md). Read the spec once per run, before planning.

**Paid generation** follows the co-distributed [AI production workflow](../toonkit-project-manager/references/ai-production.md) and [generation SSOT](../toonkit-project-manager/TOONKIT-GENERATION-SSOT.md): live catalog entries, live quotes, one plan report, confirmation of unauthorized spend, idempotency and recovery. This skill decides *what* to generate; those documents govern *how* it is bought.

## Hard rules

1. **Every character reference image is generated on a flat chroma background** (sheets, pose stills, any character asset used as a reference). Default `#00FF00`; magenta if the design contains green. A style-locked canonical image that ignores chroma is used only as the style reference for chroma sheets.
2. **Fast or impact beats are pose cuts. Smooth continuous acting is a video plate.** A fast action on a plate needs a measured smear cover or a split.
3. **Plates use the 2D cel-anime Seedance variant** with the anti-smear block from PROMPTS, for cel-styled characters. Another model only on explicit user instruction.
4. **No 1080p generation by default.** 720p plates (optional 480p preview). 1080p only if the user insists after being told that smear is drawn by the model and resolution does not remove it.
5. **Motion tokens only**: `enter` / `move` / `exit`, plus one `slam` accent per beat.
6. **Sync is measured**: lyric lines are snapped to vocal onsets and beats; MG events bind to analyzed plate frames or pose-cut times, never to prompted seconds.
7. **Composite at ≥ 1920×1080**; plates and poses scale into it.

## Prerequisites (check before planning spend)

Run `node scripts/mvkit.mjs doctor`. It needs Node 20+ and ffmpeg/ffprobe with libvpx-vp9. HyperFrames rendering needs Node 22+ and runs through `npx` inside the scaffolded project; the first scaffold needs network access for npm. If a requirement is missing, report it and stop before any paid call.

## Workflow

### 1. Brief
Decompose into goal, fixed requirements, delegated choices, and inspection/cost scope (AI-production §1). MV specifics:
- music (file and cut length), duration, aspect
- character count and designs, art style
- asset caps (images, video seconds)
- **all on-screen copy** (lyrics, titles, logo text). Copy is the user's; propose it only when delegated.

Screen content risk before spending (real people; existing character IP by name or reference; commercial music — warn that publishing may trigger copyright claims).

### 2. Music map and shot data (free)
1. `mvkit scaffold` the project. Put the trimmed audio in `audio/`.
2. **Beat grid**: `npx hyperframes beats` (gives the BPM), then `mvkit grid <audio> --bpm N --bars` (gives phase and per-bar structure).
3. **Lyrics**: `npx hyperframes init <tmp> -a <audio> --language <lang>` produces a whisper transcript. Read it with `mvkit transcript`. Map the user's lines to it, then `mvkit snap --audio <audio>` snaps them to vocal onsets and beats. Regularize lines to the phrase grid (lines usually start every 4 or 8 beats) where the transcript is uncertain.
4. Write **`shots.json`** (COMPOSITION §6) with spec §3 shot types. Choose pose cut vs plate per beat with spec §1; every text event names its kinetic primitive. Run `node scripts/shotkit.mjs <project>` then `mvkit plan-check` until the plan passes. Plan-check is free — iterate here, not in renders.

### 3. Asset plan, quotes, confirmation
List every paid item:
- canonical design images (if a style preset is required)
- 1 chroma sheet per character
- pose stills (one per pose; flips of symmetric designs are free second poses)
- plates with seconds at 720p

Quote them live with the exact references, present one plan report (shot table, models and reasons, subtotals, zero-credit MG), and confirm once.

### 4. Reference images → gate
Canonical images, then chroma sheets (PROMPTS §1). Gate each **batch** with one side-by-side image you inspect yourself: identity, proportions, flat chroma, no key-adjacent colors (lime yellows key out). Regenerate only failures.

### 5. Poses and plates (one parallel launch)
Launch all pose stills (PROMPTS §2, the sheets as references, one shared framing block per set) and all plates (PROMPTS §3, smooth actions only) in the same turn.

### 6. Processing (free)
- Batch-download results in one shell call.
- Key all poses in one loop: `mvkit key … --stroke 9 --fit 1920x1080`.
- `mvkit analyze` each plate and read only the summary. Check smear frames, spans and background flatness.
- For cyclic motion (sways, bounces), `mvkit cycle` emits the retime map and phase, keeping playback speed within 0.75–1.35×. Re-analyze with the same map, then key plates with `--stroke-adaptive` and rim colors.
- Every smear window gets a pose-cut replacement, an MG cover or a size reduction (spec 8-5).

### 7. Composition, review, render — budgeted
1. `node scripts/shotkit.mjs <project>`, then gates in **one** shell call: `mvkit plan-check`, `mvkit lint`, `npx hyperframes lint` (0 errors).
2. `mvkit review <project>`. It runs the runtime validation (JS errors fail fast), then snapshots frame 0, every shot midpoint and the last frame into contact sheets. **Inspect those sheets once.** Fix everything found in **one batch**, and re-run `review` only if the fixes changed layout.
3. **One final render**: `npx hyperframes render -f 24 -q delivery`. Verify it with metadata only (duration, frame count, audio stream) plus frame 0. Render again only for a defect found in the render itself.
4. With a size cap, `mvkit bitrate` → two-pass re-encode of the final file (no re-render).

### 8. Canvas record and delivery
The final MP4 cannot be uploaded over MCP (images only), so it stays local. On the project canvas:
- keep all asset nodes (`REF-*`, `POSE-*`, `PLATE-*`)
- add 1–3 poster frames as media nodes when uploads are allowed
- add a text node with the shot summary, credits, measured results and the render path

Group once (AI-production §4).

Report three lists:
- **Executed**: jobs, credits, files.
- **Verified**: gates, smear audit, review sheets.
- **Unverified**: motion feel and taste, anything not measured, and reference media you could not watch.

## Execution economy (hard limits)

| Item | Budget |
|---|---|
| Full renders | 1 final (+1 only for a render-only defect). No draft renders; `review` snapshots replace them |
| Visual reviews | one image per asset batch; one `review` pass (+1 after layout fixes); no per-second contact sheets |
| Generation polling | wait in the background for the expected duration (image batch ≈ 2–6 min, plates ≈ 8–15 min), then check **all** pending jobs in one message. `get_generation` echoes the full prompt, so never poll one job repeatedly |
| Shell calls | batch downloads, keying loops and gates into single calls; print summaries, never full analysis JSON |
| Authoring | write `shots.json` data, not composition code. Custom code only for a kind shotkit lacks, and then add it to the project runtime rather than hand-writing HTML |

Hosts that can call MCP tools from code may run polling and downloads inside a script instead of model turns; the budgets above still apply.
