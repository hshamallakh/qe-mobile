import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

CHECKIN_FIELDS = {
	"Employee Checkin": [
		{"fieldname": "qe_sec", "fieldtype": "Section Break", "label": "QE Mobile", "insert_after": "skip_auto_attendance", "collapsible": 1},
		{"fieldname": "qe_action", "fieldtype": "Select", "label": "Action", "options": "\nIN\nOUT\nBREAK_START\nBREAK_END", "insert_after": "qe_sec", "read_only": 1, "in_list_view": 1},
		{"fieldname": "qe_method", "fieldtype": "Select", "label": "Method", "options": "\nnfc\nlocation\nwifi\nmanual", "insert_after": "qe_action", "read_only": 1, "in_standard_filter": 1},
		{"fieldname": "qe_clock_point", "fieldtype": "Link", "label": "Clock point", "options": "QE Clock Point", "insert_after": "qe_method", "read_only": 1},
		{"fieldname": "qe_site", "fieldtype": "Data", "label": "Matched site", "insert_after": "qe_clock_point", "read_only": 1},
		{"fieldname": "qe_col", "fieldtype": "Column Break", "insert_after": "qe_site"},
		{"fieldname": "qe_accuracy", "fieldtype": "Float", "label": "GPS accuracy (m)", "insert_after": "qe_col", "read_only": 1},
		{"fieldname": "qe_wifi", "fieldtype": "Data", "label": "Wi-Fi (SSID / BSSID)", "insert_after": "qe_accuracy", "read_only": 1},
		{"fieldname": "qe_ip", "fieldtype": "Data", "label": "Request IP", "insert_after": "qe_wifi", "read_only": 1},
		{"fieldname": "qe_tag_uid", "fieldtype": "Data", "label": "Tag UID", "insert_after": "qe_ip", "read_only": 1},
		{"fieldname": "qe_flags", "fieldtype": "Small Text", "label": "Flags", "insert_after": "qe_tag_uid", "read_only": 1},
	]
}


def after_install():
	after_migrate()


def after_migrate():
	create_custom_fields(CHECKIN_FIELDS, update=True)
	if not frappe.db.exists("Role", "QE Mobile Admin"):
		frappe.get_doc({"doctype": "Role", "role_name": "QE Mobile Admin", "desk_access": 1}).insert(ignore_permissions=True)
	if not frappe.db.exists("QE Attendance Policy", {"is_default": 1}):
		frappe.get_doc({
			"doctype": "QE Attendance Policy", "policy_name": "Default – NFC only", "is_default": 1, "priority": 0,
			"allow_nfc": 1, "allow_location": 0, "allow_wifi": 0, "breaks_enabled": 1, "max_gps_accuracy": 75,
			"notes": "Tap the NFC tag at the entrance or your desk to clock in and out.",
		}).insert(ignore_permissions=True)
