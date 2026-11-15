import { useEffect } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, Button, H1, Screen, useTheme } from '../components/ui';
import { useSession } from '../core/session';

export default function Locked() {
  const t = useTheme();
  const { unlock, signOut } = useSession();
  useEffect(() => {
    unlock();
  }, [unlock]);
  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <Ionicons name="lock-closed" size={56} color={t.primary} />
        <H1>QE Mobile is locked</H1>
        <Body sub>Use Face ID, fingerprint or your passcode to continue.</Body>
        <Button title="Unlock" icon="finger-print" onPress={unlock} />
        <Button title="Sign out" kind="ghost" onPress={signOut} />
      </View>
    </Screen>
  );
}
