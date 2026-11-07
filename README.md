# Session Messenger 会话信使

Hand off work between **top-level DeepSeek Harness (DSH) sessions** in the same
workspace: list sibling sessions, send a one-way message, or create a new parent
session and hand it a summary.

The plugin has two halves:

- **Host** — three tools: `list_sessions`, `send_session_message`, `create_session`.
- **Client** — a **转交 / Hand off** button at the left of the composer, with a
  session picker and message box.

Both paths deliver plain text through the session controller in `queue` mode.
Delivery is fire-and-forget: the sender returns as soon as the message is
accepted, and the recipient's answer stays in the recipient's session.

> Published on npm as [`dsh-session-messenger-plugin`](https://www.npmjs.com/package/dsh-session-messenger-plugin).
>
> **Community project.** Not affiliated with, endorsed by, or maintained by
> DeepSeek AI.

## Requirements

- A DSH desktop build with plugin support and the Web UI.
- The `dsh` CLI with `dsh plugin` support (or the agent-facing `plugin_manager`
  tool for local development).
- No build step: the plugin is plain ESM plus a browser module.

## Install

### From npm (recommended)

```bash
dsh plugin --profile web add dsh-session-messenger-plugin
```

Replace `web` with your DSH profile name if it is different.

### From source

```bash
dsh plugin --profile web add github:ALNLAqooq/dsh-session-messenger-plugin
```

### Local clone (development)

```bash
git clone https://github.com/ALNLAqooq/dsh-session-messenger-plugin.git
```

Then ask DSH to install the bundle, using the **absolute path** of the clone as
the target:

```text
plugin_manager action=install_bundle target=C:\path\to\dsh-session-messenger-plugin
```

If you previously installed the development copy named
`@local/session-messenger`, remove it first so the two copies do not register
duplicate tools and UI:

```text
plugin_manager action=remove_bundle target=@local/session-messenger
```

After installing, refresh the Web UI. If the client half does not hot-reload,
restart DSH. New bundles can usually activate through HMR; replacing an already
installed package may require a restart.

## Use

### 1. Agent tools

Ask the agent in the source session:

> Summarize the current work and send it to the session titled “Test session 1”.

The agent will call:

1. `list_sessions({ "query": "Test session 1" })` to get the exact id.
2. `send_session_message({ "sessionId": "session-…", "message": "…" })`.

To create a new parent session and hand it work:

> Create a new session titled “Handoff: auth refactor” and send it this summary.

The agent will call `create_session({ "title": "…", "message": "…" })`.

### 2. 转交 / Hand off button

The button sits at the left of the composer tool row. It opens a dialog with:

- a search box (title or session id);
- the list of other **top-level** sessions in the **same workspace**;
- a plain-text message box;
- a **需要对方回复 / Ask for a reply** checkbox, off by default.

Archived sessions are hidden from this list. Subagent sessions and sessions in
other workspaces are never shown.

### 3. Reply semantics

By default a message is informational; the recipient is not asked to answer.
The envelope header says `无需回复` / `no reply needed`.

Set `replyRequested: true` (Host tool) or tick the checkbox (UI) only when the
user explicitly asks for an answer. The header then says `请求回复` / `reply
requested`, and the recipient may call `send_session_message` back to the
sender's session.

There is **no request/response correlation or inbox**: a reply is an ordinary
new message in the other session. The sender does not wait for it.

## Message format

Host tools wrap the body in a plain-text envelope:

```text
[跨会话消息 · 来自「<sender title>」 <sender session id> · 无需回复]

<message body>
```

With `replyRequested: true` the last field is `请求回复`. The envelope is
ordinary user-visible text, so it works with any model and any session log; no
custom event type is added.

## Tools

### `list_sessions`

```json
{ "query": "optional title substring or id prefix", "limit": 20 }
```

Returns:

```json
{
  "sessions": [
    { "sessionId": "session-…", "title": "…", "running": false, "updatedAt": 0 }
  ]
}
```

- Same workspace as the caller, top-level only.
- Excludes the caller, subagents, and sessions in other workspaces.
- `limit` is 1–50, default 20; results are ordered by recent activity.
- Titles fall back to `未命名会话 · <id prefix>` when no title is available.

### `send_session_message`

```json
{
  "sessionId": "session-…",
  "message": "plain text, 1–20000 characters",
  "replyRequested": false
}
```

Returns `{ "accepted": true, "sessionId": "…", "title": "…" }`.

The target must be a top-level session in the caller's workspace, and it must
appear in `list_sessions`. Delivery uses `sessionController.prompt` with
`mode: "queue"`: an idle session starts a turn, a running session receives the
message after its current turn. The call does not interrupt the recipient.

### `create_session`

```json
{
  "title": "optional, at most 120 characters",
  "message": "initial message, 1–20000 characters",
  "replyRequested": false
}
```

Returns:

```json
{
  "accepted": true,
  "sessionId": "session-…",
  "title": "…",
  "titleApplied": true,
  "workspaceId": "…",
  "workspaceAttached": true
}
```

The new session is a normal top-level session in the caller's workspace, using
the same agent preset and cwd. The title is best-effort; `titleApplied` reports
whether the rename was accepted. The workspace id/attachment fields are present
when a workspace was resolved.

## Boundaries and limitations

- **Same workspace only.** No cross-workspace or cross-machine messaging.
- **Top-level parent sessions only.** Subagents are excluded from listing and
  cannot be targeted.
- **Text only.** No attachments, images, or file parts.
- **No broadcast.** One target per call.
- **No request/response correlation.** `replyRequested` only changes the
  envelope wording; it does not create an inbox or promise a reply.
- **No archive/deletion of the target session.** Archiving only hides the
  session from the transfer dialog; it does not delete it.
- **20,000-character message limit** (the envelope is additional).

## Privacy

The plugin has no telemetry and makes no network requests of its own. Messages
are written into the two sessions' normal logs and are sent to the model through
whatever provider the DSH profile already uses. The UI uses DSH theme tokens and
does not inject a second application or load remote assets.

## Development

```text
index.js            Host half: tool definitions and session delivery
client.js           Client half: composer button and transfer dialog
cordis.patch.yml    Bundle entry
locale/en.json      Display metadata (English)
locale/zh.json      Display metadata (Chinese)
icon.svg            Plugin icon
```

There is no build step. After editing:

```bash
node --check index.js
node --check client.js
```

To reload during development, remove and reinstall the bundle:

```text
plugin_manager action=remove_bundle target=dsh-session-messenger-plugin
plugin_manager action=install_bundle target=<absolute path to this repo>
```

Test with two top-level sessions in the same workspace:

1. Ask session A to summarize work and send it to session B; check that B
   receives the envelope and that A returns immediately.
2. Run a long turn in B, send another message from A, and check that the message
   is queued and appears after the current turn.
3. Open the 转交 dialog, confirm archived sessions are absent, and send a
   message; check that the success notice appears and B receives it.
4. Try `create_session` with a title and message; confirm the new session
   appears under the current workspace, not “未分组”.

## License

MIT. See [LICENSE](LICENSE).

## 中文快速开始

**功能**：在同一工作区的父会话之间转交消息，或新建父会话并投递交接内容。
默认只投递、不要求回复；只有显式勾选「需要对方回复」或传
`replyRequested: true` 时，信封才会写「请求回复」。

**安装**：

1. 推荐从 npm 安装：
   `dsh plugin --profile web add dsh-session-messenger-plugin`
   （`web` 换成你的 DSH profile 名）。
2. 或从 GitHub 源码安装：
   `dsh plugin --profile web add github:ALNLAqooq/dsh-session-messenger-plugin`
3. 刷新 Web UI；如果客户端没有热更新，重启 DSH。

> 本项目是社区项目，与 DeepSeek AI 无隶属关系，也不代表官方。

**使用**：

- 智能体：先 `list_sessions` 找到会话 id，再
  `send_session_message({sessionId, message})`；新建会话用
  `create_session({title, message})`。
- 手动：输入框左侧「转交」按钮 → 选会话 → 输入内容 → 发送。
- 已归档会话不会出现在转交列表里；子会话和其他工作区的会话也不会出现。