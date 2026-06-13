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
  buildLabel?: string;
};

type TokenResponse = {
  token?: string;
  accessToken?: string;
  livekitUrl?: string;
  serverUrl?: string;
  url?: string;
  room?: string;
  identity?: string;
};

type StoredSettings = {
  liveKitUrl?: string;
  tokenEndpoint?: string;
  roomName?: string;
  identity?: string;
};

type Status = 'idle' | 'testing-token' | 'fetching-token' | 'connecting' | 'connected' | 'error';

const extra = (Constants.expoConfig?.extra ?? {}) as AppExtra;

const initialLiveKitUrl = extra.livekitUrl ?? '';
const initialTokenEndpoint = extra.tokenEndpoint ?? '';
const initialRoom = extra.defaultRoom ?? 'agentcall-demo';
const buildLabel = extra.buildLabel ?? 'dev-local';
const SETTINGS_STORAGE_KEY = 'agentcall.connection-settings.v1';

function randomIdentity(): string {
  return `mobile-${Math.random().toString(36).slice(2, 8)}`;
}

function buildTokenUrl(endpoint: string, room: string, identity: string, dispatchAgent = true): string {
  const url = new URL(endpoint);
  url.searchParams.set('room', room);
  url.searchParams.set('identity', identity);
  if (!dispatchAgent) url.searchParams.set('dispatch', '0');
  return url.toString();
}

function userMessageFromError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isLiveKitUrl(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('wss://') || trimmed.startsWith('ws://');
}

function isHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('https://') || trimmed.startsWith('http://');
}

function parseTokenResponse(body: TokenResponse, fallbackUrl: string) {
  const token = body.token ?? body.accessToken ?? '';
  const liveKitUrl = body.livekitUrl ?? body.serverUrl ?? body.url ?? fallbackUrl;
  return { token, liveKitUrl };
}

function checklistIcon(ok: boolean): string {
  return ok ? '✓' : '•';
}

