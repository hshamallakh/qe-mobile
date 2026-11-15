import frappe

from .core import current_employee


@frappe.whitelist(methods=["GET"])
def search(q=""):
	current_employee(required=False)
	show_mobile = frappe.db.get_single_value("QE Mobile Settings", "directory_show_mobile")
	filters = {"status": "Active"}
	or_filters = None
	q = (q or "").strip()
	if q:
		like = f"%{q}%"
		or_filters = {"employee_name": ("like", like), "designation": ("like", like), "department": ("like", like)}
	# Directory is intentionally visible to all signed-in employees, limited to these work fields
	rows = frappe.get_all(
		"Employee", filters=filters, or_filters=or_filters,
		fields=["name", "employee_name", "designation", "department", "branch", "company_email", "cell_number", "image"],
		order_by="employee_name asc", limit=200, ignore_permissions=True,
	)
	return [{"employee": r.name, "name": r.employee_name, "designation": r.designation, "department": r.department, "branch": r.branch,
	         "email": r.company_email, "phone": r.cell_number if show_mobile else None, "imageUrl": r.image} for r in rows]
