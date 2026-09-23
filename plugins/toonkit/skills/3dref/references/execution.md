# Production execution

One compiler and bridge handle one or many actors. Use a fresh scene on a new or existing canvas; preserve earlier nodes. For existing-scene edits or other live features use [native execution](native.md). The compiler subset is not a plugin-wide restriction. Do not bypass a failed measured constraint with fabricated evidence.

## Prepare once

Resolve the skill's absolute path, a writable run directory and reusable dependency/source cache. Requirements: Python 3.9+, Node 20+, `three@0.184.0`, authenticated ToonKit MCP and a visible logged-in browser. The portable relay below uses the same Python/Node requirements. No prior project or session state is needed.

Install the pinned dependency only if absent, locally:

`npm install --prefix <cache>/runtime --cache <cache>/npm --ignore-scripts --no-audit --no-fund three@0.184.0`

Write `spec.json` using [production input](production-input.md), then:

`python3 -B <skill>/scripts/compiler.py <run>/spec.json --run <run> --runtime <cache>/runtime --cache <cache>/motions`

First use fetches only required checksum-pinned public FBX assets. Subsequent uses may add `--offline`. Network permission/login are environment prerequisites, not hidden skill dependencies. Never copy old shot calculations into a new spec.

A passing run has exactly `spec.json`, `compiled.json`, `journal.jsonl`. A failed plan has `spec.json` and `diagnostic.json`; fix that input and recompile in the same failed run. No scene write occurs on failure. After compilation, the bundle/journal are immutable to the planner: changed intent needs a new run. Keep diagnostics local; read only the failing constraint's evidence, not frame arrays.

## Connect once

Discover the eight suffixes used by `runtime.js` from the connected tools. Select an observed prefix when several connections qualify. No AI catalogs, balance, SSOT or generation guide for this deterministic route. Hosts with tool-memory orchestration use this launcher; hosts without it use [portable relay](direct.md).

Load the launcher into memory without printing its source. Substitute resolved absolute paths and the actual prefix:

```js
const paths={skill:SKILL_PATH,runDir:RUN_PATH,prefix:OBSERVED_PREFIX};
const q=s=>"'"+s.replaceAll("'","'\\''")+"'";
const r=await tools.exec_command({cmd:'cat '+q(paths.skill+'/scripts/runtime.js'),max_output_tokens:12000});
if(r.exit_code!==0)throw Error(r.output);
store('3dref-launcher',r.output);store('3dref-paths',paths);
```

Every phase then uses the same invocation, changing only phase/arguments:

```js
text(await eval(load('3dref-launcher'))({tools,load,store,
  toolNames:ALL_TOOLS.map(t=>t.name),sleep:ms=>new Promise(r=>setTimeout(r,ms))},
  load('3dref-paths'),PHASE,ARGUMENTS));
```

The launcher owns connection binding, one locked journal worker, batching, ID resolution, revision/application barriers and readback. Keep payloads in memory; don't recreate adapters or print helper source/keys. Fsync the exact request before sending. Transport uncertainty replays the same idempotency key and request; a rejection/conflict does not get a fresh key.

## Author with the editor visible

Read the browser tool's current API once. Reuse a suitable ToonKit tab while respecting explicit browser selection. Do not navigate unrelated work away.

| Phase | Arguments and prerequisite |
|---|---|
| `useProject` | `{canvasId,url}` from the current observed canvas; binds and reads it. Or `createProject` with `{name}` when a new canvas is requested. |
| Browser | Show the bound/returned URL. |
| `createScene` | `{name,projectVisible:true}` only after the actual project is visible. Returns the owned scene ID. |
| Browser | Open that exact scene editor and show its timeline. Confirm the intended editor and assets are ready. JS filenames are not a compatibility test. |
| `advance` | `{editorVisible:true}`. At most 45s of dispatch/application work per window. Repeat only for pending progress. |

