"""Generate synthetic test assets only; not the EC ProfitLens application."""
from pathlib import Path
from decimal import Decimal as D, ROUND_HALF_UP
from datetime import date,timedelta
import csv,json,random,shutil
ROOT=Path(__file__).resolve().parents[1]
SF='date channel sku category units_sold gross_sales discounts refunds cogs_net currency'.split()
CF='date channel platform_fees payment_fees fulfillment_costs other_variable_costs currency'.split()
AF='date channel ad_spend currency'.split()
def m(x): return format(D(x).quantize(D('.01'),rounding=ROUND_HALF_UP),'.2f')
def js(p,o):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def csvout(p,fields,rows):
 p.parent.mkdir(parents=True,exist_ok=True)
 with p.open('w',encoding='utf-8',newline='') as f:
  w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)
def meta(id,start,end,split,channels=None):
 return dict(schema_version='1.0',dataset_id=id,source_type='synthetic',currency='TWD',timezone='Asia/Taipei',data_as_of=str(date.fromisoformat(end)+timedelta(days=1)),coverage_start=start,coverage_end=end,channels=channels or ['DTC','MARKETPLACE'],previous_period={'start':start,'end':str(date.fromisoformat(split)-timedelta(days=1))},current_period={'start':split,'end':end},sales_coverage_confirmed=True,amount_basis='product_amounts_excluding_tax_and_customer_shipping_income',note='All entities and values are synthetic. Not real business outcomes.')
def bundle(p,s,c,a,manifest):
 for fn,fields,rows in [('sales_daily.csv',SF,s),('channel_costs_daily.csv',CF,c),('ad_spend_daily.csv',AF,a)]:csvout(p/fn,fields,rows)
 js(p/'manifest.json',manifest)
def rows(fields,source,money_fields):
 result=[]
 for row in source:
  r=dict(zip(fields,row));r['currency']='TWD'
  for k in money_fields:r[k]=m(r[k])
  result.append(r)
 return result
