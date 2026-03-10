import urllib.request, urllib.error, json

try:
    req1 = urllib.request.Request('http://127.0.0.1:8000/sales-orders', data=json.dumps({'customer_id': 1, 'warehouse_id': 4, 'items': [{'product_id': 9, 'ordered_qty': 1}]}).encode(), headers={'Content-Type': 'application/json'})
    so = json.loads(urllib.request.urlopen(req1).read().decode())
    
    req2 = urllib.request.Request('http://127.0.0.1:8000/delivery-notes', data=json.dumps({'sales_order_id': so['id']}).encode(), headers={'Content-Type': 'application/json'})
    dn = json.loads(urllib.request.urlopen(req2).read().decode())
    print('Created DN', dn['id'])

    req3 = urllib.request.Request(f'http://127.0.0.1:8000/delivery-notes/{dn["id"]}/confirm', method='POST')
    urllib.request.urlopen(req3)
    
    req_pick = urllib.request.Request(f'http://127.0.0.1:8000/delivery-notes/{dn["id"]}/status', data=json.dumps({"status": "picked"}).encode(), headers={'Content-Type': 'application/json'}, method='PATCH')
    urllib.request.urlopen(req_pick)
    print('Picked DN', dn['id'])

    req4 = urllib.request.Request(f'http://127.0.0.1:8000/delivery-notes/{dn["id"]}', method='DELETE')
    urllib.request.urlopen(req4)
    print('SUCCESS')

except urllib.error.HTTPError as e:
    print('HTTP ERROR:', e.code, e.read().decode('utf-8'))
except Exception as e:
    print('OTHER ERROR:', type(e), str(e))
