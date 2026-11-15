"""Clock in / out. The phone only *collects evidence* (NFC tag URL, GPS fix, Wi-Fi);
every rule is enforced here, so a modified app cannot bypass it."""
import hmac
import ipaddress
import json
import math
from datetime import timedelta
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

import frappe
from frappe import _
from frappe.utils import add_days, get_datetime, get_system_timezone, getdate, now_datetime, nowdate

from .core import current_employee, require_admin, resolve_policy
from .sun import SunError, verify_sun

ACTIONS = ("IN", "OUT", "BREAK_START", "BREAK_END")
LOG_TYPE = {"IN": "IN", "BREAK_END": "IN", "OUT": "OUT", "BREAK_START": "OUT"}


def iso(dt):
	return get_datetime(dt).replace(tzinfo=ZoneInfo(get_system_timezone())).isoformat()


def _last_event(employee):
	since = now_datetime() - timedelta(hours=20)
	row = frappe.db.get_value(
		"Employee Checkin", {"employee": employee, "time": (">=", since)},
		["name", "time", "log_type", "qe_action", "qe_method", "qe_site", "qe_flags"], order_by="time desc", as_dict=True,
	)
	if row and not row.qe_action:
		row.qe_action = row.log_type
	return row


def _status(last):
	if not last:
		return "out"
	return {"IN": "in", "BREAK_END": "in", "BREAK_START": "break", "OUT": "out"}.get(last.qe_action, "out")


def _event(row):
	return {"name": row.name, "action": row.qe_action or row.log_type, "time": iso(row.time), "method": row.qe_method or "manual",
	        "site": row.qe_site or None, "flags": [f for f in (row.qe_flags or "").split(",") if f]}


def _worked_today(employee):
	start = get_datetime(nowdate())
	rows = frappe.get_all("Employee Checkin", {"employee": employee, "time": (">=", start)}, ["time", "log_type"], order_by="time asc")
	total, opened = 0.0, None
	for r in rows:
		if r.log_type == "IN" and opened is None:
			opened = r.time
		elif r.log_type == "OUT" and opened is not None:
			total += (r.time - opened).total_seconds()
			opened = None
	if opened is not None:
		total += (now_datetime() - opened).total_seconds()
	return int(total)


@frappe.whitelist(methods=["GET"])
def state():
	emp = current_employee()
	last = _last_event(emp.name)
	return {"status": _status(last), "since": iso(last.time) if last else None, "todaySeconds": _worked_today(emp.name),
	        "lastEvent": _event(last) if last else None}


@frappe.whitelist(methods=["GET"])
def my_events(days=14):
	emp = current_employee()
	days = min(int(days or 14), 62)
	rows = frappe.get_all(
		"Employee Checkin", {"employee": emp.name, "time": (">=", add_days(nowdate(), -days))},
		["name", "time", "log_type", "qe_action", "qe_method", "qe_site", "qe_flags"], order_by="time desc", limit=500,
	)
	return [_event(r) for r in rows]


# ---------------------------------------------------------------- evidence checks
def _haversine(a_lat, a_lon, b_lat, b_lon):
	r = 6371000
	p1, p2 = math.radians(a_lat), math.radians(b_lat)
	dp, dl = math.radians(b_lat - a_lat), math.radians(b_lon - a_lon)
	h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
	return 2 * r * math.asin(math.sqrt(h))


def _check_location(policy, loc, sites=None):
	if not loc or loc.get("latitude") is None:
		frappe.throw(_("Location is missing."))
	if loc.get("mocked"):
		frappe.throw(_("A fake-location app is active. Turn it off to clock in."))
	acc = loc.get("accuracy") or 9999
	if acc > (policy.max_gps_accuracy or 75):
		frappe.throw(_("GPS accuracy is too low (±{0} m). Try again near a window or outside.").format(int(acc)))
	sites = sites if sites is not None else policy.sites
	if not sites:
		frappe.throw(_("No geofence is configured for you. Ask your administrator."))
	best = None
	for s in sites:
		d = _haversine(loc["latitude"], loc["longitude"], s.latitude, s.longitude)
		# allow the fix's uncertainty, capped so a poor fix can't stretch the fence much
		if d - min(acc, 25) <= (s.radius_m or 80):
			return s.site_name
		best = d if best is None else min(best, d)
	frappe.throw(_("You are not at an approved location (about {0} m away).").format(int(best or 0)))


