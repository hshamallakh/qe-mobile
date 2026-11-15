"""NTAG 424 DNA "Secure Unique NFC" (SUN) message verification (NXP AN12196).

A SUN tag rewrites its URL on every tap:  .../qe/t/CP-0001?e=<32 hex>&c=<16 hex>
  e = AES-128-CBC(SDMMetaReadKey, IV=0) of [0xC7 | UID(7) | counter(3, LSB first) | random pad]
  c = truncated CMAC proving the tag holds SDMFileReadKey (so a copied/cloned sticker fails)
The counter only goes up, so replaying an old URL is rejected.
"""
from __future__ import annotations

import binascii
from dataclasses import dataclass

from cryptography.hazmat.primitives import cmac
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes


@dataclass
class SunResult:
	uid: str  # hex, upper
	counter: int


class SunError(Exception):
	pass


def _cmac(key: bytes, data: bytes) -> bytes:
	c = cmac.CMAC(algorithms.AES(key))
	c.update(data)
	return c.finalize()


def _aes_cbc_decrypt(key: bytes, data: bytes) -> bytes:
	d = Cipher(algorithms.AES(key), modes.CBC(b"\x00" * 16)).decryptor()
	return d.update(data) + d.finalize()


def verify_sun(e_hex: str, c_hex: str, meta_key_hex: str, file_key_hex: str) -> SunResult:
	try:
		enc = binascii.unhexlify(e_hex)
		mac = binascii.unhexlify(c_hex)
		k_meta = binascii.unhexlify(meta_key_hex)
		k_file = binascii.unhexlify(file_key_hex)
	except (binascii.Error, ValueError):
		raise SunError("Malformed tag data")
	if len(enc) != 16 or len(mac) != 8 or len(k_meta) != 16 or len(k_file) != 16:
		raise SunError("Unexpected tag data length")

	plain = _aes_cbc_decrypt(k_meta, enc)
	tag = plain[0]
	if not (tag & 0x80 and tag & 0x40):  # UID and counter mirroring both enabled
		raise SunError("Tag is not configured to mirror UID and counter")
	uid_len = tag & 0x0F
	if uid_len != 7:
		raise SunError("Unsupported UID length")
	uid = plain[1:8]
	ctr_bytes = plain[8:11]
	counter = int.from_bytes(ctr_bytes, "little")

	# Session MAC key: CMAC(K_file, SV2), SV2 = 3CC3 0001 0080 || UID || CTR, zero padded to 16 bytes
	sv2 = bytes.fromhex("3CC300010080") + uid + ctr_bytes
	sv2 = sv2 + b"\x00" * (16 - len(sv2))
	k_ses = _cmac(k_file, sv2)
	full = _cmac(k_ses, b"")  # no encrypted file data mirrored before the MAC
	expected = full[1::2]
	import hmac

	if not hmac.compare_digest(expected, mac):
		raise SunError("Tag signature is invalid (possible copy of a tag)")
	return SunResult(uid=uid.hex().upper(), counter=counter)
