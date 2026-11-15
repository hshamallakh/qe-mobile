import frappe
from frappe import _
from frappe.utils import get_url, now_datetime

DEFAULT_MODULES = ["attendance", "timeoff", "directory", "scanner"]
ADMIN_ROLES = {"System Manager", "HR Manager", "QE Mobile Admin"}


def current_employee(required=True):
	emp = frappe.db.get_value(
		"Employee", {"user_id": frappe.session.user, "status": "Active"},
		["name", "employee_name", "designation", "department", "branch", "image"], as_dict=True,
	)
	if not emp and required:
		frappe.throw(_("Your user is not linked to an active Employee record. Ask HR to link it."), frappe.PermissionError)
	return emp


def is_admin() -> bool:
	return bool(ADMIN_ROLES & set(frappe.get_roles()))


def require_admin():
	if not is_admin():
		frappe.throw(_("Not permitted"), frappe.PermissionError)


def module_grants(roles: set[str]):
	settings = frappe.get_cached_doc("QE Mobile Settings")
	rows = [r for r in (settings.modules or []) if r.enabled]
	if not rows:
		admin = bool(ADMIN_ROLES & roles)
		return [{"id": m, "enabled": True, "admin": admin and m == "attendance"} for m in DEFAULT_MODULES]
	out = {}
	for r in rows:
		if r.role in roles:
			g = out.setdefault(r.module, {"id": r.module, "enabled": True, "admin": False})
			if r.admin_role and r.admin_role in roles:
				g["admin"] = True
	return list(out.values())


def resolve_policy(emp):
	"""Pick the attendance policy for an employee: explicit employee > department > default; then priority."""
	candidates = []
	for p in frappe.get_all("QE Attendance Policy", fields=["name", "is_default", "priority"]):
		doc = frappe.get_cached_doc("QE Attendance Policy", p.name)
		emps = {r.employee for r in doc.employees}
		depts = {r.department for r in doc.departments}
		if emp and emp.name in emps:
			candidates.append((3, doc.priority or 0, doc))
		elif emp and emp.department and emp.department in depts:
			candidates.append((2, doc.priority or 0, doc))
		elif doc.is_default:
			candidates.append((1, doc.priority or 0, doc))
	if not candidates:
		return None
	candidates.sort(key=lambda c: (c[0], c[1]), reverse=True)
	return candidates[0][2]


def policy_for_app(doc):
	if not doc:
		return {"allowedMethods": [], "breaksEnabled": False, "requireLocationForNfc": False, "maxGpsAccuracyMeters": 75, "sites": [], "wifi": [],
		        "notes": _("No attendance policy applies to you yet.")}
	methods = [m for m, on in (("nfc", doc.allow_nfc), ("location", doc.allow_location), ("wifi", doc.allow_wifi)) if on]
	return {
		"allowedMethods": methods,
		"breaksEnabled": bool(doc.breaks_enabled),
		"requireLocationForNfc": bool(doc.require_location_for_nfc),
		"maxGpsAccuracyMeters": doc.max_gps_accuracy or 75,
		"sites": [{"name": s.site_name, "latitude": s.latitude, "longitude": s.longitude, "radiusMeters": s.radius_m or 80} for s in doc.sites],
		"wifi": [{"ssid": w.ssid} for w in doc.wifi_networks],  # BSSIDs and subnets stay server-side
		"notes": doc.notes or "",
	}


@frappe.whitelist(methods=["GET"])
def bootstrap():
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Not signed in"), frappe.AuthenticationError)
	roles = set(frappe.get_roles())
	emp = current_employee(required=False)
	settings = frappe.get_cached_doc("QE Mobile Settings")
	company = frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")
	u = frappe.db.get_value("User", user, ["full_name", "user_image"], as_dict=True)
	return {
		"user": {
			"user": user, "fullName": (emp and emp.employee_name) or u.full_name, "employee": emp and emp.name,
			"designation": emp and emp.designation, "department": emp and emp.department, "roles": sorted(roles),
			"imageUrl": (emp and emp.image) or u.user_image,
		},
		"modules": module_grants(roles),
		"attendance": policy_for_app(resolve_policy(emp)),
		"company": {"name": settings.company_label or company or "", "timezone": frappe.utils.get_system_timezone(),
		            "privacyPolicyUrl": settings.privacy_policy_url or None},
		"serverTime": now_datetime().isoformat(),
	}
