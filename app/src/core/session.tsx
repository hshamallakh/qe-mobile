import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { makeApi, type Api } from './api';
import type { Bootstrap } from './types';
import { APP_VERSION, getDeviceId, getDeviceName } from './sensors';
import { Platform } from 'react-native';

const K = { server: 'qe.server', token: 'qe.token', mode: 'qe.mode', bio: 'qe.biometric' } as const;
const opts: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export const DEFAULT_SERVER = 'https://erp.example.com';

type Status = 'loading' | 'signedOut' | 'locked' | 'ready';

interface SessionCtx {
  status: Status;
  api: Api;
  server: string;
  boot: Bootstrap | null;
  biometricEnabled: boolean;
  error: string | null;
  signIn(server: string, usr: string, pwd: string): Promise<void>;
  startDemo(): Promise<void>;
  signOut(): Promise<void>;
  refresh(): Promise<void>;
  unlock(): Promise<void>;
  setBiometric(on: boolean): Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [server, setServer] = useState(DEFAULT_SERVER);
  const [mode, setMode] = useState<'demo' | 'erp'>('erp');
  const [token, setToken] = useState<string | null>(null);
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [biometricEnabled, setBio] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const api = useMemo(() => makeApi(mode, server, token), [mode, server, token]);

  const loadBoot = useCallback(async (a: Api) => {
    const b = await a.bootstrap();
    setBoot(b);
    return b;
  }, []);

  // Restore saved session on launch
  useEffect(() => {
    (async () => {
      const [s, t, m, bio] = await Promise.all([
        SecureStore.getItemAsync(K.server, opts),
        SecureStore.getItemAsync(K.token, opts),
        SecureStore.getItemAsync(K.mode, opts),
        SecureStore.getItemAsync(K.bio, opts),
      ]);
      if (s) setServer(s);
      setBio(bio === '1');
      if (!t) return setStatus('signedOut');
      const md = (m as 'demo' | 'erp') || 'erp';
      setMode(md);
      setToken(t);
      if (bio === '1') return setStatus('locked');
      try {
        await loadBoot(makeApi(md, s || DEFAULT_SERVER, t));
        setStatus('ready');
      } catch (e: any) {
        if (e?.status === 401 || e?.status === 403) {
          await SecureStore.deleteItemAsync(K.token, opts);
          setStatus('signedOut');
        } else {
          setError(e?.message ?? String(e));
          setStatus('ready'); // keep the user in; screens show their own errors / retry
        }
      }
    })();
  }, [loadBoot]);

  const signIn = useCallback(
    async (srv: string, usr: string, pwd: string) => {
      const url = normaliseServer(srv);
      const temp = makeApi('erp', url, null);
      const device = { deviceId: await getDeviceId(), deviceName: getDeviceName(), platform: Platform.OS, appVersion: APP_VERSION };
      const t = await temp.login(usr.trim(), pwd, device);
      await Promise.all([
        SecureStore.setItemAsync(K.server, url, opts),
        SecureStore.setItemAsync(K.token, t, opts),
        SecureStore.setItemAsync(K.mode, 'erp', opts),
      ]);
      setServer(url);
      setMode('erp');
      setToken(t);
      await loadBoot(makeApi('erp', url, t));
      setError(null);
      setStatus('ready');
    },
    [loadBoot],
  );

  const startDemo = useCallback(async () => {
    await Promise.all([SecureStore.setItemAsync(K.token, 'demo', opts), SecureStore.setItemAsync(K.mode, 'demo', opts)]);
    setMode('demo');
    setToken('demo');
    await loadBoot(makeApi('demo', server, 'demo'));
    setStatus('ready');
  }, [loadBoot, server]);

  const signOut = useCallback(async () => {
    await api.logout();
    await Promise.all([SecureStore.deleteItemAsync(K.token, opts), SecureStore.deleteItemAsync(K.mode, opts)]);
    setToken(null);
    setBoot(null);
    setMode('erp');
    setStatus('signedOut');
  }, [api]);

  const refresh = useCallback(async () => {
    try {
      await loadBoot(api);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      throw e;
    }
  }, [api, loadBoot]);

  const unlock = useCallback(async () => {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock QE Mobile', fallbackLabel: 'Use passcode' });
    if (!r.success) return;
    setStatus('ready');
    loadBoot(api).catch((e) => setError(e?.message ?? String(e)));
  }, [api, loadBoot]);

  const setBiometric = useCallback(async (on: boolean) => {
    if (on) {
      const ok = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
      if (!ok) throw new Error('No Face ID / fingerprint is set up on this phone.');
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirm to enable' });
      if (!r.success) return;
    }
    await SecureStore.setItemAsync(K.bio, on ? '1' : '0', opts);
    setBio(on);
  }, []);

  const value: SessionCtx = { status, api, server, boot, biometricEnabled, error, signIn, startDemo, signOut, refresh, unlock, setBiometric };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession outside SessionProvider');
  return c;
}

export function normaliseServer(s: string) {
  let u = s.trim();
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  if (/^http:\/\//i.test(u)) throw new Error('The server must use https:// (required by iOS and Android security rules).');
  return u.replace(/\/+$/, '');
}
