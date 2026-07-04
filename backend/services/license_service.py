"""License + key-generation service.

Reuses the EXISTING crypto/activation logic in the legacy `License.py`
(machine-ID fingerprint, HG-key signing/validation, LicenseManager online
verification). License.py imports PyQt5 at module level but does not construct
any widgets on import, so it is safe to import here lazily (kept out of app
startup so a missing PyQt5 never breaks the API server).

KeyGen duration-precedence logic (KeyGen.py:300) is ported verbatim so admin
key generation matches the legacy GUI exactly.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Any


def _stub_pyqt5() -> None:
    """Inject dummy PyQt5 modules so License.py imports headlessly.

    License.py does `from PyQt5...import ...` at module level (for its activation
    dialog) but the crypto/activation functions we use never touch Qt. In the
    frozen EXE PyQt5 is excluded, so we provide stand-in modules. We do NOT
    modify the legacy module.
    """
    import sys
    import types

    if "PyQt5" in sys.modules:
        return
    try:
        import PyQt5  # noqa: F401  — real PyQt5 present (dev env); nothing to stub
        return
    except Exception:
        pass

    class _Stub:
        """Any attribute access / call / subclassing yields another stub."""
        def __getattr__(self, _name): return _Stub()
        def __call__(self, *a, **k): return _Stub()

    def _make(name: str, attrs: list[str]) -> types.ModuleType:
        mod = types.ModuleType(name)
        for attr in attrs:
            setattr(mod, attr, _Stub)
        mod.__getattr__ = lambda _n: _Stub  # type: ignore[attr-defined]
        return mod

    pkg = types.ModuleType("PyQt5")
    pkg.__path__ = []  # mark as package
    sys.modules["PyQt5"] = pkg
    sys.modules["PyQt5.QtWidgets"] = _make("PyQt5.QtWidgets", [
        "QDialog", "QVBoxLayout", "QHBoxLayout", "QLabel",
        "QLineEdit", "QPushButton", "QFrame", "QApplication",
    ])
    sys.modules["PyQt5.QtCore"] = _make("PyQt5.QtCore", ["Qt", "QTimer"])
    sys.modules["PyQt5.QtGui"] = _make("PyQt5.QtGui", ["QPixmap", "QIcon"])


@lru_cache(maxsize=1)
def _lic():
    """Lazy-import the legacy License module (PyQt5 stubbed if unavailable)."""
    _stub_pyqt5()
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    import License  # noqa: PLC0415
    return License


def machine_id() -> dict:
    lic = _lic()
    raw = lic.get_machine_id()
    return {"machine_id": raw, "formatted": lic.format_machine_id(raw)}


def status() -> dict:
    """Current activation status for this machine (no network unless activated)."""
    lic = _lic()
    mgr = lic.LicenseManager()
    data = mgr._load()  # noqa: SLF001 — legacy accessor, read-only
    key = data.get("key")
    if not key:
        return {"activated": False, "expiry": None, "remaining_days": None,
                "telegram_user": "", "duration_label": None}
    # validate_key is local/offline; is_activated() would hit the network.
    valid = lic.validate_key(key)
    info = lic.parse_key_info(key)
    exp = info.get("expiry")
    return {
        "activated": bool(valid),
        "expiry": exp.strftime("%d %b %Y") if exp else "Lifetime",
        "remaining_days": mgr.get_remaining_days() if valid else None,
        "telegram_user": data.get("telegram_user", ""),
        "duration_label": info.get("label"),
    }


def validate(key: str) -> dict:
    lic = _lic()
    ok = lic.validate_key(key)
    info = lic.parse_key_info(key)
    exp = info.get("expiry")
    return {
        "valid": bool(ok),
        "label": info.get("label", "Unknown"),
        "expiry": exp.strftime("%d %b %Y") if exp else ("Lifetime" if ok else None),
    }


def activate(key: str, telegram_user: str = "") -> dict:
    lic = _lic()
    mgr = lic.LicenseManager()
    ok = mgr.activate(key, telegram_user=telegram_user)
    return {"activated": bool(ok), **(status() if ok else {})}


def deactivate() -> dict:
    _lic().LicenseManager().deactivate()
    return {"activated": False}


def generate_key(machine_id_input: str, days: int = 0, months: int = 0, years: int = 0) -> dict:
    """Admin key generation. Duration precedence ported from KeyGen.py:300.

    Lifetime (all zero) -> Years -> Months -> Days, with mixed-unit fallthrough
    to a day-count, exactly as the legacy admin GUI computed it.
    """
    lic = _lic()
    mid_raw = machine_id_input.strip().upper().replace("-", "").replace(" ", "")
    if len(mid_raw) < 4:
        raise ValueError("Machine ID is too short.")

    if days == 0 and months == 0 and years == 0:
        key = lic.generate_key(mid_raw, "lifetime")
    elif years > 0:
        total_months = (years * 12) + months
        if total_months % 12 == 0 and days == 0:
            key = lic.generate_key(mid_raw, "years", total_months // 12)
        elif days == 0:
            key = lic.generate_key(mid_raw, "months", total_months)
        else:
            total_days = days + (months * 30) + (years * 365)
            key = lic.generate_key(mid_raw, "days", total_days)
    elif months > 0:
        if days == 0:
            key = lic.generate_key(mid_raw, "months", months)
        else:
            key = lic.generate_key(mid_raw, "days", days + (months * 30))
    else:
        key = lic.generate_key(mid_raw, "days", days)

    info = lic.parse_key_info(key)
    exp = info.get("expiry")
    return {"key": key, "label": info.get("label"),
            "expiry": exp.strftime("%d %b %Y") if exp else "Lifetime"}
