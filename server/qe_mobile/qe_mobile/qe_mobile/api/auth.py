"""Per-device tokens for the mobile app.

The app sends `X-QE-Device-Token`. Only a SHA-256 hash is stored, tokens can be revoked per phone
(QE Mobile Device → untick Active), and every clock-in records which device it came from.
"""
import hashlib
import secrets

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import now_datetime
from frappe.utils.password import check_password

HEADER = "X-Qe-Device-Token"


def _hash(token: str) -> str:
	return hashlib.sha256(token.encode()).hexdigest()


def validate_device_token():
	"""auth_hooks entry: authenticate the request if it carries a valid device token."""
	token = frappe.get_request_header("X-QE-Device-Token") or frappe.get_request_header(HEADER)
	if not token:
		return
	dev = frappe.db.get_value("QE Mobile Device", {"token_hash": _hash(token), "active": 1}, ["name", "user", "last_seen"], as_dict=True)
	if not dev:
		raise frappe.AuthenticationError(_("This phone has been signed out. Please sign in again."))
	if not frappe.db.get_value("User", dev.user, "enabled"):
		raise frappe.AuthenticationError(_("Your account is disabled."))
	frappe.set_user(dev.user)
	frappe.local.qe_device = dev.name
	# Throttle writes: update last_seen at most every 5 minutes
	now = now_datetime()
	if not dev.last_seen or (now - dev.last_seen).total_seconds() > 300:
		frappe.db.set_value("QE Mobile Device", dev.name, {"last_seen": now, "last_ip": frappe.local.request_ip}, update_modified=False)


def _resolve_user(usr: str) -> str | None:
	usr = (usr or "").strip()
	if not usr:
		return None
	if frappe.db.exists("User", usr):
		return usr
	return frappe.db.get_value("User", {"email": usr}) or frappe.db.get_value("User", {"username": usr}) or frappe.db.get_value("User", {"mobile_no": usr})


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=60 * 10)
def login(usr: str, pwd: str, deviceId: str = "", deviceName: str = "", platform: str = "", appVersion: str = ""):
	user = _resolve_user(usr)
	generic = _("Incorrect username or password.")
	if not user or user in ("Guest", "Administrator"):
		frappe.throw(generic, frappe.AuthenticationError)
	if not frappe.db.get_value("User", user, "enabled"):
		frappe.throw(_("Your account is disabled."), frappe.AuthenticationError)
	try:
		check_password(user, pwd)
	except frappe.AuthenticationError:
		frappe.throw(generic, frappe.AuthenticationError)

	token = secrets.token_urlsafe(32)
	employee = frappe.db.get_value("Employee", {"user_id": user, "status": "Active"})
	# One active token per user+device: re-login replaces the old one
	for old in frappe.get_all("QE Mobile Device", {"user": user, "device_id": deviceId, "active": 1}, pluck="name"):
		frappe.db.set_value("QE Mobile Device", old, "active", 0)
	frappe.get_doc({
		"doctype": "QE Mobile Device", "user": user, "employee": employee, "active": 1,
		"device_id": deviceId[:140], "device_name": deviceName[:140], "platform": platform[:20], "app_version": appVersion[:20],
		"token_hash": _hash(token), "last_seen": now_datetime(), "last_ip": frappe.local.request_ip,
	}).insert(ignore_permissions=True)
	frappe.db.commit()
	return {"token": token}


@frappe.whitelist(methods=["POST"])
def logout():
	dev = getattr(frappe.local, "qe_device", None)
	if dev:
		frappe.db.set_value("QE Mobile Device", dev, "active", 0)
	return {"ok": True}
