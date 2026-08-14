# CLAUDE.md

自托管的线上桌游房间平台：密码进站，链接邀友。**平台骨架已经稳定，具体桌游按需增加**——
大部分开发任务是"在 `src/games/` 下新增一款游戏"，而不是改动 room/socket/auth 这些
已经跑通的骨架层。改骨架层之前先确认真的有必要。

## 常用命令

| 命令 | 何时用 |
| --- | --- |
| `npm test` | **改动后必须跑**，vitest，跑全部测试（含 `src/games/boundaries.test.ts` 这道纯度检查） |
| `npm run typecheck` | `tsc --noEmit`，提交前跑 |
| `npm run dev` | 本地跑起来看效果：`APP_PASSWORD=dev-pw SESSION_SECRET=dev-secret-key npm run dev` |
| `npm run build` | 生产构建：`next build` 出 `.next/`，esbuild 把 `src/server/index.ts` 打包成 `dist/server.js` |

## 三层边界（硬规则）

```
src/games/**  →  src/server/rooms/**  →  src/server/socket/**
（纯函数）        （状态 + 用例）           （事件收发/广播）
```

依赖只能单向往上，反过来禁止：

- **`src/games/**`**：纯函数层。禁止 `import` `socket.io`、`next`、任何 `node:` 内置
  模块；禁止 `Date.now()`、`new Date()`、`Math.random()`。随机数只能来自
  `createInitialState(players, seed)` 里注入的 `seed`（配合 `src/shared/rng.ts` 的
  `createRng`/`shuffle`）——这让一局游戏可以用 `(seed, 动作序列)` 完整复现。
  **这条规则由 `src/games/boundaries.test.ts` 自动强制**，扫描 `src/games/**` 下每个
  源文件的文本内容，命中禁用字符串就让测试变红。老实说：这是纯字符串/正则匹配，不是
  真正的静态分析——动态 `import()`、把 `Math.random` 起个别名再调用，都绕得过去。测试
  能挡住无意的违规，但不要指望它是安全边界，写代码时自己守住这条线。
- **`src/server/rooms/**`**：不得 `import` `socket.io`。函数只接收参数、返回结果
  （`ServiceResult<T>`），不直接碰 Socket 连接，也不知道具体是哪一款游戏，只通过
  `GameRegistry` 间接调用。
- **`src/server/socket/**`**：不写业务逻辑，只做"Socket 事件 → 调用 service → 把结果
  广播给房间里的每个人"这一件事（见 `src/server/socket/handlers.ts` 的 `broadcast`：
  对每个连接分别调用 `game.getViewFor` 裁剪视图后再发）。

## 导入路径规则

- `src/server/**`、`src/games/**`、`src/shared/**`：**用相对导入**（`../../shared/rng`
  这种），不要用 `@/`。
- `src/app/**`、`src/components/**`、`src/hooks/**`、`src/lib/**`：用 `@/` 别名
  （`@/games/types` 这种）。

原因：`npm run build:server` 用 esbuild 把 `src/server/index.ts` 打包成
`dist/server.js`，参数里有 `--packages=external`。esbuild 只认识裸的 `node_modules`
包名才会当作 external；`@/xxx` 长得像一个包名，esbuild 会把它当成外部依赖直接留在
`require('@/xxx')` 里而不解析路径别名，运行时找不到这个包直接崩掉。Next 编译
`src/app/**` 等目录时走自己的 webpack/SWC 配置，认识 `tsconfig.json` 里的
`paths: { "@/*": ["./src/*"] }`，所以那几个目录可以放心用别名。**server/games/shared
三个目录一律相对导入，其余目录一律 `@/`，别混用。**

## `globalThis` 单例陷阱

`src/server/runtime.ts` 把 `RoomStore` 和 `AppConfig` 挂在 `globalThis` 上
（`__gameBoxStore` / `__gameBoxConfig`）。原因：Next 的路由处理器（如
`POST /api/rooms`）和 `dist/server.js` 里的自定义 HTTP+Socket.IO server 是**两套独立
的模块实例**，各自 `require` 一遍代码。如果 `RoomStore` 是普通模块级变量，HTTP 侧建的
房间会存在 Next 那份实例里，Socket.IO 那份实例完全看不到——建房成功但谁都进不去，且
不会抛任何异常。**任何时候要往骨架层加新的跨侧共享状态，都走 `runtime.ts` 这个
`globalThis` 单例模式，不要开新的模块级变量。**

## 新增游戏

完整分步指南见 `docs/adding-a-game.md`，参考实现是 `src/games/tic-tac-toe/`。概要：
建目录 → 先写 `logic.test.ts` → 写 `logic.ts` 实现 `GameLogic` 五个成员 → 写
`Board.tsx` → 在 `src/games/registry.ts` 和 `src/games/ui-registry.ts` 各加一行 →
`npm test && npm run typecheck`。

## 错误处理约定

业务失败一律用返回值，不用异常：

- 游戏规则层（`GameLogic.applyAction`）：`{ ok: false, reason: '中文原因' }`。
- 服务层（`src/server/rooms/service.ts` 的各个函数）：
  `{ ok: false, code: 'SOME_CODE', message: '中文用户文案' }`——`code` 给程序判断用
  （英文大写下划线），`message` 是要直接展示给用户看的中文句子。

不要在这些函数里 `throw` 来表达"业务上失败了"（校验失败、房间不存在、非玩家操作
等），`throw` 留给真正意外的情况。

## 文案语言

UI 文案（`meta.name`/`meta.description`、错误 `message`/`reason`、页面上的按钮文字）
一律中文。代码标识符、代码注释、commit message 一律英文。
