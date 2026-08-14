# 架构

## 三层结构与依赖方向

```
src/games/**   （纯函数，游戏规则）
     ^
     │  被依赖
     │
src/server/rooms/**   （房间状态 + 用例）
     ^
     │  被依赖
     │
src/server/socket/**   （事件收发、广播）
```

依赖只能单向往上：

- **`src/games/**`**：每款游戏的规则实现。纯函数，不依赖时钟、网络、随机数发生器，
  不 import `socket.io`、`next`、任何 Node 内置模块。什么都不知道"房间""连接""广播"
  这些概念，只知道状态和动作。
- **`src/server/rooms/**`**：房间生命周期和用例（建房、加入、改名、开始、执行动作、
  标记掉线）。只接收参数、返回 `ServiceResult`，不 import `socket.io`，不直接碰
  Socket 连接。通过 `GameRegistry` 间接调用某一款游戏的 `GameLogic`，但不关心具体是
  哪款游戏。
- **`src/server/socket/**`**：事件层，只做"Socket 事件 → 调用 service → 把结果广播
  回房间里的每个人"的翻译工作，不写业务规则。

游戏层完全不知道房间和网络的存在；房间层不知道 Socket 的存在；只有 socket 层同时认识
两者。这个方向反过来是不允许的——`src/games/**` 里 import `../rooms/...` 或
`socket.io` 都是违规。

## 一次动作的完整数据流

以井字棋落子为例：

1. 玩家在 `src/games/tic-tac-toe/Board.tsx` 里点击一个格子，调用 `onAction({ type: 'place', cell })`。
2. `src/hooks/useRoomSocket.ts` 把这个 action 通过 Socket.IO 发到服务端，事件名
   `game:action`（`ClientEvents.ACTION`，见 `src/shared/events.ts`）。
3. `src/server/socket/handlers.ts` 收到 `ClientEvents.ACTION`，取出这条连接对应的
   `{ roomId, playerId }`，调用 `applyGameAction(deps, { roomId, playerId, action })`。
4. `src/server/rooms/service.ts` 的 `applyGameAction`：校验房间存在、玩家在房间里、
   房间处于 `playing` 状态，然后调用 `game.applyAction(room.gameState, playerId, action)`——
   这里的 `game` 是从 `gameRegistry` 按 `room.gameId` 查出来的 `GameLogic` 实例。
5. `src/games/tic-tac-toe/logic.ts` 的 `applyAction` 是纯函数：校验落子合法性，返回
   `{ ok: true, state }` 或 `{ ok: false, reason }`，绝不抛异常。
6. `applyGameAction` 把新 `state` 写回 `room.gameState`，调用 `game.isFinished()` 判断
   对局是否结束，更新 `room.lastActivityAt`。
7. `handlers.ts` 拿到 `ServiceResult`，调用 `broadcast(io, deps, room)`：对房间里的
   *每一个* Socket 连接分别调用 `game.getViewFor(room.gameState, playerId)`，按各自的
   `playerId` 裁剪出只属于这个人的视图，再连同房间公开信息 `toPublicRoom(...)` 一起
   通过事件名 `room:sync`（`ServerEvents.SYNC`）发给这个连接。
8. 客户端 `useRoomSocket` 收到 `room:sync`，更新 React state，`Board.tsx` 用新的
   `view` 重新渲染。

一句话总结：**客户端点击 → `game:action` → handlers → service → GameLogic → 新状态 →
按玩家裁剪 → `room:sync`**。全程只有一个地方写业务规则（`GameLogic`），只有一个地方
做广播（`handlers.ts` 的 `broadcast`）。

## 鉴权：三种凭证

系统里同时存在三种凭证，作用范围互不相同：

1. **站点密码 session**（cookie `gb_session`，`SESSION_MAX_AGE_MS` = 30 天）：
   用 `POST /api/login` 拿密码换来，一次登录后对整站有效——可以看首页、建房、进任意
   房间。签名用 HMAC-SHA256（`src/server/auth/tokens.ts`），密钥是 `SESSION_SECRET`。
2. **房间邀请授权（grant）**（cookie `gb_grant_<roomId>`，`GRANT_MAX_AGE_MS` = 24
   小时）：访问 `/r/<inviteToken>` 换来的，**只对这一个房间有效**，不会让持有者
   进入大厅或其他房间。没有站点密码的朋友靠这个凭证进房间玩一局。
3. **玩家身份 `playerId`**（`sessionStorage` 里的 `gb_pid`，按 tab 隔离，不是
   cookie）：由 `src/lib/playerId.ts` 在浏览器里生成 UUID，标识"这个标签页是哪个
   玩家"。同一浏览器开两个标签页 = 两个不同的 `playerId` = 两个玩家。

`src/server/auth/guards.ts` 里的 `hasRoomAccess(roomId)` 体现了 1、2 的关系：先看
站点 session 是否有效，没有的话再看这个房间专属的 grant 是否有效——**任意一个满足
即可**，但 grant 只认自己房间号，不能拿 A 房间的 grant 去访问 B 房间或大厅。

`playerId` 和前两者是正交的：cookie 决定"能不能进这个房间"，`playerId` 决定"你在房间
里是谁"（对应 `room.players` 里的哪个 `Player`、`GameLogic` 视图里裁剪给谁看）。

### Socket 握手鉴权

`src/server/auth/guards.ts` 只保护 Next 页面和路由处理器，但**真正的数据平面是
Socket**——花名册、每个人的私有 `gameView`、房间的邀请 token 全部走这条连接。所以握手
本身必须再查一遍凭证，这件事由 `src/server/socket/auth.ts` 的
`createSocketAuthMiddleware` 完成（在 `src/server/app.ts` 里 `io.use(...)` 装上）：

