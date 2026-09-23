# Development and releases

Both marketplaces install `plugins/toonkit`. Edit the skills there once; do not
create Codex/Claude copies. The two host manifests carry the same release version
and production MCP endpoint. Preserve their host-specific presentation fields.

## Validate a change

Requirements: Python 3.9+, Node 20+ and npm. No account or AI credits are required
for these offline tests. Choose writable cache/work directories outside the plugin:

```sh
python3 -B scripts/release.py check
npm install --prefix /tmp/toonkit-cache/runtime --cache /tmp/toonkit-cache/npm --ignore-scripts --no-audit --no-fund three@0.184.0
python3 -B validation/run.py --cache /tmp/toonkit-cache --work /tmp/toonkit-validation --fetch
python3 -B validation/tests/test_release.py
```

`--fetch` downloads missing checksum-pinned public motion assets. Omit it when
cached. [Validation details](validation/README.md) distinguish calculated, saved,
decoded and human-reviewed evidence. These tests are release work, not additional
steps in each user's skill execution. Never commit logs, customer canvas IDs,
compiled shots, credentials, source-asset caches or `node_modules`.

If installed, run host validators without installing the plugin:

```sh
claude plugin validate plugins/toonkit
claude plugin validate .
```

Also run Codex's `plugin-creator/scripts/validate_plugin.py` and
`skill-creator/scripts/quick_validate.py` from the skill installations on that
development host. They are optional developer tools, not dependencies of this
repository or the installed plugin. CI uses the packaged checks and tests.

## Version and prepare

1. Work on a review branch. Update both `plugins/toonkit/.codex-plugin/plugin.json`
   and `plugins/toonkit/.claude-plugin/plugin.json` to the same SemVer. Add its
   CHANGELOG entry and update both README languages when behavior changes.
   Do not add versions to the marketplace entries or local `+codex` cachebusters.
2. Before 1.0, increment minor for an incompatible spec/runtime or feature release;
   increment patch for compatible fixes. Existing compiled runs must use their
   matching original runtime; do not overwrite a run to migrate it.
3. Run the checks above. For renderer/profile changes, additionally follow the
   skill's [profile maintenance](plugins/toonkit/skills/3dref/references/preflight.md)
   and perform a fresh live Export. Record the tested host and limits in the review;
   do not treat mocks as live browser/OAuth evidence.
4. Build without installing or publishing:

   ```sh
   python3 -B scripts/release.py build --out /tmp/toonkit-release
   ```

   This produces a deterministic marketplace-source ZIP and `SHA256SUMS`. The
   ZIP retains both catalogs, the shared plugin, license/docs and development
   validation source. `RELEASE-MANIFEST.json` hashes every other archived file.
   Only `plugins/toonkit` is installed by either marketplace; tests remain outside.
   Extract it and run `validation/run.py --plugin-root <extracted>/plugins/toonkit`
   to validate the exact packaged runtime. No user's earlier run is needed.
5. Review the diff, validation result and live limitations before merging to the
   marketplace's default branch. Default-branch content is distribution content;
   CI by itself does not protect it before a direct push. Configure required PR
   checks in GitHub if the team wants that enforcement. This repository does not
   change those remote settings automatically.
6. Once the reviewed commit is on the default branch, create its matching annotated
   tag (`v` plus manifest version) and publish the tag using the team's release
   process. `scripts/release.py check --tag <tag>` rejects a mismatch. Tag CI
   validates and uploads the archive/checksums as workflow artifacts; it does not
   auto-create a GitHub Release or install a plugin. Attach those artifacts to a
   GitHub Release only after the checks and intended live review pass.

Scripts never push, tag, install, authorize accounts or publish. Plugin update
behavior depends on the client; a source push is not proof that users have updated.
Keep explicit versions synchronized because Claude uses them for update detection
([Claude version management](https://code.claude.com/docs/en/plugins-reference#version-management)).

## Host boundaries

The compiler and bridge are shared; browser APIs are not. Codex uses retained tool
memory plus its visible browser helper. Claude Code uses the cold-process relay
and normal Claude browser operations documented in `references/direct.md`. Keep
that route testable without Codex APIs. A manifest validation pass does not prove
fresh installation, OAuth, actual browser operation or rendered artistic quality.
