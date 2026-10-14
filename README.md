# Any Listen Plus

> 这是 [any-listen/any-listen](https://github.com/any-listen/any-listen) 的个人增强分支，面向**多人共用的 Web 服务版**。

在官方 v0.11.0 Web 版基础上增加：

- Cloudflare Access 登录 + 每人独立实例，首次登录自助注册，按需启动、空闲休眠
- 用户管理页：人数上限、删除、踢下线、向全体或指定用户推送通知（弹窗 / 右下角）
- 每台设备独立播放队列、歌词同步校正、定时关闭（悬停弹出）、歌单内查找、倍速重置
- 手机端完整适配，电脑端页面大小可调
- 账号音源：网易云 / QQ / 酷狗扫码登录，每个用户用自己的账号（含 VIP 权限）取播放链接，失败自动回退
- Folia 歌词详情页：移植 Folia Major 的歌词可视化，可与原版详情页一键切换，按需加载

全部增强位于 [`plus/`](./plus/)，部署说明见 [plus/README.md](./plus/README.md)。

Folia 详情页基于 [Folia Major](https://github.com/chthollyphile/folia-major)（作者 chthollyphile，AGPL-3.0）。

---

以下为上游原始 README。

<p align="center"><a href="https://github.com/any-listen/any-listen"><img height="110" src="./docs/images/header-logo.svg" alt="any-listen logo"></a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a href="https://github.com/any-listen/any-listen"><img height="86" src="./docs/images/header-name.svg" alt="any-listen name"></a></p>

<p align="center">A cross-platform private music playback service</p>

<br />

**English** | [简体中文](./docs/README_zh.md) | [繁體中文](./docs/README_zh-tw.md)

This project is under active development and currently provides both a **Desktop version** and a **Web service version**.

## Features

- Add and play local songs (standard playlists and local lists)
- Add and play songs stored on WebDAV (remote lists)
- Online song metadata matching (cover, lyrics; install the relevant extension via Extension Manager)
- Add and play online resources (playlists, charts; install the relevant extension via Extension Manager)
- Experimental audio effects
- Karaoke lyrics and title bar lyrics

## Desktop Version

Grab the latest release and install it from: [https://github.com/any-listen/any-listen-desktop/releases](https://github.com/any-listen/any-listen-desktop/releases)

## Web Version

You can deploy it directly to your server, or use Docker for deployment. See the [guide](./docs/docker-server.md) for deployment steps, environment variables, and build from source code.

## Contributing

PRs are welcome! To ensure your PR can be merged smoothly, please note the following:

- For PRs adding new features, it is recommended to create an Issue first to confirm the necessity of the feature.
- For PRs fixing bugs, please provide explanations and reproduction steps before and after the fix.
- For other types of PRs, please include appropriate explanations.

Steps to contribute:

1. Clone the repository and switch to the `dev` branch for development;
2. Submit your PR to the `dev` branch.

## License

This project is licensed under the Affero General Public License (AGPL) v3.0 with the following additional terms:

- Commercial use is strictly prohibited unless written permission is obtained from the original author.
- For full details, please refer to the [LICENSE file](./LICENSE).
