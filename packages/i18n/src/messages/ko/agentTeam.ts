import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentTeam";

export const messages = {
  "agentTeam.export.done": "에이전트 {count}개를 {file}에 저장했습니다.",
  "agentTeam.export.masked": "비밀값처럼 보이는 내용을 에이전트 {count}개에서 가렸습니다.",
  "agentTeam.export.failed": "섹션을 내보내지 못했습니다.",
  "agentTeam.import.title": "{name} 가져오기",
  "agentTeam.import.summary": "섹션 {sections}개에 에이전트 {agents}개를 만듭니다.",
  "agentTeam.import.renamed": "이름 {count}개가 이미 있어서 번호를 붙입니다.",
  "agentTeam.import.contents": "스킬 {skills}개와 루틴 {routines}개가 함께 들어 있습니다.",
  "agentTeam.import.safety":
    "스킬은 꺼진 상태로, 루틴은 일시정지 상태로 시작합니다. 이미 있는 에이전트는 바꾸지 않습니다.",
  "agentTeam.import.action": "섹션 가져오기",
  "agentTeam.import.pending": "가져오는 중…",
  "agentTeam.import.done": "에이전트 {count}개를 가져왔습니다.",
  "agentTeam.import.failed": "섹션을 가져오지 못했습니다. 실패 전에 만든 항목은 남아 있습니다.",
  "agentTeam.problem.json": "섹션 파일이 아닙니다. JSON 형식이 올바르지 않습니다.",
  "agentTeam.problem.format": "섹션 파일이 아닙니다.",
  "agentTeam.problem.version": "더 새로운 버전의 파일이라 읽을 수 없습니다.",
  "agentTeam.problem.tooLarge": "파일이 너무 큽니다.",
  "agentTeam.problem.name": "파일에 올바른 이름이 없습니다.",
  "agentTeam.problem.sections": "섹션이 없거나 너무 많습니다.",
  "agentTeam.problem.agents": "에이전트가 너무 많습니다.",
  "agentTeam.problem.sectionName": "섹션 이름이 올바르지 않습니다: {name}",
  "agentTeam.problem.agent": "에이전트 {name}이(가) 제한을 넘습니다.",
  "agentTeam.problem.marketplaceSkill":
    "에이전트 {name}이(가) 마켓플레이스 스킬을 쓰는데, 섹션 파일에는 담을 수 없습니다.",
  "agentTeam.problem.duplicate": "이름이 {name}인 에이전트가 둘 있습니다.",
} as const satisfies PartialTranslation<typeof source>;
