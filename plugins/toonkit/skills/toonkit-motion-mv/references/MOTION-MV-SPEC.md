# Motion-MV production spec

Normative judgment rules for 2D anime motion-graphics videos that combine ToonKit character assets with code-rendered typography and shapes. Every rule is a requirement (**must**), a default, or a prohibition. Generation contracts, model ids and prices are not repeated here: the ToonKit generation SSOT and live catalogs govern them.

---

## 0. Principles

1. **Motion graphics lead.** Typography and shapes carry rhythm, information and most shots; the character appears inside that system. A long locked shot of a character standing before animated decoration is a stage backdrop and fails this spec.
2. **Crispness parity.** Every character frame on screen must be as clean as the vector layer around it. Generated in-betweens that smear are replaced, covered or avoided — never left exposed at full size.
3. **Sync by construction or by measurement.** Motion lands on the beat either because it was cut there (pose cuts, MG events) or because a measured plate event was retimed onto the beat. Prompted seconds are never trusted for sync.
4. **Credits buy character only.** MG renders locally for free; the budget is spent on reference sheets, poses and short plates.

---

## 1. Character source selection (per beat)

| Beat content | Source | Why |
|---|---|---|
| Fast action: spins, jumps, hair whips, impacts, dance hits | **Pose cut** (P): 2–6 still key poses cut on beats | Video plates smear fast motion; stills are frame-perfect and land exactly on beats |
| Decisive pose, reaction face, stinger, lyric hit | **Pose cut** (P) or a single held pose | Sharpest possible drawing; the MG does the motion |
| Smooth continuous acting: turning the head, blinking, breathing, hair and cloth sway, slow walk, gentle gestures | **Video plate** (C/M) | Continuous motion reads only as video |
| Fast action that must be continuous and cannot be cut | Video plate + **smear cover** (section 8-5), or split into pose cut + short plate | Smear frames must not be exposed |

A shot plan that puts a fast action on a video plate without a cover or split fails plan-check.

---

## 2. Pipeline (fixed order)

1. **Beat grid**: BPM, downbeats and sections converted to frames. With music, detect beats and cross-check them against manually tapped downbeats; never trust a detector's first BPM. With no music, fix a nominal BPM and still cut on its grid.
2. **Shot plan** (`PLAN.json`, section 3): each shot's frames in/out, type, focal element, text with its kinetic primitive, character source and action, transitions. It must pass `plan-check`.
3. **Element lifecycle**: every non-ambient element has enter → hold → exit with tokens (section 4).
4. **Asset plan and quote**: chroma reference sheet, pose stills, plates; live quotes; a single confirmation of spend.
5. **Reference sheet** (chroma background, section 7-1), then a visual gate.
6. **Poses and plates** in parallel (7-2, 7-3), each with a visual gate.
7. **Processing**: analyze plates → map actions to measured spans → key (plates and poses) with retime, rim and stroke → alpha video.
8. **Composition**: write `shots.json` → build → gates → one snapshot review at shot midpoints (section 12) → one batch of fixes → **one final render**. No draft renders.
9. **Record and report**: canvas record, then an executed / verified / unverified report.

Writing animation code straight from a brief, without steps 2–3, is prohibited.

---

## 3. Shot grammar

| Type | Content | Cost |
|---|---|---|
| **T** Type/Shape | kinetic typography and shapes only | 0 |
| **C** Character over MG | keyed plate or pose composited into MG layers | asset |
| **M** Character in mask | character visible only through a shape, letterform or frame device | reuses C assets |
| **P** Pose cut | 2+ key poses cut on beats, MG supplies the motion between them | stills |
| **X** Transition | shape wipe, iris, morph, match-cut on a primitive | 0 |

Rules:
- **Cut cadence**: 1–2 s per shot in high-energy sections, 2–4 s in calm ones. C/M shots may run to 5 s only if their MG layers change at least every 2 beats. Hard maximum 4 s for T/P/X shots.
- **Never more than 4 s** without a new typographic event.
- **One focal element per moment**: exactly one element owns the highest contrast and the most motion.
- Open and close on T or M, never on a bare C.
- Reuse assets. One plate or pose feeds several shots through re-crop, virtual camera and masks.
- Transitions use the video's shape primitives. Cross-dissolves only as a deliberate slow-section device.
- Cuts land on beats (±1 frame).

---

## 4. Motion tokens (the only allowed vocabulary)

