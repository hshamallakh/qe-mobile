import { useState } from 'react';
import { Alert, Linking, Switch, View } from 'react-native';
import { Body, Card, H1, Label, Notice, Row, Screen, useTheme } from '../../components/ui';
import { useSession } from '../../core/session';
import { APP_VERSION, BUILD_NUMBER } from '../../core/sensors';

export default function Me() {
  const t = useTheme();
  const { boot, server, api, signOut, biometricEnabled, setBiometric } = useSession();
  const [err, setErr] = useState<string | null>(null);
  const u = boot?.user;

  const toggleBio = async (on: boolean) => {
    setErr(null);
    try {
      await setBiometric(on);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'This phone will be unlinked from your account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <H1>{u?.fullName ?? 'My account'}</H1>
        <Body sub>{u?.user}</Body>
      </View>
      <Card>
        <Label>Employment</Label>
        <Row icon="id-card-outline" title={u?.employee ?? '—'} subtitle="Employee ID" />
        <Row icon="briefcase-outline" title={u?.designation ?? '—'} subtitle="Designation" />
        <Row icon="git-network-outline" title={u?.department ?? '—'} subtitle="Department" />
      </Card>
      <Card>
        <Label>Security</Label>
        <Row icon="finger-print" title="Unlock with Face ID / fingerprint" right={<Switch value={biometricEnabled} onValueChange={toggleBio} />} />
        {err ? <Notice tone="danger" text={err} /> : null}
      </Card>
      <Card>
        <Label>About</Label>
        <Row icon="information-circle-outline" title={`QE Mobile v${APP_VERSION}`} subtitle={`Build ${BUILD_NUMBER}${api.isDemo ? ' · demo mode' : ''}`} />
        <Row icon="server-outline" title={api.isDemo ? 'Demo (no server)' : server} subtitle="Server" />
        {boot?.company.privacyPolicyUrl ? (
          <Row icon="shield-checkmark-outline" title="Privacy policy" onPress={() => Linking.openURL(boot.company.privacyPolicyUrl!)} />
        ) : null}
        <Row icon="settings-outline" title="App permissions" subtitle="Camera, location, NFC" onPress={() => Linking.openSettings()} />
      </Card>
      <Card>
        <Row icon="log-out-outline" title="Sign out" color={t.danger} onPress={confirmSignOut} />
      </Card>
      <Body sub style={{ fontSize: 12, textAlign: 'center' }}>
        Your account is managed by your employer. To close it or have your data removed, contact your HR administrator.
      </Body>
    </Screen>
  );
}
