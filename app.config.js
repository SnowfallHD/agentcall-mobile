module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra ?? {}),
    livekitUrl: process.env.EXPO_PUBLIC_LIVEKIT_URL ?? config.extra?.livekitUrl ?? '',
    tokenEndpoint: process.env.EXPO_PUBLIC_AGENT_TOKEN_ENDPOINT ?? config.extra?.tokenEndpoint ?? '',
    defaultRoom: process.env.EXPO_PUBLIC_AGENT_ROOM ?? config.extra?.defaultRoom ?? 'agentcall-demo',
  },
});
