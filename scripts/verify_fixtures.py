"""Independent preparation QA. Does NOT execute or certify the planned Web app."""
from pathlib import Path
from decimal import Decimal as D, ROUND_HALF_UP
from datetime import date,timedelta
import csv,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
FIELDS={'sales_daily.csv':['gross_sales','discounts','refunds','cogs_net'],'channel_costs_daily.csv':['platform_fees','payment_fees','fulfillment_costs','other_variable_costs'],'ad_spend_daily.csv':['ad_spend']}
def load(path):
 with path.open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
def money(x):return format(D(x).quantize(D('.01'),rounding=ROUND_HALF_UP),'.2f')
def totals(folder,period,channel=None):
 result={k:D(0) for fields in FIELDS.values() for k in fields}
 for fn,fields in FIELDS.items():
  for row in load(folder/fn):
   if period['start']<=row['date']<=period['end'] and (channel is None or row['channel']==channel):
    for k in fields:
     if row[k]=='':raise ValueError(f'Missing {fn}/{k}; not zero')
     result[k]+=D(row[k])
 result['net_revenue']=result['gross_sales']-result['discounts']-result['refunds']
 result['gross_profit']=result['net_revenue']-result['cogs_net']
 result['contribution_before_marketing']=result['gross_profit']-sum(result[k] for k in FIELDS['channel_costs_daily.csv'])
 result['contribution_after_marketing']=result['contribution_before_marketing']-result['ad_spend']
 return result
