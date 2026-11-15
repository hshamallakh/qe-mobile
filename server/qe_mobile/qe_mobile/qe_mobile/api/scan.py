import frappe
from frappe import _


def _fields(doc, names):
	out = []
	for n in names:
		v = doc.get(n)
		if v not in (None, ""):
			out.append({"label": doc.meta.get_label(n) or n, "value": str(v)})
	return out


@frappe.whitelist(methods=["POST"])
def resolve(code, format=None):
	code = (code or "").strip()[:200]
	if not code:
		return {"found": False, "message": _("Empty code")}

	candidates = []
	if frappe.db.exists("Asset", code):
		candidates.append(("Asset", code))
	item = frappe.db.get_value("Item Barcode", {"barcode": code}, "parent")
	if item:
		candidates.append(("Item", item))
	if frappe.db.exists("Item", code):
		candidates.append(("Item", code))
	if frappe.db.exists("Serial No", code):
		candidates.append(("Serial No", code))
	if frappe.db.exists("Employee", code):
		candidates.append(("Employee", code))

	for dt, name in candidates:
		if not frappe.has_permission(dt, "read", name):
			continue
		doc = frappe.get_doc(dt, name)
		cols = {
			"Asset": ["asset_name", "asset_category", "location", "custodian", "status", "purchase_date"],
			"Item": ["item_name", "item_group", "stock_uom", "description"],
			"Serial No": ["item_code", "status", "warehouse", "warranty_expiry_date"],
			"Employee": ["employee_name", "designation", "department", "status"],
		}[dt]
		return {"found": True, "doctype": dt, "docname": name, "title": doc.get_title(), "fields": _fields(doc, cols)}
	return {"found": False, "message": _("Nothing in the ERP matches this code (or you don't have access to it).")}
