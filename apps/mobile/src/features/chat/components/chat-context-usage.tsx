import { AGENT_CONTEXT_CATEGORIES, type AgentContextCategory, type AgentContextState } from "@robot/contracts/ipc";
import { Typography } from "heroui-native";
import { Alert, Pressable, View } from "react-native";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";
import { typeScale } from "@/shared/lib/type-scale";

/** The label of each part of the context, named here so the catalog check finds each key. */
const CATEGORY_KEYS = {
  systemPrompt: "mobile.chat.context.category.systemPrompt",
  memoryFiles: "mobile.chat.context.category.memoryFiles",
  tools: "mobile.chat.context.category.tools",
  skills: "mobile.chat.context.category.skills",
  toolResults: "mobile.chat.context.category.toolResults",
  messages: "mobile.chat.context.category.messages",
  other: "mobile.chat.context.category.other",
} as const satisfies Record<AgentContextCategory, string>;

/** The share of the window that is used, from 0 to 1. */
function usedShare(usedTokens: number, windowTokens: number): number {
  return windowTokens > 0 ? Math.min(1, Math.max(0, usedTokens / windowTokens)) : 0;
}

/**
 * How full the context window of the chat is, as on the desktop composer. Below half the window it
 * stays out of the way; from there it shows the share, and a tap lists the tokens and what fills them.
 */
export function ChatContextUsage({ state }: { state: AgentContextState | undefined }) {
  const { t, format } = useText();
  const usage = state?.usage;
  if (!state || !usage) return null;
  const compacting = state.compaction?.status === "running";
  const share = usedShare(usage.usedTokens, usage.windowTokens);
  if (!compacting && share < 0.5) return null;
  const percent = format.percent(share, { maximumFractionDigits: 0 });
  const label = compacting
    ? t("mobile.chat.context.labelCompacting")
    : t(usage.estimated ? "mobile.chat.context.labelEstimated" : "mobile.chat.context.label", { percent });
  // Warn 10 points before the compaction point, and mark a thread that nothing compacts when it is nearly full.
  const warning = share >= (usage.autoCompactAt ?? 0.9) - 0.1;
  const open = () => {
    void haptics.selection();
    const rows = AGENT_CONTEXT_CATEGORIES.flatMap((category) => {
      const tokens = usage.categories?.find((row) => row.category === category)?.tokens ?? 0;
      return tokens > 0 ? [`${t(CATEGORY_KEYS[category])}: ${format.number(tokens)}`] : [];
    });
    const compaction = state.compaction;
    const lines = [
      t(usage.estimated ? "mobile.chat.context.tokensEstimated" : "mobile.chat.context.tokens", {
        used: format.number(usage.usedTokens),
        total: format.number(usage.windowTokens),
      }),
      usage.nativeManaged
        ? t("mobile.chat.context.nativeAuto")
        : usage.autoCompactAt === null
          ? t("mobile.chat.context.noAuto")
          : t("mobile.chat.context.autoAt", {
              percent: format.percent(usage.autoCompactAt, { maximumFractionDigits: 0 }),
            }),
      ...(compaction?.status === "completed" &&
      compaction.beforeTokens !== undefined &&
      compaction.afterTokens !== undefined
        ? [
            t("mobile.chat.context.lastCompaction", {
              before: format.number(compaction.beforeTokens),
              after: format.number(compaction.afterTokens),
            }),
          ]
        : []),
      ...(rows.length > 0 ? ["", t("mobile.chat.context.breakdown"), ...rows] : []),
    ];
    Alert.alert(t("mobile.chat.context.title"), lines.join("\n"));
  };
  return (
    <View className="items-end px-4 pb-1">
      <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={open}>
        <Typography.Paragraph className={warning ? "text-warning-text" : "text-text-secondary"} style={typeScale.small}>
          {label}
        </Typography.Paragraph>
      </Pressable>
    </View>
  );
}
