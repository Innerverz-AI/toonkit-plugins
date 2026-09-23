# Execution: compile → visible MCP authoring → one export

Read once per task. This route creates a fresh, owned stock-human/camera scene. Existing scenes, multiple animated actors or imported rigs require scoped MCP work under the body/direction/contract references; never relax fresh-scene guards to fit them.

## 1. Compile the user's direction

Resolve this skill's absolute installation path, a new writable run directory and reusable cache. Do not use an old project, sample scene, session history or test result. Python 3.9+ is sufficient for native motion. Compound stock motion additionally requires Node 20+ and three@0.184.0; install only when absent, within a writable cache:

`npm install --prefix <cache>/runtime --cache <cache>/npm --ignore-scripts --no-audit --no-fund three@0.184.0`

Write the user-specific `spec.json` directly in an otherwise empty run directory. Required format: `3dref-production-v1`; required `shot`: the grammar in [direction](direction.md); optional `actorName`, `actorColor`, `objects`. Declare either `nativePreset` or a complete `motion` block from [body motion](body-motion.md). No named recipes or fallback running animation. Objects use `object.add` with full array transforms and unique clientRef; optional color immediately follows its declaration. Do not store per-frame arrays in the spec.

`python3 <skill>/scripts/compiler.py <run>/spec.json --run <run>`

For compound motion add `--runtime <cache>/runtime --cache <cache>/motions`; add `--offline` when cached. The compiler accepts a run containing only its own input spec; it refuses other existing run data. It produces only `spec.json`, immutable `compiled.json` and `journal.jsonl`. Review its compact summary. No separate motion/trajectory/batch/receipt artifacts. Compilation is not a remote mutation or rendered validation.

## 2. Connect once; retain memory

Discover names/declarations of the six canvas/3D tools required by runtime.js. No AI-generation catalogs, balance, SSOT or OAuth extraction. If multiple ToonKit connections qualify, select the intended observed prefix explicitly.

Load the launcher once into `functions` memory, without emitting its source. Substitute resolved absolute paths, not literal placeholders:

```js
const paths={skill:RESOLVED_SKILL_PATH,runDir:RESOLVED_RUN_PATH};
const q=s=>"'"+s.replaceAll("'","'\\''")+"'";
const r=await tools.exec_command({cmd:'cat '+q(paths.skill+'/scripts/runtime.js'),max_output_tokens:12000});
if(r.exit_code!==0)throw Error(r.output);
store('3dref-launcher',r.output);store('3dref-paths',paths);
```

Each following execution cell uses this same short invocation; change only phase/arguments:

```js
text(await eval(load('3dref-launcher'))({tools,load,store,
  toolNames:ALL_TOOLS.map(t=>t.name),sleep:ms=>new Promise(r=>setTimeout(r,ms))},
  load('3dref-paths'),PHASE,ARGUMENTS));
```

The launcher loads bundle/bridge/browser helper once, selects connected tool names, starts one lightweight Python journal worker, and retains state. Large payloads stay in tool memory; output summaries only. Do not rebuild an adapter, read helper internals or reread files each batch. The worker uses an exclusive journal lock, fsync before request ACK, and coalesces prior receipts with the next request. A lost response replays the original request/key; accepted writes are never blindly duplicated.

## 3. Show and author

Read the connected browser tool's current API once. Reuse a suitable logged-in ToonKit tab, respecting explicit user selection; otherwise create a visible tab. Do not replace unrelated work. Browser access/login are required; never switch to UI authoring or a substitute renderer.

| Runtime phase | Action / gate |
|---|---|
| `createProject`, `{name}` | Validate live catalog once; create and return actual project URL. |
| Browser navigation | Show that URL; do not reload a matching page. |
| `createScene`, `{name,projectVisible:true}` | Requires the project actually visible. Creates human_camera and returns exact node/actor/camera IDs. |
| Browser navigation | Open that exact node by observed ID or unique name/control. Keep viewport and frame/key timeline visible. An open-existing control may be labelled Create 3D Reference. Ground Export's current accessible label. |
| `advance`, `{editorVisible:true}` | Requires that exact editor actually visible. Dispatch ordered MCP batches for at most 45 s, then full saved verification and export preparation in the same phase. |

