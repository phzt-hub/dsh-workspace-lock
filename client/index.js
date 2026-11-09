/**
 * dsh-workspace-lock —— 浏览器半侧（手写模块，无构建步骤）。
 *
 * 落点：
 *   sidebar.panellist          左侧「工作区锁」图标 → 选中 main 面板 key=ws-lock
 *   main (key=ws-lock)         文件夹清单、总密码、自动锁、邮箱找回
 *   sidebar.session.row.leading 锁定工作区的会话行加一枚小锁
 *   conversation.input.dock     报告当前会话的目录，供全屏锁屏判断
 *   shell.overlay               锁定工作区的会话被一层全屏密码页挡住
 *
 * 只跟宿主半侧的 /api/ws-lock/* 说话。锁是界面门禁，不是磁盘加密。
 */

window.__ModuleLoader__.load({
  id: 'dsh-workspace-lock',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const NS = 'wsLock'
    const API = '/api/ws-lock'

    // -----------------------------------------------------------------------
    // 字典
    // -----------------------------------------------------------------------

    const zh = {
      panelTitle: '工作区锁',
      panelSubtitle: '锁定工作区文件夹；锁定后该文件夹在侧栏直接收起、里面的会话不再显示，要总密码才能重新打开。',
      loading: '读取配置…',
      retry: '重试',
      loadFailed: '读取配置失败',
      noWorkspaces: '还没有注册的工作区文件夹。先在左侧新建或打开一个工作区。',
      folders: '工作区文件夹',
      foldersHint: '点「锁定」；锁定后侧栏里这个文件夹直接收起，里面的会话全部收起来，看不见也点不开。解锁只对当前页面有效。',
      sessions: '{n} 个会话',
      lockedTag: '已锁定',
      openTag: '已解锁（本页）',
      idleTag: '未锁定',
      lock: '锁定',
      unlock: '解锁',
      relock: '重新上锁',
      unlockHint: '输入总密码解锁',
      removeLock: '解除锁定',
      removeHint: '输入总密码后永久移除这个锁（不是只在本页解锁）',
      cancel: '取消',
      confirmUnlock: '解锁',
      lockedToast: '已锁定',
      unlockedToast: '已解锁，空闲超时后会重新上锁',
      passwordSection: '总密码',
      passwordUnset: '还没有设置密码。设置后才能锁定文件夹。',
      passwordSet: '已设置。修改密码需要先输入旧密码。',
      currentPassword: '旧密码',
      newPassword: '新密码',
      confirmPassword: '再输一次',
      setPassword: '设置密码',
      changePassword: '修改密码',
      passwordMismatch: '两次输入不一致',
      passwordShort: '密码至少 4 位',
      passwordSaved: '密码已保存',
      passwordChanged: '密码已修改',
      autolockSection: '空闲自动锁',
      autolockHint: '多久没有鼠标/键盘操作就重新上锁。填 0 表示不自动锁；解锁状态只存在当前页面，刷新后一律重新锁。',
      minutes: '分钟',
      save: '保存',
      autolockSaved: '自动锁设置已保存',
      emailSection: '找回邮箱（QQ）',
      emailHint: '验证码发到这个地址。需要填 QQ 邮箱的 SMTP 授权码（QQ 邮箱设置 → 账户 → POP3/SMTP 服务里生成），不是登录密码。授权码只存在本机 0600 文件里。',
      emailAddress: 'QQ 邮箱地址',
      smtpCode: 'SMTP 授权码',
      smtpCodeKept: '已保存，留空表示不修改',
      configPasswordHint: '修改找回邮箱需要总密码（否则别人可以把找回邮箱改成自己的）',
      saveEmail: '保存邮箱设置',
      emailSaved: '邮箱设置已保存',
      testEmail: '发一封测试邮件',
      testSent: '测试邮件已发出，去邮箱看看',
      recoverySection: '忘记密码',
      recoveryHint: '往已配置的邮箱发 6 位验证码，验证后直接换新密码。文件没有加密，所以重置密码不会丢数据。',
      sendCode: '发送验证码',
      codeSent: '验证码已发出，10 分钟内有效',
      code: '验证码',
      resetPassword: '重置密码',
      resetDone: '密码已重置',
      securityNote: '说明：这是界面门禁，不是磁盘加密。锁定时 DSH 里看不到、也进不去该工作区的会话，但本机其他程序、命令行、备份文件仍能读到明文；防的是别人随手点开你的 DSH。',
      gateTitle: '工作区已锁定',
      gateHint: '这个会话属于被锁定的文件夹。输入总密码继续，或返回。',
      gatePlaceholder: '总密码',
      gateSubmit: '解锁并进入',
      gateBack: '返回',
      gateWrong: '密码不对',
      gateForgot: '忘记密码？用邮箱找回',
      gateNoRecovery: '未配置找回邮箱。解锁后可在「工作区锁」面板里配置。',
      gateRecoverTitle: '邮箱找回密码',
      gateRecoverHint: '验证码会发到 {email}，10 分钟内有效。',
      gateSendCode: '发送验证码',
      gateResetAndEnter: '重置密码并解锁',
      gateBackToPassword: '返回输密码',
      folderLockedHint: '已锁定 · 在「工作区锁」面板里解锁',
      errBadRequest: '请求格式不对',
      errBadPassword: '密码不对',
      errPasswordRequired: '先设置总密码，才能锁定文件夹',
      errPasswordUnset: '还没有设置总密码',
      errEmailUnset: '先配置找回邮箱和 SMTP 授权码',
      errEmailMismatch: '邮箱与已配置的不一致',
      errRateLimited: '太频繁了，等一分钟再试',
      errCodeExpired: '验证码已过期，重新发一封',
      errCodeInvalid: '验证码不对',
      errPathNotWorkspace: '这个路径不是已注册的工作区',
      errSmtpFailed: '发信失败',
      errBadEmail: '邮箱地址格式不对',
      errPasswordTooShort: '密码至少 4 位',
      errInternal: '服务器内部错误',
    }

    const en = {
      panelTitle: 'Workspace Lock',
      panelSubtitle: 'Lock workspace folders. A locked folder collapses in the sidebar and its sessions stop showing until the shared password is entered.',
      loading: 'Loading…',
      retry: 'Retry',
      loadFailed: 'Could not load the configuration',
      noWorkspaces: 'No registered workspace yet. Create or open one from the sidebar first.',
      folders: 'Workspace folders',
      foldersHint: 'Click “Lock”; a locked folder collapses in the sidebar and every session under it is taken out of sight. Unlocking applies to this page only.',
      sessions: '{n} sessions',
      lockedTag: 'Locked',
      openTag: 'Unlocked (this page)',
      idleTag: 'Not locked',
      lock: 'Lock',
      unlock: 'Unlock',
      relock: 'Lock again',
      unlockHint: 'Enter the shared password',
      removeLock: 'Remove lock',
      removeHint: 'Enter the shared password to remove this lock permanently (not just for this page)',
      cancel: 'Cancel',
      confirmUnlock: 'Unlock',
      lockedToast: 'Locked',
      unlockedToast: 'Unlocked until the idle timeout',
      passwordSection: 'Shared password',
      passwordUnset: 'No password yet. Set one before locking a folder.',
      passwordSet: 'Password is set. Changing it requires the current one.',
      currentPassword: 'Current password',
      newPassword: 'New password',
      confirmPassword: 'Repeat it',
      setPassword: 'Set password',
      changePassword: 'Change password',
      passwordMismatch: 'The two entries do not match',
      passwordShort: 'At least 4 characters',
      passwordSaved: 'Password saved',
      passwordChanged: 'Password changed',
      autolockSection: 'Idle auto-lock',
      autolockHint: 'Relock after this many minutes without mouse or keyboard activity. 0 turns auto-lock off. Unlock state lives in this page only and is lost on reload.',
      minutes: 'minutes',
      save: 'Save',
      autolockSaved: 'Auto-lock setting saved',
      emailSection: 'Recovery mailbox (QQ)',
      emailHint: 'Codes are sent here. Fill in the QQ Mail SMTP authorization code (QQ Mail settings → Account → POP3/SMTP), not the login password. The code is stored only in a 0600 file on this machine.',
      emailAddress: 'QQ Mail address',
      smtpCode: 'SMTP authorization code',
      smtpCodeKept: 'Saved — leave blank to keep it',
      configPasswordHint: 'Changing the recovery mailbox requires the shared password (otherwise someone could point recovery at their own mailbox)',
      saveEmail: 'Save mailbox settings',
      emailSaved: 'Mailbox settings saved',
      testEmail: 'Send a test email',
      testSent: 'Test email sent — check the mailbox',
      recoverySection: 'Forgot the password',
      recoveryHint: 'Send a 6-digit code to the configured mailbox, then set a new password. Nothing is encrypted, so resetting loses no data.',
      sendCode: 'Send code',
      codeSent: 'Code sent, valid for 10 minutes',
      code: 'Code',
      resetPassword: 'Reset password',
      resetDone: 'Password reset',
      securityNote: 'Note: this is a UI gate, not disk encryption. While locked, DSH neither lists nor opens sessions under that folder, but other programs, shells and backups can still read the plaintext. It stops someone casually clicking through your DSH.',
      gateTitle: 'Workspace locked',
      gateHint: 'This session belongs to a locked folder. Enter the shared password to continue, or go back.',
      gatePlaceholder: 'Shared password',
      gateSubmit: 'Unlock and enter',
      gateBack: 'Go back',
      gateWrong: 'Wrong password',
      gateForgot: 'Forgot it? Recover by email',
      gateNoRecovery: 'No recovery mailbox configured. Set one in the Workspace Lock panel after unlocking.',
      gateRecoverTitle: 'Recover by email',
      gateRecoverHint: 'A code goes to {email} and is valid for 10 minutes.',
      gateSendCode: 'Send code',
      gateResetAndEnter: 'Reset and unlock',
      gateBackToPassword: 'Back to password',
      folderLockedHint: 'Locked · unlock it in the Workspace lock panel',
      errBadRequest: 'Malformed request',
      errBadPassword: 'Wrong password',
      errPasswordRequired: 'Set the shared password before locking a folder',
      errPasswordUnset: 'No shared password yet',
      errEmailUnset: 'Configure the recovery mailbox and SMTP code first',
      errEmailMismatch: 'The mailbox does not match the configured one',
      errRateLimited: 'Too frequent — wait a minute',
      errCodeExpired: 'Code expired — request a new one',
      errCodeInvalid: 'Wrong code',
      errPathNotWorkspace: 'That path is not a registered workspace',
      errSmtpFailed: 'Sending failed',
      errBadEmail: 'Invalid email address',
      errPasswordTooShort: 'At least 4 characters',
      errInternal: 'Internal server error',
    }

    // -----------------------------------------------------------------------
    // 页面内共享状态
    // -----------------------------------------------------------------------

    let t = (key) => key
    let layout = null
    let uiWorkspace = null
    let lastActivity = Date.now()

    let snap = {
      ready: false,
      passwordSet: false,
      autoLockMinutes: 15,
      lockedPaths: [],
      unlockedPaths: [],
      hiddenSessionIds: [],
      lockedWorkspaceIds: [],
      email: '',
      emailConfigured: false,
      activeSessionId: null,
      activeCwd: null,
      error: '',
    }

    const listeners = new Set()

    function publish(patch) {
      snap = { ...snap, ...patch }
      for (const listener of [...listeners]) {
        try {
          listener()
        } catch {
          /* 订阅者自己坏了不该拖垮别人 */
        }
      }
      scheduleSync()
    }

    function subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }

    function useLockState() {
      return React.useSyncExternalStore(subscribe, () => snap, () => snap)
    }

    function touch() {
      lastActivity = Date.now()
    }

    function norm(value) {
      if (typeof value !== 'string' || value.trim() === '') return ''
      const trimmed = value.trim().replace(/\/+$/, '')
      return trimmed === '' ? '/' : trimmed
    }

    /** cwd 落在哪个被锁路径里（最长前缀），返回那个路径。 */
    function lockedMatch(cwd) {
      const current = norm(cwd)
      if (current === '') return null
      let best = null
      for (const raw of snap.lockedPaths) {
        const base = norm(raw)
        if (base === '' || base === '/') continue
        if (current === base || current.startsWith(`${base}/`)) {
          if (best === null || base.length > best.length) best = base
        }
      }
      return best
    }

    /** cwd 属于哪个已注册工作区（最长前缀）。 */
    function workspacePathFor(cwd, items) {
      const current = norm(cwd)
      if (current === '') return null
      let best = null
      for (const workspace of items || []) {
        const base = norm(workspace.path)
        if (base === '') continue
        if (current === base || current.startsWith(`${base}/`)) {
          if (best === null || base.length > best.length) best = base
        }
      }
      return best
    }

    function basename(value) {
      const parts = norm(value).split('/').filter(Boolean)
      return parts.length > 0 ? parts[parts.length - 1] : value
    }

    function errorText(code, message) {
      if (!code) return message || t('errInternal')
      const key = `err${code.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')}`
      const text = t(key)
      return text === key ? (message || code) : text
    }

    async function call(path, body) {
      const init = body === undefined
        ? { headers: { accept: 'application/json' } }
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(body),
          }
      const response = await fetch(API + path, init)
      const data = await response.json().catch(() => null)
      if (!data) throw new Error(`HTTP ${response.status}`)
      return data
    }

    function absorb(data) {
      if (!data || data.ok !== true) return
      publish({
        ready: true,
        passwordSet: Boolean(data.passwordSet),
        autoLockMinutes: Number(data.autoLockMinutes) || 0,
        lockedPaths: Array.isArray(data.lockedPaths) ? data.lockedPaths : [],
        email: typeof data.email === 'string' ? data.email : '',
        emailConfigured: Boolean(data.emailConfigured),
        error: '',
      })
    }

    async function refresh() {
      try {
        absorb(await call('/state'))
      } catch (error) {
        publish({ ready: true, error: String(error?.message ?? error) })
      }
    }

    function idleTick() {
      if (!snap.ready) return
      const minutes = Number(snap.autoLockMinutes) || 0
      if (minutes <= 0) return
      if (snap.unlockedPaths.length === 0) return
      if (Date.now() - lastActivity >= minutes * 60_000) {
        publish({ unlockedPaths: [] })
      }
    }


    // -----------------------------------------------------------------------
    // 侧栏收敛
    //
    // 侧栏的浏览区没有给插件的插槽（只有会话行有），所以这一段只能贴身操作
    // DOM：给锁定文件夹的会话行打一条 display:none 的样式表（React 重渲染
    // 抹不掉样式表，只抹得掉行内样式），再把文件夹行折起来、拦住它的点击。
    // 宿主端的 workspaces 一并给出每个文件夹的 sessionIds，没有它就没法把
    // 会话行和文件夹对上。
    // -----------------------------------------------------------------------

    const HIDE_STYLE_ID = 'ws-lock-hide-rows'
    const HINT_ID = 'ws-lock-hint'
    const ROW_SELECTOR = '[role="treeitem"][data-row-key^="workspace:"]'

    let hideSignature = ''
    let lockedGroups = new Set()
    let collapseGuard = new Map()
    let collapseInFlight = false
    let syncFrame = 0
    let rowRoot = null
    let sidebarObserver = null

    function sidebarTargets() {
      const ids = (snap.hiddenSessionIds || []).map(String)
      const groups = new Set((snap.lockedWorkspaceIds || []).map(String))
      return { groups, ids }
    }

    function applyRowStyle(ids) {
      const signature = ids.join(',')
      if (signature === hideSignature) return
      hideSignature = signature
      const style = document.getElementById(HIDE_STYLE_ID)
      if (ids.length === 0) {
        if (style) style.remove()
        return
      }
      if (typeof console !== 'undefined') {
        console.info(`[ws-lock] 侧栏收起 ${ids.length} 条会话行`)
      }
      const node = style ?? document.createElement('style')
      if (!style) {
        node.id = HIDE_STYLE_ID
        document.head.appendChild(node)
      }
      node.textContent = ids
        .map((id) => `[data-row-key="session:${id}"]{display:none !important}`)
        .join('')
    }

    function folderRows() {
      if (rowRoot === null || !rowRoot.isConnected) {
        const first = document.querySelector(ROW_SELECTOR)
        rowRoot = first ? first.parentElement : null
      }
      return (rowRoot ?? document).querySelectorAll(ROW_SELECTOR)
    }

    function collapseLocked() {
      if (lockedGroups.size === 0) return
      for (const row of folderRows()) {
        const key = String(row.getAttribute('data-row-key') ?? '').slice('workspace:'.length)
        if (!lockedGroups.has(key)) continue
        if (row.getAttribute('aria-expanded') !== 'true') continue
        const now = Date.now()
        if ((collapseGuard.get(key) ?? 0) > now) continue
        collapseGuard.set(key, now + 1500)
        collapseInFlight = true
        try {
          row.click()
        } catch {
          /* 点不动就靠那层样式顶着 */
        } finally {
          collapseInFlight = false
        }
      }
    }

    function syncSidebar() {
      const { groups, ids } = sidebarTargets()
      lockedGroups = groups
      applyRowStyle(ids)
      collapseLocked()
    }

    function scheduleSync() {
      if (syncFrame !== 0) return
      syncFrame = window.requestAnimationFrame(() => {
        syncFrame = 0
        syncSidebar()
      })
    }

    function showHint(row) {
      const old = document.getElementById(HINT_ID)
      if (old) old.remove()
      const box = document.createElement('div')
      box.id = HINT_ID
      box.setAttribute('role', 'status')
      box.textContent = t('folderLockedHint')
      const rect = row.getBoundingClientRect()
      box.style.cssText = [
        'position:fixed',
        `left:${Math.round(rect.left + 8)}px`,
        `top:${Math.round(rect.bottom + 6)}px`,
        'z-index:2147483000',
        'max-width:320px',
        'padding:7px 10px',
        'border-radius:8px',
        'font:12px/1.4 system-ui,-apple-system,sans-serif',
        'pointer-events:none',
        'color:var(--dsw-alias-text-primary,#fff)',
        'background:var(--dsw-alias-bg-floating,#22262f)',
        'border:1px solid var(--dsw-alias-border-subtle,rgba(255,255,255,.16))',
        'box-shadow:0 8px 24px rgba(0,0,0,.28)',
      ].join(';')
      document.body.appendChild(box)
      window.setTimeout(() => box.remove(), 2600)
    }

    function guardFolderClick(event) {
      if (collapseInFlight) return
      const target = event.target
      if (!(target instanceof Element)) return
      const row = target.closest(ROW_SELECTOR)
      if (!row) return
      const key = String(row.getAttribute('data-row-key') ?? '').slice('workspace:'.length)
      if (!lockedGroups.has(key)) return
      event.preventDefault()
      event.stopPropagation()
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation()
      showHint(row)
    }

    // -----------------------------------------------------------------------
    // 图标
    // -----------------------------------------------------------------------

    function LockGlyph({ size = 14, color = 'currentColor' }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        'aria-hidden': true,
        style: { display: 'block', flex: '0 0 auto' },
      }, h('path', {
        fill: color,
        d: 'M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm0 2a3 3 0 0 1 3 3v3H9V7a3 3 0 0 1 3-3Zm0 11a2 2 0 0 1 1 3.732V20a1 1 0 1 1-2 0v-1.268A2 2 0 0 1 12 15Z',
      }))
    }

    function PanelIcon({ size = 18, active = false }) {
      return h(LockGlyph, {
        size,
        color: active ? 'var(--dsw-alias-brand-primary)' : 'currentColor',
      })
    }

    // -----------------------------------------------------------------------
    // 样式
    // -----------------------------------------------------------------------

    const PAGE = {
      height: '100%',
      overflowY: 'auto',
      background: 'var(--dsw-alias-bg-base)',
      color: 'var(--dsw-alias-label-primary)',
      padding: '28px clamp(20px, 4vw, 48px) 56px',
      boxSizing: 'border-box',
    }
    const INNER = { maxWidth: '860px', margin: '0 auto' }
    const CARD = {
      border: '1px solid var(--dsw-alias-border-l2)',
      background: 'var(--dsw-alias-bg-layer-2)',
      borderRadius: '10px',
      padding: '14px 16px',
      marginBottom: '12px',
      boxSizing: 'border-box',
    }
    const H2 = { fontSize: '14px', fontWeight: 600, margin: '0 0 8px', lineHeight: 1.4 }
    const HINT = {
      color: 'var(--dsw-alias-label-secondary)',
      fontSize: '12px',
      lineHeight: 1.65,
      margin: '0 0 10px',
      whiteSpace: 'pre-wrap',
    }
    const LABEL = {
      display: 'block',
      color: 'var(--dsw-alias-label-secondary)',
      fontSize: '11px',
      margin: '0 0 4px',
    }
    const INPUT = {
      width: '100%',
      boxSizing: 'border-box',
      padding: '5px 8px',
      fontSize: '12px',
      lineHeight: 1.5,
      color: 'var(--dsw-alias-label-primary)',
      background: 'var(--dsw-alias-bg-surface, var(--dsw-alias-bg-base))',
      border: '1px solid var(--dsw-alias-border-l2)',
      borderRadius: '6px',
      outline: 'none',
    }
    const BTN = {
      font: 'inherit',
      fontSize: '12px',
      lineHeight: 1.5,
      padding: '4px 12px',
      borderRadius: '999px',
      border: '1px solid var(--dsw-alias-border-l2)',
      background: 'transparent',
      color: 'var(--dsw-alias-label-primary)',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    }
    const BTN_PRIMARY = {
      ...BTN,
      border: '1px solid transparent',
      background: 'var(--dsw-alias-button-primary-fill)',
      color: 'var(--dsw-alias-label-primary-foreground)',
    }
    const BTN_DANGER = {
      ...BTN,
      color: 'var(--dsw-alias-state-error-primary)',
      borderColor: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent)',
    }
    const ROW = {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '9px 0',
      borderTop: '1px solid var(--dsw-alias-border-l1)',
    }
    const MUTED = { color: 'var(--dsw-alias-label-secondary)', fontSize: '11px', lineHeight: 1.5 }
    const OK = { color: 'var(--dsw-alias-state-success-primary)', fontSize: '11px' }
    const ERR = { color: 'var(--dsw-alias-state-error-primary)', fontSize: '11px' }

    function Notice({ kind = 'muted', children }) {
      if (!children) return null
      return h('div', { style: kind === 'error' ? ERR : kind === 'ok' ? OK : MUTED }, children)
    }

    // -----------------------------------------------------------------------
    // 当前会话探针
    // -----------------------------------------------------------------------

    function SessionProbe(props) {
      const sessionId = props.sessionId
      const cwd = props.useSessions((state) => state.byId[sessionId]?.cwd)
      const items = props.useWorkspaces((state) => state.items)
      const resolved = React.useMemo(
        () => workspacePathFor(cwd, items) || (cwd ? norm(cwd) : null),
        [cwd, items],
      )
      React.useEffect(() => {
        if (snap.activeSessionId === sessionId && snap.activeCwd === resolved) return undefined
        publish({ activeSessionId: sessionId, activeCwd: resolved })
        return () => {
          publish({ activeSessionId: null, activeCwd: null })
        }
      }, [sessionId, resolved])
      return null
    }


    // 侧栏要收起哪些行，得先知道「哪条会话落在锁定路径里」和「哪个工作区被锁」。
    // 这两样只有插槽的 props 拿得到（useSessions / useWorkspaces），所以挂一个
    // 什么都不画的组件在 shell.overlay 上，把算好的两份清单写进页面状态；
    // 下面的 DOM 那一段只认状态，不碰 React 树。
    function LockSync(props) {
      const state = useLockState()
      const sessionIds = props.useSessions((value) => value.ids)
      const sessionsById = props.useSessions((value) => value.byId)
      const workspaceItems = props.useWorkspaces((value) => value.items)

      React.useEffect(() => {
        const hidden = []
        for (const id of sessionIds || []) {
          const lock = lockedMatch(sessionsById?.[id]?.cwd)
          if (lock !== null && !snap.unlockedPaths.includes(lock)) hidden.push(String(id))
        }
        const groups = []
        for (const item of workspaceItems || []) {
          const lock = lockedMatch(item?.path)
          if (lock !== null && !snap.unlockedPaths.includes(lock)) groups.push(String(item?.workspaceId ?? ''))
        }
        const sameIds = hidden.length === snap.hiddenSessionIds.length && hidden.every((id, i) => id === snap.hiddenSessionIds[i])
        const sameGroups = groups.length === snap.lockedWorkspaceIds.length && groups.every((id, i) => id === snap.lockedWorkspaceIds[i])
        if (sameIds && sameGroups) return
        publish({ hiddenSessionIds: hidden, lockedWorkspaceIds: groups })
      }, [sessionIds, sessionsById, workspaceItems, state.lockedPaths, state.unlockedPaths])

      return null
    }

    // -----------------------------------------------------------------------
    // 全屏锁屏
    // -----------------------------------------------------------------------

    function Gate(props) {
      const state = useLockState()
      const sessionIds = props.useSessions((value) => value.ids)
      const sessionsById = props.useSessions((value) => value.byId)
      const workspaceItems = props.useWorkspaces((value) => value.items)
      const [password, setPassword] = React.useState('')
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [mode, setMode] = React.useState('password')
      const [recoverSent, setRecoverSent] = React.useState(false)
      const [recoverCode, setRecoverCode] = React.useState('')
      const [recoverNext, setRecoverNext] = React.useState('')
      const [recoverConfirm, setRecoverConfirm] = React.useState('')
      const [recoverBusy, setRecoverBusy] = React.useState(false)
      const [recoverError, setRecoverError] = React.useState('')
      const [recoverOk, setRecoverOk] = React.useState('')

      React.useEffect(() => {
        if (!snap.ready) refresh()
      }, [state.ready])

      const lock = state.ready ? lockedMatch(state.activeCwd) : null
      const locked = Boolean(lock) && !state.unlockedPaths.includes(lock)

      React.useEffect(() => {
        if (!locked) return
        setPassword('')
        setError('')
        setMode('password')
        setRecoverSent(false)
        setRecoverCode('')
        setRecoverNext('')
        setRecoverConfirm('')
        setRecoverError('')
        setRecoverOk('')
      }, [lock, locked])

      if (!locked) return null

      const unlock = () => {
        touch()
        publish({ unlockedPaths: [...snap.unlockedPaths.filter((item) => item !== lock), lock] })
      }

      const submit = async () => {
        if (busy) return
        if (password === '') {
          setError(t('gateWrong'))
          return
        }
        setBusy(true)
        setError('')
        try {
          const data = await call('/verify', { path: lock, password })
          if (data.ok) {
            unlock()
            setPassword('')
          } else {
            setError(errorText(data.code, data.message))
          }
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        } finally {
          setBusy(false)
        }
      }

      const back = () => {
        // 不能只把 active 清空：那样锁屏会撤掉、锁定会话直接露出来。
        // 真正离开的方式是切到另一个未锁定的会话；没有就新开一个，再不行去面板。
        const rows = sessionIds.map((id) => sessionsById[id]).filter(Boolean)
        const outside = rows
          .filter((row) => row.cwd && row.origin !== 'subagent' && !lockedMatch(row.cwd))
          .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
        if (outside.length > 0) {
          try {
            uiWorkspace?.openSession?.(outside[0].id)
            return
          } catch {
            /* 继续尝试新会话 */
          }
        }
        const free = (workspaceItems || []).find((workspace) => !lockedMatch(workspace.path))
        try {
          if (free) uiWorkspace?.startSession?.(free.workspaceId)
          else uiWorkspace?.startSession?.()
        } catch {
          try {
            layout?.selectPanel?.('ws-lock')
          } catch {
            /* 锁屏保持不动 */
          }
        }
      }

      const sendRecover = async () => {
        if (recoverBusy) return
        setRecoverBusy(true)
        setRecoverError('')
        setRecoverOk('')
        try {
          const data = await call('/recover/request', {})
          if (data.ok) {
            setRecoverSent(true)
            setRecoverOk(t('codeSent'))
          } else {
            setRecoverError(errorText(data.code, data.message))
          }
        } catch (failure) {
          setRecoverError(String(failure?.message ?? failure))
        } finally {
          setRecoverBusy(false)
        }
      }

      const resetRecover = async () => {
        if (recoverBusy) return
        setRecoverError('')
        setRecoverOk('')
        if (recoverNext.length < 4) {
          setRecoverError(t('passwordShort'))
          return
        }
        if (recoverNext !== recoverConfirm) {
          setRecoverError(t('passwordMismatch'))
          return
        }
        setRecoverBusy(true)
        try {
          const data = await call('/recover/verify', { code: recoverCode, next: recoverNext })
          if (data.ok) {
            publish({ passwordSet: true, unlockedPaths: [] })
            setRecoverCode('')
            setRecoverNext('')
            setRecoverConfirm('')
            setRecoverSent(false)
            setMode('password')
            unlock()
          } else {
            setRecoverError(errorText(data.code, data.message))
          }
        } catch (failure) {
          setRecoverError(String(failure?.message ?? failure))
        } finally {
          setRecoverBusy(false)
        }
      }

      const canRecover = state.passwordSet && state.emailConfigured
      const linkStyle = {
        background: 'none',
        border: 0,
        padding: 0,
        color: 'var(--dsw-alias-brand-primary)',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: '12px',
      }

      const body = mode === 'password'
        ? [
            h('div', { key: 'hint', style: { ...HINT, textAlign: 'center', marginBottom: '14px' } }, t('gateHint')),
            h('input', {
              key: 'input',
              type: 'password',
              autoFocus: true,
              value: password,
              placeholder: t('gatePlaceholder'),
              'aria-label': t('gatePlaceholder'),
              onChange: (event) => {
                touch()
                setPassword(event.target.value)
              },
              onKeyDown: (event) => {
                touch()
                if (event.key === 'Enter') submit()
              },
              style: { ...INPUT, padding: '8px 10px', fontSize: '13px', marginBottom: '8px' },
            }),
            error ? h('div', { key: 'error', style: { ...ERR, marginBottom: '8px' } }, error) : null,
            canRecover
              ? h('button', {
                  key: 'forgot',
                  type: 'button',
                  style: { ...linkStyle, display: 'block', margin: '0 0 12px auto' },
                  onClick: () => {
                    setMode('recover')
                    setRecoverError('')
                    setRecoverOk('')
                  },
                }, t('gateForgot'))
              : h('div', { key: 'norecover', style: { ...MUTED, marginBottom: '12px' } }, t('gateNoRecovery')),
            h('div', { key: 'actions', style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } }, [
              h('button', { key: 'back', type: 'button', style: BTN, onClick: back }, t('gateBack')),
              h('button', {
                key: 'go',
                type: 'button',
                style: BTN_PRIMARY,
                disabled: busy,
                onClick: submit,
              }, busy ? '…' : t('gateSubmit')),
            ]),
          ]
        : [
            h('div', { key: 'rhint', style: { ...HINT, textAlign: 'center', marginBottom: '10px' } },
              t('gateRecoverHint').replace('{email}', state.email)),
            h('div', { key: 'sendrow', style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' } }, [
              h('button', { key: 's', type: 'button', style: BTN, disabled: recoverBusy, onClick: sendRecover }, t('gateSendCode')),
              recoverOk ? h('span', { key: 'o', style: OK }, recoverOk) : null,
            ]),
            recoverSent
              ? h('div', { key: 'form' }, [
                  h('input', {
                    key: 'code',
                    type: 'text',
                    inputMode: 'numeric',
                    maxLength: 6,
                    value: recoverCode,
                    placeholder: t('code'),
                    'aria-label': t('code'),
                    onChange: (event) => setRecoverCode(event.target.value),
                    style: { ...INPUT, marginBottom: '8px' },
                  }),
                  h('input', {
                    key: 'next',
                    type: 'password',
                    value: recoverNext,
                    placeholder: t('newPassword'),
                    'aria-label': t('newPassword'),
                    autoComplete: 'new-password',
                    onChange: (event) => setRecoverNext(event.target.value),
                    style: { ...INPUT, marginBottom: '8px' },
                  }),
                  h('input', {
                    key: 'confirm',
                    type: 'password',
                    value: recoverConfirm,
                    placeholder: t('confirmPassword'),
                    'aria-label': t('confirmPassword'),
                    autoComplete: 'new-password',
                    onChange: (event) => setRecoverConfirm(event.target.value),
                    style: { ...INPUT, marginBottom: '8px' },
                  }),
                  h('button', {
                    key: 'reset',
                    type: 'button',
                    style: { ...BTN_PRIMARY, width: '100%' },
                    disabled: recoverBusy,
                    onClick: resetRecover,
                  }, recoverBusy ? '…' : t('gateResetAndEnter')),
                ])
              : null,
            recoverError ? h('div', { key: 'rerror', style: { ...ERR, marginTop: '8px' } }, recoverError) : null,
            h('div', { key: 'ractions', style: { display: 'flex', justifyContent: 'space-between', marginTop: '12px' } }, [
              h('button', {
                key: 'back',
                type: 'button',
                style: linkStyle,
                onClick: () => {
                  setMode('password')
                  setRecoverError('')
                  setRecoverOk('')
                },
              }, t('gateBackToPassword')),
              h('button', { key: 'leave', type: 'button', style: BTN, onClick: back }, t('gateBack')),
            ]),
          ]

      return h('div', {
        style: {
          position: 'fixed',
          inset: 0,
          zIndex: 2147483000,
          background: 'var(--dsw-alias-bg-base)',
          color: 'var(--dsw-alias-label-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'auto',
          padding: '24px',
        },
        onPointerDown: touch,
        onKeyDown: touch,
      }, h('div', {
        style: {
          width: '100%',
          maxWidth: '380px',
          border: '1px solid var(--dsw-alias-border-l2)',
          background: 'var(--dsw-alias-bg-layer-2)',
          borderRadius: '14px',
          padding: '22px 22px 18px',
          boxShadow: 'var(--dsw-shadow-lv2, 0 12px 32px rgba(0,0,0,.18))',
        },
      }, [
        h('div', { key: 'icon', style: { display: 'flex', justifyContent: 'center', marginBottom: '10px', color: 'var(--dsw-alias-brand-primary)' } },
          h(LockGlyph, { size: 30 })),
        h('div', { key: 'title', style: { textAlign: 'center', fontSize: '15px', fontWeight: 600, marginBottom: '6px' } },
          mode === 'password' ? t('gateTitle') : t('gateRecoverTitle')),
        ...body,
      ]))
    }

    // -----------------------------------------------------------------------
    // 面板
    // -----------------------------------------------------------------------

    function PasswordCard() {
      const state = useLockState()
      const [current, setCurrent] = React.useState('')
      const [next, setNext] = React.useState('')
      const [confirm, setConfirm] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [ok, setOk] = React.useState('')

      const submit = async () => {
        setError('')
        setOk('')
        if (next.length < 4) {
          setError(t('passwordShort'))
          return
        }
        if (next !== confirm) {
          setError(t('passwordMismatch'))
          return
        }
        setBusy(true)
        try {
          const data = await call('/password', { current, next })
          if (data.ok) {
            absorb(data)
            setCurrent('')
            setNext('')
            setConfirm('')
            setOk(state.passwordSet ? t('passwordChanged') : t('passwordSaved'))
          } else {
            setError(errorText(data.code, data.message))
          }
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        } finally {
          setBusy(false)
        }
      }

      return h('div', { style: CARD }, [
        h('div', { key: 'h', style: H2 }, t('passwordSection')),
        h('div', { key: 'hint', style: HINT }, state.passwordSet ? t('passwordSet') : t('passwordUnset')),
        state.passwordSet
          ? h('div', { key: 'current', style: { marginBottom: '8px' } }, [
              h('label', { key: 'l', style: LABEL }, t('currentPassword')),
              h('input', {
                key: 'i', type: 'password', value: current, style: INPUT,
                autoComplete: 'current-password',
                onChange: (event) => setCurrent(event.target.value),
              }),
            ])
          : null,
        h('div', { key: 'next', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' } }, [
          h('div', { key: 'a' }, [
            h('label', { key: 'l', style: LABEL }, t('newPassword')),
            h('input', {
              key: 'i', type: 'password', value: next, style: INPUT,
              autoComplete: 'new-password',
              onChange: (event) => setNext(event.target.value),
            }),
          ]),
          h('div', { key: 'b' }, [
            h('label', { key: 'l', style: LABEL }, t('confirmPassword')),
            h('input', {
              key: 'i', type: 'password', value: confirm, style: INPUT,
              autoComplete: 'new-password',
              onKeyDown: (event) => { if (event.key === 'Enter') submit() },
              onChange: (event) => setConfirm(event.target.value),
            }),
          ]),
        ]),
        h('div', { key: 'actions', style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
          h('button', { key: 'b', type: 'button', style: BTN_PRIMARY, disabled: busy, onClick: submit },
            busy ? '…' : (state.passwordSet ? t('changePassword') : t('setPassword'))),
          error ? h('span', { key: 'e', style: ERR }, error) : null,
          ok ? h('span', { key: 'o', style: OK }, ok) : null,
        ]),
      ])
    }

    function FolderRow({ workspace }) {
      const state = useLockState()
      const target = norm(workspace.path)
      const locked = state.lockedPaths.includes(target)
      const open = state.unlockedPaths.includes(target)
      const [prompt, setPrompt] = React.useState(false)
      const [mode, setMode] = React.useState('unlock')
      const [password, setPassword] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')

      const ask = (nextMode) => {
        setPrompt(true)
        setMode(nextMode)
        setPassword('')
        setError('')
      }

      const closePrompt = () => {
        setPrompt(false)
        setPassword('')
        setError('')
      }

      const lock = async () => {
        setError('')
        if (!state.passwordSet) {
          setError(t('errPasswordRequired'))
          return
        }
        setBusy(true)
        try {
          const data = await call('/toggle', { path: target, locked: true })
          if (data.ok) absorb(data)
          else setError(errorText(data.code, data.message))
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        } finally {
          setBusy(false)
        }
      }

      const submit = async () => {
        if (password === '') return
        setBusy(true)
        setError('')
        try {
          if (mode === 'remove') {
            const data = await call('/toggle', { path: target, locked: false, password })
            if (data.ok) {
              absorb(data)
              publish({ unlockedPaths: snap.unlockedPaths.filter((item) => item !== target) })
              closePrompt()
            } else {
              setError(errorText(data.code, data.message))
            }
          } else {
            const data = await call('/verify', { path: target, password })
            if (data.ok) {
              touch()
              publish({ unlockedPaths: [...snap.unlockedPaths.filter((item) => item !== target), target] })
              closePrompt()
            } else {
              setError(errorText(data.code, data.message))
            }
          }
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        } finally {
          setBusy(false)
        }
      }

      const relock = () => {
        publish({ unlockedPaths: snap.unlockedPaths.filter((item) => item !== target) })
        setError('')
      }

      const sessions = Array.isArray(workspace.sessionIds) ? workspace.sessionIds.length : 0
      const actions = []
      if (locked) {
        if (open) {
          actions.push(h('button', { key: 'relock', type: 'button', style: BTN, onClick: relock }, t('relock')))
        } else {
          actions.push(h('button', { key: 'unlock', type: 'button', style: BTN, onClick: () => ask('unlock') }, t('unlock')))
        }
        actions.push(h('button', { key: 'remove', type: 'button', style: BTN_DANGER, onClick: () => ask('remove') }, t('removeLock')))
      } else {
        actions.push(h('button', { key: 'lock', type: 'button', style: BTN, disabled: busy, onClick: lock }, t('lock')))
      }

      return h('div', { style: { ...ROW, flexWrap: 'wrap', alignItems: 'flex-start' } }, [
        h('button', {
          key: 'icon',
          type: 'button',
          title: locked ? t('lockedTag') : t('lock'),
          'aria-label': locked ? t('lockedTag') : t('lock'),
          onClick: locked ? (open ? relock : () => ask('unlock')) : lock,
          disabled: busy,
          style: {
            width: '28px', height: '28px', flex: '0 0 auto', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            borderRadius: '7px',
            border: '1px solid ' + (locked ? 'color-mix(in srgb, var(--dsw-alias-state-warn-primary, var(--dsw-alias-brand-primary)) 45%, transparent)' : 'var(--dsw-alias-border-l2)'),
            background: locked ? 'color-mix(in srgb, var(--dsw-alias-state-warn-primary, var(--dsw-alias-brand-primary)) 12%, transparent)' : 'transparent',
            color: locked ? 'var(--dsw-alias-state-warn-primary, var(--dsw-alias-brand-primary))' : 'var(--dsw-alias-label-secondary)',
          },
        }, h(LockGlyph, { size: 15 })),
        h('div', { key: 'text', style: { flex: '1 1 220px', minWidth: 0 } }, [
          h('div', { key: 'name', style: { fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            workspace.title || basename(workspace.path)),
          h('div', { key: 'path', style: { ...MUTED, fontFamily: 'var(--ds-font-family-code, ui-monospace, monospace)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            workspace.path),
          h('div', { key: 'meta', style: { ...MUTED, marginTop: '1px' } }, [
            t('sessions').replace('{n}', String(sessions)),
            ' · ',
            h('span', {
              key: 'tag',
              style: { color: locked ? (open ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-warn-primary, var(--dsw-alias-brand-primary))') : 'var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))' },
            }, locked ? (open ? t('openTag') : t('lockedTag')) : t('idleTag')),
          ]),
        ]),
        h('div', { key: 'actions', style: { display: 'flex', alignItems: 'center', gap: '6px', flex: '0 0 auto', flexWrap: 'wrap' } }, actions),
        prompt && locked
          ? h('div', { key: 'prompt', style: { flex: '1 1 100%', display: 'flex', gap: '8px', alignItems: 'center', paddingTop: '6px', flexWrap: 'wrap' } }, [
              h('input', {
                key: 'i', type: 'password', value: password,
                placeholder: mode === 'remove' ? t('removeHint') : t('unlockHint'),
                style: { ...INPUT, flex: '1 1 220px' },
                autoFocus: true,
                onChange: (event) => setPassword(event.target.value),
                onKeyDown: (event) => { if (event.key === 'Enter') submit() },
              }),
              h('button', { key: 'go', type: 'button', style: mode === 'remove' ? BTN_DANGER : BTN_PRIMARY, disabled: busy, onClick: submit },
                mode === 'remove' ? t('removeLock') : t('confirmUnlock')),
              h('button', { key: 'c', type: 'button', style: BTN, onClick: closePrompt }, t('cancel')),
            ])
          : null,
        error ? h('div', { key: 'err', style: { flex: '1 1 100%', paddingTop: '2px' } }, h(Notice, { kind: 'error' }, error)) : null,
      ])
    }

    function AutoLockCard() {
      const state = useLockState()
      const [minutes, setMinutes] = React.useState(String(state.autoLockMinutes))
      const [busy, setBusy] = React.useState(false)
      const [ok, setOk] = React.useState('')
      const [error, setError] = React.useState('')

      React.useEffect(() => {
        setMinutes(String(state.autoLockMinutes))
      }, [state.autoLockMinutes])

      const save = async () => {
        setError('')
        setOk('')
        setBusy(true)
        try {
          const data = await call('/config', { autoLockMinutes: Number(minutes) })
          if (data.ok) {
            absorb(data)
            setOk(t('autolockSaved'))
          } else {
            setError(errorText(data.code, data.message))
          }
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        } finally {
          setBusy(false)
        }
      }

      return h('div', { style: CARD }, [
        h('div', { key: 'h', style: H2 }, t('autolockSection')),
        h('div', { key: 'hint', style: HINT }, t('autolockHint')),
        h('div', { key: 'row', style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
          h('input', {
            key: 'i', type: 'number', min: 0, max: 1440, step: 1, value: minutes,
            'aria-label': t('autolockSection'),
            style: { ...INPUT, width: '90px' },
            onChange: (event) => setMinutes(event.target.value),
          }),
          h('span', { key: 'u', style: MUTED }, t('minutes')),
          h('button', { key: 'b', type: 'button', style: BTN_PRIMARY, disabled: busy, onClick: save }, t('save')),
          error ? h('span', { key: 'e', style: ERR }, error) : null,
          ok ? h('span', { key: 'o', style: OK }, ok) : null,
        ]),
      ])
    }

    function EmailCard() {
      const state = useLockState()
      const [email, setEmail] = React.useState(state.email)
      const [code, setCode] = React.useState('')
      const [current, setCurrent] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [ok, setOk] = React.useState('')
      const [error, setError] = React.useState('')

      React.useEffect(() => {
        setEmail(state.email)
      }, [state.email])

      const save = async () => {
        setError('')
        setOk('')
        setBusy(true)
        try {
          const data = await call('/config', { email, smtpAuthCode: code, current })
          if (data.ok) {
            absorb(data)
            setCode('')
            setCurrent('')
            setOk(t('emailSaved'))
          } else {
            setError(errorText(data.code, data.message))
          }
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        } finally {
          setBusy(false)
        }
      }

      const test = async () => {
        setError('')
        setOk('')
        setBusy(true)
        try {
          const data = await call('/test-email', {})
          if (data.ok) setOk(t('testSent'))
          else setError(errorText(data.code, data.message))
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        } finally {
          setBusy(false)
        }
      }

      return h('div', { style: CARD }, [
        h('div', { key: 'h', style: H2 }, t('emailSection')),
        h('div', { key: 'hint', style: HINT }, t('emailHint')),
        h('div', { key: 'row', style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '8px', marginBottom: '10px' } }, [
          h('div', { key: 'e' }, [
            h('label', { key: 'l', style: LABEL }, t('emailAddress')),
            h('input', {
              key: 'i', type: 'email', value: email, style: INPUT,
              placeholder: 'name@qq.com',
              onChange: (event) => setEmail(event.target.value),
            }),
          ]),
          h('div', { key: 'c' }, [
            h('label', { key: 'l', style: LABEL }, t('smtpCode')),
            h('input', {
              key: 'i', type: 'password', value: code, style: INPUT,
              placeholder: state.emailConfigured ? t('smtpCodeKept') : '',
              autoComplete: 'off',
              onChange: (event) => setCode(event.target.value),
            }),
          ]),
        ]),
        state.passwordSet
          ? h('div', { key: 'guard', style: { marginBottom: '10px' } }, [
              h('label', { key: 'l', style: LABEL }, t('configPasswordHint')),
              h('input', {
                key: 'i', type: 'password', value: current, style: INPUT,
                autoComplete: 'current-password',
                onChange: (event) => setCurrent(event.target.value),
              }),
            ])
          : null,
        h('div', { key: 'actions', style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } }, [
          h('button', { key: 's', type: 'button', style: BTN_PRIMARY, disabled: busy, onClick: save }, t('saveEmail')),
          h('button', { key: 't', type: 'button', style: BTN, disabled: busy || !state.emailConfigured, onClick: test }, t('testEmail')),
          error ? h('span', { key: 'e', style: ERR }, error) : null,
          ok ? h('span', { key: 'o', style: OK }, ok) : null,
        ]),
      ])
    }

    function RecoveryCard() {
      const state = useLockState()
      const [sent, setSent] = React.useState(false)
      const [code, setCode] = React.useState('')
      const [next, setNext] = React.useState('')
      const [confirm, setConfirm] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [ok, setOk] = React.useState('')

      if (!state.passwordSet || !state.emailConfigured) {
        return h('div', { style: CARD }, [
          h('div', { key: 'h', style: H2 }, t('recoverySection')),
          h('div', { key: 'hint', style: HINT }, state.passwordSet ? t('errEmailUnset') : t('passwordUnset')),
        ])
      }

      const send = async () => {
        setError('')
        setOk('')
        setBusy(true)
        try {
          const data = await call('/recover/request', {})
          if (data.ok) {
            setSent(true)
            setOk(t('codeSent'))
          } else {
            setError(errorText(data.code, data.message))
          }
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        } finally {
          setBusy(false)
        }
      }

      const reset = async () => {
        setError('')
        setOk('')
        if (next.length < 4) {
          setError(t('passwordShort'))
          return
        }
        if (next !== confirm) {
          setError(t('passwordMismatch'))
          return
        }
        setBusy(true)
        try {
          const data = await call('/recover/verify', { code, next })
          if (data.ok) {
            publish({ passwordSet: true, unlockedPaths: [] })
            setCode('')
            setNext('')
            setConfirm('')
            setSent(false)
            setOk(t('resetDone'))
          } else {
            setError(errorText(data.code, data.message))
          }
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        } finally {
          setBusy(false)
        }
      }

      return h('div', { style: CARD }, [
        h('div', { key: 'h', style: H2 }, t('recoverySection')),
        h('div', { key: 'hint', style: HINT }, t('recoveryHint')),
        h('div', { key: 'sendrow', style: { display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' } }, [
          h('button', { key: 's', type: 'button', style: BTN, disabled: busy, onClick: send }, t('sendCode')),
          ok ? h('span', { key: 'o', style: OK }, ok) : null,
        ]),
        sent
          ? h('div', { key: 'form' }, [
              h('div', { key: 'c', style: { marginBottom: '8px' } }, [
                h('label', { key: 'l', style: LABEL }, t('code')),
                h('input', {
                  key: 'i', type: 'text', inputMode: 'numeric', value: code, style: INPUT,
                  maxLength: 6,
                  onChange: (event) => setCode(event.target.value),
                }),
              ]),
              h('div', { key: 'p', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' } }, [
                h('input', {
                  key: 'n', type: 'password', value: next, placeholder: t('newPassword'), style: INPUT,
                  autoComplete: 'new-password',
                  onChange: (event) => setNext(event.target.value),
                }),
                h('input', {
                  key: 'r', type: 'password', value: confirm, placeholder: t('confirmPassword'), style: INPUT,
                  autoComplete: 'new-password',
                  onChange: (event) => setConfirm(event.target.value),
                }),
              ]),
              h('button', { key: 'go', type: 'button', style: BTN_PRIMARY, disabled: busy, onClick: reset }, t('resetPassword')),
            ])
          : null,
        error ? h('div', { key: 'e', style: { ...ERR, marginTop: '8px' } }, error) : null,
      ])
    }

    function Panel(props) {
      const state = useLockState()
      const items = props.useWorkspaces((value) => value.items)

      React.useEffect(() => {
        if (!snap.ready) refresh()
      }, [])

      return h('div', { style: PAGE }, h('div', { style: INNER }, [
        h('div', { key: 'head', style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' } }, [
          h('span', { key: 'i', style: { color: 'var(--dsw-alias-brand-primary)' } }, h(LockGlyph, { size: 22 })),
          h('h1', { key: 't', style: { fontSize: '19px', fontWeight: 600, margin: 0, lineHeight: 1.3 } }, t('panelTitle')),
        ]),
        h('div', { key: 'sub', style: { ...HINT, marginBottom: '18px' } }, t('panelSubtitle')),

        !state.ready
          ? h('div', { key: 'loading', style: { ...MUTED, padding: '8px 0' } }, t('loading'))
          : null,
        state.error
          ? h('div', { key: 'error', style: { ...CARD, borderColor: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent)' } }, [
              h('span', { key: 'm', style: ERR }, `${t('loadFailed')}：${state.error}`),
              h('button', { key: 'r', type: 'button', style: { ...BTN, marginLeft: '10px' }, onClick: () => { publish({ error: '' }); refresh() } }, t('retry')),
            ])
          : null,

        h(PasswordCard, { key: 'password' }),

        h('div', { key: 'folders', style: CARD }, [
          h('div', { key: 'h', style: H2 }, t('folders')),
          h('div', { key: 'hint', style: HINT }, t('foldersHint')),
          items.length === 0
            ? h('div', { key: 'empty', style: MUTED }, t('noWorkspaces'))
            : h('div', { key: 'list' }, items.map((workspace) => h(FolderRow, {
                key: workspace.workspaceId || workspace.path,
                workspace,
              }))),
        ]),

        h(AutoLockCard, { key: 'autolock' }),
        h(EmailCard, { key: 'email' }),
        h(RecoveryCard, { key: 'recovery' }),

        h('div', { key: 'note', style: { ...HINT, marginTop: '4px' } }, t('securityNote')),
      ]))
    }

    // -----------------------------------------------------------------------
    // 装载
    // -----------------------------------------------------------------------

    const inject = ['slots', 'locale', 'layout', 'uiWorkspace']

    function apply(ctx) {
      t = ctx.locale.bind(NS)
      layout = ctx.layout ?? null
      uiWorkspace = ctx.uiWorkspace ?? null

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-workspace-lock: dictionaries')

      ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: 'ws-lock',
        order: 35,
        label: () => t('panelTitle'),
        locale: NS,
      }, PanelIcon)), 'dsh-workspace-lock: sidebar icon')

      ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: 'ws-lock',
        locale: NS,
      }, Panel)), 'dsh-workspace-lock: main panel')

      ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'ws-lock-probe',
        order: 90,
        locale: NS,
      }, SessionProbe)), 'dsh-workspace-lock: active session probe')

      ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'ws-lock-sync',
        order: 89,
        locale: NS,
      }, LockSync)), 'dsh-workspace-lock: lock sync')

      ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'ws-lock-gate',
        order: 90,
        locale: NS,
      }, Gate)), 'dsh-workspace-lock: lock gate')

      ctx.effect(() => {
        document.addEventListener('click', guardFolderClick, true)
        sidebarObserver = new MutationObserver(scheduleSync)
        sidebarObserver.observe(document.body, { childList: true, subtree: true })
        scheduleSync()
        return () => {
          document.removeEventListener('click', guardFolderClick, true)
          if (sidebarObserver) sidebarObserver.disconnect()
          sidebarObserver = null
          if (syncFrame !== 0) window.cancelAnimationFrame(syncFrame)
          syncFrame = 0
          const style = document.getElementById(HIDE_STYLE_ID)
          if (style) style.remove()
          const hint = document.getElementById(HINT_ID)
          if (hint) hint.remove()
          hideSignature = ''
          rowRoot = null
          lockedGroups = new Set()
        }
      }, 'dsh-workspace-lock: sidebar collapse')

      ctx.effect(() => {
        const onActivity = () => touch()
        const options = { capture: true, passive: true }
        window.addEventListener('pointerdown', onActivity, options)
        window.addEventListener('keydown', onActivity, options)
        window.addEventListener('wheel', onActivity, options)
        window.addEventListener('touchstart', onActivity, options)
        const timer = window.setInterval(idleTick, 5000)
        const onVisible = () => {
          if (document.visibilityState === 'visible') idleTick()
        }
        document.addEventListener('visibilitychange', onVisible)
        refresh()
        return () => {
          window.removeEventListener('pointerdown', onActivity, options)
          window.removeEventListener('keydown', onActivity, options)
          window.removeEventListener('wheel', onActivity, options)
          window.removeEventListener('touchstart', onActivity, options)
          window.clearInterval(timer)
          document.removeEventListener('visibilitychange', onVisible)
        }
      }, 'dsh-workspace-lock: idle auto-lock')
    }

    return { inject, apply }
  },
})