def _ip_in(ip, subnets_text):
	try:
		addr = ipaddress.ip_address(ip)
	except ValueError:
		return False
	for line in (subnets_text or "").splitlines():
		line = line.strip()
		if not line:
			continue
		try:
			if addr in ipaddress.ip_network(line, strict=False):
				return True
		except ValueError:
			continue
	return False


def _check_wifi(policy, wifi):
	ip = frappe.local.request_ip
	if policy.allowed_subnets and _ip_in(ip, policy.allowed_subnets):
		return "Embassy network"
	if policy.require_subnet and policy.allowed_subnets:
		frappe.throw(_("You must be connected to the embassy Wi-Fi to clock in."))
	wifi = wifi or {}
	ssid, bssid = (wifi.get("ssid") or "").strip(), (wifi.get("bssid") or "").lower().strip()
	for net in policy.wifi_networks:
		if net.ssid != ssid:
			continue
		allowed = {b.strip().lower() for b in (net.bssids or "").splitlines() if b.strip()}
		if not allowed or bssid in allowed:
			return f"Wi-Fi {ssid}"
	frappe.throw(_("This Wi-Fi network is not approved for clock-in."))


def _verify_tag_url(url, uid=None):
	"""Return (clock point doc, tag uid) or throw."""
	u = urlparse(url or "")
	parts = [p for p in u.path.split("/") if p]
	if len(parts) < 3 or parts[-3:-1] != ["qe", "t"]:
		frappe.throw(_("This is not an embassy clock-in tag."))
	name = parts[-1]
	if not frappe.db.exists("QE Clock Point", name):
		frappe.throw(_("Unknown clock-in tag."))
	cp = frappe.get_doc("QE Clock Point", name)
	if not cp.enabled:
		frappe.throw(_("This clock-in point is disabled."))
	q = {k: v[0] for k, v in parse_qs(u.query).items()}
	tag_uid = (uid or "").replace(":", "").upper() or None

	if cp.tag_type == "Static":
		secret = cp.get_password("tag_secret", raise_exception=False) or ""
		if not secret or not hmac.compare_digest(secret, q.get("k", "")):
			frappe.throw(_("This tag is out of date or not genuine. Report it to the administrator."))
	else:
		e, c = q.get("e") or q.get("picc_data"), q.get("c") or q.get("cmac")
		if not e or not c:
			frappe.throw(_("Secure tag data missing."))
		try:
			res = verify_sun(e, c, cp.get_password("sun_meta_key"), cp.get_password("sun_file_key"))
		except SunError as ex:
			frappe.throw(_(str(ex)))
		# Replay protection: the tag's counter must increase. Row lock avoids races between two taps.
		last = frappe.db.sql("select last_counter from `tabQE Clock Point` where name=%s for update", name)[0][0] or 0
		if res.counter <= last:
			frappe.throw(_("This tag reading was already used. Tap the tag again."))
		frappe.db.set_value("QE Clock Point", name, "last_counter", res.counter, update_modified=False)
		tag_uid = res.uid

	if cp.bound_uid and tag_uid and cp.bound_uid != tag_uid:
		frappe.throw(_("This sticker is not the registered tag for this point."))
	return cp, tag_uid


def _employee_allowed_at(cp, emp):
	emps = {r.employee for r in cp.allowed_employees}
	depts = {r.department for r in cp.allowed_departments}
	if not emps and not depts:
		return True
	return emp.name in emps or (emp.department and emp.department in depts)


