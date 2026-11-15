import { useEffect, useState } from 'react';
import { FlatList, Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Empty, Field, Notice, useTheme } from '../../components/ui';
import { useSession } from '../../core/session';
import type { DirectoryEntry } from '../../core/types';

export default function Directory() {
  const t = useTheme();
  const { api } = useSession();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<DirectoryEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const h = setTimeout(() => {
      api.directory(q).then((r) => {
        setItems(r);
        setErr(null);
      }).catch((e) => setErr(e?.message ?? String(e)));
    }, 250);
    return () => clearTimeout(h);
  }, [q, api]);

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <Field label="Search" value={q} onChangeText={setQ} placeholder="Name, title or department" autoCorrect={false} clearButtonMode="while-editing" />
      </View>
      {err ? <View style={{ paddingHorizontal: 16 }}><Notice tone="danger" text={err} /></View> : null}
      <FlatList
        data={items ?? []}
        keyExtractor={(e) => e.employee}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        ListEmptyComponent={items ? <Empty text="Nobody found." icon="people-outline" /> : undefined}
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.card, padding: 12, borderRadius: 12 }}>
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: t.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: t.primary, fontWeight: '700' }}>{initials(item.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: '600' }}>{item.name}</Text>
              <Text style={{ color: t.sub, fontSize: 13 }}>{[item.designation, item.department].filter(Boolean).join(' · ')}</Text>
            </View>
            {item.phone ? <Action icon="call-outline" onPress={() => Linking.openURL(`tel:${item.phone!.replace(/\s/g, '')}`)} label={`Call ${item.name}`} /> : null}
            {item.email ? <Action icon="mail-outline" onPress={() => Linking.openURL(`mailto:${item.email}`)} label={`Email ${item.name}`} /> : null}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function Action({ icon, onPress, label }: { icon: any; onPress: () => void; label: string }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={{ padding: 6 }}>
      <Ionicons name={icon} size={22} color={t.primary} />
    </Pressable>
  );
}
const initials = (n: string) => n.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
