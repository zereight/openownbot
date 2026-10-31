import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/error/vault";

export const messages = {
  "error.vault.unavailable": "이 컴퓨터에는 보안 저장소가 없어서 보관함에 항목을 저장할 수 없어요.",
  "error.vault.unreadable": "보관함 파일을 읽을 수 없어요. 다시 사용하려면 보관함을 초기화하세요.",
  "error.vault.tooLarge": "보관함이 가득 찼어요. 항목을 일부 삭제한 뒤 다시 시도하세요.",
  "error.vault.itemMissing": "이 항목은 더 이상 보관함에 없어요.",
  "error.vault.valueTooLong": "값이 너무 길어요.",
  "error.vault.websiteInvalid": "HTTPS 웹사이트 주소를 입력하세요.",
  "error.vault.passwordRequired": "비밀번호를 입력하세요.",
  "error.vault.cardNumberInvalid": "올바른 카드 번호를 입력하세요.",
  "error.vault.securityCodeInvalid": "3자리 또는 4자리 보안 코드를 입력하세요.",
  "error.vault.expiryInvalid": "올바른 만료 월과 연도를 입력하세요.",
  "error.vault.contactEmpty": "이름, 주소, 전화번호, 이메일 주소 중 하나를 입력하세요.",
  "error.vault.contactMissing": "청구지 연락처가 더 이상 보관함에 없어요.",
  "error.vault.csvInvalid": "이 파일은 CSV 형식의 비밀번호 내보내기 파일이 아니에요.",
  "error.vault.csvTooLarge": "CSV 파일이 너무 커요.",
} as const satisfies PartialTranslation<typeof source>;
