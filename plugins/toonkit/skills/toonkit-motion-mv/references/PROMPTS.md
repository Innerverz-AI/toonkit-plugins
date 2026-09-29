# Prompt templates

Fill every `{slot}` from the confirmed brief. The creative content (character design, actions, copy) belongs to the user. Propose it when they delegated it, and never invent it silently. Write prompts in English. Keep the anti-smear and background blocks verbatim. Before any paid call, follow the ToonKit AI-production workflow (quote, plan report, confirmation, idempotency).

`{KEY}` is the chroma color chosen in spec 7-1 (`#00FF00` pure green by default, `#FF00FF` magenta if the design contains green). `{KEY_NAME}` is its word ("pure chroma green" / "pure chroma magenta").

---

## 1. Chroma reference sheet (image)

Model: the strongest detail-preserving image tier. 2K, 16:9. With an existing design image, attach it as a reference and say so.

```
Character turnaround sheet of ONE original character, three full-body views side by side in three equal vertical panels: FRONT view (left), THREE-QUARTER view (center), BACK view (right).
BACKGROUND: one perfectly flat, uniform {KEY_NAME} color ({KEY}) filling the entire image, including between and around the figures. No gradient, no floor, no shadow, no panel borders, no text, no labels, no props.
In every panel the whole body from the top of the head to the soles of the feet is visible and fills about 88% of the panel height. Same character, same outfit, same proportions in all three views.
ART STYLE: {style sentence, e.g. modern 2020s Japanese TV anime cel style}. Clean crisp digital line art, flat color fills, two-tone hard-edged cel shading (one shadow tone per color, no gradients, no airbrush), {palette mood}.
PROPORTIONS: {build}, about {N} heads tall{, NOT chibi, NOT super-deformed — when N ≥ 5}.
HAIR: {hair}.
EYES: {eyes}.
OUTFIT: {outfit}. Colors used: {palette list}. Absolutely no {key color family} anywhere on the character.
EXPRESSION & POSE: {expression}; neutral standing pose with arms slightly away from the body so the silhouette reads clearly.
```

Gate: the three views agree; figure height ≥ 85% of the panel; background flat; no key-adjacent colors; details you will rely on are actually present. Tiny details such as eye-catchlight shapes often fail — decide now whether to drop them or patch them in comp.

---

## 2. Pose still (image, one per pose)

Model: the same image tier, with the sheet attached as the first reference. 2K, same aspect as the comp.

```
@image1 is the character turnaround sheet of {character name}. Draw exactly this character — same face, hair ({hair short}), eyes ({eyes short}), outfit ({outfit short}) and proportions ({N} heads tall) — in ONE new pose.
POSE: {decisive pose: line of action, limbs, head angle, expression}. The pose is a strong key drawing with a clear silhouette, not an in-between.
FRAMING (identical for every pose in this set): {shot size, e.g. full body}, camera at {height}, the top of the head at about {H}% from the top edge and {the feet at about F% | the frame cutting at mid-thigh}, horizontally centered, {aspect}. The whole character, including hair tips and hands, stays inside the frame.
BACKGROUND: one perfectly flat, uniform {KEY_NAME} color ({KEY}) filling the entire image. No floor, no shadow, no gradient, no effects, no speed lines, no text.
STYLE: same as @image1 — clean crisp line art, flat fills, two-tone hard-edged cel shading. No motion blur, no smear, every line crisp.
```

For a P set, reuse this template and change only `POSE`. Gate each pose against the sheet and against the first pose's framing.

---

## 3. Video plate (smooth motion only)

Model: the 2D cel-anime Seedance variant. 720p (480p preview optional; no 1080p by default). Keep it short (4–8 s) and use smooth actions only. Fast actions belong in pose cuts.

```
CHROMA KEY PLATE. The entire background is one perfectly flat, uniform, solid {KEY_NAME} color ({KEY}) filling 100% of the frame for the whole clip: no floor, no stage, no horizon, no cast shadow, no contact shadow, no gradient, no vignette, no lighting effects, no scenery, no props, no particles, no sparkles, no speed lines, no text. Only the character exists; everything that is not the character is flat {KEY}.

REFERENCE: @image1 is the character turnaround sheet. She/He/They must match @image1 exactly: {identity checklist: hair, eyes, outfit, key accessories}. Ignore the panel layout of @image1.

CAMERA: completely locked-off static camera, eye level, never moves, no zoom, no pan. {Shot size}: the frame shows the character from {top} down to {bottom}; the top of the head stays about {H}% below the top edge; the character stays horizontally centered; hair, hands and clothing never leave the frame.

ACTION ({D} seconds, smooth and unhurried):
{t0}-{t1}s: {one smooth action}.
{t1}-{t2}s: {one smooth action}.
...
{tn-1}-{D}s: {hold or gentle idle} until the end.

FRAME QUALITY: every frame is a clean, fully drawn cel drawing. No motion blur, no smear frames, no ghosting, no double images, no speed blur on hair or cloth. Hair and clothing are drawn as solid shapes with crisp line art even while moving.

STYLE: 2D cel anime, clean crisp digital line art, flat color fills, two-tone hard-edged cel shading, animated on threes. The background stays flat {KEY} in every frame.
```

Action-window rules:
- Allow ±1 s drift and put a hold at the end.
- Avoid actions that need fast rotation, whips or jumps. Move those to pose cuts.
- Do not describe anything outside the frame.
- Do not ask for effects: every effect is MG.

---

## 4. Wording rules (all templates)

- Name each reference by its order label (`@image1`, …) and state its role in the body. Attach references in the order they are mentioned.
- Use numeric framing (percent of frame height, head count), not adjectives, for size and position.
- One idea per sentence. Put the background block and the identity block first; later lines are the first to be dropped by the model.
- Do not paste choreography code, curve values or frame numbers into prompts. The model cannot execute them. Timing precision comes from measurement and retiming (spec 8-2, 8-3).