| Token | Curve | Duration (24 fps) | Use |
|---|---|---|---|
| `enter` | `cubic-bezier(0, 0, 0, 1)` | 0.40–0.60 s, default 0.50 | appearing: type, shapes, stickers, masks opening, pose pops (short form 0.18–0.25 s allowed for pops) |
| `move` | `cubic-bezier(0.65, 0, 0.35, 1)` | 0.50–0.80 s, default 0.65 | repositioning, scaling, virtual camera, drift during holds |
| `exit` | `cubic-bezier(0.55, 0, 0.9, 0.45)` | 0.25–0.35 s, default 0.30 | leaving or collapsing |
| `slam` | declared overshoot accent | 0.40–0.50 s | at most one per beat: title slams, sticker hits |

- Stagger 40–80 ms (default 60) between siblings. Next enter overlaps the previous exit by 20–40%.
- Exits are shorter than enters.
- **Prohibited on primary elements**: linear easing, library-default eases and springs, infinite repeats, constant sine loops.
- **Ambient loops** only for background elements at reduced contrast, finite, under 30% of visible elements.
- **Beat alignment**: `enter` reads as a pop at its start, so starts go on beats. A `move` lands its end on a beat. An `exit` ends on the cut.
- Visible-state changes are authored as `set` + `to`. A `fromTo` is allowed only when the element is invisible before it starts, because a fromTo renders its start state early.

---

## 5. Typography

- At most 2 families: one display face, one supporting face (sub-lines, labels, non-Latin). Vendor fonts locally and load only the weights used.
- One hero line per moment. Sub-lines at 30–45% of hero size.
- Minimum sizes at 1080p: hero ≥ 96 px, secondary ≥ 36 px, labels ≥ 22 px.
- Readability holds: 1–2 word hits ≥ 0.25 s. Lines of 3+ words ≥ 0.3 s per word, fully settled.
- **Kinetic primitives**: mask reveal (char/word), slam, tracking collapse, split-wipe (text cut by a moving bar), stroke draw-on then fill, counter/ticker, text on path, in-place word replacement on beats, oversized crop type. Each shot with text uses at least one; a video uses at least four different ones. Fade-only text is prohibited.
- Type never covers the character's face. Keep a 5% title-safe margin unless it is deliberate crop type.

---

## 6. Shapes and style bridge

- Choose 3–5 primitives for the whole video and reuse them. They are also the transition system.
- MG outline weight matches the character's line weight at comp resolution. Fills come from the character palette.
- **Palette**: 4–6 colors from the reference sheet (base, shadow, accent, outline) plus at most 2 environment darks/lights.
- **Cadence mode** (one per video):
  - *Hand-drawn*: MG shapes animate with line boil (re-seed every 2–3 frames, 1–2 px at 1080p). Text glyphs at hero size stay un-boiled.
  - *Premium*: smooth MG, no boil.
- **Outline stroke** on keyed characters: default on for pose cuts and static/slow plate frames. Width 4–8 px at plate resolution, white (sticker) or palette ink. On smear-level frames it is attenuated automatically; never force a full stroke onto a smeared matte.
- **Rim light** on the matte edge, colored by the dominant MG light sources. Flashes hit both layers.
- **Shadows**: the MG layer owns contact shadows. Discard plate shadows, or keep them only as a neutral dark semi-transparent layer.
- **Character-driven MG**: bind MG reactions (impact rings, bursts, flashes, punch zooms) to measured plate events or pose-cut times.

---

## 7. Character asset production (ToonKit)

### 7-1. Reference sheet — always on chroma
- **Every character reference image is generated on a perfectly flat chroma background.** This covers sheets, pose stills and any character asset used as a reference. Default key color is pure green `#00FF00`. If the character design contains green, use magenta `#FF00FF`. Blue `#0000FF` only if both conflict.
- The design contains no colors near the key.
- Turnaround sheets use large panels: each full-body figure fills ≥ 85% of its panel height (small figures fall back to chibi proportions). State the head-to-body ratio.
- Visual gate before any downstream use: identity, proportions, palette, no key-adjacent colors, background flat.
- A style-locked canonical image (e.g. a LoRA style preset) may ignore the chroma instruction. It then serves only as the style reference: generate the turnaround sheets from it with an image model that honors the flat chroma, and use only the sheets downstream.
- Lime-leaning yellows and yellow-greens key out as partial transparency. Specify warm yellows (e.g. `#FFD447`) for hair and costume on green keys.
- Mirrored accessories (an accessory on opposite sides of two otherwise identical characters) are not reliably honored. Prefer symmetric designs or accept identical twins; symmetric designs also make flipped poses free.

