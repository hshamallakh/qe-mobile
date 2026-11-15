# QE Mobile

Modular Android/iOS app for the embassy ERP (ERPNext 16), plus its ERPNext server app.

- `app/` – Expo / React Native (TypeScript). Modules: Time Clock (NFC, geofence, Wi-Fi), Time Off, Directory, Scan. Add modules in `app/src/core/modules.ts` + `app/src/app/<module>/`.
- `server/qe_mobile/` – Frappe app (`bench get-app`), see its README.
- Builds: GitHub Actions → *Android APK* (run manually, or push a `v*` tag to publish a release).

Version lives in `app/app.json` (`expo.version`, `android.versionCode`, `ios.buildNumber`) and is shown in the app under **Me → About**.
