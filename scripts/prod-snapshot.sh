#!/usr/bin/env bash
# Tải một bản chụp CSDL thật (VACUUM INTO, chỉ đọc) về máy: bash scripts/prod-snapshot.sh <thư-mục>  → <thư-mục>/live.db
# Bản chụp có dữ liệu khách hàng: để trong thư mục tạm (scratchpad), không đưa vào repo.
set -euo pipefail
D="${1:?Thiếu thư mục lưu}"; mkdir -p "$D"
bash "$(dirname "$0")/prod-query.sh" "$(dirname "$0")/prod-snapshot.mjs" 2>/dev/null | base64 -d | gunzip > "$D/live.db"
echo "Đã lưu $D/live.db ($(du -h "$D/live.db" | cut -f1))"
