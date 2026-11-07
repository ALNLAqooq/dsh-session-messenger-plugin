import { randomUUID } from 'node:crypto';

export const inject = ['tools', 'sessionController', 'sessions'];

const MAX_MESSAGE_CHARS = 20000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function normalizeCwd(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (trimmed === '') return '';
  return trimmed.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function shortId(id) {
  return typeof id === 'string' && id.length > 0 ? id.slice(0, 8) : 'unknown';
}

function cleanTitle(value) {
  return String(value).replace(/[\r\n\t]+/g, ' ').trim();
}

function senderCwdOf(ctx, senderId) {
  const session = ctx.sessions.get(senderId);
  const headerCwd = session?.header?.cwd;
  if (typeof headerCwd === 'string' && headerCwd.trim() !== '') {
    return normalizeCwd(headerCwd);
  }
  if (session) {
    const workingDirectory = ctx.get('workingDirectory');
    const cwd = workingDirectory?.get?.(session);
    if (typeof cwd === 'string' && cwd.trim() !== '') {
      return normalizeCwd(cwd);
    }
  }
  return '';
}

function senderRawCwdOf(ctx, senderId) {
  const session = ctx.sessions.get(senderId);
  const headerCwd = session?.header?.cwd;
  if (typeof headerCwd === 'string' && headerCwd.trim() !== '') {
    return headerCwd;
  }
  if (session) {
    const workingDirectory = ctx.get('workingDirectory');
    const cwd = workingDirectory?.get?.(session);
    if (typeof cwd === 'string' && cwd.trim() !== '') {
      return cwd;
    }
  }
  return '';
}

function senderPresetOf(ctx, senderId) {
  const session = ctx.sessions.get(senderId);
  const preset = session?.header?.agentPreset;
  return typeof preset === 'string' && preset.trim() !== '' ? preset : undefined;
}

async function workspaceOf(ctx, rawCwd) {
  const registry = ctx.get('workspaceRegistry');
  if (!registry) return undefined;
  try {
    const resolved = await registry.resolveByPath?.(rawCwd);
    if (resolved && typeof resolved.id === 'string') return resolved;
  } catch {
    // Fall through to the path comparison below.
  }
  try {
    const workspaces = registry.list?.() ?? [];
    const wanted = normalizeCwd(rawCwd);
    return workspaces.find(workspace => normalizeCwd(workspace?.path) === wanted);
  } catch {
    return undefined;
  }
}

async function attachWorkspace(registry, workspace, sessionId) {
  if (!workspace || typeof workspace.id !== 'string') {
    return { workspaceId: undefined, workspaceAttached: false };
  }
  try {
    const fresh = registry?.get?.(workspace.id) ?? workspace;
    const attached = Array.isArray(fresh?.sessionIds) && fresh.sessionIds.includes(sessionId);
    if (!attached && typeof fresh?.attachSession === 'function') {
      await fresh.attachSession(sessionId);
    }
    return { workspaceId: workspace.id, workspaceAttached: true };
  } catch {
    try {
      const fresh = registry?.get?.(workspace.id) ?? workspace;
      const attached = Array.isArray(fresh?.sessionIds) && fresh.sessionIds.includes(sessionId);
      return { workspaceId: workspace.id, workspaceAttached: attached };
    } catch {
      return { workspaceId: workspace.id, workspaceAttached: false };
    }
  }
}

function buildEnvelope({ senderTitle, senderId, message, replyRequested }) {
  const reply = replyRequested ? '请求回复' : '无需回复';
  return `[跨会话消息 · 来自「${senderTitle}」 ${senderId} · ${reply}]\n\n${message}`;
}

function liveTitleOf(ctx, sessionId) {
  const session = ctx.sessions.get(sessionId);
  if (!session) return undefined;
  const sessionTitle = ctx.get('sessionTitle');
  if (!sessionTitle?.get) return undefined;
  try {
    const snapshot = sessionTitle.get(session);
    if (typeof snapshot?.title === 'string' && snapshot.title.trim() !== '') {
      return cleanTitle(snapshot.title);
    }
  } catch {
    // A session without title events is normal; fall through to the id fallback.
  }
  return undefined;
}

function titleOf(ctx, item) {
  const projected = item?.projections?.values?.title;
  if (typeof projected === 'string' && projected.trim() !== '') {
    return cleanTitle(projected);
  }
  const live = liveTitleOf(ctx, item.sessionId);
  if (live) return live;
  return `未命名会话 · ${shortId(item.sessionId)}`;
}

function senderTitleOf(ctx, items, senderId) {
  const own = items.find(item => item.sessionId === senderId);
  if (own) return titleOf(ctx, own);
  return liveTitleOf(ctx, senderId) ?? `会话 ${shortId(senderId)}`;
}

function isTopLevelItem(item) {
  return item.parentSessionId == null && item.origin !== 'subagent';
}

function isSenderTopLevel(ctx, senderId) {
  const session = ctx.sessions.get(senderId);
  if (!session) return true;
  return session.header.parentSession == null && session.header.origin !== 'subagent';
}

function assertTopLevelSender(ctx, senderId) {
  const session = ctx.sessions.get(senderId);
  if (!session) return;
  if (session.header.parentSession != null || session.header.origin === 'subagent') {
    throw new Error('Cross-session messaging is only available to top-level sessions.');
  }
}

function visibleTargets(ctx, items, senderId, senderCwd) {
  return items.filter((item) => {
    if (!item || item.sessionId === senderId) return false;
    if (!isTopLevelItem(item)) return false;
    return normalizeCwd(item.cwd) === senderCwd;
  });
}

async function readItems(ctx, signal) {
  const value = await ctx.sessionController.list({}, signal);
  if (!value || !Array.isArray(value.items)) {
    throw new Error('The session controller returned no session list.');
  }
  return value.items;
}

function renderJson(_args, value) {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }];
}

