# Game Box 设计文档

日期：2026-08-14
状态：待实施

## 1. 背景与目标

把线下常玩的桌游搬到线上，方便和朋友随时开局。项目最终以 Docker 形式部署在自有服务器上。

本次交付的是**平台骨架 + 一个极简参考游戏（井字棋）**。具体要实现哪些桌游后续再定，因此骨架的首要设计目标是：新增一个游戏的成本尽可能低，且新增过程对 AI 协作友好。

成功标准：

1. 服务器上 `docker compose up -d` 即可运行，仅需配置密码等三个环境变量。
2. 访问站点需输入指定密码；朋友通过邀请链接可免密码直接进入房间。
3. 大厅列出所有可创建房间的游戏；创建房间后可生成邀请链接分享。
4. 加入者可修改自己的昵称。
5. 刷新页面或短暂断网后能回到原座位，手牌与进度不丢。
6. 井字棋可从建房到分出胜负完整跑通，并有集成测试覆盖该链路。

## 2. 技术选型

| 决策 | 选择 | 理由 |
|------|------|------|
| 框架 | Next.js（App Router）+ TypeScript | 前后端同一语言与类型定义，单体单镜像，运维成本最低 |
| 实时通信 | Socket.IO | 自带重连、房间广播、降级轮询，桌游场景不需要更底层的控制 |
| 样式 | Tailwind CSS | 无额外运行时，样式与组件同处，AI 修改时上下文集中 |
| 状态存储 | 进程内存 | 零依赖零运维；重启丢失进行中的对局，朋友局可接受 |
| 测试 | Vitest + socket.io-client | 逻辑层纯函数易测，集成层连真实 server |
| 部署 | 单容器，仅暴露 HTTP 端口 | TLS 与域名交给服务器上已有的反向代理，不与现有网关冲突 |

明确不引入：Redis、数据库、boardgame.io、前后端分离部署。

## 3. 架构分层

单个 Node 进程：`src/server/index.ts` 创建 HTTP server，挂载 Next.js request handler，并在同一 server 上挂载 Socket.IO（路径 `/socket.io`）。因此只有一个端口、一个容器。

三层边界（硬性约束，写入 CLAUDE.md）：

- **游戏层** `src/games/*`：纯函数。不得 import socket、HTTP、Next 相关模块；不得读取当前时间；不得直接使用 `Math.random`（随机数必须来自注入的 seed）。
- **房间层** `src/server/rooms/*`：内存房间存储与用例服务（建房、入座、改名、开始、出手、断线、清理）。调用游戏层，但不接触 socket——服务方法接收参数、返回结果，可直接单测。
- **传输层** `src/server/socket/*`：把 socket 事件翻译成房间层方法调用，并广播结果。不含业务逻辑。

数据流：`客户端事件 → 传输层 → 房间层服务 → 游戏层纯函数 → 新状态 → 房间层持久化到内存 → 传输层按玩家裁剪视图并广播`。

## 4. 目录结构

```
game-box/
├─ CLAUDE.md               # AI 入口：架构地图、命令、约定、加游戏 checklist
├─ README.md               # 人类入口：项目说明、本地开发、部署
├─ docs/
│  ├─ architecture.md      # 分层与数据流详解
│  ├─ adding-a-game.md     # 新增桌游的分步指南与检查清单
│  └─ superpowers/specs/   # 本设计文档与后续实施计划
├─ src/
│  ├─ server/
│  │  ├─ index.ts          # 进程入口：Next + Socket.IO
│  │  ├─ auth/             # 密码校验、session cookie、房间 grant
│  │  ├─ rooms/            # store.ts / service.ts / cleanup.ts
│  │  └─ socket/           # handlers.ts 事件路由
│  ├─ games/
│  │  ├─ types.ts          # GameDefinition 接口（唯一契约）
│  │  ├─ registry.ts       # 游戏注册表，大厅列表来源
│  │  └─ tic-tac-toe/      # index.ts / logic.ts / logic.test.ts / Board.tsx
│  ├─ shared/              # 前后端共享类型与事件名常量
│  ├─ app/                 # /login、/（大厅）、/room/[roomId]、/r/[token]
│  └─ components/          # 通用 UI：房间面板、玩家列表、邀请弹窗
├─ tests/                  # 跨层集成测试
├─ Dockerfile
├─ docker-compose.yml
├─ .env.example
└─ .gitignore              # 含 .worktrees/
```