def main():
 s=rows(SF,[
 ['2026-08-01','DTC','A','HOME',2,1000,100,0,400],['2026-08-01','DTC','B','CARE',1,500,0,50,200],
 ['2026-08-01','MARKETPLACE','A','HOME',2,600,60,0,270],['2026-08-01','MARKETPLACE','B','CARE',1,400,40,0,180],
 ['2026-08-02','DTC','A','HOME',3,1400,210,70,580],['2026-08-02','DTC','B','CARE',1,400,20,20,160],
 ['2026-08-02','MARKETPLACE','A','HOME',3,800,120,40,360],['2026-08-02','MARKETPLACE','B','CARE',1,500,100,50,225]],SF[5:9])
 c=rows(CF,[['2026-08-01','DTC',0,40,100,10],['2026-08-01','MARKETPLACE',90,20,60,10],['2026-08-02','DTC',0,44,140,16],['2026-08-02','MARKETPLACE',120,22,85,13]],CF[2:6])
 a=rows(AF,[['2026-08-01','DTC',200],['2026-08-01','MARKETPLACE',100],['2026-08-02','DTC',270],['2026-08-02','MARKETPLACE',180]],['ad_spend'])
 manifest=meta('golden-v1','2026-08-01','2026-08-02','2026-08-02');p=ROOT/'fixtures/golden';bundle(p,s,c,a,manifest)
 keys='gross_sales discounts refunds cogs_net platform_fees payment_fees fulfillment_costs other_variable_costs ad_spend net_revenue gross_profit contribution_before_marketing contribution_after_marketing'.split()
 expected={'status':'manually_specified_synthetic_reference','metric_version':'contribution-v1',
 'previous':dict(zip(keys,map(m,[2500,200,50,1050,90,60,160,20,300,2250,1200,870,570]))),
 'current':dict(zip(keys,map(m,[3100,450,180,1325,120,66,225,29,450,2470,1145,705,255]))),
 'current_channels':{'DTC':{'net_revenue':'1480.00','contribution_after_marketing':'270.00'},'MARKETPLACE':{'net_revenue':'990.00','contribution_after_marketing':'-15.00'}},
 'bridge':dict(zip(keys[:9]+['sum'],map(m,[600,-250,-130,-275,-30,-6,-65,-9,-150,-315]))),
 'scenario_dtc_fulfillment_reduction':{'volume_change':'0','discount_delta_pp':'0','fulfillment_unit_cost_change':'-0.10','ad_spend_change':'0','one_off_cost':'0.00','expected_contribution':'284.00'},
 'scenario_dtc_fulfillment_reduction_with_investment':{'volume_change':'0','discount_delta_pp':'0','fulfillment_unit_cost_change':'-0.10','ad_spend_change':'0','one_off_cost':'20.00','expected_contribution':'264.00'}}
 js(p/'expected.json',expected)
 for name in ['missing_cogs','duplicate_sales_key','missing_ad_day','mixed_currency']:
  ss=[dict(r) for r in s];cc=[dict(r) for r in c];aa=[dict(r) for r in a]
  if name=='missing_cogs':
   ss[4]['cogs_net']='';e={'classification':'partial','reason_code':'MISSING_COGS','current_net_revenue':'2470.00','current_total_contribution':None}
  elif name=='duplicate_sales_key':
   ss.append(dict(ss[4]));e={'classification':'blocking','reason_code':'DUPLICATE_SALES_KEY','affected_csv_line':10}
  elif name=='missing_ad_day':
   aa.pop();e={'classification':'partial','reason_code':'MISSING_AD_DAY','current_total_contribution':None}
  else:
   ss[4]['currency']='USD';e={'classification':'blocking','reason_code':'MIXED_CURRENCY'}
  mm=dict(manifest);mm['dataset_id']=name+'-v1';folder=ROOT/'fixtures/errors'/name;bundle(folder,ss,cc,aa,mm);js(folder/'expected_validation.json',e)
 aa=[dict(r,ad_spend='0.00') for r in a];mm=dict(manifest,dataset_id='zero-ad-v1');folder=ROOT/'fixtures/zero_ad';bundle(folder,s,c,aa,mm)
 js(folder/'expected.json',{'current_contribution_after_marketing':'705.00','current_mer':None})
 rs=rows(SF,[[day,'DTC','A','HOME',0,0,0,100,-40] for day in ['2026-08-01','2026-08-02']],SF[5:9])
 rc=rows(CF,[[day,'DTC',0,0,0,0] for day in ['2026-08-01','2026-08-02']],CF[2:6]);ra=rows(AF,[[day,'DTC',0] for day in ['2026-08-01','2026-08-02']],['ad_spend'])
 folder=ROOT/'fixtures/refund_only';bundle(folder,rs,rc,ra,meta('refund-only-v1','2026-08-01','2026-08-02','2026-08-02',['DTC']))
 js(folder/'expected.json',{'classification':'valid','current_net_revenue':'-100.00','current_contribution_after_marketing':'-60.00','current_contribution_margin':None,'scenario_allowed':False})
 rng=random.Random(20260930);s=[];c=[];a=[]
 prices=[390,490,590,690,790,890,990,1090,1190,1290,1390,1490,1590,1690,1790,1890,1990,2090,2290,2490]
 cats=['HOME','CARE','ACCESSORIES','ELECTRONICS']
 for off in range(84):
  day=str(date(2026,6,1)+timedelta(days=off));current=off>=42
  for ch in ['DTC','MARKETPLACE']:
   qtysum=0;netsum=D(0)
   for i,price in enumerate(prices):
    qty=rng.randint(0,6)+(2 if current and ch=='MARKETPLACE' else 1 if current else 0);g=D(price)*qty
    dr=(D('.07') if ch=='DTC' else D('.11'))+(D('.035') if current and ch=='DTC' else D('.13') if current else D(0));d=D(m(g*dr))
    rr=D('.018') if not current else D('.026') if ch=='DTC' else D('.065');r=D(m((g-d)*rr*D(rng.choice(['0.5','1','1.5']))));cg=D(m(g*(D('.40')+D(i%5)*D('.045'))))
    s.append(dict(zip(SF,[day,ch,f'SKU-{i+1:03d}',cats[i//5],qty,m(g),m(d),m(r),m(cg),'TWD'])));qtysum+=qty;netsum+=g-d-r
   pf=netsum*(D(0) if ch=='DTC' else D('.10') if not current else D('.14'));pay=netsum*D('.02');f=D(qtysum)*(D(13) if ch=='DTC' and not current else D(16) if ch=='DTC' else D(15) if not current else D(23));o=netsum*D('.005')
   c.append(dict(zip(CF,[day,ch,m(pf),m(pay),m(f),m(o),'TWD'])))
   base=3900 if not current else 4400 if ch=='DTC' else 12000
   a.append(dict(zip(AF,[day,ch,m(base+rng.randint(-350,350)),'TWD'])))
 dm=meta('synthetic-demo-12w-v1','2026-06-01','2026-08-23','2026-07-13');dm.update(seed=20260930,expected_shape={'days':84,'channels':2,'skus':20,'sales_rows':3360,'channel_cost_rows':168,'ad_spend_rows':168});bundle(ROOT/'fixtures/demo',s,c,a,dm)
 js(ROOT/'fixtures/demo/intent.json',{'status':'synthetic_design_not_real_findings','design':['In second period marketplace sales volume, discount burden, fulfillment cost and advertising expense rise.','Observed cost changes are not causal attribution.','No customer-level or media-attributed revenue data is present.']})
 for fn,fields in [('sales_daily.csv',SF),('channel_costs_daily.csv',CF),('ad_spend_daily.csv',AF)]:csvout(ROOT/'templates'/fn,fields,[])
 tm=dict(manifest,dataset_id='replace-with-your-dataset-id',source_type='user_provided',sales_coverage_confirmed=False,note='Fill and confirm dataset settings in the UI.');js(ROOT/'templates/manifest.example.json',tm)
 print('Synthetic fixtures generated.')
if __name__=='__main__':main()
