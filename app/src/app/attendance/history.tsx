import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Body, Card, Empty, Label, Notice, Pill, Row, Screen, fmtDate, fmtTime } from '../../components/ui';
import { useSession } from '../../core/session';
import type { ClockEvent } from '../../core/types';
import { labelFor } from '../../core/labels';

const ICON = { IN: 'enter-outline', OUT: 'exit-outline', BREAK_START: 'cafe-outline', BREAK_END: 'play-outline' } as const;

export default function History() {
  const { api } = useSession();
  const [items, setItems] = useState<ClockEvent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setItems(await api.myEvents(14));
      setErr(null);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setRefreshing(false);
    }
  }, [api]);
  useEffect(() => {
    load();
  }, [load]);

  const byDay = (items ?? []).reduce<Record<string, ClockEvent[]>>((acc, e) => {
    const d = e.time.slice(0, 10);
    (acc[d] ||= []).push(e);
    return acc;
  }, {});

  return (
    <Screen refreshing={refreshing} onRefresh={load}>
      {err ? <Notice tone="danger" text={err} /> : null}
      {items && items.length === 0 ? <Empty text="No clock events in the last 14 days." icon="time-outline" /> : null}
      {Object.entries(byDay).map(([day, evs]) => (
        <Card key={day}>
          <Label>{fmtDate(evs[0].time)}</Label>
          {evs.map((e) => (
            <Row
              key={e.name}
              icon={ICON[e.action] as any}
              title={`${labelFor(e.action)} · ${fmtTime(e.time)}`}
              subtitle={[e.site, e.method.toUpperCase()].filter(Boolean).join(' · ')}
              right={e.flags?.length ? <View style={{ gap: 4 }}>{e.flags.map((f) => <Pill key={f} text={f.replace(/_/g, ' ')} tone="warn" />)}</View> : <View />}
            />
          ))}
        </Card>
      ))}
      <Body sub style={{ fontSize: 12 }}>Need a correction? Ask your manager to adjust it in ERPNext.</Body>
    </Screen>
  );
}
