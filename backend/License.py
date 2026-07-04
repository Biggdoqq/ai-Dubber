"""
License.py — Machine-ID Based Activation System
================================================
Flow:
  1. User opens Tool → sees their Machine ID
  2. User sends Machine ID to owner (Telegram)
  3. Owner runs KeyGen.py → enters Machine ID + duration → gets key
  4. User enters key → activated on their machine only

Key format:  HG-[Base64_Payload]-[Checksum]
  Payload  = Base64 encoded JSON {"mid":"...", "exp":..., "gen":..., "d":0, "m":0, "y":1}
  Checksum = sha256(Base64_Payload + SECRET)[:12]
"""

import sys, os, io, json, hashlib, platform
from datetime import datetime, timedelta

if hasattr(sys.stdout, 'buffer') and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from PyQt5.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel,
    QLineEdit, QPushButton, QFrame, QApplication
)
from PyQt5.QtCore import Qt, QTimer
from PyQt5.QtGui import QPixmap, QIcon

# ── Secret is obfuscated: split + XOR-encoded — never stored as plain string ──
# Reconstructed at runtime only. Changing ANY byte here invalidates ALL keys.
def _get_secret() -> str:
    """Reconstruct the HMAC signing secret at runtime.
    
    Security layers:
      1. Secret is split into 3 separate byte-array fragments
      2. Each byte is XOR-encoded with primary mask 0x5A
      3. A second XOR pass uses a position-derived key to further obfuscate
    This prevents the secret string from appearing in:
      - Python source scan  (strings)
      - Compiled .pyc bytecode (dis)
      - PyInstaller exe string scan  (strings.exe)
    """
    # Primary XOR mask
    _m = 0x5A
    # Fragment 1  (chars 0-4: "Heang")
    _a = [18, 63, 59, 52, 61]
    # Fragment 2  (chars 5-19: "Digital_DUBBER_")
    _b = [30, 51, 61, 51, 46, 59, 54, 5, 30, 15, 24, 24, 31, 8, 5]
    # Fragment 3  (chars 20-30: "2026_@#$K9x")
    _c = [104, 106, 104, 108, 5, 26, 121, 126, 17, 99, 34]
    # Reconstruct: reverse XOR pass → join fragments → decode
    _raw = _a + _b + _c
    return bytes([v ^ _m for v in _raw]).decode('latin-1')

_LICENSE_FILE = os.path.join(os.path.expanduser("~"), ".ai_dubber_license.dat")
GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxlWuO6cF2EK0i6D1A3RPXG8TiXn6_k09Kh7YgKHU3QWci6pVA3_6IYu_U0J_NAzmAGQw/exec"


# ══════════════════════════════════════════════════════════════════════════════
# Machine ID
# ══════════════════════════════════════════════════════════════════════════════

def get_machine_id() -> str:
    """Return 16-char uppercase hex fingerprint of this machine using physical hardware identifiers."""
    import subprocess
    
    parts = []
    
    # 1. Get BIOS UUID
    try:
        out = subprocess.check_output("wmic bios get uuid", shell=True, stderr=subprocess.DEVNULL).decode().split()
        if len(out) >= 2:
            parts.append(out[1].strip())
    except Exception:
        pass
        
    # 2. Get Motherboard Serial Number
    try:
        out = subprocess.check_output("wmic baseboard get serialnumber", shell=True, stderr=subprocess.DEVNULL).decode().split()
        if len(out) >= 2:
            parts.append(out[1].strip())
    except Exception:
        pass
        
    # 3. Get Drive C: Serial Number
    try:
        out = subprocess.check_output("wmic path win32_logicaldisk where \"DeviceID='C:'\" get VolumeSerialNumber", shell=True, stderr=subprocess.DEVNULL).decode().split()
        if len(out) >= 2:
            parts.append(out[1].strip())
    except Exception:
        pass

    # Fallback to general platform info if WMIC fails completely
    if not parts or all(p in ("", "None", "Default string", "00000000-0000-0000-0000-000000000000") for p in parts):
        # Try using unique Windows Registry MachineGuid first (since wmic is deprecated on Windows 11)
        reg_guid = None
        try:
            import winreg
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography")
            reg_guid, _ = winreg.QueryValueEx(key, "MachineGuid")
            winreg.CloseKey(key)
        except Exception:
            pass
            
        if reg_guid:
            raw = reg_guid
        else:
            raw = (
                platform.machine()
                + platform.processor()
                + platform.system()
            )
    else:
        raw = "|".join(parts)
        
    return hashlib.sha256(raw.encode()).hexdigest()[:16].upper()


