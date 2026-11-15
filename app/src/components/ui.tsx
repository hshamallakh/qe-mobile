import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  type TextInputProps,
  type ViewStyle,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export const palette = {
  light: { bg: '#F4F6FA', card: '#FFFFFF', text: '#0F172A', sub: '#64748B', border: '#E2E8F0', primary: '#12355B', accent: '#B08D57', danger: '#DC2626', success: '#16A34A', warn: '#D97706', input: '#F8FAFC' },
  dark: { bg: '#0B1220', card: '#131C2E', text: '#E2E8F0', sub: '#94A3B8', border: '#22304A', primary: '#5B8BD0', accent: '#D4B27A', danger: '#F87171', success: '#4ADE80', warn: '#FBBF24', input: '#0F1828' },
};
export type Theme = typeof palette.light;
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? palette.dark : palette.light;
}

export function Screen({ children, scroll = true, refreshing, onRefresh, padded = true }: { children: React.ReactNode; scroll?: boolean; refreshing?: boolean; onRefresh?: () => void; padded?: boolean }) {
  const t = useTheme();
  const inner = padded ? { padding: 16, gap: 12 } : undefined;
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.bg }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[inner, { paddingBottom: 32 }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const t = useTheme();
  const base: ViewStyle = { backgroundColor: t.card, borderRadius: 14, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border };
  if (onPress)
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [base, style, pressed && { opacity: 0.7 }]} accessibilityRole="button">
        {children}
      </Pressable>
    );
  return <View style={[base, style]}>{children}</View>;
}

export function H1({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ fontSize: 24, fontWeight: '700', color: t.text }}>{children}</Text>;
}
export function H2({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ fontSize: 17, fontWeight: '600', color: t.text }}>{children}</Text>;
}
export function Body({ children, sub, style }: { children: React.ReactNode; sub?: boolean; style?: object }) {
  const t = useTheme();
  return <Text style={[{ fontSize: 15, color: sub ? t.sub : t.text, lineHeight: 21 }, style]}>{children}</Text>;
}
export function Label({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ fontSize: 13, fontWeight: '600', color: t.sub, textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  loading,
  disabled,
  big,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  loading?: boolean;
  disabled?: boolean;
  big?: boolean;
}) {
  const t = useTheme();
  const bg = { primary: t.primary, secondary: t.card, danger: t.danger, ghost: 'transparent', success: t.success }[kind];
  const fg = kind === 'secondary' || kind === 'ghost' ? t.primary : '#fff';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderRadius: 12,
        paddingVertical: big ? 18 : 13,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderWidth: kind === 'secondary' ? 1 : 0,
        borderColor: t.border,
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={big ? 22 : 18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '600', fontSize: big ? 17 : 15 }}>{title}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const t = useTheme();
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={t.sub}
        style={[{ backgroundColor: t.input, borderWidth: 1, borderColor: t.border, borderRadius: 10, padding: 12, fontSize: 16, color: t.text }, style]}
        {...rest}
      />
    </View>
  );
}

export function Row({ icon, title, subtitle, right, onPress, color }: { icon?: React.ComponentProps<typeof Ionicons>['name']; title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void; color?: string }) {
  const t = useTheme();
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      {icon ? <Ionicons name={icon} size={22} color={color ?? t.primary} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 15, fontWeight: '500' }}>{title}</Text>
        {subtitle ? <Text style={{ color: t.sub, fontSize: 13, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={t.sub} /> : null)}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

export function Pill({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'success' | 'warn' | 'danger' | 'info' }) {
  const t = useTheme();
  const c = { neutral: t.sub, success: t.success, warn: t.warn, danger: t.danger, info: t.primary }[tone];
  return (
    <View style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: c + '22' }}>
      <Text style={{ color: c, fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warn' | 'danger' | 'success' }) {
  const t = useTheme();
  const c = { info: t.primary, warn: t.warn, danger: t.danger, success: t.success }[tone];
  const icon = { info: 'information-circle', warn: 'warning', danger: 'alert-circle', success: 'checkmark-circle' }[tone] as any;
  return (
    <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderRadius: 10, backgroundColor: c + '18', alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={18} color={c} />
      <Text style={{ flex: 1, color: t.text, fontSize: 14, lineHeight: 20 }}>{text}</Text>
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: t.bg }}>
      <ActivityIndicator size="large" color={t.primary} />
    </View>
  );
}

export function Empty({ text, icon = 'file-tray-outline' }: { text: string; icon?: React.ComponentProps<typeof Ionicons>['name'] }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
      <Ionicons name={icon} size={36} color={t.sub} />
      <Text style={{ color: t.sub, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

export const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--');
export const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) : '');
export const fmtDuration = (secs: number) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
};
