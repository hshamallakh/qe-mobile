import { useCallback, useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { Body, Button, Card, Field, Label, Notice, Pill, Row, Screen } from '../../components/ui';
import { useSession } from '../../core/session';
import { readTag, writeTagUrl, nfcStatus } from '../../core/sensors';
import type { ClockPoint } from '../../core/types';

// Admin tool: register clock points and write/verify the NFC stickers for them.
export default function Tags() {
  const { api } = useSession();
  const [points, setPoints] = useState<ClockPoint[]>([]);
  const [title, setTitle] = useState('');
  const [building, setBuilding] = useState('');
  const [lock, setLock] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger' | 'info' | 'warn'; text: string } | null>(null);
  const [nfc, setNfc] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPoints(await api.clockPoints());
    } catch (e: any) {
      setMsg({ tone: 'danger', text: e?.message ?? String(e) });
    }
  }, [api]);
  useEffect(() => {
    load();
    nfcStatus().then(setNfc);
  }, [load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
    } catch (e: any) {
      if (!/cancel/i.test(String(e?.message ?? e))) setMsg({ tone: 'danger', text: e?.message ?? String(e) });
    } finally {
      setBusy(null);
    }
  };

  const create = () =>
    run('create', async () => {
      if (!title.trim()) throw new Error('Give the clock point a name, e.g. "No. 8 – Main entrance".');
      const cp = await api.createClockPoint(title.trim(), building.trim());
      setTitle('');
      await load();
      setMsg({ tone: 'success', text: `Created ${cp.title}. Now tap "Write tag" and hold a blank sticker to the phone.` });
    });

  const write = (cp: ClockPoint) =>
    run(`w-${cp.name}`, async () => {
      if (!cp.tagUrl) throw new Error('This clock point uses a pre-configured secure tag (NTAG 424 DNA). Program it with NXP tools, then use "Test a tag".');
      await writeTagUrl(cp.tagUrl, lock);
      setMsg({ tone: 'success', text: `Tag written for ${cp.title}${lock ? ' and locked (permanent).' : '.'}` });
    });

  const test = () =>
    run('test', async () => {
      const tag = await readTag('Hold the tag to test it');
      if (!tag.url) throw new Error(`No clock-in data on this tag (UID ${tag.uid ?? 'unknown'}).`);
      const r = await api.verifyTag(tag.url, tag.uid);
      setMsg({ tone: r.ok ? 'success' : 'danger', text: `${r.ok ? '✓' : '✗'} ${r.message}${r.clockPoint ? ` (${r.clockPoint})` : ''}` });
    });

  return (
    <Screen onRefresh={load}>
      {nfc && nfc !== 'ready' ? <Notice tone="warn" text={nfc === 'disabled' ? 'Turn NFC on to write tags.' : 'This phone has no NFC reader.'} /> : null}
      {msg ? <Notice tone={msg.tone} text={msg.text} /> : null}
      <Card style={{ gap: 12 }}>
        <Label>New clock point</Label>
        <Field label="Name" placeholder="No. 8 – Main entrance" value={title} onChangeText={setTitle} />
        <Field label="Building" placeholder="8 Balfour Street" value={building} onChangeText={setBuilding} />
        <Button title="Create clock point" icon="add-circle-outline" onPress={create} loading={busy === 'create'} />
        <Body sub style={{ fontSize: 13 }}>Who may clock in at each point, and which actions it allows, is set in ERPNext (QE Clock Point).</Body>
      </Card>
      <Card>
        <Row title="Lock tags after writing" subtitle="Recommended for stickers in public areas. Cannot be undone." right={<Switch value={lock} onValueChange={setLock} />} />
        <Button title="Test a tag" icon="scan-circle-outline" kind="secondary" onPress={test} loading={busy === 'test'} />
      </Card>
      {points.map((cp) => (
        <Card key={cp.name} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Body>{cp.title}</Body>
            <Pill text={cp.tagType} tone={cp.tagType === 'Static' ? 'neutral' : 'success'} />
          </View>
          <Body sub style={{ fontSize: 13 }}>
            {[cp.name, cp.building, cp.allowedActions.join('/')].filter(Boolean).join(' · ')}
          </Body>
          {cp.tagType === 'Static' ? <Button title="Write tag" icon="create-outline" kind="secondary" loading={busy === `w-${cp.name}`} onPress={() => write(cp)} /> : null}
        </Card>
      ))}
    </Screen>
  );
}
