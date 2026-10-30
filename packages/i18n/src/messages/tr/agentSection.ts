import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentSection";

export const messages = {
  "agentSection.export.done": "{count} ajan {file} dosyasına kaydedildi.",
  "agentSection.export.masked": "{count} ajanda gizli bilgiye benzeyen değerler gizlendi.",
  "agentSection.export.failed": "Bölümler dışa aktarılamadı.",
  "agentSection.import.title": "{name} içe aktar",
  "agentSection.import.summary": "{sections} bölümde {agents} ajan oluşturulacak.",
  "agentSection.import.renamed": "{count} ad zaten kullanılıyor ve numara alacak.",
  "agentSection.import.contents": "Birlikte {skills} beceri ve {routines} rutin içeriyorlar.",
  "agentSection.import.safety": "Beceriler kapalı, rutinler duraklatılmış olarak başlar. Mevcut ajanlar değiştirilmez.",
  "agentSection.import.action": "Bölümleri içe aktar",
  "agentSection.import.pending": "İçe aktarılıyor…",
  "agentSection.import.done": "{count} ajan içe aktarıldı.",
  "agentSection.import.failed": "Bölümler içe aktarılamadı. Hatadan önce oluşturulanlar kalır.",
  "agentSection.problem.json": "Bu bir bölüm dosyası değil: geçerli bir JSON değil.",
  "agentSection.problem.format": "Bu bir bölüm dosyası değil.",
  "agentSection.problem.version": "Dosya daha yeni bir sürümden ve okunamıyor.",
  "agentSection.problem.tooLarge": "Dosya çok büyük.",
  "agentSection.problem.name": "Dosyanın geçerli bir adı yok.",
  "agentSection.problem.sections": "Dosyada bölüm yok ya da çok fazla.",
  "agentSection.problem.agents": "Dosyada çok fazla ajan var.",
  "agentSection.problem.sectionName": "Bir bölümün geçerli adı yok: {name}",
  "agentSection.problem.agent": "{name} ajanı sınırları aşıyor.",
  "agentSection.problem.marketplaceSkill":
    "{name} ajanı marketplace becerisi kullanıyor; bölüm dosyası bunu taşıyamaz.",
  "agentSection.problem.duplicate": "{name} adında iki ajan var.",
} as const satisfies PartialTranslation<typeof source>;
