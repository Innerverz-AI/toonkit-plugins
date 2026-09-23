# Portable relay

Use on a tool host without retained orchestration memory. It uses the **same bridge.js**, compiled bundle, journal, guards and phases as [execution](execution.md); there is no separate scene implementation or two-actor adapter. Python 3.9+ and Node 20+ are required.

After compilation, call:

`python3 -B <skill>/scripts/direct.py <run> step <phase> --args '<JSON>'`

Arguments can instead be a JSON file path. The process locks the journal, replays already recorded responses locally and returns one compact result:

- `tool-request`: call the connected MCP tool with suffix `tool` and the exact `arguments`. Store its complete envelope in a temporary response file (or pipe it on stdin), then `direct.py <run> accept <ioId> <response-file-or->`. Resume the same phase/arguments.
- `wait`: wait the given milliseconds, then resume the same phase. No request replay with a fresh idempotency key.
- Phase result: follow the same browser/execution lifecycle. `advance` automatically includes verification/export preparation. The supported phases are useProject/createProject/createScene/advance/finishExport/group.
- `error`: stop automatic writes and read its concrete reason.

Every step runs in a fresh process. IO results, remote requests, accepted receipts and bindings are durable. A response can be accepted twice only if identical. A lost remote response uses the original issued IO request. An already accepted write is not repeated. Do not edit the bundle or journal to skip a guard.

## Visible browser Export on Claude Code

The scene/verification bridge is shared. `browser-export.js` uses Codex's `tab.playwright` API and **must not be executed in Claude in Chrome**. On Claude Code, enable its visible browser connection (`claude --chrome` or `/chrome`) and read the connected tools' current declarations. Do not invent a Codex tab adapter. If browser control is unavailable, stop before scene authoring. This host's Export handoff is:

1. Keep the exact scene editor visible. Using the normal browser read tool, check the returned ticket's `expectedActorNames`, `expectedDuration * sceneFps` total frames, assets loaded, clean disabled Save, and one enabled Export. Reopen a stale editor from the saved scene; never Save its initial state over verified work. Resolve only this run's dirty changes.
2. Keep the first returned `export-ready` ticket. Only its `allowClick:true` permits one click of the observed Export control through the browser's normal interaction tool. Issuing a ticket is durable; an unresolved recovered ticket has `allowClick:false`. If readiness fails before a click, relay `finishExport` with `{ticketId,attemptId,clickAttempted:false,stage}` where stage is `needs-visible-tab`, `needs-editor-reopen`, `needs-clean-save` or `needs-export-control`. Resolve readiness and resume `advance` to receive a fresh attempt. Never resume a lost click by inventing a new ticket. If click occurrence cannot be established, ask for a narrow retry decision.
3. Wait in bounded windows for the visible render to finish. Do not poll MCP during frame capture. Observe a dialog/error once if present. No second Export, private endpoints/stores, page-JS clicks, Play loops or screenshots as status checks.
4. After render completion (or a new decoded output), collect public DOM metadata with the browser's read-only JavaScript tool. This deliberately excludes the short video preview in a 3D node:

   ```js
   Array.from(document.querySelectorAll('video')).flatMap(v => {
     const n = v.closest('[data-id]');
     if (!n || !n.classList.contains('react-flow__node-video') ||
         v.readyState < 2 || !Number.isFinite(v.duration) ||
         v.videoWidth <= 0 || v.videoHeight <= 0 || v.error) return [];
     return [{outputVideoNodeId:n.getAttribute('data-id'),
       durationSeconds:Number.isFinite(v.duration)?v.duration:null,
       width:v.videoWidth,height:v.videoHeight,readyState:v.readyState,
       error:v.error?{code:v.error.code}:null}];
   })
   ```

5. Relay `finishExport` with `{ticketId,attemptId,clickAttempted:true,stage:"render-complete",videos:[observed metadata]}` (or `stage:"metadata-ready"` when decoded). Pass `videos:[]` until decoding is ready; report a visible video error separately instead of retrying Export. The same bridge verifies the new source edge, exact output ID, duration, dimensions/aspect and decode status. For `metadata-pending`, focus that exact returned output ID once through normal UI, collect metadata again and resume `finishExport`; never substitute another video. Then `group` for standalone delivery.

Do not inspect or compare JS bundle filenames during production. Pass `{editorVisible:true}` to `advance`. Keep observations compact and follow the application/export stopping limits in [execution](execution.md).

This route has more model handoffs and transfers each MCP payload through the host. It is portable, not equally token-efficient. Prefer retained runtime when available. Delete only temporary response files created by this relay after journal acceptance; the three run artifacts preserve recovery.
