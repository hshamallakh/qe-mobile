# Generates Frappe DocType JSON from compact specs (kept in the repo for maintenance).
import json, os, re
MOD = "QE Mobile"
BASE = "qe_mobile/qe_mobile/doctype"

def f(fieldname, fieldtype, label=None, **kw):
    d = {"fieldname": fieldname, "fieldtype": fieldtype, "label": label or fieldname.replace("_", " ").title()}
    d.update(kw); return d

def sb(name, label=None, **kw): return f(name, "Section Break", label or "", **kw)
def cb(name): return {"fieldname": name, "fieldtype": "Column Break"}

PERM_ADMIN = [{"role": r, "read": 1, "write": 1, "create": 1, "delete": 1, "report": 1, "export": 1, "print": 1, "email": 1, "share": 1}
              for r in ("System Manager", "HR Manager", "QE Mobile Admin")]

SPECS = {
 "QE Clock Point": dict(autoname="format:CP-{####}", title_field="title", track_changes=1, fields=[
    f("title", "Data", reqd=1, in_list_view=1), f("building", "Data", in_list_view=1, in_standard_filter=1),
    f("enabled", "Check", default="1", in_list_view=1), cb("cb1"),
    f("tag_type", "Select", options="Static\nNTAG 424 DNA SUN", default="Static", reqd=1, in_list_view=1),
    f("bound_uid", "Data", "Bound tag UID", description="Optional. If set, only the tag with this UID is accepted (hex, e.g. 04A1B2C3D4E580)."),
    sb("sec_static", "Static tag", depends_on="eval:doc.tag_type=='Static'"),
    f("tag_secret", "Password", "Tag secret", read_only=1, description="Generated automatically. Rotating it means re-writing the sticker."),
    f("tag_url", "Small Text", "URL written on the tag", read_only=1),
    sb("sec_sun", "NTAG 424 DNA (secure, anti-copy)", depends_on="eval:doc.tag_type=='NTAG 424 DNA SUN'"),
    f("sun_meta_key", "Password", "SDM Meta Read key (hex)"), f("sun_file_key", "Password", "SDM File Read key (hex)"),
    f("last_counter", "Int", "Last tap counter", read_only=1, default="0"),
    sb("sec_rules", "Rules"),
    f("allow_in", "Check", "Allow clock in", default="1"), f("allow_out", "Check", "Allow clock out", default="1"),
    f("allow_breaks", "Check", "Allow breaks", default="1"), cb("cb2"),
    f("require_location", "Check", "Also require GPS inside a geofence"),
    sb("sec_who", "Who can use this point", description="Leave both tables empty to allow every active employee."),
    f("allowed_employees", "Table MultiSelect", options="QE Clock Point Employee"),
    f("allowed_departments", "Table MultiSelect", options="QE Clock Point Department"),
 ], permissions=PERM_ADMIN + [{"role": "Employee", "read": 1}]),
 "QE Clock Point Employee": dict(istable=1, fields=[f("employee", "Link", options="Employee", reqd=1, in_list_view=1)]),
 "QE Clock Point Department": dict(istable=1, fields=[f("department", "Link", options="Department", reqd=1, in_list_view=1)]),

 "QE Attendance Policy": dict(autoname="field:policy_name", track_changes=1, fields=[
    f("policy_name", "Data", reqd=1, unique=1, in_list_view=1),
    f("is_default", "Check", "Default policy", in_list_view=1), cb("cb0"),
    f("priority", "Int", default="10", description="Higher wins when an employee matches several policies."),
    sb("sec_applies", "Applies to", description="Empty = nobody (unless default)."),
    f("employees", "Table MultiSelect", options="QE Clock Point Employee"),
    f("departments", "Table MultiSelect", options="QE Clock Point Department"),
    sb("sec_methods", "Allowed clock-in methods (Connecteam: clock-in devices)"),
    f("allow_nfc", "Check", "NFC tags", default="1"), f("allow_location", "Check", "App – inside a geofence"),
    f("allow_wifi", "Check", "App – on embassy Wi-Fi"), cb("cb1"),
    f("breaks_enabled", "Check", "Track breaks", default="1"),
    f("require_location_for_nfc", "Check", "Also capture GPS on NFC taps"),
    f("max_gps_accuracy", "Int", "Reject GPS fixes worse than (m)", default="75"),
    sb("sec_geo", "Geofences", depends_on="allow_location"),
    f("sites", "Table", options="QE Geo Site"),
    sb("sec_wifi", "Embassy network", depends_on="allow_wifi"),
    f("allowed_subnets", "Small Text", "Embassy LAN / public IP ranges (CIDR, one per line)",
      description="Strongest check: the request must come from these networks. e.g. 10.10.0.0/16 or your office public IP/32."),
    f("require_subnet", "Check", "Require the network check", default="1"),
    f("wifi_networks", "Table", options="QE Wifi Network"),
    sb("sec_limits", "Limitations"),
    f("earliest_clock_in", "Time", "Earliest clock in"), f("auto_clock_out_after_hours", "Float", "Flag shifts longer than (hours)", default="12"),
    cb("cb3"), f("notes", "Small Text", "Message shown to employees"),
 ], permissions=PERM_ADMIN),
 "QE Geo Site": dict(istable=1, fields=[
    f("site_name", "Data", reqd=1, in_list_view=1), f("latitude", "Float", reqd=1, in_list_view=1, precision="7"),
    f("longitude", "Float", reqd=1, in_list_view=1, precision="7"), f("radius_m", "Int", "Radius (m)", default="80", in_list_view=1)]),
 "QE Wifi Network": dict(istable=1, fields=[
    f("ssid", "Data", "SSID", reqd=1, in_list_view=1),
    f("bssids", "Small Text", "Access point MACs (one per line, optional)", in_list_view=1)]),

 "QE Mobile Device": dict(autoname="hash", title_field="device_name", fields=[
    f("user", "Link", options="User", reqd=1, in_list_view=1, in_standard_filter=1),
    f("employee", "Link", options="Employee", in_list_view=1), f("active", "Check", default="1", in_list_view=1),
    cb("cb1"), f("device_id", "Data", "Device ID"), f("device_name", "Data"), f("platform", "Data"),
    f("app_version", "Data"), sb("sec2"), f("token_hash", "Data", hidden=1, unique=1),
    f("last_seen", "Datetime", read_only=1), f("last_ip", "Data", "Last IP", read_only=1),
 ], permissions=PERM_ADMIN),

 "QE Mobile Settings": dict(issingle=1, fields=[
    f("company_label", "Data", "Organisation name shown in the app"),
    f("privacy_policy_url", "Data", "Privacy policy URL", options="URL"),
    f("directory_show_mobile", "Check", "Show mobile numbers in the directory"),
    sb("sec_mod", "Modules in the mobile app", description="Which roles see which module. Empty table = defaults (all v0.1 modules for Employee)."),
    f("modules", "Table", options="QE Mobile Module"),
 ], permissions=[{"role": r, "read": 1, "write": 1, "create": 1} for r in ("System Manager", "HR Manager", "QE Mobile Admin")]),
 "QE Mobile Module": dict(istable=1, fields=[
    f("module", "Select", options="attendance\ntimeoff\ndirectory\nscanner\nschedule\nforms\ntasks\nupdates\ndocuments\npurchase_orders\nwork_orders\nfleet", reqd=1, in_list_view=1),
    f("role", "Link", options="Role", reqd=1, in_list_view=1, description="Users with this role see the module"),
    f("admin_role", "Link", options="Role", in_list_view=1, description="Users with this role also get the module's admin screens"),
    f("enabled", "Check", default="1", in_list_view=1)]),
}

