"""
Offline_Transcription.py
Module for local, offline Speech-to-Text using faster-whisper.
Can be integrated into AI Video Dubber as a standalone worker or dialog.

Prerequisites:
pip install faster-whisper
"""

import os
import time

# Fix for silent crashes (app closing suddenly) caused by OpenMP / MKL library conflicts
os.environ['KMP_DUPLICATE_LIB_OK'] = 'True'
from PyQt5.QtCore import QThread, pyqtSignal
from PyQt5.QtWidgets import (QDialog, QVBoxLayout, QLabel, QProgressBar, 
                             QPushButton, QFileDialog, QMessageBox, QComboBox)

try:
    # Fix for WinError 1114 DLL conflict on Windows: import torch as early as possible
    import torch
    from faster_whisper import WhisperModel
    WHISPER_AVAILABLE = True
    with open("transcription_import_status.txt", "w", encoding="utf-8") as f:
        f.write("Whisper libraries imported successfully!\n")
except BaseException as e:
    # OSError catches WinError 1114 initialization failure
    WHISPER_AVAILABLE = False
    import traceback
    with open("transcription_import_status.txt", "w", encoding="utf-8") as f:
        f.write(f"Whisper import failed: {e}\n")
        traceback.print_exc(file=f)
    print(f"⚠️ Transcription Engine Error: {e}")


class WhisperTranscriptionWorker(QThread):
    progress = pyqtSignal(int, str)
    finished = pyqtSignal(bool, str, list) # success, message, segments

    def __init__(self, audio_path, model_size="base", language=None, use_gpu=True):
        super().__init__()
        self.audio_path = audio_path
        self.model_size = model_size
        self.language = language
        self.use_gpu = use_gpu

    def run(self):
        try:
            self.progress.emit(10, f"Loading Whisper model ({self.model_size}) in isolated process...")
            
            import sys
            import json
            import subprocess
            import os
            
            # Determine paths
            script_dir = os.path.dirname(os.path.abspath(__file__))
            worker_script = os.path.join(script_dir, "transcribe_worker_script.py")
            
            # Check for _internal folder in frozen builds
            if getattr(sys, 'frozen', False):
                candidates = [
                    os.path.join(script_dir, "_internal", "transcribe_worker_script.py"),
                    os.path.join(os.path.dirname(sys.executable), "_internal", "transcribe_worker_script.py"),
                    os.path.join(script_dir, "transcribe_worker_script.py")
                ]
                for cand in candidates:
                    if os.path.exists(cand):
                        worker_script = cand
                        break
            
            if not os.path.exists(worker_script):
                self.finished.emit(False, f"Worker script not found. (Checked: {worker_script})", [])
                return
                
            # Auto-detect device based on preference and availability
            try:
                import torch
                device = "cuda" if (self.use_gpu and torch.cuda.is_available()) else "cpu"
            except:
                device = "cpu"
                
            print(f"🎙 [Whisper Subprocess] Target device: {device.upper()}")
            compute_type = "int8"  # Safer for all GPUs (prevents float16 crashes on GTX 16 series)
            
            # Run the isolated subprocess
            # We use python executable. If running from PyInstaller frozen, use sys.executable
            # but sys.executable in PyInstaller is the .exe which might not be able to run standard scripts easily.
            # However, AI_Dubber_PyQt5_Complete handles _internal python.
            if getattr(sys, 'frozen', False):
                _exe_dir = os.path.dirname(sys.executable)
                python_exe = os.path.join(_exe_dir, '_internal', 'python.exe')
                if not os.path.exists(python_exe):
                    python_exe = 'python'
            else:
                python_exe = sys.executable

            cmd = [
                python_exe, worker_script,
                self.audio_path, self.model_size, device, compute_type
            ]
            
            self.progress.emit(30, f"Transcribing audio with Whisper ({self.model_size}) [Device: {device.upper()}]...")
            
            process = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            )
            
            # If GPU (CUDA) fails/crashes (e.g. WinError 1114 / Code 3221226505 CUDA DLL mismatch), fallback to CPU
            if process.returncode != 0 and device == "cuda":
                self.progress.emit(40, f"GPU failed (CUDA error). Retrying on CPU with Whisper ({self.model_size})...")
                print(f"🎙 [Whisper Subprocess] GPU run failed with returncode {process.returncode}. Retrying on CPU...")
                device = "cpu"
                compute_type = "int8"
                cmd = [
                    python_exe, worker_script,
                    self.audio_path, self.model_size, device, compute_type
                ]
                process = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    encoding='utf-8',
                    errors='replace',
                    creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
                )

            self.progress.emit(90, "Processing results...")
            
            if process.returncode != 0:
                self.finished.emit(False, f"Subprocess failed (Code {process.returncode}):\n{process.stderr[-500:]}", [])
                return
                
            # Parse output lines
            output = process.stdout.strip().split('\n')
            last_line = output[-1]
            
            try:
                result = json.loads(last_line)
            except json.JSONDecodeError:
                self.finished.emit(False, f"Failed to parse output:\n{last_line}\nstderr: {process.stderr[-200:]}", [])
                return
                
            if result.get("success"):
                segments = result.get("segments", [])
                lang = result.get("language", "unknown")
                self.progress.emit(100, f"Transcription complete! Language: {lang}")
                self.finished.emit(True, "Success", segments)
            else:
                self.finished.emit(False, result.get("error", "Unknown error in subprocess"), [])
                
        except Exception as e:
            self.finished.emit(False, f"Worker thread exception: {str(e)}", [])


