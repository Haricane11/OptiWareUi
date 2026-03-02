import requests
import json

# Trigger health scan
r = requests.post("http://localhost:8000/analytics/run-health-scan", timeout=30)
print(f"Scan: {r.status_code}")
if r.status_code == 200:
    data = r.json()
    print(f"  New statuses: {data.get('new_statuses', '?')}, New suggestions: {data.get('new_suggestions', '?')}")

# Check suggestions
r2 = requests.get("http://localhost:8000/analytics/action-suggestions", timeout=10)
print(f"\nSuggestions: {r2.status_code}")
if r2.status_code == 200:
    data2 = r2.json()
    total = data2.get('total', len(data2) if isinstance(data2, list) else 0)
    print(f"  Total suggestions: {total}")
    items = data2.get('suggestions', data2) if isinstance(data2, dict) else data2
    if items and len(items) > 0:
        print(f"  First item: {json.dumps(items[0], indent=2, default=str)[:300]}")
