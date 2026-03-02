import requests
import json

r = requests.post("http://localhost:8000/login", json={"username": "manager", "password": "manager123"})
print(f"Status: {r.status_code}")
print(f"Response: {json.dumps(r.json(), indent=2)}")
