import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Body, Button, Card, H1, Label, Notice, Pill, Screen, fmtDuration, fmtTime, useTheme } from '../../components/ui';
import { useSession } from '../../core/session';
import { enabledModules, type ModuleDef } from '../../core/modules';
import type { ClockState } from '../../core/types';

export default function Home() {
  const t = useTheme();
  const { boot, api, error, refresh } = useSession();
  const [clock, setClock] = useState<ClockState | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mods = enabledModules(boot);
  const hasClock = mods.some((m) => m.id === 'attendance');

  const loadClock = useCallback(async () => {
    if (!hasClock) return;
    try {
      setClock(await api.clockState());
    } catch {
      setClock(null);
    }
  }, [api, hasClock]);

  useFocusEffect(
    useCallback(() => {
      loadClock();
    }, [loadClock]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } catch {}
    await loadClock();
    setRefreshing(false);
  };

  const sections = groupBy(mods, (m) => m.section);
  const first = boot?.user.fullName?.split(' ')[0] ?? '';

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <View style={{ gap: 4 }}>
        <Body sub>{greeting()}</Body>
        <H1>{first || 'Welcome'}</H1>
        {boot?.user.designation ? <Body sub>{[boot.user.designation, boot.user.department].filter(Boolean).join(' · ')}</Body> : null}
      </View>

      {api.isDemo ? <Notice tone="warn" text="Demo mode — sample data only, nothing is sent to a server." /> : null}
      {error ? <Notice tone="danger" text={`Could not refresh: ${error}`} /> : null}

      {hasClock ? (
        <Card onPress={() => router.push('/attendance')} style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label>Time Clock</Label>
            <Pill text={clock?.status === 'in' ? 'Clocked in' : clock?.status === 'break' ? 'On break' : 'Clocked out'} tone={clock?.status === 'in' ? 'success' : clock?.status === 'break' ? 'warn' : 'neutral'} />
          </View>
          <Text style={{ fontSize: 34, fontWeight: '700', color: t.text }}>{fmtDuration(clock?.todaySeconds ?? 0)}</Text>
          <Body sub>{clock?.since ? `Since ${fmtTime(clock.since)} · worked today` : 'Worked today'}</Body>
          <Button
            title={clock?.status === 'out' || !clock ? 'Clock in' : 'Open time clock'}
            icon={clock?.status === 'out' || !clock ? 'enter-outline' : 'time-outline'}
            onPress={() => router.push('/attendance')}
          />
        </Card>
      ) : null}

      {Object.entries(sections).map(([section, list]) => (
        <View key={section} style={{ gap: 8 }}>
          <Label>{section}</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {list.map((m) => (
              <Tile key={m.id} m={m} />
            ))}
          </View>
        </View>
      ))}
      {mods.length === 0 && boot ? <Notice text="No modules are enabled for your account yet. Ask your administrator." /> : null}
    </Screen>
  );
}

function Tile({ m }: { m: ModuleDef }) {
  const t = useTheme();
  return (
    <Card onPress={() => router.push(m.route as any)} style={{ width: '47%', gap: 8, minHeight: 112 }}>
      <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: m.color + '1F', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={m.icon} size={22} color={m.color} />
      </View>
      <Text style={{ fontWeight: '600', fontSize: 15, color: t.text }}>{m.title}</Text>
      <Text style={{ fontSize: 12, color: t.sub }} numberOfLines={2}>
        {m.subtitle}
      </Text>
    </Card>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
function groupBy<T>(arr: T[], key: (x: T) => string) {
  return arr.reduce<Record<string, T[]>>((acc, x) => {
    (acc[key(x)] ||= []).push(x);
    return acc;
  }, {});
}
