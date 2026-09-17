# Installing mcp-service-agreement (agent instructions)

This file tells an AI coding agent exactly how to install this MCP server. No account, no API key, no network service is required.

Server: **Service agreement** (@theluckystrike/mcp-service-agreement)
What it does: Writes a service agreement between a freelancer and a client before the work starts. `agreement_create` takes the parties, the scope of services, the deliverables, the rate and payment terms, start and end dates, a termination notice period, a liability cap and the governing jurisdiction, stores the agreement and returns it rendered as clean Markdown with a signature block, numbered `SA-YYYY-NNNN`. `agreement_checklist` is the before-you-send-it pass: missing fields listed, one-sided gaps flagged neutrally. `agreement_update_status` moves the agreement one step at a time, draft to sent to signed to expired, each step dated. A built-in clause library covers IP assignment, mutual confidentiality, late payment interest, kill fee and revision rounds. Every render carries a one-line note that it is a template, not legal advice.
Source: https://github.com/theluckystrike/mcp-servers/tree/main/servers/service-agreement
License: MIT. Support: support@zovo.one

## Status of the npm package

The npm package `@theluckystrike/mcp-service-agreement` is not published yet. Until it is, the `npx` command below will fail with E404. Use **Alternative B - from source** further down, which is the supported path today, and keep the same client config with `"command": "node"` and the absolute path to `dist/index.js`. Everything else on this page is unchanged.

## Prerequisites

- Node.js 18 or newer on PATH (`node --version`).
- No native dependencies. The package is pure JavaScript.
- No sibling server is required at runtime. This one opens no other server's store.

## Step 1 - the run command

```sh
npx -y @theluckystrike/mcp-service-agreement
```

The server speaks MCP over stdio. It writes nothing to stdout except protocol traffic. Do not run it interactively as a check; the client starts it.

## Step 2 - write the client config

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "service-agreement": {
      "command": "npx",
      "args": ["-y", "@theluckystrike/mcp-service-agreement"]
    }
  }
}
```

### Claude Code

```sh
claude mcp add service-agreement -- npx -y @theluckystrike/mcp-service-agreement
```

### Cursor

`~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project). Same entry as Claude Desktop.

## Alternative A - .mcpb bundle (Claude Desktop one-click)

Download `service-agreement.mcpb` from https://github.com/theluckystrike/mcp-servers/releases and open it, or drag it onto the Claude Desktop Extensions pane. This installs the server without editing JSON and without Node on PATH assumptions.

## Alternative B - from source

```sh
git clone https://github.com/theluckystrike/mcp-servers
cd mcp-servers
npm install
npm run build --workspace @theluckystrike/mcp-service-agreement
```

Then point the client at the built entry:

```json
{
  "mcpServers": {
    "service-agreement": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-servers/servers/service-agreement/dist/index.js"]
    }
  }
}
```

## Step 3 - the optional licence key

The free tier holds 3 active agreements, and reading, listing, the before-you-send checklist and Markdown rendering are free and unlimited on every tier. An agreement stops counting the moment it expires, so expiring a finished engagement frees its slot. A Pro key adds the full clause library, print-ready HTML rendering and unlimited active agreements. Set it as `MCP_LICENSE_KEY` in the server's `env` block, or call `license_activate` once and it is stored in `~/.config/mcp-servers/license.json`.

```json
{
  "mcpServers": {
    "service-agreement": {
      "command": "npx",
      "args": ["-y", "@theluckystrike/mcp-service-agreement"],
      "env": { "MCP_LICENSE_KEY": "MCPL1...." }
    }
  }
}
```

Keys are verified offline against a bundled public key. Nothing is sent anywhere. Keys: https://mcp.zovo.one/buy/service-agreement

## Step 4 - verify

Ask the assistant to call `license_status`. It answers with the tier and where the key came from. Then ask it to call `agreement_create` with the two parties, a scope, one deliverable, a rate in whole cents, a rate unit, a currency and payment terms; an `SA-YYYY-NNNN` id and the rendered Markdown come back. `tools/list` must show the nine tools from the server README.

## Where data lives

`${XDG_DATA_HOME:-~/.local/share}/mcp-servers/service-agreement/`, as `agreements.json` and `counter.json`. Nothing else on the machine is written. There is no telemetry and no network call in this server.

## Troubleshooting

- `command not found: npx` - install Node.js 18+.
- Tools missing after a config edit - the client only reads the config at startup; restart it fully.
- `the free tier holds 3 active agreements` - expiring a finished engagement frees its slot, and reading, listing, checklists and Markdown rendering stay free on every tier.
- The status flow moves one step at a time: a draft cannot jump straight to signed, and an expired agreement cannot move at all. The refusal names the one step that is next.
- The agreement is a template, not legal advice; that line is on every render by design.

Built by theluckystrike (https://github.com/theluckystrike).
