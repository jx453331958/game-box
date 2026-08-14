# 新增一款游戏

一份可以照抄的分步指南。参考实现是 `src/games/tic-tac-toe/`（井字棋），下面每一步都
指向它对应的文件。整个游戏层是纯函数——不碰网络、时钟、Socket，这条规则由
`src/games/boundaries.test.ts` 自动检查，写完记得跑测试确认没踩线。

## 步骤

### 1. 建目录

```bash
mkdir src/games/<game-id>
```

`<game-id>` 用小写短横线命名（参考 `tic-tac-toe`），这个字符串会同时是 `GameMeta.id`、
房间的 `gameId`、`registry.ts`/`ui-registry.ts` 里的 key。

### 2. 先写 `logic.test.ts`（TDD，先红后绿）

对照 `src/games/tic-tac-toe/logic.test.ts`，测试必须覆盖：

- **初始状态**：`createInitialState(players, seed)` 产出的状态形状正确（该有的字段都
  在），且对同一个 `seed` 是可复现的（同 seed 两次调用结果相同）。
- **合法动作**：正常落子/操作后状态按预期变化，轮次正确前进。
- **每一种非法动作的拒绝理由**：不在游戏里的玩家、不该轮到的玩家、参数越界、目标格
  已被占用、对局已结束后还想动手……每一种都要单独测，断言返回的 `reason` 文案，而不
  只是 `ok: false`。
- **结束判定**：`isFinished(state)` 在游戏中途返回 `{ finished: false, winners: [] }`，
  在游戏结束时返回正确的 `winners`（获胜者的 `playerId` 列表；平局是 `winners: []`
  但 `finished: true`）。
- **`getViewFor` 不泄露隐藏信息**：断言返回的视图里**不包含**不该被这个玩家看到的字段
  ——例如别人的底牌、未公开的牌堆顺序。可以用
  `expect(JSON.stringify(view)).not.toContain(...)` 这类断言直接检查序列化结果里没有
  泄露的字符串/字段名（`tic-tac-toe/logic.test.ts` 里 `not.toContain('board')` 就是
  这个用法，虽然井字棋本身没有隐藏信息，用来确认视图字段被裁剪过而不是原样透传）。
- **状态不可变**：`applyAction` 之后，原来传入的 `state` 对象没有被修改（新状态是新
  对象，不是就地改的同一个引用）。

### 3. 写 `logic.ts`，实现 `GameLogic` 的五个成员

类型定义在 `src/games/types.ts`：

```ts
export interface GameLogic<S = unknown, A = unknown> {
  meta: GameMeta
  createInitialState(players: PlayerRef[], seed: string): S
  applyAction(state: S, playerId: string, action: A): ActionResult<S>
  getViewFor(state: S, playerId: string): unknown
  isFinished(state: S): FinishResult
}
```

- **`meta`**：`{ id, name, description, minPlayers, maxPlayers }`，`name`/`description`
  用中文（这是给玩家看的 UI 文案）。
- **`createInitialState`**：根据 `players`（`{ id, name, seat }[]`）和字符串 `seed`
  产出初始状态。**任何随机性都必须来自 `seed`**，用 `src/shared/rng.ts` 的
  `createRng(seed)`/`shuffle(items, rng)`，不要用 `Math.random()`——同一个 `seed` 必须
  永远产出同一个结果，这是"用 `(seed, 动作序列)` 就能复现一局游戏"的基础。
- **`applyAction`**：纯函数，校验 + 状态转移。**不合法的动作返回
  `{ ok: false, reason: '中文原因' }`，不要抛异常**——上层 `service.ts` 靠这个返回值
  把错误变成 `room:error` 事件推给客户端，抛异常会直接把请求打挂。合法动作返回
  `{ ok: true, state: 新状态 }`，新状态是新对象（不要就地修改传入的 `state`）。
