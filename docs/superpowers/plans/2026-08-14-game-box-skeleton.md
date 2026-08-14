# Game Box 平台骨架实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个可 Docker 部署的线上桌游平台骨架：密码鉴权、大厅建房、邀请链接入房、改名、断线重连，并附一个端到端跑通的井字棋参考游戏。

**Architecture:** 单个 Node 进程同时承载 Next.js（App Router）与 Socket.IO。代码分三层且边界硬性隔离：游戏层是纯函数（不碰网络/时间/随机源），房间层管理内存中的房间状态并调用游戏层，传输层把 socket 事件翻译成房间层调用并按玩家裁剪视图广播。

**Tech Stack:** Next.js 15 + React 19 + TypeScript 5（strict）、Socket.IO 4、Tailwind CSS 3、Vitest 2、esbuild（打包自定义 server）、Docker（多阶段构建）。

**Spec:** `docs/superpowers/specs/2026-08-14-game-box-design.md`

## Global Constraints

- **Node 版本**：22（本地与镜像一致，镜像基底 `node:22-alpine`）。
- **导入路径规则（不可违反）**：`src/server/**`、`src/games/**`、`src/shared/**` 内部一律使用**相对导入**；只有 `src/app/**`、`src/components/**`、`src/hooks/**`、`src/lib/**` 可以使用 `@/` 别名。原因：server 用 esbuild 以 `--packages=external` 打包，别名形式的裸导入会被误判为外部包而打包失败。
- **游戏层禁止事项**：`src/games/**` 不得 import `socket.io`、`socket.io-client`、`next/*`、`node:*`；不得调用 `Date.now()`、`new Date()`、`Math.random()`。随机数一律来自注入的 seed。此约束由 Task 2 的边界测试自动强制。
- **共享单例必须挂 globalThis**：Next 的页面/路由处理器与自定义 server 属于两套模块实例，房间存储若用普通模块级变量会各持一份。所有跨两侧共享的运行时单例必须通过 `src/server/runtime.ts` 的 globalThis 缓存获取。
- **错误表达**：业务层用返回值表达失败（`{ ok: false, code, message }`），不抛异常。`code` 供程序判断，`message` 为面向用户的中文文案。
- **文案语言**：UI 与错误 message 用中文；代码标识符、注释、commit message 用英文。
- **昵称规则**：trim 后长度 1–12 字符；同房间重名时追加数字后缀（`张三` → `张三2`）。
- **测试位置**：单元测试与源码同目录（`x.ts` 配 `x.test.ts`）；跨层集成测试放 `tests/`。
- **每个任务结束必须提交**，commit message 用英文，遵循 `feat:` / `test:` / `chore:` / `docs:` 前缀。

---

## 文件结构总览

| 文件 | 职责 |
|------|------|
| `src/shared/ids.ts` | 房间短码、邀请 token 生成 |
| `src/shared/rng.ts` | seed 派生的确定性随机与洗牌 |
| `src/shared/events.ts` | Socket 事件名常量与载荷类型（前后端唯一来源） |
| `src/shared/types.ts` | 房间/玩家的对外公开类型 |
| `src/games/types.ts` | `GameLogic` 契约与 `BoardProps` |
| `src/games/registry.ts` | 服务端游戏注册表（逻辑） |
| `src/games/ui-registry.ts` | 客户端棋盘组件注册表 |
| `src/games/tic-tac-toe/logic.ts` | 井字棋纯逻辑 |
| `src/games/tic-tac-toe/Board.tsx` | 井字棋棋盘 UI |
| `src/server/rooms/store.ts` | 内存房间存储（Map） |
| `src/server/rooms/service.ts` | 房间用例：建房/入座/改名/开局/出手/断线 |
| `src/server/rooms/cleanup.ts` | 过期房间回收 |
| `src/server/auth/config.ts` | 环境变量校验与加载 |
| `src/server/auth/tokens.ts` | HMAC 签名与 session / grant cookie 编解码 |
| `src/server/auth/guards.ts` | Next 侧访问守卫（依赖 `next/headers`） |
| `src/server/runtime.ts` | globalThis 单例：房间存储、配置 |
| `src/server/socket/handlers.ts` | Socket 事件路由与广播 |
| `src/server/app.ts` | `createGameServer()`：HTTP + Socket.IO（+ 可选 Next） |
| `src/server/index.ts` | 进程入口 |
| `src/lib/playerId.ts` | 客户端 playerId（sessionStorage） |
| `src/hooks/useRoomSocket.ts` | 客户端 socket 连接与状态 |
| `src/components/RoomClient.tsx` | 房间页主组件 |
| `src/app/**` | 登录页、大厅、房间页、邀请路由、API |

---

## Task 1: 工具链与共享 ID 工具

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `tailwind.config.ts`, `vitest.config.ts`, `.gitignore`, `.prettierrc.json`, `public/.gitkeep`
- Create: `src/shared/ids.ts`
- Test: `src/shared/ids.test.ts`

**Interfaces:**
- Consumes: 无（首个任务）
- Produces: `generateRoomCode(): string`（6 位大写短码）、`generateInviteToken(): string`（21 位 URL-safe）、`ROOM_CODE_ALPHABET: string`

- [ ] **Step 1: 初始化 npm 与依赖**

```bash
npm init -y
npm pkg set name=game-box version=0.1.0 private=true
npm pkg delete main
npm install next@^15.1.0 react@^19.0.0 react-dom@^19.0.0 socket.io@^4.8.1 socket.io-client@^4.8.1
npm install -D typescript@^5.7.2 @types/node@^22 @types/react@^19 @types/react-dom@^19 \
  vitest@^2.1.8 tsx@^4.19.2 esbuild@^0.24.0 tailwindcss@^3.4.17 postcss@^8.4.49 \
  autoprefixer@^10.4.20 prettier@^3.4.2
```

- [ ] **Step 2: 写配置文件**

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

`next.config.mjs`：

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
```

`postcss.config.mjs`：

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } }
```

`tailwind.config.ts`：

```ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}', './src/games/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config
```

`vitest.config.ts`：

```ts
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 15000,
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
```

`.gitignore`：

```
node_modules/
.next/
dist/
.env
.env.local
.worktrees/
*.log
.DS_Store
```

`.prettierrc.json`：

```json
{ "semi": false, "singleQuote": true, "printWidth": 100, "trailingComma": "all" }
```

`public/.gitkeep`：空文件（保证 Docker `COPY public` 不失败）。

- [ ] **Step 3: 写 package.json scripts**

```bash
npm pkg set scripts.dev="tsx watch src/server/index.ts"
npm pkg set scripts.build="next build && npm run build:server"
npm pkg set scripts.build:server="esbuild src/server/index.ts --bundle --platform=node --target=node22 --format=cjs --packages=external --outfile=dist/server.js"
npm pkg set scripts.start="node dist/server.js"
npm pkg set scripts.test="vitest run"
npm pkg set scripts.test:watch="vitest"
npm pkg set scripts.typecheck="tsc --noEmit"
npm pkg set scripts.format="prettier --write ."
```

- [ ] **Step 4: 写失败的测试**

`src/shared/ids.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { generateInviteToken, generateRoomCode, ROOM_CODE_ALPHABET } from './ids'

describe('generateRoomCode', () => {
  it('returns 6 characters from the unambiguous alphabet', () => {
    const code = generateRoomCode()
    expect(code).toHaveLength(6)
    for (const char of code) expect(ROOM_CODE_ALPHABET).toContain(char)
  })

  it('excludes visually ambiguous characters', () => {
    for (const char of ['I', 'O', '0', '1']) expect(ROOM_CODE_ALPHABET).not.toContain(char)
  })

  it('produces no duplicates across 2000 draws', () => {
    const codes = new Set(Array.from({ length: 2000 }, generateRoomCode))
    expect(codes.size).toBe(2000)
  })
})

describe('generateInviteToken', () => {
  it('returns 21 url-safe characters', () => {
    const token = generateInviteToken()
    expect(token).toHaveLength(21)
    expect(token).toMatch(/^[A-Za-z0-9_-]{21}$/)
  })

  it('produces no duplicates across 2000 draws', () => {
    const tokens = new Set(Array.from({ length: 2000 }, generateInviteToken))
    expect(tokens.size).toBe(2000)
  })
})
```

- [ ] **Step 5: 运行测试确认失败**

Run: `npm test`
Expected: FAIL，报错 `Failed to resolve import "./ids"`。

- [ ] **Step 6: 实现**

`src/shared/ids.ts`：

```ts
import { randomBytes } from 'node:crypto'

/** Uppercase alphanumerics without I, O, 0, 1 — safe to read aloud over voice chat. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'

function pick(alphabet: string, length: number): string {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i]! % alphabet.length]
  }
  return out
}

export function generateRoomCode(): string {
  return pick(ROOM_CODE_ALPHABET, 6)
}

export function generateInviteToken(): string {
  return pick(TOKEN_ALPHABET, 21)
}
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npm test`
Expected: PASS，6 个用例全绿。

注：`generateRoomCode` 的唯一性由调用方（房间层）再做一次碰撞检查，本测试只验证随机性足够。

- [ ] **Step 8: 类型检查**

Run: `npm run typecheck`
Expected: 无输出（通过）。若报缺少 `next-env.d.ts`，先创建内容为 `/// <reference types="next" />` 的同名文件。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "chore: bootstrap toolchain and shared id helpers"
```

---

## Task 2: 游戏契约、确定性随机与井字棋逻辑

**Files:**
- Create: `src/shared/rng.ts`, `src/games/types.ts`, `src/games/tic-tac-toe/logic.ts`, `src/games/registry.ts`
- Test: `src/shared/rng.test.ts`, `src/games/tic-tac-toe/logic.test.ts`, `src/games/boundaries.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `createRng(seed: string): () => number`、`shuffle<T>(items: T[], rng: () => number): T[]`
  - `GameLogic<S, A>`（含 `meta` / `createInitialState` / `applyAction` / `getViewFor` / `isFinished`）、`PlayerRef`、`ActionResult<S>`、`GameMeta`、`BoardProps`
  - `ticTacToe: GameLogic<TicTacToeState, TicTacToeAction>`、`TicTacToeView`
  - `gameRegistry: GameRegistry`（`get(id)` / `list()`）

- [ ] **Step 1: 写 rng 的失败测试**

`src/shared/rng.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { createRng, shuffle } from './rng'

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng('seed-a')
    const b = createRng('seed-a')
    const left = [a(), a(), a(), a(), a()]
    const right = [b(), b(), b(), b(), b()]
    expect(left).toEqual(right)
  })

  it('produces different sequences for different seeds', () => {
    const a = createRng('seed-a')
    const b = createRng('seed-b')
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()])
  })

  it('stays within [0, 1)', () => {
    const rng = createRng('range')
    for (let i = 0; i < 500; i += 1) {
      const value = rng()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('shuffle', () => {
  it('is deterministic for the same seed', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(shuffle(input, createRng('x'))).toEqual(shuffle(input, createRng('x')))
  })

  it('returns a permutation and leaves the input untouched', () => {
    const input = [1, 2, 3, 4, 5]
    const out = shuffle(input, createRng('y'))
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5])
    expect(input).toEqual([1, 2, 3, 4, 5])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/shared/rng.test.ts`
Expected: FAIL，无法解析 `./rng`。

- [ ] **Step 3: 实现 rng**

`src/shared/rng.ts`：

```ts
/** Deterministic PRNG (mulberry32) seeded from an arbitrary string. */
export function createRng(seed: string): () => number {
  let state = hashSeed(seed)
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Fisher-Yates using the supplied rng. Returns a new array. */
export function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const a = out[i]!
    const b = out[j]!
    out[i] = b
    out[j] = a
  }
  return out
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/shared/rng.test.ts`
Expected: PASS。

- [ ] **Step 5: 写游戏契约（无测试，纯类型）**

`src/games/types.ts`：

```ts
import type { ComponentType } from 'react'

export type PlayerRef = { id: string; name: string; seat: number }

export type GameMeta = {
  id: string
  name: string
  description: string
  minPlayers: number
  maxPlayers: number
}

export type ActionResult<S> = { ok: true; state: S } | { ok: false; reason: string }

export type FinishResult = { finished: boolean; winners: string[] }

/**
 * Every game is pure: no clock, no network, no ambient randomness.
 * Randomness must derive from the injected `seed`.
 */
export interface GameLogic<S = unknown, A = unknown> {
  meta: GameMeta
  createInitialState(players: PlayerRef[], seed: string): S
  applyAction(state: S, playerId: string, action: A): ActionResult<S>
  /** Server calls this per player; hidden information must be stripped here. */
  getViewFor(state: S, playerId: string): unknown
  isFinished(state: S): FinishResult
}

export type BoardProps<V = unknown, A = unknown> = {
  view: V
  me: string
  onAction: (action: A) => void
}

export type BoardComponent = ComponentType<BoardProps<never, never>>
```

- [ ] **Step 6: 写井字棋的失败测试**

