from urllib.request import urlopen
from urllib.error import HTTPError
import json

try:
    r = urlopen("http://localhost:8000/analytics/health-report")
    data = json.loads(r.read().decode())
    print("Keys:", list(data.keys()))
    print("dead_stock_count:", data.get("dead_stock_count"))
    print("slow_moving_count:", data.get("slow_moving_count"))
    print("expiry_risk_count:", data.get("expiry_risk_count"))
    print("total_value_at_risk:", data.get("total_value_at_risk"))
    if data.get("dead_stock_items"):
        print("\nSample dead_stock_item:", json.dumps(data["dead_stock_items"][0], indent=2, default=str))
    if data.get("slow_moving_items"):
        print("\nSample slow_moving_item:", json.dumps(data["slow_moving_items"][0], indent=2, default=str))
    if data.get("expiry_risk_items"):
        print("\nSample expiry_risk_item:", json.dumps(data["expiry_risk_items"][0], indent=2, default=str))
except HTTPError as e:
    print("STATUS:", e.code)
    print("BODY:", e.read().decode()[:500])
