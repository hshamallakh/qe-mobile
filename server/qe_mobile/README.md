# qe_mobile – ERPNext 16 server app for QE Mobile (v0.1.0)

Gives the QE Mobile Android/iOS app a secure API: device-token login, NFC / geofence / Wi-Fi clock-in
(enforced server-side), time off, directory, barcode lookup. Requires **ERPNext 16 + HRMS**.

## Install (on the dev bench first)
```bash
cd ~/frappe-bench
bench get-app /path/to/qe_mobile        # or a git URL once it's in a repo
bench --site <dev-site> install-app qe_mobile
bench --site <dev-site> migrate
bench restart
```
Installing creates: the doctypes below, the **QE Mobile Admin** role, QE fields on **Employee Checkin**,
and a default policy "Default – NFC only".

## What to set up in ERPNext
1. **Employee ↔ User:** every employee who uses the app needs `Employee.user_id` set.
2. **QE Attendance Policy** – who may clock in how:
   - *Default – NFC only* applies to everyone.
   - Create e.g. "Drivers – app anywhere in geofence": tick *App – inside a geofence*, add sites (lat/long/radius),
     add the employees/departments. Higher *priority* wins; employee match beats department match beats default.
   - *App – on embassy Wi-Fi*: put the embassy LAN ranges and/or office public IPs in **allowed subnets**
     (e.g. `10.10.0.0/16`, `203.0.113.10/32`) and keep *Require the network check* on. The server sees the
     request's real source IP, which the phone cannot fake. SSID/BSSID lists are an extra, weaker check.
3. **QE Clock Point** – one per NFC sticker (entrance, each desk…). Leave the employee/department tables empty
   to allow everyone, or restrict it. Then in the app: *Time Clock → NFC clock points → Write tag* (needs the
   QE Mobile Admin / HR Manager role).
4. **QE Mobile Settings** – organisation name, privacy policy URL, whether the directory shows mobile numbers,
   and which roles get which modules (empty = all v0.1 modules for everyone).
5. **QE Mobile Device** – every signed-in phone. Untick *Active* to sign a lost phone out.

## Secure tags (NTAG 424 DNA "SUN")
Static tags (NTAG213/215/216) carry a secret URL – good, but a determined person could copy a sticker.
NTAG 424 DNA tags produce a new signed URL on every tap, so copies and replays are rejected.
Set the clock point *Tag type* to **NTAG 424 DNA SUN**, enter the two AES keys you programmed, and program the tag
(NXP TagXplorer + a USB NFC reader such as Identiv uTrust 3700 F) with:
- NDEF URL: `https://<your-erp>/qe/t/<CP-name>?e=00000000000000000000000000000000&c=0000000000000000`
- SDM: mirror encrypted PICC data (UID + counter) at the `e=` position, SDM MAC at the `c=` position,
  MAC input offset = MAC offset (no extra file data), SDMMetaRead key and SDMFileRead key = the keys entered in ERPNext.
Verification follows NXP AN12196 and is tested against its published example.

## API (all `POST/GET /api/method/qe_mobile.qe_mobile.api.*`)
| endpoint | purpose |
|---|---|
| `auth.login` (guest, rate-limited) / `auth.logout` | device token |
| `core.bootstrap` | user, modules, attendance policy |
| `attendance.state / clock / my_events` | time clock |
| `attendance.clock_points / create_clock_point / verify_tag` | admin |
| `timeoff.leave_types / my_leaves / apply` | leave |
| `directory.search`, `scan.resolve` | directory, barcode lookup |

Auth header: `X-QE-Device-Token: <token>` (handled by `auth_hooks`). Only a SHA-256 hash of the token is stored.

## Reverse proxy
The app requires HTTPS. If ERPNext sits behind nginx/Cloudflare, make sure the real client IP is passed
(`X-Forwarded-For` / `set_real_ip_from`) or the Wi-Fi/LAN check will see the proxy's IP instead.
