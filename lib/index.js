/**
 * dsh-workspace-lock —— 宿主半侧。
 *
 * 做什么：把「哪些工作区文件夹被锁」和「一套总密码」存成一份 0600 的 JSON，
 * 通过 /api/ws-lock/* 给浏览器半侧用。锁只挡 DSH 界面（会话进不去），
 * **不加密磁盘上的文件**——刻意的取舍：这是一道访问门禁，不是磁盘加密，文件本身始终是明文。
 *
 * 密码只存 scrypt 派生值；SMTP 授权码存在同一个 0600 文件里，不回传给页面。
 * 找回流程：往已配置的 QQ 邮箱发 6 位验证码，验证通过后直接换密码（文件不加密，所以不丢数据）。
 */

import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import path from 'node:path'
import tls from 'node:tls'

export const name = 'dsh-workspace-lock'
export const inject = []

const DEFAULTS = {
  version: 1,
  password: null,
  autoLockMinutes: 15,
  lockedPaths: [],
  email: '',
  smtpAuthCode: '',
  smtpHost: 'smtp.qq.com',
  smtpPort: 465,
  recovery: null,
}

const SCRYPT_N = 16384

/** 规范化工作区路径：绝对路径、去掉末尾斜杠（根目录除外）。 */
export function normalizeWorkspacePath(value) {
  if (typeof value !== 'string' || value.trim() === '') return ''
  let resolved = path.resolve(value.trim())
  if (resolved.length > 1 && resolved.endsWith(path.sep)) resolved = resolved.slice(0, -1)
  return resolved
}

/** 把明文口令做成可落盘的 scrypt 记录。 */
export function hashSecret(secret) {
  const salt = randomBytes(16)
  const hash = scryptSync(String(secret), salt, 64, { N: SCRYPT_N, r: 8, p: 1 })
  return {
    salt: salt.toString('base64'),
    hash: hash.toString('base64'),
    updatedAt: new Date().toISOString(),
  }
}

/** 校验口令；记录损坏或为空时返回 false。 */
export function verifySecret(secret, record) {
  if (!record || typeof record.salt !== 'string' || typeof record.hash !== 'string') return false
  let expected
  try {
    expected = Buffer.from(record.hash, 'base64')
  } catch {
    return false
  }
  if (expected.length === 0) return false
  let actual
  try {
    actual = scryptSync(String(secret), Buffer.from(record.salt, 'base64'), expected.length, {
      N: SCRYPT_N, r: 8, p: 1,
    })
  } catch {
    return false
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function defaultStatePath() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.trim() !== ''
    ? process.env.DSH_HOME
    : path.join(homedir(), '.dsh')
  return path.join(home, 'workspace-lock', 'state.json')
}

function normalizeState(raw) {
  const state = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) }
  state.version = 1
  state.password = state.password && typeof state.password === 'object' ? state.password : null
  const minutes = Number(state.autoLockMinutes)
  state.autoLockMinutes = Number.isFinite(minutes) && minutes >= 0 && minutes <= 1440 ? Math.floor(minutes) : 15
  state.lockedPaths = Array.isArray(state.lockedPaths)
    ? [...new Set(state.lockedPaths.map(normalizeWorkspacePath).filter(Boolean))]
    : []
  state.email = typeof state.email === 'string' ? state.email.trim() : ''
  state.smtpAuthCode = typeof state.smtpAuthCode === 'string' ? state.smtpAuthCode : ''
  state.smtpHost = typeof state.smtpHost === 'string' && state.smtpHost !== '' ? state.smtpHost : 'smtp.qq.com'
  state.smtpPort = Number.isInteger(state.smtpPort) && state.smtpPort > 0 ? state.smtpPort : 465
  state.recovery = state.recovery && typeof state.recovery === 'object' ? state.recovery : null
  return state
}

function loadState(statePath) {
  try {
    if (!existsSync(statePath)) return normalizeState({})
    const raw = JSON.parse(readFileSync(statePath, 'utf8'))
    return normalizeState(raw)
  } catch (error) {
    console.warn('[dsh-workspace-lock] 读取状态文件失败，使用默认值：', error?.message ?? error)
    return normalizeState({})
  }
}

