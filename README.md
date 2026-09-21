# Toonkit Plugins

**English** | [한국어](README.ko.md)

Generate images and videos and work with Toonkit canvases from **Codex** or
**Claude Code**. This plugin bundles a shared skill with an authenticated MCP
connection to Toonkit. No local MCP server is required.

This is an initial plugin package. Manifests and the skill have passed static
validation. Installation, OAuth, and live tool calls still need end-to-end
verification. The plugin is not listed in an official plugin directory.

## Requirements

- A version of Codex or Claude Code with plugin support.
- A Toonkit account with **Allow connected apps** enabled in
  [connection settings](https://toonkit.io/en/settings/connections).
- Available credits for paid generation. You can set spending limits in connection settings.

Installing the plugin and authorizing your Toonkit account are separate steps.
Do not put passwords or access tokens in the plugin files.

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

The skill starts by reading `toonkit_get_generation_guide` from the server.
Model catalogs, prices, and detailed generation rules are maintained by Toonkit.

## Repository layout

```text
.agents/plugins/marketplace.json       Codex marketplace
.claude-plugin/marketplace.json        Claude Code marketplace
plugins/toonkit/
  .codex-plugin/plugin.json            Codex manifest + MCP configuration
  .claude-plugin/plugin.json           Claude Code manifest + MCP configuration
  skills/toonkit-generation/SKILL.md    Shared skill
```

Both clients install the same plugin directory and share one skill. Each manifest
includes its own `mcpServers` configuration: `toonkit-codex` for Codex and
`toonkit-claude-code` for Claude Code. There is no shared `.mcp.json`, avoiding
accidental merging of different OAuth client configurations. Both connect to
`https://toonkit.io/mcp`. OAuth client IDs are public identifiers, not secrets.

## Verification remaining

- Fresh installation, OAuth consent, and a read-only tool call in both clients.
- Shared skill loading and generation guide retrieval.
- Migration from an existing manually configured MCP connection without duplicates.
- Paid generation and result retrieval using an explicitly authorized account and budget.

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
