import requests, json

# Get first suggestion's full fields
print("=== First Action Suggestion ===")
r = requests.get("http://localhost:8000/analytics/action-suggestions?limit=1", timeout=10)
print(f"Status: {r.status_code}")
if r.status_code == 200:
    data = r.json()
    items = data.get('suggestions', []) if isinstance(data, dict) else data
    if items:
        print(json.dumps(items[0], indent=2, default=str))

# Check if endpoint supports limit/skip
print("\n=== Suggestions with limit ===")
r2 = requests.get("http://localhost:8000/analytics/action-suggestions?limit=5&skip=0", timeout=10)
print(f"Status: {r2.status_code}")
if r2.status_code == 200:
    d2 = r2.json()
    items2 = d2.get('suggestions', []) if isinstance(d2, dict) else d2
    print(f"Total in response: {d2.get('total','N/A')}, Items returned: {len(items2)}")

# Health report full response
print("\n=== Health Report ===")
r3 = requests.get("http://localhost:8000/analytics/health-report", timeout=10)
print(f"Status: {r3.status_code}")
if r3.status_code == 200:
    print(json.dumps(r3.json(), indent=2, default=str))

# Reorder
print("\n=== Reorder Suggestions ===")
r4 = requests.get("http://localhost:8000/reorder/suggestions", timeout=10)
print(f"Status: {r4.status_code}")
if r4.status_code == 200:
    d4 = r4.json()
    if isinstance(d4, dict):
        print(f"Keys: {list(d4.keys())}")
        items4 = d4.get('suggestions', d4.get('items', []))
    elif isinstance(d4, list):
        items4 = d4
    else:
        items4 = []
    print(f"Count: {len(items4)}")
    if items4:
        print(f"First item keys: {list(items4[0].keys())}")
        print(json.dumps(items4[0], indent=2, default=str))
