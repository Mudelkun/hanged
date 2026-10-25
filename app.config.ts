/*
 * app.json, plus what depends on where the server is (EXPO_PUBLIC_API_URL):
 * friend invite links (https://<server>/i/<code>) open the app itself once
 * it's installed, through iOS Universal Links and Android App Links. The
 * server serves the files the phones check (server/src/versus/links.ts).
 * Only for builds: Expo Go can't claim a domain (Context/versus.md, Invite links).
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

/** INVITE_PATH in server/src/versus-contract.ts. */
const INVITE_PATH = '/i/';

function linkHost(apiUrl: string | undefined): string | null {
  try {
    const url = new URL(apiUrl ?? '');
    // Both platforms check the domain over https only
    return url.protocol === 'https:' ? url.host : null;
  } catch {
    return null;
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const host = linkHost(process.env.EXPO_PUBLIC_API_URL);
  const app = config as ExpoConfig;
  if (!host) return app;
  return {
    ...app,
    ios: { ...app.ios, associatedDomains: [`applinks:${host}`] },
    android: {
      ...app.android,
      intentFilters: [
        { action: 'VIEW', autoVerify: true, data: [{ scheme: 'https', host, pathPrefix: INVITE_PATH }], category: ['BROWSABLE', 'DEFAULT'] },
      ],
    },
  };
};