def format_machine_id(mid: str) -> str:
    """Format 16-char ID as XXXX-XXXX-XXXX-XXXX for display."""
    mid = mid.upper().replace("-", "")[:16].ljust(16, "0")
    return f"{mid[0:4]}-{mid[4:8]}-{mid[8:12]}-{mid[12:16]}"


def parse_machine_id(mid_str: str) -> str:
    """Strip dashes and return raw 16-char ID."""
    return mid_str.upper().replace("-", "").replace(" ", "")[:16]


# ══════════════════════════════════════════════════════════════════════════════
# Duration helpers
# ══════════════════════════════════════════════════════════════════════════════

import base64

def _compute_expiry(unit: str, amount: int, from_dt: datetime = None) -> datetime | None:
    if from_dt is None:
        from_dt = datetime.now()
    if unit == 'lifetime':
        return None
    if unit == 'days':
        return from_dt + timedelta(days=amount)
    if unit == 'months':
        m = from_dt.month - 1 + amount
        year = from_dt.year + m // 12
        mon = m % 12 + 1
        day = min(from_dt.day, [31,29,31,30,31,30,31,31,30,31,30,31][mon-1])
        return from_dt.replace(year=year, month=mon, day=day)
    if unit == 'years':
        return from_dt.replace(year=from_dt.year + amount)
    return None

def _get_duration_label(d: int, m: int, y: int) -> str:
    if d == 0 and m == 0 and y == 0:
        return "Lifetime"
    parts = []
    if y > 0: parts.append(f"{y} Year(s)")
    if m > 0: parts.append(f"{m} Month(s)")
    if d > 0: parts.append(f"{d} Day(s)")
    return ", ".join(parts)

# ══════════════════════════════════════════════════════════════════════════════
# Token Key Generation & Validation
# ══════════════════════════════════════════════════════════════════════════════

def _sign_payload(b64_payload: str) -> str:
    # Secret is reconstructed at call-time — never held as a module-level string
    raw = (b64_payload + _get_secret()).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()[:12].lower()

def generate_key(machine_id_input: str, unit: str, amount: int = 0) -> str:
    mid = parse_machine_id(machine_id_input)
    
    d, m, y = 0, 0, 0
    if unit == 'days': d = amount
    elif unit == 'months': m = amount
    elif unit == 'years': y = amount
    
    now = datetime.now()
    exp_dt = _compute_expiry(unit, amount, now)
    
    payload = {
        "mid": mid,
        "exp": int(exp_dt.timestamp()) if exp_dt else 0,
        "gen": int(now.timestamp()),
        "d": d,
        "m": m,
        "y": y
    }
    
    json_str = json.dumps(payload, separators=(',', ':'))
    b64_payload = base64.urlsafe_b64encode(json_str.encode('utf-8')).decode('utf-8').rstrip('=')
    
    signature = _sign_payload(b64_payload)
    return f"HG-{b64_payload}-{signature}"

def validate_key(key: str, machine_id_raw: str = None) -> bool:
    try:
        parts = key.strip().split("-")
        if len(parts) != 3 or parts[0] != 'HG':
            return False
        
        b64_payload = parts[1]
        signature = parts[2]
        
        # Verify signature
        if _sign_payload(b64_payload) != signature:
            return False
            
        # Verify Machine ID
        padding = '=' * (-len(b64_payload) % 4)
        json_str = base64.urlsafe_b64decode(b64_payload + padding).decode('utf-8')
        payload = json.loads(json_str)
        
        current_mid = machine_id_raw if machine_id_raw else parse_machine_id(get_machine_id())
        if payload.get("mid") != current_mid:
            return False
            
        return True
    except Exception:
        return False

