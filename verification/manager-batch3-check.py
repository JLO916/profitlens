"""Read-only localhost security and original-file preservation receipt; synthetic only."""
import json, hashlib, pathlib, urllib.request, urllib.error, datetime
paths = sorted(pathlib.Path('.next/static').rglob('*.js'))
markers = ['sk-PROFITLENS-BATCH3-NONSECRET-BUNDLE-CANARY', 'OPENAI_API_KEY', 'OPENAI_MODEL']
assets = [{'path': str(p), 'matches': [x for x in markers if x in p.read_text()]} for p in paths]
def request(path, method='GET'):
    req = urllib.request.Request('http://127.0.0.1:3200' + path, data=b'{}' if method=='POST' else None, method=method, headers={'Content-Type':'application/json', 'Origin':'http://127.0.0.1:3200'})
    try:
        with urllib.request.urlopen(req) as response:
            return {'status':response.status, 'body':json.loads(response.read())}
    except urllib.error.HTTPError as error:
        return {'status':error.code, 'body':json.loads(error.read())}
result = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'mode':'PUBLIC_DEMO', 'bundle_count':len(paths), 'bundle_checks':assets, 'get':request('/api/insights'), 'post':request('/api/insights','POST'), 'live_model_called':False}
json.dump(result,open('verification/manager-batch3-security.json','w'),ensure_ascii=False,indent=2)
assert len(paths)>0 and not any(x['matches'] for x in assets)
assert result['post']['status']==403 and 'PUBLIC_DEMO' in str(result['post']['body'])
start=json.load(open('verification/manager-batch3-starting-state.json'))['starting_hashes']
kept=[p for p in start if p.startswith(('fixtures/','spec/','reviews/')) or p in ['AGENTS.md','package.json','package-lock.json']]
checks=[{'path':p,'same':pathlib.Path(p).is_file() and hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()==start[p]} for p in kept]
json.dump({'checks':checks,'preserved':all(c['same'] for c in checks)},open('verification/manager-batch3-integrity.json','w'),indent=2)
assert all(c['same'] for c in checks)
print(json.dumps({'assets':len(paths), 'public_demo_post':result['post'], 'preserved_files':len(checks), 'all_equal':True},ensure_ascii=False))