## 5. 数据模型

全部存于进程内存，`Map<roomId, Room>`。

```ts
type Player = {
  id: string          // playerId，客户端 sessionStorage 持有
  name: string        // 昵称，可修改
  seat: number        // 座位序号，从 0 开始
  connected: boolean  // 断线时置 false，座位保留
  joinedAt: number
}

type Room = {
  id: string            // 6 位大写字母数字短码，可口头分享
  inviteToken: string   // 21 位随机串，仅出现在邀请链接中
  gameId: string
  hostId: string
  players: Player[]
  status: 'waiting' | 'playing' | 'finished'
  gameState: unknown    // 由对应 GameDefinition 定义，房间层不解释其内容
  seed: string          // 开局时生成，用于可复现的随机
  createdAt: number
  lastActivityAt: number
}
```

`id` 与 `inviteToken` 分离：短码可展示在界面上，token 只出现在链接里，避免截图泄露房间。

## 6. 鉴权与身份

三种互相独立的凭证：

**站点密码**
- 启动时读取环境变量 `APP_PASSWORD`；未设置或为空则进程直接退出并打印明确错误，不允许无密码启动。
- `/login` 页面提交密码，服务端比对后下发 HttpOnly、SameSite=Lax 的签名 cookie `gb_session`（使用 `SESSION_SECRET` 签名），有效期 30 天。
- Next middleware 保护大厅页与"创建房间"接口。

**房间 grant**
- 邀请链接形如 `https://<host>/r/<inviteToken>`。
- 访问该路径时服务端校验 token，命中则下发 cookie `gb_grant_<roomId>`（签名，含 roomId，有效期 24 小时），随后重定向到 `/room/<roomId>`。
- 房间页的访问条件：持有 `gb_session` **或** 持有该房间的 grant。
- 持 grant 而无 session 的用户不能访问大厅、不能创建房间，但在本房间内与其他玩家权限完全一致。
- token 无效或房间已不存在时，返回明确的中文提示页，而非 404。

**玩家身份 playerId**
- 存于浏览器 `sessionStorage`：刷新页面与短暂断网可恢复原座位；同一浏览器不同标签页是不同玩家，便于本地自测多人游戏。
- 首次进入房间页时若 sessionStorage 无值，生成 UUID 并写入。
- 已知代价：关闭标签页后重新打开会成为新玩家，需重新入座。此为有意取舍。

## 7. 游戏插件契约

```ts
interface GameDefinition<S, A> {
  meta: {
    id: string
    name: string
    description: string
    minPlayers: number
    maxPlayers: number
  }
  createInitialState(players: PlayerRef[], seed: string): S
  applyAction(
    state: S,
    playerId: string,
    action: A
  ): { ok: true; state: S } | { ok: false; reason: string }
  getViewFor(state: S, playerId: string): unknown
  isFinished(state: S): { finished: boolean; winners?: string[] }
  Board: React.ComponentType<{ view: unknown; onAction: (a: A) => void; me: string }>
}
```

约定：

- `applyAction` 以返回值表达非法操作，不抛异常。非法操作（如点击已占用的格子、不是自己的回合）属于正常业务流程，房间层将 `reason` 单独回给发起者，不广播。
- `getViewFor` 是隐藏信息的唯一防线。服务端广播时对每个玩家分别调用，私密信息（手牌、身份牌）永远不会进入其他玩家的 socket。后续实现狼人杀、阿瓦隆一类游戏时该接口无需变更。
- 随机数必须由 `seed` 派生（使用 seeded RNG）。相同 seed 加相同动作序列必然复现同一局对局，便于复现 bug 与编写稳定测试。
- `Board` 与逻辑同处一个目录。一个游戏即一个自包含文件夹，删除该文件夹平台仍可正常运行。

新增游戏的完整步骤：创建目录并实现上述五项、编写 `logic.test.ts`、在 `registry.ts` 注册一行。`docs/adding-a-game.md` 固化该流程与检查清单。

