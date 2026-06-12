import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { AccessToken } from 'livekit-server-sdk';

const {
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  PORT = '8787',
  TOKEN_TTL_SECONDS = '3600',
  DEFAULT_ROOM = 'agentcall-demo',
  CORS_ORIGIN = '*',
} = process.env;

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error('Missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET. Copy .env.example to .env.');
  process.exit(1);
}

const app = express();
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN }));

function clean(input, fallback) {
  const value = String(input ?? '').trim();
  return value.length > 0 ? value : fallback;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, livekitUrl: LIVEKIT_URL });
});

app.get('/token', async (req, res) => {
  try {
    const room = clean(req.query.room, DEFAULT_ROOM);
    const identity = clean(req.query.identity, `mobile-${Math.random().toString(36).slice(2, 8)}`);
    const name = clean(req.query.name, identity);

    const ttlSeconds = Number.parseInt(TOKEN_TTL_SECONDS, 10);
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      name,
      ttl: Number.isFinite(ttlSeconds) ? ttlSeconds : 3600,
    });

    token.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    res.json({
      token: await token.toJwt(),
      livekitUrl: LIVEKIT_URL,
      room,
      identity,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`AgentCall token server listening on http://0.0.0.0:${PORT}`);
  console.log(`Token endpoint: http://localhost:${PORT}/token?room=${DEFAULT_ROOM}&identity=mobile-test`);
});
