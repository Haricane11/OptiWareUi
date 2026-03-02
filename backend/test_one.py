import requests
import sys

ep = sys.argv[1] if len(sys.argv) > 1 else "/users"
try:
    r = requests.get(f"http://localhost:8000{ep}", timeout=5)
    print(f"{ep}: {r.status_code}")
    if r.status_code >= 400:
        print(f"  Error: {r.text[:300]}")
    else:
        print(f"  OK (first 100 chars): {r.text[:100]}")
except Exception as e:
    print(f"{ep}: EXCEPTION - {e}")
