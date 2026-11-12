# dsh-workspace-lock

[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/phzt-hub/dsh-workspace-lock)

给 DSH 的工作区文件夹加一道**界面密码锁**。锁定的是**整个文件夹**：一锁上，侧栏里这个文件夹立刻收起，里面的会话行整批收掉——看不见、点不开，也没有一次一次弹密码页的逐个会话锁。锁/解锁都在「工作区锁」面板里做；默认 15 分钟无操作自动重新上锁（面板里可改，0 = 不自动锁）；忘记密码可以用 QQ 邮箱收验证码重置。

面板里每个文件夹一行：`锁定` / `解锁（只在本页）` / `解除锁定（永久，需要密码）`。解锁只存在当前页面，刷新后重新锁；解除锁定才会从状态文件里删掉这条路径。

> 这是门禁，不是磁盘加密。锁定时 DSH 里看不到也进不去，但本机其他程序、命令行、备份仍能读到明文——它防的是别人随手点开你的 DSH。

## 安装

```bash
# 从 npm 安装
dsh plugin --profile web add dsh-workspace-lock

# 或者直接从 GitHub 源码安装
dsh plugin --profile web add github:phzt-hub/dsh-workspace-lock
```

装完**重启 `dsh web`**：宿主端代码要重启才生效（浏览器端模块会热替换）。重启后左侧侧栏出现锁图标，点开就是「工作区锁」面板。

要求 **Node ≥ 20**。界面跑在浏览器里，属 `web` profile；宿主端只用 `node:` 内置模块（`crypto` / `fs` / `os` / `path` / `tls`），没有原生依赖，也不需要任何外部服务。

## 侧栏为什么会动 DOM

DSH 的侧栏浏览区只给插件留了**会话行**的插槽，没有文件夹行的插槽，也没有「隐藏某个工作区的会话」的钩子。所以收起文件夹这一段只能贴着 DOM 做：挂在 `shell.overlay` 上的一个空组件从插槽 props（`useSessions` / `useWorkspaces`）里算出「哪条会话的 cwd 落在锁定路径下」和「哪个工作区被锁」，写进页面状态；随后按会话 id 写一条 `[data-row-key="session:<id>"]{display:none!important}` 的样式表（React 重渲染抹不掉样式表，只抹得掉行内样式），再把文件夹行折起来、拦住它的点击。文件夹行靠 `data-row-key="workspace:<id>"` 认，DSH 升级改了这层结构时，最坏结果是「不再收起」而不是报错；会话行那层是纯样式，最坏结果是「照旧显示」。

## 装了什么

| 落点 | 作用 |
|---|---|
| `sidebar.panellist` | 左侧多一个锁图标，点开「工作区锁」面板 |
| `main`（key `ws-lock`） | 文件夹清单、总密码、自动锁、QQ 邮箱找回 |
| `conversation.input.dock` | 报告当前会话所在目录 |
| `shell.overlay` | 锁定工作区的会话被全屏密码页挡住（兜底：例如从 Hero 处新建会话进了锁定文件夹） |
| DOM（无插槽可用） | 锁定文件夹在侧栏收起、会话行整批隐藏；点它会弹一行「已锁定」提示 |

## 宿主接口

- `GET  /api/ws-lock/state`
- `POST /api/ws-lock/password` `{current?, next}`
- `POST /api/ws-lock/verify` `{path, password}`
- `POST /api/ws-lock/toggle` `{path, locked, password?}`（`locked:false` 为永久解除，需密码）
- `POST /api/ws-lock/config` `{autoLockMinutes?, email?, smtpAuthCode?}`
- `POST /api/ws-lock/test-email`
- `POST /api/ws-lock/recover/request`
- `POST /api/ws-lock/recover/verify` `{code, next}`

状态文件默认 `$DSH_HOME/workspace-lock/state.json`（`DSH_HOME` 未设时用 `~/.dsh`），权限 0600。密码只存 scrypt 派生值；SMTP 授权码也在该文件里，不回传页面。

## 邮箱找回

用 QQ 邮箱：设置 → 账户 → 开启 POP3/SMTP 服务 → 生成**授权码**（不是登录密码）。填进面板后先点「发一封测试邮件」确认链路。找回验证码 6 位、10 分钟有效、最多试 5 次；锁定页本身也有「忘记密码？用邮箱找回」，不必先退回面板。

改找回邮箱需要总密码（否则别人可以把自己的邮箱填进来，再走找回流程换掉锁）。这是 `/config` 在 `email` / `smtpAuthCode` 变化时的校验。

## 忘记密码且没配邮箱

锁屏和面板都进不去时，只能手动清状态：停掉 DSH，编辑 `~/.dsh/workspace-lock/state.json`，删掉 `password` 与 `lockedPaths`（或直接删整个文件），再启动。解锁状态本来就只存在浏览器内存里，刷新页面也会回到锁定。

## 配置项

`cordis.patch.yml` 的行可以加 `config.statePath` 改状态文件位置：

```yaml
- id: dsh-workspace-lock
  config:
    statePath: /opt/dsh/workspace-lock/state.json
```

## 开发注意

- 宿主半边读服务一律用 `ctx.get('workspaceRegistry')`：Cordis 对**未在 `inject` 里声明**的服务，直接写 `ctx.workspaceRegistry` 会抛 `cannot get property ... without inject`，DSH 的 web 服务器再把它吞成一个空 `400`，页面上只剩 `HTTP 400`。`test/smoke.mjs` 用一个会抛错的 ctx 代理复现了这条规则。
- 改完宿主代码必须**重启 `dsh web`** 才生效；DSH 的 HMR 只热替换浏览器端模块，宿主模块会继续跑旧代码（日志里会说 `changed modules keep running their previous code until a restart`）。

## 验证

```bash
node --check lib/index.js && node --check client/index.js
node test/smoke.mjs
```

界面部分需要装进 profile 后在浏览器里看；本仓库只保证 JS/JSON/SVG 语法与宿主路由行为。