`src/games/tic-tac-toe/logic.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import type { PlayerRef } from '../types'
import { ticTacToe, type TicTacToeState, type TicTacToeView } from './logic'

const players: PlayerRef[] = [
  { id: 'p1', name: '小明', seat: 0 },
  { id: 'p2', name: '小红', seat: 1 },
]

function start(seed = 'seed-1'): TicTacToeState {
  return ticTacToe.createInitialState(players, seed)
}

function place(state: TicTacToeState, playerId: string, cell: number): TicTacToeState {
  const result = ticTacToe.applyAction(state, playerId, { type: 'place', cell })
  if (!result.ok) throw new Error(`unexpected rejection: ${result.reason}`)
  return result.state
}

function firstPlayer(state: TicTacToeState): string {
  return state.order[0]!
}

function secondPlayer(state: TicTacToeState): string {
  return state.order[1]!
}

describe('createInitialState', () => {
  it('starts with an empty board and both players seated', () => {
    const state = start()
    expect(state.board).toEqual(Array(9).fill(null))
    expect(state.order).toHaveLength(2)
    expect(new Set(state.order)).toEqual(new Set(['p1', 'p2']))
    expect(state.winner).toBeNull()
    expect(state.draw).toBe(false)
  })

  it('gives X to whoever moves first', () => {
    const state = start()
    expect(state.marks[firstPlayer(state)]).toBe('X')
    expect(state.marks[secondPlayer(state)]).toBe('O')
  })

  it('is reproducible for the same seed', () => {
    expect(start('same').order).toEqual(start('same').order)
  })
})

describe('applyAction', () => {
  it('places a mark and passes the turn', () => {
    const state = place(start(), firstPlayer(start()), 4)
    expect(state.board[4]).toBe(firstPlayer(state))
    expect(state.turn).toBe(1)
  })

  it('rejects a move out of turn', () => {
    const state = start()
    const result = ticTacToe.applyAction(state, secondPlayer(state), { type: 'place', cell: 0 })
    expect(result).toEqual({ ok: false, reason: '还没轮到你' })
  })

  it('rejects an occupied cell', () => {
    let state = start()
    state = place(state, firstPlayer(state), 0)
    const result = ticTacToe.applyAction(state, secondPlayer(state), { type: 'place', cell: 0 })
    expect(result).toEqual({ ok: false, reason: '这个格子已经有人下了' })
  })

  it('rejects an out-of-range cell', () => {
    const state = start()
    const result = ticTacToe.applyAction(state, firstPlayer(state), { type: 'place', cell: 9 })
    expect(result).toEqual({ ok: false, reason: '非法的格子' })
  })

  it('rejects a player who is not in the game', () => {
    const state = start()
    const result = ticTacToe.applyAction(state, 'stranger', { type: 'place', cell: 0 })
    expect(result).toEqual({ ok: false, reason: '你不在这局游戏里' })
  })

  it('detects a row win', () => {
    let state = start()
    const [x, o] = [firstPlayer(state), secondPlayer(state)]
    state = place(state, x, 0)
    state = place(state, o, 3)
    state = place(state, x, 1)
    state = place(state, o, 4)
    state = place(state, x, 2)
    expect(state.winner).toBe(x)
    expect(ticTacToe.isFinished(state)).toEqual({ finished: true, winners: [x] })
  })

  it('detects a diagonal win', () => {
    let state = start()
    const [x, o] = [firstPlayer(state), secondPlayer(state)]
    state = place(state, x, 0)
    state = place(state, o, 1)
    state = place(state, x, 4)
    state = place(state, o, 2)
    state = place(state, x, 8)
    expect(state.winner).toBe(x)
  })

  it('detects a draw', () => {
    let state = start()
    const [x, o] = [firstPlayer(state), secondPlayer(state)]
    for (const [player, cell] of [
      [x, 0], [o, 1], [x, 2],
      [o, 4], [x, 3], [o, 5],
      [x, 7], [o, 6], [x, 8],
    ] as const) {
      state = place(state, player as string, cell as number)
    }
    expect(state.winner).toBeNull()
    expect(state.draw).toBe(true)
    expect(ticTacToe.isFinished(state)).toEqual({ finished: true, winners: [] })
  })

  it('rejects any move after the game is over', () => {
    let state = start()
    const [x, o] = [firstPlayer(state), secondPlayer(state)]
    state = place(state, x, 0)
    state = place(state, o, 3)
    state = place(state, x, 1)
    state = place(state, o, 4)
    state = place(state, x, 2)
    const result = ticTacToe.applyAction(state, o, { type: 'place', cell: 5 })
    expect(result).toEqual({ ok: false, reason: '对局已经结束了' })
  })

  it('does not mutate the previous state', () => {
    const state = start()
    place(state, firstPlayer(state), 0)
    expect(state.board).toEqual(Array(9).fill(null))
  })
})

describe('getViewFor', () => {
  it('exposes marks rather than player ids', () => {
    let state = start()
    const x = firstPlayer(state)
    state = place(state, x, 4)
    const view = ticTacToe.getViewFor(state, x) as TicTacToeView
    expect(view.cells[4]).toBe('X')
    expect(view.myMark).toBe('X')
    expect(view.currentMark).toBe('O')
    expect(JSON.stringify(view)).not.toContain('board')
  })

  it('reports no mark for an observer who is not seated', () => {
    const view = ticTacToe.getViewFor(start(), 'stranger') as TicTacToeView
    expect(view.myMark).toBeNull()
  })
})

describe('isFinished', () => {
  it('reports an unfinished game', () => {
    expect(ticTacToe.isFinished(start())).toEqual({ finished: false, winners: [] })
  })
})
```

- [ ] **Step 7: 运行确认失败**

Run: `npx vitest run src/games/tic-tac-toe/logic.test.ts`
Expected: FAIL，无法解析 `./logic`。

- [ ] **Step 8: 实现井字棋**

`src/games/tic-tac-toe/logic.ts`：

```ts
import { createRng, shuffle } from '../../shared/rng'
import type { ActionResult, FinishResult, GameLogic, PlayerRef } from '../types'

export type Mark = 'X' | 'O'

export type TicTacToeState = {
  /** 9 cells, each holding the playerId that claimed it. */
  board: (string | null)[]
  marks: Record<string, Mark>
  /** playerIds in turn order; index 0 moves first and plays X. */
  order: string[]
  turn: number
  winner: string | null
  draw: boolean
}

export type TicTacToeAction = { type: 'place'; cell: number }

export type TicTacToeView = {
  cells: (Mark | null)[]
  myMark: Mark | null
  currentPlayerId: string | null
  currentMark: Mark | null
  winner: string | null
  draw: boolean
}

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

export const ticTacToe: GameLogic<TicTacToeState, TicTacToeAction> = {
  meta: {
    id: 'tic-tac-toe',
    name: '井字棋',
    description: '经典三连棋，两人对弈，先连成一条线者获胜。',
    minPlayers: 2,
    maxPlayers: 2,
  },

  createInitialState(players: PlayerRef[], seed: string): TicTacToeState {
    const order = shuffle(
      [...players].sort((a, b) => a.seat - b.seat).map((p) => p.id),
      createRng(seed),
    )
    const marks: Record<string, Mark> = {}
    order.forEach((id, index) => {
      marks[id] = index === 0 ? 'X' : 'O'
    })
    return { board: Array(9).fill(null), marks, order, turn: 0, winner: null, draw: false }
  },

  applyAction(state, playerId, action): ActionResult<TicTacToeState> {
    if (state.winner !== null || state.draw) return { ok: false, reason: '对局已经结束了' }
    if (!state.order.includes(playerId)) return { ok: false, reason: '你不在这局游戏里' }
    if (state.order[state.turn] !== playerId) return { ok: false, reason: '还没轮到你' }
    if (!Number.isInteger(action.cell) || action.cell < 0 || action.cell > 8) {
      return { ok: false, reason: '非法的格子' }
    }
    if (state.board[action.cell] !== null) return { ok: false, reason: '这个格子已经有人下了' }

    const board = [...state.board]
    board[action.cell] = playerId
    const winner = findWinner(board)
    const draw = winner === null && board.every((cell) => cell !== null)

    return {
      ok: true,
      state: {
        ...state,
        board,
        winner,
        draw,
        turn: winner !== null || draw ? state.turn : (state.turn + 1) % state.order.length,
      },
    }
  },

  getViewFor(state, playerId): TicTacToeView {
    const currentPlayerId = state.winner !== null || state.draw ? null : state.order[state.turn] ?? null
    return {
      cells: state.board.map((owner) => (owner === null ? null : state.marks[owner] ?? null)),
      myMark: state.marks[playerId] ?? null,
      currentPlayerId,
      currentMark: currentPlayerId === null ? null : state.marks[currentPlayerId] ?? null,
      winner: state.winner,
      draw: state.draw,
    }
  },

  isFinished(state): FinishResult {
    if (state.winner !== null) return { finished: true, winners: [state.winner] }
    if (state.draw) return { finished: true, winners: [] }
    return { finished: false, winners: [] }
  },
}

function findWinner(board: (string | null)[]): string | null {
  for (const [a, b, c] of LINES) {
    const owner = board[a!]
    if (owner !== null && owner === board[b!] && owner === board[c!]) return owner
  }
  return null
}
```

- [ ] **Step 9: 运行确认通过**

Run: `npx vitest run src/games/tic-tac-toe/logic.test.ts`
Expected: PASS，全部用例通过。

- [ ] **Step 10: 实现注册表**

`src/games/registry.ts`：

```ts
import { ticTacToe } from './tic-tac-toe/logic'
import type { GameLogic, GameMeta } from './types'

export type GameRegistry = {
  get(id: string): GameLogic | undefined
  list(): GameMeta[]
}

const ALL: GameLogic[] = [ticTacToe as GameLogic]

export const gameRegistry: GameRegistry = {
  get(id) {
    return ALL.find((game) => game.meta.id === id)
  },
  list() {
    return ALL.map((game) => game.meta)
  },
}
```

- [ ] **Step 11: 写边界约束测试（守住游戏层纯度）**

