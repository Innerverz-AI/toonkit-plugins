# Toonkit Plugins

**English** | [한국어](README.ko.md)

Generate images and videos and work with Toonkit canvases from **Codex** or
**Claude Code**. This plugin bundles two shared skills with an authenticated MCP
connection to Toonkit. No local MCP server is required.

Previz uses native MCP for simple work and a shared compiler for measured contact,
wall rolls and body retiming. The compiler checks the emitted staging and motion. See [CHANGELOG](CHANGELOG.md) for the current package version and
[validation](validation/README.md) for measured coverage. Fresh installation and
OAuth in both clients, and the Claude browser export, still need live verification.
This repository is not listed in a host-managed official plugin directory.

## Requirements

- A version of Codex or Claude Code with plugin support.
- A Toonkit account with **Allow connected apps** enabled in
  [connection settings](https://toonkit.io/en/settings/connections).
- Available credits for paid generation. You can set spending limits in connection settings.

For `3dref` previz additionally:

- A visible, logged-in browser the client can control
  (Codex's browser tool; in Claude Code, [Claude in Chrome](https://code.claude.com/docs/en/chrome)).
- Compiled choreography additionally needs Python 3.9+, Node 20+ and npm.
  Simple native MCP work needs none of these local dependencies. The compiler uses pinned
  `three@0.184.0` into a writable cache on first use. Motion assets are fetched from
  public sources and checksum-verified; subsequent cached runs can work offline
  until scene authoring. Browser/MCP access is still required for delivery.
- The retained Codex launcher uses a POSIX shell. Other hosts use the portable
  Python/Node relay; other operating systems still need a host smoke test.

Installing the plugin and authorizing your Toonkit account are separate steps.
Do not put passwords or access tokens in the plugin files.

## Skills

| Skill | Use |
|---|---|
| `toonkit-project-manager` | Activates for Toonkit image, video and voice work. Plans the production, quotes credits before paid work, runs generations and delivers on a canvas. |
| `3dref` | 3D previz: authors a Toonkit 3D Reference scene (staging, motion, camera) over MCP and exports a reference video through the visible editor. Use it only on explicit request (Codex `$3dref`, Claude Code `/toonkit:3dref`). |

## Install

### Codex

Run in your terminal:

```sh
codex plugin marketplace add Innerverz-AI/toonkit-plugins
codex plugin add toonkit@toonkit
```

Start a new conversation and follow the Toonkit MCP connection's authentication
prompt to sign in and grant permissions in your browser. Use the Toonkit
connection shown by your client; plugin connections may have a namespaced name.
The plugin registers the connection, so a separate `codex mcp add` is not needed.

### Claude Code

Run in your terminal:

```sh
claude plugin marketplace add Innerverz-AI/toonkit-plugins
claude plugin install toonkit@toonkit --scope user
```

Start a new Claude Code session, then open `/mcp`, select the Toonkit connection,
and authenticate in your browser. Sign in to Toonkit if prompted, then approve
the requested permissions.

## Try it

- “Create an image of a rainy Tokyo alley with Toonkit.”
- “Check the image models and options available for this Toonkit canvas.”
- “Estimate the credits needed to turn this image into a video.”
- “Use 3dref: a 6-second 16:9 previz of a character walking toward a slowly pulling-back camera.”

The project-manager skill reads `toonkit_get_generation_guide` from the server
before generating. Model catalogs, prices and detailed generation rules are
maintained by Toonkit; the bundled guidance carries judgment rules only.

Before paid work, it reports the assets/jobs, exact models/settings and reasons,
reference dependencies and credit calculation even when you did not ask for a plan.
Simple requests get a brief report; approved choices are reused. A plan-only request
does not start generation. Costs for future references stay provisional until quoted
with the actual inputs. This is skill guidance, not a server-enforced generation gate.

## Repository layout

```text
.agents/plugins/marketplace.json       Codex marketplace
.claude-plugin/marketplace.json        Claude Code marketplace
plugins/toonkit/
  .codex-plugin/plugin.json            Codex manifest + MCP configuration
  .claude-plugin/plugin.json           Claude Code manifest + MCP configuration
  skills/toonkit-project-manager/      Production planning, cost gates, AI generation
  skills/3dref/                        Shared compiler, runtime/relay, references
validation/                           Development tests; not skill runtime inputs
scripts/release.py                     Version/path checks and reproducible archive
.github/workflows/validate.yml         CI checks and tag-matched artifacts
```

Both clients install the same plugin directory and share the same skills. Each manifest
includes its own `mcpServers` configuration pointing at `https://toonkit.io/mcp`.
Neither sets an OAuth client ID: Toonkit supports
[Client ID Metadata Documents](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#client-id-metadata-documents)
(CIMD), so Codex and Claude Code identify themselves with their own published
metadata document and no registration step is needed.

`3dref` preserves the full connected MCP feature set. Simple presets, a few camera
keys, existing-scene edits, other catalog objects and existing uploaded assets use
the [native route](plugins/toonkit/skills/3dref/references/native.md). Live catalog
capabilities and user scope govern those operations; no source bake is required.

Measured stock-human choreography uses `3dref-production-v2` and a shared bridge.
Codex keeps payloads in tool memory; Claude Code relays the same requests through
`scripts/direct.py`. Claude uses its own browser tools, not the Codex browser API.
Its relay costs more model handoffs. Explicit invocation conventions are preserved.

The compiler uses simple shot-relevant boxes, stock humans and one camera. It
checks finite support, wall-floor roll direction, shared body/root slow motion,
framing, collisions and emitted sparse keys. Deliberately stylized stride has an
explicit intent; default hold observations are advisory. This does not certify IK
or artistic quality. These compiler limits do not disable other MCP features.

The renderer profile records calibrated math and public-source provenance. Web
bundle filenames never block production. Changed source FBX needed for baking
and actual command/scene incompatibilities are inspected for the affected operation.
Users do not reverse-engineer the app or run development tests for each request.
Export recovery distinguishes confirmed no-click from uncertain click outcomes.
Saved verification covers exposed fields; omitted timing is checked in the editor
and decoded output. Deterministic previz spends no AI generation credits.

If you previously connected with a fixed client ID (`toonkit-codex` or
`toonkit-claude-code`), that connection keeps working. Authenticating through the
plugin creates a separate connection; disconnect the old one in
[connection settings](https://toonkit.io/en/settings/connections) if you no longer need it.

## Verification scope

- Offline suites cover geometry, motion/timing, scene fidelity, failure recovery,
  the cold-process portable lifecycle and combined launcher/browser readiness recovery.
- Live Codex checks cover compiled three-actor wall roll/slow motion with matched
  decoded Export, plus native catalog operations. See the release evidence for the
  exact results; these checks do not certify every shot, update or client.
- Still unverified live: fresh plugin installation/OAuth in both clients, Claude
  browser export, other operating systems and paid generation. Version 0.2.2 changes
  planning instructions only; deterministic tests do not measure model compliance
  with those instructions. Authentication configuration is unchanged.

For development and release commands, see [CONTRIBUTING](CONTRIBUTING.md).
Tests run at development/release time, not on every user's previz request.

## Local development

```sh
git clone https://github.com/Innerverz-AI/toonkit-plugins.git "$HOME/toonkit-plugins"
```

For an initial local marketplace registration, replace `Innerverz-AI/toonkit-plugins`
in the installation command with the absolute local checkout path. Local and
published catalogs share the same marketplace name, so remove the existing
marketplace registration before switching sources.

## License

The plugin files in this repository are distributed under the [MIT License](LICENSE).
The hosted Toonkit service has separate terms and credit charges.

## References

- [Codex plugins](https://developers.openai.com/plugins/build/plugins)
- [Claude Code installation](https://code.claude.com/docs/en/discover-plugins)
- [Claude Code plugin reference](https://code.claude.com/docs/en/plugins-reference)
