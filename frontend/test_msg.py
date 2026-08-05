import urllib.request
import json

data = json.dumps({"conversationId": "test", "content": "hello", "speed": "fast"}).encode('utf-8')
req = urllib.request.Request("http://127.0.0.1:3000/api/messages", data=data, headers={'Content-Type': 'application/json'}, method='POST')

try:
    with urllib.request.urlopen(req) as f:
        print(f.read().decode('utf-8'))
except Exception as e:
    print(e)
