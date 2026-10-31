import { join, resolve } from "node:path";

import { Effect } from "effect";
import { app } from "electron";
import { runCauseEffect } from "../../backend/effect-boundary";
import { SpeechPreferenceStore } from "../voice/speech-preference-store";
import { VoiceApiKeyStore } from "../voice/voice-api-key-store";
import { openScribeSocket } from "../voice/voice-cloud-stream";
import {
  BARK_PLUS_MODEL_DIRECTORY,
  PARAKEET_MODEL_DIRECTORY,
  SUPERTONIC_MODEL_DIRECTORY,
  WHISPER_TURBO_MODEL_DIRECTORY,
} from "../voice/voice-model-service";
import { VoicePreferenceStore } from "../voice/voice-preference-store";
import { spawnVoiceSpeechHost } from "../voice/voice-speech-host-process";
import { VoiceSpeechService } from "../voice/voice-speech-service";
import { spawnVoiceTranscriptionHost } from "../voice/voice-transcription-host-process";
import { VoiceTranscriptionService } from "../voice/voice-transcription-service";
import type { ApplicationServiceContext } from "./application-service-types";
import type { safeStorageCipher } from "./platform";
import { TEARDOWN_ORDER } from "./teardown-order";

/** Voice transcription and spoken replies. */
export async function startVoice({
  forwardSpeechModelStatus,
  forwardVoiceModelStatus,
  forwardVoiceStreamTranscript,
  secretCipher,
  teardown,
}: {
  forwardSpeechModelStatus: ApplicationServiceContext["forwardSpeechModelStatus"];
  forwardVoiceModelStatus: ApplicationServiceContext["forwardVoiceModelStatus"];
  forwardVoiceStreamTranscript: ApplicationServiceContext["forwardVoiceStreamTranscript"];
  secretCipher: ReturnType<typeof safeStorageCipher>;
  teardown: ApplicationServiceContext["teardown"];
}) {
  const voicePreferences = new VoicePreferenceStore(join(app.getPath("userData"), "voice-preference.json"));
  await runCauseEffect(voicePreferences.load());
  const voiceApiKeys = new VoiceApiKeyStore({
    path: join(app.getPath("userData"), "voice-api-key.json"),
    cipher: secretCipher,
  });
  await runCauseEffect(voiceApiKeys.load());
  const voice = new VoiceTranscriptionService({
    resourcesRoot: app.isPackaged ? join(process.resourcesPath, "voice") : resolve(".openownbot-build/voice"),
    // `voice:prepare` puts Parakeet in `.openownbot-build/voice/model` for development. In development
    // the other models download to `.openownbot-build/voice` when you select them.
    modelDirectories: {
      "parakeet-tdt-0.6b-v3": app.isPackaged
        ? join(app.getPath("userData"), "runtimes", PARAKEET_MODEL_DIRECTORY)
        : resolve(".openownbot-build/voice/model"),
      "bark-3.0-plus": app.isPackaged
        ? join(app.getPath("userData"), "runtimes", BARK_PLUS_MODEL_DIRECTORY)
        : resolve(".openownbot-build/voice", BARK_PLUS_MODEL_DIRECTORY),
      "whisper-turbo": app.isPackaged
        ? join(app.getPath("userData"), "runtimes", WHISPER_TURBO_MODEL_DIRECTORY)
        : resolve(".openownbot-build/voice", WHISPER_TURBO_MODEL_DIRECTORY),
    },
    preferences: voicePreferences,
    apiKeys: voiceApiKeys,
    spawnHost: spawnVoiceTranscriptionHost,
    openStreamSocket: openScribeSocket,
  });
  teardown.push(TEARDOWN_ORDER.voice, "voice transcription", () => Effect.runPromise(voice.shutdown()));
  voice.on("modelStatus", forwardVoiceModelStatus);
  voice.on("streamTranscript", forwardVoiceStreamTranscript);
  const speechPreferences = new SpeechPreferenceStore(join(app.getPath("userData"), "speech-preference.json"));
  await runCauseEffect(speechPreferences.load());
  const speech = new VoiceSpeechService({
    resourcesRoot: app.isPackaged ? join(process.resourcesPath, "voice") : resolve(".openownbot-build/voice"),
    modelDirectory: app.isPackaged
      ? join(app.getPath("userData"), "runtimes", SUPERTONIC_MODEL_DIRECTORY)
      : resolve(".openownbot-build/voice", SUPERTONIC_MODEL_DIRECTORY),
    preferences: speechPreferences,
    spawnHost: spawnVoiceSpeechHost,
  });
  teardown.push(TEARDOWN_ORDER.speech, "speech", () => Effect.runPromise(speech.shutdown()));
  speech.on("modelStatus", forwardSpeechModelStatus);
  return { speech, voice };
}
