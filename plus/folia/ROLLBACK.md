# Folia 详情页 — 回滚

## 单个用户（无需改服务器）
在 Folia 顶栏点「原版」，或在原版详情页点 Folia/原版 切换。选择保存在 localStorage `al-detail-style=al`。

## 整体回滚（在服务器上以 root 执行）

`deploy.sh` 第一次部署前会把旧文件备份到 `$BACKUP_DIR`（默认 `/root/backup-folia`），之后不会覆盖。
`apply.js` 打补丁时会把原 bundle 备份为 `indexBzjGy48v.js.orig`。

```bash
B=/root/backup-folia                 # 你的 BACKUP_DIR
WEB=/opt/any-listen-mobile            # 你的 WEB_DIR
SITE=/etc/nginx/sites-enabled/your-domain
AL=/opt/any-listen                    # Any Listen 安装目录

cp $B/mobile.js $B/mobile.css $WEB/
rm -rf $WEB/folia
# 可选：恢复未打补丁的 bundle（钩子只是新增，保留也无害）
# cp $AL/public/indexBzjGy48v.js.orig $AL/public/indexBzjGy48v.js
# 提高 ?v= 让浏览器丢弃缓存的标签
sed -i -E 's#mobile\.css\?v=[0-9]+#mobile.css?v=999#; s#mobile\.js\?v=[0-9]+#mobile.js?v=999#' $SITE
nginx -t && systemctl reload nginx
```

如果前面有 CDN（如 Cloudflare），按域名清一次缓存。无需重启 Any Listen 实例（bundle 是静态文件）。

说明
- 只恢复 mobile.js/css、保留打过补丁的 bundle：安全，补丁只**新增**钩子
  （`__alPl.info/vol/mute/rate/exec/detail/shown`、`__alLrc.off`），不改原有行为。
- 只恢复 bundle、保留 Folia 版 mobile.js：也安全，mobile.js 检测到缺少钩子会回退到原版详情页并在控制台警告。
