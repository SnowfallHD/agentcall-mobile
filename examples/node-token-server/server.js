import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { AccessToken, AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';

const {
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  PORT = '8787',
  TOKEN_TTL_SECONDS = '3600',
  DEFAULT_ROOM = 'agentcall-demo',
  AGENT_NAME = 'hermes-livekit-voice-sidecar',
  CORS_ORIGIN = '*',
} = process.env;

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error('Missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET. Copy .env.example to .env.');
  process.exit(1);
}

const app = express();
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN }));

const livekitHttpUrl = LIVEKIT_URL.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
const dispatchClient = new AgentDispatchClient(livekitHttpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
const roomClient = new RoomServiceClient(livekitHttpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

function clean(input, fallback) {
  const value = String(input ?? '').trim();
  return value.length > 0 ? value : fallback;
}

async function ensureAgentDispatch(room) {
  if (!AGENT_NAME) return null;

  const metadata = JSON.stringify({ source: 'agentcall-token-server' });
  const rooms = await roomClient.listRooms([room]);
  if (rooms.length === 0) {
    await roomClient.createRoom({
      name: room,
      emptyTimeout: 3600,
      departureTimeout: 600,
      agents: [{ agentName: AGENT_NAME, metadata }],
    });
    return { roomCreated: true, agentName: AGENT_NAME };
  }

  const existing = await dispatchClient.listDispatch(room);
  const alreadyDispatched = existing.some((dispatch) => dispatch.agentName === AGENT_NAME);
  if (alreadyDispatched) return null;

  return dispatchClient.createDispatch(room, AGENT_NAME, { metadata });
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
    const shouldDispatch = clean(req.query.dispatch, '1') !== '0';
    const dispatch = shouldDispatch ? await ensureAgentDispatch(room) : null;
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
      agentName: AGENT_NAME || undefined,
      dispatchId: dispatch?.id,
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
