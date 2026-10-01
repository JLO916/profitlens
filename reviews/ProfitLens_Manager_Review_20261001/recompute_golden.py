from pathlib import Path
from decimal import Decimal as D
import csv, json
p = Path(__file__).parent
rows=[]
for name in ["sales_daily", "channel_costs_daily", "ad_spend_daily"]:
    with (p / f"live_golden_{name}.csv").open(encoding="utf-8") as f:
        rows.extend(csv.DictReader(f))
fields=["gross_sales","discounts","refunds","cogs_net","platform_fees","payment_fees","fulfillment_costs","other_variable_costs","ad_spend"]
result={}
for date in ["2026-08-01","2026-08-02"]:
    result[date]={}
    for channel in ["DTC","MARKETPLACE","ALL"]:
        t={k:sum((D(r[k]) for r in rows if r["date"]==date and (channel=="ALL" or r["channel"]==channel) and k in r),D(0)) for k in fields}
        t["net_revenue"]=t["gross_sales"]-t["discounts"]-t["refunds"]
        t["gross_profit"]=t["net_revenue"]-t["cogs_net"]
        t["contribution_before_marketing"]=t["gross_profit"]-sum(t[k] for k in ["platform_fees","payment_fees","fulfillment_costs","other_variable_costs"])
        t["contribution_after_marketing"]=t["contribution_before_marketing"]-t["ad_spend"]
        result[date][channel]={k:str(v) for k,v in t.items()}
assert D(result["2026-08-01"]["ALL"]["contribution_after_marketing"])==D("570")
assert D(result["2026-08-02"]["ALL"]["contribution_after_marketing"])==D("255")
print(json.dumps(result,indent=2,ensure_ascii=False))
