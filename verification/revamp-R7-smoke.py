# R7：沿用首次部署的 13 項 HTTP 檢查；第二個參數可指定基底 URL（本機 PUBLIC_DEMO 正式產物或正式站）。
import urllib.request,urllib.error,json,pathlib,datetime,sys,hashlib
base=sys.argv[2] if len(sys.argv)>2 else 'https://profitlens-tau.vercel.app'
results=[]
def request(path,method='GET',body=None):
 req=urllib.request.Request(base+path,data=body,method=method,headers={'Content-Type':'application/json'} if body is not None else {})
 try: res=urllib.request.urlopen(req,timeout=30)
 except urllib.error.HTTPError as e: res=e
 data=res.read(); item={'path':path,'method':method,'status':res.status,'cache_control':res.headers.get('cache-control'),'content_type':res.headers.get('content-type')};results.append(item)
 return item,data
r,b=request('/');r['pass']=r['status']==200 and 'ProfitLens' in b.decode()
for name,folder in [('demo','demo'),('golden','golden'),('missing-cogs','errors/missing_cogs'),('missing-ad','errors/missing_ad_day'),('duplicate','errors/duplicate_sales_key')]:
 r,b=request('/api/datasets/'+name);d=json.loads(b);root=pathlib.Path('fixtures')/folder
 r['synthetic']=d.get('manifest',{}).get('source_type')=='synthetic'
 r['manifest_matches_local']=d.get('manifest')==json.loads((root/'manifest.json').read_bytes())
 r['csv_matches_local']={f:txt.encode('utf-8')==(root/f).read_bytes() for f,txt in d.get('files',{}).items()}
 r['csv_sha256']={f:hashlib.sha256(txt.encode('utf-8')).hexdigest() for f,txt in d.get('files',{}).items()}
 r['pass']=r['status']==200 and r['synthetic'] and r['manifest_matches_local'] and len(r['csv_matches_local'])==3 and all(r['csv_matches_local'].values())
r,b=request('/api/insights');r['body']=json.loads(b);r['pass']=r['status']==200 and r['body'].get('reason')=='PUBLIC_DEMO' and not r['body'].get('available')
r,b=request('/api/insights','POST',b'{}');r['body']=json.loads(b);r['pass']=r['status']==403 and r['body'].get('reason')=='PUBLIC_DEMO'
for path in ['/api/datasets/not-allowed','/.env','/.git/config','/verification/app-acceptance.md','/fixtures/golden/sales_daily.csv']:
 r,b=request(path);r['pass']=r['status']==404
output={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':base,'checks':results,'all_passed':all(x['pass'] for x in results),'live_ai_called':False}
pathlib.Path(sys.argv[1]).write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'all_passed':output['all_passed'],'checks':[{'path':r['path'],'method':r['method'],'status':r['status'],'pass':r['pass']} for r in results]},ensure_ascii=False,indent=2))
raise SystemExit(0 if output['all_passed'] else 1)
