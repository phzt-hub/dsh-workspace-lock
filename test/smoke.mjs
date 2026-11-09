import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { apply, hashSecret, normalizeWorkspacePath, verifySecret } from '../lib/index.js'

const dir = mkdtempSync(path.join(tmpdir(), 'ws-lock-test-'))
const statePath = path.join(dir, 'state.json')
const routes = new Map()
const workspacePath = '/tmp/example-workspace'

// 模拟 Cordis：直接读未 inject 的服务会抛错（真实环境里这就是那条空 400 的成因）。
// ctx.get() 是免 inject 读取，插件必须走它。
const services = {
  workspaceRegistry: {
    list: () => [{ id: 'ws-1', path: workspacePath, title: 'plugin' }],
  },
}
const ctx = new Proxy({
  get(name) {
    return services[name]
  },
  inject(_names, callback) {
    callback({
      connection: {
        fetch: {
          register(route) {
            routes.set(route.path, route)
          },
        },
      },
    })
  },
}, {
  get(target, prop, receiver) {
    if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver)
    if (typeof prop === 'string' && Object.hasOwn(services, prop)) {
      throw new Error(`cannot get property "${prop}" without inject`)
    }
    return undefined
  },
})

const api = apply(ctx, { statePath, __exposeForTest: true })

const call = async (routePath, body) => {
  const route = routes.get(routePath)
  assert.ok(route, `route ${routePath} registered`)
  const request = body === undefined
    ? new Request(`http://localhost${routePath}`)
    : new Request(`http://localhost${routePath}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
  const response = await route.fetch(request)
  return { status: response.status, body: await response.json() }
}

const state = () => call('/api/ws-lock/state')

try {
  let result = await state()
  assert.equal(result.body.ok, true)
  assert.equal(result.body.passwordSet, false)
  assert.deepEqual(result.body.lockedPaths, [])

  result = await call('/api/ws-lock/toggle', { path: workspacePath, locked: true })
  assert.equal(result.body.ok, false)
  assert.equal(result.body.code, 'password-required')

  result = await call('/api/ws-lock/password', { next: 'abc' })
  assert.equal(result.body.code, 'password-too-short')

  result = await call('/api/ws-lock/password', { next: 'abcd1234' })
  assert.equal(result.body.ok, true)
  assert.equal(result.body.passwordSet, true)

  result = await call('/api/ws-lock/toggle', { path: `${workspacePath}/`, locked: true })
  assert.equal(result.body.ok, true)
  assert.deepEqual(result.body.lockedPaths, [workspacePath])

  result = await call('/api/ws-lock/toggle', { path: '/etc', locked: true })
  assert.equal(result.body.code, 'path-not-workspace')

  result = await call('/api/ws-lock/verify', { path: workspacePath, password: 'nope' })
  assert.equal(result.body.ok, false)
  assert.equal(result.body.code, 'bad-password')

  result = await call('/api/ws-lock/verify', { path: workspacePath, password: 'abcd1234' })
  assert.equal(result.body.ok, true)

  result = await call('/api/ws-lock/password', { current: 'nope', next: 'efgh5678' })
  assert.equal(result.body.code, 'bad-password')

  result = await call('/api/ws-lock/password', { current: 'abcd1234', next: 'efgh5678' })
  assert.equal(result.body.ok, true)

  result = await call('/api/ws-lock/verify', { path: workspacePath, password: 'abcd1234' })
  assert.equal(result.body.code, 'bad-password')

  result = await call('/api/ws-lock/verify', { path: workspacePath, password: 'efgh5678' })
  assert.equal(result.body.ok, true)

  result = await call('/api/ws-lock/recover/request', {})
  assert.equal(result.body.code, 'email-unset')

  result = await call('/api/ws-lock/config', { email: 'not-an-email', current: 'efgh5678' })
  assert.equal(result.body.code, 'bad-email')

  result = await call('/api/ws-lock/config', { email: 'intruder@qq.com' })
  assert.equal(result.body.code, 'bad-password')

  result = await call('/api/ws-lock/config', { email: 'someone@qq.com', current: 'efgh5678' })
  assert.equal(result.body.ok, true)
  assert.equal(result.body.emailConfigured, false)

  result = await call('/api/ws-lock/config', { autoLockMinutes: 1441 })
  assert.equal(result.body.code, 'bad-request')

  result = await call('/api/ws-lock/config', { autoLockMinutes: 0 })
  assert.equal(result.body.ok, true)
  assert.equal(result.body.autoLockMinutes, 0)

  // 找回流程的验证码分支（不发信，直接把 recovery 记录塞进状态里）。
  api.getState().recovery = {
    ...hashSecret('123456'),
    expiresAt: Date.now() + 60_000,
    sentAt: Date.now(),
    attempts: 0,
  }
  result = await call('/api/ws-lock/recover/verify', { code: '000000', next: 'zzzz9999' })
  assert.equal(result.body.code, 'code-invalid')
  result = await call('/api/ws-lock/recover/verify', { code: '123456', next: 'zzzz9999' })
  assert.equal(result.body.ok, true)

  result = await call('/api/ws-lock/verify', { path: workspacePath, password: 'efgh5678' })
  assert.equal(result.body.code, 'bad-password')
  result = await call('/api/ws-lock/verify', { path: workspacePath, password: 'zzzz9999' })
  assert.equal(result.body.ok, true)

  result = await call('/api/ws-lock/toggle', { path: workspacePath, locked: false, password: 'wrong' })
  assert.equal(result.body.code, 'bad-password')
  result = await call('/api/ws-lock/toggle', { path: workspacePath, locked: false, password: 'zzzz9999' })
  assert.equal(result.body.ok, true)
  assert.deepEqual(result.body.lockedPaths, [])

  const raw = readFileSync(statePath, 'utf8')
  assert.ok(!raw.includes('efgh5678'), 'plaintext password must not be stored')
  const mode = statSync(statePath).mode & 0o777
  assert.equal(mode, 0o600, `state file mode ${mode.toString(8)} should be 0600`)
  const parsed = JSON.parse(raw)
  assert.equal(parsed.autoLockMinutes, 0)
  assert.deepEqual(parsed.lockedPaths, [])

  const record = hashSecret('secret-value')
  assert.equal(verifySecret('secret-value', record), true)
  assert.equal(verifySecret('other-value', record), false)
  assert.equal(normalizeWorkspacePath(`${workspacePath}//`), workspacePath)

  console.log('PASS smoke: routes, scrypt, state file 0600, path validation')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