## 8. Socket 协议

事件名集中定义在 `src/shared/events.ts`，前后端共用。

客户端 → 服务端：

| 事件 | 载荷 | 说明 |
|------|------|------|
| `room:join` | `{ roomId, playerId, name? }` | 入座或重连 |
| `room:rename` | `{ name }` | 修改自己的昵称 |
| `game:start` | 无 | 仅房主可发起，人数需满足 min/max |
| `game:action` | `{ action }` | 透传给游戏层 `applyAction` |

服务端 → 客户端：

| 事件 | 载荷 | 说明 |
|------|------|------|
| `room:sync` | `{ room, gameView }` | 房间元信息 + 该玩家专属游戏视图 |
| `room:error` | `{ code, message }` | code 供程序判断，message 为中文提示 |

每次状态变化服务端遍历房间玩家，各自计算视图后单独 emit，采用全量同步而非增量 diff。桌游状态体积小、动作频率低，全量同步换取"客户端状态不会漂移"的确定性。

## 9. 房间生命周期

- **断线**：标记 `connected: false`，座位与游戏状态完整保留，其他玩家界面显示"XX 掉线中"。
- **重连**：客户端带原 playerId 发 `room:join`，认回原座位并收到完整 `room:sync`。
- **房主掉线**：房主身份自动转移给下一位在线玩家，避免房间无人可开局。
- **清理**：定时任务每 5 分钟扫描一次，删除满足以下任一条件的房间——全员离线超过 15 分钟；`lastActivityAt` 距今超过 2 小时。
- **昵称**：默认分配"玩家1、玩家2……"，随时可改；同房间内昵称重复时自动追加序号后缀。

## 10. Docker 与部署

- 多阶段 Dockerfile：构建阶段执行 `next build`（`output: 'standalone'`），运行阶段仅复制 standalone 产物，以非 root 用户运行 `node server.js`。
- `docker-compose.yml`：单服务，`restart: unless-stopped`，端口映射可配置。
- 环境变量：`APP_PASSWORD`（必填）、`SESSION_SECRET`（必填）、`PORT`（默认 3000）。`.env.example` 列出全部并附说明。
- `/api/health` 返回运行状态，供 compose healthcheck 使用。
- README 提供 Nginx 与 Caddy 的反向代理配置片段，重点标注 WebSocket 所需的 `Upgrade` 与 `Connection` 请求头转发。

## 11. AI 友好的具体落点

- **CLAUDE.md 作为 AI 入口**：项目定位、常用命令、三层边界硬规则、新增游戏 checklist、"改动后必须运行 `npm test`"。
- **单一契约来源**：`src/games/types.ts` 与 `src/shared/` 是类型与事件名的唯一定义处，前后端共用，协议变更只需改一处。
- **自包含模块**：一个游戏一个目录，逻辑、测试、UI 同处。处理某游戏的任务时所需上下文即该目录加接口文档，无需通读仓库。
- **纯函数优先**：可被单测覆盖的逻辑一律不依赖时间、随机与网络，修改后可立即自证正确性。
- **严格 TypeScript + ESLint + Prettier**：类型错误与风格漂移由工具拦截，不依赖人工 review。
- **文档三件套职责不重叠**：README 面向人类使用者，CLAUDE.md 面向 AI 协作者，docs/ 存放细节说明。

## 12. 测试策略

测试框架为 Vitest。

- **游戏逻辑单测**：井字棋以 TDD 方式实现（先写测试）。覆盖合法落子、非法落子拒绝、回合轮转、胜负判定、平局。
- **房间服务单测**：入座、满员拒绝、改名、重名处理、断线保留座位、重连认回、房主转移、超时清理。
- **集成测试**：使用 socket.io-client 连接真实 server，跑通完整链路——创建房间 → 通过邀请链接入房 → 修改昵称 → 完成一整局 → 中途刷新重连。该测试即骨架的验收标准。

## 13. 界面语言与范围

- UI 文案使用中文；代码标识符与注释使用英文。
- 明确不做（YAGNI）：观战模式、游戏内聊天、战绩排行、用户注册体系、多语言、移动端专门适配（响应式布局够用即可）。
