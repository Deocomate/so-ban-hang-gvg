#!/usr/bin/env bash
# Đẩy commit đang có (HEAD) lên GitHub rồi deploy đúng bản đó lên máy chủ chạy thật, một lệnh:
#   bash scripts/deploy.sh          (hoặc: npm run deploy)
# - Đóng gói từ một worktree sạch của HEAD, nên phần đang sửa dở (của phiên khác) không bị đưa lên.
# - Máy chủ: kiểm tra ổ đĩa, dừng dịch vụ, sao lưu gomsu.db (+ -wal, -shm), giữ bản mã cũ để quay lại,
#   giải nén bản mới, khởi động, chờ /api/health; lỗi thì tự quay về bản cũ.
# - SSH bằng mật khẩu trong .env (SSH_IP, SSH_PORT, SSH_USER, SSH_PASSWORD), qua ssh.exe của Windows; mật khẩu không in ra.
# Chi tiết máy chủ: docs/deploy-server.md
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SSH_EXE=/c/Windows/System32/OpenSSH/ssh.exe
SITE=https://so-ban-hang-thceramics.admirable.site
REV=$(git rev-parse --short HEAD)
TS=$(date +%Y%m%d-%H%M%S)

# 1) Đẩy commit lên GitHub (bỏ qua nếu đã đẩy)
git push -q origin HEAD:main
echo "Đã đẩy $REV lên GitHub"

# 2) Dựng bản phát hành từ worktree sạch
WORK=$(mktemp -d)
cleanup() { git -C "$ROOT" worktree remove --force "$WORK/src" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
git worktree add -q --detach "$WORK/src" HEAD
cd "$WORK/src"
npm --prefix web ci --prefer-offline --no-audit --no-fund --loglevel=error >/dev/null
npm --prefix web run build --silent >/dev/null
npm --prefix server ci --omit=dev --prefer-offline --no-audit --no-fund --loglevel=error >/dev/null
tar -czf ../app.tgz --exclude=web/node_modules --exclude=web/src --exclude=web/public \
  server/src server/scripts server/package.json server/package-lock.json server/node_modules web
cd "$WORK"
echo "Đã đóng gói $REV ($(du -h app.tgz | cut -f1))"

# 3) SSH bằng mật khẩu trong .env, không in ra màn hình
eval "$(grep -E '^SSH_(IP|PORT|USER|PASSWORD)=' "$ROOT/.env" | sed 's/\r$//; s/^/export /')"
printf '@powershell -NoProfile -Command "[Console]::Out.WriteLine($env:SSH_PASSWORD)"\r\n' > askpass.cmd
export SSH_ASKPASS="$(cygpath -w "$WORK/askpass.cmd")" SSH_ASKPASS_REQUIRE=force DISPLAY=:0
ssh_run() { "$SSH_EXE" -p "$SSH_PORT" -o PreferredAuthentications=password -o PubkeyAuthentication=no \
  -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 "$SSH_USER@$SSH_IP" "$@"; }

ssh_run "cat > /tmp/so-ban-hang-app.tgz" < app.tgz
echo "Đã chép lên máy chủ"

# 4) Trên máy chủ: sao lưu, thay mã, khởi động, kiểm tra; lỗi thì quay về bản cũ
ssh_run "TS=$TS REV=$REV bash -s" <<'REMOTE'
set -eu
APP=/opt/so-ban-hang-gom; DATA=/var/lib/so-ban-hang-gom; SVC=so-ban-hang-gom
# Giữ 3 bản sao lưu trước deploy gần nhất (bản hằng đêm gomsu-YYYY-MM-DD.db không đụng tới)
ls -1dt "$DATA"/backups/truoc-deploy-* 2>/dev/null | tail -n +4 | xargs -r rm -rf
AVAIL=$(df -k / | awk 'NR==2{print $4}')
echo "Ổ đĩa còn trống: $((AVAIL / 1024)) MB"
[ "$AVAIL" -gt 1500000 ] || { echo "Ổ đĩa còn dưới 1,5 GB — dừng, chưa đổi gì"; exit 1; }
systemctl stop "$SVC"
B="$DATA/backups/truoc-deploy-$TS"; mkdir -p "$B"
for f in gomsu.db gomsu.db-wal gomsu.db-shm; do [ -f "$DATA/$f" ] && cp -p "$DATA/$f" "$B/"; done
echo "Đã sao lưu CSDL vào $B"
cd "$APP"; rm -rf .prev; mkdir .prev; mv server web .prev/
tar -xzf /tmp/so-ban-hang-app.tgz && rm -f /tmp/so-ban-hang-app.tgz
systemctl start "$SVC"
for i in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:3010/api/health >/dev/null 2>&1; then echo "Bản $REV đang chạy"; exit 0; fi
  sleep 1
done
echo "Bản mới không khởi động được — quay về bản cũ. Nhật ký:"
journalctl -u "$SVC" -n 30 --no-pager || true
systemctl stop "$SVC"; rm -rf server web; mv .prev/server .prev/web .; systemctl start "$SVC"
exit 1
REMOTE

# 5) Kiểm tra từ ngoài
curl -fsS "$SITE/api/health" >/dev/null && echo "Đã deploy $REV: $SITE"
