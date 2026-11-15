# QE Mobile ↔ QE ERP — API contract v1

The mobile app (Android/iOS) talks only to this API. The QE ERP (self-hosted, embassy network) implements it.
App version: **0.2.0**. All shapes are TypeScript in `app/src/core/types.ts` — that file is the source of truth.

## 1. Transport & hosting (locally hosted ERP)
- **HTTPS only.** iOS (App Transport Security) and Android block plain `http://`, and the app refuses it.
- The certificate must be **publicly trusted** (phones won't trust a private CA without a device profile). Recommended:
  a real sub-domain such as `erp.<embassy-domain>` with a Let's Encrypt certificate obtained by **DNS challenge**
  (works even if the server is never exposed to the internet), plus **split DNS**: inside the embassy the name resolves
  to the server's LAN IP; outside it resolves to the reverse proxy / VPN.
- Off-site access (field staff, drivers): either publish `/api/mobile/v1` through the reverse proxy, or require the
  embassy VPN. Without one of these, phones only work on embassy Wi-Fi.
- If a reverse proxy sits in front, pass the real client IP (`X-Forwarded-For`, trusted proxies only) — the Wi-Fi rule depends on it.
- Base URL: `https://<server>/api/mobile/v1`. JSON in, JSON out, UTF-8, times in ISO-8601 **with offset**.

## 2. Auth
| | |
|---|---|
| `POST /auth/login` | body `{username, password, device:{deviceId, deviceName, platform, appVersion}}` → `{token}`. Guest. **Rate-limit** (e.g. 10 / 10 min per IP+user). Generic error text for bad user or password. |
| `POST /auth/logout` | revokes the calling token → 204 |
| every other call | header `Authorization: Bearer <token>` |

- Token = 32+ random bytes, returned once; store **only a SHA-256 hash**. One row per user+device (`user, employee, device_id, device_name, platform, app_version, token_hash, active, last_seen, last_ip`). Re-login on the same device deactivates the old token. Admin can untick *active* to sign a lost phone out.
- `401` → app returns to the sign-in screen.

## 3. Errors
Non-2xx with `{"error": {"code": "NOT_AT_SITE", "message": "You are not at an approved location (about 240 m away)."}}`.
The app shows `message` to the user as-is, so write it for employees. Suggested codes: `UNAUTHENTICATED, FORBIDDEN, VALIDATION, NOT_ALLOWED_METHOD, BAD_TAG, TAG_REPLAY, NOT_AT_SITE, NOT_ON_NETWORK, BAD_STATE, NO_POLICY`.

## 4. Endpoints
| Method & path | Request | Response (types.ts) |
|---|---|---|
| `GET /me/bootstrap` | – | `Bootstrap` (user, granted modules, attendance policy, company, serverTime) |
| `GET /attendance/state` | – | `ClockState` |
| `POST /attendance/clock` | `ClockRequest` | `ClockEvent` |
| `GET /attendance/events?days=14` | – | `ClockEvent[]` newest first |
| `GET /timeoff/types` | – | `LeaveType[]` (with balances) |
| `GET /timeoff/requests` | – | `LeaveApplication[]` |
| `POST /timeoff/requests` | `NewLeave` | `LeaveApplication` |
| `GET /directory?q=` | – | `DirectoryEntry[]` (work fields only) |
| `POST /scan/resolve` | `{code, format}` | `ScanResult` (asset / item / document / employee the user may see) |
| `GET /admin/clock-points` | – | `ClockPoint[]` (admin only) |
| `POST /admin/clock-points` | `{title, building}` | `ClockPoint` incl. `tagUrl` to write on a static tag |
| `POST /admin/clock-points/verify` | `{url, uid?}` | `{ok, clockPoint?, message}` — must NOT consume a SUN counter |

**Modules:** `Bootstrap.modules = [{id, enabled, admin}]`. Known ids today: `attendance, timeoff, directory, scanner`.
Reserved for later: `schedule, forms, tasks, updates, documents, purchase_orders, work_orders, fleet`. The ERP decides per role; the app shows only what it gets.

## 5. Data the ERP needs (attendance)
- **Clock point** (one per NFC sticker): `id (e.g. CP-0001), title, building, enabled, tag_type (Static | NTAG424_SUN), tag_secret (encrypted), bound_uid?, sun_meta_key, sun_file_key (encrypted), last_counter, allow_in, allow_out, allow_breaks, require_location, allowed_employees[], allowed_departments[]` (both empty = everyone).
- **Attendance policy**: `name, is_default, priority, employees[], departments[], allow_nfc, allow_location, allow_wifi, breaks_enabled, require_location_for_nfc, max_gps_accuracy_m (75), sites[{name, lat, lng, radius_m}], allowed_subnets (CIDR list), require_subnet, wifi_networks[{ssid, bssids[]}], earliest_clock_in, flag_shift_longer_than_h, notes`.
  Resolution: employee match > department match > default; then highest priority.
- **Clock event** (attendance log): `employee, server_time, action (IN|OUT|BREAK_START|BREAK_END), log_type (IN|OUT for HR attendance), method, clock_point, site, lat, lng, accuracy, wifi_ssid, wifi_bssid, request_ip, tag_uid, device_id, flags[]`.
  Daily attendance / overtime is calculated from these (same idea as ERPNext *Employee Checkin → Attendance*).

## 6. Clock-in rules — enforced on the server, never trusted from the phone
1. Authenticated user → active employee, else `FORBIDDEN`.
2. Policy exists, and `method` is allowed by it (`NOT_ALLOWED_METHOD`).
3. State machine on the employee's last event within ~20 h (lock the employee row):
   `IN` only when out · `OUT` when in/break · `BREAK_START` when in · `BREAK_END` when on break. Breaks only if enabled.
4. `earliest_clock_in` for `IN`.
5. Evidence by method:
   - **nfc** — parse `nfc.url`: path must be `/qe/t/<clockPointId>`.
     *Static*: query `k` must equal the stored secret (constant-time compare).
     *NTAG424_SUN*: verify `e`/`c` with `reference/sun.py` (NXP AN12196), then **counter must be > last_counter** (store it) → stops copied stickers and replayed URLs.
     If `bound_uid` set, UID must match. Employee/department must be allowed at the point; action allowed at the point. If point or policy requires location, also run the location check.
   - **location** — reject `mocked: true`; reject `accuracy > max_gps_accuracy_m`; inside a site if `distance − min(accuracy, 25 m) ≤ radius`. Error says roughly how far away they are.
   - **wifi** — **primary:** request IP inside `allowed_subnets` (the phone cannot fake this on the LAN). If `require_subnet` and no match → `NOT_ON_NETWORK`. **Secondary:** SSID match, and BSSID match when BSSIDs are listed.
6. Flags: `new_device` (first event from this device for an employee who has older events), `offline` (if `offline: true`).
7. Store with **server time** (ignore `clientTime` except for audit) and return the `ClockEvent`.

## 7. NFC tags
- Static sticker (NTAG213/215/216): written from the app (*Time Clock → NFC clock points → Write tag*) with
  `https://<server>/qe/t/<id>?k=<secret>` and locked read-only. Serve a small page at `/qe/t/*` saying
  "Embassy clock-in point – open QE Mobile to clock in" for anyone who taps it with another phone.
- Secure sticker (NTAG 424 DNA): program once with NXP TagXplorer + a desktop reader (e.g. Identiv uTrust 3700 F):
  URL `https://<server>/qe/t/<id>?e=<32×0>&c=<16×0>`, SDM on, encrypted PICC data (UID+counter) mirrored at `e=`,
  SDM MAC at `c=` (MAC input offset = MAC offset), and the two AES keys stored on the clock point.

## 8. Privacy (needed for App Store / Play listing)
Location is read **once, only when the employee presses a clock button** (no background tracking); Wi-Fi name is read at
the same moment; camera only on the Scan screen. Publish a privacy policy URL and return it in `Bootstrap.company.privacyPolicyUrl`.
