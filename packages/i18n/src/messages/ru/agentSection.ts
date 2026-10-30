import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentSection";

export const messages = {
  "agentSection.export.done": "Сохранено агентов: {count}, файл {file}.",
  "agentSection.export.masked": "В агентах ({count}) скрыты значения, похожие на секреты.",
  "agentSection.export.failed": "Не удалось экспортировать разделы.",
  "agentSection.import.title": "Импорт {name}",
  "agentSection.import.summary": "Будет создано агентов: {agents}, разделов: {sections}.",
  "agentSection.import.renamed": "Имён, которые уже заняты: {count}. Им будет добавлен номер.",
  "agentSection.import.contents": "Вместе они содержат навыков: {skills} и рутин: {routines}.",
  "agentSection.import.safety":
    "Навыки запускаются выключенными, а рутины приостановленными. Уже существующие агенты не меняются.",
  "agentSection.import.action": "Импортировать разделы",
  "agentSection.import.pending": "Импорт…",
  "agentSection.import.done": "Импортировано агентов: {count}.",
  "agentSection.import.failed": "Не удалось импортировать разделы. Всё, что создано до сбоя, сохраняется.",
  "agentSection.problem.json": "Это не файл разделов: JSON недействителен.",
  "agentSection.problem.format": "Это не файл разделов.",
  "agentSection.problem.version": "Файл создан в более новой версии и не может быть прочитан.",
  "agentSection.problem.tooLarge": "Файл слишком большой.",
  "agentSection.problem.name": "У файла нет допустимого названия.",
  "agentSection.problem.sections": "В файле нет разделов или их слишком много.",
  "agentSection.problem.agents": "В файле слишком много агентов.",
  "agentSection.problem.sectionName": "У раздела недопустимое название: {name}",
  "agentSection.problem.agent": "Агент {name} превышает ограничения.",
  "agentSection.problem.marketplaceSkill":
    "Агент {name} использует навык из маркетплейса, который не может входить в файл разделов.",
  "agentSection.problem.duplicate": "Двух агентов зовут {name}.",
} as const satisfies PartialTranslation<typeof source>;
