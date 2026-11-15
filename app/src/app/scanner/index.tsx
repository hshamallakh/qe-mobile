import { useRef, useState } from 'react';
import { View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Body, Button, Card, H2, Label, Notice, Row, Screen, useTheme } from '../../components/ui';
import { useSession } from '../../core/session';
import type { ScanResult } from '../../core/types';

export default function Scanner() {
  const t = useTheme();
  const { api } = useSession();
  const [perm, requestPerm] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const lock = useRef(false);

  const onScan = async (r: BarcodeScanningResult) => {
    if (lock.current) return;
    lock.current = true;
    setScanning(false);
    setCode(r.data);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      setResult(await api.resolveScan(r.data, r.type));
      setErr(null);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  const again = () => {
    lock.current = false;
    setResult(null);
    setCode(null);
    setErr(null);
    setScanning(true);
  };

  if (!perm) return <Screen><Body sub>Checking camera permission…</Body></Screen>;
  if (!perm.granted)
    return (
      <Screen>
        <Notice text="The camera is used only while this screen is open, to read barcodes and QR codes on assets and documents." />
        <Button title="Allow camera" icon="camera-outline" onPress={requestPerm} />
      </Screen>
    );

  return (
    <Screen>
      {scanning ? (
        <View style={{ height: 380, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8', 'datamatrix', 'pdf417', 'upc_a'] }}
            onBarcodeScanned={onScan}
          />
        </View>
      ) : null}
      {scanning ? <Body sub style={{ textAlign: 'center' }}>Point the camera at a barcode or QR code</Body> : null}
      {err ? <Notice tone="danger" text={err} /> : null}
      {result ? (
        <Card style={{ gap: 6 }}>
          {result.found ? (
            <>
              <Label>{result.doctype}</Label>
              <H2>{result.title ?? result.docname}</H2>
              {(result.fields ?? []).map((f) => (
                <Row key={f.label} title={f.value} subtitle={f.label} />
              ))}
            </>
          ) : (
            <Notice tone="warn" text={result.message ?? `Nothing in the ERP matches "${code}".`} />
          )}
        </Card>
      ) : null}
      {!scanning ? <Button title="Scan another" icon="scan-outline" onPress={again} /> : null}
    </Screen>
  );
}
