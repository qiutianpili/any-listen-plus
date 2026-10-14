#!/bin/sh
# 1) Publishes a non-secret projection of the gateway user list (name, display, role) for al-accsrc.
# 2) Installs the per-user account-source script for users that don't have it yet (stopped instances only).
umask 022
/opt/node22/bin/node -e 'const fs=require("fs");const u=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).map(x=>({name:x.name,display:x.display||x.name,role:x.role}));fs.writeFileSync(process.argv[2]+".tmp",JSON.stringify(u));fs.renameSync(process.argv[2]+".tmp",process.argv[2])' /opt/al-gateway/users.json /opt/al-accsrc/users.pub.json
BACKUP_DIR=${BACKUP_DIR:-/var/backups/al-accsrc} /usr/bin/python3 /opt/al-accsrc/bin/install.py install --missing
