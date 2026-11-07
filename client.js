window.__ModuleLoader__.load({
  id: 'dsh-session-messenger-plugin',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'session-messenger';
    const MAX_CHARS = 20000;

    const zh = {
      'button.label': '转交',
      'button.title': '把内容转交给另一个会话',
      'row.unnamed': '会话',
      'dialog.title': '转交到其他会话',
      'dialog.search': '搜索会话标题或 id',
      'dialog.noWorkspace': '无法确定当前工作区',
      'dialog.noList': '无法读取会话列表',
      'dialog.noTargets': '当前工作区没有其他顶层会话',
      'dialog.noMatches': '没有匹配的会话',
      'dialog.idle': '空闲',
      'dialog.running': '运行中',
      'dialog.message': '消息内容',
      'dialog.placeholder': '输入要转交的内容…',
      'dialog.send': '发送',
      'dialog.sending': '发送中…',
      'dialog.cancel': '取消',
      'dialog.sent': '已投递',
      'dialog.failed': '发送失败',
      'dialog.emptyMessage': '消息不能为空',
      'dialog.tooLong': '消息不能超过 20000 字符',
      'dialog.noTarget': '请选择目标会话',
      'dialog.replyCheckbox': '需要对方回复',
    };

    const en = {
      'button.label': 'Transfer',
      'button.title': 'Transfer this content to another session',
      'row.unnamed': 'Session',
      'dialog.title': 'Transfer to another session',
      'dialog.search': 'Search session title or id',
      'dialog.noWorkspace': 'Cannot determine the current workspace',
      'dialog.noList': 'Cannot read the session list',
      'dialog.noTargets': 'No other top-level sessions in this workspace',
      'dialog.noMatches': 'No matching sessions',
      'dialog.idle': 'Idle',
      'dialog.running': 'Running',
      'dialog.message': 'Message',
      'dialog.placeholder': 'Type what you want to transfer…',
      'dialog.send': 'Send',
      'dialog.sending': 'Sending…',
      'dialog.cancel': 'Cancel',
      'dialog.sent': 'Delivered',
      'dialog.failed': 'Send failed',
      'dialog.emptyMessage': 'Message must not be empty',
      'dialog.tooLong': 'Message must be 20000 characters or fewer',
      'dialog.noTarget': 'Choose a target session',
      'dialog.replyCheckbox': 'Ask the recipient to reply',
    };

    const colors = {
      text: 'var(--dsw-alias-label-primary, CanvasText)',
      muted: 'var(--dsw-alias-label-secondary, GrayText)',
      surface: 'var(--dsw-alias-bg-layer-1, Canvas)',
      border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35))',
      hover: 'var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12))',
      accent: 'var(--dsw-alias-button-primary-fill, ButtonFace)',
      accentText: 'var(--dsw-alias-label-primary-foreground, ButtonText)',
      danger: 'var(--dsw-alias-state-danger-primary, #d1242f)',
    };

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
      return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();
    }

    function errorMessage(value) {
      if (!value) return '';
      if (typeof value === 'string') return value;
      if (typeof value.message === 'string' && value.message !== '') return value.message;
      if (typeof value.code === 'string' && value.code !== '') return value.code;
      if (typeof value.name === 'string' && value.name !== '') return value.name;
      try {
        const text = JSON.stringify(value);
        if (typeof text === 'string' && text !== '{}' && text !== 'null') return text;
      } catch {
        // Fall through to String.
      }
      try {
        return String(value);
      } catch {
        return '';
      }
    }

    function makeRequestId() {
      try {
        if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
      } catch {
        // Fall through to the timestamp fallback.
      }
      return `session-messenger-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    const buttonStyle = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 28,
      padding: '0 10px',
      border: colors.border,
      borderRadius: 8,
      background: 'transparent',
      color: colors.muted,
      cursor: 'pointer',
      fontSize: 12,
      fontFamily: 'inherit',
      lineHeight: 1,
      flex: 'none',
    };

    const dialogStyle = {
      width: 'min(560px, calc(100vw - 32px))',
      maxHeight: 'calc(100vh - 32px)',
      padding: 0,
      border: colors.border,
      borderRadius: 12,
      background: colors.surface,
      color: colors.text,
      boxShadow: '0 20px 60px rgba(0, 0, 0, .28)',
      overflow: 'hidden',
    };

    const formStyle = {
      display: 'grid',
      gap: 12,
      padding: 20,
      maxHeight: 'calc(100vh - 34px)',
      overflowY: 'auto',
      boxSizing: 'border-box',
      fontFamily: 'inherit',
      fontSize: 14,
    };

    const fieldStyle = {
      width: '100%',
      boxSizing: 'border-box',
      padding: '8px 10px',
      border: colors.border,
      borderRadius: 8,
      background: 'transparent',
      color: colors.text,
      fontFamily: 'inherit',
      fontSize: 13,
      outline: 'none',
    };

    const rowStyle = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      width: '100%',
      boxSizing: 'border-box',
      padding: '8px 10px',
      border: '1px solid transparent',
      borderRadius: 8,
      background: 'transparent',
      color: colors.text,
      cursor: 'pointer',
      textAlign: 'left',
      fontFamily: 'inherit',
      fontSize: 13,
    };

    const selectedRowStyle = {
      ...rowStyle,
      background: colors.hover,
      border: colors.border,
    };

    const primaryStyle = {
      border: '1px solid transparent',
      borderRadius: 8,
      padding: '8px 14px',
      background: colors.accent,
      color: colors.accentText,
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontSize: 13,
    };

    const secondaryStyle = {
      border: colors.border,
      borderRadius: 8,
      padding: '8px 14px',
      background: 'transparent',
      color: colors.text,
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontSize: 13,
    };

    return {
      inject: ['slots', 'sessions', 'workspaces', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const offZh = ctx.locale.register(NS, 'zh', zh);
          const offEn = ctx.locale.register(NS, 'en', en);
          return () => {
            if (typeof offZh === 'function') offZh();
            if (typeof offEn === 'function') offEn();
          };
        });

        function TransferButton(props) {
          const sessionId = props.sessionId;
          const [list, setList] = React.useState(() => {
            try {
              return ctx.sessions?.list?.getSnapshot?.() ?? null;
            } catch {
              return null;
            }
          });
          React.useEffect(() => {
            const source = ctx.sessions?.list;
            if (!source || typeof source.subscribe !== 'function') return undefined;
            const update = () => {
              try {
                setList(source.getSnapshot?.() ?? null);
              } catch {
                setList(null);
              }
            };
            update();
            const dispose = source.subscribe(update);
            return typeof dispose === 'function' ? dispose : undefined;
          }, []);
          const listLoaded = list != null;

          const [open, setOpen] = React.useState(false);
          const dialogRef = React.useRef(null);
          const [query, setQuery] = React.useState('');
          const [targetId, setTargetId] = React.useState('');
          const [text, setText] = React.useState('');
          const [busy, setBusy] = React.useState(false);
          const [error, setError] = React.useState('');
          const [notice, setNotice] = React.useState('');
          const [replyRequested, setReplyRequested] = React.useState(false);

          function t(key) {
            try {
              return ctx.locale.bind(NS)(key);
            } catch {
              return key;
            }
          }

          function titleOfRow(row) {
            const title = row?.title || row?.displayTitle;
            if (typeof title === 'string' && title.trim() !== '') return title.trim();
            return `${t('row.unnamed')} ${shortId(row?.id)}`;
          }

          const ids = Array.isArray(list?.ids) ? list.ids : [];
          const rows = ids
            .map(id => list.byId?.[id])
            .filter(row => row && typeof row === 'object');
          let archivedSessionIds = [];
          try {
            const workspaceSnapshot = ctx.workspaces?.list?.getSnapshot?.();
            if (Array.isArray(workspaceSnapshot?.archivedSessionIds)) {
              archivedSessionIds = workspaceSnapshot.archivedSessionIds;
            }
          } catch {
            archivedSessionIds = [];
          }
          const archivedIds = new Set(archivedSessionIds);
          const currentRow = rows.find(row => row.id === sessionId);
          const currentCwd = normalizeCwd(currentRow?.cwd);
          const hasWorkspace = Boolean(currentRow && currentCwd);
          const topLevel = rows.filter(
            row =>
              row.id !== sessionId &&
              row.parentId == null &&
              row.origin !== 'subagent' &&
              !archivedIds.has(row.id),
          );
          const targets = hasWorkspace
            ? topLevel.filter(row => normalizeCwd(row.cwd) === currentCwd)
            : [];
          const q = query.trim().toLowerCase();
          const visibleTargets = q === ''
            ? targets
            : targets.filter(
                row =>
                  titleOfRow(row).toLowerCase().includes(q) ||
                  String(row.id).toLowerCase().includes(q),
              );

          React.useEffect(() => {
            const dialogEl = dialogRef.current;
            if (!dialogEl) return undefined;
            try {
              if (open) {
                if (!dialogEl.open) dialogEl.showModal();
              } else if (dialogEl.open) {
                dialogEl.close();
              }
            } catch {
              // The dialog can be disconnected during a hot reload; ignore.
            }
            return undefined;
          }, [open]);

          React.useEffect(() => {
            if (notice === '') return undefined;
            const timeout = setTimeout(() => setNotice(''), 3000);
            return () => clearTimeout(timeout);
          }, [notice]);

          function openDialog() {
            setQuery('');
            setTargetId('');
            setText('');
            setError('');
            setBusy(false);
            setReplyRequested(false);
            setOpen(true);
          }

          function closeDialog() {
            if (busy) return;
            setOpen(false);
          }

          async function submit(event) {
            event.preventDefault();
            if (busy) return;
            const message = text.trim();
            if (targetId === '') {
              setError(t('dialog.noTarget'));
              return;
            }
            if (message === '') {
              setError(t('dialog.emptyMessage'));
              return;
            }
            if (message.length > MAX_CHARS) {
              setError(t('dialog.tooLong'));
              return;
            }

            const senderTitle = cleanTitle(titleOfRow(currentRow)) || `会话 ${shortId(sessionId)}`;
            const reply = replyRequested ? '请求回复' : '无需回复';
            const envelope = `[跨会话消息 · 来自「${senderTitle}」 ${sessionId} · ${reply}]\n\n${message}`;

            setBusy(true);
            setError('');
            let ref;
            try {
              ref = ctx.sessions.retain(targetId, { source: 'gateway' });
              if (ref?.ready) await ref.ready;
              const targetSession = ref?.binding?.session;
              if (!targetSession) throw new Error(`${t('dialog.failed')} (session ${targetId} is not open)`);
              const result = await targetSession.prompt(
                [{ type: 'text', text: envelope }],
                'queue',
                undefined,
                makeRequestId(),
              );
              if (result && result.ok === false) {
                throw new Error(errorMessage(result.error) || t('dialog.failed'));
              }
              if (result && result.error) {
                throw new Error(errorMessage(result.error) || t('dialog.failed'));
              }
              setText('');
              setTargetId('');
              setQuery('');
              setOpen(false);
              setNotice(t('dialog.sent'));
            } catch (err) {
              console.error('[session-messenger] manual transfer failed', err);
              setError(errorMessage(err) || t('dialog.failed'));
            } finally {
              try {
                if (ref && typeof ref.release === 'function') ref.release();
              } catch {
                // Releasing a retained session is best-effort.
              }
              setBusy(false);
            }
          }

          const listContent = !listLoaded
            ? h('p', { style: { margin: 0, color: colors.muted, fontSize: 12 } }, t('dialog.noList'))
            : !hasWorkspace
              ? h('p', { style: { margin: 0, color: colors.muted, fontSize: 12 } }, t('dialog.noWorkspace'))
              : visibleTargets.length > 0
                ? visibleTargets.map(row =>
                    h(
                      'button',
                      {
                        key: row.id,
                        type: 'button',
                        onClick: () => setTargetId(row.id),
                        style: row.id === targetId ? selectedRowStyle : rowStyle,
                        'aria-pressed': row.id === targetId,
                      },
                      h(
                        'span',
                        {
                          style: {
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          },
                        },
                        titleOfRow(row),
                      ),
                      h(
                        'span',
                        { style: { flex: 'none', color: colors.muted, fontSize: 12 } },
                        `${shortId(row.id)} · ${row.running ? t('dialog.running') : t('dialog.idle')}`,
                      ),
                    ),
                  )
                : h(
                    'p',
                    { style: { margin: 0, color: colors.muted, fontSize: 12 } },
                    t(targets.length > 0 ? 'dialog.noMatches' : 'dialog.noTargets'),
                  );

          return h(
            React.Fragment,
            null,
            h(
              'button',
              {
                type: 'button',
                onClick: openDialog,
                title: t('button.title'),
                'aria-label': t('button.label'),
                style: buttonStyle,
              },
              h('span', { 'aria-hidden': 'true', style: { fontSize: 14, lineHeight: 1 } }, '↗'),
              h('span', null, t('button.label')),
            ),
            notice !== ''
              ? h(
                  'span',
                  {
                    role: 'status',
                    style: { marginLeft: 6, color: colors.muted, fontSize: 12 },
                  },
                  notice,
                )
              : null,
            h(
              'dialog',
              {
                ref: dialogRef,
                onClose: () => setOpen(false),
                'aria-label': t('dialog.title'),
                style: dialogStyle,
              },
              h(
                'form',
                { onSubmit: submit, style: formStyle },
                h(
                  'h2',
                  { style: { margin: 0, fontSize: 16, fontWeight: 600 } },
                  t('dialog.title'),
                ),
                h('input', {
                  value: query,
                  onChange: event => setQuery(event.target.value),
                  placeholder: t('dialog.search'),
                  'aria-label': t('dialog.search'),
                  autoFocus: true,
                  style: fieldStyle,
                }),
                h(
                  'div',
                  {
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      maxHeight: 240,
                      overflowY: 'auto',
                    },
                  },
                  listContent,
                ),
                h('textarea', {
                  value: text,
                  onChange: event => setText(event.target.value),
                  placeholder: t('dialog.placeholder'),
                  'aria-label': t('dialog.message'),
                  rows: 5,
                  maxLength: MAX_CHARS,
                  style: {
                    ...fieldStyle,
                    minHeight: 96,
                    resize: 'vertical',
                  },
                }),
                h(
                  'label',
                  {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      color: colors.muted,
                      fontSize: 12,
                      cursor: 'pointer',
                    },
                  },
                  h('input', {
                    type: 'checkbox',
                    checked: replyRequested,
                    onChange: event => setReplyRequested(event.target.checked),
                  }),
                  t('dialog.replyCheckbox'),
                ),
                error !== ''
                  ? h(
                      'p',
                      { role: 'alert', style: { margin: 0, color: colors.danger, fontSize: 12 } },
                      error,
                    )
                  : null,
                h(
                  'div',
                  { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: closeDialog,
                      disabled: busy,
                      style: { ...secondaryStyle, opacity: busy ? 0.5 : 1 },
                    },
                    t('dialog.cancel'),
                  ),
                  h(
                    'button',
                    {
                      type: 'submit',
                      disabled: busy || targetId === '' || text.trim() === '',
                      style: {
                        ...primaryStyle,
                        opacity: busy || targetId === '' || text.trim() === '' ? 0.5 : 1,
                        cursor: busy ? 'default' : 'pointer',
                      },
                    },
                    busy ? t('dialog.sending') : t('dialog.send'),
                  ),
                ),
              ),
            ),
          );
        }

        ctx.effect(() => {
          const dispose = ctx.slots.inject('conversation.input.left', () =>
            ctx.slots.register(
              {
                name: 'conversation.input.left',
                id: 'session-messenger-transfer',
                order: 10,
                label: () => {
                  try {
                    return ctx.locale.bind(NS)('button.label');
                  } catch {
                    return '转交';
                  }
                },
              },
              TransferButton,
            ),
          );
          return () => {
            if (typeof dispose === 'function') dispose();
          };
        });
      },
    };
  },
});