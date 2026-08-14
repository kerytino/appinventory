import zipfile
import os

with zipfile.ZipFile(r'C:\Users\kfrias\Desktop\network-inventory-app.zip', 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(r'C:\Users\kfrias\.gemini\antigravity\scratch\network-inventory-app'):
        if '.venv' in root or '__pycache__' in root or '.git' in root:
            continue
        for file in files:
            filepath = os.path.join(root, file)
            arcname = os.path.relpath(filepath, r'C:\Users\kfrias\.gemini\antigravity\scratch\network-inventory-app')
            try:
                zipf.write(filepath, arcname)
            except Exception as e:
                print(f"Skipping {filepath}: {e}")
