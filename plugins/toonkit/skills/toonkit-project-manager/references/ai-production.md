# AI production — conditional workflow

Read for planning or executing AI generation, not deterministic previz. SSOT means [the bundled generation SSOT](../TOONKIT-GENERATION-SSOT.md). Paid confirmation, cost and inspection gates below remain in force.

## 0. Invariants — violations cost real credits and tokens

- **Learn everything the free tools can tell you before spending.** Balance and daily allowance (`get_credit_balance`), model specs (`list_models`), quotes (`estimate_credits`), canvas creation, node adding, and connecting are all zero-credit. Never enter a paid call ignorant of something these could have told you.
- The video catalog (`list_models` kind=video) is tens of KB. **Never load it whole into context** — extract only the needed axes of candidate models (pass `modelId` for single entries).
- `estimate_credits` before every generation. Verify the server's interpretation via the response's `resolvedOptions`. Set `maxCredits` 5–10% above the estimate: a charge above it is rejected, and the headroom absorbs price movement between quote and launch.
- **Billing and ops mechanics are not duplicated here.** Idempotency-key handling, retry-vs-recovery semantics, media-URL expiry, `NEEDS_ATTENTION` handling, budget semantics, and mutation queueing: follow SSOT sections G and I, plus the live generation guide. When any of those calls are about to be made, those sections are the rulebook.
- **Canvas manipulation is MCP-only.** Never drive a browser to arrange nodes, insert reference chips, or trigger generations. Pending MCP mutations are applied by the user's open Canvas tab (SSOT I-8): follow them with `get_canvas_mutation`, and when a receipt reports `blockedReason`, relay its `blockedHint` instead of forcing application through a browser. Browser automation is permitted only inside a dedicated co-distributed skill (e.g., `3dref`), strictly within that skill's own scope (the 3D previz editor), never for general canvas work.
- Poll sparingly — `get_generation` responses carry the full prompt back. Space out checks with generation times in mind (~1 min images, several minutes video).
- If generation is blocked on budget grounds, or an `INSUFFICIENT_SCOPE` rejection appears: budget caps are user-set in the web UI (MCP cannot change them — SSOT G-6); scope rejections are a client-side OAuth scope-configuration issue — guide the user to add the scope → restart the client → re-authenticate.
- `status: SUCCEEDED` means a file exists, not that the request was satisfied. Whether to pixel-read finished videos is decided by the inspection mode (§3) — but the visual inspection gate for image assets (§2) holds in every mode.

## 1. Pre-Production — planning

**Decompose the brief first.** Before planning, split the request into four buckets and keep them fixed for the rest of the run:

- **Goal**: finished production, style exploration, or capability verification? (A verification goal changes the rules: preserve the exact conditions being verified — do not split, re-time, or substitute the thing under test.)
- **Fixed requirements**: length, one-take, specified references, named characters, dictated style, aspect ratio — anything the user stated. These survive all later adjustments.
- **Delegated choices**: what the user explicitly left to you. Read delegation narrowly — "any character" delegates character design, not the style, references, or pipeline around it. Budget pressure never converts a fixed requirement into a delegated choice: dropping a core reference is a goal change, not a cost tweak — that goes back to the user.
- **Inspection & cost scope**: how many generations are sanctioned, and who checks what.

For video production without a user-specified workflow, use the sequence below, **preserving specific instructions and supplementing only missing detail**. Image-only or voice-only requests need only their relevant asset/job plan, not a story or scene breakdown:

1. **Secure the story** — what the whole video is about.
2. **Fix the scenario** — prose at script/treatment level from which the natural flow of events, concrete cut structure, and running time can be imagined by reading alone.
3. **Fix the length** — honor any stated length; otherwise fit it to the scenario.
4. **Scene composition** — each scene's events need sufficient plausibility, with duration allocated in proportion to a natural pace. Scene-to-scene links also need plausibility — but do not force continuity across deliberate jumps ("(a year later)", "(meanwhile,)").
5. **Asset plan** — every image asset needed to realize the full video.

