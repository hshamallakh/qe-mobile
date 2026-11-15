import secrets

import frappe
from frappe.model.document import Document
from frappe.utils import get_url


class QEClockPoint(Document):
	def validate(self):
		if self.bound_uid:
			self.bound_uid = self.bound_uid.replace(":", "").replace(" ", "").upper()
		if self.tag_type == "NTAG 424 DNA SUN":
			for f in ("sun_meta_key", "sun_file_key"):
				val = self.get(f)
				if val and "*" not in val and (len(val) != 32 or any(c not in "0123456789abcdefABCDEF" for c in val)):
					frappe.throw(f"{self.meta.get_label(f)} must be 32 hex characters (AES-128).")

	def after_insert(self):
		if self.tag_type == "Static":
			self.rotate_secret()

	@frappe.whitelist()
	def rotate_secret(self):
		secret = secrets.token_urlsafe(18)
		self.db_set("tag_secret", secret)  # Password field: stored encrypted
		self.db_set("tag_url", f"{get_url()}/qe/t/{self.name}?k={secret}")
		return self.tag_url
