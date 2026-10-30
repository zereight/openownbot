import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentSection";

export const messages = {
  "agentSection.export.done": "{count} 件のエージェントを {file} に保存しました。",
  "agentSection.export.masked": "秘密情報に見える値を {count} 件のエージェントで非表示にしました。",
  "agentSection.export.failed": "セクションをエクスポートできませんでした。",
  "agentSection.import.title": "{name} をインポート",
  "agentSection.import.summary": "{sections} 個のセクションに {agents} 件のエージェントを作成します。",
  "agentSection.import.renamed": "{count} 件の名前がすでに使われているため、番号を付けます。",
  "agentSection.import.contents": "合わせてスキル {skills} 件とルーティン {routines} 件が含まれています。",
  "agentSection.import.safety":
    "スキルはオフ、ルーティンは一時停止の状態で始まります。すでにあるエージェントは変更されません。",
  "agentSection.import.action": "セクションをインポート",
  "agentSection.import.pending": "インポート中…",
  "agentSection.import.done": "{count} 件のエージェントをインポートしました。",
  "agentSection.import.failed": "セクションをインポートできませんでした。失敗する前に作成されたものは残ります。",
  "agentSection.problem.json": "セクションファイルではありません。JSON として正しくありません。",
  "agentSection.problem.format": "セクションファイルではありません。",
  "agentSection.problem.version": "新しいバージョンのファイルのため、読み込めません。",
  "agentSection.problem.tooLarge": "ファイルが大きすぎます。",
  "agentSection.problem.name": "ファイルに有効な名前がありません。",
  "agentSection.problem.sections": "セクションがないか、多すぎます。",
  "agentSection.problem.agents": "エージェントが多すぎます。",
  "agentSection.problem.sectionName": "セクション名が正しくありません: {name}",
  "agentSection.problem.agent": "エージェント {name} が上限を超えています。",
  "agentSection.problem.marketplaceSkill":
    "エージェント {name} はマーケットプレイスのスキルを使っており、セクションファイルには含められません。",
  "agentSection.problem.duplicate": "{name} という名前のエージェントが 2 つあります。",
} as const satisfies PartialTranslation<typeof source>;
