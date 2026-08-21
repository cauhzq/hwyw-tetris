# 🧱 HWYW俄罗斯方块（手机端 PWA / APK）

一个运行在手机里的经典**俄罗斯方块**，支持**多用户登录**、**排行榜**，并且**可安装、可离线**。
由 **HWYW** 出品 —— 版本名标记为 `HWYW`（见 `AndroidManifest.xml` 的 `android:versionName="1.0.0-HWYW"` 与 `config.js` 的 `version`）。

- 纯前端 Canvas 游戏（10×20 棋盘、7 种方块、旋转/消行/计分/等级加速、暂存、落点预览）
- **触屏 + 键盘**双操控；**音效**由 Web Audio 实时合成（无需音频文件）
- 已打包为 **PWA**（可“添加到主屏幕”、离线运行、可安装提示）与 **真·APK**（离线 WebView 安装包）
- 后端不可用时自动降级为「本地模式」（数据存本机，单机也能玩）
- **扫码下载页** `download.html`：PWA 与 APK 各一入口，手机扫码即装

---

## 一、怎么玩 / 怎么装

### 方案 A：PWA（推荐，零安装，iOS + 安卓都能装）
1. 把 `public/` 部署到任意**支持 HTTPS 的静态托管**（CloudStudio、GitHub Pages、Netlify、Vercel 等）。
2. 用手机浏览器打开站点，点浏览器菜单 → **“添加到主屏幕 / 安装应用”** 即可装到桌面。
3. 装好后**离线也能启动**（Service Worker 已缓存游戏外壳）。

### 方案 B：安卓安装包 APK（完全离线）
- 已构建好：`public/tetris-hwyw.apk`（也位于 `apk-build/out/tetris-hwyw.apk`）。
- 拷到任意安卓手机，允许「未知来源」后安装即可，**完全离线运行**。
- 版本信息：`package=com.hwyw.tetris`，`versionName=1.0.0-HWYW`。

### 扫码下载页
打开 `download.html`（部署后访问 `/download.html`，或游戏登录页底部「📥 扫码下载 / 分享」），用另一台手机扫二维码即可拿到 PWA 链接或 APK 下载。

**操控**：
- 触屏：底部 `◀ ⟳ ▶ ▼ ⤓ H` 按钮（左右移动 / 旋转 / 右移 / 软降 / 硬降 / 暂存）；也可在棋盘上**轻点旋转、左右滑移动、下滑硬降**。
- 键盘：`← →` 移动，`↑` 旋转，`↓` 软降，`空格` 硬降，`H` 暂存，`P` 暂停。

---

## 二、本地运行（含云端排行榜）

```bash
cd tetris-game
node server.js
```
浏览器打开 `http://localhost:3000`。
手机与电脑连同一 Wi-Fi 时，手机浏览器用电脑局域网 IP 访问 `http://<电脑IP>:3000` 即可联机玩云端排行榜。

> 局域网用 `http` 访问时 Service Worker 不会激活（浏览器要求 HTTPS 或 localhost），所以**手机安装/离线**请用上面的 HTTPS/PWA 方案；局域网主要用于联机玩云端排行榜。

---

## 三、重新打包 APK（HWYW 版本号）

环境需有 `android-sdk/` 与 `jdk/`（本仓库已内置）。一键构建：

```bash
cd tetris-game
bash apk-build/build.sh
```

产物：`apk-build/out/tetris-hwyw.apk`，并自动复制到 `public/tetris-hwyw.apk`。
脚本流程：复制 `public/` → 剥离 PWA 专属（`transform.js`）→ aapt2 编译/链接 → javac → d8 → 注入 assets → zipalign → 自签名。

---

## 四、上线到免费平台（在线 + 跨手机排行榜）

> 关键：`server.js` **同时托管网站和 `/api`**。把整个 `tetris-game/` 作为一个 Node 应用部署后，
> 平台给你的网址**既是安装地址、也是排行榜后端**，前端 `apiBase` 留空（同源）就自动联网，无需改代码。

### 方式 1：Render（免费，推荐）
1. 注册免费账号 https://render.com （free plan 的 Web 服务无需绑卡）。
2. 把本目录推到你的 GitHub 仓库（已为你 `git init` 并提交，补两行即可）：
   ```bash
   cd tetris-game
   git remote add origin https://github.com/你的名/你的仓库.git
   git push -u origin main
   ```
3. Render 控制台 → **New + Blueprints** → 选该仓库，自动读取根目录 `render.yaml`（`node server.js`、free plan、健康检查 `/api/health`）。
4. 部署完得到形如 `https://hwyw-tetris.onrender.com` 的地址 —— 手机打开即装即玩，排行榜跨手机实时同步。

   [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/你的名/你的仓库)

### 方式 2：Railway / Koyeb / 任意 Node 平台
仓库根已含 `Procfile`（`web: node server.js`）与 `Dockerfile`，直接部署即可（监听 `PORT`）。

### 部署后（可选）
- 想让 **APK** 也用云端榜：把平台地址发我，我把 `config.js` 的 `apiBase` 设为它并重打 APK。
- 想接私有后端：编辑 `public/config.js` 的 `apiBase` 即可。

---

## 五、接口
- `GET  /api/health`        健康检查（返回 `{ok,game,version}`）
- `POST /api/register`      {username, password}
- `POST /api/login`         {username, password} -> {token, username, best}
- `POST /api/score`         {token, score}
- `GET  /api/leaderboard`   -> {list:[{username,best}]}

## 六、目录结构
```
tetris-game/
├─ server.js              # Node 后端（账号/分数/排行榜）
├─ data.json              # 后端数据（JSON 文件存储，无数据库依赖）
├─ public/                # 前端（也是 PWA / APK 的 web 资源）
│  ├─ index.html
│  ├─ style.css
│  ├─ game.js             # Canvas 游戏 + 登录/排行榜逻辑
│  ├─ sw.js               # Service Worker（离线缓存）
│  ├─ manifest.webmanifest
│  ├─ config.js           # apiBase 配置（指向可选云后端）
│  ├─ download.html       # 扫码下载页
│  ├─ tetris-hwyw.apk     # 已构建的安卓安装包（HWYW 版本）
│  └─ icons/              # PWA 图标
├─ apk-build/             # 离线 WebView APK 工程与一键构建脚本 build.sh
├─ tools/gen-icons.js     # 生成 PNG 图标（无图片依赖）
├─ render.yaml / Dockerfile  # 后端一键部署到公网
└─ README.md
```
