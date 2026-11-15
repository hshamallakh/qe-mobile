import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, Button, Card, Field, Notice, Screen, useTheme } from '../components/ui';
import { DEFAULT_SERVER, useSession } from '../core/session';
import { APP_VERSION } from '../core/sensors';

export default function Login() {
  const t = useTheme();
  const { signIn, startDemo, server } = useSession();
  const [srv, setSrv] = useState(server === DEFAULT_SERVER ? '' : server);
  const [usr, setUsr] = useState('');
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!srv || !usr || !pwd) return setErr('Enter the server address, your username and your password.');
    setBusy(true);
    try {
      await signIn(srv, usr, pwd);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ alignItems: 'center', marginTop: 48, marginBottom: 16, gap: 10 }}>
          <View style={{ width: 76, height: 76, borderRadius: 20, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="business" size={40} color={t.accent} />
          </View>
          <Text style={{ fontSize: 26, fontWeight: '700', color: t.text }}>QE Mobile</Text>
          <Body sub>Sign in with your ERP account</Body>
        </View>
        <Card style={{ gap: 14 }}>
          <Field label="Server" placeholder="erp.your-embassy.org" value={srv} onChangeText={setSrv} autoCapitalize="none" autoCorrect={false} keyboardType="url" textContentType="URL" />
          <Field label="Username or email" value={usr} onChangeText={setUsr} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" autoComplete="username" />
          <Field label="Password" value={pwd} onChangeText={setPwd} secureTextEntry textContentType="password" autoComplete="password" onSubmitEditing={submit} returnKeyType="go" />
          {err ? <Notice tone="danger" text={err} /> : null}
          <Button title="Sign in" icon="log-in-outline" onPress={submit} loading={busy} />
        </Card>
        <Button title="Try the demo (no account needed)" kind="ghost" icon="play-circle-outline" onPress={() => startDemo()} />
        <Body sub style={{ textAlign: 'center', fontSize: 12 }}>
          Accounts are created by your administrator. Version {APP_VERSION}
        </Body>
      </Screen>
    </KeyboardAvoidingView>
  );
}
