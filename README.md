# QE Mobile

Modular Android/iOS app for the embassy's own, locally hosted QE ERP.

- `app/` – Expo / React Native (TypeScript). Modules: Time Clock (NFC, geofence, Wi-Fi), Time Off, Directory, Scan. Add modules in `app/src/core/modules.ts` + `app/src/app/<module>/`.
- `docs/MOBILE-API.md` – the REST contract the QE ERP implements (endpoints, data model, clock-in security rules, hosting/HTTPS).
- `reference/sun.py` – NTAG 424 DNA secure-tag verification (tested against NXP's example) for the ERP backend.
- Builds: GitHub Actions → *Android APK* (run manually, or push a `v*` tag to publish a release).

Version lives in `app/app.json` (`expo.version`, `android.versionCode`, `ios.buildNumber`) and is shown in the app under **Me → About**.
