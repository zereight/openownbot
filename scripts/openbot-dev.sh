#!/bin/zsh
# OpenBot 개발 빌드 실행기. 전역 Bun(1.3.14)과 분리된 Bun 1.4.2, Node 24를 사용함.
#   openbot-dev.sh          앱 실행 (이미 떠 있으면 먼저 멈추고 다시 띄움)
#   openbot-dev.sh stop     실행 중인 개발 스택 종료
#   openbot-dev.sh status   실행 상태 확인
#   openbot-dev.sh update   git pull + bun install 후 실행
#   openbot-dev.sh real     실제 OpenBot 프로필(~/Library/Application Support/OpenBot)로 실행.
#                           실제 OpenBot.app을 먼저 완전히 종료해야 함. 실제 DB를 직접 수정함.
# stop과 status를 뺀 모든 실행은 zereight 브랜치로 먼저 전환한 뒤 시작함.
# 이 파일이 들어 있는 repo의 루트에서 실행함. ~/dev/openbot-dev.sh 같은 심볼릭 링크로 불러도
# 실제 위치를 따라가므로 repo를 옮겨도 경로를 고칠 필요가 없음.
export BUN_INSTALL="$HOME/.bun-1.4.2"
export PATH="$HOME/.bun-1.4.2/bin:$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
SCRIPT=${0:A}
cd "${SCRIPT:h}/.." || exit 1

REAL_PROFILE="$HOME/Library/Application Support/OpenBot"
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

# 떠 있는 스택을 건드리지 않는 stop과 status는 브랜치를 바꾸지 않음.
case "$1" in
  stop|status) ;;
  *) ensure_branch "$@" ;;
esac

case "$1" in
  stop)   exec bun run dev:stop ;;
  status) exec bun run dev:status ;;
  update) git pull --ff-only && bun install --frozen-lockfile || exit 1; shift ;;
  real)
    # pgrep은 이 셸에서 설치된 앱을 못 보므로 ps로 확인함.
    if ps -axo command | grep -q "^/Applications/OpenBot.app/Contents/MacOS/OpenBot"; then
      echo "실제 OpenBot.app이 실행 중임. 먼저 완전히 종료(⌘Q)한 뒤 다시 실행할 것." >&2
      exit 1
    fi
    # dev-services는 Electron 인자를 못 넘기므로(electron-vite가 ELECTRON_CLI_ARGS를 []로 덮어씀)
    # 앱만 electron-vite로 직접 띄움. 계정 API(localhost:3100)와 Remote API는 뜨지 않음.
    # 그래서 개발용 계정 부트스트랩(OPENBOT_DEV_REMOTE_ROLE=host)은 끔. 켜 두면 시작할 때 계정 API로
    # 로그인 코드를 요청하다 실패해 앱이 종료되고, 실제 프로필의 로그인 계정을 임시 계정으로 바꿀 수 있음.
    bun run dev:stop >/dev/null 2>&1
    unset ELECTRON_RUN_AS_NODE ELECTRON_EXTRA_LAUNCH_ARGS
    export OPENBOT_APP_VARIANT=dev OPENBOT_DEV_PROFILE=app OPENBOT_DEV_REMOTE_ROLE=none
    export OPENBOT_DEV_RENDERER_PORT=5173 OPENBOT_DEV_REMOTE_DEBUGGING_PORT=9333
    exec ./node_modules/.bin/electron-vite dev --watch --outDir out-dev-app \
      --entry out-dev-app/main/index.js -- "--user-data-dir=$REAL_PROFILE" ;;
esac

# 휴대폰 페어링용: QR 속 계정 API 주소.
# Tailscale이 켜져 있으면 tailnet HTTPS를 우선 사용(밖에서도 스캔 가능,
# `tailscale serve --https=443`로 :3100 노출 필요). 꺼져 있으면 LAN IP로 폴백.
# 둘 다 미리 지정돼 있으면 그 값을 존중함. dev 기본값(127.0.0.1)은
# 휴대폰에서 자기 자신이 되어 스캔이 실패함.
TS_DNS="$(tailscale status --json 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("Self",{}).get("DNSName","").rstrip("."))' 2>/dev/null)"
if [ -n "$TS_DNS" ] && [ -z "$__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS" ]; then
  export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="$TS_DNS"
fi
if [ -z "$OPENBOT_MOBILE_AUTH_API_URL" ]; then
  if [ -n "$TS_DNS" ]; then
    export OPENBOT_MOBILE_AUTH_API_URL="https://$TS_DNS"
  else
    LAN_IP="$(ipconfig getifaddr en0 2>/dev/null)"
    [ -n "$LAN_IP" ] && export OPENBOT_MOBILE_AUTH_API_URL="http://$LAN_IP:3100"
  fi
fi

# 데이터 경로용: 티켓 속 Signal URL도 휴대폰에서 닿아야 함.
# Tailscale이 켜져 있으면 tailnet wss를 사용(밖에서도 연결 가능,
# `tailscale serve --bg --https=443 --set-path=/v1/signal http://127.0.0.1:3101/v1/signal`
# 마운트 필요). 꺼져 있으면 dev 기본값(LAN ws)을 그대로 둠.
# OPENBOT_REMOTE_SIGNAL_URL은 데스크톱 피어 창의 CSP 허용용으로 같은 값을 둠.
if [ -n "$TS_DNS" ]; then
  if [ -z "$REMOTE_SIGNAL_URL" ]; then
    export REMOTE_SIGNAL_URL="wss://$TS_DNS/v1/signal"
  fi
  if [ -z "$OPENBOT_REMOTE_SIGNAL_URL" ]; then
    export OPENBOT_REMOTE_SIGNAL_URL="$REMOTE_SIGNAL_URL"
  fi
fi

bun run dev:stop >/dev/null 2>&1
exec bun run dev "$@"