function saveState(statePath, state) {
  const dir = path.dirname(statePath)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const tmp = `${statePath}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  renameSync(tmp, statePath)
  try {
    chmodSync(statePath, 0o600)
  } catch {
    /* 某些文件系统不支持 chmod，忽略 */
  }
}

/** 极简 SMTPS 客户端：QQ 邮箱用 465 端口 + 隐式 TLS + AUTH LOGIN。 */
class SmtpConnection {
  constructor(socket) {
    this.socket = socket
    this.buffer = ''
    this.lines = []
    this.queue = []
    this.waiters = []
    this.failure = null
    socket.setEncoding('utf8')
    socket.setTimeout(30000)
    socket.on('data', (chunk) => this.onData(chunk))
    socket.on('error', (error) => this.fail(error))
    socket.on('timeout', () => this.fail(new Error('SMTP 连接超时')))
    socket.on('close', () => this.fail(new Error('SMTP 连接已关闭')))
  }

  onData(chunk) {
    this.buffer += chunk
    let index
    while ((index = this.buffer.indexOf('\r\n')) >= 0) {
      const line = this.buffer.slice(0, index)
      this.buffer = this.buffer.slice(index + 2)
      if (!/^\d{3}/.test(line)) continue
      this.lines.push(line)
      if (/^\d{3} /.test(line)) {
        const response = { code: Number(line.slice(0, 3)), text: this.lines.join('\n') }
        this.lines = []
        const waiter = this.waiters.shift()
        if (waiter) waiter.resolve(response)
        else this.queue.push(response)
      }
    }
  }

  fail(error) {
    if (this.failure) return
    this.failure = error
    while (this.waiters.length > 0) this.waiters.shift().reject(error)
  }

  next() {
    if (this.queue.length > 0) return Promise.resolve(this.queue.shift())
    if (this.failure) return Promise.reject(this.failure)
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }))
  }

  async expect(codes) {
    const response = await this.next()
    if (Array.isArray(codes) && !codes.includes(response.code)) {
      const error = new Error(`SMTP ${response.code}: ${response.text}`)
      error.smtp = true
      throw error
    }
    return response
  }

  async command(line, codes) {
    this.socket.write(`${line}\r\n`)
    return this.expect(codes)
  }

  writeRaw(text) {
    this.socket.write(text)
  }

  end() {
    try {
      this.socket.write('QUIT\r\n')
    } catch {
      /* 已断开 */
    }
    try {
      this.socket.end()
    } catch {
      /* 已断开 */
    }
  }
}

function encodeHeaderText(text) {
  return `=?UTF-8?B?${Buffer.from(String(text), 'utf8').toString('base64')}?=`
}

function buildMessage({ from, to, subject, text }) {
  const body = Buffer.from(String(text).replace(/\r?\n/g, '\r\n'), 'utf8')
    .toString('base64')
    .replace(/(.{76})/g, '$1\r\n')
  const message = [
    `From: ${encodeHeaderText('工作区锁')} <${from}>`,
    `To: <${to}>`,
    `Subject: ${encodeHeaderText(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ].join('\r\n')
  return message
    .split('\r\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n')
}

async function sendMail({ host, port, user, pass, to, subject, text }) {
  const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true })
  const smtp = new SmtpConnection(socket)
  try {
    await smtp.expect([220])
    await smtp.command(`EHLO ${hostname().replace(/[^\w.-]/g, '') || 'localhost'}`, [250])
    await smtp.command('AUTH LOGIN', [334])
    await smtp.command(Buffer.from(user, 'utf8').toString('base64'), [334])
    await smtp.command(Buffer.from(pass, 'utf8').toString('base64'), [235, 503])
    await smtp.command(`MAIL FROM:<${user}>`, [250])
    await smtp.command(`RCPT TO:<${to}>`, [250, 251])
    await smtp.command('DATA', [354])
    smtp.writeRaw(`${buildMessage({ from: user, to, subject, text })}\r\n.\r\n`)
    await smtp.expect([250])
    smtp.end()
  } catch (error) {
    try {
      socket.destroy()
    } catch {
      /* 已断开 */
    }
    throw error
  }
}

/**
 * 挂载宿主半侧。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ statePath?: string }} [pluginConfig]
 */