Repeat advance only while dispatch/application is pending, retaining memory and providing user updates between bounded windows. No per-batch model turns. The bridge learns application latency, pre-waits briefly for known pending writes, and backs off only while needed; it still reads a fresh saved revision before every new write. Conflict, unexpected sequence, normalization, rejection or changed limits stop the run. No automatic rebasing onto others' edits.

All root/camera keys precede action overlays; no playback/export between passes. Saved verification checks counts, numeric fields, inherited poses, source slot and actor scale. Scene timing is admitted-request evidence where omitted by the safe view; actual exported duration is checked separately. No screenshot/contact-sheet/pixel QA.

## 4. Single export transaction

`advance` finishes with `export-ready`, verification summary and a durable ticket containing pre-existing output IDs. Include `browser:{tabVariable,controls:{editorNodeId,exportLabel,ready:true}}` in advance to receive the ready-to-run browser action in that same response. These fields must come from the actual visible editor, not guesses. `ready:true` means the exact editor has been observed, requested timing/FPS are not contradicted, assets are ready and Save is clean. If Save is needed for this run's changes, perform it through the normal UI and observe the updated state first; unexpected dirty user changes stop export.

If readiness requires a separate UI check after authoring, perform that narrow check once, then request `browserCode` with the same browser arguments. This exceptional handoff is preferable to pretending readiness. The runtime emits only the small browser action, never motion arrays.

1. Execute the emitted action unchanged through `cua_repl`, using the existing tab handle and tool `timeout_ms:55000` (the default 30 s is shorter than this bounded wait). It clicks the observed uniquely enabled Export once, reads fresh UI state without emitting its full tree, waits up to 40 s for Export to return, and collects actual DOM video metadata. Keep the render visible. No hidden store, internal renderer, network export endpoint, Play click or screenshots.
2. Pass its compact evidence directly to `finishExport`. Only decode-ready evidence triggers one canvas read; the runtime matches a new materialized source-linked video and its DOM node identity, duration, intrinsic dimensions, readyState and error. It journals completion and closes the worker. No get_media lookup, download, FFmpeg probe or second verification loop.

Thus the normal path after preparation has two tool handoffs: browser action and finishExport. This is a structural budget, not a promise that rendering always finishes within one window. Transporting the small browser action through model context is deliberate because browser tools and orchestration memory are separate surfaces.

If rendering exceeds a window, leave the tab open and resume only the existing ticket (allowClick:false). Do not query MCP while UI is rendering. For a dialog, error, missing DOM video or metadata-pending result, make one targeted observation/recheck after meaningful progress. Never loop full AX trees, media queries or re-export to check status. Typically stop after two minutes of stalled scene application or five minutes of stalled export; preserve work and report the concrete state. Metadata/identity ambiguity is partial verification, not success.

The ticket is issued durably before emitting click code. If interrupted before/around the click, a cold restart intentionally disables automatic clicking: inspect existing output/progress and ask for a narrow retry decision only if whether a click occurred cannot be established. No inferred success and no blind duplicate export.

## Recovery and delivery

Runtime `close` stops its healthy worker without altering the scene; resume from the same run. `recover` terminates only this run's retained worker after an uncertain ACK, then a subsequent phase reloads the durable journal. If a forcibly cancelled call left busy state, use recover with `confirmedStopped:true` only after confirming that the prior execution cell ended; never interrupt a still-running writer to evade the guard. If tool memory was lost, reconnect to the known worker session/close it if possible; the journal lock must be released before launching another writer. Never remove the lock/journal or guess a process to kill. New content needs a new run.

Keep the delivered result tab visible and mark it as deliverable with the current API. Return the project link, source/output/media IDs and brief verified/unverified scope. Report actual video duration/dimensions and scene FPS, not unmeasured encoded FPS. A playable previz is not certified R2V input; validate that contract only when an AI stage is requested.
