import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Body, Button, Card, Label, Notice, Pill, Row, Screen, fmtDuration, fmtTime, useTheme } from '../../components/ui';
import { useSession } from '../../core/session';
import { isModuleAdmin } from '../../core/modules';
import { labelFor } from '../../core/labels';
import { APP_VERSION, distanceMeters, getDeviceId, getFix, getWifi, nfcStatus, readTag } from '../../core/sensors';
import type { ClockAction, ClockMethod, ClockRequest, ClockState } from '../../core/types';

const METHOD_INFO: Record<ClockMethod, { label: string; icon: any; hint: string }> = {
  nfc: { label: 'NFC tag', icon: 'radio-outline', hint: 'Tap your phone on the clock-in tag at the entrance or your desk.' },
  location: { label: 'Location', icon: 'location-outline', hint: 'Your position is checked once, only when you press the button.' },
  wifi: { label: 'Embassy Wi-Fi', icon: 'wifi-outline', hint: 'You must be connected to the embassy Wi-Fi network.' },
  manual: { label: 'Manual', icon: 'create-outline', hint: '' },
};

export default function Attendance() {
  const t = useTheme();
  const { api, boot } = useSession();
  const policy = boot?.attendance;
  const methods = (policy?.allowedMethods ?? []).filter((m) => m !== 'manual');
  const [method, setMethod] = useState<ClockMethod | null>(methods[0] ?? null);
  const [state, setState] = useState<ClockState | null>(null);
  const [busy, setBusy] = useState<ClockAction | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger' | 'warn' | 'info'; text: string } | null>(null);
  const [nfc, setNfc] = useState<'unsupported' | 'disabled' | 'ready' | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      setState(await api.clockState());
      setFetchedAt(Date.now());
    } catch (e: any) {
      setMsg({ tone: 'danger', text: e?.message ?? String(e) });
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => {
    nfcStatus().then(setNfc);
    const i = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(i);
  }, []);

  const [fetchedAt, setFetchedAt] = useState(Date.now());
  // keep the counter live between refreshes while clocked in
  const worked = useMemo(() => {
    if (!state) return 0;
    const live = state.status === 'in' ? Math.round((Date.now() - fetchedAt) / 1000) : 0;
    return state.todaySeconds + live;
  }, [state, tick, fetchedAt]);

  const doClock = async (action: ClockAction) => {
    if (!method) return;
    setMsg(null);
    setBusy(action);
    try {
      const req: ClockRequest = {
        action,
        method,
        clientTime: new Date().toISOString(),
        deviceId: await getDeviceId(),
        platform: Platform.OS,
        appVersion: APP_VERSION,
      };
      if (method === 'nfc') {
        if (nfc === 'unsupported') throw new Error('This phone has no NFC reader. Ask your administrator for another clock-in method.');
        if (nfc === 'disabled') throw new Error('NFC is turned off. Turn it on in your phone settings, then try again.');
        const tag = await readTag(action === 'IN' ? 'Tap the tag to clock in' : 'Tap the tag to clock out');
        if (!tag.url) throw new Error('This tag is not set up for clock-in. Use an embassy clock-in tag.');
        req.nfc = { url: tag.url, uid: tag.uid, tagType: tag.tagType };
        if (policy?.requireLocationForNfc) req.location = await getFix();
      } else if (method === 'location') {
        const fix = await getFix();
        req.location = fix;
        if (fix.mocked) throw new Error('A fake-location app appears to be active. Turn it off to clock in.');
        if (policy && fix.accuracy && fix.accuracy > policy.maxGpsAccuracyMeters)
          setMsg({ tone: 'warn', text: `GPS accuracy is weak (±${Math.round(fix.accuracy)} m). Moving near a window can help.` });
      } else if (method === 'wifi') {
        req.wifi = await getWifi();
      }
      const ev = await api.clock(req);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setMsg({ tone: 'success', text: `${labelFor(ev.action)} at ${fmtTime(ev.time)}${ev.site ? ` · ${ev.site}` : ''}` });
      await load();
    } catch (e: any) {
      if (/cancel/i.test(String(e?.message ?? e)) || e?.constructor?.name === 'UserCancel') {
        setMsg(null);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        setMsg({ tone: 'danger', text: e?.message ?? String(e) });
      }
    } finally {
      setBusy(null);
    }
  };

  const nearest = useMemo(() => policy?.sites?.[0], [policy]);
  if (!policy) return <Screen><Notice text="Attendance settings are not available." /></Screen>;

  const st = state?.status ?? 'out';
  return (
    <Screen refreshing={false} onRefresh={load}>
      <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 24 }}>
        <Pill text={st === 'in' ? 'Clocked in' : st === 'break' ? 'On break' : 'Clocked out'} tone={st === 'in' ? 'success' : st === 'break' ? 'warn' : 'neutral'} />
        <Text style={{ fontSize: 44, fontWeight: '700', color: t.text, fontVariant: ['tabular-nums'] }}>{fmtDuration(worked)}</Text>
        <Body sub>{state?.since ? `Last event ${fmtTime(state.since)}` : 'No events today'}</Body>
      </Card>

      {methods.length > 1 ? (
        <View style={{ gap: 8 }}>
          <Label>Clock in with</Label>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {methods.map((m) => (
              <Pressable
                key={m}
                onPress={() => setMethod(m)}
                accessibilityRole="button"
                accessibilityState={{ selected: method === m }}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  gap: 4,
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: method === m ? t.primary : t.border,
                  backgroundColor: t.card,
                }}
              >
                <Ionicons name={METHOD_INFO[m].icon} size={22} color={method === m ? t.primary : t.sub} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: method === m ? t.primary : t.sub }}>{METHOD_INFO[m].label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {methods.length === 0 ? (
        <Notice tone="warn" text="You are not allowed to clock in from the app. Use the clock-in point at the entrance, or ask your administrator." />
      ) : method ? (
        <Body sub>{METHOD_INFO[method].hint}</Body>
      ) : null}
      {method === 'nfc' && nfc === 'disabled' ? <Notice tone="warn" text="NFC is turned off on this phone." /> : null}
      {method === 'nfc' && nfc === 'unsupported' ? <Notice tone="danger" text="This phone has no NFC reader." /> : null}
      {method === 'location' && nearest && policy.sites.length === 1 && nearest.radiusMeters < 100000 ? (
        <Body sub>Approved site: {nearest.name} (within {nearest.radiusMeters} m)</Body>
      ) : null}

      {msg ? <Notice tone={msg.tone} text={msg.text} /> : null}

      {methods.length > 0 ? (
        <View style={{ gap: 10 }}>
          {st === 'out' ? (
            <Button big title="Clock in" icon="enter-outline" kind="success" loading={busy === 'IN'} onPress={() => doClock('IN')} />
          ) : (
            <>
              {policy.breaksEnabled && st === 'in' ? (
                <Button title="Start break" icon="cafe-outline" kind="secondary" loading={busy === 'BREAK_START'} onPress={() => doClock('BREAK_START')} />
              ) : null}
              {st === 'break' ? <Button big title="End break" icon="play-outline" loading={busy === 'BREAK_END'} onPress={() => doClock('BREAK_END')} /> : null}
              <Button big title="Clock out" icon="exit-outline" kind="danger" loading={busy === 'OUT'} onPress={() => doClock('OUT')} />
            </>
          )}
        </View>
      ) : null}

      <Card>
        <Row icon="calendar-outline" title="My timesheet" subtitle="Your clock events, last 14 days" onPress={() => router.push('/attendance/history')} />
        {isModuleAdmin(boot, 'attendance') ? (
          <Row icon="radio-outline" title="NFC clock points" subtitle="Admin: set up and test tags" onPress={() => router.push('/attendance/tags')} />
        ) : null}
      </Card>
      {policy.notes ? <Body sub style={{ fontSize: 13 }}>{policy.notes}</Body> : null}
    </Screen>
  );
}
