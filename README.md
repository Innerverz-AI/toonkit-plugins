# Toonkit Plugins

**English** | [한국어](README.ko.md)

Generate images and videos and work with Toonkit canvases from **Codex** or
**Claude Code**. This plugin bundles two shared skills with an authenticated MCP
connection to Toonkit. No local MCP server is required.

This is an initial plugin package. Manifests and the skill have passed static
validation. Installation, OAuth, and live tool calls still need end-to-end
verification. The plugin is not listed in an official plugin directory.

## Requirements

- A version of Codex or Claude Code with plugin support.
- A Toonkit account with **Allow connected apps** enabled in
  [connection settings](https://toonkit.io/en/settings/connections).
- Available credits for paid generation. You can set spending limits in connection settings.

For `3dref` previz additionally:

- Python 3.9+ and a visible, logged-in browser the client can control
  (Codex's browser tool; in Claude Code, [Claude in Chrome](https://code.claude.com/docs/en/chrome)).
- Node 20+ for composed stock-human motion. The skill installs the pinned
  `three@0.184.0` into a writable cache on first use.

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

Run inside Claude Code:

```text
/plugin marketplace add Innerverz-AI/toonkit-plugins
/plugin install toonkit@toonkit
```

Choose **User** scope to use the plugin across projects. Follow any reload
instructions or start a new session, then open `/mcp`, select the Toonkit
connection, and authenticate.

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
  skills/3dref/                        3D previz authoring and export
```

Both clients install the same plugin directory and share the same skills. Each manifest
includes its own `mcpServers` configuration pointing at `https://toonkit.io/mcp`.
Neither sets an OAuth client ID: Toonkit supports
[Client ID Metadata Documents](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#client-id-metadata-documents)
(CIMD), so Codex and Claude Code identify themselves with their own published
metadata document and no registration step is needed.

`3dref` has two execution routes over the same compiler and run journal. Codex
uses a packaged runtime that keeps payloads in its tool memory. Claude Code, and
other hosts whose model calls MCP tools one at a time, use `scripts/direct.py` to
relay each request. On that route every batch passes through the model context,
so long or body-baked shots cost noticeably more tokens. Codex's
`agents/openai.yaml` disables implicit invocation of `3dref`. Claude Code has no
equivalent that Codex's plugin validator accepts, so there the skill description
alone limits it to explicit requests.

If you previously connected with a fixed client ID (`toonkit-codex` or
`toonkit-claude-code`), that connection keeps working. Authenticating through the
plugin creates a separate connection; disconnect the old one in
[connection settings](https://toonkit.io/en/settings/connections) if you no longer need it.

## Verification remaining

- Fresh installation, OAuth consent, and a read-only tool call in both clients.
- Shared skill loading and generation guide retrieval.
- Migration from an existing manually configured MCP connection without duplicates.
- Paid generation and result retrieval using an explicitly authorized account and budget.
- `3dref` end to end on both routes: live catalog check, scene authoring, editor
  Export and output correlation. The Claude Code route is covered only by offline
  tests against mocked responses so far.

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
