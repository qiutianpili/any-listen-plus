# 账号音源（account sources）

让 Any Listen 的每个用户用**自己的**网易云音乐 / QQ音乐 / 酷狗音乐账号扫码登录，播放这三个平台的歌曲时优先用自己账号取播放链接（账号有权限的 VIP 歌曲也能播），取不到时自动回退到原有音源。扫码协议与后端选型参考 [Folia Major](https://github.com/chthollyphile/folia-major) 的做法。

## 组成

| 部分 | 说明 |
|---|---|
| `server/server.js` | 单个 Node 进程 `al-accsrc`，只监听 `127.0.0.1`。进程内调用 [NeteaseCloudMusicApi Enhanced](https://www.npmjs.com/package/@neteasecloudmusicapienhanced/api)、[KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi)（概念版 lite 设备身份），并在进程内启动 [qq-music-api](https://www.npmjs.com/package/@yakult-green-tea/qq-music-api)（强制绑定 127.0.0.1）。运行时内存约 60–85 MB。 |
| `server/login.html` | 扫码登录页 `/al-login/`：各平台登录状态、二维码（约 3 分钟有效，自动轮询）、检查状态、退出登录、本人开关、管理员共享开关。手机适配；同一部手机上可截图后在 App「扫一扫」相册识别，或点登录链接。 |
| `lx-script/account-source.template.js` | LX 自定义源脚本，装进每个用户自己实例的 `lx-api-source-loader`，放在第一位。只提供 `musicUrl`（搜索、歌词、封面仍由 online-metadata 提供）。 |
| `deploy/install.py` | 给每个 AL 实例安装 / 移除脚本，并给 loader 打两个小补丁（见下）。 |
| `deploy/*.service / *.path / *.timer`, `al-accsrc-users.sh` | systemd 单元；把网关用户列表的公开投影（名字、显示名、角色）发布给 al-accsrc，并给新注册用户自动安装脚本。 |
| `deploy/nginx.location.example` | 只把 `/al-login` 反代给 al-accsrc。 |

## 用户隔离与安全

- **身份**：登录页的调用者身份由网关判定（al-accsrc 带着请求的 Cookie 去问网关 `/__gw/push`、`/__gw/me`，网关校验 Cloudflare Access JWT）。登录页只能看到/修改自己的账号。
- **播放取链**：AL 的扩展 API 不暴露"当前用户"，但本部署是"每个用户一个独立 AL 实例"，所以脚本按实例安装：每个用户的脚本里嵌一个只属于他的随机 token（192 bit），al-accsrc 用 token 找到用户，只用这个用户自己的登录。A 的脚本无法使用 B 的账号。
- **默认不共享**。管理员可在登录页把**自己的**账号共享给指定用户（默认全部关闭）；被共享的用户只在自己没登录的平台上使用管理员账号。
- 每个用户可在登录页关掉"启用我的账号音源"，关掉后脚本立即失败、交给其他音源。
- 凭据只存服务器：`state/users/<user>/{wy,tx,kg}.json`（0600，目录 0700，属主独立系统用户）；QQ 会话由 qq-music-api 用 AES-256-GCM 加密保存。日志不记录 cookie / token / 播放链接。
- `/int/url`（脚本用的内部接口）在单独的本机端口 `ACC_INT_PORT`（默认 127.0.0.1:9412），nginx 只转发 `/al-login` 到 9410；带反斜杠 / `%5c` / 编码斜杠的路径一律拒绝。token 只接受 48 位十六进制，常量时间比较。
- 每个播放器实例以独立系统用户 `al-<id>` 运行（数据目录 0700，`config.cjs` 与脚本文件 0600），互相读不到对方的 token 与歌单。
- 播放器 unit 的 `ExecStartPre=+-… install.py install %i --force` 让每次启动前都写入**本人**当前的脚本（网关新建实例时也会先删掉从管理员目录复制来的脚本），所以新用户第一次启动就是自己的 token、空的登录状态。
- 网关删除用户时调用 `install.py purge <id>` 清掉该 id 的 token 记录和已保存的平台登录；网关分配的 id 单调递增、不复用；每条记录还绑定"网关账号（邮箱+创建时间）"，对不上就重置。
- `install.py rotate` 轮换 token（停止中的实例立即生效，运行中的下次启动生效）。
- qq-music-api（9411）建议用 nftables 限制只有 al-accsrc 的系统用户能连（见 `../deploy/nftables.conf.example`）；不要配置全局 QQ cookie。

## 取链与回退

- 音质：按 AL 设置请求的音质（128k/320k/flac/flac24bit）开始，逐级降到账号能拿到的最高档。网易云 `song/url/v1`（带随机国内 IP 头）；QQ `getMusicPlay`；酷狗 `/song/url`（先带专辑 ID，再只用 hash）。网易云试听片段视为失败。
- 回退：loader 按顺序对音源做"对冲竞速"（首个 2.5 s 未返回就并行下一个，第一个可用链接胜出）。本脚本失败时立即返回错误，其他音源马上接手。
- loader 补丁（`install.py` 自动打，幂等）：
  1. 错误信息带 `[nocool]` 的不触发"失败降级 10 分钟"——账号源未登录 / 某首歌无权限不该把它整体挪到最后。
  2. `fs.youthandroid*.kugou.com` 只支持 http，不再改写成 https 直连，改由 AL 代理。

## 部署

```bash
useradd -r -s /usr/sbin/nologin -d /opt/al-accsrc alaccsrc
mkdir -p /opt/al-accsrc/{app,bin,state,tmp} && cp server/* /opt/al-accsrc/app/
cd /opt/al-accsrc/app && npm install --omit=dev
cp lx-script/account-source.template.js deploy/install.py deploy/al-accsrc-users.sh /opt/al-accsrc/bin/
# env：QQ_AUTH_SESSION_PATH + QQ_SESSION_SECRET（见 deploy/env.example），root 0600
chown -R alaccsrc: /opt/al-accsrc/{state,tmp}; chmod 700 /opt/al-accsrc/{state,tmp}
cp deploy/al-accsrc*.{service,path,timer} /etc/systemd/system/ && systemctl daemon-reload
systemctl enable --now al-accsrc al-accsrc-users.path al-accsrc-users.timer
python3 /opt/al-accsrc/bin/install.py install      # 需在各 AL 实例停止时执行；之后由播放器 unit 的 ExecStartPre 自动维护
# nginx：加入 deploy/nginx.location.example，nginx -t && systemctl reload nginx
```

`server.js` 的环境变量：`ACC_PORT`(9410) `ACC_INT_PORT`(9412) `QQ_PORT`(9411) `ACC_STATE` `ACC_GATEWAY`(http://127.0.0.1:9400) `ACC_ADMIN_USER`(admin) `ACC_USERS_JSON`。

AL 升级或 loader 更新会覆盖 loader 的 `main.js`，之后重跑 `install.py install` 即可。回滚：`install.py remove`，再移除 nginx location 与 systemd 单元。

## 已知限制

- 服务器在海外时，平台可能把扫码登录记为异地登录；QQ / 网易云部分链接可能有地区限制（网易云已带国内 IP 头）。
- 酷狗未做"概念版每日领 VIP"。
- 第三方后端随平台接口变化可能失效，届时升级对应 npm 包版本。
