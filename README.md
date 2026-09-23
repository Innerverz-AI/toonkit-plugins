# Toonkit Plugins

**English** | [한국어](README.ko.md)

Generate images and videos and work with Toonkit canvases from **Codex** or
**Claude Code**. This plugin bundles two shared skills with an authenticated MCP
connection to Toonkit. No local MCP server is required.

The shared previz compiler checks staging, actor motion and camera direction before
writing a scene. See [CHANGELOG](CHANGELOG.md) for the current package version and
[validation](validation/README.md) for measured coverage. Fresh installation and
OAuth in both clients, and the Claude browser export, still need live verification.
This repository is not listed in a host-managed official plugin directory.

## Requirements

- A version of Codex or Claude Code with plugin support.
- A Toonkit account with **Allow connected apps** enabled in
  [connection settings](https://toonkit.io/en/settings/connections).
- Available credits for paid generation. You can set spending limits in connection settings.

For `3dref` previz additionally:

- Python 3.9+ and a visible, logged-in browser the client can control
  (Codex's browser tool; in Claude Code, [Claude in Chrome](https://code.claude.com/docs/en/chrome)).
- Node 20+ and npm. The shared compiler/relay requires Node and installs pinned
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

`3dref` has one production spec (`3dref-production-v2`), compiler and bridge for
one or multiple actors. Codex keeps payloads in retained tool memory; Claude Code
uses `scripts/direct.py` to relay the same bridge's requests. The portable route
passes payloads through model context and costs more tokens. Its browser handoff
uses Claude's own browser tools; the Codex browser helper is not a Claude API.
Codex's `agents/openai.yaml` preserves explicit-only invocation. Claude Code uses
the shared skill description for the same scope.

Previz uses simple shot-relevant boxes, stock humans and one camera. A location
sheet supplies spatial relationships; it does not request a detailed city model.
The compiler checks finite support surfaces, wall-as-floor roll direction, shared
body/root slow motion, camera framing, holds, collisions and the emitted sparse
keys. Measured gait mismatch blocks by default; deliberately stylized motion must
be declared with a reason. These checks are not foot-plant IK or artistic approval.

The shipped renderer profile is tied to verified public editor assets. A changed
profile stops scene edits until maintainers revalidate it; users do not reverse
engineer the renderer per task. Imported rigs, arbitrary geometry and patching old
scenes are outside this release. Scene capacity is checked against the live MCP.
Normal runs do not load development tests, local test logs or frame arrays into
model context, and do not spend AI generation credits.

If you previously connected with a fixed client ID (`toonkit-codex` or
`toonkit-claude-code`), that connection keeps working. Authenticating through the
plugin creates a separate connection; disconnect the old one in
[connection settings](https://toonkit.io/en/settings/connections) if you no longer need it.

## Verification scope

- Offline suite: 40 tests covering geometry, motion/timing, scene fidelity,
  recovery and export guards, including a full cold-process portable lifecycle.
- Live Codex smoke check of the candidate: three actors, wall roll, slow motion,
  saved-scene comparison and one correlated decoded export. This does not certify
  every shot, renderer update or client.
- Still unverified live: fresh plugin installation/OAuth in both clients, Claude
  browser export, other operating systems and paid generation. Paid generation
  guidance and authentication configuration are unchanged.

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
