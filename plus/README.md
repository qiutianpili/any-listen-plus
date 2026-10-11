# Any Listen Plus

基于 [Any Listen](https://github.com/any-listen/any-listen) **v0.11.0 Web 服务版** 的增强包：多人共用、手机适配、播放体验和管理功能。
不改动上游源码，全部以「网关 + 前端注入脚本 + 构建产物补丁」的方式叠加在官方发布版上，升级前请先确认补丁能否适配新版本。

## 目录

| 路径 | 内容 |
| --- | --- |
| `web/mobile.js`、`web/mobile.css` | 前端增强脚本，由 nginx `sub_filter` 注入到页面 |
| `gateway/gw.js` | 多用户网关（Node.js，无依赖） |
| `gateway/*.example.json` | 网关配置与用户列表示例 |
| `patches/v0.11.0.json`、`patches/apply.js` | 对官方 v0.11.0 构建产物的补丁（带 sha256 校验） |
| `deploy/` | systemd 服务与 nginx 配置示例 |

## 功能

### 多用户与管理
- **Cloudflare Access 登录**：网关校验 Access JWT，管理员邮箱进入主实例，其他邮箱各自拥有独立的 Any Listen 实例（独立歌单、设置、播放队列）。
- **首次登录自助注册**：被 Access 放行但还没有账号的邮箱，第一次打开会要求设置用户名；用户名可随时在侧栏改（规则严格校验、保留名、防重名）。
- **按需启动 / 空闲休眠**：用户打开时才启动其实例，空闲一段时间（默认 15 分钟，可在管理页修改）自动停止，适合小内存 VPS。
- **用户管理页**（侧栏「用户管理」，弹窗打开，不打断播放）：人数上限、删除用户、踢下线（立即失效会话并停止实例）。
- **推送通知**：管理员可向全体或指定用户推送消息，支持「弹窗」与「右下角提示」，24 小时内有效，可撤回；内容按纯文本显示。

### 播放体验
- **每台设备独立播放队列**：同一账号多台设备同时听歌互不干扰；侧栏可一键移除其他设备。
- **歌词同步校正**：扣除 WebAudio 输出延迟，并在偏差稳定超过阈值时自动重新对齐。
- **定时关闭**：10/15/20/25/30 分钟预设、自定义 1–720 分钟、「播完这首再关」；电脑端为播放栏里的原生风格时钟图标，鼠标悬停即弹出带动画的小菜单。
- **在线搜索播放进入播放历史**：从搜索结果播放的歌会加入播放历史，下一首按历史继续。
- **歌单内查找**：每个歌单工具栏的「歌曲查找」可在本歌单内按歌名/歌手/专辑搜索，直接播放或定位。
- **倍速重置**：倍速弹窗增加「重置 1.00x」，并禁用在倍速图标上滚轮误调速度。
- 新用户默认音量 50%、关闭「保持音高」。
- 扩展隔离上下文上限 5 → 12，可同时加载更多音源扩展。

### 界面
- **手机适配**：抽屉式侧栏、底部播放栏统一布局、详情页三行播放控制、视频式拖动进度条（拖动时显示时间）。
- **电脑端页面大小**：主界面默认 125%，侧栏可调 80–200%；歌曲详情页单独调节，互不影响。
- 详情页自下而上弹出，背景改为主题色渐变；进度条悬停显示时间。

## 部署（Debian / Ubuntu 示例）

1. 按上游文档部署 Any Listen v0.11.0 到 `/opt/any-listen`，用 `anylisten` 用户运行，确认能正常打开。
2. 打补丁（先停服务）：
   ```bash
   systemctl stop any-listen
   node plus/patches/apply.js /opt/any-listen
   ```
   版本不符的文件会被跳过，原文件备份为 `*.orig`。
3. 前端脚本：把 `plus/web/*` 复制到 `/opt/any-listen-mobile/`，参考 `deploy/nginx.conf.example` 配置 nginx。每次改动脚本后把 `?v=` 加 1。
4. 网关：
   ```bash
   mkdir -p /opt/al-gateway /opt/al-users
   cp plus/gateway/gw.js /opt/al-gateway/
   cp plus/gateway/config.example.json /opt/al-gateway/config.json   # 填 Access 团队域名、AUD、管理员邮箱
   cp plus/gateway/users.example.json /opt/al-gateway/users.json     # 填管理员实例的 Any Listen 密码
   cp plus/deploy/*.service /etc/systemd/system/ && systemctl daemon-reload
   systemctl enable --now al-gateway
   ```
   管理员实例监听 9500（原 `any-listen` 服务），其他用户实例从 9501 起，由网关自动创建 `any-listen-u@<id>` 服务。
5. Cloudflare：用 Tunnel 把域名指向本机 nginx，并建一个 Access 应用，在策略里放行要使用的邮箱（可开启邮箱验证码、Google、GitHub 登录）。网关只信任 Access 签发的 JWT。

> 注意：不要让 CDN 缓存音频；补丁过的 `indexBzjGy48v.js` 需以 `no-cache` 提供，修改后记得清除 CDN 缓存。

## 许可

与上游相同：AGPL-3.0 并附加「未经原作者书面许可禁止商用」条款，详见根目录 [LICENSE](../LICENSE)。感谢 Any Listen 作者。