export default function App() {
  const [liveKitUrl, setLiveKitUrl] = useState(initialLiveKitUrl);
  const [tokenEndpoint, setTokenEndpoint] = useState(initialTokenEndpoint);
  const [roomName, setRoomName] = useState(initialRoom);
  const [identity, setIdentity] = useState(randomIdentity());
  const [manualToken, setManualToken] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeUrl, setActiveUrl] = useState<string>();
  const [activeToken, setActiveToken] = useState<string>();
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('Add your LiveKit URL, token endpoint, and room. Then test or connect.');

  const hasLiveKitUrl = isLiveKitUrl(liveKitUrl);
  const hasTokenEndpoint = isHttpUrl(tokenEndpoint);
  const hasRoom = roomName.trim().length > 0;
  const hasIdentity = identity.trim().length > 0;
  const hasManualToken = manualToken.trim().length > 0;
  const hasTokenSource = hasManualToken || hasTokenEndpoint;

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
    return hasLiveKitUrl && hasTokenSource && hasRoom && hasIdentity;
  }, [hasIdentity, hasLiveKitUrl, hasRoom, hasTokenSource]);

  const connected = status === 'connected' || status === 'connecting';
  const busy = status === 'testing-token' || status === 'fetching-token' || status === 'connecting';

  async function fetchToken(): Promise<{ token: string; liveKitUrl: string }> {
    let token = manualToken.trim();
    let resolvedUrl = liveKitUrl.trim();

    if (!token) {
      if (!hasTokenEndpoint) throw new Error('Add a token endpoint that starts with http:// or https://.');
      const response = await fetch(buildTokenUrl(tokenEndpoint.trim(), roomName.trim(), identity.trim()));
      if (!response.ok) {
        throw new Error(`Token endpoint returned HTTP ${response.status}.`);
      }
      const body = (await response.json()) as TokenResponse;
      const parsed = parseTokenResponse(body, resolvedUrl);
      token = parsed.token;
      resolvedUrl = parsed.liveKitUrl;
    }

    if (!token) throw new Error('Token response did not include token or accessToken.');
    if (!isLiveKitUrl(resolvedUrl)) throw new Error('Missing LiveKit URL. Use wss://your-project.livekit.cloud.');

    return { token, liveKitUrl: resolvedUrl };
  }

  async function testTokenEndpoint() {
    if (!hasTokenEndpoint || !hasRoom || !hasIdentity) {
      setStatus('error');
      setMessage('To test, add a token endpoint, room, and identity.');
      return;
    }

    setStatus('testing-token');
    setMessage('Testing token endpoint…');

    try {
      const response = await fetch(buildTokenUrl(tokenEndpoint.trim(), roomName.trim(), identity.trim(), false));
      if (!response.ok) throw new Error(`Token endpoint returned HTTP ${response.status}.`);
      const body = (await response.json()) as TokenResponse;
      const parsed = parseTokenResponse(body, liveKitUrl.trim());
      if (!parsed.token) throw new Error('Token endpoint responded, but no token/accessToken was present.');
      if (!isLiveKitUrl(parsed.liveKitUrl)) throw new Error('Token endpoint responded, but no valid wss:// LiveKit URL was available.');
      setStatus('idle');
      setMessage(`Token endpoint works for room “${roomName.trim()}”. You can connect now.`);
    } catch (error) {
      setStatus('error');
      setMessage(userMessageFromError(error));
    }
  }

  async function connect() {
    if (!canConnect) {
      setStatus('error');
      setMessage('Finish the setup checklist: LiveKit URL, token source, room, and identity.');
      return;
    }

    setStatus('fetching-token');
    setMessage(hasManualToken ? 'Using pasted short-lived token…' : 'Getting room token…');

    try {
      const result = await fetchToken();
      setActiveToken(result.token);
      setActiveUrl(result.liveKitUrl);
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

  function clearSettings() {
    setLiveKitUrl(initialLiveKitUrl);
    setTokenEndpoint(initialTokenEndpoint);
    setRoomName(initialRoom);
    setIdentity(randomIdentity());
    setManualToken('');
    setActiveToken(undefined);
    setActiveUrl(undefined);
    setStatus('idle');
    setMessage('Settings reset. Paste your connection details to start again.');
    AsyncStorage.removeItem(SETTINGS_STORAGE_KEY).catch(() => undefined);
  }

  function handleRoomDisconnected() {
    setActiveToken(undefined);
    setActiveUrl(undefined);
    setStatus('idle');
    setMessage('Room disconnected.');
  }

  if (activeUrl && activeToken) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <LinearGradient colors={["#050b16", "#0b1730", "#07111f"]} style={styles.gradient}>
          <View style={styles.roomContainer}>
            <View style={styles.roomHeader}>
              <Text style={styles.eyebrow}>AgentCall Room</Text>
              <Text style={styles.roomTitle}>{roomName.trim()}</Text>
              <Text style={styles.roomMeta}>Joined as {identity.trim()}</Text>
            </View>

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
              onDisconnected={handleRoomDisconnected}
              onError={(error) => {
                setStatus('error');
                setMessage(error.message);
              }}
            >
              <View style={styles.roomCard}>
                <Text style={styles.liveDot}>●</Text>
                <Text style={styles.roomStatusTitle}>{status === 'connected' ? 'Voice room live' : 'Joining voice room…'}</Text>
                <Text style={[styles.statusText, status === 'error' ? styles.errorText : undefined]}>{message}</Text>
                <Text style={styles.hint}>Talk naturally. The agent worker is dispatched by your token endpoint and listens in this same LiveKit room.</Text>
              </View>
            </LiveKitRoom>

            <Pressable accessibilityRole="button" onPress={disconnect} style={[styles.primaryButton, styles.disconnectButton, styles.roomDisconnectButton]}>
              <Text style={styles.buttonText}>Leave room</Text>
            </Pressable>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

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
              <Text style={styles.title}>Connect your phone to any LiveKit agent.</Text>
              <Text style={styles.subtitle}>
                Paste three things: LiveKit URL, token endpoint, and room. Your agent worker joins the same room.
              </Text>
            </View>

            <View style={styles.setupCard}>
              <Text style={styles.cardTitle}>Setup checklist</Text>
              <View style={styles.checkRow}>
                <Text style={[styles.checkIcon, hasLiveKitUrl ? styles.checkOk : undefined]}>{checklistIcon(hasLiveKitUrl)}</Text>
                <Text style={styles.checkText}>LiveKit URL starts with wss://</Text>
              </View>
              <View style={styles.checkRow}>
                <Text style={[styles.checkIcon, hasTokenSource ? styles.checkOk : undefined]}>{checklistIcon(hasTokenSource)}</Text>
                <Text style={styles.checkText}>Token endpoint works, or a direct test token is pasted</Text>
              </View>
              <View style={styles.checkRow}>
                <Text style={[styles.checkIcon, hasRoom ? styles.checkOk : undefined]}>{checklistIcon(hasRoom)}</Text>
                <Text style={styles.checkText}>Room matches the agent worker room</Text>
              </View>
              <View style={styles.checkRow}>
                <Text style={[styles.checkIcon, hasIdentity ? styles.checkOk : undefined]}>{checklistIcon(hasIdentity)}</Text>
                <Text style={styles.checkText}>Identity is unique for this phone</Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Connection</Text>

              <FieldHelp label="1. LiveKit URL" help="From LiveKit Cloud or your self-hosted server. Safe to store in the app.">
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!connected}
                  keyboardType="url"
                  onChangeText={setLiveKitUrl}
                  placeholder="wss://your-project.livekit.cloud"
                  placeholderTextColor="#728097"
                  style={[styles.input, liveKitUrl.length > 0 && !hasLiveKitUrl ? styles.inputError : undefined]}
                  value={liveKitUrl}
                />
              </FieldHelp>

              <FieldHelp label="2. Token endpoint" help="Your backend endpoint. It returns a short-lived room token; API secret stays server-side.">
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!connected && !hasManualToken}
                  keyboardType="url"
                  onChangeText={setTokenEndpoint}
                  placeholder="https://your-api.example.com/token"
                  placeholderTextColor="#728097"
                  style={[styles.input, tokenEndpoint.length > 0 && !hasTokenEndpoint ? styles.inputError : undefined]}
                  value={tokenEndpoint}
                />
                <Text style={styles.microcopy}>Called as: /token?room={roomName || '<room>'}&identity={identity || '<identity>'}</Text>
              </FieldHelp>

              <View style={styles.row}>
                <View style={styles.half}>
                  <FieldHelp label="3. Room" help="Phone and agent worker must use the same room.">
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!connected}
                      onChangeText={setRoomName}
                      placeholder="agentcall-demo"
                      placeholderTextColor="#728097"
                      style={styles.input}
                      value={roomName}
                    />
                  </FieldHelp>
                </View>
                <View style={styles.half}>
                  <FieldHelp label="4. Identity" help="A unique name for this phone participant.">
                    <View style={styles.identityRow}>
                      <TextInput
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!connected}
                        onChangeText={setIdentity}
                        placeholder="mobile-user"
                        placeholderTextColor="#728097"
                        style={[styles.input, styles.identityInput]}
                        value={identity}
                      />
                      <Pressable
                        accessibilityRole="button"
                        disabled={connected}
                        onPress={() => setIdentity(randomIdentity())}
                        style={({ pressed }) => [styles.smallButton, connected || pressed ? styles.buttonDim : undefined]}
                      >
                        <Text style={styles.smallButtonText}>↻</Text>
                      </Pressable>
                    </View>
                  </FieldHelp>
                </View>
              </View>

              <Pressable accessibilityRole="button" onPress={() => setShowAdvanced((value) => !value)} style={styles.advancedToggle}>
                <Text style={styles.advancedToggleText}>{showAdvanced ? 'Hide advanced token test' : 'Advanced: paste direct token'}</Text>
              </Pressable>

              {showAdvanced ? (
                <FieldHelp label="Optional direct token" help="For quick tests only. Tokens are not saved on device.">
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!connected}
                    multiline
                    onChangeText={setManualToken}
                    placeholder="Paste a short-lived LiveKit participant token"
                    placeholderTextColor="#728097"
                    style={[styles.input, styles.tokenInput]}
                    value={manualToken}
                  />
                </FieldHelp>
              ) : null}

              <View style={styles.actionRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy || connected || !hasTokenEndpoint || hasManualToken}
                  onPress={testTokenEndpoint}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    (busy || connected || !hasTokenEndpoint || hasManualToken || pressed) ? styles.buttonDim : undefined,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>Test endpoint</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={!canConnect && !connected}
                  onPress={connected ? disconnect : connect}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    connected ? styles.disconnectButton : styles.connectButton,
                    ((!canConnect && !connected) || pressed) ? styles.buttonDim : undefined,
                  ]}
                >
                  <Text style={styles.buttonText}>{connected ? 'Disconnect' : 'Connect voice'}</Text>
                </Pressable>
              </View>

              <Pressable accessibilityRole="button" disabled={connected} onPress={clearSettings} style={styles.clearButton}>
                <Text style={styles.clearButtonText}>Reset saved settings</Text>
              </Pressable>
            </View>

            <View style={styles.statusCard}>
              <View style={styles.statusHeader}>
                <Text style={styles.statusLabel}>Status</Text>
                {busy && <ActivityIndicator color="#7dd3fc" />}
              </View>
              <Text style={[styles.statusText, status === 'error' ? styles.errorText : undefined]}>{message}</Text>
              <Text style={styles.hint}>
                The app publishes microphone audio only. Your LiveKit agent owns STT, fast acknowledgements, TTS,
                interruptions, tools, and session continuity.
              </Text>
              <Text style={styles.buildLabel}>Build: {buildLabel}</Text>
            </View>

            <View style={styles.howItWorksCard}>
              <Text style={styles.cardTitle}>How it connects</Text>
              <Text style={styles.flowText}>Phone → token endpoint → LiveKit room ← agent worker</Text>
              <Text style={styles.hint}>
                If you hear silence after connecting, the phone probably joined successfully but no agent worker is active in that room.
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

