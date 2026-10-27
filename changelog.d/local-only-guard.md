### Changed

- The app sends no request to a service that OpenBot runs. App updates, analytics, failure reports
  and the provider blocklist are off, and the app refuses any other request to an OpenBot address.
  Set `localOnly` to `false` in `packages/contracts/src/local-only.json` and rebuild to turn the
  requests back on.
