import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentTeam";

export const messages = {
  "agentTeam.export.done": "已将 {count} 个智能体保存到 {file}。",
  "agentTeam.export.masked": "已在 {count} 个智能体中隐藏看起来像密钥的内容。",
  "agentTeam.export.failed": "无法导出分组。",
  "agentTeam.import.title": "导入 {name}",
  "agentTeam.import.summary": "将在 {sections} 个分组中创建 {agents} 个智能体。",
  "agentTeam.import.renamed": "有 {count} 个名称已被占用，将加上编号。",
  "agentTeam.import.contents": "其中共包含 {skills} 个技能和 {routines} 个例行任务。",
  "agentTeam.import.safety": "技能默认关闭，例行任务默认暂停。已有的智能体不会被修改。",
  "agentTeam.import.action": "导入分组",
  "agentTeam.import.pending": "正在导入…",
  "agentTeam.import.done": "已导入 {count} 个智能体。",
  "agentTeam.import.failed": "无法导入分组。失败之前已创建的内容会保留。",
  "agentTeam.problem.json": "这不是分组文件：不是有效的 JSON。",
  "agentTeam.problem.format": "这不是分组文件。",
  "agentTeam.problem.version": "该文件来自更新的版本，无法读取。",
  "agentTeam.problem.tooLarge": "文件过大。",
  "agentTeam.problem.name": "文件名称无效。",
  "agentTeam.problem.sections": "文件没有分组，或分组过多。",
  "agentTeam.problem.agents": "文件中的智能体过多。",
  "agentTeam.problem.sectionName": "有分组的名称无效：{name}",
  "agentTeam.problem.agent": "智能体 {name} 超出限制。",
  "agentTeam.problem.marketplaceSkill": "智能体 {name} 使用了市场技能，分组文件无法包含。",
  "agentTeam.problem.duplicate": "有两个智能体都叫 {name}。",
} as const satisfies PartialTranslation<typeof source>;
