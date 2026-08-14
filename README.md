# Game Box

自托管的线上桌游房间：密码进站，链接邀友，一起在浏览器里玩桌游。

## 本地开发

```bash
cp .env.example .env   # 填 APP_PASSWORD 和 SESSION_SECRET
npm install
APP_PASSWORD=dev-pw SESSION_SECRET=dev-secret-key npm run dev
```

打开 `http://localhost:3000`，用上面设置的密码登录。

同一个浏览器开两个标签页，就相当于两个玩家——每个标签页在 `sessionStorage` 里存着独立的
`playerId`（键名 `gb_pid`），所以两个标签页会被服务端识别成两个不同的人。刷新标签页会保留
这个身份，关掉标签页则会丢失（换句话说：无痕窗口 / 两个标签页是本地测试多人对局最简单的
办法）。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发服务器（`tsx watch`，带热重载） |
| `npm test` | 跑全部单元/集成测试（vitest） |
| `npm run typecheck` | `tsc --noEmit`，只检查类型不产出文件 |
| `npm run build` | 构建生产版本：`next build` + esbuild 打包自定义 server 到 `dist/server.js` |
| `npm start` | 运行已构建产物（`node dist/server.js`），需要先 `npm run build` |

## 部署

项目自带 `Dockerfile` 和 `docker-compose.yml`，单容器、纯 HTTP、监听一个端口（默认 3000）。
TLS 由运维自己的反向代理终结，容器本身不处理 HTTPS。

```bash
cp .env.example .env && vi .env   # 至少要填 APP_PASSWORD 和 SESSION_SECRET
docker compose up -d --build
```

`docker-compose.yml` 里 `APP_PASSWORD` 和 `SESSION_SECRET` 是必填项（`:?` 语法），缺一个容器
都不会起来；这是有意为之——一个没有密码保护的部署不应该悄悄跑起来。容器内置 `/api/health`
健康检查。

### 反向代理

游戏依赖 Socket.IO（WebSocket）实时同步棋盘。反向代理如果不转发 `Upgrade` / `Connection`
头，浏览器会退化成轮询甚至直接连不上，游戏画面就会静默卡住不同步——这是最容易踩的坑，
务必对照检查。

**Nginx**

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

**Caddy**

```
game.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Caddy 默认已经正确处理 WebSocket upgrade，不需要额外配置。

## 已知边界

- **状态只存在内存里**：容器重启会丢失所有正在进行的对局（房间、玩家、棋盘状态全部清空）。
  这是当前架构的取舍，不是 bug。
- **玩家身份存在浏览器 `sessionStorage`**：关闭标签页会丢失身份，下次进入会被当成新玩家；
  刷新页面不受影响，身份保留。
- **房主掉线会转移房主身份给下一个在线玩家，且不会自动转回来**：这是故意的，避免房主离线后
  房间卡死。也就是说房主自己刷新页面，房主徽章可能会转给别人。
- **目前只有一款游戏（井字棋）**：平台骨架已经稳定，具体游戏按需添加，见
  `docs/adding-a-game.md`。
