import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../core/session';
import { Loading, useTheme } from '../components/ui';

function RootStack() {
  const { status } = useSession();
  const t = useTheme();
  if (status === 'loading') return <Loading />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.card },
        headerTintColor: t.primary,
        headerTitleStyle: { color: t.text },
        contentStyle: { backgroundColor: t.bg },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={status === 'locked'}>
        <Stack.Screen name="locked" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={status === 'ready'}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="attendance/index" options={{ title: 'Time Clock' }} />
        <Stack.Screen name="attendance/history" options={{ title: 'My timesheet' }} />
        <Stack.Screen name="attendance/tags" options={{ title: 'NFC clock points' }} />
        <Stack.Screen name="timeoff/index" options={{ title: 'Time Off' }} />
        <Stack.Screen name="timeoff/new" options={{ title: 'Request time off', presentation: 'modal' }} />
        <Stack.Screen name="directory/index" options={{ title: 'Directory' }} />
        <Stack.Screen name="scanner/index" options={{ title: 'Scan' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function Root() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="auto" />
        <RootStack />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
