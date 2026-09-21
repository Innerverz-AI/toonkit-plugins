---
name: toonkit-generation
description: Generate images or videos with Toonkit and edit Toonkit canvases. Use when the user requests Toonkit media generation, asks to work with a Toonkit canvas, or invokes Toonkit MCP tools.
---

# Toonkit generation

1. Before the first generation in a session, call `toonkit_get_generation_guide`
   and follow the returned workflow. Tool names may carry a client-specific prefix;
   use the connected tool whose name ends with the documented name.
2. If the guide is unavailable, explain the connection problem and help the user
   authenticate or reconnect. Do not guess generation arguments or submit paid work.
3. Query the model catalog for the requested surface (Canvas or Playground).
   Read current options and prices from tools rather than assuming model IDs,
   resolutions, reference limits, or credit costs.
4. Preserve the user's requested prompt and references. Ask for a missing creative
   decision when it is needed to proceed. Follow the guide to upload local media.
5. Estimate credits for the chosen inputs before submitting paid work. Respect
   the user's spending limit and the server's authorization and budget checks.
6. If a submission response is lost, recover with the same idempotency key and
   semantic inputs. Do not submit a new paid generation to resolve an unknown
   outcome. Inspect the existing operation; do not retry `NEEDS_ATTENTION`.
7. Report the operation status and available results. Fetch fresh result URLs
   when needed; never include OAuth tokens or other credentials in output.

The server guide is the source of truth for detailed tool ordering and generation
rules. Keep those rules and dynamic model data on the server instead of copying
these into the plugin.
