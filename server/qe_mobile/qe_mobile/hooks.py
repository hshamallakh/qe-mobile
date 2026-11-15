app_name = "qe_mobile"
app_title = "QE Mobile"
app_publisher = "QE Projects"
app_description = "Server side of the QE Mobile app"
app_license = "Proprietary"
required_apps = ["frappe/erpnext", "frappe/hrms"]

# Device-token authentication for the mobile app (header: X-QE-Device-Token)
auth_hooks = ["qe_mobile.qe_mobile.api.auth.validate_device_token"]

after_install = "qe_mobile.install.after_install"
after_migrate = "qe_mobile.install.after_migrate"

# Friendly page if someone opens a clock-in tag URL in a browser
website_route_rules = [{"from_route": "/qe/t/<path:name>", "to_route": "qe_tag"}]

fixtures = [{"dt": "Role", "filters": [["name", "in", ["QE Mobile Admin"]]]}]
