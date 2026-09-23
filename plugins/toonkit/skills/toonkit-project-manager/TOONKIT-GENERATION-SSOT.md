# ToonKit Generation SSOT

**Nature of this document**: Judgment guidance for actual AI image/video/voice generation through ToonKit MCP. Read once before the AI stage; reuse unchanged guidance through that run. Deterministic 3D previz authoring and browser-runtime export use the 3dref skill and do not require this document. The reader is an agent, not a human. Rules are environment-independent, not a tutorial or repository of session-specific trial and error.

**Scope**: judgment rules only. Model ids, specs, prices, style lists and scope availability are dynamic — read them from the surface's `list_models`, `estimate_credits` and the connection itself, never from this document. Rules were reconciled with the live generation guide and service code on 2026-09-23.

**Authority structure (3 axes)**:

1. **Product semantics and usage judgment** (when to use what, model character, selection conditions): this document (distilled from the service owner's product briefing).
2. **Numeric specs** (prices, resolutions, durations, caps): live API readings — `list_models` / `estimate_credits`.
3. **Input grammar, request/response contracts, error semantics, and budget semantics**: the live generation guide — `toonkit_get_generation_guide` (free, read once per session before generating).

Where a live source contradicts this document, the live source wins: use the live value and tell the user this document is stale.

---

## A. Choosing a workflow

ToonKit has three generation workflows. The entry point depends on the nature of the request.

| Workflow | Character | Fits |
|---|---|---|
| **Playground** | Specialized for a single image / a single one-clip video | One-off clips where story does not matter; tool/model quality tests |
| **Canvas** | Many asset productions + many video generation jobs wired together as a node graph | Productions of 1 minute or longer; character/style consistency needed across multiple scenes |
| **Storyboard** | Scenario description → a built-in agent sequentially automates synopsis refinement, scene building, cut breakdown, and asset generation. Aimed at animation-native / beginner creators | A user unfamiliar with AI workflows who only throws in a rough story. **Not exposed over MCP** — the feature itself, not a scope |

**Scopes are per connection.** Playground needs `playground:generate`; Canvas needs `canvas:read/write/generate`. A connection may lack one, so verify yours with free calls (or by reading the scope error on rejection) before ruling a surface in or out.

Judgment rules:

- Request is "just one clip, no story" or "check this model's quality" → Playground. If this connection lacks the Playground scope, substitute one canvas with a single generation node and **explicitly tell the user that Playground could not be used**.
- Request is "1 minute or longer", "multiple scenes", "character/background consistency across many cuts" → enter via Canvas. The default is to build image assets first (character sheets / background sheets, etc.) before video generation and use them as references.
- Storyboard-type request ("here's a synopsis, break it into cuts automatically") → the Storyboard workflow is the right answer but is absent from MCP, so hand-compose the equivalent pipeline on Canvas (scenario cleanup → scene breakdown → asset generation → per-cut video generation) and tell the user this is a substitute path.
- To generate video via R2V on Playground, unless it is T2V or the user directly uploads reference images, **the reference images themselves must also be made in Playground** — there is no separate asset-node structure like Canvas.
- Playground and Canvas expose **different model id sets.** An id fetched on one surface is rejected on the other. Always use only ids fetched via `list_models` of the surface you will actually call.

---

## B. Video generation

### B-1. Model overview and character

| Model id | Display name | Character (owner judgment) | Use first when | Avoid when |
|---|---|---|---|---|
| `WAN_3_0` | Wan 3.0 | Least NSFW censorship. Cheap | Censorship-sensitive subject matter; lowest-cost priority | Faithful reproduction of one fixed style matters (it is a generalist model) |
| `KLING_3_0_OMNI` | Kling 3.0-Omni | Strong at static scenes. Good when using Start/End frames | Static compositions; scenes whose start/end frames are explicitly specified | Ordinary dynamic action that does not need sub-3-second clips (other models are more flexible) |
| `MINIMAX_H3_MAX` | MiniMax H3 Max | Cheaper than Seedance. Voice rendering on par with Seedance 2.5 | Dialogue/voice matters but cost must stay down | Video/audio references are needed (it supports 0 video and 0 audio references) |
| `SEEDANCE_2_0` / `SEEDANCE_2_0_FAST` / `SEEDANCE_2_0_MINI` | Seedance 2.0 / 2.0 Fast / 2.0 Mini | The service's standard lineup. Fast/Mini are low-cost/speed variants | Standard R2V/T2V generation; downgrade to Fast/Mini under budget pressure | A 480p preview is needed (this family has no 480p option at all) |
| `SEEDANCE_2_5` | Seedance 2.5 | Current top R2V performance; the most popular but the most expensive option | Final commercial output; R2V quality is the top priority | Tight-budget bulk testing (highest unit price) |
| `SEEDANCE_2_5_ANIME` | Seedance 2.5 - 2D Cel Anime | Dedicated option for hand-drawn 2D cel animation visuals. Detailed rules in B-3 | The 2D cel anime look is the core of the request | 3D animation (results actually get worse); the user already specified another style |

This is the Canvas lineup. Playground exposes additional models (other Kling, Wan and Veo versions); read its catalog. Start/End (first/last) frame inputs are Playground-only over MCP — Canvas MCP launches T2V and R2V only.

### B-2. Mode/spec judgment (specs are live)

Each catalog entry's `specByMode` lists, per mode (TEXT_TO_VIDEO, REFERENCE_TO_VIDEO, …): durations, resolutions, aspect ratios, reference caps per media kind, reference clip limits, `referenceRequired`, `audioOnlyRefAllowed`, audio flags, `maxPromptLength`, `recommendedPromptWords` and prices. A model with no entry for a mode does not have that mode at all. Fetch only candidate entries (`modelId`).

Judgment rules (mode/spec based):

- Models with `referenceRequired=true` cannot be called without references at all. For every other model, references are optional even in R2V mode — do not generalize "R2V mode = references required".
- The low-cost preview strategy (section G) only works on a model whose resolutions include a tier below the final one (for example 480p). Check before planning a preview pass.
- For 4k or audio-only R2V, filter candidates by their resolutions and `audioOnlyRefAllowed`; few models support either.
- **There is no global minimum duration.** Each model's `durations` array is the only authority; minimums differ per model. Never generalize "under N seconds is impossible" across models.
- **Modes are server-derived from your inputs — you never pass a mode.** References → R2V; first+last frame → interpolation; first frame only → I2V; none → T2V (or R2V for models with no T2V). **Frame inputs (first/last frame) are mutually exclusive with omni-references**, and a last frame without a first frame is rejected at estimate time. Frame inputs exist only on Playground over MCP. (Contract per the live generation guide — authority axis 3.)

### B-3. Seedance 2.5 - 2D Cel Anime (`SEEDANCE_2_5_ANIME`) — separate rules

This is a ToonKit-exclusive option designed to maximize the look of hand-drawn 2D cel animation. It bakes in the on-threes frame-timing technique used by Japanese animation studios and applies negatives against "things that break the 2D-animation feel" (gradient shading, overly smooth motion). Two-tone cel shading, clean digital line art, and flat color fills are reflected. (Per the live guide, the mechanism is a built-in 2D-cel-anime style directive prepended server-side; same provider model and price as Seedance 2.5.)

**Anti-abuse rules (mandatory)**:

1. Do **not** always pick this option just because the request says "make 2D animation".
2. **For 3D animation this model actively makes results worse** — always avoid it for 3D requests.
3. When the core of the request is preserving a "2D cel feel" (American cartoon look, Japanese anime feel, etc.), consider it **first**.
4. **When the user requested generation without specifying an art style**: recommend this model first — including matching the reference images' art style to it — and **proceed only after user confirmation.** Never lock it in unilaterally and generate.

This model supports `REFERENCE_TO_VIDEO` only (no T2V mode). Per the live guide it is the same provider model and price as SEEDANCE_2_5; the only difference is the cel-anime rendering pipeline. Read its specs from the catalog entry.

Matching the reference art style to this model matters — if the image references are semi-real/3D-leaning, the video model "translates" the style and the character deforms. Among ToonXL styles (when present in the live `stylesByMode`), `ANIME_V21` (Cel anime) is the directly corresponding look for this video model; it has cel shading and is the first choice for action/fight scenes. `ANIME_V22` (Semi-Realism) and `ANIME_V31~V33` (3D family) styles clash with this video model — avoid them.

### B-4. Aspect ratio / resolution judgment rules (video)

- Unless the user explicitly specifies 1:1 or 9:16, **16:9 cinematic is the default.**
- Consider 1:1/9:16 only when the target is reels / specific SNS uploads.
- **480p**: acceptable for low-res SNS uploads. Used for the pattern of validating a prompt cheaply first, then re-generating at 720p+ once satisfied (section G). Keeping the 480p original and upscaling with Topaz is another route, but **Topaz upscaling is currently unreleased** (section J).
- **720p**: the most common resolution. Much commercial output is produced at 720p and later upscaled via Topaz (release pending).
- **1080p**: a native 1080p original is nice but costly — going straight to 1080p is rare. Consider it only when the budget was estimated generously.

### B-5. Video/prompt length judgment rules

- The Seedance 2.5 family supports single generations up to 30 seconds, but **the recommended single-job length is 15–18 seconds.** Pushing a full 30 seconds into one job makes the prompt excessively long, and if quality drops the structure only burns cost.
- Exceeding the recommended range is a deliberate exception, not a default: it must carry an explicit reason (e.g., a mandatory 30-second one-take where continuity outweighs the quality/cost risk, or a previz-adherence verification that must preserve the full uncut timeline), and it rides the manager skill's plan-report confirmation gate with that reason stated.
- A catalog `maxPromptLength` is a hard cap; where it is null, the model's `recommendedPromptWords` is the practical target (section F). Overly long prompts measurably drop instructions.

### B-6. Price comparison

Compare candidates with the prices in their catalog `specByMode` (resolution × duration) rather than memorized numbers. For budget-tight bulk drafts, check the cheaper tiers (Kling, Wan, Seedance 2.0 Mini/Fast) first, then confirm with the catalog.

**Price authority**: the number you commit to (and report to the user at the confirmation gate) is always the mandatory live `estimate_credits` quote (G-3).

---

## C. Image generation

### C-1. Family characters and selection rules

| Family | Representative model ids | Character | Use first when |
|---|---|---|---|
| **GPT family** | `GPT_IMAGE_2`, `GPT_IMAGE_2_5_FLARE`, `GPT_IMAGE_2_5_SUNBURST`, `GPT_IMAGE_1_5` | Most popular. **Best text alignment**, excellent reference adherence | Drafts and detailed scene construction; when reference adherence matters. **Without an explicit art style it defaults to a bland Ghibli-ish look — always specify the style** |
| **Nano Banana family** | `NANO_BANANA_2`, `NANO_BANANA_2_LITE`, `NANO_BANANA_PRO`, `NANO_BANANA` | **Clean, soft images** rather than extreme detail | The user specifically asked for Nano Banana, or a soft tone is needed. Non-Pro legacy tiers **only when cost minimization is requested** |
| **Seedream family** | `SEEDREAM_5_PRO`, `SEEDREAM_5_LITE` | **Strong color/style expression** | Punchy colors; images where style must stand out |
| **ToonXL** | `toonxl` | In-house-trained LoRA; locked-in style, among the lowest prices, single-asset specialist | See C-3 (separate critical rules) |

GPT family detail (the two 2.5 variants):

- `GPT_IMAGE_2_5_FLARE`: speed/efficiency focus, **optimized for repeated passes.**
- `GPT_IMAGE_2_5_SUNBURST`: slower, but **superior detailed rendering and element preservation.** Effective for high-quality drafts and quality-critical work like character/location sheets.
- When the agent chooses a model on its own, prefer **writing a highly specific prompt and finishing in one Sunburst shot** over generating many cheap drafts and spending tokens on verification.
- Legacy versions like `GPT_IMAGE_2` (2.0) or `GPT_IMAGE_1_5`: unless the user/agent explicitly targets cost savings, **default to the latest (2.5 family).**

### C-2. Image model specs (read live)

0 references → `TEXT_TO_IMAGE`; 1 or more → `IMAGE_TO_IMAGE`. **The mode switches automatically** — it cannot be specified directly. Aspect ratios, reference caps, prompt caps, resolutions and prices differ per model and per mode; read them from the candidates' `specByMode`.

Supplementary rules:

- `toonxl` **requires** a `styleId` from its `stylesByMode`. Passing `styleId` to any other model is rejected (STYLE models reject a missing style; non-STYLE models reject a present one).
- Always check the estimate response's `resolvedOptions` to verify how your inputs were interpreted (for example the path `toonxl` resolved to).
- When many reference images or 4K output are needed, filter candidates by their reference caps and resolutions; caps differ widely between families.

### C-3. ToonXL — identity and usage rules (critical)

ToonXL is ToonKit's in-house-trained **LoRA-family model**. It was trained on an animation-specialized Krea 2 baseline, with curated datasets of 40–100 images per style of one consistent style/character/background/prop set.

**Limitations (mandatory awareness)**:

- **Scene generation is weak.** Due to Krea 2 characteristics, its text-alignment ability cannot cover scene plausibility. It specializes in **producing single image assets in a controlled style** — not natural scene composition, nor complex composites like character sheets/background sheets.
- ToonXL styles are service-curated presets served live in `stylesByMode` (ids such as `ANIME_V21`); style names are only rough descriptions or mood labels.

**Input contract (live-verified 2026-09-18; error semantics = authority axis 3)**:

- The two modes take exactly one input each: **T2I = a prompt and NO reference; I2I = exactly ONE reference image and NO prompt.**
- Supplying both is rejected (`TOONXL_INPUT_EXCLUSIVE`); supplying neither is rejected (`TOONXL_INPUT_REQUIRED`). Estimate and launch enforce the same rule, so violations surface before spending. (The ToonKit app likewise refuses to wire a text node and an image node into the same toonxl generation node.)
- In I2I the style checkpoint carries its own prompt — **your prompt is ignored; omit the field.** In T2I the user's prompt is the only source of content (it is expanded server-side before dispatch).
- The mode is server-derived from whether a reference is present; you cannot pass it. Only preset styles are accepted over MCP (user-trained LoRAs are rejected).

**Prohibition**: when the user says "make a 2D animation", picking the most similarly named style ("Cel anime" etc.) outright — **style-name-based curation — is forbidden.** Never infer purpose from a style name; the style list below (C-4) is also never judged by name alone.

**Strengths**: locked-in style makes results predictable; in-house checkpoint makes it **among the cheapest** image models (compare live prices); single-asset specialist.

**Ideal pipeline (when the user did not dictate a clear art style/reference)**:

1. Left to a generic model like GPT, the output drifts to a bland Ghibli-ish default. To prevent this, **ask the user, or propose the ToonXL style that best fits the scenario and get user confirmation.**
2. With the confirmed style, produce single-character / single-background / single-prop image assets in ToonXL.
3. Feed those single assets as references into a GPT model to build **sheets optimized for R2V video generation** (turnarounds, multiple expressions).
4. Use the processed sheets as video-generation references.

Skipping this order — feeding raw ToonXL single assets straight into video references, or trying to pull scenes/sheets directly out of ToonXL — degrades quality.

### C-4. ToonXL style list (read live)

Read the current styles and per-style prices from `toonxl`'s `stylesByMode` for the mode you will run; the list is service-managed and changes. **Warning**: never infer purpose from style names. The actual choice is made after reviewing the scenario and style requirements, with user confirmation (C-3).

### C-5. Aspect ratio / resolution judgment rules (image)

| Purpose | Aspect ratio |
|---|---|
| Character sheets, location sheets | 1:1 or 16:9 |
| Single character image asset | 9:16 |
| Single background image asset | 16:9 landscape |
| Other | whatever the user/agent specified |

Resolution rules:

- Unless cost saving was requested, **prefer the highest supported resolution**, but 4K is expensive — **mostly stay at 1K–2K.**
- Images that will be video-generation references matter a lot for quality — **2K recommended.**
- Some models have no resolution option (flat price) or no lowest tier. Check the spec before trying to save cost by lowering resolution.

---

## D. Art-style consistency strategies

The most important thing in animation production is **holding one specific look/art style consistently across generations.** There are three methods; they can be combined.

| Strategy | Method | When to apply |
|---|---|---|
| **(a) Frame composite** | Build the scene itself as consistent-style images (Start frame/End frame) and use them directly as video frame references. When building the frames, composite the scene using consistent assets (character sheets, backgrounds, background sheets, prop sheets) as references | When a specific cut's start/end composition must be precisely controlled. Pairs well with Kling 3.0-Omni's strength (static scenes, Start/End frames). Frame inputs are Playground-only over MCP; on Canvas the composited frames can only enter as image references |
| **(b) Reference unification (most common)** | Unify the art style using only the key style-defining reference images (backgrounds, characters, sample scenes) | The default. Apply this first unless instructed otherwise |
| **(c) Prompt restatement** | Used together with (b). Reference images alone can lose frame-timing techniques, coloring methods, and line-art drawing style during video generation — so **state the style once more in the video prompt body** | The complement to (b). Mandatory for styles with precise rendering rules that must hold (2-tone cel shading, line-art method — e.g., 2D cel anime) |

Judgment rule: (b) is always the baseline. Add (a) when frame-level precision control is needed. If the style is delicate enough to drift during video generation (cel anime, specific line-art techniques), always add (c).

---

## E. Reference & mention mechanics

This section covers three completely different layers. Confusing them invalidates prompts or tanks reference adherence.

### E-1. Layer 1 — Canvas UI "reference chips"

A reference chip is a UI object created by **the act of connecting** a media/text/video node into a generation node on the canvas.

Measured rules:

1. **Chips are created by the `connect` action (targetHandle=`refImages`).** The moment of connection auto-inserts the ref part at the **head** of the prompt, followed by one space. It cannot be inserted at an arbitrary position in the text (that is only possible when a human types `@` in the browser UI — not via MCP).
2. **Chips cannot be imitated with strings.** Writing node-addressing syntax like `@<nodeId>`, `@[label](nodeId)`, `{{nodeId}}`, or `@label` directly in the prompt does not become a UI chip (it stays literal text). But this is only about the chip layer — order-based naming mentions like `@Image 1` / `@Video 1` are **valid prompt grammar that Seedance reads directly, independent of chips** (E-2).
3. **The same node cannot be connected twice** (error returned). One node maps to exactly one chip.
4. **Multiple chips stack at the head, most recently connected first.** If a display order matters, connect in reverse order.
5. **Patching (saving an edit to) the prompt deletes all existing ref chips.** The edges themselves remain, so the references still reach the model, but the mention text in the prompt is lost. Therefore the working order must always be **"write the prompt first (when adding the generation node) → connect references afterward."** Editing the prompt again after connecting blows the chips away.
6. **Disconnecting an edge demotes its chip to plain "node name" text.** A chip is an object bound to an edge, not an independent token — an "orphan chip" pointing at an unconnected node cannot exist.
7. To change chip position/order: disconnect → clean the demoted residue text out of the prompt (patch) → reconnect. Even then, insertion is always at the head.
8. To mention the same image multiple times, create N media nodes with the same mediaId and connect each. But the model counts them as N reference images, consuming the model's `maxReferenceImages` budget.
9. **Chips are not information passed to the model.** The generation payload separates `prompt` (string) and the reference-node array completely, and the prompt string actually delivered to the model carries no trace of chips. A chip only tells the system "this reference is attached to this job, in this position" — **trying to assign meaning (roles) via a chip's on-screen position is void.** Roles must be stated in words in the prompt body.
10. **MCP cannot place chips at arbitrary positions — and that is not an invitation to open a browser and place them by hand.** The alternative is choosing one of the two injection paths in E-3.

### E-2. Layer 2 — Seedance native reference naming

A **prompt-writing rule**, completely unrelated to Layer 1.

- References are auto-numbered per media kind in the order they were supplied (= connect order, or array order): e.g., feeding images, then a video, then audio yields `@Image 1`, `@Image 2`, `@Video 1`, `@Audio 1`.
- **The canonical inline form is the position label: `@Image 1`, `@Video 1`, `@Audio 1`** (live generation guide). The MCP path sends the prompt as written, and Seedance's native grammar resolves these labels to the media in connection/array order. Chips created by `connect` display the same labels — leave them as they are. Mention grammar is a live contract (authority axis 3).
- Declare roles up front (e.g., "@Image 1 = character sheet, @Image 2 = background, @Video 1 = camera previz"), and also refer to each reference by its @-mention inside the scene description. **Writing the mentions is itself the main adherence lever.**
- **Direct-argument path (E-3) + @-mentions is the default MCP path.** In that combination the chip mechanics of E-1 (head auto-insertion, loss on patch, order reversal, reconnection management) never come into play and can be ignored entirely. Read E-1 only when using the graph (connect) path.
- This native naming is **independent of whether UI chips exist.** With no chips (e.g., the direct-argument path), native names are still valid and must be mentioned in the prompt. Conversely, writing a native name in the prompt does not create a UI chip. **They are separate layers** — do not confuse them.

### E-3. The two reference-injection paths

MCP offers two paths for attaching references to a generation job.

| Path | Method | Creates chips? | Fits |
|---|---|---|---|
| **Direct-argument path** | Pass the reference node-id arrays directly as arguments of the generate call | No (chips are created only by the `connect` action) | When you want to keep patching the prompt safely later (no chip-loss risk); when you want to avoid UI-chip side effects (head auto-insertion, order reversal); one-off generations that don't need reusable graph nodes |
| **Graph (connect) path** | Create nodes (`add_media_node`/`add_text_node`) and wire edges with `connect` | Yes (all E-1 rules apply) | When building a canvas workflow where the same media node is reused by other generation nodes; when the wiring should be visually reviewable in the browser; iterative work adding sources progressively |

On both paths, Seedance native naming (E-2) follows **the order the references actually reach the model** (array order on the direct path; connect order on the graph path), and the rule of writing `@Image 1`-form mentions in the body (E-2) applies identically. **Live-confirmed**: the live generation guide documents array-position naming explicitly (the first entry of the image-reference array is the first image label) — both paths share the same order-based naming rule.

### E-4. Layer 3 — text-node connections

A chip created by connecting a text node to a generation node represents **the text inside that text node itself.** It looks like an E-1 media chip and obeys the same mechanics (head insertion on connect, etc.), but what it stands for is different, and it has nothing to do with E-2's Seedance native media naming. Understand text-node connection as "planting a reusable prompt fragment in the graph for multiple generation nodes to reference" — it does not consume image/video/audio reference counts.

---

## F. Prompt-writing spec

### F-1. Length caps

A model's catalog `maxPromptLength` is a **hard cap — cannot be exceeded.** Where it is null there is no hard cap; use the model's `recommendedPromptWords` (unit = words) as the practical target. `toonxl` image-to-image ignores the prompt entirely (C-3).

Over-length behavior matches F-2 — even within the cap, if instructions are too numerous, lower-priority instructions get dropped first.

### F-2. What happens when too long

Excessively long prompts (especially for video) measurably cause **some instructions to be dropped.** Even inside the length cap, many instructions mean later-priority ones drop first — put the critical instructions early.

### F-3. Recommended single-job duration (seconds)

- Video: the Seedance 2.5 family supports up to 30 seconds, but a single job is **recommended at 15–18 seconds.** Beyond that, consider cut/job splitting. Exceeding the recommendation is a deliberate, stated exception that rides the plan confirmation gate (B-5).
- Minimum durations differ per model (B-2). There is no global minimum — always check the `durations` array of the model in use.

### F-4. Reference role declaration rule

- Every reference needs its **role stated in the prompt body for adherence to rise** (E-2). Declare the role mapping up front, or use the name as the subject inside the scene description.
- With two or more references that could be confused (e.g., two or more characters), explicitly distinguish each reference along disambiguating axes (color, build, hair, etc.) inside the prompt.

### F-5. Style restatement rule (strategy c)

Even with reference images unifying the look, frame-timing technique, coloring method, and line-art style can collapse during video generation. **Restate the style in the video prompt body** to prevent this (section D, strategy c). Mandatory for styles with precise rendering rules, such as `SEEDANCE_2_5_ANIME`'s 2-tone cel shading and clean line art.

---

## G. Cost & budget model

### G-1. Credit price structure

- **Video**: per resolution × duration in the catalog `specByMode`.
- **Image**: flat or per-resolution prices in the catalog `specByMode`; ToonXL per style in `stylesByMode`.
- **Voice**: text limit and price from the catalog and `estimate_credits`.

### G-2. Free vs. paid tool boundary

| Free | Paid |
|---|---|
| `canvas_list_models`, `playground_list_models`, `list_voices`, `estimate_credits`, `playground_estimate_credits`, `get_credit_balance`, `create_canvas`, `canvas_add_media_node`/`add_text_node`/`add_generation_node`, `canvas_connect`/`disconnect`, `canvas_update_generation_node`/`update_text_node`, `canvas_delete_nodes`, `canvas_group_nodes`, `canvas_reference3d_*` (including 3D export rendering), `get_canvas`, `get_canvas_mutation`, `list_canvases`, `rename_canvas`, `delete_canvas`, `list_generations`, `get_generation`, `list_assets`, `get_media`, `create_upload` (issuing the presigned URL is free; the uploaded file becomes a billing input only once used in a generation) | `canvas_generate_image`/`generate_video`/`generate_voice`, `toonkit_generate_image`/`generate_video` (Playground), `retry_generation` |

### G-3. Estimating procedure

- Before any actual generate call, quote with `estimate_credits` (Canvas) or `playground_estimate_credits` (Playground). **Estimates are computed with the same rules as actual billing.**
- Reference count and video length are billing inputs — **estimate with the exact references you will actually use.** Quoting without references and adding them later skews the quote.
- Always check the response's `resolvedOptions` — it shows how the server interpreted your inputs (e.g., `toonxl` → resolves to `LORA_T2I`; T2I/I2I auto-decided by reference presence).

### G-4. Low-res validation → high-res final output pattern

- The default recommended flow: before producing the final at high quality, verify the result cheaply at a low resolution, and once satisfied re-generate at high resolution with the same prompt.
- This pattern requires the model to **have a resolution below the final one** in its spec. Check the candidate's resolutions before planning it.
- If the content itself is satisfying, keeping the low-res original and upscaling later is also an option (G-5).

### G-5. Topaz upscale strategy

- The service owner's intent: generate the original at 480p, and if the content is satisfying, raise resolution via **Topaz upscaling** without regenerating. Generating at 720p and Topaz-upscaling for fully commercial deliverables is also common in the owner's experience.
- **Current status: unreleased.** The owner has stated it will be added (including to MCP), but as of 2026-09-17 the API/MCP has no such feature (the live guide confirms: no Topaz upscaling over MCP). Treat this strategy as **currently unavailable** and substitute high-resolution regeneration when needed.

### G-6. Daily budgets — opt-in caps (live contract)

- Daily limits are **opt-in caps** the user can set on two axes: the account and each MCP connection. **An unset limit means no cap on that axis** — it does not block generation. The effective allowance is the smallest remaining allowance across whatever limits are set; when no limit is set at all, `get_credit_balance` reports `remainingToday` falling back to the wallet balance.
- An MCP daily allowance (when set) is a separate bucket from the wallet balance: credits spent on the web do not consume it, and vice versa.
- **MCP has no endpoint to set or raise budgets** (only the read-only `get_credit_balance` exists). Caps are configured by the user in the web UI; the agent can never lift a cap by itself.
- If a call is rejected on budget grounds (`MCP_DAILY_LIMIT_EXCEEDED`), a configured cap is exhausted — read `get_credit_balance`, report the state, and ask the user to adjust the cap in the web UI.
- `resetAt` is UTC midnight (= 09:00 KST).
- A cap equal to the wallet balance is not a safety net — the per-call `maxCredits` is the real loss limiter. Set `maxCredits` 5–10% above the estimate: a charge above it is rejected, and the headroom absorbs price movement between quote and launch.
- Budget semantics are a live contract (authority axis 3) — if observed behavior contradicts this section, re-read the live generation guide and treat this section as stale.

---

## H. Parallel generation

- Playground and Canvas both **support parallel generation natively.**
- Default: when multiple generation jobs are instructed and each job's video/image prompt is ready, **launch them all in parallel without waiting for sequential completion.**
- Run sequentially in exactly two cases: **(1) a dependency exists** — one job's output feeds another job's input (the result decides the next starting scene, an end frame becomes the next job's start frame, etc.); **(2) the user or the agent explicitly requires sequential execution.** Independent jobs stay parallel.

---

## I. Operational constraints & traps

### I-1. Generation status values and result verification

- `status: SUCCEEDED` only means "a file was produced" — **not that it came out as requested.** Images: download and inspect visually. Videos cannot be played back, so frame extraction (contact sheet) is the only reading method.
- Whether to actually run pixel-level inspection on finished videos is **decided by the manager skill's inspection mode** — this section defines how to verify when verification runs, not whether it runs.
- A `NEEDS_ATTENTION` status **double-charges if resubmitted** — never resubmit.
- `CANCELLED` and `SUPERSEDED` are terminal non-results as well; neither delivered the requested output.
- Verification checklist: did the specified colors/attributes land on the specified subjects; is the character fully in frame; is the art style compatible with the models of other pipeline stages; do multiple characters stay unmixed; did the specified cut count/ending actually occur; any unintended overlays such as watermarks.

### I-2. Media URL expiry

Result URLs are short-lived: **roughly 10 minutes for images, 30 for video, 15 for audio.** Never store and reuse URLs; when expired, re-query via `get_generation`/`get_media` for a fresh one.

### I-3. References must be pre-registered media

References only accept **mediaId/nodeId already existing in ToonKit.** Local files cannot be passed as bytes — the sequence `create_upload` (presigned PUT URL) → actual upload → `confirm_upload` must come first (requires the `assets:write` scope).

### I-4. Upload is images only (over MCP)

Over MCP, upload accepts image files only (jpeg, png, webp, gif). Video cannot be uploaded — there is no MCP route to use a local video clip as a reference; only videos generated within ToonKit are reusable as references.

### I-5. Playground vs Canvas model-id set separation

Ids from `canvas_list_models` and from `playground_list_models` are **different sets.** Using one surface's id in the other's generate call is rejected. Always take ids from the model list of the surface that will actually run the generation.

### I-6. Retry vs. recovery — two different things

- **Recovering a lost response (free)**: re-issue the SAME generate call with the SAME `idempotencyKey` — you get the original job back, not a second charge. A retry with a NEW key is a NEW generation and charges again.
- **`retry_generation` (paid)**: a brand-new charge for a FAILED job — and it is **Playground-only.** Canvas failures are re-run by calling the canvas generate tool again (with a new idempotencyKey, as a new job).
- `NEEDS_ATTENTION` is neither retryable nor recoverable by resubmission — see I-1 (double charge).

### I-7. idempotencyKey / maxCredits handling

Every generate call requires `idempotencyKey` and `maxCredits`. Set `maxCredits` with 5–10% headroom above the estimate (see G-6).

### I-8. MCP mutation queueing behavior

Canvas mutations made over MCP queue as `PENDING` until one of the user's open Canvas tabs applies them (`appliedThroughSeq < latestSeq` means work remains). Follow them with `get_canvas_mutation`. While no tab can apply them, receipts carry `blockedReason` / `blockedHint`: relay the hint (usually: open the canvas). A PENDING receipt is not completion. General canvas authoring stays MCP-only. Scoped exception: the dedicated 3dref workflow requires a visible browser editor/timeline during MCP authoring and uses the normal browser Save/Export runtime. That exception permits presentation/rendering, never mouse/keyboard scene authoring or general canvas UI manipulation. Follow its saved-state barrier and do not resubmit admitted pending edits.

### I-9. Watermark

On the Free Plan, a `Made with Toonkit` watermark is composited at the top-right of results. It cannot be removed via prompt negatives (`no watermark` etc.) — it is **composited by the platform**, not produced by the model. This is expected plan behavior, not a generation defect: never treat it as a failure, never spend generations trying to remove it, and never count it against the verification checklist (I-1). If the user asks about it, explain it is a plan-level overlay resolved by upgrading.

### I-10. Catalog query care

The full video catalog (`canvas_list_models(kind="video")`) is tens of KB and can hit response-size limits if loaded whole. Fetch **only the selected candidate models** — pass `modelId` to retrieve single entries. This document carries no specs or prices, so read candidates live. The actual cost of every paid call still comes from the mandatory `estimate_credits` quote (G-3).

### I-11. Content-risk failure guide (real persons / explicit content / character IP)

Generations can fail at the provider layer (refusal). Screen every brief against these risk classes:

1. **Real-person likeness**: real, identifiable people (celebrities, public figures) — attached as image references or described by name in text.
2. **Explicit content**: adult (19+) sexual or extreme content. Censorship strictness varies by model (Wan 3.0 is the least censored per B-1), but no model is guaranteed to pass.
3. **Real character IP**: existing recognizable characters (e.g., franchise heroes) invoked by name in the prompt **or** supplied as an image reference.

Rules:

- These are probabilistic failure risks, not certainties. But **the manager skill must screen the brief against them during planning and warn the user BEFORE any paid call** when the risk is high (manager §1).
- Where feasible, propose lower-risk alternatives (an original character in a similar role, likeness-free references, redesigned/renamed characters).
- Never silently rewrite the user's creative intent to dodge the risk — warn, present the alternative, and let the user decide.

---

## J. Items pending verification / unresolved

1. **Release timing of features not yet on MCP**: the Storyboard workflow (section A) and Topaz upscaling (G-5) are stated by the owner as "coming soon (including MCP)", but no concrete date. At usage time, re-check with free queries (`canvas_list_models`, the live generation guide) whether they have actually landed.

---

Judgment rules come from the owner's 2026-09-17 briefing. Numeric catalog snapshots were removed on 2026-09-23 in favor of live reads, and contract items were reconciled with the live generation guide the same day. The only remaining open item is J-1.
