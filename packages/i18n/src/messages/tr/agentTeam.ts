import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentTeam";

export const messages = {
  "agentTeam.export.done": "{count} ajan {file} dosyasına kaydedildi.",
  "agentTeam.export.masked": "{count} ajanda gizli bilgiye benzeyen değerler gizlendi.",
  "agentTeam.export.failed": "Bölümler dışa aktarılamadı.",
  "agentTeam.import.title": "{name} içe aktar",
  "agentTeam.import.summary": "{sections} bölümde {agents} ajan oluşturulacak.",
  "agentTeam.import.renamed": "{count} ad zaten kullanılıyor ve numara alacak.",
  "agentTeam.import.contents": "Birlikte {skills} beceri ve {routines} rutin içeriyorlar.",
  "agentTeam.import.safety": "Beceriler kapalı, rutinler duraklatılmış olarak başlar. Mevcut ajanlar değiştirilmez.",
  "agentTeam.import.action": "Bölümleri içe aktar",
  "agentTeam.import.pending": "İçe aktarılıyor…",
  "agentTeam.import.done": "{count} ajan içe aktarıldı.",
  "agentTeam.import.failed": "Bölümler içe aktarılamadı. Hatadan önce oluşturulanlar kalır.",
  "agentTeam.problem.json": "Bu bir bölüm dosyası değil: geçerli bir JSON değil.",
  "agentTeam.problem.format": "Bu bir bölüm dosyası değil.",
  "agentTeam.problem.version": "Dosya daha yeni bir sürümden ve okunamıyor.",
  "agentTeam.problem.tooLarge": "Dosya çok büyük.",
  "agentTeam.problem.name": "Dosyanın geçerli bir adı yok.",
  "agentTeam.problem.sections": "Dosyada bölüm yok ya da çok fazla.",
  "agentTeam.problem.agents": "Dosyada çok fazla ajan var.",
  "agentTeam.problem.sectionName": "Bir bölümün geçerli adı yok: {name}",
  "agentTeam.problem.agent": "{name} ajanı sınırları aşıyor.",
  "agentTeam.problem.marketplaceSkill": "{name} ajanı marketplace becerisi kullanıyor; bölüm dosyası bunu taşıyamaz.",
  "agentTeam.problem.duplicate": "{name} adında iki ajan var.",
} as const satisfies PartialTranslation<typeof source>;