`src/games/boundaries.test.ts`：

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const GAMES_DIR = path.resolve(__dirname)
const FORBIDDEN = [
  { pattern: /from ['"]socket\.io/, label: 'socket.io' },
  { pattern: /from ['"]next[/'"]/, label: 'next' },
  { pattern: /from ['"]node:/, label: 'node builtins' },
  { pattern: /Math\.random\(/, label: 'Math.random' },
  { pattern: /Date\.now\(/, label: 'Date.now' },
  { pattern: /new Date\(/, label: 'new Date' },
]

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    if (!/\.tsx?$/.test(entry) || entry.endsWith('.test.ts')) return []
    return [full]
  })
}

describe('game layer purity', () => {
  it('keeps games free of transport, clock and ambient randomness', () => {
    const violations: string[] = []
    for (const file of sourceFiles(GAMES_DIR)) {
      const source = readFileSync(file, 'utf8')
      for (const { pattern, label } of FORBIDDEN) {
        if (pattern.test(source)) {
          violations.push(`${path.relative(GAMES_DIR, file)} uses ${label}`)
        }
      }
    }
    expect(violations).toEqual([])
  })
})
```

- [ ] **Step 12: 运行全部测试与类型检查**

Run: `npm test && npm run typecheck`
Expected: 全部 PASS，typecheck 无输出。

- [ ] **Step 13: 提交**

```bash
git add -A
git commit -m "feat: add game contract, seeded rng and tic-tac-toe logic"
```

---

## Task 3: 房间存储与对外类型

**Files:**
- Create: `src/server/rooms/store.ts`, `src/shared/types.ts`
- Test: `src/server/rooms/store.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `Player`、`Room`、`RoomStatus` 类型（store.ts）
  - `RoomStore`：`create(room)` / `get(id)` / `getByInviteToken(token)` / `list()` / `delete(id)` / `has(id)`
  - `createRoomStore(): RoomStore`
  - `PlayerPublic`、`RoomPublic`（shared/types.ts）

- [ ] **Step 1: 写失败的测试**

`src/server/rooms/store.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { createRoomStore, type Room } from './store'

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 'ABC234',
    inviteToken: 'token-1',
    gameId: 'tic-tac-toe',
    hostId: null,
    players: [],
    status: 'waiting',
    gameState: null,
    seed: '',
    createdAt: 1000,
    lastActivityAt: 1000,
    ...overrides,
  }
}

describe('createRoomStore', () => {
  it('stores and retrieves a room by id', () => {
    const store = createRoomStore()
    const room = makeRoom()
    store.create(room)
    expect(store.get('ABC234')).toBe(room)
    expect(store.has('ABC234')).toBe(true)
  })

  it('returns undefined for an unknown id', () => {
    expect(createRoomStore().get('NOPE12')).toBeUndefined()
  })

  it('retrieves a room by invite token', () => {
    const store = createRoomStore()
    store.create(makeRoom({ id: 'AAA222', inviteToken: 'tok-a' }))
    store.create(makeRoom({ id: 'BBB333', inviteToken: 'tok-b' }))
    expect(store.getByInviteToken('tok-b')?.id).toBe('BBB333')
    expect(store.getByInviteToken('missing')).toBeUndefined()
  })

  it('lists all rooms', () => {
    const store = createRoomStore()
    store.create(makeRoom({ id: 'AAA222', inviteToken: 'tok-a' }))
    store.create(makeRoom({ id: 'BBB333', inviteToken: 'tok-b' }))
    expect(store.list().map((room) => room.id).sort()).toEqual(['AAA222', 'BBB333'])
  })

  it('deletes a room and drops its token index', () => {
    const store = createRoomStore()
    store.create(makeRoom({ id: 'AAA222', inviteToken: 'tok-a' }))
    store.delete('AAA222')
    expect(store.get('AAA222')).toBeUndefined()
    expect(store.getByInviteToken('tok-a')).toBeUndefined()
    expect(store.list()).toEqual([])
  })

  it('ignores deletion of an unknown room', () => {
    const store = createRoomStore()
    expect(() => store.delete('NOPE12')).not.toThrow()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/server/rooms/store.test.ts`
Expected: FAIL，无法解析 `./store`。

- [ ] **Step 3: 实现 store**

`src/server/rooms/store.ts`：

```ts
export type RoomStatus = 'waiting' | 'playing' | 'finished'

export type Player = {
  id: string
  name: string
  seat: number
  connected: boolean
  joinedAt: number
}

export type Room = {
  /** 6-char code, safe to read aloud. */
  id: string
  /** 21-char secret; only ever appears in invite links. */
  inviteToken: string
  gameId: string
  hostId: string | null
  players: Player[]
  status: RoomStatus
  /** Opaque to this layer — owned by the game's GameLogic. */
  gameState: unknown
  seed: string
  createdAt: number
  lastActivityAt: number
}

export type RoomStore = {
  create(room: Room): void
  get(id: string): Room | undefined
  getByInviteToken(token: string): Room | undefined
  has(id: string): boolean
  list(): Room[]
  delete(id: string): void
}

export function createRoomStore(): RoomStore {
  const rooms = new Map<string, Room>()
  const byToken = new Map<string, string>()

  return {
    create(room) {
      rooms.set(room.id, room)
      byToken.set(room.inviteToken, room.id)
    },
    get(id) {
      return rooms.get(id)
    },
    getByInviteToken(token) {
      const id = byToken.get(token)
      return id === undefined ? undefined : rooms.get(id)
    },
    has(id) {
      return rooms.has(id)
    },
    list() {
      return [...rooms.values()]
    },
    delete(id) {
      const room = rooms.get(id)
      if (room === undefined) return
      byToken.delete(room.inviteToken)
      rooms.delete(id)
    },
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/server/rooms/store.test.ts`
Expected: PASS。

- [ ] **Step 5: 写对外类型（无测试，纯类型）**

`src/shared/types.ts`：

```ts
export type RoomStatus = 'waiting' | 'playing' | 'finished'

export type PlayerPublic = {
  id: string
  name: string
  seat: number
  connected: boolean
}

/** What every member of a room may see. Never includes another player's private state. */
export type RoomPublic = {
  id: string
  inviteToken: string
  gameId: string
  gameName: string
  minPlayers: number
  maxPlayers: number
  hostId: string | null
  status: RoomStatus
  players: PlayerPublic[]
  winners: string[]
}
```

- [ ] **Step 6: 类型检查并提交**

Run: `npm test && npm run typecheck`
Expected: 全绿。

```bash
git add -A
git commit -m "feat: add in-memory room store and public room types"
```

---

## Task 4: 房间服务——建房、入座、改名

**Files:**
- Create: `src/server/rooms/service.ts`
- Test: `src/server/rooms/service.test.ts`

**Interfaces:**
- Consumes: `RoomStore`、`Room`、`Player`（Task 3）；`gameRegistry`、`GameRegistry`（Task 2）；`generateRoomCode`、`generateInviteToken`（Task 1）
- Produces:
  - `ServiceDeps = { store: RoomStore; games: GameRegistry; now: () => number }`
  - `ServiceResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string }`
  - `createRoom(deps, gameId): ServiceResult<Room>`
  - `joinRoom(deps, { roomId, playerId, name? }): ServiceResult<Room>`
  - `renamePlayer(deps, { roomId, playerId, name }): ServiceResult<Room>`
  - `toPublicRoom(deps, room): RoomPublic`
  - 错误码：`ROOM_NOT_FOUND` `GAME_NOT_FOUND` `ROOM_FULL` `GAME_ALREADY_STARTED` `INVALID_NAME` `NOT_IN_ROOM`

- [ ] **Step 1: 写失败的测试**

`src/server/rooms/service.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { gameRegistry } from '../../games/registry'
import { createRoomStore } from './store'
import { createRoom, joinRoom, renamePlayer, toPublicRoom, type ServiceDeps } from './service'

let clock = 1000
let deps: ServiceDeps

beforeEach(() => {
  clock = 1000
  deps = { store: createRoomStore(), games: gameRegistry, now: () => clock }
})

function newRoomId(): string {
  const result = createRoom(deps, 'tic-tac-toe')
  if (!result.ok) throw new Error(result.message)
  return result.value.id
}

describe('createRoom', () => {
  it('creates a waiting room with an invite token and no players', () => {
    const result = createRoom(deps, 'tic-tac-toe')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.status).toBe('waiting')
    expect(result.value.players).toEqual([])
    expect(result.value.hostId).toBeNull()
    expect(result.value.id).toHaveLength(6)
    expect(result.value.inviteToken).toHaveLength(21)
    expect(deps.store.get(result.value.id)).toBeDefined()
  })

  it('rejects an unknown game', () => {
    const result = createRoom(deps, 'no-such-game')
    expect(result).toEqual({ ok: false, code: 'GAME_NOT_FOUND', message: '没有这个游戏' })
  })

  it('gives each room a distinct id and token', () => {
    const ids = new Set(Array.from({ length: 50 }, newRoomId))
    expect(ids.size).toBe(50)
  })
})

describe('joinRoom', () => {
  it('seats the first player as host with a default name', () => {
    const roomId = newRoomId()
    const result = joinRoom(deps, { roomId, playerId: 'p1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.hostId).toBe('p1')
    expect(result.value.players).toEqual([
      { id: 'p1', name: '玩家1', seat: 0, connected: true, joinedAt: 1000 },
    ])
  })

  it('seats a second player with the next seat and default name', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1' })
    const result = joinRoom(deps, { roomId, playerId: 'p2' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.players[1]).toMatchObject({ id: 'p2', name: '玩家2', seat: 1 })
    expect(result.value.hostId).toBe('p1')
  })

  it('accepts a supplied name', () => {
    const roomId = newRoomId()
    const result = joinRoom(deps, { roomId, playerId: 'p1', name: '  小明  ' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.players[0]!.name).toBe('小明')
  })

  it('deduplicates a colliding name', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1', name: '小明' })
    const result = joinRoom(deps, { roomId, playerId: 'p2', name: '小明' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.players[1]!.name).toBe('小明2')
  })

  it('treats a repeat join as a reconnect keeping seat and name', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1', name: '小明' })
    const room = deps.store.get(roomId)!
    room.players[0]!.connected = false
    clock = 2000
    const result = joinRoom(deps, { roomId, playerId: 'p1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.players).toHaveLength(1)
    expect(result.value.players[0]).toMatchObject({ name: '小明', seat: 0, connected: true })
  })

  it('rejects joining a full room', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1' })
    joinRoom(deps, { roomId, playerId: 'p2' })
    const result = joinRoom(deps, { roomId, playerId: 'p3' })
    expect(result).toEqual({ ok: false, code: 'ROOM_FULL', message: '房间已满' })
  })

  it('rejects a new player once the game has started', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1' })
    deps.store.get(roomId)!.status = 'playing'
    const result = joinRoom(deps, { roomId, playerId: 'p2' })
    expect(result).toEqual({
      ok: false,
      code: 'GAME_ALREADY_STARTED',
      message: '对局已经开始，无法加入',
    })
  })

  it('still lets an existing player reconnect after the game has started', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1' })
    deps.store.get(roomId)!.status = 'playing'
    expect(joinRoom(deps, { roomId, playerId: 'p1' }).ok).toBe(true)
  })

  it('rejects an unknown room', () => {
    const result = joinRoom(deps, { roomId: 'NOPE12', playerId: 'p1' })
    expect(result).toEqual({ ok: false, code: 'ROOM_NOT_FOUND', message: '房间不存在或已过期' })
  })

  it('refreshes lastActivityAt', () => {
    const roomId = newRoomId()
    clock = 5000
    joinRoom(deps, { roomId, playerId: 'p1' })
    expect(deps.store.get(roomId)!.lastActivityAt).toBe(5000)
  })
})

describe('renamePlayer', () => {
  it('renames the player', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1' })
    const result = renamePlayer(deps, { roomId, playerId: 'p1', name: '  小红 ' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.players[0]!.name).toBe('小红')
  })

  it('rejects an empty name', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1' })
    expect(renamePlayer(deps, { roomId, playerId: 'p1', name: '   ' })).toEqual({
      ok: false,
      code: 'INVALID_NAME',
      message: '昵称需要 1 到 12 个字',
    })
  })

  it('rejects a name longer than 12 characters', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1' })
    const result = renamePlayer(deps, { roomId, playerId: 'p1', name: 'a'.repeat(13) })
    expect(result).toEqual({ ok: false, code: 'INVALID_NAME', message: '昵称需要 1 到 12 个字' })
  })

  it('deduplicates against other players', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1', name: '小明' })
    joinRoom(deps, { roomId, playerId: 'p2' })
    const result = renamePlayer(deps, { roomId, playerId: 'p2', name: '小明' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.players[1]!.name).toBe('小明2')
  })

  it('lets a player keep their own name unchanged', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1', name: '小明' })
    const result = renamePlayer(deps, { roomId, playerId: 'p1', name: '小明' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.players[0]!.name).toBe('小明')
  })

  it('rejects a player who is not in the room', () => {
    const roomId = newRoomId()
    expect(renamePlayer(deps, { roomId, playerId: 'ghost', name: '幽灵' })).toEqual({
      ok: false,
      code: 'NOT_IN_ROOM',
      message: '你不在这个房间里',
    })
  })
})

describe('toPublicRoom', () => {
  it('projects the room with game metadata and no game state', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1', name: '小明' })
    const view = toPublicRoom(deps, deps.store.get(roomId)!)
    expect(view).toEqual({
      id: roomId,
      inviteToken: deps.store.get(roomId)!.inviteToken,
      gameId: 'tic-tac-toe',
      gameName: '井字棋',
      minPlayers: 2,
      maxPlayers: 2,
      hostId: 'p1',
      status: 'waiting',
      players: [{ id: 'p1', name: '小明', seat: 0, connected: true }],
      winners: [],
    })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/server/rooms/service.test.ts`
Expected: FAIL，无法解析 `./service`。

- [ ] **Step 3: 实现服务的第一部分**

`src/server/rooms/service.ts`：

```ts
import type { GameRegistry } from '../../games/registry'
import { generateInviteToken, generateRoomCode } from '../../shared/ids'
import type { PlayerPublic, RoomPublic } from '../../shared/types'
import type { Player, Room, RoomStore } from './store'

export type ServiceDeps = {
  store: RoomStore
  games: GameRegistry
  now: () => number
}

export type ServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string }

const NAME_MIN = 1
const NAME_MAX = 12

function fail(code: string, message: string): ServiceResult<never> {
  return { ok: false, code, message }
}

function touch(deps: ServiceDeps, room: Room): void {
  room.lastActivityAt = deps.now()
}

export function createRoom(deps: ServiceDeps, gameId: string): ServiceResult<Room> {
  const game = deps.games.get(gameId)
  if (game === undefined) return fail('GAME_NOT_FOUND', '没有这个游戏')

  let id = generateRoomCode()
  while (deps.store.has(id)) id = generateRoomCode()

  const now = deps.now()
  const room: Room = {
    id,
    inviteToken: generateInviteToken(),
    gameId,
    hostId: null,
    players: [],
    status: 'waiting',
    gameState: null,
    seed: '',
    createdAt: now,
    lastActivityAt: now,
  }
  deps.store.create(room)
  return { ok: true, value: room }
}

export function joinRoom(
  deps: ServiceDeps,
  params: { roomId: string; playerId: string; name?: string },
): ServiceResult<Room> {
  const room = deps.store.get(params.roomId)
  if (room === undefined) return fail('ROOM_NOT_FOUND', '房间不存在或已过期')

  const existing = room.players.find((player) => player.id === params.playerId)
  if (existing !== undefined) {
    existing.connected = true
    touch(deps, room)
    return { ok: true, value: room }
  }

  if (room.status !== 'waiting') {
    return fail('GAME_ALREADY_STARTED', '对局已经开始，无法加入')
  }

  const game = deps.games.get(room.gameId)
  if (game === undefined) return fail('GAME_NOT_FOUND', '没有这个游戏')
  if (room.players.length >= game.meta.maxPlayers) return fail('ROOM_FULL', '房间已满')

  const seat = room.players.length
  const requested = (params.name ?? '').trim()
  const base = requested.length > 0 ? requested.slice(0, NAME_MAX) : `玩家${seat + 1}`
  const player: Player = {
    id: params.playerId,
    name: dedupeName(base, room.players),
    seat,
    connected: true,
    joinedAt: deps.now(),
  }
  room.players.push(player)
  if (room.hostId === null) room.hostId = player.id
  touch(deps, room)
  return { ok: true, value: room }
}

export function renamePlayer(
  deps: ServiceDeps,
  params: { roomId: string; playerId: string; name: string },
): ServiceResult<Room> {
  const room = deps.store.get(params.roomId)
  if (room === undefined) return fail('ROOM_NOT_FOUND', '房间不存在或已过期')

  const player = room.players.find((candidate) => candidate.id === params.playerId)
  if (player === undefined) return fail('NOT_IN_ROOM', '你不在这个房间里')

  const name = params.name.trim()
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return fail('INVALID_NAME', `昵称需要 ${NAME_MIN} 到 ${NAME_MAX} 个字`)
  }

  const others = room.players.filter((candidate) => candidate.id !== params.playerId)
  player.name = dedupeName(name, others)
  touch(deps, room)
  return { ok: true, value: room }
}

export function toPublicRoom(deps: ServiceDeps, room: Room): RoomPublic {
  const game = deps.games.get(room.gameId)
  const players: PlayerPublic[] = room.players.map((player) => ({
    id: player.id,
    name: player.name,
    seat: player.seat,
    connected: player.connected,
  }))
  const winners =
    game !== undefined && room.status === 'finished' && room.gameState !== null
      ? game.isFinished(room.gameState).winners
      : []

  return {
    id: room.id,
    inviteToken: room.inviteToken,
    gameId: room.gameId,
    gameName: game?.meta.name ?? room.gameId,
    minPlayers: game?.meta.minPlayers ?? 0,
    maxPlayers: game?.meta.maxPlayers ?? 0,
    hostId: room.hostId,
    status: room.status,
    players,
    winners,
  }
}

function dedupeName(name: string, others: Player[]): string {
  const taken = new Set(others.map((player) => player.name))
  if (!taken.has(name)) return name
  let suffix = 2
  while (taken.has(`${name}${suffix}`)) suffix += 1
  return `${name}${suffix}`
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/server/rooms/service.test.ts`
Expected: PASS。

- [ ] **Step 5: 全量测试与类型检查后提交**

Run: `npm test && npm run typecheck`

```bash
git add -A
git commit -m "feat: add room service create/join/rename"
```

---

## Task 5: 房间服务——开局、出手、断线与房主转移

**Files:**
- Modify: `src/server/rooms/service.ts`（追加函数，不改动已有函数）
- Test: `src/server/rooms/service.test.ts`（追加 describe 块）

**Interfaces:**
- Consumes: Task 4 的 `ServiceDeps`、`ServiceResult`、`joinRoom`、`touch` 语义
- Produces:
  - `startGame(deps, { roomId, playerId }): ServiceResult<Room>`
  - `applyGameAction(deps, { roomId, playerId, action }): ServiceResult<Room>`
  - `markDisconnected(deps, { roomId, playerId }): ServiceResult<Room>`
  - `viewFor(deps, room, playerId): unknown | null`
  - 追加错误码：`NOT_HOST` `NOT_ENOUGH_PLAYERS` `TOO_MANY_PLAYERS` `NOT_WAITING` `NOT_PLAYING` `INVALID_ACTION`

- [ ] **Step 1: 追加失败的测试**

在 `src/server/rooms/service.test.ts` 末尾追加（并把顶部 import 补上新函数）：

```ts
import {
  applyGameAction,
  markDisconnected,
  startGame,
  viewFor,
} from './service'
import type { TicTacToeState, TicTacToeView } from '../../games/tic-tac-toe/logic'

function seatedRoom(): string {
  const roomId = newRoomId()
  joinRoom(deps, { roomId, playerId: 'p1', name: '小明' })
  joinRoom(deps, { roomId, playerId: 'p2', name: '小红' })
  return roomId
}

describe('startGame', () => {
  it('starts the game and seeds the initial state', () => {
    const roomId = seatedRoom()
    const result = startGame(deps, { roomId, playerId: 'p1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.status).toBe('playing')
    expect(result.value.seed).not.toBe('')
    const state = result.value.gameState as TicTacToeState
    expect(state.board).toEqual(Array(9).fill(null))
  })

  it('rejects a non-host', () => {
    const roomId = seatedRoom()
    expect(startGame(deps, { roomId, playerId: 'p2' })).toEqual({
      ok: false,
      code: 'NOT_HOST',
      message: '只有房主可以开始游戏',
    })
  })

  it('rejects too few players', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1' })
    expect(startGame(deps, { roomId, playerId: 'p1' })).toEqual({
      ok: false,
      code: 'NOT_ENOUGH_PLAYERS',
      message: '人数不够，至少需要 2 人',
    })
  })

  it('rejects starting a game that is already running', () => {
    const roomId = seatedRoom()
    startGame(deps, { roomId, playerId: 'p1' })
    expect(startGame(deps, { roomId, playerId: 'p1' })).toEqual({
      ok: false,
      code: 'NOT_WAITING',
      message: '对局已经开始了',
    })
  })

  it('rejects an unknown room', () => {
    expect(startGame(deps, { roomId: 'NOPE12', playerId: 'p1' })).toEqual({
      ok: false,
      code: 'ROOM_NOT_FOUND',
      message: '房间不存在或已过期',
    })
  })
})

describe('applyGameAction', () => {
  function currentPlayer(roomId: string): string {
    const state = deps.store.get(roomId)!.gameState as TicTacToeState
    return state.order[state.turn]!
  }

  it('applies a legal move', () => {
    const roomId = seatedRoom()
    startGame(deps, { roomId, playerId: 'p1' })
    const mover = currentPlayer(roomId)
    const result = applyGameAction(deps, { roomId, playerId: mover, action: { type: 'place', cell: 4 } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((result.value.gameState as TicTacToeState).board[4]).toBe(mover)
  })

  it('passes the game layer rejection through as INVALID_ACTION', () => {
    const roomId = seatedRoom()
    startGame(deps, { roomId, playerId: 'p1' })
    const waiting = currentPlayer(roomId) === 'p1' ? 'p2' : 'p1'
    expect(applyGameAction(deps, { roomId, playerId: waiting, action: { type: 'place', cell: 0 } })).toEqual({
      ok: false,
      code: 'INVALID_ACTION',
      message: '还没轮到你',
    })
  })

  it('marks the room finished once the game ends', () => {
    const roomId = seatedRoom()
    startGame(deps, { roomId, playerId: 'p1' })
    const x = currentPlayer(roomId)
    const o = x === 'p1' ? 'p2' : 'p1'
    for (const [player, cell] of [[x, 0], [o, 3], [x, 1], [o, 4], [x, 2]] as const) {
      const result = applyGameAction(deps, { roomId, playerId: player, action: { type: 'place', cell } })
      expect(result.ok).toBe(true)
    }
    const room = deps.store.get(roomId)!
    expect(room.status).toBe('finished')
    expect(toPublicRoom(deps, room).winners).toEqual([x])
  })

  it('rejects an action while the room is still waiting', () => {
    const roomId = seatedRoom()
    expect(applyGameAction(deps, { roomId, playerId: 'p1', action: { type: 'place', cell: 0 } })).toEqual({
      ok: false,
      code: 'NOT_PLAYING',
      message: '对局还没有开始',
    })
  })

  it('rejects a player who is not in the room', () => {
    const roomId = seatedRoom()
    startGame(deps, { roomId, playerId: 'p1' })
    expect(applyGameAction(deps, { roomId, playerId: 'ghost', action: { type: 'place', cell: 0 } })).toEqual({
      ok: false,
      code: 'NOT_IN_ROOM',
      message: '你不在这个房间里',
    })
  })
})

describe('markDisconnected', () => {
  it('keeps the seat and flips connected to false', () => {
    const roomId = seatedRoom()
    const result = markDisconnected(deps, { roomId, playerId: 'p2' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.players).toHaveLength(2)
    expect(result.value.players[1]).toMatchObject({ id: 'p2', connected: false, seat: 1 })
  })

  it('transfers the host to the next connected player', () => {
    const roomId = seatedRoom()
    const result = markDisconnected(deps, { roomId, playerId: 'p1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.hostId).toBe('p2')
  })

  it('keeps the host when nobody else is connected', () => {
    const roomId = seatedRoom()
    markDisconnected(deps, { roomId, playerId: 'p2' })
    const result = markDisconnected(deps, { roomId, playerId: 'p1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.hostId).toBe('p1')
  })

  it('ignores a player who is not in the room', () => {
    const roomId = seatedRoom()
    expect(markDisconnected(deps, { roomId, playerId: 'ghost' })).toEqual({
      ok: false,
      code: 'NOT_IN_ROOM',
      message: '你不在这个房间里',
    })
  })
})

describe('viewFor', () => {
  it('returns null before the game starts', () => {
    const roomId = seatedRoom()
    expect(viewFor(deps, deps.store.get(roomId)!, 'p1')).toBeNull()
  })

  it('returns the per-player view once playing', () => {
    const roomId = seatedRoom()
    startGame(deps, { roomId, playerId: 'p1' })
    const view = viewFor(deps, deps.store.get(roomId)!, 'p1') as TicTacToeView
    expect(view.cells).toHaveLength(9)
    expect(['X', 'O']).toContain(view.myMark)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/server/rooms/service.test.ts`
Expected: FAIL，`startGame is not a function` 之类的解析错误。

- [ ] **Step 3: 追加实现**

在 `src/server/rooms/service.ts` 末尾追加（`randomBytes` 加到文件顶部 import）：

```ts
import { randomBytes } from 'node:crypto'
```

```ts
export function startGame(
  deps: ServiceDeps,
  params: { roomId: string; playerId: string },
): ServiceResult<Room> {
  const room = deps.store.get(params.roomId)
  if (room === undefined) return fail('ROOM_NOT_FOUND', '房间不存在或已过期')
  if (room.status !== 'waiting') return fail('NOT_WAITING', '对局已经开始了')
  if (room.hostId !== params.playerId) return fail('NOT_HOST', '只有房主可以开始游戏')

  const game = deps.games.get(room.gameId)
  if (game === undefined) return fail('GAME_NOT_FOUND', '没有这个游戏')
  if (room.players.length < game.meta.minPlayers) {
    return fail('NOT_ENOUGH_PLAYERS', `人数不够，至少需要 ${game.meta.minPlayers} 人`)
  }
  if (room.players.length > game.meta.maxPlayers) {
    return fail('TOO_MANY_PLAYERS', `人数过多，最多 ${game.meta.maxPlayers} 人`)
  }

  room.seed = randomBytes(16).toString('hex')
  room.gameState = game.createInitialState(
    room.players.map((player) => ({ id: player.id, name: player.name, seat: player.seat })),
    room.seed,
  )
  room.status = 'playing'
  touch(deps, room)
  return { ok: true, value: room }
}

export function applyGameAction(
  deps: ServiceDeps,
  params: { roomId: string; playerId: string; action: unknown },
): ServiceResult<Room> {
  const room = deps.store.get(params.roomId)
  if (room === undefined) return fail('ROOM_NOT_FOUND', '房间不存在或已过期')
  if (!room.players.some((player) => player.id === params.playerId)) {
    return fail('NOT_IN_ROOM', '你不在这个房间里')
  }
  if (room.status !== 'playing') return fail('NOT_PLAYING', '对局还没有开始')

  const game = deps.games.get(room.gameId)
  if (game === undefined) return fail('GAME_NOT_FOUND', '没有这个游戏')

  const result = game.applyAction(room.gameState, params.playerId, params.action)
  if (!result.ok) return fail('INVALID_ACTION', result.reason)

  room.gameState = result.state
  if (game.isFinished(room.gameState).finished) room.status = 'finished'
  touch(deps, room)
  return { ok: true, value: room }
}

export function markDisconnected(
  deps: ServiceDeps,
  params: { roomId: string; playerId: string },
): ServiceResult<Room> {
  const room = deps.store.get(params.roomId)
  if (room === undefined) return fail('ROOM_NOT_FOUND', '房间不存在或已过期')

  const player = room.players.find((candidate) => candidate.id === params.playerId)
  if (player === undefined) return fail('NOT_IN_ROOM', '你不在这个房间里')

  player.connected = false
  if (room.hostId === player.id) {
    const successor = room.players.find(
      (candidate) => candidate.id !== player.id && candidate.connected,
    )
    if (successor !== undefined) room.hostId = successor.id
  }
  touch(deps, room)
  return { ok: true, value: room }
}

/** Per-player game view; null while the room has not started. */
export function viewFor(deps: ServiceDeps, room: Room, playerId: string): unknown | null {
  if (room.gameState === null) return null
  const game = deps.games.get(room.gameId)
  if (game === undefined) return null
  return game.getViewFor(room.gameState, playerId)
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/server/rooms/service.test.ts`
Expected: PASS。

- [ ] **Step 5: 全量测试与类型检查后提交**

Run: `npm test && npm run typecheck`

```bash
git add -A
git commit -m "feat: add room service start/action/disconnect with host transfer"
```

---

## Task 6: 过期房间回收

**Files:**
- Create: `src/server/rooms/cleanup.ts`
- Test: `src/server/rooms/cleanup.test.ts`

**Interfaces:**
- Consumes: `Room`、`RoomStore`（Task 3）
- Produces:
  - `CLEANUP_RULES = { allOfflineMs: 900_000, idleMs: 7_200_000, emptyMs: 900_000, intervalMs: 300_000 }`
  - `collectExpiredRoomIds(rooms: Room[], now: number): string[]`
  - `startCleanupTimer(store: RoomStore, now: () => number): () => void`（返回停止函数）

- [ ] **Step 1: 写失败的测试**

`src/server/rooms/cleanup.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { CLEANUP_RULES, collectExpiredRoomIds } from './cleanup'
import type { Player, Room } from './store'

function player(id: string, connected: boolean): Player {
  return { id, name: id, seat: 0, connected, joinedAt: 0 }
}

function room(overrides: Partial<Room>): Room {
  return {
    id: 'AAA222',
    inviteToken: 'tok',
    gameId: 'tic-tac-toe',
    hostId: null,
    players: [],
    status: 'waiting',
    gameState: null,
    seed: '',
    createdAt: 0,
    lastActivityAt: 0,
    ...overrides,
  }
}

const NOW = 10_000_000

describe('collectExpiredRoomIds', () => {
  it('keeps a room with a connected player and recent activity', () => {
    const active = room({ players: [player('p1', true)], lastActivityAt: NOW - 1000, createdAt: NOW - 1000 })
    expect(collectExpiredRoomIds([active], NOW)).toEqual([])
  })

  it('expires a room where everyone has been offline past the grace window', () => {
    const stale = room({
      id: 'OFF111',
      players: [player('p1', false), player('p2', false)],
      lastActivityAt: NOW - CLEANUP_RULES.allOfflineMs - 1,
      createdAt: NOW - CLEANUP_RULES.allOfflineMs - 1,
    })
    expect(collectExpiredRoomIds([stale], NOW)).toEqual(['OFF111'])
  })

  it('keeps an all-offline room that is still inside the grace window', () => {
    const recent = room({
      players: [player('p1', false)],
      lastActivityAt: NOW - CLEANUP_RULES.allOfflineMs + 1000,
      createdAt: NOW - CLEANUP_RULES.allOfflineMs + 1000,
    })
    expect(collectExpiredRoomIds([recent], NOW)).toEqual([])
  })

  it('expires an idle room even when someone is still connected', () => {
    const idle = room({
      id: 'IDL222',
      players: [player('p1', true)],
      lastActivityAt: NOW - CLEANUP_RULES.idleMs - 1,
      createdAt: NOW - CLEANUP_RULES.idleMs - 1,
    })
    expect(collectExpiredRoomIds([idle], NOW)).toEqual(['IDL222'])
  })

  it('expires an empty room that nobody ever joined', () => {
    const empty = room({
      id: 'EMP333',
      players: [],
      createdAt: NOW - CLEANUP_RULES.emptyMs - 1,
      lastActivityAt: NOW - CLEANUP_RULES.emptyMs - 1,
    })
    expect(collectExpiredRoomIds([empty], NOW)).toEqual(['EMP333'])
  })

  it('keeps a freshly created empty room', () => {
    const fresh = room({ players: [], createdAt: NOW - 1000, lastActivityAt: NOW - 1000 })
    expect(collectExpiredRoomIds([fresh], NOW)).toEqual([])
  })

  it('returns every expired room in one pass', () => {
    const rooms = [
      room({ id: 'KEEP11', players: [player('p1', true)], lastActivityAt: NOW, createdAt: NOW }),
      room({ id: 'GONE22', players: [player('p1', false)], lastActivityAt: 0, createdAt: 0 }),
      room({ id: 'GONE33', players: [], lastActivityAt: 0, createdAt: 0 }),
    ]
    expect(collectExpiredRoomIds(rooms, NOW).sort()).toEqual(['GONE22', 'GONE33'])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/server/rooms/cleanup.test.ts`
Expected: FAIL，无法解析 `./cleanup`。

- [ ] **Step 3: 实现**

`src/server/rooms/cleanup.ts`：

```ts
import type { Room, RoomStore } from './store'

export const CLEANUP_RULES = {
  /** Everyone offline for this long — drop the room. */
  allOfflineMs: 15 * 60 * 1000,
  /** No activity at all for this long — drop the room even if someone is connected. */
  idleMs: 2 * 60 * 60 * 1000,
  /** Created but never joined — drop the room. */
  emptyMs: 15 * 60 * 1000,
  intervalMs: 5 * 60 * 1000,
}

export function collectExpiredRoomIds(rooms: Room[], now: number): string[] {
  return rooms.filter((room) => isExpired(room, now)).map((room) => room.id)
}

function isExpired(room: Room, now: number): boolean {
  if (now - room.lastActivityAt > CLEANUP_RULES.idleMs) return true
  if (room.players.length === 0) return now - room.createdAt > CLEANUP_RULES.emptyMs
  const allOffline = room.players.every((player) => !player.connected)
  return allOffline && now - room.lastActivityAt > CLEANUP_RULES.allOfflineMs
}

/** Starts the periodic sweep. Returns a stop function. */
export function startCleanupTimer(store: RoomStore, now: () => number): () => void {
  const timer = setInterval(() => {
    for (const id of collectExpiredRoomIds(store.list(), now())) {
      store.delete(id)
    }
  }, CLEANUP_RULES.intervalMs)
  timer.unref?.()
  return () => clearInterval(timer)
}
```

- [ ] **Step 4: 运行确认通过并提交**

Run: `npm test && npm run typecheck`
Expected: 全绿。

```bash
git add -A
git commit -m "feat: add expired room cleanup"
```

---

## Task 7: 配置加载与签名凭证

**Files:**
- Create: `src/server/auth/config.ts`, `src/server/auth/tokens.ts`
- Test: `src/server/auth/config.test.ts`, `src/server/auth/tokens.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `AppConfig = { password: string; sessionSecret: string; port: number }`、`loadConfig(env): AppConfig`（缺失必填项时 throw）
  - `SESSION_COOKIE = 'gb_session'`、`SESSION_MAX_AGE_MS`、`GRANT_MAX_AGE_MS`、`grantCookieName(roomId)`
  - `createSessionValue(issuedAt, secret)`、`isSessionValid(value, secret, now)`
  - `createGrantValue(roomId, issuedAt, secret)`、`isGrantValid(value, roomId, secret, now)`
  - `passwordMatches(input, expected)`

- [ ] **Step 1: 写 config 的失败测试**

`src/server/auth/config.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

const base = { APP_PASSWORD: 'secret-pw', SESSION_SECRET: 'secret-key' }

describe('loadConfig', () => {
  it('reads password, secret and default port', () => {
    expect(loadConfig(base)).toEqual({ password: 'secret-pw', sessionSecret: 'secret-key', port: 3000 })
  })

  it('reads a custom port', () => {
    expect(loadConfig({ ...base, PORT: '8080' }).port).toBe(8080)
  })

  it('throws when APP_PASSWORD is missing', () => {
    expect(() => loadConfig({ SESSION_SECRET: 'k' })).toThrow('缺少环境变量 APP_PASSWORD')
  })

  it('throws when APP_PASSWORD is blank', () => {
    expect(() => loadConfig({ ...base, APP_PASSWORD: '   ' })).toThrow('缺少环境变量 APP_PASSWORD')
  })

  it('throws when SESSION_SECRET is missing', () => {
    expect(() => loadConfig({ APP_PASSWORD: 'p' })).toThrow('缺少环境变量 SESSION_SECRET')
  })

  it('throws when SESSION_SECRET is too short', () => {
    expect(() => loadConfig({ ...base, SESSION_SECRET: 'short' })).toThrow(
      'SESSION_SECRET 至少需要 8 个字符',
    )
  })

  it('throws on a non-numeric port', () => {
    expect(() => loadConfig({ ...base, PORT: 'abc' })).toThrow('PORT 必须是 1-65535 之间的数字')
  })

  it('throws on an out-of-range port', () => {
    expect(() => loadConfig({ ...base, PORT: '70000' })).toThrow('PORT 必须是 1-65535 之间的数字')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/server/auth/config.test.ts`
Expected: FAIL，无法解析 `./config`。

- [ ] **Step 3: 实现 config**

`src/server/auth/config.ts`：

```ts
export type AppConfig = {
  password: string
  sessionSecret: string
  port: number
}

type Env = Record<string, string | undefined>

/** Fails loudly at boot: a passwordless deployment must never start. */
export function loadConfig(env: Env): AppConfig {
  const password = (env.APP_PASSWORD ?? '').trim()
  if (password === '') throw new Error('缺少环境变量 APP_PASSWORD，服务无法启动')

  const sessionSecret = (env.SESSION_SECRET ?? '').trim()
  if (sessionSecret === '') throw new Error('缺少环境变量 SESSION_SECRET，服务无法启动')
  if (sessionSecret.length < 8) throw new Error('SESSION_SECRET 至少需要 8 个字符')

  const rawPort = (env.PORT ?? '').trim()
  let port = 3000
  if (rawPort !== '') {
    port = Number(rawPort)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('PORT 必须是 1-65535 之间的数字')
    }
  }

  return { password, sessionSecret, port }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/server/auth/config.test.ts`
Expected: PASS。

- [ ] **Step 5: 写 tokens 的失败测试**

`src/server/auth/tokens.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import {
  createGrantValue,
  createSessionValue,
  grantCookieName,
  GRANT_MAX_AGE_MS,
  isGrantValid,
  isSessionValid,
  passwordMatches,
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
} from './tokens'

const SECRET = 'a-very-secret-key'
const NOW = 1_700_000_000_000

describe('session cookie', () => {
  it('round-trips a freshly issued value', () => {
    const value = createSessionValue(NOW, SECRET)
    expect(isSessionValid(value, SECRET, NOW)).toBe(true)
  })

  it('rejects a value signed with a different secret', () => {
    const value = createSessionValue(NOW, SECRET)
    expect(isSessionValid(value, 'other-secret-key', NOW)).toBe(false)
  })

  it('rejects a tampered payload', () => {
    const value = createSessionValue(NOW, SECRET)
    const tampered = value.replace(/^session:\d+/, `session:${NOW + 5}`)
    expect(isSessionValid(tampered, SECRET, NOW)).toBe(false)
  })

  it('rejects an expired value', () => {
    const value = createSessionValue(NOW, SECRET)
    expect(isSessionValid(value, SECRET, NOW + SESSION_MAX_AGE_MS + 1)).toBe(false)
  })

  it('rejects undefined and garbage', () => {
    expect(isSessionValid(undefined, SECRET, NOW)).toBe(false)
    expect(isSessionValid('', SECRET, NOW)).toBe(false)
    expect(isSessionValid('not-a-cookie', SECRET, NOW)).toBe(false)
    expect(isSessionValid('session:abc.deadbeef', SECRET, NOW)).toBe(false)
  })

  it('uses a stable cookie name', () => {
    expect(SESSION_COOKIE).toBe('gb_session')
  })
})

describe('grant cookie', () => {
  it('round-trips for the room it was issued for', () => {
    const value = createGrantValue('ABC234', NOW, SECRET)
    expect(isGrantValid(value, 'ABC234', SECRET, NOW)).toBe(true)
  })

  it('does not authorise a different room', () => {
    const value = createGrantValue('ABC234', NOW, SECRET)
    expect(isGrantValid(value, 'ZZZ999', SECRET, NOW)).toBe(false)
  })

  it('expires after the grant window', () => {
    const value = createGrantValue('ABC234', NOW, SECRET)
    expect(isGrantValid(value, 'ABC234', SECRET, NOW + GRANT_MAX_AGE_MS + 1)).toBe(false)
  })

  it('namespaces the cookie per room', () => {
    expect(grantCookieName('ABC234')).toBe('gb_grant_ABC234')
  })
})

describe('passwordMatches', () => {
  it('accepts the exact password', () => {
    expect(passwordMatches('hunter2', 'hunter2')).toBe(true)
  })

  it('rejects a wrong password', () => {
    expect(passwordMatches('hunter3', 'hunter2')).toBe(false)
  })

  it('rejects a password of different length without throwing', () => {
    expect(passwordMatches('short', 'a-much-longer-password')).toBe(false)
  })

  it('rejects an empty attempt', () => {
    expect(passwordMatches('', 'hunter2')).toBe(false)
  })
})
```

- [ ] **Step 6: 运行确认失败**

Run: `npx vitest run src/server/auth/tokens.test.ts`
Expected: FAIL，无法解析 `./tokens`。

- [ ] **Step 7: 实现 tokens**

`src/server/auth/tokens.ts`：

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'gb_session'
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
export const GRANT_MAX_AGE_MS = 24 * 60 * 60 * 1000

export function grantCookieName(roomId: string): string {
  return `gb_grant_${roomId}`
}

function sign(payload: string, secret: string): string {
  const mac = createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${mac}`
}

/** Returns the payload when the signature checks out, otherwise null. */
function unsign(signed: string, secret: string): string | null {
  const separator = signed.lastIndexOf('.')
  if (separator <= 0) return null
  const payload = signed.slice(0, separator)
  const provided = signed.slice(separator + 1)
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  if (provided.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return null
  return payload
}

export function createSessionValue(issuedAt: number, secret: string): string {
  return sign(`session:${issuedAt}`, secret)
}

export function isSessionValid(
  value: string | undefined,
  secret: string,
  now: number,
): boolean {
  if (value === undefined || value === '') return false
  const payload = unsign(value, secret)
  if (payload === null) return false
  const match = /^session:(\d+)$/.exec(payload)
  if (match === null) return false
  const issuedAt = Number(match[1])
  return now - issuedAt <= SESSION_MAX_AGE_MS && now >= issuedAt
}

export function createGrantValue(roomId: string, issuedAt: number, secret: string): string {
  return sign(`grant:${roomId}:${issuedAt}`, secret)
}

export function isGrantValid(
  value: string | undefined,
  roomId: string,
  secret: string,
  now: number,
): boolean {
  if (value === undefined || value === '') return false
  const payload = unsign(value, secret)
  if (payload === null) return false
  const match = /^grant:([A-Za-z0-9]+):(\d+)$/.exec(payload)
  if (match === null || match[1] !== roomId) return false
  const issuedAt = Number(match[2])
  return now - issuedAt <= GRANT_MAX_AGE_MS && now >= issuedAt
}

export function passwordMatches(input: string, expected: string): boolean {
  const a = createHmac('sha256', 'password-compare').update(input).digest()
  const b = createHmac('sha256', 'password-compare').update(expected).digest()
  return timingSafeEqual(a, b)
}
```

- [ ] **Step 8: 运行确认通过并提交**

Run: `npm test && npm run typecheck`
Expected: 全绿。

```bash
git add -A
git commit -m "feat: add config loading and signed session/grant credentials"
```

---

## Task 8: 运行时单例、Socket 传输层与服务器工厂

**Files:**
- Create: `src/server/runtime.ts`, `src/server/socket/handlers.ts`, `src/server/app.ts`, `src/server/index.ts`, `src/shared/events.ts`
- Test: `tests/socket-flow.test.ts`

**Interfaces:**
- Consumes: Task 3–7 的全部导出
- Produces:
  - `getRoomStore(): RoomStore`、`getServiceDeps(): ServiceDeps`（均为 globalThis 单例）
  - `ClientEvents`、`ServerEvents`、`SyncPayload`、`ErrorPayload`（shared/events.ts）
  - `registerSocketHandlers(io, deps): void`
  - `createGameServer(options): Promise<{ httpServer, io, close }>`

**关键约束：** `runtime.ts` 必须把单例挂在 `globalThis` 上。Next 的路由处理器与自定义 server 是两套模块实例，普通模块级变量会导致 API 建的房间在 Socket.IO 侧不可见。

- [ ] **Step 1: 写事件契约（无测试，纯常量与类型）**

`src/shared/events.ts`：

```ts
import type { RoomPublic } from './types'

export const ClientEvents = {
  JOIN: 'room:join',
  RENAME: 'room:rename',
  START: 'game:start',
  ACTION: 'game:action',
} as const

export const ServerEvents = {
  SYNC: 'room:sync',
  ERROR: 'room:error',
} as const

export type JoinPayload = { roomId: string; playerId: string; name?: string }
export type RenamePayload = { name: string }
export type ActionPayload = { action: unknown }

export type SyncPayload = { room: RoomPublic; gameView: unknown | null }
export type ErrorPayload = { code: string; message: string }
```

- [ ] **Step 2: 写运行时单例（无测试，纯装配）**

`src/server/runtime.ts`：

```ts
import { gameRegistry } from '../games/registry'
import { loadConfig, type AppConfig } from './auth/config'
import { createRoomStore, type RoomStore } from './rooms/store'
import type { ServiceDeps } from './rooms/service'

/**
 * Next route handlers and the custom server are separate module instances.
 * Hanging singletons off globalThis is what keeps them looking at the same rooms.
 */
type GlobalCache = {
  __gameBoxStore?: RoomStore
  __gameBoxConfig?: AppConfig
}

const cache = globalThis as unknown as GlobalCache

export function getRoomStore(): RoomStore {
  cache.__gameBoxStore ??= createRoomStore()
  return cache.__gameBoxStore
}

export function getConfig(): AppConfig {
  cache.__gameBoxConfig ??= loadConfig(process.env)
  return cache.__gameBoxConfig
}

export function getServiceDeps(): ServiceDeps {
  return { store: getRoomStore(), games: gameRegistry, now: () => Date.now() }
}
```

- [ ] **Step 3: 写集成测试（先失败）**

`tests/socket-flow.test.ts`：

```ts
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { io as connect, type Socket } from 'socket.io-client'
import { gameRegistry } from '../src/games/registry'
import type { TicTacToeView } from '../src/games/tic-tac-toe/logic'
import { createGameServer } from '../src/server/app'
import { createRoom, type ServiceDeps } from '../src/server/rooms/service'
import { createRoomStore } from '../src/server/rooms/store'
import { ClientEvents, ServerEvents, type ErrorPayload, type SyncPayload } from '../src/shared/events'

let server: Awaited<ReturnType<typeof createGameServer>>
let deps: ServiceDeps
let url: string
const clients: Socket[] = []

beforeEach(async () => {
  deps = { store: createRoomStore(), games: gameRegistry, now: () => Date.now() }
  server = await createGameServer({ withNext: false, deps })
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve))
  const address = server.httpServer.address() as AddressInfo
  url = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  for (const client of clients.splice(0)) client.close()
  await server.close()
})

function client(): Socket {
  const socket = connect(url, { transports: ['websocket'], forceNew: true })
  clients.push(socket)
  return socket
}

function nextSync(socket: Socket): Promise<SyncPayload> {
  return new Promise((resolve) => socket.once(ServerEvents.SYNC, resolve))
}

function nextError(socket: Socket): Promise<ErrorPayload> {
  return new Promise((resolve) => socket.once(ServerEvents.ERROR, resolve))
}

function makeRoom(): string {
  const result = createRoom(deps, 'tic-tac-toe')
  if (!result.ok) throw new Error(result.message)
  return result.value.id
}

describe('socket flow', () => {
  it('syncs the room back to a joining player', async () => {
    const roomId = makeRoom()
    const socket = client()
    const sync = nextSync(socket)
    socket.emit(ClientEvents.JOIN, { roomId, playerId: 'p1', name: '小明' })
    const payload = await sync
    expect(payload.room.id).toBe(roomId)
    expect(payload.room.players).toHaveLength(1)
    expect(payload.room.players[0]!.name).toBe('小明')
    expect(payload.room.hostId).toBe('p1')
    expect(payload.gameView).toBeNull()
  })

  it('broadcasts the new roster to everyone in the room', async () => {
    const roomId = makeRoom()
    const host = client()
    const hostSync = nextSync(host)
    host.emit(ClientEvents.JOIN, { roomId, playerId: 'p1', name: '小明' })
    await hostSync

    const hostSeesGuest = nextSync(host)
    const guest = client()
    guest.emit(ClientEvents.JOIN, { roomId, playerId: 'p2', name: '小红' })
    const payload = await hostSeesGuest
    expect(payload.room.players.map((player) => player.name)).toEqual(['小明', '小红'])
  })

  it('reports a missing room as an error rather than a sync', async () => {
    const socket = client()
    const error = nextError(socket)
    socket.emit(ClientEvents.JOIN, { roomId: 'NOPE12', playerId: 'p1' })
    expect(await error).toEqual({ code: 'ROOM_NOT_FOUND', message: '房间不存在或已过期' })
  })

  it('renames a player and broadcasts it', async () => {
    const roomId = makeRoom()
    const socket = client()
    const joined = nextSync(socket)
    socket.emit(ClientEvents.JOIN, { roomId, playerId: 'p1' })
    await joined

    const renamed = nextSync(socket)
    socket.emit(ClientEvents.RENAME, { name: '新名字' })
    expect((await renamed).room.players[0]!.name).toBe('新名字')
  })

  it('lets the host start the game and gives each player their own view', async () => {
    const roomId = makeRoom()
    const host = client()
    const guest = client()
    const hostJoined = nextSync(host)
    host.emit(ClientEvents.JOIN, { roomId, playerId: 'p1' })
    await hostJoined
    const guestJoined = nextSync(guest)
    guest.emit(ClientEvents.JOIN, { roomId, playerId: 'p2' })
    await guestJoined

    const hostStarted = nextSync(host)
    const guestStarted = nextSync(guest)
    host.emit(ClientEvents.START)
    const [hostPayload, guestPayload] = await Promise.all([hostStarted, guestStarted])

    expect(hostPayload.room.status).toBe('playing')
    const hostView = hostPayload.gameView as TicTacToeView
    const guestView = guestPayload.gameView as TicTacToeView
    expect(new Set([hostView.myMark, guestView.myMark])).toEqual(new Set(['X', 'O']))
  })

  it('rejects a start from a non-host', async () => {
    const roomId = makeRoom()
    const host = client()
    const guest = client()
    const hostJoined = nextSync(host)
    host.emit(ClientEvents.JOIN, { roomId, playerId: 'p1' })
    await hostJoined
    const guestJoined = nextSync(guest)
    guest.emit(ClientEvents.JOIN, { roomId, playerId: 'p2' })
    await guestJoined

    const error = nextError(guest)
    guest.emit(ClientEvents.START)
    expect(await error).toEqual({ code: 'NOT_HOST', message: '只有房主可以开始游戏' })
  })

  it('sends an illegal move back only to the player who made it', async () => {
    const roomId = makeRoom()
    const host = client()
    const guest = client()
    const hostJoined = nextSync(host)
    host.emit(ClientEvents.JOIN, { roomId, playerId: 'p1' })
    await hostJoined
    const guestJoined = nextSync(guest)
    guest.emit(ClientEvents.JOIN, { roomId, playerId: 'p2' })
    await guestJoined
    const started = nextSync(host)
    host.emit(ClientEvents.START)
    const startPayload = await started

    const hostView = startPayload.gameView as TicTacToeView
    const waiting = hostView.myMark === 'X' ? guest : host
    const error = nextError(waiting)
    waiting.emit(ClientEvents.ACTION, { action: { type: 'place', cell: 0 } })
    expect(await error).toEqual({ code: 'INVALID_ACTION', message: '还没轮到你' })
  })

  it('marks a player offline when their socket drops', async () => {
    const roomId = makeRoom()
    const host = client()
    const guest = client()
    const hostJoined = nextSync(host)
    host.emit(ClientEvents.JOIN, { roomId, playerId: 'p1' })
    await hostJoined
    const guestJoined = nextSync(guest)
    guest.emit(ClientEvents.JOIN, { roomId, playerId: 'p2' })
    await guestJoined

    const hostNotified = nextSync(host)
    guest.close()
    const payload = await hostNotified
    expect(payload.room.players.find((player) => player.id === 'p2')!.connected).toBe(false)
  })
})
```

- [ ] **Step 4: 运行确认失败**

Run: `npx vitest run tests/socket-flow.test.ts`
Expected: FAIL，无法解析 `../src/server/app`。

- [ ] **Step 5: 实现 socket 处理器**

`src/server/socket/handlers.ts`：

```ts
import type { Server, Socket } from 'socket.io'
import {
  ClientEvents,
  ServerEvents,
  type ActionPayload,
  type JoinPayload,
  type RenamePayload,
} from '../../shared/events'
import {
  applyGameAction,
  joinRoom,
  markDisconnected,
  renamePlayer,
  startGame,
  toPublicRoom,
  viewFor,
  type ServiceDeps,
  type ServiceResult,
} from '../rooms/service'
import type { Room } from '../rooms/store'

type SocketIdentity = { roomId: string; playerId: string }

const identities = new WeakMap<Socket, SocketIdentity>()

export function registerSocketHandlers(io: Server, deps: ServiceDeps): void {
  io.on('connection', (socket) => {
    socket.on(ClientEvents.JOIN, (payload: JoinPayload) => {
      if (typeof payload?.roomId !== 'string' || typeof payload?.playerId !== 'string') {
        emitError(socket, 'BAD_PAYLOAD', '请求格式不正确')
        return
      }
      const result = joinRoom(deps, payload)
      if (!handled(socket, result)) return
      identities.set(socket, { roomId: payload.roomId, playerId: payload.playerId })
      void socket.join(payload.roomId)
      broadcast(io, deps, result.value)
    })

    socket.on(ClientEvents.RENAME, (payload: RenamePayload) => {
      const identity = identities.get(socket)
      if (identity === undefined) return emitError(socket, 'NOT_IN_ROOM', '你还没有加入房间')
      const result = renamePlayer(deps, { ...identity, name: String(payload?.name ?? '') })
      if (!handled(socket, result)) return
      broadcast(io, deps, result.value)
    })

    socket.on(ClientEvents.START, () => {
      const identity = identities.get(socket)
      if (identity === undefined) return emitError(socket, 'NOT_IN_ROOM', '你还没有加入房间')
      const result = startGame(deps, identity)
      if (!handled(socket, result)) return
      broadcast(io, deps, result.value)
    })

    socket.on(ClientEvents.ACTION, (payload: ActionPayload) => {
      const identity = identities.get(socket)
      if (identity === undefined) return emitError(socket, 'NOT_IN_ROOM', '你还没有加入房间')
      const result = applyGameAction(deps, { ...identity, action: payload?.action })
      if (!handled(socket, result)) return
      broadcast(io, deps, result.value)
    })

    socket.on('disconnect', () => {
      const identity = identities.get(socket)
      if (identity === undefined) return
      identities.delete(socket)
      const result = markDisconnected(deps, identity)
      if (!result.ok) return
      broadcast(io, deps, result.value)
    })
  })
}

/** Emits the per-player view to every socket currently in the room. */
function broadcast(io: Server, deps: ServiceDeps, room: Room): void {
  const publicRoom = toPublicRoom(deps, room)
  for (const socket of io.sockets.sockets.values()) {
    const identity = identities.get(socket)
    if (identity === undefined || identity.roomId !== room.id) continue
    socket.emit(ServerEvents.SYNC, {
      room: publicRoom,
      gameView: viewFor(deps, room, identity.playerId),
    })
  }
}

function handled<T>(socket: Socket, result: ServiceResult<T>): result is { ok: true; value: T } {
  if (result.ok) return true
  emitError(socket, result.code, result.message)
  return false
}

function emitError(socket: Socket, code: string, message: string): void {
  socket.emit(ServerEvents.ERROR, { code, message })
}
```

- [ ] **Step 6: 实现服务器工厂与入口**

`src/server/app.ts`：

```ts
import { createServer, type Server as HttpServer } from 'node:http'
import { Server as SocketServer } from 'socket.io'
import { startCleanupTimer } from './rooms/cleanup'
import type { ServiceDeps } from './rooms/service'
import { getServiceDeps } from './runtime'
import { registerSocketHandlers } from './socket/handlers'

export type GameServerOptions = {
  /** Tests run without Next so they can boot in milliseconds. */
  withNext: boolean
  dev?: boolean
  deps?: ServiceDeps
}

export type GameServer = {
  httpServer: HttpServer
  io: SocketServer
  close(): Promise<void>
}

export async function createGameServer(options: GameServerOptions): Promise<GameServer> {
  const deps = options.deps ?? getServiceDeps()
  let handleNextRequest: ((req: never, res: never) => void) | null = null
  let closeNext: (() => Promise<void>) | null = null

  if (options.withNext) {
    const next = (await import('next')).default
    const app = next({ dev: options.dev ?? false })
    await app.prepare()
    const handler = app.getRequestHandler()
    handleNextRequest = handler as unknown as (req: never, res: never) => void
    closeNext = () => app.close()
  }

  const httpServer = createServer((req, res) => {
    if (handleNextRequest !== null) {
      handleNextRequest(req as never, res as never)
      return
    }
    res.statusCode = 404
    res.end('not found')
  })

  const io = new SocketServer(httpServer, { path: '/socket.io' })
  registerSocketHandlers(io, deps)
  const stopCleanup = startCleanupTimer(deps.store, deps.now)

  return {
    httpServer,
    io,
    async close() {
      stopCleanup()
      await io.close()
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
      if (closeNext !== null) await closeNext()
    },
  }
}
```

`src/server/index.ts`：

```ts
import { createGameServer } from './app'
import { getConfig } from './runtime'

async function main(): Promise<void> {
  const config = getConfig()
  const dev = process.env.NODE_ENV !== 'production'
  const server = await createGameServer({ withNext: true, dev })

  server.httpServer.listen(config.port, () => {
    console.log(`game-box listening on http://0.0.0.0:${config.port} (dev=${dev})`)
  })

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void server.close().then(() => process.exit(0))
    })
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
```

- [ ] **Step 7: 运行集成测试确认通过**

Run: `npx vitest run tests/socket-flow.test.ts`
Expected: PASS，8 个用例全绿。若 socket 连接超时，检查 `createGameServer` 是否在 `listen` 之前就把 Socket.IO 挂上了 httpServer。

- [ ] **Step 8: 全量测试与类型检查后提交**

Run: `npm test && npm run typecheck`

```bash
git add -A
git commit -m "feat: add socket transport layer and game server factory"
```

---

## Task 9: Next 基础骨架、健康检查与登录

**Files:**
- Create: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/api/health/route.ts`, `src/app/api/login/route.ts`, `src/app/login/page.tsx`, `src/components/LoginForm.tsx`, `src/server/auth/guards.ts`, `next-env.d.ts`
- Test: 无自动化测试（本任务的验收靠手动 curl，UI 行为在 Task 16 统一验收）

**Interfaces:**
- Consumes: `getConfig`（Task 8）、`SESSION_COOKIE` / `createSessionValue` / `isSessionValid` / `passwordMatches` / `grantCookieName` / `isGrantValid` / `SESSION_MAX_AGE_MS` / `GRANT_MAX_AGE_MS`（Task 7）
- Produces:
  - `hasSession(): Promise<boolean>`、`requireSession(): Promise<void>`（未登录时 `redirect('/login')`）
  - `hasRoomAccess(roomId): Promise<boolean>`、`requireRoomAccess(roomId): Promise<void>`
  - `POST /api/login`、`GET /api/health`

- [ ] **Step 1: 写守卫**

`src/server/auth/guards.ts`：

```ts
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getConfig } from '../runtime'
import { grantCookieName, isGrantValid, isSessionValid, SESSION_COOKIE } from './tokens'

export async function hasSession(): Promise<boolean> {
  const jar = await cookies()
  return isSessionValid(jar.get(SESSION_COOKIE)?.value, getConfig().sessionSecret, Date.now())
}

export async function requireSession(): Promise<void> {
  if (!(await hasSession())) redirect('/login')
}

/** Room access comes from either the site session or an invite grant for that room. */
export async function hasRoomAccess(roomId: string): Promise<boolean> {
  if (await hasSession()) return true
  const jar = await cookies()
  return isGrantValid(
    jar.get(grantCookieName(roomId))?.value,
    roomId,
    getConfig().sessionSecret,
    Date.now(),
  )
}

export async function requireRoomAccess(roomId: string): Promise<void> {
  if (!(await hasRoomAccess(roomId))) redirect('/login')
}
```

- [ ] **Step 2: 写全局布局与样式**

`next-env.d.ts`：

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

`src/app/globals.css`：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-slate-950 text-slate-100 antialiased;
}
```

`src/app/layout.tsx`：

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Game Box',
  description: '和朋友一起玩的线上桌游房间',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">
        <div className="mx-auto max-w-3xl px-4 py-8">{children}</div>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: 写健康检查路由**

`src/app/api/health/route.ts`：

```ts
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ status: 'ok', uptime: Math.round(process.uptime()) })
}
```

- [ ] **Step 4: 写登录接口**

`src/app/api/login/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { getConfig } from '@/server/runtime'
import { createSessionValue, passwordMatches, SESSION_COOKIE, SESSION_MAX_AGE_MS } from '@/server/auth/tokens'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null
  const password = typeof body?.password === 'string' ? body.password : ''
  const config = getConfig()

  if (!passwordMatches(password, config.password)) {
    return NextResponse.json({ ok: false, message: '密码不对' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set({
    name: SESSION_COOKIE,
    value: createSessionValue(Date.now(), config.sessionSecret),
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
  })
  return response
}
```

- [ ] **Step 5: 写登录页面**

`src/components/LoginForm.tsx`：

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

export function LoginForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    setPending(false)
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null
      setError(body?.message ?? '登录失败')
      return
    }
    router.replace('/')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="请输入访问密码"
        autoFocus
        className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-slate-400"
      />
      {error !== null && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={pending || password === ''}
        className="w-full rounded bg-emerald-600 px-3 py-2 font-medium disabled:opacity-40"
      >
        {pending ? '验证中…' : '进入'}
      </button>
    </form>
  )
}
```

`src/app/login/page.tsx`：

```tsx
import { LoginForm } from '@/components/LoginForm'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-sm space-y-6 pt-20">
      <h1 className="text-2xl font-semibold">Game Box</h1>
      <p className="text-sm text-slate-400">输入密码后即可创建房间、邀请朋友一起玩。</p>
      <LoginForm />
    </main>
  )
}
```

- [ ] **Step 6: 手动验证**

```bash
APP_PASSWORD=test-pw SESSION_SECRET=test-secret-key npm run dev
```

在另一个终端：

```bash
curl -s localhost:3000/api/health
# 期望：{"status":"ok","uptime":<数字>}

curl -s -X POST localhost:3000/api/login -H 'content-type: application/json' -d '{"password":"wrong"}' -i | head -1
# 期望：HTTP/1.1 401 Unauthorized

curl -s -X POST localhost:3000/api/login -H 'content-type: application/json' -d '{"password":"test-pw"}' -i | grep -i set-cookie
# 期望：set-cookie: gb_session=session:...; Path=/; HttpOnly; SameSite=Lax
```

再验证缺失环境变量时拒绝启动：

```bash
npm run dev
# 期望：打印“缺少环境变量 APP_PASSWORD，服务无法启动”并以非 0 退出
```

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: add next shell, health check and password login"
```

---

## Task 10: 大厅与创建房间

**Files:**
- Create: `src/app/page.tsx`, `src/components/GameList.tsx`, `src/app/api/rooms/route.ts`

**Interfaces:**
- Consumes: `requireSession` / `hasSession`（Task 9）、`gameRegistry`（Task 2）、`createRoom` / `getServiceDeps`（Task 4、8）
- Produces: `POST /api/rooms`，请求体 `{ gameId: string }`，成功返回 `{ ok: true, roomId: string }`

- [ ] **Step 1: 写建房接口**

`src/app/api/rooms/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { hasSession } from '@/server/auth/guards'
import { createRoom } from '@/server/rooms/service'
import { getServiceDeps } from '@/server/runtime'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!(await hasSession())) {
    return NextResponse.json({ ok: false, message: '请先登录' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { gameId?: unknown } | null
  const gameId = typeof body?.gameId === 'string' ? body.gameId : ''
  const result = createRoom(getServiceDeps(), gameId)

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true, roomId: result.value.id })
}
```

- [ ] **Step 2: 写大厅页**

`src/components/GameList.tsx`：

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { GameMeta } from '@/games/types'

export function GameList({ games }: { games: GameMeta[] }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function createRoom(gameId: string) {
    setPendingId(gameId)
    setError(null)
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId }),
    })
    const body = (await response.json().catch(() => null)) as
      | { ok: true; roomId: string }
      | { ok: false; message: string }
      | null
    setPendingId(null)
    if (body === null || !body.ok) {
      setError(body?.message ?? '创建房间失败')
      return
    }
    router.push(`/room/${body.roomId}`)
  }

  if (games.length === 0) {
    return <p className="text-slate-400">还没有可玩的游戏。</p>
  }

  return (
    <div className="space-y-3">
      {error !== null && <p className="text-sm text-red-400">{error}</p>}
      {games.map((game) => (
        <div
          key={game.id}
          className="flex items-center justify-between rounded border border-slate-800 bg-slate-900 p-4"
        >
          <div>
            <h2 className="font-medium">{game.name}</h2>
            <p className="text-sm text-slate-400">{game.description}</p>
            <p className="mt-1 text-xs text-slate-500">
              {game.minPlayers === game.maxPlayers
                ? `${game.minPlayers} 人`
                : `${game.minPlayers}-${game.maxPlayers} 人`}
            </p>
          </div>
          <button
            onClick={() => void createRoom(game.id)}
            disabled={pendingId !== null}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            {pendingId === game.id ? '创建中…' : '创建房间'}
          </button>
        </div>
      ))}
    </div>
  )
}
```

`src/app/page.tsx`：

```tsx
import { GameList } from '@/components/GameList'
import { gameRegistry } from '@/games/registry'
import { requireSession } from '@/server/auth/guards'

export const dynamic = 'force-dynamic'

export default async function LobbyPage() {
  await requireSession()

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">选一个游戏</h1>
        <p className="text-sm text-slate-400">创建房间后把邀请链接发给朋友即可开局。</p>
      </header>
      <GameList games={gameRegistry.list()} />
    </main>
  )
}
```

- [ ] **Step 3: 手动验证**

```bash
APP_PASSWORD=test-pw SESSION_SECRET=test-secret-key npm run dev
```

```bash
# 未登录时被拒
curl -s -X POST localhost:3000/api/rooms -H 'content-type: application/json' -d '{"gameId":"tic-tac-toe"}' -i | head -1
# 期望：HTTP/1.1 401 Unauthorized

# 登录后建房
curl -s -c /tmp/gb-cookies -X POST localhost:3000/api/login -H 'content-type: application/json' -d '{"password":"test-pw"}' > /dev/null
curl -s -b /tmp/gb-cookies -X POST localhost:3000/api/rooms -H 'content-type: application/json' -d '{"gameId":"tic-tac-toe"}'
# 期望：{"ok":true,"roomId":"XXXXXX"}

# 未知游戏
curl -s -b /tmp/gb-cookies -X POST localhost:3000/api/rooms -H 'content-type: application/json' -d '{"gameId":"nope"}'
# 期望：{"ok":false,"message":"没有这个游戏"}

# 未登录访问大厅会跳转登录页
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' localhost:3000/
# 期望：307 http://localhost:3000/login
```

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat: add lobby with game list and room creation"
```

---

## Task 11: 邀请链接与失效提示页

**Files:**
- Create: `src/app/r/[token]/route.ts`, `src/app/invalid-invite/page.tsx`

**Interfaces:**
- Consumes: `getRoomStore` / `getConfig`（Task 8）、`createGrantValue` / `grantCookieName` / `GRANT_MAX_AGE_MS`（Task 7）
- Produces: `GET /r/<inviteToken>` → 302 到 `/room/<roomId>` 并下发房间 grant cookie；token 无效时 302 到 `/invalid-invite`

- [ ] **Step 1: 写邀请路由**

`src/app/r/[token]/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { createGrantValue, grantCookieName, GRANT_MAX_AGE_MS } from '@/server/auth/tokens'
import { getConfig, getRoomStore } from '@/server/runtime'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const room = getRoomStore().getByInviteToken(token)

  if (room === undefined) {
    return NextResponse.redirect(new URL('/invalid-invite', request.url))
  }

  const response = NextResponse.redirect(new URL(`/room/${room.id}`, request.url))
  response.cookies.set({
    name: grantCookieName(room.id),
    value: createGrantValue(room.id, Date.now(), getConfig().sessionSecret),
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(GRANT_MAX_AGE_MS / 1000),
  })
  return response
}
```

- [ ] **Step 2: 写失效提示页**

`src/app/invalid-invite/page.tsx`：

```tsx
export const dynamic = 'force-dynamic'

export default function InvalidInvitePage() {
  return (
    <main className="mx-auto max-w-md space-y-4 pt-20 text-center">
      <h1 className="text-2xl font-semibold">这个邀请链接用不了了</h1>
      <p className="text-slate-400">
        房间可能已经解散或链接已过期。找房主重新发一个链接就行。
      </p>
    </main>
  )
}
```

- [ ] **Step 3: 手动验证**

```bash
APP_PASSWORD=test-pw SESSION_SECRET=test-secret-key npm run dev
```

```bash
curl -s -c /tmp/gb-cookies -X POST localhost:3000/api/login -H 'content-type: application/json' -d '{"password":"test-pw"}' > /dev/null
ROOM=$(curl -s -b /tmp/gb-cookies -X POST localhost:3000/api/rooms -H 'content-type: application/json' -d '{"gameId":"tic-tac-toe"}' | sed 's/.*"roomId":"\([^"]*\)".*/\1/')
echo "room=$ROOM"

# 无效 token 走提示页（注意这里不带任何 cookie，模拟陌生人）
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' localhost:3000/r/not-a-real-token
# 期望：307 http://localhost:3000/invalid-invite
```

有效 token 需要从服务端日志或房间页读取，完整链路在 Task 16 用浏览器验收。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat: add invite link route and invalid invite page"
```

---

## Task 12: 房间页、Socket 客户端与井字棋棋盘

**Files:**
- Create: `src/lib/playerId.ts`, `src/hooks/useRoomSocket.ts`, `src/components/RoomClient.tsx`, `src/components/InviteButton.tsx`, `src/games/tic-tac-toe/Board.tsx`, `src/games/ui-registry.ts`, `src/app/room/[roomId]/page.tsx`

**Interfaces:**
- Consumes: `ClientEvents` / `ServerEvents` / `SyncPayload` / `ErrorPayload`（Task 8）、`RoomPublic`（Task 3）、`TicTacToeView`（Task 2）、`requireRoomAccess`（Task 9）、`getRoomStore`（Task 8）
- Produces:
  - `getOrCreatePlayerId(): string`（sessionStorage key `gb_pid`）
  - `useRoomSocket(roomId)` → `{ playerId, room, gameView, error, connected, rename, start, act }`
  - `boardRegistry: Record<string, ComponentType<BoardProps>>`

- [ ] **Step 1: 写 playerId 工具**

`src/lib/playerId.ts`：

```ts
const KEY = 'gb_pid'

/**
 * sessionStorage is per-tab on purpose: refreshing keeps your seat, while a
 * second tab is a second player (which makes local multiplayer testing easy).
 */
export function getOrCreatePlayerId(): string {
  const existing = window.sessionStorage.getItem(KEY)
  if (existing !== null && existing !== '') return existing
  const created = crypto.randomUUID()
  window.sessionStorage.setItem(KEY, created)
  return created
}
```

- [ ] **Step 2: 写 socket hook**

`src/hooks/useRoomSocket.ts`：

```ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { getOrCreatePlayerId } from '@/lib/playerId'
import {
  ClientEvents,
  ServerEvents,
  type ErrorPayload,
  type SyncPayload,
} from '@/shared/events'
import type { RoomPublic } from '@/shared/types'

export type RoomSocket = {
  playerId: string
  room: RoomPublic | null
  gameView: unknown | null
  error: ErrorPayload | null
  connected: boolean
  rename: (name: string) => void
  start: () => void
  act: (action: unknown) => void
}

export function useRoomSocket(roomId: string): RoomSocket {
  const socketRef = useRef<Socket | null>(null)
  const [playerId, setPlayerId] = useState('')
  const [room, setRoom] = useState<RoomPublic | null>(null)
  const [gameView, setGameView] = useState<unknown | null>(null)
  const [error, setError] = useState<ErrorPayload | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const id = getOrCreatePlayerId()
    setPlayerId(id)

    const socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] })
    socketRef.current = socket

    // Re-join on every connect so a reconnect restores the seat automatically.
    socket.on('connect', () => {
      setConnected(true)
      socket.emit(ClientEvents.JOIN, { roomId, playerId: id })
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on(ServerEvents.SYNC, (payload: SyncPayload) => {
      setRoom(payload.room)
      setGameView(payload.gameView)
      setError(null)
    })
    socket.on(ServerEvents.ERROR, (payload: ErrorPayload) => setError(payload))

    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [roomId])

  const rename = useCallback((name: string) => {
    socketRef.current?.emit(ClientEvents.RENAME, { name })
  }, [])

  const start = useCallback(() => {
    socketRef.current?.emit(ClientEvents.START)
  }, [])

  const act = useCallback((action: unknown) => {
    socketRef.current?.emit(ClientEvents.ACTION, { action })
  }, [])

  return { playerId, room, gameView, error, connected, rename, start, act }
}
```

- [ ] **Step 3: 写井字棋棋盘与 UI 注册表**

`src/games/tic-tac-toe/Board.tsx`：

```tsx
'use client'

import type { BoardProps } from '../types'
import type { TicTacToeAction, TicTacToeView } from './logic'

export default function TicTacToeBoard({
  view,
  onAction,
}: BoardProps<TicTacToeView, TicTacToeAction>) {
  const myTurn = view.currentMark !== null && view.currentMark === view.myMark
  const over = view.winner !== null || view.draw

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        你执 <span className="font-semibold text-slate-100">{view.myMark ?? '观战'}</span>
        {!over && (myTurn ? ' · 轮到你了' : ' · 等待对手落子')}
      </p>
      <div className="grid w-64 grid-cols-3 gap-1">
        {view.cells.map((cell, index) => (
          <button
            key={index}
            disabled={over || !myTurn || cell !== null}
            onClick={() => onAction({ type: 'place', cell: index })}
            className="flex h-20 w-20 items-center justify-center rounded bg-slate-800 text-3xl font-bold disabled:opacity-60"
          >
            {cell ?? ''}
          </button>
        ))}
      </div>
    </div>
  )
}
```

`src/games/ui-registry.ts`：

```ts
import type { ComponentType } from 'react'
import type { BoardProps } from './types'
import TicTacToeBoard from './tic-tac-toe/Board'

/** Client-side counterpart of registry.ts. Add one line per new game. */
export const boardRegistry: Record<string, ComponentType<BoardProps<never, never>>> = {
  'tic-tac-toe': TicTacToeBoard as ComponentType<BoardProps<never, never>>,
}
```

- [ ] **Step 4: 写邀请按钮**

`src/components/InviteButton.tsx`：

```tsx
'use client'

import { useState } from 'react'

export function InviteButton({ inviteToken }: { inviteToken: string }) {
  const [copied, setCopied] = useState(false)
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}/r/${inviteToken}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => void copy()}
        className="rounded bg-slate-700 px-3 py-2 text-sm font-medium"
      >
        {copied ? '已复制' : '邀请好友'}
      </button>
      <p className="break-all text-xs text-slate-500">{link}</p>
    </div>
  )
}
```

复制失败（非 HTTPS 环境下 `navigator.clipboard` 不可用）时链接仍然完整显示在下方，用户可以手动复制。

- [ ] **Step 5: 写房间主组件**

`src/components/RoomClient.tsx`：

```tsx
'use client'

import { useState } from 'react'
import { InviteButton } from '@/components/InviteButton'
import { boardRegistry } from '@/games/ui-registry'
import { useRoomSocket } from '@/hooks/useRoomSocket'

export function RoomClient({ roomId }: { roomId: string }) {
  const { playerId, room, gameView, error, connected, rename, start, act } = useRoomSocket(roomId)
  const [draftName, setDraftName] = useState('')

  if (room === null) {
    return (
      <p className="text-slate-400">
        {error !== null ? error.message : connected ? '正在加入房间…' : '正在连接…'}
      </p>
    )
  }

  const me = room.players.find((player) => player.id === playerId)
  const isHost = room.hostId === playerId
  const Board = boardRegistry[room.gameId]
  const enoughPlayers = room.players.length >= room.minPlayers

  return (
    <main className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{room.gameName}</h1>
        <p className="text-sm text-slate-400">
          房间号 <span className="font-mono text-slate-200">{room.id}</span>
          {!connected && <span className="ml-2 text-amber-400">连接已断开，正在重连…</span>}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-slate-400">玩家（{room.players.length}/{room.maxPlayers}）</h2>
        <ul className="space-y-1">
          {room.players.map((player) => (
            <li key={player.id} className="flex items-center gap-2 text-sm">
              <span>{player.name}</span>
              {player.id === room.hostId && <span className="text-xs text-emerald-400">房主</span>}
              {player.id === playerId && <span className="text-xs text-slate-500">（你）</span>}
              {!player.connected && <span className="text-xs text-amber-400">掉线中</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="block text-xs text-slate-500">修改昵称</label>
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            placeholder={me?.name ?? ''}
            maxLength={12}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:border-slate-400"
          />
        </div>
        <button
          onClick={() => {
            rename(draftName)
            setDraftName('')
          }}
          disabled={draftName.trim() === ''}
          className="rounded bg-slate-700 px-3 py-2 text-sm disabled:opacity-40"
        >
          保存
        </button>
        <InviteButton inviteToken={room.inviteToken} />
      </section>

      {error !== null && <p className="text-sm text-red-400">{error.message}</p>}

      {room.status === 'waiting' && (
        <section className="space-y-2">
          {isHost ? (
            <button
              onClick={start}
              disabled={!enoughPlayers}
              className="rounded bg-emerald-600 px-4 py-2 font-medium disabled:opacity-40"
            >
              开始游戏
            </button>
          ) : (
            <p className="text-sm text-slate-400">等房主开始游戏…</p>
          )}
          {!enoughPlayers && (
            <p className="text-xs text-slate-500">还差 {room.minPlayers - room.players.length} 人才能开始</p>
          )}
        </section>
      )}

      {room.status !== 'waiting' && Board !== undefined && gameView !== null && (
        <section className="space-y-4">
          <Board view={gameView as never} me={playerId as never} onAction={act as never} />
          {room.status === 'finished' && (
            <p className="text-lg font-medium">
              {room.winners.length === 0
                ? '平局！'
                : `${room.players.find((player) => player.id === room.winners[0])?.name ?? '有人'} 获胜！`}
            </p>
          )}
        </section>
      )}
    </main>
  )
}
```

- [ ] **Step 6: 写房间页**

`src/app/room/[roomId]/page.tsx`：

```tsx
import { RoomClient } from '@/components/RoomClient'
import { requireRoomAccess } from '@/server/auth/guards'
import { getRoomStore } from '@/server/runtime'

export const dynamic = 'force-dynamic'

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params
  await requireRoomAccess(roomId)

  if (getRoomStore().get(roomId) === undefined) {
    return (
      <main className="mx-auto max-w-md space-y-4 pt-20 text-center">
        <h1 className="text-2xl font-semibold">房间不存在或已过期</h1>
        <p className="text-slate-400">房间可能已经解散，找房主重新建一个吧。</p>
      </main>
    )
  }

  return <RoomClient roomId={roomId} />
}
```

- [ ] **Step 7: 类型检查与构建验证**

Run: `npm run typecheck && npm test`
Expected: 全绿。

Run: `APP_PASSWORD=test-pw SESSION_SECRET=test-secret-key npm run build`
Expected: `next build` 成功且 `dist/server.js` 生成。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat: add room page, socket client hook and tic-tac-toe board"
```

---

## Task 13: 完整对局与重连集成测试

**Files:**
- Create: `tests/full-game.test.ts`

**Interfaces:**
- Consumes: Task 8 的 `createGameServer`、Task 4/5 的服务函数、Task 2 的 `TicTacToeView`
- Produces: 无新导出；这是骨架的验收测试

- [ ] **Step 1: 写测试**

`tests/full-game.test.ts`：

```ts
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { io as connect, type Socket } from 'socket.io-client'
import { gameRegistry } from '../src/games/registry'
import type { TicTacToeView } from '../src/games/tic-tac-toe/logic'
import { createGameServer } from '../src/server/app'
import { createRoom, type ServiceDeps } from '../src/server/rooms/service'
import { createRoomStore } from '../src/server/rooms/store'
import { ClientEvents, ServerEvents, type SyncPayload } from '../src/shared/events'

let server: Awaited<ReturnType<typeof createGameServer>>
let deps: ServiceDeps
let url: string
const clients: Socket[] = []

beforeEach(async () => {
  deps = { store: createRoomStore(), games: gameRegistry, now: () => Date.now() }
  server = await createGameServer({ withNext: false, deps })
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve))
  url = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`
})

afterEach(async () => {
  for (const client of clients.splice(0)) client.close()
  await server.close()
})

function client(): Socket {
  const socket = connect(url, { transports: ['websocket'], forceNew: true })
  clients.push(socket)
  return socket
}

function nextSync(socket: Socket): Promise<SyncPayload> {
  return new Promise((resolve) => socket.once(ServerEvents.SYNC, resolve))
}

async function join(socket: Socket, roomId: string, playerId: string, name: string): Promise<SyncPayload> {
  const sync = nextSync(socket)
  socket.emit(ClientEvents.JOIN, { roomId, playerId, name })
  return sync
}

describe('full game over the wire', () => {
  it('plays a room from creation to a winner, surviving a reconnect', async () => {
    const created = createRoom(deps, 'tic-tac-toe')
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const roomId = created.value.id

    // 1. Two players join through the same room id an invite link would resolve to.
    const host = client()
    let guest = client()
    await join(host, roomId, 'p1', '小明')
    const guestJoined = await join(guest, roomId, 'p2', '小红')
    expect(guestJoined.room.players.map((player) => player.name)).toEqual(['小明', '小红'])

    // 2. The guest renames themselves and everyone sees it.
    const hostSeesRename = nextSync(host)
    guest.emit(ClientEvents.RENAME, { name: '小花' })
    expect((await hostSeesRename).room.players[1]!.name).toBe('小花')

    // 3. The host starts the game.
    const hostStarted = nextSync(host)
    const guestStarted = nextSync(guest)
    host.emit(ClientEvents.START)
    const [hostStart, guestStart] = await Promise.all([hostStarted, guestStarted])
    expect(hostStart.room.status).toBe('playing')

    const hostIsX = (hostStart.gameView as TicTacToeView).myMark === 'X'
    expect((guestStart.gameView as TicTacToeView).myMark).toBe(hostIsX ? 'O' : 'X')

    // 4. X takes cells 0,1,2 while O answers on 3,4 — X wins on the top row.
    const xSocket = hostIsX ? host : guest
    const oSocket = hostIsX ? guest : host
    const xId = hostIsX ? 'p1' : 'p2'

    async function move(socket: Socket, cell: number): Promise<SyncPayload> {
      const sync = nextSync(socket)
      socket.emit(ClientEvents.ACTION, { action: { type: 'place', cell } })
      return sync
    }

    await move(xSocket, 0)
    await move(oSocket, 3)
    await move(xSocket, 1)
    await move(oSocket, 4)
    const final = await move(xSocket, 2)

    expect(final.room.status).toBe('finished')
    expect(final.room.winners).toEqual([xId])

    // 5. The guest drops and comes back with the same playerId — same seat, same name,
    //    and the finished board is replayed to them.
    const hostSeesDrop = nextSync(host)
    guest.close()
    expect((await hostSeesDrop).room.players.find((p) => p.id === 'p2')!.connected).toBe(false)

    guest = client()
    const rejoined = await join(guest, roomId, 'p2', 'ignored-on-reconnect')
    expect(rejoined.room.players.find((p) => p.id === 'p2')).toMatchObject({
      name: '小花',
      seat: 1,
      connected: true,
    })
    expect(rejoined.room.status).toBe('finished')
    const rejoinedView = rejoined.gameView as TicTacToeView
    expect(rejoinedView.cells.filter((cell) => cell !== null)).toHaveLength(5)
  })
})
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run tests/full-game.test.ts`
Expected: PASS。若在第 5 步失败，检查 `joinRoom` 的重连分支是否忽略了传入的 name（应当忽略，保留原名）。

- [ ] **Step 3: 全量测试后提交**

Run: `npm test && npm run typecheck`

```bash
git add -A
git commit -m "test: cover a full game and reconnect over sockets"
```

---

## Task 14: Docker 化与部署配置

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `.env.example`

**Interfaces:**
- Consumes: `npm run build`（Task 1 定义）、`/api/health`（Task 9）
- Produces: 可运行镜像，入口 `node dist/server.js`，监听 `PORT`（默认 3000）

- [ ] **Step 1: 写 .dockerignore**

```
node_modules
.next
dist
.git
.worktrees
docs
*.log
.env
.env.local
```

- [ ] **Step 2: 写 Dockerfile**

```dockerfile
# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

注：这里刻意不用 Next 的 standalone 产物——自定义 server 与 standalone 需要手工拼接产物目录，容易在升级时静默损坏。代价是镜像里保留了一份生产依赖。

- [ ] **Step 3: 写 compose**

`docker-compose.yml`：

```yaml
services:
  game-box:
    build: .
    image: game-box:latest
    container_name: game-box
    restart: unless-stopped
    ports:
      - '${HOST_PORT:-3000}:3000'
    environment:
      APP_PASSWORD: ${APP_PASSWORD:?APP_PASSWORD is required}
      SESSION_SECRET: ${SESSION_SECRET:?SESSION_SECRET is required}
      PORT: 3000
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
```

- [ ] **Step 4: 写 .env.example**

```
# 访问站点所需的密码，留空服务会拒绝启动
APP_PASSWORD=change-me

# 用于签名 session / 邀请凭证的密钥，至少 8 个字符
# 生成方式：openssl rand -hex 32
SESSION_SECRET=change-me-too

# 宿主机映射端口（容器内固定 3000）
HOST_PORT=3000
```

- [ ] **Step 5: 本地验证镜像**

```bash
cp .env.example .env
sed -i '' 's/^APP_PASSWORD=.*/APP_PASSWORD=test-pw/' .env
sed -i '' "s/^SESSION_SECRET=.*/SESSION_SECRET=$(openssl rand -hex 32)/" .env

docker compose build
docker compose up -d
sleep 15
curl -s localhost:3000/api/health
# 期望：{"status":"ok","uptime":<数字>}

docker compose ps
# 期望：STATUS 显示 healthy（等待约 20-50 秒）
```

再验证缺少密码时容器拒绝启动：

```bash
APP_PASSWORD= SESSION_SECRET=x docker compose up 2>&1 | head -5
# 期望：compose 直接报 APP_PASSWORD is required
docker compose down
```

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "chore: add docker image and compose deployment"
```

---

## Task 15: 项目文档（人类入口 + AI 入口）

**Files:**
- Create: `README.md`, `CLAUDE.md`, `docs/architecture.md`, `docs/adding-a-game.md`

**Interfaces:**
- Consumes: 前 14 个任务的成果
- Produces: 无代码导出

- [ ] **Step 1: 写 README.md（人类入口）**

内容必须覆盖：

1. 一句话项目定位：自托管的线上桌游房间，密码进站，链接邀友。
2. 本地开发：
   ```bash
   cp .env.example .env   # 填 APP_PASSWORD 和 SESSION_SECRET
   npm install
   APP_PASSWORD=dev-pw SESSION_SECRET=dev-secret-key npm run dev
   ```
   并说明同一浏览器开两个标签页即为两个玩家（playerId 存在 sessionStorage）。
3. 常用命令表：`npm run dev` / `npm test` / `npm run typecheck` / `npm run build` / `npm start`。
4. 部署：
   ```bash
   cp .env.example .env && vi .env
   docker compose up -d --build
   ```
5. 反向代理片段，明确标注 WebSocket 必须转发 upgrade 头：

   Nginx：
   ```nginx
   location / {
       proxy_pass http://127.0.0.1:3000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_read_timeout 3600s;
   }
   ```

   Caddy：
   ```
   game.example.com {
       reverse_proxy 127.0.0.1:3000
   }
   ```
   （Caddy 默认已正确处理 WebSocket upgrade。）
6. 已知边界：状态存内存，重启容器会丢失进行中的对局；关闭标签页会丢失玩家身份。

- [ ] **Step 2: 写 CLAUDE.md（AI 入口）**

内容必须覆盖：

1. **项目定位**一句话，以及"具体桌游按需增加，平台骨架已稳定"。
2. **命令**：`npm test`（改动后必须跑）、`npm run typecheck`、`npm run dev`、`npm run build`。
3. **三层边界（硬规则）**：
   - `src/games/**` 是纯函数层：禁止 import socket.io / next / node 内置模块，禁止 `Date.now()`、`new Date()`、`Math.random()`。随机数只能来自注入的 seed。此规则由 `src/games/boundaries.test.ts` 自动强制，改坏了测试会红。
   - `src/server/rooms/**` 不得 import socket.io；只接收参数、返回结果。
   - `src/server/socket/**` 不写业务逻辑，只做事件到服务调用的翻译与广播。
4. **导入路径规则**：`src/server/**`、`src/games/**`、`src/shared/**` 用相对导入；`src/app/**`、`src/components/**`、`src/hooks/**`、`src/lib/**` 用 `@/` 别名。原因写清楚（esbuild `--packages=external`）。
5. **globalThis 单例陷阱**：Next 路由与自定义 server 是两套模块实例，跨侧共享状态必须走 `src/server/runtime.ts`。
6. **新增游戏 checklist**（指向 `docs/adding-a-game.md`）。
7. **错误处理约定**：业务失败用返回值 `{ ok: false, code, message }`，message 是中文用户文案。
8. **文案语言**：UI 中文，代码与注释英文。

- [ ] **Step 3: 写 docs/architecture.md**

内容必须覆盖：三层职责与依赖方向图、一次动作的完整数据流（客户端点击 → `game:action` → handlers → service → GameLogic → 新状态 → 按玩家裁剪 → `room:sync`）、鉴权三种凭证的关系、房间生命周期与清理规则（引用 `CLEANUP_RULES` 的实际数值）、状态只在内存中的后果。

- [ ] **Step 4: 写 docs/adding-a-game.md**

必须是一份可照抄的分步指南，包含：

1. `mkdir src/games/<game-id>`
2. 先写 `logic.test.ts`（列出必须覆盖的场景：初始状态、合法动作、每一种非法动作的拒绝理由、结束判定、`getViewFor` 不泄露隐藏信息、状态不可变）
3. 写 `logic.ts`，实现 `GameLogic` 的五个成员，附上 `src/games/tic-tac-toe/logic.ts` 作为参考实现的指引
4. 写 `Board.tsx`
5. 在 `src/games/registry.ts` 与 `src/games/ui-registry.ts` 各加一行
6. 跑 `npm test && npm run typecheck`
7. 检查清单：随机是否全部来自 seed？隐藏信息是否只在 `getViewFor` 里裁剪？非法动作是否返回中文 reason 而非抛异常？状态是否可 JSON 序列化？

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "docs: add README, CLAUDE.md, architecture and adding-a-game guides"
```

---

## Task 16: 浏览器端手动验收

**Files:** 无（纯验证任务）

**Interfaces:**
- Consumes: 前 15 个任务的全部成果
- Produces: 一份验收结论；发现的缺陷回到对应任务修复

使用 chrome-devtools MCP 与专用调试 profile（端口 9222）。若连不上，先启动：

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.chrome-debug-profile" &
```

- [ ] **Step 1: 起服务**

```bash
APP_PASSWORD=test-pw SESSION_SECRET=test-secret-key npm run dev
```

- [ ] **Step 2: 密码门**

访问 `http://localhost:3000/`，确认跳转到 `/login`；输错密码看到"密码不对"；输对后进入大厅并看到"井字棋"卡片。

- [ ] **Step 3: 建房与邀请链接**

点"创建房间"，确认 URL 变为 `/room/XXXXXX`，页面显示房间号、玩家列表里有"玩家1（房主）"、以及邀请链接。复制该链接备用。

- [ ] **Step 4: 朋友视角（免密码）**

新开一个标签页，先清掉站点 session 以模拟陌生人：在 DevTools Console 执行
`document.cookie = 'gb_session=; Max-Age=0; path=/'`，然后访问刚才的邀请链接。确认：**不需要输密码**直接进入房间，玩家列表出现"玩家2"，两个标签页都实时看到彼此。

- [ ] **Step 5: 改名**

在第二个标签页把昵称改成"小红"，确认第一个标签页立即同步显示。再把第一个标签页也改成"小红"，确认变成"小红2"。

- [ ] **Step 6: 完整一局**

房主点"开始游戏"，两边各自出现棋盘且执子不同。交替落子直到分出胜负，确认：非当前回合方的格子不可点；结束后双方都看到"XX 获胜！"。

- [ ] **Step 7: 断线重连**

在第二个标签页按 F5 刷新。确认：座位、昵称、棋盘进度全部保留；第一个标签页在刷新瞬间看到"掉线中"，随后恢复。

- [ ] **Step 8: 权限边界**

在第二个标签页（只有 grant、没有 session）访问 `http://localhost:3000/`，确认被重定向到 `/login`——邀请链接用户进不了大厅。

- [ ] **Step 9: 失效链接**

访问 `http://localhost:3000/r/bogus-token-123`，确认看到中文提示页而非 404。

- [ ] **Step 10: 记录结论**

全部通过则骨架验收完成。任何一步失败，回到对应任务修复并补一条自动化测试覆盖该缺陷，再重跑本任务。

---

## 自查记录

- **Spec 覆盖**：spec 第 2 节技术选型 → Task 1；第 3 节分层 → Task 2/4/5/8 及 Task 2 的边界测试；第 4 节目录结构 → 全部任务；第 5 节数据模型 → Task 3；第 6 节鉴权三凭证 → Task 7/9/11/12；第 7 节游戏契约 → Task 2；第 8 节 Socket 协议 → Task 8；第 9 节生命周期 → Task 5（断线/房主转移）、Task 6（清理）；第 10 节 Docker → Task 14；第 11 节 AI 友好落点 → Task 15；第 12 节测试策略 → Task 2/4/5/8/13；第 13 节语言与范围 → Global Constraints 与各 UI 任务。
- **与 spec 的三处有意偏离**（实施中若要改回需先与用户确认）：
  1. 不使用 Next standalone 产物（Task 14 已注明原因）。
  2. 不使用 middleware 做鉴权，改用 Node runtime 的守卫函数（Task 9），因为 middleware 跑在 Edge runtime 用不了 `node:crypto`。
  3. `GameDefinition` 拆成服务端 `GameLogic`（`registry.ts`）与客户端 `Board`（`ui-registry.ts`），避免服务端打包被 JSX 污染。
- **类型一致性**：`ServiceDeps` / `ServiceResult` 在 Task 4 定义，Task 5、8 沿用同名；`RoomPublic` 在 Task 3 定义，Task 4 的 `toPublicRoom`、Task 8 的 `SyncPayload`、Task 12 的 `useRoomSocket` 一致引用；`TicTacToeView` 在 Task 2 定义，Task 5、8、12、13 一致引用；错误码集合在 Task 4/5 定义，Task 8 原样透传。
