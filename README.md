# AgentCall Mobile

Generic Expo + LiveKit mobile voice client for AI agents.

AgentCall is a small React Native app that lets a phone join a LiveKit room, publish microphone audio, and talk to any agent worker already listening in that room. It is intentionally config-driven: no LiveKit project URL, API key, API secret, or vendor-specific backend is committed.

## What this is

- Expo SDK 56 app
- LiveKit React Native client
- Custom native/EAS build target, not plain Expo Go
- Minimal phone UI for:
  - LiveKit server URL
  - token endpoint
  - room name
  - participant identity
  - optional direct short-lived token for quick tests
- Remembers non-secret connection settings on device between launches

## What this is not

- Not a full agent backend
- Not a token server
- Not tied to one assistant, company, or agent framework
- Not a place to store LiveKit API secrets

## Token endpoint contract

The app calls your token endpoint with query params:

```text
GET /token?room=<room>&identity=<identity>
```

Return JSON:

```json
{
  "token": "<short-lived LiveKit participant token>",
  "livekitUrl": "wss://your-project.livekit.cloud"
}
```

Accepted aliases:

- `token` or `accessToken`
- `livekitUrl`, `serverUrl`, or `url`

The token endpoint should live on your backend so your LiveKit API secret never ships to the phone.

Useful docs in this repo:

- [Connect an agent](docs/connect-agent.md)
- [Node token server example](examples/node-token-server/README.md)

## Configure defaults

Defaults in `app.json` are intentionally blank. You can either paste settings in the app UI or set values before bundling/building:

```bash
export EXPO_PUBLIC_LIVEKIT_URL="wss://your-project.livekit.cloud"
export EXPO_PUBLIC_AGENT_TOKEN_ENDPOINT="https://your-server.example.com/token"
export EXPO_PUBLIC_AGENT_ROOM="agentcall-demo"
```

These env variables are read by `app.config.js` at bundle/build time and used as initial UI defaults. The app still lets users paste or change values at runtime.

## Install dependencies

```bash
npm install
```

## Local development

Because LiveKit uses native WebRTC/audio modules, use a development build rather than plain Expo Go:

```bash
npm install -g eas-cli
eas login
eas build --profile development --platform ios
npx expo start --dev-client
```

Android:

```bash
eas build --profile development --platform android
npx expo start --dev-client
```

## Persistent phone install / no dev server

Use the preview profile. It bundles JS into an installable internal build:

```bash
eas build --profile preview --platform ios
```

Android APK:

```bash
eas build --profile preview --platform android
```

After install, the app opens from the home screen without Expo Go and without a running Metro dev server.

## Verification

```bash
npm run typecheck
npx expo-doctor
```

## Security notes

- Do not commit `.env`, API keys, API secrets, or generated participant tokens.
- A LiveKit URL is not a secret, but this repo keeps even that configurable.
- Prefer short-lived participant tokens from a backend token endpoint.
- Treat direct token paste as a quick local test path only.

## License

MIT