class WhisperDialog(QDialog):
    """A standalone dialog to test the Whisper offline transcription."""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Offline Auto-Transcription (Whisper)")
        self.resize(400, 200)
        self.setStyleSheet("background-color: #050a15; color: #e0f7fa; font-size: 14px;")
        
        self.setup_ui()
        self.audio_path = None
        
    def setup_ui(self):
        layout = QVBoxLayout(self)
        
        self.lbl_info = QLabel("Select an audio/video file to transcribe locally.")
        layout.addWidget(self.lbl_info)
        
        self.btn_select = QPushButton("📁 Select Video/Audio File")
        self.btn_select.setStyleSheet("background-color: #00f3ff; color: #000; padding: 5px; font-weight: bold;")
        self.btn_select.clicked.connect(self.select_file)
        layout.addWidget(self.btn_select)
        
        self.model_combo = QComboBox()
        self.model_combo.addItems(["tiny", "base", "small", "medium"])
        self.model_combo.setCurrentText("base")
        self.model_combo.setStyleSheet("background-color: #1e2b3c;")
        layout.addWidget(QLabel("Model Size (larger = more accurate but slower):"))
        layout.addWidget(self.model_combo)
        
        self.progress_bar = QProgressBar()
        self.progress_bar.setValue(0)
        layout.addWidget(self.progress_bar)
        
        self.lbl_status = QLabel("Ready")
        layout.addWidget(self.lbl_status)
        
        self.btn_start = QPushButton("🚀 Start Transcription")
        self.btn_start.setStyleSheet("background-color: #00ff66; color: #000; padding: 5px; font-weight: bold;")
        self.btn_start.clicked.connect(self.start_transcription)
        self.btn_start.setEnabled(False)
        layout.addWidget(self.btn_start)

    def select_file(self):
        file_path, _ = QFileDialog.getOpenFileName(self, "Select File", "", "Media Files (*.mp4 *.wav *.mp3);;All Files (*.*)")
        if file_path:
            self.audio_path = file_path
            self.lbl_info.setText(f"File: {os.path.basename(file_path)}")
            self.btn_start.setEnabled(True)

    def start_transcription(self):
        if not self.audio_path:
            return
            
        self.btn_start.setEnabled(False)
        self.btn_select.setEnabled(False)
        
        self.worker = WhisperTranscriptionWorker(self.audio_path, self.model_combo.currentText())
        self.worker.progress.connect(self.update_progress)
        self.worker.finished.connect(self.on_finished)
        self.worker.start()

    def update_progress(self, val, msg):
        self.progress_bar.setValue(val)
        self.lbl_status.setText(msg)

    def on_finished(self, success, msg, segments):
        self.btn_start.setEnabled(True)
        self.btn_select.setEnabled(True)
        
        if success:
            QMessageBox.information(self, "Success", f"Transcribed {len(segments)} segments successfully!\n\nCheck console for output.")
            for seg in segments:
                print(f"[{seg['start']:.2f} -> {seg['end']:.2f}] {seg['text']}")
        else:
            QMessageBox.critical(self, "Error", f"Transcription failed:\n{msg}")

if __name__ == '__main__':
    import sys
    from PyQt5.QtWidgets import QApplication
    app = QApplication(sys.argv)
    dlg = WhisperDialog()
    dlg.show()
    sys.exit(app.exec_())
