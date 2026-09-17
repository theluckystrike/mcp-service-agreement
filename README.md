# mcp-service-agreement

<!-- mirror-seo:start -->

**MCP server for service agreements for freelancers: scope, deliverables, rate, termination and liability, rendered for signing.** Service agreements for freelancers: scope, deliverables, rate, termination and liability, rendered for signing.

Works with Claude Desktop, Claude Code, Cursor and any Model Context Protocol client. Runs on your own machine, or hosted with no install.

## Install

**Hosted, nothing to install.** Get a token from <https://mcp.zovo.one/mcp/connect> (the connect page) or <https://mcp.zovo.one/mcp/token> (the same token as JSON); a free anonymous one is issued on the spot and a Pro key works the same way. Then point an MCP client at `https://mcp.zovo.one/mcp/service-agreement` over streamable-http and send the token as `Authorization: Bearer <token>`.

If your client cannot set headers, put the token in the path instead: `https://mcp.zovo.one/mcp/service-agreement/t/<token>`. Both forms work. The bare URL with no token answers 401 on `tools/call`, so the token is not optional.

**Claude Desktop, one click.** Download `service-agreement.mcpb` from the [latest release](https://github.com/theluckystrike/mcp-servers/releases/latest) and double-click it.

**From source.** The mirror is self-contained: every `@theluckystrike/*` dependency is vendored, so a fresh clone builds with no extra setup.

```sh
git clone https://github.com/theluckystrike/mcp-service-agreement.git
cd mcp-service-agreement
npm install && npm run build
```

Then point your client at the built entry point:

```json
{
  "mcpServers": {
    "service-agreement": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-service-agreement/dist/index.js"]
    }
  }
}
```

> `@theluckystrike/mcp-service-agreement` is **not published on npm yet**, so an `npx -y @theluckystrike/mcp-service-agreement` command will fail. The three paths above are the working ones and each is exercised by CI.

Read-only mirror of [mcp-servers/servers/service-agreement](https://github.com/theluckystrike/mcp-servers/tree/main/servers/service-agreement). See [MIRROR.md](MIRROR.md).

<!-- mirror-seo:end -->

**In the [official MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.theluckystrike%2Fservice-agreement/versions/latest)** (`io.github.theluckystrike/service-agreement`).
An mcp service agreement writer for freelancers who are about to start client work and do not want to copy a rotting template off the internet again. Give it the parties, the scope of services, the deliverables, the rate and payment terms, start and end dates, a termination notice period, a liability cap and the governing jurisdiction, and it stores the agreement and renders clean Markdown -- or print-ready HTML -- with a signature block for both sides. A before-you-send-it checklist lists missing fields and flags one-sided gaps neutrally, like an agreement with no termination clause. A built-in clause library covers IP assignment, confidentiality, late payment interest, kill fee and revision rounds, filled with your agreement's own details. Every render carries a one-line note that it is a template, not legal advice. Everything stays on this machine; there is no account and no network call.

Built by theluckystrike.

npm publish for `@theluckystrike/mcp-service-agreement` is pending, so `npx -y @theluckystrike/mcp-service-agreement` returns 404 today. Until then, a clone+build is the working path.

## Install

### Claude Desktop

macOS `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows `%APPDATA%\Claude\claude_desktop_config.json`:

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

`~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project), same entry as Claude Desktop.

## Tools

| tool | what it does |
| --- | --- |
| `agreement_create` | Write an agreement: parties, scope, deliverables, rate and payment terms, dates, termination notice, liability cap, jurisdiction. Stores it and returns the rendered Markdown. Returns `SA-YYYY-NNNN` |
| `agreement_get` | Read one agreement in full by SA number or client name, with its status history |
| `agreement_list` | List agreements newest first; filter by status and client |
| `agreement_update_status` | Move the agreement exactly one step -- draft, sent, signed, expired -- stamping date and note into its history |
| `clause_library` | The five built-in clauses: IP assignment, mutual confidentiality, late payment interest, kill fee, revision rounds. Pro: full texts with the agreement's variables filled in |
| `agreement_render` | Render for signing: Markdown, or self-contained HTML with print CSS (Pro). Includes the signature block and the template-not-legal-advice line |
| `agreement_checklist` | The before-you-send-it checklist: missing fields and one-sided gaps flagged neutrally |
| `license_status` / `license_activate` | Free or Pro, and the key |

## Free vs Pro

| | Free | Pro |
| --- | --- | --- |
| Active agreements | 3 | Unlimited |
| Core template (parties, services, deliverables, payment, term, termination, liability, jurisdiction, signatures) | Yes | Yes |
| Markdown rendering | Yes | Yes |
| Before-you-send checklist | Yes | Yes |
| Clause library | Titles and summaries | Full texts, variables filled |
| HTML rendering, print-ready | No | Yes |

The document is never metered. Three active agreements covers a working freelancer's live engagements, and an agreement stops counting the moment it expires, so writing, reading, checklists and Markdown stay free for good. What Pro adds is the full clause library, print-ready HTML, and unlimited active agreements.

**Get Pro:** https://mcp.zovo.one/buy/service-agreement -- $19 one-time for this server, or $39 for the bundle.

## Not legal advice

Every rendered agreement ends with one line: "This agreement is a template, not legal advice." The checklist flags gaps neutrally -- what the agreement says as written, for both parties -- and never tells anyone what the law is or what to do.

## Privacy

All data stays local, in `${XDG_DATA_HOME:-~/.local/share}/mcp-servers/service-agreement/`. Two files: `agreements.json`, `counter.json`. Nothing is sent anywhere, there is no account, no API key and no network call in this server at all. License keys are verified offline.

Built by theluckystrike. https://github.com/theluckystrike
