import json

import frappe
from frappe import _
from frappe.utils import nowdate

from .core import current_employee


@frappe.whitelist(methods=["GET"])
def leave_types():
	emp = current_employee()
	out = []
	try:
		from hrms.hr.doctype.leave_application.leave_application import get_leave_details

		details = get_leave_details(emp.name, nowdate())
		for lt, d in (details.get("leave_allocation") or {}).items():
			out.append({"name": lt, "balance": d.get("remaining_leaves")})
		for lwp in details.get("lwps") or []:
			out.append({"name": lwp, "unlimited": True})
	except Exception:
		frappe.log_error("QE Mobile: leave balance")
	if not out:
		out = [{"name": n, "unlimited": True} for n in frappe.get_all("Leave Type", {"is_lwp": 1}, pluck="name")]
	return out


@frappe.whitelist(methods=["GET"])
def my_leaves():
	emp = current_employee()
	rows = frappe.get_all(
		"Leave Application", {"employee": emp.name, "docstatus": ("<", 2)},
		["name", "leave_type", "from_date", "to_date", "half_day", "total_leave_days", "status", "description"],
		order_by="from_date desc", limit=50,
	)
	return [{"name": r.name, "leaveType": r.leave_type, "fromDate": str(r.from_date), "toDate": str(r.to_date), "halfDay": bool(r.half_day),
	         "totalDays": r.total_leave_days, "status": r.status, "reason": r.description} for r in rows]


@frappe.whitelist(methods=["POST"])
def apply(payload):
	p = json.loads(payload) if isinstance(payload, str) else payload
	emp = current_employee()
	approver = frappe.db.get_value("Employee", emp.name, "leave_approver")
	doc = frappe.get_doc({
		"doctype": "Leave Application", "employee": emp.name, "leave_type": p["leaveType"],
		"from_date": p["fromDate"], "to_date": p["toDate"], "half_day": 1 if p.get("halfDay") else 0,
		"half_day_date": p["fromDate"] if p.get("halfDay") else None, "description": p.get("reason") or "",
		"leave_approver": approver, "status": "Open", "posting_date": nowdate(),
	})
	doc.insert()  # normal Employee permissions apply
	return {"name": doc.name, "leaveType": doc.leave_type, "fromDate": str(doc.from_date), "toDate": str(doc.to_date),
	        "halfDay": bool(doc.half_day), "totalDays": doc.total_leave_days, "status": doc.status, "reason": doc.description}
