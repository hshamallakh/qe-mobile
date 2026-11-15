import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Body, Button, Card, Empty, Label, Notice, Pill, Screen, useTheme } from '../../components/ui';
import { useSession } from '../../core/session';
import type { LeaveApplication, LeaveType } from '../../core/types';

const TONE = { Open: 'warn', Approved: 'success', Rejected: 'danger', Cancelled: 'neutral' } as const;

export default function TimeOff() {
  const t = useTheme();
  const { api } = useSession();
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [leaves, setLeaves] = useState<LeaveApplication[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [a, b] = await Promise.all([api.leaveTypes(), api.myLeaves()]);
      setTypes(a);
      setLeaves(b);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setRefreshing(false);
    }
  }, [api]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen refreshing={refreshing} onRefresh={load}>
      {err ? <Notice tone="danger" text={err} /> : null}
      <Label>Balances</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {types.map((lt) => (
          <Card key={lt.name} style={{ width: '47%', gap: 4 }}>
            <Text style={{ fontSize: 26, fontWeight: '700', color: t.text }}>{lt.unlimited ? '∞' : (lt.balance ?? 0).toString()}</Text>
            <Body sub style={{ fontSize: 13 }}>{lt.name}{lt.unlimited ? '' : ' · days left'}</Body>
          </Card>
        ))}
      </View>
      <Button title="Request time off" icon="add-circle-outline" onPress={() => router.push('/timeoff/new')} />
      <Label>My requests</Label>
      {leaves && leaves.length === 0 ? <Empty text="No leave requests yet." icon="sunny-outline" /> : null}
      {(leaves ?? []).map((l) => (
        <Card key={l.name} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Body>{l.leaveType}</Body>
            <Pill text={l.status} tone={TONE[l.status]} />
          </View>
          <Body sub>
            {l.fromDate === l.toDate ? l.fromDate : `${l.fromDate} → ${l.toDate}`} · {l.totalDays} day{l.totalDays === 1 ? '' : 's'}
            {l.halfDay ? ' (half day)' : ''}
          </Body>
          {l.reason ? <Body sub style={{ fontSize: 13 }}>{l.reason}</Body> : null}
        </Card>
      ))}
    </Screen>
  );
}
