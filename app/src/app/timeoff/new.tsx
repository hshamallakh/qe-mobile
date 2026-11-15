import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Field, Label, Notice, Row, Screen, useTheme } from '../../components/ui';
import { useSession } from '../../core/session';
import type { LeaveType } from '../../core/types';

const today = () => new Date().toISOString().slice(0, 10);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

export default function NewLeave() {
  const t = useTheme();
  const { api } = useSession();
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [type, setType] = useState<string>('');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [half, setHalf] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.leaveTypes().then((l) => {
      setTypes(l);
      if (l[0]) setType(l[0].name);
    }).catch((e) => setErr(e?.message ?? String(e)));
  }, [api]);

  const submit = async () => {
    setErr(null);
    if (!type) return setErr('Choose a leave type.');
    if (!isDate(from) || !isDate(to)) return setErr('Dates must be in the format YYYY-MM-DD.');
    if (to < from) return setErr('"To" date is before "From" date.');
    setBusy(true);
    try {
      await api.applyLeave({ leaveType: type, fromDate: from, toDate: half ? from : to, halfDay: half, reason: reason.trim() });
      router.back();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Label>Leave type</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {types.map((lt) => (
          <Pressable
            key={lt.name}
            onPress={() => setType(lt.name)}
            accessibilityRole="button"
            accessibilityState={{ selected: type === lt.name }}
            style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5, borderColor: type === lt.name ? t.primary : t.border, backgroundColor: t.card }}
          >
            <Text style={{ color: type === lt.name ? t.primary : t.text, fontWeight: '600' }}>{lt.name}</Text>
          </Pressable>
        ))}
      </View>
      <Card style={{ gap: 12 }}>
        <Row title="Half day" right={<Switch value={half} onValueChange={setHalf} />} />
        <Field label={half ? 'Date' : 'From'} value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
        {!half ? <Field label="To" value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" /> : null}
        <Field label="Reason" value={reason} onChangeText={setReason} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />
      </Card>
      {err ? <Notice tone="danger" text={err} /> : null}
      <Button title="Submit request" icon="send-outline" onPress={submit} loading={busy} />
    </Screen>
  );
}
