import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { LiveKitRoom } from '@livekit/react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type AppExtra = {
  livekitUrl?: string;
  tokenEndpoint?: string;
  defaultRoom?: string;
};

type TokenResponse = {
  token?: string;
  accessToken?: string;
  livekitUrl?: string;
  serverUrl?: string;
  url?: string;
  room?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as AppExtra;

const initialLiveKitUrl = extra.livekitUrl ?? '';
const initialTokenEndpoint = extra.tokenEndpoint ?? '';
const initialRoom = extra.defaultRoom ?? 'agentcall-demo';
const SETTINGS_STORAGE_KEY = 'agentcall.connection-settings.v1';

type StoredSettings = {
  liveKitUrl?: string;
  tokenEndpoint?: string;
  roomName?: string;
  identity?: string;
};

function buildTokenUrl(endpoint: string, room: string, identity: string): string {
  const url = new URL(endpoint);
  url.searchParams.set('room', room);
  url.searchParams.set('identity', identity);
  return url.toString();
}

function userMessageFromError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export default function App() {
  const [liveKitUrl, setLiveKitUrl] = useState(initialLiveKitUrl);
  const [tokenEndpoint, setTokenEndpoint] = useState(initialTokenEndpoint);
  const [roomName, setRoomName] = useState(initialRoom);
  const [identity, setIdentity] = useState(`mobile-${Math.random().toString(36).slice(2, 8)}`);
  const [manualToken, setManualToken] = useState('');
  const [activeUrl, setActiveUrl] = useState<string>();
  const [activeToken, setActiveToken] = useState<string>();
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [status, setStatus] = useState<'idle' | 'fetching-token' | 'connecting' | 'connected' | 'error'>('idle');
  const [message, setMessage] = useState('Paste a LiveKit URL and token endpoint, then connect.');

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem(SETTINGS_STORAGE_KEY)
      .then((raw) => {
        if (!mounted || !raw) return;
        const settings = JSON.parse(raw) as StoredSettings;
        if (settings.liveKitUrl) setLiveKitUrl(settings.liveKitUrl);
        if (settings.tokenEndpoint) setTokenEndpoint(settings.tokenEndpoint);
        if (settings.roomName) setRoomName(settings.roomName);
        if (settings.identity) setIdentity(settings.identity);
      })
      .catch(() => {
        // Settings are convenience only; connection should still work if storage fails.
      })
      .finally(() => {
        if (mounted) setSettingsLoaded(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;

    const settings: StoredSettings = {
      liveKitUrl,
      tokenEndpoint,
      roomName,
      identity,
    };

    AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings)).catch(() => {
      // Non-fatal: users can still paste settings next launch.
    });
  }, [identity, liveKitUrl, roomName, settingsLoaded, tokenEndpoint]);

  const canConnect = useMemo(() => {
    const hasUrl = liveKitUrl.trim().startsWith('wss://') || liveKitUrl.trim().startsWith('ws://');
    const hasTokenSource = manualToken.trim().length > 0 || tokenEndpoint.trim().startsWith('http');
    return hasUrl && hasTokenSource && roomName.trim().length > 0 && identity.trim().length > 0;
  }, [identity, liveKitUrl, manualToken, roomName, tokenEndpoint]);

  async function connect() {
    if (!canConnect) {
      setStatus('error');
      setMessage('Add a wss:// LiveKit URL plus either a token endpoint or a pasted token.');
      return;
    }

    setStatus('fetching-token');
    setMessage('Getting room token…');

    try {
      let token = manualToken.trim();
      let resolvedUrl = liveKitUrl.trim();

      if (!token) {
        const response = await fetch(buildTokenUrl(tokenEndpoint.trim(), roomName.trim(), identity.trim()));
        if (!response.ok) {
          throw new Error(`Token endpoint returned ${response.status}`);
        }
        const body = (await response.json()) as TokenResponse;
        token = body.token ?? body.accessToken ?? '';
        resolvedUrl = body.livekitUrl ?? body.serverUrl ?? body.url ?? resolvedUrl;
      }

      if (!token) throw new Error('Token response did not include token or accessToken.');
      if (!resolvedUrl) throw new Error('Missing LiveKit server URL.');

      setActiveToken(token);
      setActiveUrl(resolvedUrl);
      setStatus('connecting');
      setMessage(`Joining ${roomName.trim()} as ${identity.trim()}…`);
    } catch (error) {
      setActiveToken(undefined);
      setActiveUrl(undefined);
      setStatus('error');
      setMessage(userMessageFromError(error));
    }
  }

  function disconnect() {
    setActiveToken(undefined);
    setActiveUrl(undefined);
    setStatus('idle');
    setMessage('Disconnected.');
  }

  const connected = status === 'connected' || status === 'connecting';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <LinearGradient colors={["#050b16", "#0b1730", "#07111f"]} style={styles.gradient}>
        <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <View style={styles.hero}>
              <View style={styles.logoRow}>
                <View style={styles.logoMark}>
                  <Text style={styles.logoGlyph}>⌁</Text>
                </View>
                <Text style={styles.eyebrow}>AgentCall Mobile</Text>
              </View>
              <Text style={styles.title}>A polished phone line for your AI agent.</Text>
              <Text style={styles.subtitle}>
                Generic Expo + LiveKit starter. Bring your own token endpoint, agent worker, and room policy.
              </Text>
            </View>

          <View style={styles.card}>
            <Text style={styles.label}>LiveKit URL</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              editable={!connected}
              onChangeText={setLiveKitUrl}
              placeholder="wss://your-project.livekit.cloud"
              placeholderTextColor="#728097"
              style={styles.input}
              value={liveKitUrl}
            />

            <Text style={styles.label}>Token endpoint</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              editable={!connected && manualToken.length === 0}
              onChangeText={setTokenEndpoint}
              placeholder="https://your-server.example.com/token"
              placeholderTextColor="#728097"
              style={styles.input}
              value={tokenEndpoint}
            />

            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>Room</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!connected}
                  onChangeText={setRoomName}
                  placeholder="agent-room"
                  placeholderTextColor="#728097"
                  style={styles.input}
                  value={roomName}
                />
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>Identity</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!connected}
                  onChangeText={setIdentity}
                  placeholder="mobile-user"
                  placeholderTextColor="#728097"
                  style={styles.input}
                  value={identity}
                />
              </View>
            </View>

            <Text style={styles.label}>Optional direct token</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              editable={!connected}
              multiline
              onChangeText={setManualToken}
              placeholder="Paste a short-lived LiveKit token for quick tests"
              placeholderTextColor="#728097"
              style={[styles.input, styles.tokenInput]}
              value={manualToken}
            />

            <Pressable
              accessibilityRole="button"
              disabled={!canConnect && !connected}
              onPress={connected ? disconnect : connect}
              style={({ pressed }) => [
                styles.button,
                connected ? styles.disconnectButton : styles.connectButton,
                (!canConnect && !connected) || pressed ? styles.buttonDim : undefined,
              ]}
            >
              <Text style={styles.buttonText}>{connected ? 'Disconnect' : 'Connect voice'}</Text>
            </Pressable>
          </View>

          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <Text style={styles.statusLabel}>Status</Text>
              {(status === 'fetching-token' || status === 'connecting') && <ActivityIndicator color="#7dd3fc" />}
            </View>
            <Text style={[styles.statusText, status === 'error' ? styles.errorText : undefined]}>{message}</Text>
            <Text style={styles.hint}>
              The app publishes microphone audio only. The LiveKit agent in the room owns STT, fast acks, TTS,
              interruptions, tools, and session continuity.
            </Text>
          </View>

          {activeUrl && activeToken ? (
            <LiveKitRoom
              audio
              video={false}
              connect
              serverUrl={activeUrl}
              token={activeToken}
              onConnected={() => {
                setStatus('connected');
                setMessage(`Connected to ${roomName.trim()}. Start talking.`);
              }}
              onDisconnected={() => {
                setStatus('idle');
                setMessage('Room disconnected.');
              }}
              onError={(error) => {
                setStatus('error');
                setMessage(error.message);
              }}
            >
              <View style={styles.livePanel}>
                <Text style={styles.liveDot}>●</Text>
                <Text style={styles.liveText}>LiveKit room active</Text>
              </View>
            </LiveKitRoom>
          ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050b16',
  },
  gradient: {
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  container: {
    padding: 22,
    paddingBottom: 48,
    gap: 18,
  },
  hero: {
    gap: 10,
    paddingTop: 16,
  },
  logoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  logoMark: {
    alignItems: 'center',
    backgroundColor: '#0ea5e9',
    borderRadius: 14,
    height: 36,
    justifyContent: 'center',
    shadowColor: '#38bdf8',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    width: 36,
  },
  logoGlyph: {
    color: '#ffffff',
    fontSize: 25,
    fontWeight: '900',
    lineHeight: 29,
  },
  eyebrow: {
    color: '#7dd3fc',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: '#f8fafc',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 39,
  },
  subtitle: {
    color: '#b6c2d2',
    fontSize: 16,
    lineHeight: 23,
  },
  card: {
    backgroundColor: '#101b2d',
    borderColor: '#20304a',
    borderRadius: 24,
    borderWidth: 1,
    gap: 10,
    padding: 18,
  },
  label: {
    color: '#d9e7f7',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  input: {
    backgroundColor: '#08111f',
    borderColor: '#263853',
    borderRadius: 14,
    borderWidth: 1,
    color: '#f8fafc',
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  tokenInput: {
    minHeight: 78,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  half: {
    flex: 1,
    gap: 10,
  },
  button: {
    alignItems: 'center',
    borderRadius: 16,
    marginTop: 8,
    paddingVertical: 15,
  },
  connectButton: {
    backgroundColor: '#0284c7',
  },
  disconnectButton: {
    backgroundColor: '#be123c',
  },
  buttonDim: {
    opacity: 0.62,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  statusCard: {
    backgroundColor: '#0d1728',
    borderColor: '#20304a',
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    padding: 18,
  },
  statusHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusLabel: {
    color: '#7dd3fc',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  statusText: {
    color: '#f8fafc',
    fontSize: 16,
    lineHeight: 23,
  },
  errorText: {
    color: '#fecdd3',
  },
  hint: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 19,
  },
  livePanel: {
    alignItems: 'center',
    backgroundColor: '#082f49',
    borderColor: '#0ea5e9',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    padding: 14,
  },
  liveDot: {
    color: '#22c55e',
    fontSize: 18,
  },
  liveText: {
    color: '#e0f2fe',
    fontSize: 15,
    fontWeight: '700',
  },
});
