# Portable relay

Use on a tool host without retained orchestration memory. It uses the **same bridge.js**, compiled bundle, journal, guards and phases as [execution](execution.md); there is no separate scene implementation or two-actor adapter. Python 3.9+ and Node 20+ are required.

After compilation, call:

`python3 -B <skill>/scripts/direct.py <run> step <phase> --args '<JSON>'`

Arguments can instead be a JSON file path. The process locks the journal, replays already recorded responses locally and returns one compact result:

- `tool-request`: call the connected MCP tool with suffix `tool` and the exact `arguments`, then `direct.py <run> accept <ioId> <response-file-or->` and resume the same phase/arguments. The response is the tool's MCP result: `{"content":[{"type":"text","text":"<the tool's JSON text>"}]}` (`"isError":true` for a tool error) or `{"structuredContent":{...}}`; a bare JSON result object is wrapped automatically. `accept` rejects anything else before journaling, so a mistyped response never blocks the run. On Claude Code use the spooled form below instead of copying payloads.
- `wait`: sleep the given milliseconds yourself, then rerun the same `step` (same phase/arguments). No request replay with a fresh idempotency key.
- Phase result: follow the same browser/execution lifecycle. `advance` automatically includes verification/export preparation. The supported phases are useProject/createProject/createScene/advance/finishExport/group.
- `error`: stop automatic writes and read its concrete reason.

Every step runs in a fresh process. IO results, remote requests, accepted receipts and bindings are durable. A response can be accepted twice only if identical. A lost remote response uses the original issued IO request. An already accepted write is not repeated. Do not edit the bundle or journal to skip a guard.

## Visible browser Export on Claude Code

The scene/verification bridge is shared. `browser-export.js` uses Codex's `tab.playwright` API and **must not be executed in Claude in Chrome**. On Claude Code, enable its visible browser connection (`claude --chrome` or `/chrome`) and read the connected tools' current declarations. Do not invent a Codex tab adapter. Confirm browser control before `createProject`/`useProject`; if it is unavailable, stop before creating anything. If Toonkit shows a sign-in page, ask the user to sign in; never enter credentials. Use one Toonkit MCP connection for the whole run (the one serving the canvas host, normally the plugin's). After `createScene` the app may open the new node's editor itself (`?node3d=` in the URL); its receipt can still read `PENDING` until the canvas tab applies it. This host's Export handoff is:

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

This route has more model handoffs than the retained runtime. Without spooling it also transfers every MCP payload through the model, which is slow and token-heavy. Prefer retained runtime when available. Delete only temporary response files created by this relay after journal acceptance; the three run artifacts preserve recovery.

## Spooled payloads on Claude Code

Invoking this skill registers its hook for the session (skill frontmatter; Claude Code only, other hosts ignore it). The hook serves only the eight credit-free relay tools and needs no setup. Claude Code applies skill hooks to the main conversation's tool calls only, never inside a subagent (even one that invoked this skill): run the relay and its tool calls in the main conversation. There, always add `--spool` to `step`; a subagent omits it.

1. `direct.py <run> step <phase> --spool --args ...` parks every `tool-request` in `~/.cache/toonkit-3dref/spool` (override with `TOONKIT_3DREF_SPOOL` for both the relay and Claude Code) and returns `stubArguments` instead of `arguments`.
2. Call the named tool with `stubArguments` exactly. Never print, reconstruct or retype the real arguments. The hook substitutes the parked request under your normal permission rules and replaces the tool output with a one-line `response saved` note, including results too large for the host's output limit and structured tool errors.
3. `direct.py <run> accept <ioId>` with no response argument journals the saved result. Then resume the same phase.

Recovery: `accept` reporting no spooled response, or a note saying a result was not saved (transport failure), means repeat the same stub call; the request and idempotency key are unchanged. A stub rejected by the server as an invalid id or argument means the hook is not active (for example hooks disabled, or no POSIX shell and Python 3.8+ for it): stub fields are deliberately invalid, so nothing was written. Rerun the same `step` without `--spool` for plain `arguments` and continue with the plain `accept` above.