### 7-2. Pose stills
- Image model with the reference sheet as the image reference. Use the tier with the strongest detail preservation for final poses.
- One pose per image, full character, on the same chroma color as the sheet, at the **same camera framing for every pose in a set** (state shot size, head-top % and feet % of frame height, horizontally centered, same aspect as the comp). Only then do pose cuts not jump.
- 2–6 poses per P shot. Each pose is a decisive silhouette (clear line of action), not an in-between. A horizontal flip of a symmetric-design pose counts as a second pose (a side-to-side snap on every beat) at no image cost.
- Visual gate per pose: identity vs the sheet, outfit completeness, framing match with the set, flat background. Regenerate a failing pose, not the set.

### 7-3. Video plates
- **Model**: the 2D cel-anime Seedance variant (built-in on-threes timing and cel directives) is the default for cel-styled characters. Use another model only on the user's explicit instruction.
- **Resolution**: 720p final plates, with an optional 480p preview first. **1080p generation is excluded by default.** Smear is drawn by the model, and resolution does not remove it; the comp renders vector layers at 1080p. Generate 1080p only when the user explicitly insists after being told this.
- **Length**: plates cover only smooth-motion beats. Prefer 4–8 s plates reused across shots over one long plate.
- **Prompt requirements** (see PROMPTS.md): flat chroma background with a full prohibition list, locked camera, framing with head-room, second-by-second action windows with one smooth action per window, the anti-smear block (no motion blur, no smear frames, no ghosting, crisp line art every frame, hair and cloth as solid shapes), style restatement, and reference roles by @-mention.

### 7-4. Measured behavior (plan for it)
- The key color comes out as a different but flat chroma (per-channel std ≈ 1). **Sample the background from the frame border**; never key the requested hex.
- Contact shadows may appear despite prohibition. The keyer drops them, or keeps them as a neutral layer on request.
- Action windows are honored in order but drift by up to about ±1 s; static holds tend to run long.
- Duplicate frames (holds) occur almost only in static poses. **Fast actions are drawn on ones, with smeared in-betweens**: interior sharpness falls 60–75% below the same shot's static median. Picking the sharpest frame per window recovers only about 13%, because consecutive in-betweens are all smeared.
- **Smooth-action plates prompted with the anti-smear block measured zero smear frames** (three plates: slow facial acting, a gentle two-character sway with claps, a medium-tempo dance loop). Smear is avoided by the choice of action plus the block; the block does not rescue fast actions.
- Details under ~1% of the frame (catchlight shapes, tiny emblems) are unreliable. Patch them in compositing during measured static holds, or drop them.

---

## 8. Processing

### 8-1. Analyze
Per frame: matte bbox, centroid, lowest point, area, matte motion energy (mean |Δalpha|), interior pixel difference (duplicate detection), interior sharpness (Laplacian variance on the eroded matte). Derived:
- static and action spans
- the static reference sharpness
- smear frames (sharpness below 50% of that reference)
- smear cover windows
- takeoff and landing (only when feet are in frame)
- background flatness

### 8-2. Map actions to measured spans
Match each prompted action to its measured action span in order. Record the mapping in the plan. MG events bind to measured frames, never to prompted seconds.

### 8-3. Retime onto the grid
Anchor measured event frames to their target beat frames and remap by nearest source frame (no blending, no reversal). Holds make this safe. Keep speed changes within 0.75–1.35× per segment. Beyond that, re-plan the beat, pose-cut it, or regenerate.
- **Cyclic motion** (sways, bounces): measure the extrema of the band centroid. Pick the beats-per-swing that keeps speed within limits, usually half-time, i.e. one swing per 2 beats. Retime the extrema onto that period. When reusing the plate, snap each use's media start onto an extremum so the cycle lands on the shot's beats. The per-beat snap itself comes from flipped pose cuts.

