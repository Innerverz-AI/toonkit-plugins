# Direct execution: model-relayed MCP calls

Read once per task on a host whose model calls MCP tools one at a time and has no Codex tool memory, such as Claude Code. Same compiler, bundle, journal, idempotency keys and gates as [execution](execution.md); the packaged step helper `scripts/direct.py` replaces the launcher, bridge and journal worker. Every request passes through model context, so cost grows with stored keys: prefer native presets and root/camera-only motion, and report the batch count.

## 1. Compile

Exactly as in execution §1. Write the user-specific spec into a new run directory, run `compiler.py`, review its summary. `<helper>` below means `python3 <skill>/scripts/direct.py <run>` with resolved absolute paths.

## 2. Connect and show

Discover the connected Toonkit tools; names may carry a client prefix, so use the tool whose name ends with the documented suffix. If several Toonkit connections qualify, select the intended one explicitly. No AI-generation catalogs, balance, SSOT or OAuth extraction.

Read `toonkit_canvas_reference3d_catalog` once with `pageSize:200`, then `<helper> requirements`. The catalog must have commandSchemaVersion 1, templateVersion 1, no nextCursor, every listed limit at least the required value, the duration inside `limits.durationSeconds`, the fps and aspect in their enum entries, every listed operation and every listed preset under its slot. Otherwise stop and report the difference.

A visible logged-in browser is required. In Claude Code use Claude in Chrome (`claude --chrome` or `/chrome`); if it is unavailable, explain the blocker instead of authoring blind. Reuse a suitable Toonkit tab, otherwise open a visible one; do not replace unrelated work.

## 3. Relay requests

Each `<helper> request …` prints `{id, tool, arguments}` and journals it first. Call that tool with `arguments` exactly as printed: never retype, round, reorder or edit values. If the client stored a long output in a file, read the file and pass its `arguments`. Then record the tool result with `<helper> accept <id> '<result>'`. On a server rejection record `<helper> reject <id> '<error>'` and stop. If the response was lost, run the same `request` again: it replays the identical key, revision and commands. `<helper> status` names the next step when resuming a run.

| Step | Helper, then tool | Gate |
|---|---|---|
| Project | `request canvas --name <name>` | Open the returned URL in the visible browser. |
| Scene | `request scene --name <name>` | Follow the mutation with `toonkit_get_canvas_mutation` until APPLIED. If a receipt carries `blockedReason`, relay its `blockedHint` and wait. Open that node's editor and keep the viewport and timeline visible. |
| Batches | `request batch --scene '<get_scene result>'` | Repeat until `status` leaves `dispatch`. |

Scene evidence for `request batch` is `toonkit_canvas_reference3d_get_scene` with the bound canvas/node, `view:"saved"`:

- Before batch 0, read the unfiltered scene (`pageSize:200`); the helper checks the fresh correction-free template.
- Before later batches, read the header only with `objectIds:["-"]`. A filter that matches no object still returns revision, sequence, pending and total counts. If the server rejects that filter, pass `objectIds:[<camera id>]` instead.

`application-pending` means the previous batch is admitted but not applied: follow its mutation, then read fresh scene evidence. Never resubmit an admitted write. The helper stops on conflict, normalization, a concurrent sequence change, another armed 3D node or a scene that is not fresh. Do not rebase onto other edits.

All root/camera keys precede action overlays by construction; do not play back or export between batches.

## 4. Verify

After the last batch is APPLIED, read `get_scene(view:"saved", pageSize:200)` once and run `<helper> verify <evidence>`. It compares object and key counts, every stored numeric field to 0.001, inherited poses, preset slot and actor scale, like the Codex bridge. Claude Code saves a result above its MCP output limit to a file and returns the path; pass that path. If the result stayed inline and is too large to relay exactly, do not retype it: report numeric readback as unverified and keep the header checks.

## 5. Export once

If this run's changes need Save, perform it through the normal UI and observe the updated state; unexpected dirty user changes stop export. Read `toonkit_get_canvas` for the canvas and run `<helper> baseline <evidence>`. It durably issues the export ticket and returns `allowClick`.

1. Only if `allowClick` is true, operate the editor's uniquely enabled Export control once. `allowClick:false` means a ticket already exists: inspect progress and output, never click again automatically. If whether a click happened cannot be established, ask for a narrow retry decision.
2. Keep the render visible and wait for Export to return. For a dialog or error, make one targeted observation. No Play clicks, hidden stores, private endpoints, routine screenshots or a second export route for the same ticket.
3. Read `toonkit_get_canvas` and run `<helper> collect <evidence>`; `export-pending` means read again later, not export again.
4. Read the new output node's decoded video metadata with one read-only page script through the browser tool:

   ```js
   Array.from(document.querySelectorAll('video')).map(v=>({outputVideoNodeId:v.closest('[data-id]')?.getAttribute('data-id')||null,
     durationSeconds:Number.isFinite(v.duration)?v.duration:null,width:v.videoWidth,height:v.videoHeight,
     readyState:v.readyState,error:v.error?{code:v.error.code}:null}))
   ```

   Pass the entry whose `outputVideoNodeId` equals the collected output node to `<helper> complete '<entry>'`. It checks duration, dimensions, decode readiness and aspect. If the metadata is not ready yet, recheck once after meaningful progress. Ambiguous identity is partial verification, not success.

Typically stop after two minutes of stalled scene application or five minutes of stalled export; preserve the work and report the concrete state.

## Group and deliver

If this run is the whole user request, run `<helper> request group --title <title>`, call `toonkit_canvas_group_nodes`, accept the receipt and follow its mutation. If a coordinating workflow selected this shot, return the source and output node IDs for its single final group instead; existing groups cannot be regrouped.

Report as in execution's delivery section: project link, source/output/media IDs, actual duration/dimensions, scene FPS and the verified/unverified scope, including any numeric readback left unverified. A playable previz is not certified R2V input.
