import os
import sys
import io
import subprocess
import shutil
import zipfile

# Force UTF-8 output so box/emoji characters don't crash on Windows cp1252 terminals
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

def pack():
    print("Step 1: Updating protected wrapper...")
    subprocess.run(["python", "generate_protected.py"], check=True)
    
    print("\nStep 2: Building executable...")
    # Run Build.py forwarding command line arguments
    subprocess.run(["python", "Build.py"] + sys.argv[1:], check=True)
    
    print("\nStep 3: Compressing build folder to ZIP...")
    dist_dir = os.path.join(os.getcwd(), "dist")
    app_folder = os.path.join(dist_dir, "AI_Video_Dubber_V2")
    
    if not os.path.exists(app_folder):
        print(f"Error: {app_folder} does not exist. Build might have failed.")
        return
        
    zip_filename = os.path.join(dist_dir, "AI_Video_Dubber_Update_2.0.0.zip")
    
    # Remove existing zip if any
    if os.path.exists(zip_filename):
        os.remove(zip_filename)
        
    print(f"Zipping {app_folder} -> {zip_filename}...")
    
    # Compress the folder
    with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(app_folder):
            for file in files:
                file_path = os.path.join(root, file)
                # Store relative path inside zip
                rel_path = os.path.relpath(file_path, app_folder)
                zipf.write(file_path, rel_path)
                
    size_mb = os.path.getsize(zip_filename) / (1024 * 1024)
    print(f"\n[OK] Pack complete! Created: {zip_filename} ({size_mb:.1f} MB)")
    print("Drag and drop this ZIP file to your GitHub Releases!")

if __name__ == "__main__":
    pack()
