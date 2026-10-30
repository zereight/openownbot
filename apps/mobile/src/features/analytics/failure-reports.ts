import type { FailureProperties } from "@robot/telemetry";
import { errorReference } from "@robot/user-errors";
import { Alert, type AlertButton } from "react-native";
import { currentText } from "@/shared/lib/text";

/**
 * Classify the original failure before the native alert receives its display text. When the failure
 * has a code, the alert shows the code under the message and adds a button that copies it.
 */
export function showFailureAlert(
  error: unknown,
  _operation: FailureProperties["operation"],
  ...args: Parameters<typeof Alert.alert>
): void {
  const reference = errorReference(error);
  if (!reference) {
    Alert.alert(...args);
    return;
  }
  const [title, message, buttons, options] = args;
  const { t } = currentText();
  const code = t("error.reference.label", { code: reference });
  // An alert with a button list shows only those buttons, so a plain alert keeps a close button.
  const kept: AlertButton[] = buttons?.length ? buttons : [{ text: t("common.close"), style: "cancel" }];
  // Android shows at most three buttons. The code stays in the message when no button is free.
  const copy: AlertButton[] =
    kept.length < 3
      ? [
          {
            text: t("error.reference.copy"),
            // The code is also in the message, so a failed copy needs no second alert.
            onPress: () =>
              void import("expo-clipboard").then((clipboard) => clipboard.setStringAsync(reference)).catch(() => false),
          },
        ]
      : [];
  Alert.alert(title, message ? `${message}\n\n${code}` : code, [...kept, ...copy], options);
}

export function showWarningAlert(
  _operation: FailureProperties["operation"],
  ...args: Parameters<typeof Alert.alert>
): void {
  Alert.alert(...args);
}
