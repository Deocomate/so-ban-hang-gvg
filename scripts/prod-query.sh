#!/usr/bin/env bash
# Chạy một tệp JS chỉ đọc trên máy chủ thật để tra số liệu (CSDL mở readOnly trong tệp JS):
#   bash scripts/prod-query.sh <tệp.mjs>
# Trong tệp: import { DatabaseSync } from 'node:sqlite'; new DatabaseSync('/var/lib/so-ban-hang-gom/gomsu.db', { readOnly: true })
# SSH giống scripts/deploy.sh (mật khẩu trong .env, không in ra).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
eval "$(grep -E '^SSH_(IP|PORT|USER|PASSWORD)=' "$ROOT/.env" | sed 's/\r$//; s/^/export /')"
printf '@powershell -NoProfile -Command "[Console]::Out.WriteLine($env:SSH_PASSWORD)"\r\n' > "$W/askpass.cmd"
export SSH_ASKPASS="$(cygpath -w "$W/askpass.cmd")" SSH_ASKPASS_REQUIRE=force DISPLAY=:0
/c/Windows/System32/OpenSSH/ssh.exe -p "$SSH_PORT" -o PreferredAuthentications=password -o PubkeyAuthentication=no -o ConnectTimeout=20 \
  "$SSH_USER@$SSH_IP" "cd /opt/so-ban-hang-gom/server && /opt/node22/bin/node --input-type=module -" < "$1"