def readjson(p):return json.loads(p.read_text(encoding='utf-8'))
def main():
 checks=[]
 def check(name,condition):
  if not condition:raise AssertionError(name)
  checks.append({'check':name,'status':'passed'})
 for foldername in ['golden','demo','zero_ad','refund_only']:
  folder=ROOT/'fixtures'/foldername;meta=readjson(folder/'manifest.json')
  start=date.fromisoformat(meta['coverage_start']);end=date.fromisoformat(meta['coverage_end'])
  pairs={(str(start+timedelta(days=i)),ch) for i in range((end-start).days+1) for ch in meta['channels']}
  for fn in FIELDS:
   records=load(folder/fn);fields=['date','channel','sku'] if fn=='sales_daily.csv' else ['date','channel'];keys=[tuple(r[k] for k in fields) for r in records]
   check(f'{foldername}/{fn}:unique_keys',len(keys)==len(set(keys)))
   check(f'{foldername}/{fn}:currency',all(r['currency']=='TWD' for r in records))
   check(f'{foldername}/{fn}:dates_channels',all((r['date'],r['channel']) in pairs for r in records))
   check(f'{foldername}/{fn}:parseable_money',all(D(r[k]).is_finite() for r in records for k in FIELDS[fn]))
   if fn!='sales_daily.csv':check(f'{foldername}/{fn}:full_daily_coverage',set(keys)==pairs)
  for r in load(folder/'sales_daily.csv'):
   check(f"{foldername}/sales_row:{r['date']}:{r['channel']}:{r['sku']}",D(r['gross_sales'])>=D(r['discounts'])>=0 and D(r['refunds'])>=0 and int(r['units_sold'])>=0)
  lens=[(date.fromisoformat(meta[k]['end'])-date.fromisoformat(meta[k]['start'])).days+1 for k in ['previous_period','current_period']]
  check(f'{foldername}:equal_period_length',lens[0]==lens[1])
  check(f'{foldername}:periods_disjoint',meta['previous_period']['end']<meta['current_period']['start'])
 g=ROOT/'fixtures/golden';meta=readjson(g/'manifest.json');expected=readjson(g/'expected.json')
 prev=totals(g,meta['previous_period']);cur=totals(g,meta['current_period'])
 for label,actual in [('previous',prev),('current',cur)]:
  for k,v in expected[label].items():check(f'golden:{label}:{k}',actual[k]==D(v))
 for ch,vals in expected['current_channels'].items():
  actual=totals(g,meta['current_period'],ch)
  for k,v in vals.items():check(f'golden:channel:{ch}:{k}',actual[k]==D(v))
 bridge={k:(cur[k]-prev[k])*(1 if k=='gross_sales' else -1) for k in FIELDS['sales_daily.csv']+FIELDS['channel_costs_daily.csv']+FIELDS['ad_spend_daily.csv']}
 for k,v in bridge.items():check(f'golden:bridge:{k}',v==D(expected['bridge'][k]))
 check('golden:bridge:reconciliation',sum(bridge.values())==cur['contribution_after_marketing']-prev['contribution_after_marketing']==D('-315.00'))
 dtc=totals(g,meta['current_period'],'DTC');reduced=dtc['contribution_after_marketing']+dtc['fulfillment_costs']*D('.10')
 check('golden:scenario:fulfillment_reduction',reduced==D('284.00'));check('golden:scenario:investment',reduced-D(20)==D('264.00'))
 z=ROOT/'fixtures/zero_ad';zm=readjson(z/'manifest.json');zt=totals(z,zm['current_period']);check('zero_ad:contribution',zt['ad_spend']==0 and zt['contribution_after_marketing']==D('705.00'))
 r=ROOT/'fixtures/refund_only';rm=readjson(r/'manifest.json');rt=totals(r,rm['current_period']);check('refund_only:signed_amounts',rt['net_revenue']==D('-100.00') and rt['contribution_after_marketing']==D('-60.00'))
 err=ROOT/'fixtures/errors'
 check('error_fixture:missing_cogs',sum(row['cogs_net']=='' for row in load(err/'missing_cogs/sales_daily.csv'))==1)
 rr=load(err/'duplicate_sales_key/sales_daily.csv');ks=[(x['date'],x['channel'],x['sku']) for x in rr];check('error_fixture:duplicate_key',len(ks)-len(set(ks))==1)
 check('error_fixture:missing_ad_day',len(load(err/'missing_ad_day/ad_spend_daily.csv'))==3)
 check('error_fixture:mixed_currency',{x['currency'] for x in load(err/'mixed_currency/sales_daily.csv')}=={'TWD','USD'})
 demo=ROOT/'fixtures/demo';dm=readjson(demo/'manifest.json');ds=load(demo/'sales_daily.csv')
 check('demo:shape',len(ds)==3360 and len({r['date'] for r in ds})==84 and len({r['sku'] for r in ds})==20)
 dp=totals(demo,dm['previous_period']);dc=totals(demo,dm['current_period'])
 summary={period:{k:money(v) for k,v in vals.items()} for period,vals in [('previous',dp),('current',dc)]}
 summary['status']='computed_synthetic_reference_not_real_results';summary['revenue_up_contribution_down']=dc['net_revenue']>dp['net_revenue'] and dc['contribution_after_marketing']<dp['contribution_after_marketing']
 (demo/'computed_summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 check('demo:designed_diagnostic',summary['revenue_up_contribution_down'])
 # Compact receipt; per-row checks are aggregated to keep the handoff readable.
 compact=[r for r in checks if '/sales_row:' not in r['check']]
 compact.append({'check':'individual_sales_row_value_constraints','status':'passed','rows_checked':len(checks)-len(compact)})
 report={'prepared_on':'2026-09-30','scope':'Specification-package fixture QA only; NOT application testing','assertions_passed':len(checks),'checks':compact,'application_implemented':False,'application_tests_run':False,'live_ai_tested':False,'deployed':False}
 out=ROOT/'verification/preparation-report.json';out.parent.mkdir(exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'passed':len(checks),'golden_current_contribution':money(cur['contribution_after_marketing']),'demo_current_net':money(dc['net_revenue']),'demo_current_contribution':money(dc['contribution_after_marketing']),'demo_previous_contribution':money(dp['contribution_after_marketing']),'app_tests_run':False},ensure_ascii=False))
if __name__=='__main__':main()
