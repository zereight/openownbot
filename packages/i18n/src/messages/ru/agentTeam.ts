import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentTeam";

export const messages = {
  "agentTeam.export.done": "Сохранено агентов: {count}, файл {file}.",
  "agentTeam.export.masked": "В агентах ({count}) скрыты значения, похожие на секреты.",
  "agentTeam.export.failed": "Не удалось экспортировать разделы.",
  "agentTeam.import.title": "Импорт {name}",
  "agentTeam.import.summary": "Будет создано агентов: {agents}, разделов: {sections}.",
  "agentTeam.import.renamed": "Имён, которые уже заняты: {count}. Им будет добавлен номер.",
  "agentTeam.import.contents": "Вместе они содержат навыков: {skills} и рутин: {routines}.",
  "agentTeam.import.safety":
    "Навыки запускаются выключенными, а рутины приостановленными. Уже существующие агенты не меняются.",
  "agentTeam.import.action": "Импортировать разделы",
  "agentTeam.import.pending": "Импорт…",
  "agentTeam.import.done": "Импортировано агентов: {count}.",
  "agentTeam.import.failed": "Не удалось импортировать разделы. Всё, что создано до сбоя, сохраняется.",
  "agentTeam.problem.json": "Это не файл разделов: JSON недействителен.",
  "agentTeam.problem.format": "Это не файл разделов.",
  "agentTeam.problem.version": "Файл создан в более новой версии и не может быть прочитан.",
  "agentTeam.problem.tooLarge": "Файл слишком большой.",
  "agentTeam.problem.name": "У файла нет допустимого названия.",
  "agentTeam.problem.sections": "В файле нет разделов или их слишком много.",
  "agentTeam.problem.agents": "В файле слишком много агентов.",
  "agentTeam.problem.sectionName": "У раздела недопустимое название: {name}",
  "agentTeam.problem.agent": "Агент {name} превышает ограничения.",
  "agentTeam.problem.marketplaceSkill":
    "Агент {name} использует навык из маркетплейса, который не может входить в файл разделов.",
  "agentTeam.problem.duplicate": "Двух агентов зовут {name}.",
} as const satisfies PartialTranslation<typeof source>;
