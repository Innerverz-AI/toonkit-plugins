# Release validation

These tests are engineering evidence, not dependencies or inputs for normal skill execution. No live MCP/browser changes or AI spending occur.

Prerequisites: Python 3.9+, Node 20+. Create a writable cache and install the one dependency:

```
npm install --prefix <cache>/runtime --cache <cache>/npm --ignore-scripts --no-audit --no-fund three@0.184.0
python3 -B validation/run.py --cache <cache> --work <new-validation-work> --fetch
```

`--fetch` permits initial public checksum-pinned source downloads. Omit it when fully cached. The runner checks syntax and document links, prepares source fixtures, compiles the independent three-actor shot and runs calculation, canonical-bridge/cold-relay, and DOM-export tests. Logs and the result JSON go only into the supplied work directory. The suite needs human/running/walking/idle/standing-idle/jumping FBX files; the preparation obtains and verifies these.

The finite source profile covers calibrated boxes, stock humans, one camera, 2–30 seconds, supported timing/aspects, native/source-baked motion, and bounded MCP capacity. Test fixture JSON is raw creative input, not an old scene or cached frame solution. It is safe to edit it for a new independent evaluation; never weaken a guard just to make a fixture pass.

A live release check additionally requires authenticated ToonKit MCP and visible browser access. Run the packaged runtime from a fresh compiled run; verify saved fields, perform one UI Export, correlate source/output and decode metadata, then group. Offline mocks do not replace that check. Human visual acceptance and other operating systems/browser hosts remain distinct evidence.

The repository suite covers 25 calculation/source tests, 9 bridge/recovery tests
(including the full portable lifecycle through delivery), and 6 Codex DOM-export
tests. `tests/test_release.py` additionally checks synchronized packaging,
relocation, hash integrity and deterministic archives. These are development tests,
not part of the installed skill.

The runner accepts `--plugin-root <extracted>/plugins/toonkit` to test a packaged
plugin in isolation using the same raw fixtures. It does not import the checkout's
compiler in that mode. CI targets Python 3.9 / Node 20 on Ubuntu and macOS; passing
a local run does not mean the remote CI matrix has already run.

Release steps and host-specific checks: [CONTRIBUTING](../CONTRIBUTING.md).