- **`getViewFor(state, playerId)`**：服务端会对房间里的**每一个玩家分别调用一次**这个
  函数（见 `src/server/socket/handlers.ts` 的 `broadcast`），返回值就是这个玩家能看到
  的全部信息。**这是唯一负责裁剪隐藏信息的地方**——如果游戏有隐藏角色、暗牌、未公开
  的牌堆，必须在这里把不该给这个 `playerId` 看的字段去掉，而不是指望客户端"知道了但
  不显示"（客户端能拿到什么就能在控制台里看到什么）。日后要做的暗牌/隐藏角色类游戏，
  这个函数是唯一的防线。
- **`isFinished(state)`**：返回 `{ finished, winners }`，`winners` 是获胜者
  `playerId` 数组，平局是空数组。

**状态必须是 JSON 可序列化的**：只能用普通对象、数组、字符串、数字、布尔、`null`；
不能塞 `Map`、`Set`、`class` 实例、函数、`undefined` 字段。状态要经过 Socket.IO 发
给客户端，也可能将来要持久化，非 JSON 结构会在序列化时悄悄丢数据或直接报错。

参考 `src/games/tic-tac-toe/logic.ts`：`createInitialState` 用 `shuffle` 决定谁先手；
`applyAction` 每次校验完整地拒绝一种非法情况后才继续；`getViewFor` 把内部的
`board: (playerId | null)[]` 转换成对外的 `cells: (Mark | null)[]`，不透传 `playerId`。

### 4. 写 `Board.tsx`

参考 `src/games/tic-tac-toe/Board.tsx`。组件签名固定：

```ts
export type BoardProps<V = unknown, A = unknown> = {
  view: V
  me: string
  onAction: (action: A) => void
}
```

文件顶部要有 `'use client'`（这是客户端组件，要处理点击等交互）。`view` 就是
`getViewFor` 的返回值，`onAction` 把动作发回服务端。UI 文案用中文，变量名/注释用英文。

### 5. 注册

各加一行：

- `src/games/registry.ts`：`import` 你的 `GameLogic`，加进 `ALL` 数组。
- `src/games/ui-registry.ts`：`import` 你的 `Board` 组件，在 `boardRegistry` 里加一条
  `'<game-id>': YourBoard`。

两处的 key 必须和 `meta.id` 一致，否则运行时会出现"有游戏规则但找不到棋盘组件"或反过来
的情况。

### 6. 跑测试和类型检查

```bash
npm test && npm run typecheck
```

`npm test` 会连带跑 `src/games/boundaries.test.ts`——它扫描 `src/games/**` 下所有非
测试的 `.ts`/`.tsx` 文件，逐行匹配以下几种字符串模式，命中即判违规：

- `from 'socket.io...'`、`from 'next...'`、`from 'node:...'`（禁止依赖传输层/框架/
  Node 内置模块）
- `Math.random(`、`Date.now(`、`new Date(`（禁止环境时钟和环境随机数）

如果新游戏的代码里出现上述字符串，测试会红，这是故意设计成的"改坏就报错"。

**这个检查是纯字符串/正则扫描，不是真正的静态分析**：它不会跟踪动态 `import()`、
不会识破 `const rand = Math; rand.random()` 这类间接调用、也不检查依赖包内部是否偷偷
用了 `Date.now()`。它能挡住绝大多数无意的违规，但不是安全边界，写代码时还是要自己
守住"游戏层是纯函数"这条规则，不要指望测试帮你兜底所有花招。

### 7. 上线前检查清单

- [ ] 随机数是否**全部**来自注入的 `seed`（`createRng`/`shuffle`），没有任何
      `Math.random()`？
- [ ] 隐藏信息是否**只**在 `getViewFor` 里裁剪，没有在别处把完整状态明文发给客户端？
- [ ] 非法动作是否都返回 `{ ok: false, reason: '中文原因' }`，没有 `throw`？
- [ ] 状态（`createInitialState`/`applyAction` 返回的 `S`）是否是纯 JSON 结构，
      没有 `Map`/`Set`/`class` 实例/函数？
- [ ] `npm test && npm run typecheck` 都通过？
- [ ] `registry.ts` 和 `ui-registry.ts` 的 key 与 `meta.id` 一致？
