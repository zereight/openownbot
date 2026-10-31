import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/shell";

export const messages = {
  "shell.rail.label": "서버",
  "shell.rail.add": "서버 추가",
  "shell.list.label": "채널과 에이전트",
  "shell.list.channels": "채널",
  "shell.list.agents": "에이전트",
  "shell.list.unread": { other: "읽지 않은 메시지 {count}개" },
  "shell.list.settings": "설정",
  "shell.members.label": "이 채널의 에이전트",
  "shell.members.count": { other: "에이전트 {count}개" },
  "shell.members.hide": "에이전트 숨기기",
  "shell.member.idle": "대기 중",
  "shell.member.working": "작업 중",
  "shell.member.waitingApproval": "승인을 기다려요",
  "shell.member.waitingAnswer": "답변을 기다려요",
  "shell.member.failed": "실패",
  "shell.member.allow": "한 번 허용",
  "shell.member.deny": "거부",
} as const satisfies PartialTranslation<typeof source>;