**Select the generation route before reporting or quoting it.** A described art style is a requirement, not a model or preset selection. Preserve explicitly selected models, presets and usable references. For missing image assets, apply SSOT C-1/C-3/C-4 to compare materially suitable routes and recommend one with reasons. Decide asset purposes and quantities from the requested shots; do not default to two images, add sheets to a single-image request, or recreate supplied assets. When asset needs change, reassess affected choices and downstream quotes only; keep unchanged approvals. Resolve new style/preset choices as part of the same plan confirmation, using actual ToonXL samples as specified in C-4.

**Content-risk screening (before any paid call)**: check the brief against SSOT I-11 (real-person likeness, explicit content, real character IP via text or image reference). If failure risk is high, **warn the user in the plan report before spending**, propose lower-risk alternatives where feasible, and let the user decide. Never silently rewrite their creative intent.

**Inspection mode** — judged from the user's disposition/instructions:

- **User-inspects (default)**: the user reviews all output themselves. Treat every generation as a final result and plan for maximum single-shot quality. On your own judgment or on request, you may propose a cheap low-resolution preview pass to validate prompts before the final run.
- **AI-delegated**: only when the user has said tokens/time may be spent on self-inspection and repair loops.
- **Low-stakes one-shot**: quality and inspection don't matter; minimize cost, allocate nothing to review.

**Budget allocation**: weigh expected quality against remaining credits and daily allowance to fix image/video model tiers and resolutions at planning time. Both "spend on top-tier assets" and "validate cheap, then re-generate high-res" can be correct — state the rationale in the plan.

**Plan report → confirmation gate (also when planning was not requested)**: before paid work, present one concise table or paragraph covering the relevant items below. Group jobs with identical settings; a single image can use one row. A separate saved document is optional.

- **Deliverables and dependencies:** asset/job purpose and quantity, supplied assets to reuse, references and their roles, generation order; for video, the requested beats, duration, cuts/jobs and output aspect. State fixed user choices and remaining decisions.
- **Model decisions:** exact model name/variant, applicable style preset, resolution (or model-fixed size), and why each fits the request. Briefly compare materially suitable alternatives when the user has not selected/delegated the route; recommend rather than ask an open-ended model questionnaire. Explicit delegation permits choosing, not omitting the choice and rationale from the report.
- **Cost basis:** map quoted job counts and settings to the `estimate_credits` amounts, subtotals and total against balance, daily allowance and the user's budget. Show the inputs that affect the quote: model/preset, resolution, duration and references as applicable. Separate optional retries/previews from the requested run. Distinguish live quotes from provisional calculations and unquoted downstream work; references not yet produced cannot support an exact-reference quote. Never invent a measured total or quote with no references while presenting it as the reference-based job's price. Obtain the exact-input quote before each paid call (SSOT G-3).
- **Readiness:** identify pending choices, unavailable estimates and relevant content-risk warnings; explain deviations from SSOT recommendations (such as a required one-take beyond the recommended job length). Missing downstream facts do not prevent reporting the plan; mark affected work provisional instead of calling it execution-ready.

A plan is reported only when applicable items above are visible to the user; direction, resolution or image count alone is insufficient. For “plan first,” report these before any paid call; plan-only requests end here, and requested approval checkpoints must be honored. Otherwise obtain confirmation only for choices/spend not already authorized, bundling remaining decisions once. Reuse an unchanged approved plan; report and confirm only material changes outside its authorization. Immediately before generating, check that the intended job's model/options/references and quote match the disclosed, authorized scope; surface any missing decision or material change instead of silently substituting it.

## 2. Main Production — assets → video