1. 客户端在 `io({ auth: { roomId } })` 里声明自己要进哪个房间
   （`src/hooks/useRoomSocket.ts`）——握手阶段服务端没有别的办法知道房间号。
2. 中间件解析 `socket.handshake.headers.cookie`（同源连接浏览器会自动带上），对这个
   `roomId` 校验站点 session 或该房间的 grant，任一通过即放行，否则
   `next(new Error(...))`，客户端在 `connect_error` 里拿到中文提示并停止重连。
3. 放行时把这个 `roomId` 记下来；`room:join` 处理器**再核对一次**加入的房间就是握手时
   被授权的那个，不一致返回 `FORBIDDEN`。**这一步不能省**——中间件如果信任后来才发来的
   房间号，等于没有防护。

### 已知缺口：`playerId` 是自称的

`playerId` 完全由客户端生成并在 `room:join` 里自称，服务端不做任何校验，而且它会随
`RoomPublic.players` 广播给房间里的每一个人。也就是说：**同一个房间里的成员可以拿到
别人的 `playerId`，用它重连，从而拿到那个人的私有 `gameView` 并以他的身份行动。**

握手鉴权挡住的是"房间外的人"，挡不住"房间里的人冒充另一个人"。井字棋没有隐藏信息，
影响仅限于捣乱；但**在加入任何有隐藏信息的游戏（狼人杀 / 阿瓦隆 类）之前必须先解决
这个问题**——`getViewFor` 是这类游戏唯一的防线，而它是按 `playerId` 裁剪的，`playerId`
可伪造就等于这道防线不存在。修法需要产品侧决策（服务端签发玩家身份 cookie、或把
`playerId` 与 session/grant 绑定），不是骨架层能单方面改掉的。

## 房间生命周期与清理规则

房间状态机：`waiting` → `playing` → `finished`（`RoomStatus`，`src/shared/types.ts`）。

- `createRoom`：生成 6 位房间码（`ROOM_CODE_ALPHABET`，去掉了容易读错的 `I/O/0/1`）和
  21 位邀请 token，状态为 `waiting`。
- `joinRoom`：`waiting` 状态才能加入；房间满员（达到该游戏 `maxPlayers`）拒绝加入；
  同一 `playerId` 重复加入视为断线重连。
- `startGame`：只有 `hostId` 本人能开始；人数必须落在 `[minPlayers, maxPlayers]`
  区间；生成一个 32 字符的随机 hex `seed`（`randomBytes(16)`），交给
  `game.createInitialState(players, seed)`。
- `markDisconnected`：房主掉线时，房主身份转移给下一个在线玩家，且**不会**在原房主
  重新连接后转回来（`src/server/rooms/service.ts` 的 `markDisconnected`）。

清理任务由 `src/server/rooms/cleanup.ts` 里的 `startCleanupTimer` 驱动，每
`CLEANUP_RULES.intervalMs`（5 分钟）扫描一次全部房间，命中以下任一条件即删除：

| 规则 | 值 | 含义 |
| --- | --- | --- |
| `idleMs` | 2 小时 | 距上次活动（加入/改名/开始/落子）超过这么久，无论是否有人在线，直接删除 |
| `allOfflineMs` | 15 分钟 | 房间里所有玩家都断线，且距上次活动超过这么久 |
| `emptyMs` | 15 分钟 | 房间建好后一直没人加入，超过这么久 |

具体数值以 `src/server/rooms/cleanup.ts` 中的 `CLEANUP_RULES` 为准，上表只是抄录，
改代码时以源码为唯一真相来源。

## 状态只在内存里的后果

`src/server/rooms/store.ts` 的 `RoomStore` 是一个进程内 `Map`，没有任何持久化。这意味着：

- 容器重启、进程崩溃、部署新版本，都会**清空全部房间和进行中的对局**，没有恢复手段。
- 多副本部署行不通：两个进程各自维护一份 `Map`，Socket 连到哪个副本，房间状态就只在
  那个副本里，另一个副本完全看不到。这个项目目前只设计成单容器运行。
- `src/server/runtime.ts` 用 `globalThis` 挂了一个单例（见下），解决的是"同一进程内
  Next 路由和自定义 server 是两套模块实例"的问题，**不是**跨进程共享状态的问题——不要
  误以为它能替代真正的持久化层。

### `globalThis` 单例陷阱

`npm run build` 产出两个东西：Next 的页面/API 路由，和 esbuild 打包出的
`dist/server.js`（自定义 HTTP + Socket.IO server，见 `src/server/app.ts` /
`src/server/index.ts`）。这两者在运行时是**两套独立的模块实例**——Next 路由处理器
（例如 `POST /api/rooms`）和承载 Socket.IO 的自定义 server，各自 `require`/`import`
一遍代码，各自拥有一份模块级变量。

如果 `RoomStore` 是一个普通的模块级 `const rooms = new Map()`，HTTP 侧建的房间会存在
Next 那份模块实例的 `Map` 里，Socket.IO 那份模块实例永远看不到——玩家点"创建房间"后
Socket 连接一律查不到房间。`src/server/runtime.ts` 把 `RoomStore` 和 `AppConfig` 挂在
`globalThis.__gameBoxStore` / `globalThis.__gameBoxConfig` 上，两套模块实例共享的是
同一个 Node 进程、同一个 `globalThis`，这样才能看到同一份数据。**去掉这个单例、改回普通
模块级变量，会在开发环境和生产环境都悄无声息地坏掉**（表现为"建房成功但进不去/看不到
其他人"），且没有任何异常抛出，务必留意。
