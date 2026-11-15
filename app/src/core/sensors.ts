import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import NfcManager, { Ndef, NfcTech, type TagEvent } from 'react-native-nfc-manager';
import Constants from 'expo-constants';

export const APP_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';
export const BUILD_NUMBER: string =
  (Platform.OS === 'ios' ? Constants.expoConfig?.ios?.buildNumber : String(Constants.expoConfig?.android?.versionCode ?? '')) ?? '';

NetInfo.configure({ shouldFetchWiFiSSID: true });

// ---------- Device identity ----------
let cachedId: string | null = null;
export async function getDeviceId(): Promise<string> {
  if (cachedId) return cachedId;
  if (Platform.OS === 'android') cachedId = Application.getAndroidId();
  else cachedId = (await Application.getIosIdForVendorAsync()) ?? 'ios-unknown';
  return cachedId!;
}
export function getDeviceName(): string {
  return [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || Platform.OS;
}

// ---------- NFC ----------
let nfcStarted = false;
export async function nfcStatus(): Promise<'unsupported' | 'disabled' | 'ready'> {
  try {
    const supported = await NfcManager.isSupported();
    if (!supported) return 'unsupported';
    if (!nfcStarted) {
      await NfcManager.start();
      nfcStarted = true;
    }
    // iOS has no "NFC off" switch; isEnabled is Android-only in practice.
    if (Platform.OS === 'android' && !(await NfcManager.isEnabled())) return 'disabled';
    return 'ready';
  } catch {
    return 'unsupported';
  }
}

export interface TagRead {
  uid?: string;
  url?: string;
  text?: string;
  tagType?: string;
}

/**
 * Reads one tag. Identity comes from the NDEF URL written on the tag
 * (https://<erp>/qe/t/<clock-point>?k=<secret> or NTAG 424 DNA SUN ?e=..&c=..),
 * so it works the same on iPhone and Android. The UID is sent too when the OS exposes it.
 */
export async function readTag(prompt = 'Hold your phone near the clock-in tag'): Promise<TagRead> {
  await nfcStatus();
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef, { alertMessage: prompt });
    const tag: TagEvent | null = await NfcManager.getTag();
    const out: TagRead = { uid: tag?.id, tagType: tag?.type ?? tag?.tech };
    for (const rec of tag?.ndefMessage ?? []) {
      const bytes = Uint8Array.from(rec.payload);
      if (Ndef.isType(rec, Ndef.TNF_WELL_KNOWN, Ndef.RTD_URI)) out.url = Ndef.uri.decodePayload(bytes);
      else if (Ndef.isType(rec, Ndef.TNF_WELL_KNOWN, Ndef.RTD_TEXT)) out.text = Ndef.text.decodePayload(bytes);
    }
    if (Platform.OS === 'ios') await NfcManager.setAlertMessage('Tag read');
    return out;
  } finally {
    NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

/** Admin: writes a clock-point URL onto a blank NTAG213/215/216 sticker, optionally locking it. */
export async function writeTagUrl(url: string, lock: boolean): Promise<void> {
  await nfcStatus();
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef, { alertMessage: 'Hold your phone on the new tag' });
    const bytes = Ndef.encodeMessage([Ndef.uriRecord(url)]);
    if (!bytes) throw new Error('Could not encode the tag data');
    await NfcManager.ndefHandler.writeNdefMessage(bytes);
    if (lock) await NfcManager.ndefHandler.makeReadOnly();
    if (Platform.OS === 'ios') await NfcManager.setAlertMessage(lock ? 'Written and locked' : 'Written');
  } finally {
    NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

export function cancelNfc() {
  NfcManager.cancelTechnologyRequest().catch(() => {});
}

// ---------- Location (foreground, one-shot only) ----------
export interface Fix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  mocked?: boolean;
}
export async function getFix(): Promise<Fix> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') throw new Error('Location permission is needed for this clock-in method. You can enable it in Settings.');
  if (!(await Location.hasServicesEnabledAsync())) throw new Error('Turn on Location Services to clock in with location.');
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, mocked: pos.mocked };
}

export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------- Wi-Fi ----------
/**
 * SSID/BSSID are only readable with location permission granted (both OSes) and,
 * on iOS, the "Access Wi-Fi Information" capability. The server also checks the
 * request's source IP against the embassy LAN, which a phone cannot fake.
 */
export async function getWifi(): Promise<{ ssid: string | null; bssid: string | null }> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') throw new Error('Location permission is needed to read the Wi-Fi network name (an OS rule).');
  const s = await NetInfo.fetch('wifi');
  if (s.type !== 'wifi' || !s.isConnected) throw new Error('Connect to the embassy Wi-Fi first.');
  return { ssid: s.details?.ssid ?? null, bssid: s.details?.bssid?.toLowerCase() ?? null };
}

export async function isOnline(): Promise<boolean> {
  const s = await NetInfo.fetch();
  return !!s.isConnected && s.isInternetReachable !== false;
}