Before every new batch the bridge obtains a fresh signed logical revision and waits for all accepted work to materialize. Header-only reads keep payloads small; the initial template and final scene get full verification. Never apply over a changed sequence, normalization conflict, incompatible catalog or unknown actor. Catalog/schema checks are scoped to the commands used; public chunk filenames are maintenance evidence only.

All transform/camera keys for all actors precede pose overlays. No playback or Export between these passes. Final readback compares exposed emitted fields, primitive identity, numeric keys and inherited-pose state, with the safe view's 0.001 rounding tolerance. Omitted timing is reported as unverified by readback and checked in the editor/output. This establishes scoped saved fidelity, not pixels or art direction.

## Export and delivery

The browser action below uses Codex's browser API. Portable hosts use the [host-native browser handoff](direct.md#visible-browser-export-on-claude-code) and the same `finishExport`/`group` bridge phases.

`advance` returns `export-ready`, saved verification and a durable export ticket. Observe the exact editor once: expected actor names and frame count, assets ready, Save clean, uniquely enabled Export. The UI total is N frames; the last key is frame N−1. If a stale editor still shows its initial timing/objects, reopen that scene from the saved canvas through normal UI. Do not Save stale data over the verified scene. Resolve only owned dirty changes.

Request `browserCode` with `{tabVariable,controls:{editorNodeId,exportLabel,saveLabel}}`, using observed values. The same `browser` object can be included in `advance` when readiness is already known. Execute the emitted browser action unchanged with a 55s tool timeout. The runtime journals an attempt before yielding browser code; the helper checks public DOM readiness, clicks Export once per attempt, waits up to 40s and reads output-video metadata. It excludes the short preview embedded in a 3D node.

Pass every compact browser result to `finishExport`, including readiness failures. `export-not-started` means the returned attempt evidence proves no click: resolve readiness and call `advance` for a fresh attempt, then `browserCode`. Do not reuse old attempt evidence. A lost/ambiguous click remains read-only until reconciled.

Pass output evidence to `finishExport`. Only when rendering has ended does the bridge read canvas outputs, identify the unique new source-linked video, and match its exact DOM node. It checks decoded duration, dimensions/aspect, readyState and error. No media download, private renderer/store, network export endpoint, `get_media` loop or substitute renderer.

If the output is offscreen/unmounted, `finishExport` returns `metadata-pending` and its exact output ID. Focus that known video using the normal visible canvas UI once; request `browserCode` again (click disabled) and `finishExport` with its metadata. A normal media Play is allowed if decoding requires it. Do not use the 3D preview, a different video or another Export as evidence. If rendering is still active, resume only the existing ticket; no MCP polling during frame capture. Keep the tab visible.

For a standalone result, call `group` with `{title}` after `complete`. It journals one source/output group and checks its mutation. Repeat only `group` while `group-pending`; never regroup with a new key. `delivered` closes the worker. In a larger coordinated request, call `close` and return source/output IDs for its one final group instead.

Return the canvas link, actual video duration/dimensions, scene FPS, and a concise verified/unverified scope. Expose the playable video in the user's browser. Do not claim encoded FPS, visual acceptance or R2V compatibility from metadata alone.

## Recovery and bounded stopping

`close` stops a healthy worker without changing the scene. `recover` stops only the known retained worker after an uncertain ACK; then reload from the same journal. Use `confirmedStopped:true` only if a previously cancelled execution cell has actually ended. Lost tool memory is recoverable from disk, but release the previous worker's lock first; never delete locks or guess a process to kill.

Cold restart disables an automatic second Export after an unresolved ticket; durable confirmed-no-click evidence allows readiness recovery. Inspect existing progress/output. Ask for a retry decision only when whether a click happened remains ambiguous; elapsed time is not authorization.

After two minutes without scene-application progress or five minutes without export progress, stop automatic work and report the concrete pending state. Preserve the run. Small object count/video size does not identify the cause of delay; only attribute application, frame capture, encoding or materialization latency when the evidence distinguishes it. Keep user updates between bounded windows. Do not run screenshot/contact-sheet verification loops.
