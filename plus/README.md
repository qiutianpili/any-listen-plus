# Any Listen Plus

基于 [Any Listen](https://github.com/any-listen/any-listen) **v0.11.0 Web 服务版** 的增强包：多人共用、手机适配、播放体验和管理功能。
不改动上游源码，全部以「网关 + 前端注入脚本 + 构建产物补丁」的方式叠加在官方发布版上，升级前请先确认补丁能否适配新版本。

## 目录

| 路径 | 内容 |
| --- | --- |
| `web/mobile.js`、`web/mobile.css` | 前端增强脚本，由 nginx `sub_filter` 注入到页面 |
| `gateway/gw.js` | 多用户网关（Node.js，无依赖） |
| `gateway/daily.py` | 每日推荐生成脚本（Python 3，无依赖） |
| `gateway/*.example.json` | 网关配置与用户列表示例 |
| `patches/v0.11.0.json`、`patches/apply.js` | 对官方 v0.11.0 构建产物及音源加载扩展 lx-api-source-loader 0.1.7 的补丁（带 sha256 校验） |
| `deploy/` | systemd 服务与 nginx 配置示例 |
| `account-sources/` | 账号音源：网易云 / QQ / 酷狗扫码登录，用每个用户自己的账号取播放链接，见 [account-sources/README.md](./account-sources/README.md) |
| `folia/` | Folia 详情页（Folia Major 歌词可视化移植）源码与构建脚本，见 [folia/README.md](./folia/README.md) |

## 功能

### 多用户与管理
- **Cloudflare Access 登录**：网关校验 Access JWT，管理员邮箱进入主实例，其他邮箱各自拥有独立的 Any Listen 实例（独立歌单、设置、播放队列）。
- **首次登录自助注册**：被 Access 放行但还没有账号的邮箱，第一次打开会要求设置用户名；用户名可随时在侧栏改（规则严格校验、保留名、防重名）。
- **按需启动 / 空闲休眠**：用户打开时才启动其实例，空闲一段时间（默认 15 分钟，可在管理页修改）自动停止，适合小内存 VPS。
- **用户管理页**（侧栏「用户管理」，弹窗打开，不打断播放）：人数上限、删除用户、踢下线（立即失效会话并停止实例）。
- **推送通知**：管理员可向全体或指定用户推送消息，支持「弹窗」「右下角提示」「主页推送」，24 小时内有效，可撤回；内容按纯文本显示。
- **主页公告**：管理员在用户管理页设置一条公告，显示在每个人的主页顶部。

### 播放体验
- **每台设备独立播放队列**：同一账号多台设备同时听歌互不干扰；侧栏可一键移除其他设备。
- **歌词同步校正**：扣除 WebAudio 输出延迟，并在偏差稳定超过阈值时自动重新对齐。
- **定时关闭**：10/15/20/25/30 分钟预设、自定义 1–720 分钟、「播完这首再关」；电脑端为播放栏里的原生风格时钟图标，鼠标悬停即弹出带动画的小菜单。
- **在线搜索播放进入播放历史**：从搜索结果播放的歌会加入播放历史，下一首按历史继续。
- **歌单内查找**：每个歌单工具栏的「歌曲查找」可在本歌单内按歌名/歌手/专辑搜索，直接播放或定位。
- **倍速重置**：倍速弹窗增加「重置 1.00x」，并禁用在倍速图标上滚轮误调速度。
- 新用户默认音量 50%、关闭「保持音高」。
- 扩展隔离上下文上限 5 → 12，可同时加载更多音源扩展。
- **音源竞速**：按音源顺序获取播放链接，当前音源 2.5 秒没响应就同时请求下一个，先拿到可用链接者胜；单个音源最长 9 秒，失败的音源降级 10 分钟；启动时各音源并行加载，冷启动后第一首不再等最慢的音源。
- **每日推荐**：每天 05:00（北京时间）按用户的播放历史和歌单，用 QQ 音乐「相似歌曲」生成 30 首没听过的歌（去伴奏/DJ/翻唱等，每位歌手最多 3 首），写入用户的「每日推荐」歌单；7 天未上线的用户跳过，回来打开时当场补上。不需要 AI 接口。
- 浏览器缓存一次性清理：脚本版本里的 `CLR` 变化时，每个浏览器自动清一次本站缓存。

### 界面
- **手机适配**：抽屉式侧栏、底部播放栏统一布局、详情页三行播放控制、视频式拖动进度条（拖动时显示时间）。
- **电脑端页面大小**：主界面默认 125%，侧栏可调 80–200%；歌曲详情页单独调节，互不影响。
- 详情页自下而上弹出，背景改为主题色渐变；进度条悬停显示时间。
- **主页**：侧栏第一项，显示公告、推送和歌单卡片；「我喜欢」为爱心图标、「每日推荐」为太阳图标，其他歌单可设一个 emoji 作为封面（不使用歌曲封面或自定义图片）；从主页打开的歌单点「返回」回到主页。

### 账号音源（扫码登录）
- 侧栏「账号音源」弹窗打开 `/al-login/`：用网易云音乐 / QQ音乐 / 酷狗音乐 App 扫码登录**自己的**账号，可随时检查状态、退出、关闭开关。
- 播放这三个平台的歌曲时，优先用本人账号取链接（含账号有权限的 VIP 歌曲，音质按设置逐级降到账号可得的最高档），失败自动回退到原有音源。
- 每个用户的登录只给自己用；管理员可把自己的账号共享给指定用户（默认关闭）。详见 [account-sources/README.md](./account-sources/README.md)。

### Folia 详情页
- 歌曲详情页可切换为 [Folia Major](https://github.com/chthollyphile/folia-major)（chthollyphile，AGPL-3.0）的歌词可视化：14 种歌词视觉模式、多种背景、各模式设置面板、静态模式。
- **Folia / 原版** 随时切换，不影响播放；选择保存在 localStorage `al-detail-style`，未设置时手机默认原版、电脑默认 Folia。
- 按需加载：只有以 Folia 打开详情页才下载，GPU 模式（three.js / pixi）和 WebGL 背景再单独按需加载；关闭即卸载。缺少 bundle 钩子或加载失败时自动回退原版。
- 构建与说明见 [folia/README.md](./folia/README.md)。

## 部署（Debian / Ubuntu 示例）

1. 按上游文档部署 Any Listen v0.11.0 到 `/opt/any-listen`，用 `anylisten` 用户运行，确认能正常打开。
2. 打补丁（先停服务）：
   ```bash
   systemctl stop any-listen
   node plus/patches/apply.js /opt/any-listen
   ```
   版本不符的文件会被跳过，原文件备份为 `*.orig`。
3. 前端脚本：把 `plus/web/*` 复制到 `/opt/any-listen-mobile/`，参考 `deploy/nginx.conf.example` 配置 nginx。每次改动脚本后把 `?v=` 加 1。
   Folia 详情页：`cd plus/folia && bash build.sh`，再把 `dist/` 复制为 `/opt/any-listen-mobile/folia/`（即 `/__m/folia/`）：
   ```bash
   rm -rf /opt/any-listen-mobile/folia && cp -r plus/folia/dist /opt/any-listen-mobile/folia
   ```
   不部署这一步也可以，详情页会自动使用原版。
4. 网关：
   ```bash
   mkdir -p /opt/al-gateway /opt/al-users
   cp plus/gateway/gw.js /opt/al-gateway/
   cp plus/gateway/config.example.json /opt/al-gateway/config.json   # 填 Access 团队域名、AUD、管理员邮箱
   cp plus/gateway/users.example.json /opt/al-gateway/users.json     # 填管理员实例的 Any Listen 密码
   cp plus/deploy/*.service /etc/systemd/system/ && systemctl daemon-reload
   systemctl enable --now al-gateway
   cp plus/gateway/daily.py /opt/al-gateway/
   systemctl enable --now al-daily.timer   # 每日推荐
   ```
   管理员实例监听 9500（原 `any-listen` 服务），其他用户实例从 9501 起，由网关自动创建 `any-listen-u@<id>` 服务。
5. Cloudflare：用 Tunnel 把域名指向本机 nginx，并建一个 Access 应用，在策略里放行要使用的邮箱（可开启邮箱验证码、Google、GitHub 登录）。网关只信任 Access 签发的 JWT。
6. 账号音源（可选）：见 [account-sources/README.md](./account-sources/README.md)。

> 注意：不要让 CDN 缓存音频；补丁过的 `indexBzjGy48v.js` 需以 `no-cache` 提供，修改后记得清除 CDN 缓存。

## 许可

Folia 详情页包含 [Folia Major](https://github.com/chthollyphile/folia-major)（chthollyphile 及贡献者，AGPL-3.0）的代码，见 [folia/README.md](./folia/README.md)。


与上游相同：AGPL-3.0 并附加「未经原作者书面许可禁止商用」条款，详见根目录 [LICENSE](../LICENSE)。感谢 Any Listen 作者。
