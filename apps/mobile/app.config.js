const { existsSync } = require("node:fs");
const { join } = require("node:path");

const { localOnly } = require("../../packages/contracts/src/local-only.json");

// Android notifications come through Firebase Cloud Messaging, which needs the Firebase file of the
// app. The file is optional, so the app builds before the Firebase project exists, and such a build
// gets no notifications on Android. The file has public identifiers only; the account service has the
// key that sends.
const GOOGLE_SERVICES_FILE = "./google-services.json";

// The native update check runs before any JavaScript, so the guard cannot stop it. With the switch
// on, the build uses only the code it was built with.
/** @param {import('expo/config').ExpoConfig} config */
const withUpdatesSwitch = (config) => ({ ...config, updates: { ...config.updates, enabled: !localOnly } });

/** @param {{ config: import('expo/config').ExpoConfig }} context */
module.exports = ({ config }) =>
  withUpdatesSwitch(
    existsSync(join(__dirname, GOOGLE_SERVICES_FILE))
      ? { ...config, android: { ...config.android, googleServicesFile: GOOGLE_SERVICES_FILE } }
      : config,
  );
