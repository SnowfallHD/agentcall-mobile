# Connect an agent

AgentCall Mobile is only the phone/media frontend. To make it talk to an AI agent, you need three pieces pointed at the same LiveKit project and room:

```text
AgentCall phone app ──WebRTC──► LiveKit room ◄──WebRTC── LiveKit agent worker
        │                                  ▲
        └──── GET /token?room&identity ────┘
                    token server
```

## Required pieces

1. **LiveKit server/project**
   - Cloud or self-hosted.
   - You need the public WebSocket URL: `wss://...`.
   - You need API key + secret only on the server/agent side.

2. **Token server**
   - Returns short-lived participant tokens for the phone.
   - Example: `examples/node-token-server`.
   - The app expects:

   ```text
   GET /token?room=<room>&identity=<identity>
   ```

   returning:

   ```json
   {
     "token": "<livekit participant jwt>",
     "livekitUrl": "wss://your-project.livekit.cloud"
   }
   ```

3. **Agent worker**
   - Joins or is dispatched into the same room.
   - Listens to the user's microphone track.
   - Runs STT/LLM/TTS or a realtime model.
   - Publishes audio back into the room.

## App fields

In AgentCall Mobile:

| Field | Value |
| --- | --- |
| LiveKit URL | `wss://your-project.livekit.cloud` or your self-hosted `wss://` URL |
| Token endpoint | `https://your-token-server.example.com/token` |
| Room | Any room name your agent will join, e.g. `agentcall-demo` |
| Identity | Any participant id, e.g. `coop-phone` or `mobile-user` |
| Optional direct token | Leave blank unless testing with a manually generated short-lived token |

## Minimal local smoke test

Start the token server:

```bash
cd examples/node-token-server
npm install
cp .env.example .env
# edit .env with LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
npm start
```

On the same machine:

```bash
curl 'http://localhost:8787/token?room=agentcall-demo&identity=mobile-test'
```

On a phone, `localhost` means the phone itself, not your laptop/server. Use one of these:

- same Wi-Fi LAN IP: `http://192.168.x.x:8787/token`
- Tailscale address: `http://100.x.x.x:8787/token`
- HTTPS tunnel: `https://your-tunnel.example.com/token`
- hosted endpoint: `https://your-api.example.com/token`

## Agent worker requirement

The phone joining the room is not enough. Something must be in the same LiveKit room producing assistant audio.

For a generic LiveKit Agents worker, configure it with the same:

```bash
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

Then run/deploy the worker. Depending on your LiveKit setup, the worker either:

- automatically receives jobs when a room/participant appears, or
- explicitly connects to a named room, or
- is launched by your backend when a session starts.

The important invariant is simple:

> Phone token room name == agent worker room name.

## Recommended voice-agent behavior

For natural phone calls, the agent should separate fast voice UX from deep work:

- speak an immediate real acknowledgement after final transcript
- start deeper tool/agent work asynchronously
- give sparse spoken progress updates
- support barge-in/interruption by stopping TTS quickly
- keep durable artifacts/logs outside the phone call UI

Bad:

> Wait silently for tools, then read a long markdown answer.

Good:

> “Yeah, that makes sense. I’m going to check the repo state and I’ll keep this short while I work.”