export function apply(ctx, pluginConfig = {}) {
  const statePath = typeof pluginConfig?.statePath === 'string' && pluginConfig.statePath !== ''
    ? pluginConfig.statePath
    : defaultStatePath()

  let state = loadState(statePath)
  const attempts = new Map()

  const persist = () => saveState(statePath, state)

  const passwordSet = () => Boolean(state.password)
  const emailConfigured = () => Boolean(state.email && state.smtpAuthCode)

  const publicState = () => ({
    ok: true,
    passwordSet: passwordSet(),
    autoLockMinutes: state.autoLockMinutes,
    lockedPaths: [...state.lockedPaths],
    email: state.email,
    emailConfigured: emailConfigured(),
    smtpHost: state.smtpHost,
    smtpPort: state.smtpPort,
    updatedAt: state.password?.updatedAt ?? null,
  })

  // ctx.get() 是 Cordis 的免 inject 读取；直接写 ctx.workspaceRegistry 在未声明
  // inject 时会抛 "cannot get property ... without inject"，把整条路由打成空 400。
  const workspaces = () => {
    try {
      const registry = ctx.get('workspaceRegistry')
      if (!registry || typeof registry.list !== 'function') return []
      return registry.list().map((workspace) => ({
        workspaceId: workspace.id ?? workspace.workspaceId,
        path: normalizeWorkspacePath(workspace.path),
        title: workspace.title ?? '',
      }))
    } catch {
      return []
    }
  }

  // 注册表可用时按白名单校验；不可用时只校验路径形状——否则注册表一抖动，
  // 锁定/解锁就整体失效（用户看到的就是一条空 400）。
  const isRegisteredWorkspace = (target) => {
    const normalized = normalizeWorkspacePath(target)
    if (normalized === '') return false
    const known = workspaces()
    return known.length === 0 || known.some((workspace) => workspace.path === normalized)
  }

  const throttle = (key, limit, windowMs) => {
    const now = Date.now()
    const entry = attempts.get(key)
    if (!entry || now >= entry.resetAt) {
      attempts.set(key, { count: 1, resetAt: now + windowMs })
      return false
    }
    entry.count += 1
    return entry.count > limit
  }

  const resetThrottle = (key) => attempts.delete(key)

  const makeCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0')

  const sendRecoveryMail = async (code) => {
    if (!emailConfigured()) throw Object.assign(new Error('email-unset'), { code: 'email-unset' })
    await sendMail({
      host: state.smtpHost,
      port: state.smtpPort,
      user: state.email,
      pass: state.smtpAuthCode,
      to: state.email,
      subject: '工作区锁 · 密码找回验证码',
      text: [
        '你正在找回 DSH「工作区锁」的总密码。',
        '',
        `验证码：${code}`,
        '',
        '10 分钟内有效。如果不是你发起的，请忽略这封邮件，密码不会被改动。',
        '',
        '（本邮件由 dsh-workspace-lock 自动发送）',
      ].join('\n'),
    })
  }

  ctx.inject(['connection'], (httpCtx) => {
    const json = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })

    const fail = (code, message = '') => json({ ok: false, code, message })

    // 任何未捕获异常都转成可读 JSON：DSH 的 web 服务器会把异常吞成空 400，
    // 页面只能显示 "HTTP 400"，排查时等于没有信息。
    const guard = (label, handler) => async (request) => {
      try {
        return await handler(request)
      } catch (error) {
        console.warn('[dsh-workspace-lock]', label, error)
        return fail('internal', String(error?.message ?? error))
      }
    }
    const rawRegister = httpCtx.connection.fetch.register.bind(httpCtx.connection.fetch)
    httpCtx.connection.fetch.register = (route) => rawRegister({ ...route, fetch: guard(route.path, route.fetch) })

    const readBody = async (request) => {
      try {
        return await request.json()
      } catch {
        return null
      }
    }

    httpCtx.connection.fetch.register({
      path: '/api/ws-lock/state',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async () => json(publicState()),
    })

    httpCtx.connection.fetch.register({
      path: '/api/ws-lock/password',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        const body = await readBody(request)
        if (!body || typeof body.next !== 'string') return fail('bad-request')
        if (throttle('password', 10, 60_000)) return fail('rate-limited')
        if (body.next.length < 4 || body.next.length > 200) return fail('password-too-short')
        if (passwordSet() && !verifySecret(String(body.current ?? ''), state.password)) {
          return fail('bad-password')
        }
        state.password = hashSecret(body.next)
        state.recovery = null
        persist()
        resetThrottle('password')
        return json(publicState())
      },
    })

    httpCtx.connection.fetch.register({
      path: '/api/ws-lock/verify',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        const body = await readBody(request)
        if (!body || typeof body.path !== 'string' || typeof body.password !== 'string') {
          return fail('bad-request')
        }
        if (!passwordSet()) return fail('password-unset')
        const normalized = normalizeWorkspacePath(body.path)
        if (!state.lockedPaths.includes(normalized) && !isRegisteredWorkspace(normalized)) {
          return fail('path-not-workspace')
        }
        if (!state.lockedPaths.includes(normalized)) return json({ ok: true, unlocked: true })
        if (throttle('verify', 10, 60_000)) return fail('rate-limited')
        if (!verifySecret(body.password, state.password)) return fail('bad-password')
        resetThrottle('verify')
        return json({ ok: true, unlocked: true })
      },
    })

    httpCtx.connection.fetch.register({
      path: '/api/ws-lock/toggle',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        const body = await readBody(request)
        if (!body || typeof body.path !== 'string' || typeof body.locked !== 'boolean') {
          return fail('bad-request')
        }
        const normalized = normalizeWorkspacePath(body.path)
        if (!isRegisteredWorkspace(normalized)) return fail('path-not-workspace')
        if (body.locked) {
          if (!passwordSet()) return fail('password-required')
          if (!state.lockedPaths.includes(normalized)) {
            state.lockedPaths.push(normalized)
            persist()
          }
        } else {
          // 永久移除这个锁（“只在本页解锁”走 /verify，不动 lockedPaths）。
          if (!passwordSet()) return fail('password-unset')
          if (throttle('toggle', 10, 60_000)) return fail('rate-limited')
          if (!verifySecret(String(body.password ?? ''), state.password)) return fail('bad-password')
          resetThrottle('toggle')
          if (state.lockedPaths.includes(normalized)) {
            state.lockedPaths = state.lockedPaths.filter((item) => item !== normalized)
            persist()
          }
        }
        return json(publicState())
      },
    })

    httpCtx.connection.fetch.register({
      path: '/api/ws-lock/config',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        const body = await readBody(request)
        if (!body) return fail('bad-request')
        const changesMailbox = Object.hasOwn(body, 'email') || Object.hasOwn(body, 'smtpAuthCode')
        // 改找回邮箱 = 改“谁能重置密码”，必须拿总密码；否则任何能打开这个页面的人
        // 都可以把自己的邮箱填进来，再走找回流程把锁全部换掉。
        if (changesMailbox && passwordSet()) {
          if (throttle('config', 10, 60_000)) return fail('rate-limited')
          if (!verifySecret(String(body.current ?? ''), state.password)) return fail('bad-password')
          resetThrottle('config')
        }
        if (Object.hasOwn(body, 'autoLockMinutes')) {
          const minutes = Number(body.autoLockMinutes)
          if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) return fail('bad-request')
          state.autoLockMinutes = Math.floor(minutes)
        }
        if (Object.hasOwn(body, 'email')) {
          const email = String(body.email ?? '').trim()
          if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('bad-email')
          state.email = email
        }
        if (Object.hasOwn(body, 'smtpAuthCode')) {
          const code = String(body.smtpAuthCode ?? '').trim()
          if (code !== '') state.smtpAuthCode = code
        }
        persist()
        return json(publicState())
      },
    })

    httpCtx.connection.fetch.register({
      path: '/api/ws-lock/test-email',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async () => {
        if (!emailConfigured()) return fail('email-unset')
        try {
          await sendMail({
            host: state.smtpHost,
            port: state.smtpPort,
            user: state.email,
            pass: state.smtpAuthCode,
            to: state.email,
            subject: '工作区锁 · 测试邮件',
            text: '这封邮件说明「工作区锁」的 SMTP 配置可用，密码找回会发到同一个地址。',
          })
          return json({ ok: true, sent: true })
        } catch (error) {
          console.warn('[dsh-workspace-lock] 测试邮件发送失败：', error?.message ?? error)
          return fail('smtp-failed', error?.message ?? '')
        }
      },
    })

    httpCtx.connection.fetch.register({
      path: '/api/ws-lock/recover/request',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async () => {
        if (!passwordSet()) return fail('password-unset')
        if (!emailConfigured()) return fail('email-unset')
        if (state.recovery && Date.now() - Number(state.recovery.sentAt ?? 0) < 60_000) {
          return fail('rate-limited')
        }
        const code = makeCode()
        state.recovery = {
          ...hashSecret(code),
          expiresAt: Date.now() + 10 * 60_000,
          sentAt: Date.now(),
          attempts: 0,
        }
        persist()
        try {
          await sendRecoveryMail(code)
        } catch (error) {
          state.recovery = null
          persist()
          console.warn('[dsh-workspace-lock] 找回邮件发送失败：', error?.message ?? error)
          return fail('smtp-failed', error?.message ?? '')
        }
        return json({ ok: true, sent: true })
      },
    })

    httpCtx.connection.fetch.register({
      path: '/api/ws-lock/recover/verify',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        const body = await readBody(request)
        if (!body || typeof body.code !== 'string' || typeof body.next !== 'string') {
          return fail('bad-request')
        }
        if (!state.recovery) return fail('code-invalid')
        if (Date.now() > Number(state.recovery.expiresAt ?? 0)) {
          state.recovery = null
          persist()
          return fail('code-expired')
        }
        if (Number(state.recovery.attempts ?? 0) >= 5) return fail('rate-limited')
        if (body.next.length < 4 || body.next.length > 200) return fail('password-too-short')
        state.recovery.attempts = Number(state.recovery.attempts ?? 0) + 1
        if (!verifySecret(body.code.trim(), state.recovery)) {
          persist()
          return fail('code-invalid')
        }
        state.password = hashSecret(body.next)
        state.recovery = null
        persist()
        resetThrottle('verify')
        return json({ ok: true, reset: true })
      },
    })
  })

  // 测试把手：不参与运行时行为。
  if (pluginConfig?.__exposeForTest === true) {
    return {
      statePath,
      publicState,
      getState: () => state,
      sendMail,
      hashSecret,
      verifySecret,
    }
  }
  return undefined
}
