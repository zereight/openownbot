#!/bin/zsh
# OpenOwnBot 개발 빌드 실행기. 전역 Bun(1.3.14)과 분리된 Bun 1.4.2, Node 24를 사용함.
#   openownbot-dev.sh          앱 실행 (이미 떠 있으면 먼저 멈추고 다시 띄움)
#   openownbot-dev.sh stop     실행 중인 개발 스택 종료
#   openownbot-dev.sh status   실행 상태 확인
#   openownbot-dev.sh update   git pull + bun install 후 실행
#   openownbot-dev.sh sync     실제 OpenOwnBot 프로필(~/Library/Application Support/OpenBot)을 개발 프로필로
#                           복사함. 실제 프로필은 읽기만 하고, 로그인 세션은 가져오지 않음. 이어서 실행하면
#                           로컬 계정 API로 자동 로그인하므로 api.openbot.run은 부르지 않음. 실제 OpenOwnBot.app과
#                           개발 앱을 먼저 종료해야 하고, 기존 개발 프로필은 ~/Backups로 옮겨 둠.
# stop, status, sync를 뺀 모든 실행은 zereight 브랜치로 먼저 전환한 뒤 시작함.
# 이 파일이 들어 있는 repo의 루트에서 실행함. ~/dev/openownbot-dev.sh 같은 심볼릭 링크로 불러도
# 실제 위치를 따라가므로 repo를 옮겨도 경로를 고칠 필요가 없음.
export BUN_INSTALL="$HOME/.bun-1.4.2"
export PATH="$HOME/.bun-1.4.2/bin:$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
SCRIPT=${0:A}
cd "${SCRIPT:h}/.." || exit 1

REAL_PROFILE="$HOME/Library/Application Support/OpenBot"
# 앱이 worktree 경로의 SHA-256으로 정하는 개발 프로필 이름임 (src/main/development-profile.ts).
DEV_PROFILE="$HOME/Library/Application Support/ROBot Dev wt-$(printf %s "$PWD" | shasum -a 256 | cut -d' ' -f1)"
BRANCH=zereight

ensure_branch() {
  local current="$(git branch --show-current)"
  [ "$current" = "$BRANCH" ] && return 0
  echo "현재 브랜치가 ${current:-detached HEAD}라서 ${BRANCH}로 전환함." >&2
  if git switch "$BRANCH"; then
    # 전환하면 이 파일이 새 브랜치의 내용으로 바뀔 수 있음. zsh가 옛 내용을 이어 읽지 않도록 새로 실행함.
    exec "$SCRIPT" "$@"
  fi
  echo "${BRANCH}로 전환하지 못함. 충돌하는 변경을 커밋하거나 stash한 뒤 다시 실행할 것." >&2
  exit 1
}

# Chromium이 프로필에 거는 SingletonLock(<호스트>-<pid> 심볼릭 링크)의 pid가 살아 있으면 쓰는 중임.
profile_in_use() {
  local holder="$(readlink "$1/SingletonLock" 2>/dev/null)"
  local pid="${holder##*-}"
  [[ "$pid" == <-> ]] && kill -0 "$pid" 2>/dev/null
}

restore_dev_profile() {
  rm -rf "$1"
  [ -n "$2" ] && mv "$2" "$1"
  echo "복사에 실패해 개발 프로필을 되돌림." >&2
}

