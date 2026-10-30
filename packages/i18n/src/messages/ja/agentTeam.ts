import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentTeam";

export const messages = {
  "agentTeam.export.done": "{count} 件のエージェントを {file} に保存しました。",
  "agentTeam.export.masked": "秘密情報に見える値を {count} 件のエージェントで非表示にしました。",
  "agentTeam.export.failed": "セクションをエクスポートできませんでした。",
  "agentTeam.import.title": "{name} をインポート",
  "agentTeam.import.summary": "{sections} 個のセクションに {agents} 件のエージェントを作成します。",
  "agentTeam.import.renamed": "{count} 件の名前がすでに使われているため、番号を付けます。",
  "agentTeam.import.contents": "合わせてスキル {skills} 件とルーティン {routines} 件が含まれています。",
  "agentTeam.import.safety":
    "スキルはオフ、ルーティンは一時停止の状態で始まります。すでにあるエージェントは変更されません。",
  "agentTeam.import.action": "セクションをインポート",
  "agentTeam.import.pending": "インポート中…",
  "agentTeam.import.done": "{count} 件のエージェントをインポートしました。",
  "agentTeam.import.failed": "セクションをインポートできませんでした。失敗する前に作成されたものは残ります。",
  "agentTeam.problem.json": "セクションファイルではありません。JSON として正しくありません。",
  "agentTeam.problem.format": "セクションファイルではありません。",
  "agentTeam.problem.version": "新しいバージョンのファイルのため、読み込めません。",
  "agentTeam.problem.tooLarge": "ファイルが大きすぎます。",
  "agentTeam.problem.name": "ファイルに有効な名前がありません。",
  "agentTeam.problem.sections": "セクションがないか、多すぎます。",
  "agentTeam.problem.agents": "エージェントが多すぎます。",
  "agentTeam.problem.sectionName": "セクション名が正しくありません: {name}",
  "agentTeam.problem.agent": "エージェント {name} が上限を超えています。",
  "agentTeam.problem.marketplaceSkill":
    "エージェント {name} はマーケットプレイスのスキルを使っており、セクションファイルには含められません。",
  "agentTeam.problem.duplicate": "{name} という名前のエージェントが 2 つあります。",
} as const satisfies PartialTranslation<typeof source>;