function FieldHelp({ children, help, label }: { children: React.ReactNode; help: string; label: string }) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.fieldHelp}>{help}</Text>
      {children}
    </View>
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
  roomContainer: {
    flex: 1,
    gap: 22,
    justifyContent: 'center',
    padding: 24,
  },
  roomHeader: {
    gap: 8,
  },
  roomTitle: {
    color: '#f8fafc',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  roomMeta: {
    color: '#94a3b8',
    fontSize: 15,
    lineHeight: 21,
  },
  roomCard: {
    alignItems: 'center',
    backgroundColor: '#0d1728',
    borderColor: '#0ea5e9',
    borderRadius: 28,
    borderWidth: 1,
    gap: 14,
    padding: 24,
  },
  roomStatusTitle: {
    color: '#e0f2fe',
    fontSize: 22,
    fontWeight: '900',
  },
  roomDisconnectButton: {
    alignSelf: 'stretch',
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
    fontSize: 33,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 38,
  },
  subtitle: {
    color: '#b6c2d2',
    fontSize: 16,
    lineHeight: 23,
  },
  setupCard: {
    backgroundColor: 'rgba(14, 165, 233, 0.10)',
    borderColor: 'rgba(125, 211, 252, 0.32)',
    borderRadius: 24,
    borderWidth: 1,
    gap: 10,
    padding: 18,
  },
  card: {
    backgroundColor: '#101b2d',
    borderColor: '#20304a',
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
  },
  fieldBlock: {
    gap: 7,
  },
  label: {
    color: '#d9e7f7',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
  },
  fieldHelp: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 17,
  },
  microcopy: {
    color: '#64748b',
    fontSize: 11,
    lineHeight: 15,
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
  inputError: {
    borderColor: '#fb7185',
  },
  tokenInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  half: {
    flex: 1,
  },
  identityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  identityInput: {
    flex: 1,
  },
  smallButton: {
    alignItems: 'center',
    backgroundColor: '#17233a',
    borderColor: '#30435f',
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  smallButtonText: {
    color: '#dbeafe',
    fontSize: 20,
    fontWeight: '800',
  },
  advancedToggle: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  advancedToggleText: {
    color: '#7dd3fc',
    fontSize: 13,
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 16,
    flex: 1.1,
    paddingVertical: 15,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#17233a',
    borderColor: '#30435f',
    borderRadius: 16,
    borderWidth: 1,
    flex: 0.9,
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
  secondaryButtonText: {
    color: '#e0f2fe',
    fontSize: 15,
    fontWeight: '800',
  },
  clearButton: {
    alignSelf: 'center',
    paddingVertical: 4,
  },
  clearButtonText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  checkRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  checkIcon: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '900',
    width: 18,
  },
  checkOk: {
    color: '#22c55e',
  },
  checkText: {
    color: '#dbeafe',
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
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
  buildLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  howItWorksCard: {
    backgroundColor: '#08111f',
    borderColor: '#20304a',
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    padding: 18,
  },
  flowText: {
    color: '#e0f2fe',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 22,
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