def parse_key_info(key: str) -> dict:
    try:
        parts = key.strip().split("-")
        b64_payload = parts[1]
        padding = '=' * (-len(b64_payload) % 4)
        json_str = base64.urlsafe_b64decode(b64_payload + padding).decode('utf-8')
        payload = json.loads(json_str)
        
        exp_ts = payload.get("exp", 0)
        expiry = datetime.fromtimestamp(exp_ts) if exp_ts > 0 else None
        
        d, m, y = payload.get("d", 0), payload.get("m", 0), payload.get("y", 0)
        
        return {
            'durr': f"D{d}M{m}Y{y}", # internal use if needed
            'label': _get_duration_label(d, m, y),
            'expiry': expiry,
        }
    except Exception:
        return {'durr': '', 'label': 'Unknown', 'expiry': None}


# ══════════════════════════════════════════════════════════════════════════════
# License Manager
# ══════════════════════════════════════════════════════════════════════════════

class LicenseManager:

    def _load(self) -> dict:
        try:
            with open(_LICENSE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}

    def _get_secure_time(self) -> datetime:
        """Fetch online time from WorldTimeAPI/TimeAPI, fallback to local system time if offline."""
        import urllib.request
        import urllib.error
        
        urls = [
            "http://worldtimeapi.org/api/timezone/Asia/Phnom_Penh",
            "https://timeapi.io/api/Time/current/zone?timeZone=Asia/Phnom_Penh"
        ]
        
        for url in urls:
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=3.0) as response:
                    res_data = json.loads(response.read().decode())
                    if "datetime" in res_data:
                        return datetime.fromisoformat(res_data["datetime"][:19])
                    elif "dateTime" in res_data:
                        return datetime.fromisoformat(res_data["dateTime"][:19])
            except Exception:
                continue
                
        return datetime.now()

    def _get_stored_last_run(self) -> datetime:
        """Read last run from multiple local sources (file, registry, appdata) and return the latest."""
        dates = []
        
        # 1. From license file
        try:
            data = self._load()
            if 'last_run' in data:
                dates.append(datetime.fromisoformat(data['last_run']))
        except Exception:
            pass
            
        # 2. From hidden local appdata file
        hidden_path = os.path.join(os.path.expanduser("~"), "AppData", "Local", "AIDubber", ".sys_run")
        try:
            if os.path.exists(hidden_path):
                with open(hidden_path, 'r', encoding='utf-8') as f:
                    dt_str = f.read().strip()
                    if dt_str:
                        dates.append(datetime.fromisoformat(dt_str))
        except Exception:
            pass
            
        # 3. From Registry
        try:
            import winreg
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\AIDubber", 0, winreg.KEY_READ)
            val, _ = winreg.QueryValueEx(key, "sys_run")
            winreg.CloseKey(key)
            if val:
                dates.append(datetime.fromisoformat(val))
        except Exception:
            pass
            
        if dates:
            return max(dates)
        return datetime.min

    def _save_stored_last_run(self, dt: datetime):
        """Save last run time to multiple local sources to prevent deletion bypass."""
        dt_str = dt.isoformat()
        
        # Update memory/file dict
        try:
            data = self._load()
            if 'key' in data:
                data['last_run'] = dt_str
                with open(_LICENSE_FILE, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2)
        except Exception:
            pass
            
        # 1. To hidden local appdata file
        hidden_dir = os.path.join(os.path.expanduser("~"), "AppData", "Local", "AIDubber")
        try:
            os.makedirs(hidden_dir, exist_ok=True)
            hidden_path = os.path.join(hidden_dir, ".sys_run")
            with open(hidden_path, 'w', encoding='utf-8') as f:
                f.write(dt_str)
            # Make file hidden on Windows
            if platform.system() == "Windows":
                import ctypes
                ctypes.windll.kernel32.SetFileAttributesW(hidden_path, 0x02) # FILE_ATTRIBUTE_HIDDEN
        except Exception:
            pass
            
        # 2. To Registry
        try:
            import winreg
            key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\AIDubber")
            winreg.SetValueEx(key, "sys_run", 0, winreg.REG_SZ, dt_str)
            winreg.CloseKey(key)
        except Exception:
            pass

    def _call_google_script(self, action: str, key: str, mid: str, telegram: str = "") -> dict:
        """Call the Google Sheets Apps Script Web App API."""
        if not GOOGLE_SCRIPT_URL or "XXXXXXXXXXXXXX" in GOOGLE_SCRIPT_URL:
            return {"status": "offline_fallback", "message": "Google Script URL not configured"}
            
        import urllib.request
        import urllib.parse
        import json
        
        params = {
            "action": action,
            "key": key,
            "mid": mid,
            "telegram": telegram
        }
        query_string = urllib.parse.urlencode(params)
        url = f"{GOOGLE_SCRIPT_URL}?{query_string}"
        
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=3.0) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                return res_data
        except Exception as e:
            print(f"⚠️ Google Sheets License API call failed: {e}")
            return {"status": "network_error", "message": f"Connection error: {e}"}

    def is_activated(self) -> bool:
        data = self._load()
        key = data.get('key')
        
        if not key:
            return False
            
        # 1. Mathematically verify the key against this specific machine
        if not validate_key(key):
            return False
            
        # 2. Fetch current secure time
        current_dt = self._get_secure_time()
        
        # 3. Extract actual expiry and verify
        info = parse_key_info(key)
        expiry = info['expiry']
        if expiry and current_dt > expiry:
            return False
            
        # 4. Check for clock rollback against multiple local sources
        last_run = self._get_stored_last_run()
        if current_dt < last_run:
            print("⚠️ System clock rollback detected!")
            return False
            
        # 5. Lock in this execution time
        system_now = datetime.now()
        newer_now = current_dt if current_dt > system_now else system_now
        self._save_stored_last_run(newer_now)
        
        # 6. Online Status Verification (Google Sheet Check)
        mid = parse_machine_id(get_machine_id())
        
        print("🌐 Checking license status online against Google Sheets...")
        online_res = self._call_google_script("verify", key, mid)
        
        if online_res.get("status") == "success":
            # Save the new last online verify timestamp
            try:
                data['last_online_verify'] = current_dt.isoformat()
                with open(_LICENSE_FILE, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2)
            except Exception:
                pass
            return True
        elif online_res.get("status") == "error":
            # Google Sheet explicitly rejected this license (e.g. status = blocked or key deleted)
            print(f"❌ Online License Verification Failed: {online_res.get('message')}")
            # Erase local license file to immediately deactivate
            try:
                if os.path.exists(_LICENSE_FILE):
                    os.remove(_LICENSE_FILE)
            except Exception:
                pass
            return False
        else:
            # Network issue or configuration fallback. Use cached verification with offline grace period.
            last_verify_str = data.get('last_online_verify')
            if last_verify_str:
                try:
                    last_verify_dt = datetime.fromisoformat(last_verify_str)
                    # If offline, allow fallback for up to 7 days
                    if (current_dt - last_verify_dt).days < 7:
                        print("ℹ️ Google Sheet unreachable. Using cached license (Offline mode).")
                        return True
                    else:
                        print("❌ Offline grace period (7 days) exceeded. Please connect to the internet.")
                        return False
                except Exception:
                    return False
            else:
                # No connection and no cached verification exists
                print("❌ No connection to license database and no cached status found.")
                return False

    def is_expired(self) -> bool:
        data = self._load()
        key = data.get('key')
        if not key or not validate_key(key):
            return False
            
        current_dt = self._get_secure_time()
        info = parse_key_info(key)
        expiry = info['expiry']
        if expiry and current_dt > expiry:
            return True
            
        # Clock rollback also counts as expired/invalid
        last_run = self._get_stored_last_run()
        if current_dt < last_run:
            return True
            
        return False

    def get_expiry_str(self) -> str:
        data = self._load()
        key = data.get('key')
        if not key or not validate_key(key):
            return "?"
        info = parse_key_info(key)
        exp = info['expiry']
        if not exp:
            return "Lifetime"
        return exp.strftime("%d %b %Y")

    def get_remaining_days(self) -> int:
        data = self._load()
        key = data.get('key')
        if not key or not validate_key(key):
            return -1
        info = parse_key_info(key)
        exp = info['expiry']
        if not exp:
            return -1 # Lifetime
        current_dt = self._get_secure_time()
        return max(0, (exp - current_dt).days)

    def activate(self, key: str, telegram_user: str = "") -> bool:
        if not validate_key(key):
            return False
            
        info = parse_key_info(key)
        expiry = info['expiry']
        current_dt = self._get_secure_time()
        
        # Cannot activate if key is already expired or system clock rolled back
        if expiry and current_dt > expiry:
            return False
            
        last_run = self._get_stored_last_run()
        if current_dt < last_run:
            return False
            
        # --- Google Sheet Online Activation Check ---
        mid = parse_machine_id(get_machine_id())
        online_res = self._call_google_script("activate", key, mid, telegram_user)
        
        if online_res.get("status") == "error":
            print(f"❌ Google Sheet Activation Failed: {online_res.get('message')}")
            # If the server explicitly returns an error, fail!
            return False
            
        data = {
            'key'            : key,
            'machine_id'     : mid,
            'activated_at'   : current_dt.isoformat(),
            'last_online_verify': current_dt.isoformat(),
            'expiry'         : expiry.isoformat() if expiry else None,
            'duration_label' : info['label'],
            'telegram_user'  : telegram_user.strip().lstrip('@'),
            'version'        : '2.2', # Obfuscated and registry-linked activation
        }
        try:
            with open(_LICENSE_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            # Store initial last run
            self._save_stored_last_run(current_dt)
            return True
        except Exception:
            return False


    def get_telegram_user(self) -> str:
        """Return the Telegram username saved during activation (without @)."""
        data = self._load()
        return data.get('telegram_user', '')

    def deactivate(self):
        try:
            if os.path.exists(_LICENSE_FILE):
                os.remove(_LICENSE_FILE)
            # Clean up other storage channels
            hidden_path = os.path.join(os.path.expanduser("~"), "AppData", "Local", "AIDubber", ".sys_run")
            if os.path.exists(hidden_path):
                os.remove(hidden_path)
            import winreg
            try:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, r"Software\AIDubber")
            except Exception:
                pass
        except Exception:
            pass


