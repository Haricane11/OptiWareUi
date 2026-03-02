import requests

endpoints = ["/users", "/delivery-notes", "/sales-orders"]

for ep in endpoints:
    try:
        r = requests.get(f"http://localhost:8000{ep}", timeout=5)
        print(f"{ep}: {r.status_code}")
        if r.status_code >= 400:
            text = r.text[:200]
            print(f"  Error: {text}")
    except Exception as e:
        print(f"{ep}: EXCEPTION - {e}")