def snake(n): return re.sub(r"\W+", "_", n.lower()).strip("_")

for name, spec in SPECS.items():
    s = dict(spec); fields = s.pop("fields"); perms = s.pop("permissions", [])
    for i, fl in enumerate(fields): fl.setdefault("idx", i + 1)
    doc = {"doctype": "DocType", "name": name, "module": MOD, "custom": 0, "engine": "InnoDB",
           "fields": fields, "field_order": [x["fieldname"] for x in fields], "permissions": perms,
           "sort_field": "modified", "sort_order": "DESC", "owner": "Administrator", "modified_by": "Administrator",
           "modified": "2026-11-15 22:00:00.000000", "creation": "2026-11-15 22:00:00.000000", **s}
    d = os.path.join(BASE, snake(name)); os.makedirs(d, exist_ok=True)
    open(os.path.join(d, "__init__.py"), "w").close()
    json.dump(doc, open(os.path.join(d, snake(name) + ".json"), "w"), indent=1, sort_keys=True)
    py = os.path.join(d, snake(name) + ".py")
    if not os.path.exists(py):
        cls = name.replace(" ", "")
        open(py, "w").write(f"from frappe.model.document import Document\n\n\nclass {cls}(Document):\n\tpass\n")
print("ok", len(SPECS))
