# Folia 详情页（folia-al）

把 [Folia Major](https://github.com/chthollyphile/folia-major)（作者 **chthollyphile**，AGPL-3.0）的歌词可视化移植成 Any Listen Plus 的歌曲详情页。
它是一个独立的 ES 模块包（`dist/folia-player.js` + 按需加载的 `chunks/`），由 `plus/web/mobile.js` 在打开详情页时动态 `import()`，
全屏挂在 `.play-detail` 之上（shadow DOM 隔离样式），不改 Any Listen 本身的播放逻辑。

## 功能

- **Folia / 原版 切换**：Folia 顶栏的「原版」按钮、原版详情页上的 Folia/原版 开关，都可随时切换，切换不影响播放。
  选择保存在 `localStorage` 的 `al-detail-style`（`folia` 或 `al`），每个浏览器记住自己的选择；
  未设置时默认：**手机为原版**，**电脑为 Folia**。
- **歌词视觉模式**：沿用 Folia 的全部模式（classic、cadenza、cappella、claddagh、partita、fume、monet、still、tilt、
  pendolo、diorama、sonnet、tempera、lumiere），以及 Folia 自带的背景（含 nomand、sora 等 WebGL 背景）和各模式的设置面板；
  标 `·GPU` 的为 three.js / pixi 模式。另有「静态模式」停止歌词动画，最省电。设置存在 `folia:` 前缀的 localStorage 键中，不与 Any Listen 冲突。
- **播放控制**：播放/暂停、上一首/下一首、拖动进度、音量/静音、点歌词跳转（monet、pendolo），全部通过 Any Listen 自己的命令执行。
- **歌词时钟**与 Any Listen 原歌词播放器一致（扣除输出延迟并加上歌词偏移），翻译/罗马音/逐字歌词随歌曲一起传入。

## 按需加载

- 只有以 Folia 样式打开详情页时才下载 `folia-player.js`；关闭详情页或切回原版时卸载，不留下 rAF / WebGL。
- three.js、pixi.js 以及 nomand / sora 背景的渲染器都拆成独立 chunk，只在选中对应模式/背景时才加载
  （这正是 `folia-src.patch` 对 Folia 源码做的唯一改动：把两个背景渲染器改为 `React.lazy`）。
- 加载失败、视图崩溃或缺少 bundle 钩子时，自动回退到原版详情页，并在控制台输出 `[folia]` 警告。

## 需要的 bundle 钩子

`plus/patches/v0.11.0.json` 中 `indexBzjGy48v.js` 的补丁在原有 Plus 钩子之上新增（只增加，不改原行为）：

- `window.__alPl.info()` 当前歌曲信息与歌词，`vol()` / `mute()` / `rate()` 音量、静音、倍速，
  `exec(cmd, arg)` 执行播放器命令，`detail(show)` 打开/关闭详情页，`shown()` 详情页是否显示；
- `window.__alLrc.off()` 当前歌词偏移。

用 `node plus/patches/apply.js /opt/any-listen` 打补丁。已经打过旧版 Plus 补丁的服务器会自动从 `*.orig` 备份重新打补丁。

## 目录

| 路径 | 内容 |
| --- | --- |
| `src/` | 适配层：`main.tsx`（挂载/卸载入口）、`App.tsx`（播放控制与设置面板）、`api.ts`（与 mobile.js 的接口约定）、`ls.ts`（localStorage 命名空间） |
| `src/stubs/` | 替换掉需要 Electron / Node / 在线接口的 Folia 模块（视频层、Folium mod 插槽、i18n 初始化等） |
| `folia-src.patch` | 对上游 Folia 源码的改动（2 个文件） |
| `build.sh` | 拉取 Folia Major 固定提交、打补丁、`npm ci`、`vite build` |
| `vite.config.ts`、`package.json`、`package-lock.json`、`postcss.config.js` | 构建配置（依赖版本锁定） |
| `al/folia-block.js`、`al/folia-block.css` | mobile.js / mobile.css 中 Folia 部分的独立副本（已合并进 `plus/web/`，仅供参考） |
| `deploy.sh`、`ROLLBACK.md` | 部署与回滚示例 |
| `LICENSE` | AGPL-3.0 全文 |

`folia-src/` 不入库，由 `build.sh` 生成。

## 构建

需要 git、Node.js 20+。

```bash
cd plus/folia
bash build.sh       # 拉取 chthollyphile/folia-major @ 7701347918a4177c1c57b538d7556db9606be67a（v0.7.19），
                    # 复制 src 到 folia-src/，应用 folia-src.patch，npm ci，vite build -> dist/
```

可选环境变量：`SKIP_INSTALL=1`（复用已有 node_modules）、`SRC_ONLY=1`（只准备 folia-src）、`FOLIA_REPO` / `FOLIA_COMMIT`。

## 部署

1. 打 bundle 补丁（见上，先停服务）。
2. 把 `dist/` 复制到前端脚本目录下的 `folia/`，使其以 `/__m/folia/` 提供（`nginx.conf.example` 里 `/__m/` 已指向该目录）：
   ```bash
   rm -rf /opt/any-listen-mobile/folia && cp -r plus/folia/dist /opt/any-listen-mobile/folia
   cp plus/web/mobile.js plus/web/mobile.css /opt/any-listen-mobile/
   ```
   然后把 nginx 里 `mobile.js?v=` / `mobile.css?v=` 加 1 并 reload；有 CDN 时清一次缓存。
3. 或使用 `deploy.sh`：`SSH_HOST=root@your-server NGINX_SITE=/etc/nginx/sites-enabled/your-domain bash deploy.sh <JSVER> <CSSVER>`。

更新 Folia 包后，可把 `mobile.js` 中的 `FV` 加 1，强制浏览器重新获取 `folia-player.js`。回滚见 [ROLLBACK.md](./ROLLBACK.md)。

## 许可与致谢

- 歌词可视化来自 **Folia Major**，作者 chthollyphile 及贡献者：<https://github.com/chthollyphile/folia-major>，
  以 **GNU Affero General Public License v3.0** 授权。本目录（适配层、stubs、补丁）同样以 AGPL-3.0 发布，许可全文见 [LICENSE](./LICENSE)；
  构建产物头部注释保留了版权与许可声明，部署时 `dist/LICENSE` 一并提供。
- 打包的第三方库（React、framer-motion、pixi.js、three.js 等）保留各自的许可。
