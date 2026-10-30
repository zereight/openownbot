import { NOTIFICATION_SOUNDS, type NotificationSound } from "@robot/contracts/notification-relay";
import type { MobileTextKey } from "@robot/i18n/mobile";
import * as Notifications from "expo-notifications";
import { currentText } from "@/shared/lib/text";

/**
 * Android 8 and later play the sound of the notification channel, and a channel keeps its sound.
 * So each sound has a channel, and `OpenOwnBotMessagingService.kt` shows a notification in the channel
 * of the sound that the host sent. Both use these ids.
 */
export function androidChannelId(sound: NotificationSound | null): string {
  return `openownbot.sound.${sound ?? "none"}`;
}

/**
 * The sound files of `NOTIFICATION_SOUND_FILES`, as `with-notification-sounds.js` copies them into
 * the Android resources, which do not accept `-`.
 */
const SOUND_FILES: Readonly<Record<Exclude<NotificationSound, "default">, string>> = {
  openownbot: "openownbot_task.wav",
  warm: "openownbot_warm.wav",
  mech: "openownbot_mech.wav",
  bubble: "openownbot_bubble.wav",
  press: "openownbot_press.wav",
};

const SOUND_LABELS = {
  openownbot: "mobile.settings.notifications.sound.openownbot",
  warm: "mobile.settings.notifications.sound.warm",
  mech: "mobile.settings.notifications.sound.mech",
  bubble: "mobile.settings.notifications.sound.bubble",
  press: "mobile.settings.notifications.sound.press",
  default: "mobile.settings.notifications.sound.defaultAndroid",
} as const satisfies Record<NotificationSound, MobileTextKey>;

/**
 * Creates the channels, or gives them the names of the current app language. Android 13 asks for
 * the notification permission only when the app has a channel.
 */
export async function createAndroidChannels(): Promise<void> {
  const { t } = currentText();
  for (const sound of NOTIFICATION_SOUNDS) {
    await Notifications.setNotificationChannelAsync(androidChannelId(sound), {
      name: t("mobile.settings.notifications.channel", { sound: t(SOUND_LABELS[sound]) }),
      importance: Notifications.AndroidImportance.HIGH,
      // Without a sound, the channel plays the Android notification sound.
      ...(sound === "default" ? {} : { sound: SOUND_FILES[sound] }),
    });
  }
  await Notifications.setNotificationChannelAsync(androidChannelId(null), {
    name: t("mobile.settings.notifications.channelSilent"),
    importance: Notifications.AndroidImportance.HIGH,
    sound: null,
    enableVibrate: false,
  });
}