function listSessionsTool(ctx) {
  return {
    name: 'list_sessions',
    description:
      'List other top-level sessions in the same workspace. Use this before send_session_message to obtain an exact session id; do not guess ids. Subagent sessions, the current session, and sessions in other workspaces are omitted. Results are ordered by recent activity.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description:
            'Optional case-insensitive title substring, or a session id prefix.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_LIMIT,
          description: `Maximum rows to return. Defaults to ${DEFAULT_LIMIT}; maximum ${MAX_LIMIT}.`,
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['sessions'],
        properties: {
          sessions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['sessionId', 'title', 'running', 'updatedAt'],
              properties: {
                sessionId: { type: 'string' },
                title: { type: 'string' },
                running: { type: 'boolean' },
                updatedAt: { type: 'number' },
              },
            },
          },
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const senderId = exec.agent?.id;
      if (!senderId) throw new Error('This tool requires an active agent session.');
      assertTopLevelSender(ctx, senderId);
      const senderCwd = senderCwdOf(ctx, senderId);
      if (!senderCwd) {
        throw new Error('Cannot determine the current workspace for this session.');
      }

      const input = args && typeof args === 'object' ? args : {};
      const query = typeof input.query === 'string' ? input.query.trim().toLowerCase() : '';
      const rawLimit = Number.isFinite(Number(input.limit)) ? Number(input.limit) : DEFAULT_LIMIT;
      const limit = Math.min(Math.max(Math.trunc(rawLimit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

      const items = await readItems(ctx, exec.signal);
      const rows = visibleTargets(ctx, items, senderId, senderCwd)
        .map((item) => ({
          sessionId: item.sessionId,
          title: titleOf(ctx, item),
          running: item.running === true,
          updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : 0,
        }))
        .filter((row) => {
          if (query === '') return true;
          return (
            row.title.toLowerCase().includes(query) ||
            row.sessionId.toLowerCase().startsWith(query)
          );
        })
        .sort((a, b) => b.updatedAt - a.updatedAt || a.sessionId.localeCompare(b.sessionId))
        .slice(0, limit);

      return { sessions: rows };
    },
  };
}

function sendSessionMessageTool(ctx) {
  return {
    name: 'send_session_message',
    description:
      'Send a one-way text message to another top-level session in the same workspace. Returns as soon as the message is queued; the recipient reply stays in its own session. Use list_sessions first to get the exact sessionId. Delivery uses queue mode and does not interrupt a running turn. By default the message is informational: set replyRequested to true only when the user explicitly asks the recipient to answer; the envelope then tells the recipient to use send_session_message back to this session.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['sessionId', 'message'],
      properties: {
        sessionId: {
          type: 'string',
          description: 'Exact target session id from list_sessions.',
        },
        message: {
          type: 'string',
          description: `Plain-text message body, 1-${MAX_MESSAGE_CHARS} characters.`,
        },
        replyRequested: {
          type: 'boolean',
          description:
            'Set true only when the user explicitly asks the recipient to reply. Default false: the recipient should treat the message as informational and not answer.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['accepted', 'sessionId', 'title'],
        properties: {
          accepted: { type: 'boolean' },
          sessionId: { type: 'string' },
          title: { type: 'string' },
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const senderId = exec.agent?.id;
      if (!senderId) throw new Error('This tool requires an active agent session.');
      assertTopLevelSender(ctx, senderId);

      const input = args && typeof args === 'object' ? args : {};
      const sessionId = typeof input.sessionId === 'string' ? input.sessionId.trim() : '';
      const message = typeof input.message === 'string' ? input.message.trim() : '';
      const replyRequested = input.replyRequested === true;
      if (sessionId === '') throw new Error('sessionId is required.');
      if (message === '') throw new Error('message must not be empty.');
      if (message.length > MAX_MESSAGE_CHARS) {
        throw new Error(`message must be ${MAX_MESSAGE_CHARS} characters or fewer.`);
      }

      const senderCwd = senderCwdOf(ctx, senderId);
      if (!senderCwd) {
        throw new Error('Cannot determine the current workspace for this session.');
      }

      const items = await readItems(ctx, exec.signal);
      if (sessionId === senderId) {
        throw new Error('Cannot send a message to the current session.');
      }

      const target = items.find(item => item.sessionId === sessionId);
      if (!target) {
        const live = ctx.sessions.get(sessionId);
        if (live && (live.header.parentSession != null || live.header.origin === 'subagent')) {
          throw new Error('The target is a subagent session. Only top-level sessions can receive cross-session messages.');
        }
        throw new Error(
          `No visible top-level session with id "${sessionId}" in this workspace. Call list_sessions first.`,
        );
      }
      if (!isTopLevelItem(target)) {
        throw new Error('The target is a subagent session. Only top-level sessions can receive cross-session messages.');
      }
      if (normalizeCwd(target.cwd) !== senderCwd) {
        throw new Error('The target session is in a different workspace.');
      }

      const targetTitle = titleOf(ctx, target);
      const senderTitle = senderTitleOf(ctx, items, senderId);
      const envelope = buildEnvelope({ senderTitle, senderId, message, replyRequested });

      const result = await ctx.sessionController.prompt(
        {
          requestId: randomUUID(),
          sessionId,
          mode: 'queue',
          content: [{ type: 'text', text: envelope }],
        },
        exec.signal,
      );
      if (!result || result.accepted !== true) {
        throw new Error('The target session did not accept the message.');
      }

      return { accepted: true, sessionId, title: targetTitle };
    },
  };
}

function createSessionTool(ctx) {
  return {
    name: 'create_session',
    description:
      'Create a new top-level parent session in the current workspace and send it an initial message. Use when the user explicitly asks to start a new conversation and hand off a summary, context, or task. The new session is a normal session (not a subagent), uses the same workspace and agent preset, and appears in the session list. The initial message is informational unless replyRequested is true.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['message'],
      properties: {
        title: {
          type: 'string',
          description:
            'Optional title for the new session, at most 120 characters. The title is best-effort; the returned titleApplied flag says whether it was accepted.',
        },
        message: {
          type: 'string',
          description: `Initial plain-text message, 1-${MAX_MESSAGE_CHARS} characters. This is what the new session receives, usually a handoff summary.`,
        },
        replyRequested: {
          type: 'boolean',
          description:
            'Set true only when the user explicitly asks the new session to reply. Default false: the initial message is informational and no reply is expected.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['accepted', 'sessionId', 'title', 'titleApplied'],
        properties: {
          accepted: { type: 'boolean' },
          sessionId: { type: 'string' },
          title: { type: 'string' },
          titleApplied: { type: 'boolean' },
          workspaceId: { type: 'string' },
          workspaceAttached: { type: 'boolean' },
        },
      },
      render: renderJson,
    },
    async execute(args, exec) {
      const senderId = exec.agent?.id;
      if (!senderId) throw new Error('This tool requires an active agent session.');
      assertTopLevelSender(ctx, senderId);

      const input = args && typeof args === 'object' ? args : {};
      const message = typeof input.message === 'string' ? input.message.trim() : '';
      const replyRequested = input.replyRequested === true;
      const requestedTitle = typeof input.title === 'string' ? cleanTitle(input.title) : '';
      if (message === '') throw new Error('message must not be empty.');
      if (message.length > MAX_MESSAGE_CHARS) {
        throw new Error(`message must be ${MAX_MESSAGE_CHARS} characters or fewer.`);
      }
      if (requestedTitle.length > 120) {
        throw new Error('title must be 120 characters or fewer.');
      }

      const rawCwd = senderRawCwdOf(ctx, senderId);
      if (!rawCwd) {
        throw new Error('Cannot determine the current workspace for this session.');
      }

      const registry = ctx.get('workspaceRegistry');
      const workspace = await workspaceOf(ctx, rawCwd);
      const createRequest = workspace?.id
        ? { workspaceId: workspace.id }
        : { cwd: rawCwd };
      const preset = senderPresetOf(ctx, senderId);
      if (preset) createRequest.agentPreset = preset;
      const created = await ctx.sessionController.create(createRequest);
      if (!created || typeof created.sessionId !== 'string' || created.sessionId === '') {
        throw new Error('The session controller did not return a new session id.');
      }
      const sessionId = created.sessionId;
      const attached = await attachWorkspace(registry, workspace, sessionId);

      let appliedTitle;
      if (requestedTitle !== '') {
        try {
          const renamed = await ctx.sessionController.rename({ sessionId, title: requestedTitle });
          appliedTitle =
            typeof renamed?.title === 'string' && renamed.title.trim() !== ''
              ? cleanTitle(renamed.title)
              : requestedTitle;
        } catch {
          // A title is optional; the session can be renamed later by the user.
        }
      }

      const senderTitle = liveTitleOf(ctx, senderId) ?? `会话 ${shortId(senderId)}`;
      const envelope = buildEnvelope({ senderTitle, senderId, message, replyRequested });
      try {
        const result = await ctx.sessionController.prompt(
          {
            requestId: randomUUID(),
            sessionId,
            mode: 'queue',
            content: [{ type: 'text', text: envelope }],
          },
          exec.signal,
        );
        if (!result || result.accepted !== true) {
          throw new Error('The new session did not accept the message.');
        }
      } catch (error) {
        throw new Error(
          `Created session ${sessionId} but failed to deliver the message: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      const result = {
        accepted: true,
        sessionId,
        title: appliedTitle ?? `未命名会话 · ${shortId(sessionId)}`,
        titleApplied: appliedTitle != null,
      };
      if (attached.workspaceId) {
        result.workspaceId = attached.workspaceId;
        result.workspaceAttached = attached.workspaceAttached;
      }
      return result;
    },
  };
}

export function apply(ctx) {
  ctx.effect(() => {
    const when = ({ agent }) => isSenderTopLevel(ctx, agent.id);
    const disposeList = ctx.tools.register(listSessionsTool(ctx), { when });
    const disposeSend = ctx.tools.register(sendSessionMessageTool(ctx), { when });
    const disposeCreate = ctx.tools.register(createSessionTool(ctx), { when });
    return () => {
      if (typeof disposeList === 'function') disposeList();
      if (typeof disposeSend === 'function') disposeSend();
      if (typeof disposeCreate === 'function') disposeCreate();
    };
  });
}