# ---------------------------------------------------------------- clock
@frappe.whitelist(methods=["POST"])
def clock(payload):
	p = json.loads(payload) if isinstance(payload, str) else payload
	action, method = p.get("action"), p.get("method")
	if action not in ACTIONS:
		frappe.throw(_("Invalid action"))
	emp = current_employee()
	policy = resolve_policy(emp)
	if not policy:
		frappe.throw(_("No attendance policy applies to you. Ask your administrator."))

	allowed = {"nfc": policy.allow_nfc, "location": policy.allow_location, "wifi": policy.allow_wifi}
	if not allowed.get(method):
		frappe.throw(_("You are not allowed to clock in this way."))

	# Same-employee concurrency guard
	frappe.db.sql("select name from `tabEmployee` where name=%s for update", emp.name)
	last = _last_event(emp.name)
	st = _status(last)
	valid = {"IN": st == "out", "OUT": st in ("in", "break"), "BREAK_START": st == "in", "BREAK_END": st == "break"}
	if not valid[action]:
		frappe.throw({"IN": _("You are already clocked in."), "OUT": _("You are not clocked in."),
		              "BREAK_START": _("Clock in before starting a break."), "BREAK_END": _("You are not on a break.")}[action])
	if action.startswith("BREAK") and not policy.breaks_enabled:
		frappe.throw(_("Breaks are not tracked for you."))
	if action == "IN" and policy.earliest_clock_in:
		earliest = get_datetime(f"{nowdate()} {policy.earliest_clock_in}")
		if now_datetime() < earliest:
			frappe.throw(_("Clock-in opens at {0}.").format(str(policy.earliest_clock_in)[:5]))

	flags, site, cp, tag_uid = [], None, None, None
	loc = p.get("location") or {}
	if method == "nfc":
		cp, tag_uid = _verify_tag_url((p.get("nfc") or {}).get("url"), (p.get("nfc") or {}).get("uid"))
		if not _employee_allowed_at(cp, emp):
			frappe.throw(_("You are not allowed to clock in at {0}.").format(cp.title))
		if (action == "IN" and not cp.allow_in) or (action == "OUT" and not cp.allow_out) or (action.startswith("BREAK") and not cp.allow_breaks):
			frappe.throw(_("This point cannot be used to {0}.").format(action.replace("_", " ").lower()))
		site = cp.title
		if cp.require_location or policy.require_location_for_nfc:
			_check_location(policy, loc)
	elif method == "location":
		site = _check_location(policy, loc)
	elif method == "wifi":
		site = _check_wifi(policy, p.get("wifi"))

	device_id = (p.get("deviceId") or "")[:140]
	if device_id and not frappe.db.exists("Employee Checkin", {"employee": emp.name, "device_id": device_id}):
		if frappe.db.exists("Employee Checkin", {"employee": emp.name}):
			flags.append("new_device")
	if p.get("offline"):
		flags.append("offline")

	wifi = p.get("wifi") or {}
	doc = frappe.get_doc({
		"doctype": "Employee Checkin",
		"employee": emp.name,
		"time": now_datetime(),  # server time, never the phone's clock
		"log_type": LOG_TYPE[action],
		"device_id": device_id,
		"latitude": loc.get("latitude"),
		"longitude": loc.get("longitude"),
		"qe_action": action, "qe_method": method, "qe_clock_point": cp.name if cp else None, "qe_site": site,
		"qe_accuracy": loc.get("accuracy"), "qe_ip": frappe.local.request_ip, "qe_tag_uid": tag_uid,
		"qe_wifi": " / ".join(x for x in (wifi.get("ssid"), wifi.get("bssid")) if x) or None,
		"qe_flags": ",".join(flags),
	})
	doc.insert(ignore_permissions=True)  # rules above are the permission check
	return _event(doc)


# ---------------------------------------------------------------- admin (tags)
@frappe.whitelist(methods=["GET"])
def clock_points():
	require_admin()
	out = []
	for r in frappe.get_all("QE Clock Point", {"enabled": 1}, ["name", "title", "building", "tag_type", "tag_url", "allow_in", "allow_out", "allow_breaks"], order_by="title"):
		acts = [a for a, on in (("IN", r.allow_in), ("OUT", r.allow_out), ("BREAK_START", r.allow_breaks)) if on]
		out.append({"name": r.name, "title": r.title, "building": r.building, "tagType": r.tag_type, "tagUrl": r.tag_url if r.tag_type == "Static" else None, "allowedActions": acts})
	return out


@frappe.whitelist(methods=["POST"])
def create_clock_point(title, building=None):
	require_admin()
	cp = frappe.get_doc({"doctype": "QE Clock Point", "title": title, "building": building, "tag_type": "Static", "enabled": 1}).insert()
	cp.reload()
	return {"name": cp.name, "title": cp.title, "building": cp.building, "tagType": cp.tag_type, "tagUrl": cp.tag_url, "allowedActions": ["IN", "OUT", "BREAK_START"]}


@frappe.whitelist(methods=["POST"])
def verify_tag(url, uid=None):
	require_admin()
	try:
		cp, tag_uid = _verify_tag_url(url, uid)
	except frappe.ValidationError as e:
		frappe.db.rollback()
		return {"ok": False, "message": str(e)}
	# a test tap must not consume a SUN counter permanently
	frappe.db.rollback()
	return {"ok": True, "clockPoint": cp.title, "message": _("Genuine tag{0}").format(f" · UID {tag_uid}" if tag_uid else "")}