### 8-4. Key
- **Alpha from chroma dominance**: green `G − max(R,B)`, blue `B − max(R,G)`, magenta `min(R,B) − G`, with a soft ramp (default 8 → 50).
- **Despill**: clamp the dominant channel(s).
- **Matte anti-aliasing**: Gaussian σ≈0.9, then re-tighten.
- **Optional directional rim, adaptive outline stroke** (attenuated by per-frame sharpness), **and neutral shadow layer.**
- **Output**: VP9 alpha video for plates, RGBA PNG for poses.

### 8-5. Smear policy
Any exposed frame below 50% of the static reference sharpness must be, in order of preference:
- replaced by a pose cut,
- covered by an MG device for its measured window (speed lines, flash, shape wipe, match-cut), or
- reduced below 40% of frame height and moving behind a foreground element.

---

## 9. Composition and output

- **Engine**: a timeline-authored HTML composition rendered deterministically by HyperFrames, with GSAP for choreography. Pin both versions per project. Authoring contract: COMPOSITION.md.
- **Comp resolution** ≥ 1920×1080; plates and poses scale into it. Vector and type layers are the sharpest elements on screen.
- **Post budget**:
  - no global blur
  - grain ≤ 5% opacity
  - chromatic aberration only on hit frames (≤ 8 frames, ≤ 6 px)
  - vignette ≤ 35% corner darkening
  - blur only on elements meant to be soft (light shapes, far bokeh)
- **Virtual camera**: push, punch and shake on the composite stack, scaled by layer depth for parallax. Moves use `move`, punches land on beats or events, shake decays within 8 frames. Plates never contain camera motion.
- **Determinism**: every value is a pure function of timeline time. Seeded randomness only. No wall-clock time, no network fetches during render, no CSS transitions or animations.
- **Encoding**: H.264 delivery at CRF 16–18. With a file-size cap, set `video_kbps = cap_MB × 8192 / seconds − audio_kbps`, with 5% headroom.

---

## 10. Anti-patterns (automatic fail)

- A single locked character shot with decorative loops as the main content; persistent HUD/UI chrome as the main motion source.
- Linear, default or undeclared eases on primary elements; infinite repeats; ambient loops above 30% of elements.
- More than 4 s between type events; fade-only hero text.
- Exposed smear frames at full size; a fast action on a plate with no cover or split.
- MG sync hard-coded to prompted seconds; keying on the requested hex; a hard matte without anti-aliasing.
- Heavy global post that makes type edges softer than the character.
- Reference character images on non-chroma backgrounds; 1080p plates without the user's explicit insistence.

---

## 11. Budget model

- Credits scale with character assets only:
  - 1 chroma sheet
  - N pose stills
  - M plates × seconds at 720p (plus optional 480p previews)
- Quote every item live before the confirmation. Present MG-only shots as zero-credit.
- For a given budget, prefer more pose stills and shorter plates. Pose stills cost a fraction of plate seconds and remove smear by construction.

---

## 12. Review checklist (one pass, then one render)

Budget: static gates are free and run on every build. Visual review is one set of snapshot contact sheets (frame 0, every shot midpoint, the last frame) after the runtime validation passes. Fix everything found in one batch; re-snapshot only if layout changed. Render the final once. After the render, check metadata (duration, frames, audio) and frame 0 only; re-render only for a render-only defect. Never review with per-second contact sheets of a full render, and never cycle render → review → render.

1. `plan-check` passes: cadence, 4 s type rule, focal element per shot, primitives, open/close, fast actions not on bare plates.
2. `lint` passes: token eases only, no infinite repeats or randomness, timeline registered, tokens initialized.
3. **Snapshot sheets** (frame 0, shot midpoints, last frame) plus full-resolution crops only where a sheet is ambiguous. Check:
   - one focal element
   - no type over the face
   - pose framing consistent across each P set
   - no green fringe or stair-stepping at matte edges
4. **Smear audit**: every analyzed smear window is covered, replaced or reduced in the final timeline.
5. **Sync audit**: cuts and enter starts on beats (±1 frame); MG reactions on measured event frames.
6. **Fidelity and output**: comp ≥ 1080p, post budget respected, duration/fps/resolution as planned, file size under any cap.

---

## 13. Open items (unverified)

- Plates with real camera motion (matching MG to a moving plate) — avoided by rule 7-3.
- Multi-character plates (separate mattes per character).
- Efficacy of the anti-smear prompt block on genuinely fast motion (verified only for smooth and medium-tempo actions).
- Choreography fidelity against a reference video the agent cannot watch: judged by the user.
- Upscaling 720p plates for 4K comps.
