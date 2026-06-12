# Agent notes

This project uses Expo SDK 56. Before changing Expo APIs, native config, or EAS behavior, check the versioned docs at https://docs.expo.dev/versions/v56.0.0/.

Keep the app generic and config-driven:

- Do not hardcode a company's LiveKit URL.
- Do not commit LiveKit API keys, API secrets, participant tokens, or `.env` files.
- The mobile client should publish microphone audio and join a room; the agent backend owns STT/TTS/tool execution/session policy.
