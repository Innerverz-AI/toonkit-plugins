---
name: toonkit-project-manager
description: Project-manager skill that activates for ToonKit image/video/voice production, Toonkit canvas work or Toonkit MCP tool use unless explicitly stood down. Routes deterministic 3D previz separately from paid AI generation, manages scoped planning, cost confirmation, orchestration and canvas delivery.
---

# ToonKit Project Manager

Own planning, cost control and delivery; follow the user's workflow first. Honor explicit requirements, infer only delegated gaps, and scale process/artifacts to the request. Do not write a scenario document for one short clip. Default paid flow: one plan report → confirmation → batch execution.

## Route before loading documents

| Request/stage | Load |
|---|---|
| Only deterministic 3D previz, staging/motion/camera or browser-runtime export | The co-distributed [3dref](../3dref/SKILL.md) skill and its routed execution instructions. **No AI workflow or SSOT.** |
| AI image/video/voice generation, including R2V after previz | [AI production](references/ai-production.md) and [SSOT](TOONKIT-GENERATION-SSOT.md), once before choosing models/references or spending. |
| Existing result/status without new generation | Relevant read-only status tools, not production manuals or a new job. |

A previz exported as MP4 is still deterministic, not AI-video generation. Do not query models, balance, guide or credit quotes for it alone; use the 3D catalog. Missing AI-only SSOT must not block standalone previz.

In mixed pipelines, load AI rules for actual AI stages; do not reread unchanged SSOT on entry/exit from previz. Select previz only when specified or when particular shots need precise spatial/action/camera reference, not every shot. If explicitly required but unavailable, report the prerequisite instead of silently skipping.

## Scope a location reference

For 3Dref, “faithful to the location sheet” means preserving shot-relevant positions, distances, height relationships and interaction surfaces using simple proxies. Plan the actors and camera first, then construct only the needed part of the camera's swept view. Do not rebuild the city panorama, visual style or decorative details. Use the 3dref compiler for measured contact, wall rolls and body retiming; simple native operations and other catalog features use its native MCP route with scoped checks. Save/Export success alone is not proof that the planned beats, slowmo or camera roll were implemented.

## Connection

Toonkit tool names may carry a client-specific prefix; use the connected tool whose name ends with the documented name. If the tools or the generation guide are unavailable, explain the connection problem and help the user authenticate or reconnect. Do not guess generation arguments or submit paid work meanwhile. Never include OAuth tokens or other credentials in output.

## Shared boundaries

- Scene/canvas authoring and generation use MCP. Only 3dref permits scoped visible timeline, navigation, Save and Export; never UI scene authoring or general canvas manipulation.
- Paid work requires the AI workflow's live quote, confirmation and idempotency/recovery rules. Previz authorization does not authorize AI motion purchases or R2V.
- Keep payloads in orchestration memory; emit compact summaries. Reuse unchanged schemas/guides/references. Do not load both structured and serialized copies.
- Use the packaged 3D compiler/runtime (or its portable relay over the same bridge) for supported fresh scenes. It owns connection, journaling, application waits and one export transaction. Do not recreate adapters, transfer/readback scripts or per-batch files.
- Preserve user work. Remove only confidently identified slop this run created when within scope, never prior results/caches for cosmetic tidiness.

## AI-only authority

The SSOT ships next to this SKILL.md and governs model character/selection judgment. Live catalogs/quotes govern numeric limits/prices; the live generation guide governs contracts, billing and error semantics. Live contradictions win; flag stale guidance. If missing when an AI stage actually needs it, search the install root, then ask rather than guess. Fetch candidate model entries, not the full video catalog.

## Delivery

The canvas holds actual deliverables. For standalone previz, the named editable node and source-linked exported video suffice; a short limitations note is optional. No full scenario/prompt/generation-node scaffolding for work with no AI jobs.

Separate executed, verified and unverified. Previz uses numeric/data fidelity and matched decoded-video metadata, with no routine screenshot QA. Generated image assets retain the AI workflow's visual inspection gate. Playable previz does not itself establish R2V compatibility. Return the canvas link and concise result, not temporary-file inventories or expiring URLs.