# 실제 프로필을 개발 프로필로 복사함. 실제 프로필은 읽기만 함. 기존 개발 프로필은 지우지 않고
# 백업 디렉터리로 옮기며, 복사나 DB 검사가 실패하면 그것을 제자리로 되돌림.
sync_profile() {
  local source="$1" target="$2" backups="$3" backup="" item name check
  local excluded=(SingletonLock SingletonCookie SingletonSocket DevToolsActivePort openbot-central-auth-v1.bin)
  [ -d "$source" ] || { echo "실제 프로필이 없음: $source" >&2; return 1; }
  # pgrep은 이 셸에서 설치된 앱을 못 보므로 ps로도 확인함.
  if ps -axo command | grep -q "^/Applications/OpenOwnBot.app/Contents/MacOS/OpenOwnBot" || profile_in_use "$source"; then
    echo "실제 OpenOwnBot이 실행 중임. 먼저 완전히 종료(⌘Q)한 뒤 다시 실행할 것." >&2
    return 1
  fi
  if profile_in_use "$target"; then
    echo "개발 앱이 실행 중임. bun run openownbot-dev stop 으로 종료한 뒤 다시 실행할 것." >&2
    return 1
  fi
  if [ -e "$target" ]; then
    backup="$backups/OpenOwnBot-Dev-before-sync-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$backups" && mv "$target" "$backup" || { echo "기존 개발 프로필을 옮기지 못함." >&2; return 1; }
  fi
  mkdir -p "$target" || { restore_dev_profile "$target" "$backup"; return 1; }
  # 최상위 항목마다 복제 복사(APFS clonefile)함. 디스크를 거의 쓰지 않고, 한쪽이 바뀔 때 갈라짐.
  # 잠금 파일은 가져오지 않음. 로그인 세션도 가져오지 않음: 실제 계정 토큰이 로컬 계정 API로 가면 안 됨.
  for item in "$source"/*(DN); do
    name="${item:t}"
    (( ${excluded[(Ie)$name]} )) && continue
    cp -cR "$item" "$target/" || { restore_dev_profile "$target" "$backup"; return 1; }
  done
  [ -f "$target/openbot.db" ] || { echo "복사본에 openbot.db가 없음." >&2; restore_dev_profile "$target" "$backup"; return 1; }
  check="$(sqlite3 "$target/openbot.db" "PRAGMA quick_check" 2>&1)"
  if [ "$check" != "ok" ]; then
    echo "복사본 DB 검사 결과: $check" >&2
    restore_dev_profile "$target" "$backup"
    return 1
  fi
  echo "복사함: $source -> $target (DB 검사 ok)"
  [ -n "$backup" ] && echo "기존 개발 프로필은 여기로 옮겼음: $backup"
  echo "이어서 실행: bun run openownbot-dev"
}

# 떠 있는 스택을 건드리지 않는 stop과 status, 프로필만 복사하는 sync는 브랜치를 바꾸지 않음.
case "$1" in
  stop|status|sync) ;;
  *) ensure_branch "$@" ;;
esac

case "$1" in
  stop)   exec bun run dev:stop ;;
  status) exec bun run dev:status ;;
  update) git pull --ff-only && bun install --frozen-lockfile || exit 1; shift ;;
  sync)   sync_profile "$REAL_PROFILE" "$DEV_PROFILE" "$HOME/Backups"; exit $? ;;
esac

# 휴대폰 페어링용: QR 속 계정 API 주소.
# Tailscale이 켜져 있으면 tailnet HTTPS를 우선 사용(밖에서도 스캔 가능,
# `tailscale serve --bg --https=8443 http://127.0.0.1:3100`로 :3100 노출 필요).
# 443의 `/`는 다른 앱(T3 Code)이 쓸 수 있어서 8443을 씀. 꺼져 있으면 LAN IP로 폴백.
# 둘 다 미리 지정돼 있으면 그 값을 존중함. dev 기본값(127.0.0.1)은
# 휴대폰에서 자기 자신이 되어 스캔이 실패함.
TS_DNS="$(tailscale status --json 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("Self",{}).get("DNSName","").rstrip("."))' 2>/dev/null)"
if [ -n "$TS_DNS" ] && [ -z "$__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS" ]; then
  export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="$TS_DNS"
fi
if [ -z "$OPENOWNBOT_MOBILE_AUTH_API_URL" ]; then
  if [ -n "$TS_DNS" ]; then
    export OPENOWNBOT_MOBILE_AUTH_API_URL="https://$TS_DNS:8443"
  else
    LAN_IP="$(ipconfig getifaddr en0 2>/dev/null)"
    [ -n "$LAN_IP" ] && export OPENOWNBOT_MOBILE_AUTH_API_URL="http://$LAN_IP:3100"
  fi
fi

# 데이터 경로용: 티켓 속 Signal URL도 휴대폰에서 닿아야 함.
# Tailscale이 켜져 있으면 tailnet wss를 사용(밖에서도 연결 가능,
# `tailscale serve --bg --https=443 --set-path=/v1/signal http://127.0.0.1:3101/v1/signal`
# 마운트 필요). 꺼져 있으면 dev 기본값(LAN ws)을 그대로 둠.
# OPENOWNBOT_REMOTE_SIGNAL_URL은 데스크톱 피어 창의 CSP 허용용으로 같은 값을 둠.
if [ -n "$TS_DNS" ]; then
  if [ -z "$REMOTE_SIGNAL_URL" ]; then
    export REMOTE_SIGNAL_URL="wss://$TS_DNS/v1/signal"
  fi
  if [ -z "$OPENOWNBOT_REMOTE_SIGNAL_URL" ]; then
    export OPENOWNBOT_REMOTE_SIGNAL_URL="$REMOTE_SIGNAL_URL"
  fi
fi

# --force는 떠 있는 스택 옆에 두 번째 스택을 띄우는 옵션이고, 그러면 앱이 워크트리 프로필 대신
# 빈 `OpenOwnBot Dev <포트>` 프로필을 열어 데이터가 초기화된 것처럼 보임. 이 실행기는 먼저 멈추고
# 다시 띄우므로 --force를 넘기지 않음. 스택이 남아 있으면 dev가 오류로 멈춤.
args=()
for arg in "$@"; do
  if [ "$arg" = "--force" ]; then
    echo "--force는 무시함: 빈 개발 프로필이 열리는 것을 막기 위함." >&2
  else
    args+=("$arg")
  fi
done

# 프로세스만 죽이고 레지스트리 기록이 남으면 dev:stop이 실패하고 다음 실행이 막힘.
# stop이 풀지 못한 스택 중 supervisor pid가 이미 죽은 것만 기록에서 지움. 살아 있는 pid는 건드리지 않음.
stop_output="$(bun run dev:stop 2>&1)" || {
  for pid in $(printf '%s\n' "$stop_output" | sed -n 's/.*"supervisorPid": *\([0-9][0-9]*\).*/\1/p'); do
    kill -0 "$pid" 2>/dev/null && continue
    echo "죽은 스택 기록 정리: pid=$pid" >&2
    bun run dev:forget --pid="$pid" >/dev/null 2>&1
  done
}
exec bun run dev "${args[@]}"
