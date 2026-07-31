#!/bin/bash
# 阿超知识库 连通性测试 — 每天 8:00 / 12:00 自动跑
# 主指标 (必须 OK): Cloudflare Pages
# 次指标 (GitHub 直链可能因网络波动超时,失败只记录不报警)

set -u
HEALTH_DIR="/home/ivanyinjc/achaokb/health"
mkdir -p "$HEALTH_DIR"
LOG="$HEALTH_DIR/ping.log"
STATUS="$HEALTH_DIR/status.json"
TS=$(date +"%Y-%m-%d %H:%M:%S")
TS_ISO=$(date -Iseconds)

# critical=1: 失败会报警; critical=0: 失败只记日志
ENDPOINTS=(
  "1|主页|https://achaokb.pages.dev/|200"
  "1|Meta|https://achaokb.pages.dev/data/meta.json|200"
  "1|Index|https://achaokb.pages.dev/data/index.json|200"
  "0|本地书直链|https://github.com/ivanyinjc-blip/achao_kb/releases/download/local-books-v1/b001.doc|302"
)

SUMMARY_PARTS=""
ALL_CRITICAL_OK=1
ANY_FAIL=0
FIRST=1
ENDPOINTS_JSON="["
for entry in "${ENDPOINTS[@]}"; do
  IFS='|' read -r CRIT NAME URL EXPECTED <<< "$entry"
  START=$(date +%s%N)
  HTTP=$(curl -sI -m 12 --max-time 12 -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null || echo "000")
  END=$(date +%s%N)
  MS=$(( (END - START) / 1000000 ))
  
  if [ "$HTTP" = "$EXPECTED" ]; then
    OK=1; ICON="✓"
  else
    OK=0; ICON="✗"
    ANY_FAIL=1
    if [ "$CRIT" = "1" ]; then ALL_CRITICAL_OK=0; fi
  fi
  
  if [ $FIRST -eq 1 ]; then FIRST=0; else SUMMARY_PARTS+=" | "; fi
  SUMMARY_PARTS+="$NAME=$ICON$HTTP/${MS}ms"
  
  if [ "$ENDPOINTS_JSON" != "[" ]; then ENDPOINTS_JSON+=","; fi
  ENDPOINTS_JSON+="{\"name\":\"$NAME\",\"critical\":$CRIT,\"ok\":$OK,\"http\":$HTTP,\"ms\":$MS,\"expected\":$EXPECTED}"
done
ENDPOINTS_JSON+="]"

if [ $ALL_CRITICAL_OK -eq 1 ]; then
  TAG="✅ OK"
  if [ $ANY_FAIL -eq 1 ]; then TAG="⚠️  PARTIAL"; fi
  echo "$TS  $TAG  | $SUMMARY_PARTS" >> "$LOG"
else
  echo "$TS  ❌ FAIL  | $SUMMARY_PARTS" >> "$LOG"
fi

# 写 status.json (Python 解析保证 JSON 合法)
python3 -c "
import json
parts = '''$SUMMARY_PARTS'''.split(' | ')
endpoints = []
for p in parts:
    n, rest = p.split('=', 1)
    status_part, ms_part = rest.split('/')
    ok = status_part.startswith('✓')
    code = status_part[1:]
    ms = int(ms_part.replace('ms', ''))
    endpoints.append({'name': n, 'ok': ok, 'http': int(code) if code.isdigit() else 0, 'ms': ms})
status = 'ok' if $ALL_CRITICAL_OK == 1 else ('partial' if $ANY_FAIL == 1 else 'fail')
print(json.dumps({'last_check': '$TS_ISO', 'status': status, 'endpoints': endpoints}, ensure_ascii=False, indent=2))
" > "$STATUS"

# 严重失败时桌面通知 (容错)
if [ $ALL_CRITICAL_OK -eq 0 ] && command -v notify-send > /dev/null; then
  notify-send "阿超知识库 ❌ 联通异常" "$(echo $SUMMARY_PARTS | tr '|' '\n')" -u critical 2>/dev/null || true
fi