1. **Apply the planned style** — honor the supplied style/reference and the preset choice resolved during planning. Do not introduce an undisclosed model or style change at execution. If style is unspecified, recommend it in the plan and obtain confirmation unless that choice was explicitly delegated; ToonXL remains subject to C-3/C-4.
2. **Secure assets (fixed order)**:
   - Reuse usable assets the user supplied or selected; ask about other existing assets only when the choice matters and was not delegated.
   - If the user uploaded images with the brief, use them via `create_upload` → `confirm_upload` (upload is images-only).
   - Produce whatever is still missing. Model/quality tier follows the budget allocation confirmed in §1; the crafting technique itself is delegated per the role boundary.
   - **Visual inspection gate (all modes, never skipped)**: download each generated asset and confirm with your own eyes that it matches the instruction before it enters video production. An error caught at the cheap image stage costs dozens of times more if caught at the video stage.
3. **(When warranted) 3D previz** — for jobs where reroll costs look high or exact camera-path fidelity decides the impact (e.g., flashy one-take camera moves), produce a previz video with the co-distributed [3dref](../../3dref/SKILL.md) skill and feed it as a video reference (first confirm the video model supports video references — SSOT/live spec). Do not create previz for every shot. If missing, optional previz can be skipped with disclosure; explicitly requested previz needs restoration of that capability, not silent substitution. Export before consuming the reference. Its deterministic stage does not reload the generation SSOT/catalogs. Validate video-reference acceptance through the actual generation contract/estimate, not merely get_media.
4. **Video generation** — plan scene-by-scene cut structure and job splitting systematically. Overloading one job with many concretely specified cuts lowers prompt efficiency and success rates; design so per-cut pacing reads naturally. Job-split criteria, prompt lengths, and other per-model judgment rules follow the SSOT.

**Parallel execution design**: unless the user ordered stage-by-stage confirmation, bottleneck-free parallelism is the default — finish all image assets → fix all jobs' cut structures and prompts → launch all video jobs in parallel. Jobs whose input depends on another job's output (result-dependent starts, end-frame chaining) are of course run sequentially (SSOT H).

## 3. Result inspection — the mode decides whether pixels get read

- **User-inspects (default): do not download/frame-extract/analyze finished videos.** Token-costing readings run **only when the user asks.** Deliver with job status (success/failure, billing) and the canvas link; inspection is the user's.
- AI-delegated: run the reading below; fix and re-generate only the failed portions.
- Low-stakes one-shot: skip.

Reading method (AI-delegated, or on user request): videos cannot be played, so frame extraction is the only reading tool. One ffmpeg contact sheet (`select`+`tile`) costs ~10× fewer tokens than loading many individual frames; check only ambiguous spots as full-resolution single frames. Check: do the requested events/ending exist in actual pixels; character/style consistency; unintended overlays; audio survival (volumedetect).

## 4. Post-Production — the canvas is the entire production record

- Record **all deliverables on the project canvas, including text artifacts.** Workflow order: full scenario (text node) → scene breakdown → per-scene [prompt text node → generation node → finished video], so that opening the canvas alone shows the whole production. The canvas is the record — not local files.
- Naming convention: cuts are `S{scene}-C{cut}` (`-v2` for versions); assets are `REF-{subject}`.
- **Work-slop sweep (mandatory before grouping)**: sweep the canvas for slop this run created — parked generation nodes that were never launched and are no longer part of the plan, empty/duplicate nodes left by aborted or interrupted attempts, orphaned test nodes. **Delete only that slop** (`toonkit_canvas_delete_nodes`). Never touch user-created content, completed generations, or anything you are not certain about — when in doubt, keep the node and list it in the report instead.
- **Group once at the end** (live generation guide, "Complete a Canvas request as a group"): after required generations and exports finish, call `toonkit_canvas_group_nodes` once with every node ID of this request — sources/intermediates, producers and final outputs, including previz export outputs — in the workflow order above, then follow `get_canvas_mutation`. The Canvas lays the group out by connections, using that order for ties. Existing groups cannot be regrouped, so group only after the sweep and final naming.
- After grouping, deliver the project canvas link. Intermediate sharing also defaults to the canvas link — load images into context only when inspection requires it (media URLs expire; never pin them as links).
- The completion report separates three things: **what was executed, what was verified, and what was not verified** (plus any approximations or open items).