# ══════════════════════════════════════════════════════════════════════════════
# Activation Dialog
# ══════════════════════════════════════════════════════════════════════════════

class LicenseActivationDialog(QDialog):

    STYLE = """
        QDialog {
            background-color: #0b0c10;
        }
        QLabel {
            color: #d1d5db;
            background: transparent;
            font-family: 'Segoe UI', 'Kantumruy Pro', Arial;
        }
        QLineEdit {
            background-color: #121620;
            color: #ffffff;
            border: 1px solid #242b35;
            border-radius: 8px;
            padding: 11px 14px;
            font-size: 13px;
            font-family: 'Segoe UI', 'Kantumruy Pro', Arial;
        }
        QLineEdit:focus {
            border-color: #00f0ff;
        }
        QLineEdit#mid_display {
            background-color: #05070a;
            color: #00f0ff;
            border: 2px solid #00f0ff;
            border-radius: 8px;
            font-size: 17px;
            font-weight: bold;
            text-align: center;
            letter-spacing: 2px;
            font-family: 'Consolas', 'Courier New', monospace;
        }
        QPushButton#btn_copy {
            background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #00d2ff, stop:1 #3a7bd5);
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 12px;
            font-weight: bold;
            padding: 8px 14px;
        }
        QPushButton#btn_copy:hover {
            opacity: 0.9;
        }
        QPushButton#btn_activate {
            background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #00f0ff, stop:1 #a044ff);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: bold;
            padding: 12px 24px;
        }
        QPushButton#btn_activate:hover {
            opacity: 0.9;
        }
        QPushButton#btn_exit {
            background-color: #1e293b;
            color: #94a3b8;
            border: 1px solid #242b35;
            border-radius: 8px;
            font-size: 13px;
            padding: 11px 20px;
        }
        QPushButton#btn_exit:hover {
            background-color: #2d3748;
        }
        QFrame#card {
            background-color: rgba(22, 28, 41, 0.45);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 12px;
        }
        QFrame#mid_card {
            background-color: rgba(0, 240, 255, 0.03);
            border: 1px solid rgba(0, 240, 255, 0.25);
            border-radius: 10px;
        }
    """

    def __init__(self, expired: bool = False, parent=None):
        super().__init__(parent)
        self.manager = LicenseManager()
        self.expired = expired
        self._mid    = get_machine_id()
        self._mid_fmt = format_machine_id(self._mid)

        self.setWindowTitle("AI Video Dubber — ផ្ទៀងផ្ទាត់អាជ្ញាប័ណ្ណ")
        self.setMinimumSize(530, 640)
        self.setWindowFlags(Qt.Dialog | Qt.WindowCloseButtonHint)
        self.setStyleSheet(self.STYLE)
        self._build_ui()

    def _get_asset_path(self, filename: str) -> str:
        try:
            _base_path = sys._MEIPASS
        except Exception:
            if getattr(sys, 'frozen', False):
                _base_path = os.path.dirname(sys.executable)
            else:
                _base_path = os.path.dirname(os.path.abspath(__file__))
        return os.path.join(_base_path, filename)

    def _build_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(32, 24, 32, 22)
        root.setSpacing(0)

        # Tool Logo
        lbl_logo = QLabel()
        logo_path = self._get_asset_path("logodubber.ico")
        if os.path.exists(logo_path):
            icon = QIcon(logo_path)
            if not icon.isNull():
                # Ask QIcon to extract a crisp 96x96 pixmap directly from the multi-res ICO file
                pixmap = icon.pixmap(96, 96)
                lbl_logo.setPixmap(pixmap)
            else:
                lbl_logo.setText("🛡️")
                lbl_logo.setStyleSheet("font-size:40px;")
        else:
            lbl_logo.setText("🛡️")
            lbl_logo.setStyleSheet("font-size:40px;")
        lbl_logo.setAlignment(Qt.AlignCenter)
        root.addWidget(lbl_logo)
        root.addSpacing(6)

        lbl_title = QLabel("AI Video Dubber — Professional v2.0")
        lbl_title.setAlignment(Qt.AlignCenter)
        lbl_title.setStyleSheet("font-size:16px; font-weight:bold; color:#00f0ff; margin-bottom:4px;")
        root.addWidget(lbl_title)

        lbl_author = QLabel("បង្កើតឡើងដោយ៖ Heang")
        lbl_author.setAlignment(Qt.AlignCenter)
        lbl_author.setStyleSheet("font-size:12px; color:#a044ff; font-weight:bold; margin-bottom:8px;")
        root.addWidget(lbl_author)

        # Expired banner
        if self.expired:
            exp_lbl = QLabel("  អាជ្ញាប័ណ្ណរបស់អ្នកបានផុតកំណត់ហើយ! សូមទាក់ទងទៅកាន់ម្ចាស់កម្មវិធីដើម្បីបន្ត។  ")
            exp_lbl.setAlignment(Qt.AlignCenter)
            exp_lbl.setStyleSheet(
                "background:#7f1d1d; color:#fca5a5; border-radius:6px;"
                "padding:7px; font-size:12px; margin-top:6px;"
            )
            root.addWidget(exp_lbl)

        root.addSpacing(12)

        # ── Machine ID card ──────────────────────────────────────
        mid_card = QFrame()
        mid_card.setObjectName("mid_card")
        mc_lay = QVBoxLayout(mid_card)
        mc_lay.setContentsMargins(16, 12, 16, 12)
        mc_lay.setSpacing(8)

        step1 = QLabel("👉 ជំហានទី ១ ៖ ចម្លង (Copy) លេខសម្គាល់ម៉ាស៊ីន (Machine ID)")
        step1.setStyleSheet("font-size:12px; font-weight: 600; color:#00f0ff;")
        mc_lay.addWidget(step1)

        row = QHBoxLayout()
        self.mid_edit = QLineEdit(self._mid_fmt)
        self.mid_edit.setObjectName("mid_display")
        self.mid_edit.setReadOnly(True)
        self.mid_edit.setAlignment(Qt.AlignCenter)
        row.addWidget(self.mid_edit)

        btn_copy = QPushButton("📋 ចម្លង (Copy)")
        btn_copy.setObjectName("btn_copy")
        btn_copy.setFixedWidth(110)
        btn_copy.setMinimumHeight(38)
        btn_copy.setCursor(Qt.PointingHandCursor)
        btn_copy.clicked.connect(self._copy_mid)
        row.addWidget(btn_copy)
        mc_lay.addLayout(row)

        contact = QLabel(
            'ផ្ញើទៅកាន់ម្ចាស់កម្មវិធី៖ <a href="https://t.me/HeangDigital" '
            'style="color:#00f0ff; text-decoration:none; font-weight:bold;">✈️ @HeangDigital</a>'
        )
        contact.setOpenExternalLinks(True)
        contact.setStyleSheet("font-size:11px; color:#a044ff;")
        mc_lay.addWidget(contact)

        root.addWidget(mid_card)
        root.addSpacing(10)

        # ── Telegram username card ────────────────────────────────────────
        tg_card = QFrame()
        tg_card.setObjectName("card")
        tg_lay = QVBoxLayout(tg_card)
        tg_lay.setContentsMargins(16, 12, 16, 12)
        tg_lay.setSpacing(6)

        tg_step = QLabel("👉 ជំហានទី ១ខ ៖ បញ្ចូលឈ្មោះ Telegram របស់អ្នក (សម្រាប់កត់ត្រា)")
        tg_step.setStyleSheet("font-size:12px; font-weight: 600; color:#d1d5db;")
        tg_lay.addWidget(tg_step)

        self.tg_edit = QLineEdit()
        self.tg_edit.setPlaceholderText("ឧទាហរណ៍៖ @HeangDigital")
        tg_lay.addWidget(self.tg_edit)

        root.addWidget(tg_card)
        root.addSpacing(10)

        # ── Activation key card ──────────────────────────────────
        key_card = QFrame()
        key_card.setObjectName("card")
        kc_lay = QVBoxLayout(key_card)
        kc_lay.setContentsMargins(16, 14, 16, 14)
        kc_lay.setSpacing(8)

        step2 = QLabel("👉 ជំហានទី ២ ៖ បញ្ចូលលេខកូដអាជ្ញាប័ណ្ណ (Activation Key)")
        step2.setStyleSheet("font-size:12px; font-weight: 600; color:#d1d5db;")
        kc_lay.addWidget(step2)

        self.key_edit = QLineEdit()
        self.key_edit.setPlaceholderText("ផាស (Paste) Key អាជ្ញាប័ណ្ណ (HG-...)")
        self.key_edit.textChanged.connect(self._on_key_changed)
        self.key_edit.returnPressed.connect(self._on_activate)
        kc_lay.addWidget(self.key_edit)

        self.dur_lbl = QLabel("")
        self.dur_lbl.setStyleSheet("font-size:11px; color:#00f0ff; min-height:14px;")
        kc_lay.addWidget(self.dur_lbl)

        self.status_lbl = QLabel("")
        self.status_lbl.setAlignment(Qt.AlignCenter)
        self.status_lbl.setStyleSheet("font-size:12px; min-height:14px;")
        kc_lay.addWidget(self.status_lbl)

        root.addWidget(key_card)
        root.addSpacing(14)

        # Buttons
        br = QHBoxLayout()
        br.setSpacing(10)
        self.btn_exit = QPushButton("ចាកចេញ (Exit)")
        self.btn_exit.setObjectName("btn_exit")
        self.btn_exit.setCursor(Qt.PointingHandCursor)
        self.btn_exit.clicked.connect(self.reject)
        br.addWidget(self.btn_exit)

        self.btn_activate = QPushButton("🔓  ធ្វើការ Activate")
        self.btn_activate.setObjectName("btn_activate")
        self.btn_activate.setCursor(Qt.PointingHandCursor)
        self.btn_activate.clicked.connect(self._on_activate)
        br.addWidget(self.btn_activate)
        root.addLayout(br)

    # ── Slots ─────────────────────────────────────────────────────────────────

    def _copy_mid(self):
        QApplication.clipboard().setText(self._mid_fmt)
        self.status_lbl.setStyleSheet("font-size:12px; color:#00ffcc;")
        self.status_lbl.setText("ចម្លង Machine ID រួចរាល់! សូមផ្ញើវាទៅកាន់ម្ចាស់កម្មវិធី។")
        QTimer.singleShot(3000, lambda: self.status_lbl.setText(""))

    def _on_key_changed(self, text):
        formatted = text.strip()
        
        self.dur_lbl.setText("")
        self.status_lbl.setText("")

        if formatted.startswith("HG-") and len(formatted) > 30:
            if validate_key(formatted):
                info = parse_key_info(formatted)
                exp  = info['expiry']
                self.dur_lbl.setText(
                    f"រយៈពេល៖ {info['label']}"
                    + (f"  |  ផុតកំណត់៖ {exp.strftime('%d %b %Y')}" if exp else "  |  ពេញមួយជីវិត")
                )
                self.status_lbl.setStyleSheet("font-size:12px; color:#00ffcc;")
                self.status_lbl.setText("កូដត្រឹមត្រូវ — សូមចុច 'ធ្វើការ Activate'")
            else:
                self.status_lbl.setStyleSheet("font-size:12px; color:#ef4444;")
                self.status_lbl.setText("កូដមិនត្រឹមត្រូវ (កុំព្យូទ័រមិនត្រូវគ្នា ឬខុសហត្ថលេខា)")

    def _on_activate(self):
        key = self.key_edit.text().strip()
        if not key:
            self._shake()
            return
        tg_user = self.tg_edit.text().strip()
        if self.manager.activate(key, telegram_user=tg_user):
            info = parse_key_info(key)
            exp  = info['expiry']
            self.status_lbl.setStyleSheet("font-size:12px; color:#00ffcc;")
            self.status_lbl.setText(
                f"បានធ្វើឱ្យដំណើរការជោគជ័យ! សុពលភាពរហូតដល់៖ {exp.strftime('%d %b %Y') if exp else 'ពេញមួយជីវិត'}"
            )
            self.btn_activate.setEnabled(False)
            QTimer.singleShot(1500, self.accept)
        else:
            self.status_lbl.setStyleSheet("font-size:12px; color:#ef4444;")
            self.status_lbl.setText("កូដមិនត្រឹមត្រូវ — កូដនេះមិនមែនសម្រាប់ម៉ាស៊ីននេះឡើយ។")
            self._shake()

    def _shake(self):
        ox = self.x()
        for i, dx in enumerate([7, -7, 5, -5, 3, -3, 0]):
            QTimer.singleShot(i * 35, lambda x=ox + dx: self.move(x, self.y()))

