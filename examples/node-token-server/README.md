# Node token server example

Minimal backend endpoint for AgentCall Mobile.

The mobile app must never contain your LiveKit API secret. This server owns the API key/secret and returns short-lived participant tokens to the phone.

## Setup

```bash
cd examples/node-token-server
npm install
cp .env.example .env
```

Edit `.env`:

```bash
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
PORT=8787
DEFAULT_ROOM=agentcall-demo
```

Run it:

```bash
npm start
```

Verify:

```bash
curl 'http://localhost:8787/health'
curl 'http://localhost:8787/token?room=agentcall-demo&identity=mobile-test'
```

The `/token` response is shaped for AgentCall:

```json
{
  "token": "<jwt>",
  "livekitUrl": "wss://your-project.livekit.cloud",
  "room": "agentcall-demo",
  "identity": "mobile-test"
}
```

## Phone access

If the phone is on the same Wi-Fi as your dev machine, use your machine's LAN IP as the token endpoint:

```text
http://192.168.1.23:8787/token
```

For remote testing, put this behind HTTPS with Cloudflare Tunnel, Tailscale Funnel, Fly.io, Render, Railway, or your own host.

## Security

- Do not commit `.env`.
- Keep `LIVEKIT_API_SECRET` server-side.
- Issue short-lived participant tokens.
- Restrict CORS/auth before exposing this publicly.
