const allowInsecureLocalHttp = process.env.AGENTCALL_ALLOW_INSECURE_LOCAL_HTTP === '1';

module.exports = ({ config }) => {
  const ios = config.ios ?? {};
  const infoPlist = ios.infoPlist ?? {};
  const ats = infoPlist.NSAppTransportSecurity ?? {};

  return {
    ...config,
    ios: {
      ...ios,
      infoPlist: {
        ...infoPlist,
        NSLocalNetworkUsageDescription:
          infoPlist.NSLocalNetworkUsageDescription ??
          'AgentCall connects to your private Tailnet or LAN token server.',
        NSAppTransportSecurity: {
          ...ats,
          NSAllowsLocalNetworking: true,
          ...(allowInsecureLocalHttp ? { NSAllowsArbitraryLoads: true } : {}),
        },
      },
    },
    extra: {
      ...(config.extra ?? {}),
      livekitUrl: process.env.EXPO_PUBLIC_LIVEKIT_URL ?? config.extra?.livekitUrl ?? '',
      tokenEndpoint: process.env.EXPO_PUBLIC_AGENT_TOKEN_ENDPOINT ?? config.extra?.tokenEndpoint ?? '',
      defaultRoom: process.env.EXPO_PUBLIC_AGENT_ROOM ?? config.extra?.defaultRoom ?? 'agentcall-demo',
      buildLabel: process.env.EXPO_PUBLIC_AGENTCALL_BUILD_LABEL ?? config.extra?.buildLabel ?? 'dev-local',
    },
  };
};
