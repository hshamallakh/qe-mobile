# NXP AN12196 example (all-zero keys): UID 04DE5F1EACC040, counter 61
from sun import SunError, verify_sun

Z = "00" * 16
r = verify_sun("EF963FF7828658A599F3041510671E88", "94EED9EE65337086", Z, Z)
assert (r.uid, r.counter) == ("04DE5F1EACC040", 61), r
try:
    verify_sun("EF963FF7828658A599F3041510671E88", "94EED9EE65337087", Z, Z)
    raise AssertionError("tampered MAC accepted")
except SunError:
    pass
print("ok")
