import sys
import os
import json
import traceback

# --- Path Injection: Prioritize Lib/site-packages to avoid PyInstaller shadowing ---
_exe_dir = os.path.dirname(sys.executable)
_sp_path = os.path.join(_exe_dir, "Lib", "site-packages")
if os.path.isdir(_sp_path):
    if _sp_path not in sys.path:
        sys.path.insert(0, _sp_path)

os.environ['KMP_DUPLICATE_LIB_OK'] = 'True'

def main():
    if len(sys.argv) < 5:
        print(json.dumps({"success": False, "error": "Not enough arguments"}))
        sys.exit(1)
        
    audio_path = sys.argv[1]
    model_size = sys.argv[2]
    device = sys.argv[3]
    compute_type = sys.argv[4]

    # --- DLL Injection for Windows (Fix for Code 3221226505) ---
    if sys.platform == 'win32':
        try:
            import torch
            t_lib = os.path.join(os.path.dirname(torch.__file__), 'lib')
            if os.path.isdir(t_lib):
                if hasattr(os, 'add_dll_directory'):
                    os.add_dll_directory(t_lib)
                os.environ['PATH'] = t_lib + os.pathsep + os.environ.get('PATH', '')
            
            # Add bundled bin if it exists
            _exe_dir = os.path.dirname(sys.executable)
            _bin = os.path.join(_exe_dir, "bin")
            if not os.path.isdir(_bin) and getattr(sys, 'frozen', False):
                _bin = os.path.join(getattr(sys, '_MEIPASS', '.'), "bin")
            
            if os.path.isdir(_bin):
                if hasattr(os, 'add_dll_directory'):
                    os.add_dll_directory(_bin)
                os.environ['PATH'] = _bin + os.pathsep + os.environ.get('PATH', '')
        except:
            pass
    
    try:
        from faster_whisper import WhisperModel
        import torch
        
        # Verify CUDA if requested
        if device == "cuda" and not torch.cuda.is_available():
            device = "cpu"
            compute_type = "int8"
            
        model = WhisperModel(model_size, device=device, compute_type=compute_type)
        segments_gen, info = model.transcribe(
            audio_path, 
            beam_size=5, 
            vad_filter=True, 
            vad_parameters=dict(min_silence_duration_ms=500)
        )
        
        results = []
        for segment in segments_gen:
            results.append({
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip()
            })
            
        print(json.dumps({"success": True, "segments": results, "language": info.language}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e) + "\n" + traceback.format_exc()}))

if __name__ == '__main__':
    main()
