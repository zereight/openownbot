import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentSection";

export const messages = {
  "agentSection.export.done": "已将 {count} 个智能体保存到 {file}。",
  "agentSection.export.masked": "已在 {count} 个智能体中隐藏看起来像密钥的内容。",
  "agentSection.export.failed": "无法导出分组。",
  "agentSection.import.title": "导入 {name}",
  "agentSection.import.summary": "将在 {sections} 个分组中创建 {agents} 个智能体。",
  "agentSection.import.renamed": "有 {count} 个名称已被占用，将加上编号。",
  "agentSection.import.contents": "其中共包含 {skills} 个技能和 {routines} 个例行任务。",
  "agentSection.import.safety": "技能默认关闭，例行任务默认暂停。已有的智能体不会被修改。",
  "agentSection.import.action": "导入分组",
  "agentSection.import.pending": "正在导入…",
  "agentSection.import.done": "已导入 {count} 个智能体。",
  "agentSection.import.failed": "无法导入分组。失败之前已创建的内容会保留。",
  "agentSection.problem.json": "这不是分组文件：不是有效的 JSON。",
  "agentSection.problem.format": "这不是分组文件。",
  "agentSection.problem.version": "该文件来自更新的版本，无法读取。",
  "agentSection.problem.tooLarge": "文件过大。",
  "agentSection.problem.name": "文件名称无效。",
  "agentSection.problem.sections": "文件没有分组，或分组过多。",
  "agentSection.problem.agents": "文件中的智能体过多。",
  "agentSection.problem.sectionName": "有分组的名称无效：{name}",
  "agentSection.problem.agent": "智能体 {name} 超出限制。",
  "agentSection.problem.marketplaceSkill": "智能体 {name} 使用了市场技能，分组文件无法包含。",
  "agentSection.problem.duplicate": "有两个智能体都叫 {name}。",
} as const satisfies PartialTranslation<typeof source>;
