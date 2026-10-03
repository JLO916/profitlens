#!/usr/bin/env python3
"""Generate spec/test_anchors.v1.json for ProfitLens 3 PRD from repo fixtures.
Usage: python3 spec/tools/gen_test_anchors.py --repo . --out spec/test_anchors.v1.json
All amounts computed with Decimal; rounding ROUND_HALF_UP only at output.
"""
import csv, json, datetime
from decimal import Decimal as D, ROUND_HALF_UP, getcontext
getcontext().prec = 50

import argparse, os
_ap = argparse.ArgumentParser(description='Regenerate ProfitLens 3 test anchors from repo fixtures')
_ap.add_argument('--repo', default='.', help='profitlens repo root (contains fixtures/demo)')
_ap.add_argument('--out', default='spec/test_anchors.v1.json', help='output JSON path')
_args = _ap.parse_args()
FX = os.path.join(_args.repo, 'fixtures', 'demo') + os.sep
OUT = _args.out

FIELDS = ['G', 'D', 'R', 'C', 'P', 'Q', 'F', 'O', 'A', 'U']
rows = {}  # (date, scope) -> dict

def add(d, ch, k, v):
    for c in (ch, 'ALL'):
        rows.setdefault((d, c), {f: D(0) for f in FIELDS})[k] += v

for r in csv.DictReader(open(FX + 'sales_daily.csv', encoding='utf-8-sig')):
    for k, f in [('G', 'gross_sales'), ('D', 'discounts'), ('R', 'refunds'), ('C', 'cogs_net'), ('U', 'units_sold')]:
        add(r['date'], r['channel'], k, D(r[f]))
for r in csv.DictReader(open(FX + 'channel_costs_daily.csv', encoding='utf-8-sig')):
    for k, f in [('P', 'platform_fees'), ('Q', 'payment_fees'), ('F', 'fulfillment_costs'), ('O', 'other_variable_costs')]:
        add(r['date'], r['channel'], k, D(r[f]))
for r in csv.DictReader(open(FX + 'ad_spend_daily.csv', encoding='utf-8-sig')):
    add(r['date'], r['channel'], 'A', D(r['ad_spend']))

def agg(s, e, c):
    t = {f: D(0) for f in FIELDS}
    for (d, cc), v in rows.items():
        if cc == c and s <= d <= e:
            for k in FIELDS:
                t[k] += v[k]
    N = t['G'] - t['D'] - t['R']
    GP = N - t['C']
    CMb = GP - t['P'] - t['Q'] - t['F'] - t['O']
    CMa = CMb - t['A']
    t.update(N=N, GP=GP, CMb=CMb, CMa=CMa)
    return t

def q(x, n='0.01'):
    return None if x is None else str(D(x).quantize(D(n), rounding=ROUND_HALF_UP))

def pct(a, b):
    return None if b == 0 else a / b * 100

def rates(t):
    return {
        'gross_margin_pct': q(pct(t['GP'], t['N']), '0.0001'),
        'contribution_margin_pct': q(pct(t['CMa'], t['N']), '0.0001'),
        'discount_rate_pct': q(pct(t['D'], t['G']), '0.0001'),
        'refund_ratio_pct': q(pct(t['R'], t['G'] - t['D']), '0.0001'),
        'platform_fee_rate_pct': q(pct(t['P'], t['N']), '0.0001'),
        'fulfillment_burden_pct': q(pct(t['F'], t['N']), '0.0001'),
        'marketing_burden_pct': q(pct(t['A'], t['N']), '0.0001'),
        'mer': q(t['N'] / t['A'], '0.0001') if t['A'] > 0 and t['N'] > 0 else None,
        'breakeven_mer': q(t['N'] / t['CMb'], '0.0001') if t['CMb'] > 0 and t['N'] > 0 else None,
    }

def money(t):
    keys = {'G': 'gross_sales', 'D': 'discounts', 'R': 'refunds', 'C': 'cogs_net', 'P': 'platform_fees',
            'Q': 'payment_fees', 'F': 'fulfillment_costs', 'O': 'other_variable_costs', 'A': 'ad_spend',
            'N': 'net_revenue', 'GP': 'gross_profit', 'CMb': 'contribution_before_ads', 'CMa': 'contribution_after_ads'}
    out = {v: q(t[k]) for k, v in keys.items()}
    out['units_sold'] = str(int(t['U']))
    return out

BASES = {'D': 'G', 'C': 'G', 'R': 'GD', 'P': 'N', 'Q': 'N', 'F': 'N', 'O': 'N', 'A': 'N'}
ITEM_ID = {'D': 'discounts', 'C': 'cogs_net', 'R': 'refunds', 'P': 'platform_fees', 'Q': 'payment_fees',
           'F': 'fulfillment_costs', 'O': 'other_variable_costs', 'A': 'ad_spend'}

def base(t, b):
    return t['G'] if b == 'G' else (t['G'] - t['D'] if b == 'GD' else t['N'])

def excess(a, b):
    return {ITEM_ID[k]: q(b[k] - a[k] * (base(b, bk) / base(a, bk))) for k, bk in BASES.items()}

PREV = ('2026-06-01', '2026-07-12')
CUR = ('2026-07-13', '2026-08-23')
W33 = ('2026-08-10', '2026-08-16')
W34 = ('2026-08-17', '2026-08-23')

scopes = {'ALL': 'all', 'DTC': 'DTC', 'MARKETPLACE': 'MARKETPLACE'}
period_compare = {}
for c in scopes:
    a = agg(*PREV, c); b = agg(*CUR, c)
    dN = b['N'] - a['N']; dD = b['D'] - a['D']; dA = b['A'] - a['A']; dCM = b['CMa'] - a['CMa']
    period_compare[c] = {
        'prev': {**money(a), **rates(a)},
        'cur': {**money(b), **rates(b)},
        'delta': {'net_revenue': q(dN), 'discounts': q(dD), 'ad_spend': q(dA), 'refunds': q(b['R'] - a['R']),
                  'platform_fees': q(b['P'] - a['P']), 'contribution_after_ads': q(dCM)},
        'incremental': {
            'inc_rev_per_discount': q(dN / dD, '0.0001') if dD > 0 else None,
            'inc_rev_per_ad': q(dN / dA, '0.0001') if dA > 0 else None,
            'inc_contribution_margin_pct': q(dCM / dN * 100, '0.0001') if dN > 0 else None,
        },
        'excess_vs_prev_ratio': excess(a, b),
    }

today = {}
for c in scopes:
    a = agg(*W33, c); b = agg(*W34, c)
    today[c] = {'cur': {**money(b), **rates(b)}, 'prev': {**money(a), **rates(a)},
                'pct_change': {'net_revenue': q(pct(b['N'] - a['N'], a['N']), '0.0001'),
                               'contribution_after_ads': q(pct(b['CMa'] - a['CMa'], a['CMa']), '0.0001') if a['CMa'] > 0 else None}}

mkt_daily = []
d0 = datetime.date(2026, 8, 17)
for i in range(7):
    d = (d0 + datetime.timedelta(days=i)).isoformat()
    mkt_daily.append({'date': d, 'contribution_after_ads': q(agg(d, d, 'MARKETPLACE')['CMa'])})

# Lights (default thresholds, PRD 11.4)
def light(metric, v):
    v = D(v)
    if metric == 'contribution_margin_pct':
        return 'green' if v >= 20 else ('yellow' if v >= 10 else 'red')
    if metric == 'discount_rate_pct':
        return 'green' if v <= 12 else ('yellow' if v <= 20 else 'red')
    if metric == 'marketing_burden_pct':
        return 'green' if v <= 8 else ('yellow' if v <= 12 else 'red')
    if metric == 'refund_ratio_pct':
        return 'green' if v <= 3 else ('yellow' if v <= 5 else 'red')
    if metric == 'mer':
        return 'green' if v >= 12 else ('yellow' if v >= 8 else 'red')
    if metric == 'platform_fee_rate_pct':
        return 'green' if v <= 12 else ('yellow' if v <= 16 else 'red')

lights = {}
for c in ['DTC', 'MARKETPLACE']:
    r = today[c]['cur']
    lights[c] = {m: {'value': r[m], 'light': light(m, r[m])} for m in
                 ['contribution_margin_pct', 'discount_rate_pct', 'marketing_burden_pct', 'refund_ratio_pct', 'mer']}
    if c == 'MARKETPLACE':
        lights[c]['platform_fee_rate_pct'] = {'value': r['platform_fee_rate_pct'], 'light': light('platform_fee_rate_pct', r['platform_fee_rate_pct'])}
    else:
        lights[c]['platform_fee_rate_pct'] = {'value': None, 'light': 'not_applicable'}

# Pacing (demo_tw targets for 2026-08)
mtd = agg('2026-08-01', '2026-08-23', 'ALL')
tp = D(23) / D(31) * 100
pacing = {
    'month': '2026-08', 'elapsed_days': 23, 'days_in_month': 31, 'time_progress_pct': q(tp, '0.0001'),
    'targets': {'net_revenue': '6000000.00', 'contribution_after_ads': '1200000.00', 'ad_budget': '500000.00'},
    'net_revenue': {'actual': q(mtd['N']), 'attainment_pct': q(mtd['N'] / 6000000 * 100, '0.0001'),
                    'pacing_gap_pp': q(mtd['N'] / 6000000 * 100 - tp, '0.0001'), 'light': 'green',
                    'linear_projection': q(mtd['N'] / 23 * 31)},
    'contribution_after_ads': {'actual': q(mtd['CMa']), 'attainment_pct': q(mtd['CMa'] / 1200000 * 100, '0.0001'),
                               'pacing_gap_pp': q(mtd['CMa'] / 1200000 * 100 - tp, '0.0001'), 'light': 'yellow',
                               'linear_projection': q(mtd['CMa'] / 23 * 31)},
    'ad_budget': {'actual': q(mtd['A']), 'used_pct': q(mtd['A'] / 500000 * 100, '0.0001'),
                  'overpace_pp': q(mtd['A'] / 500000 * 100 - tp, '0.0001'), 'light': 'green'},
}

# Scenario-v1 (PRD 10.6 / SCENARIOS.md)
mk = agg(*CUR, 'MARKETPLACE')
def scenario(t, v, delta_pp, f, a, K):
    s = 1 + D(v) / 100; dl = D(delta_pp) / 100
    d = t['D'] / t['G']; r = t['R'] / (t['G'] - t['D'])
    G1 = t['G'] * s; D1 = G1 * (d + dl); R1 = (G1 - D1) * r; N1 = G1 - D1 - R1
    C1 = t['C'] * s; P1 = t['P'] * N1 / t['N']; Q1 = t['Q'] * N1 / t['N']
    F1 = t['F'] * s * (1 + D(f) / 100); O1 = t['O'] * s; A1 = t['A'] * (1 + D(a) / 100)
    CM = N1 - C1 - P1 - Q1 - F1 - O1 - A1 - D(K)
    return {'net_revenue': N1, 'contribution_after_ads': CM, 'ad_spend': A1, 'discount_rate': d + dl}

s4 = scenario(mk, -10, -5, 0, -30, 0)

def goal_seek_discount(t, v, f, a, K, T):
    s = 1 + D(v) / 100; d = t['D'] / t['G']; r = t['R'] / (t['G'] - t['D']); k = (t['P'] + t['Q']) / t['N']
    X = t['C'] * s + t['F'] * s * (1 + D(f) / 100) + t['O'] * s + t['A'] * (1 + D(a) / 100) + D(K)
    N1 = (D(T) + X) / (1 - k)
    delta = 1 - d - N1 / (t['G'] * s * (1 - r))
    return d + delta, delta

def goal_seek_ad(t, v, delta_pp, f, K, T):
    s = 1 + D(v) / 100; d = t['D'] / t['G']; r = t['R'] / (t['G'] - t['D']); k = (t['P'] + t['Q']) / t['N']
    N1 = t['G'] * s * (1 - d - D(delta_pp) / 100) * (1 - r)
    A1 = N1 * (1 - k) - t['C'] * s - t['F'] * s * (1 + D(f) / 100) - t['O'] * s - D(K) - D(T)
    return A1, (A1 / t['A'] - 1) * 100

g_rate, g_delta = goal_seek_discount(mk, -10, 0, -30, 0, 0)
chk1 = scenario(mk, -10, g_delta * 100, 0, -30, 0)['contribution_after_ads']
g_ad, g_a = goal_seek_ad(mk, -10, -5, 0, 0, 0)
chk2 = scenario(mk, -10, -5, 0, g_a, 0)['contribution_after_ads']

def tax(x):
    if x == '':
        return ''
    try:
        return str((D(x) / D('1.05')).quantize(D('0.01'), rounding=ROUND_HALF_UP))
    except Exception:
        return x

def iso(dstr):
    y, w, _ = datetime.date.fromisoformat(dstr).isocalendar()
    return f'{y}-W{w:02d}'

anchors = {
    'anchors_version': 1,
    'generated_at': '2026-10-03',
    'source': {'fixture': 'fixtures/demo (seed 20260930, data_as_of 2026-08-24)', 'golden': 'fixtures/golden/expected.json',
               'metric_version': 'contribution-v1', 'rules_version': 'rules-v2', 'rounding': 'ROUND_HALF_UP at output only'},
    'periods': {'prev': {'start': PREV[0], 'end': PREV[1]}, 'cur': {'start': CUR[0], 'end': CUR[1]},
                'today_cur': {'start': W34[0], 'end': W34[1]}, 'today_prev': {'start': W33[0], 'end': W33[1]}},
    'iso_weeks': {'2026-06-01': iso('2026-06-01'), '2026-07-13': iso('2026-07-13'), '2026-08-17': iso('2026-08-17'),
                  '2026-08-23': iso('2026-08-23'), '2026-08-24': iso('2026-08-24'), '2026-12-28': iso('2026-12-28'),
                  '2027-01-03': iso('2027-01-03')},
    'period_presets_data_as_of_2026_08_24': {
        'yd': {'cur': ['2026-08-23', '2026-08-23'], 'prev': ['2026-08-22', '2026-08-22']},
        'l7': {'cur': ['2026-08-17', '2026-08-23'], 'prev': ['2026-08-10', '2026-08-16']},
        'l28': {'cur': ['2026-07-27', '2026-08-23'], 'prev': ['2026-06-29', '2026-07-26']},
        'lw': {'cur': ['2026-08-17', '2026-08-23'], 'prev': ['2026-08-10', '2026-08-16']},
        'mtd': {'cur': ['2026-08-01', '2026-08-23'], 'prev': ['2026-07-01', '2026-07-23']},
        'lm': {'cur': ['2026-07-01', '2026-07-31'], 'prev': ['2026-06-01', '2026-06-30']},
        'yoy_l7': {'cur': ['2026-08-17', '2026-08-23'], 'compare': ['2025-08-18', '2025-08-24']},
    },
    'A1_period_compare': period_compare,
    'A1_headline': {
        'scope': 'all', 'template_id': 'H_UP_DOWN',
        'drivers': [{'item': 'discounts', 'channel': 'MARKETPLACE', 'channel_share_of_positive_excess_pct': q(D('726190.40') / (D('726190.40') + D('155831.20')) * 100, '0.01'), 'display_delta': '959955.80'},
                    {'item': 'ad_spend', 'channel': 'MARKETPLACE', 'channel_share_of_positive_excess_pct': '100.00', 'display_delta': '340757.00'}],
        'driver_min_ratio_of_abs_dcm': '0.20', 'channel_attribution_min_share': '0.70',
        'expected_zh_TW': '業績多了 170.9 萬，但扣完廣告反而少賺 59.9 萬，主因是平台的折扣（多 96.0 萬）與廣告（多 34.1 萬）',
        'channel_display_names': {'DTC': '官網', 'MARKETPLACE': '平台'},
    },
    'A3_today': {
        'windows': today, 'marketplace_daily_cm': mkt_daily,
        'consecutive_negative_days': {'channel': 'MARKETPLACE', 'days': 6, 'from': '2026-08-18', 'to': '2026-08-23', 'severity': 'red'},
        'lights': lights,
        'headline_template_id': 'H_FLAT', 'warning_template_id': 'W_CONSECUTIVE_NEGATIVE',
        'expected_zh_TW': '業績和獲利與前 7 天差不多（業績 −1.8%、扣廣告後貢獻 −2.1%）；需要注意：平台扣完廣告連 6 天虧損',
    },
    'A5_pacing': pacing,
    'A6_scenario': {
        'golden': {'baseline_dtc_cur': '270.00', 'f_minus_10': '284.00', 'f_minus_10_K_20': '264.00'},
        'S4_marketplace': {'inputs': {'v_pct': -10, 'delta_pp': -5, 'f_pct': 0, 'a_pct': -30, 'K': 0},
                           'baseline_contribution_after_ads': q(mk['CMa']),
                           'net_revenue': q(s4['net_revenue']), 'contribution_after_ads': q(s4['contribution_after_ads']),
                           'delta_vs_baseline': q(s4['contribution_after_ads'] - mk['CMa']), 'ad_spend': q(s4['ad_spend']),
                           'discount_rate_pct': q(s4['discount_rate'] * 100, '0.0001'),
                           'contribution_margin_pct': q(s4['contribution_after_ads'] / s4['net_revenue'] * 100, '0.0001'),
                           'mer': q(s4['net_revenue'] / s4['ad_spend'], '0.0001'),
                           'threshold_T0_pct': '-46.706808158415', 'threshold_T_baseline_pct': '-55.934187406133',
                           'note': '門檻值取自 v2 正式站實測（scenario-sensitivity-v1），實作需與 kernel 結果逐位一致'},
        'S8_goal_seek_discount_cap': {'inputs': {'v_pct': -10, 'f_pct': 0, 'a_pct': -30, 'K': 0, 'target_contribution_after_ads': '0'},
                                      'max_discount_rate_pct': q(g_rate * 100, '0.0001'), 'delta_pp': q(g_delta * 100, '0.0001'),
                                      'recheck_contribution_after_ads': q(chk1)},
        'S9_goal_seek_ad_cap': {'inputs': {'v_pct': -10, 'delta_pp': -5, 'f_pct': 0, 'K': 0, 'target_contribution_after_ads': '0'},
                                'max_ad_spend': q(g_ad), 'a_pct': q(g_a, '0.0001'), 'recheck_contribution_after_ads': q(chk2)},
    },
    'A7_tax_inclusive_5pct': {
        'cases': [{'in': x, 'out': tax(x)} for x in ['105.00', '1.00', '1050.37', '0.01', '', 'abc']],
        'row_level_sum': {'rows': ['1.00', '1.00', '1.00'], 'expected_sum': '2.85', 'not': '2.86'},
    },
    'A8_outcome_checks': [],
    'A9_golden': {
        'prev': {'G': 2500, 'D': 200, 'R': 50, 'C': 1050, 'P': 90, 'Q': 60, 'F': 160, 'O': 20, 'A': 300, 'N': 2250, 'GP': 1200, 'CMb': 870, 'CMa': 570},
        'cur': {'G': 3100, 'D': 450, 'R': 180, 'C': 1325, 'P': 120, 'Q': 66, 'F': 225, 'O': 29, 'A': 450, 'N': 2470, 'GP': 1145, 'CMb': 705, 'CMa': 255},
        'cur_by_channel': {'DTC': {'N': 1480, 'CMa': 270}, 'MARKETPLACE': {'N': 990, 'CMa': -15}},
        'delta': {'N': 220, 'CMa': -315},
    },
    'A10_rule_triggers_cur_vs_prev': {
        'REV_UP_CM_DOWN': {'all': True, 'DTC': False, 'MARKETPLACE': True},
        'NEGATIVE_CHANNEL_CM': {'DTC': False, 'MARKETPLACE': True},
        'DISCOUNT_BURDEN_UP': {'all': True, 'DTC': True, 'MARKETPLACE': True},
        'REFUND_BURDEN_UP': {'all': True, 'DTC': True, 'MARKETPLACE': True},
        'FULFILLMENT_BURDEN_UP': {'all': True, 'DTC': True, 'MARKETPLACE': True},
        'MARKETING_BURDEN_UP': {'all': True, 'DTC': False, 'MARKETPLACE': True},
        'SKU_NEGATIVE_GP': {'any': False},
        'MISSING_CRITICAL_DATA': {'any': False},
        'DISCOUNT_EXCEEDS_GROWTH': {'all': False, 'DTC': False, 'MARKETPLACE': True},
        'AD_INCREMENT_BELOW_BREAKEVEN': {'all': False, 'DTC': False, 'MARKETPLACE': True,
                                         'MARKETPLACE_impact': q(D('340757.00') - D('946226.93') / (mk['N'] / mk['CMb']))},
        'PLATFORM_FEE_RATE_UP': {'MARKETPLACE': True, 'MARKETPLACE_impact': period_compare['MARKETPLACE']['excess_vs_prev_ratio']['platform_fees']},
        'v1_rule_group_count': 14,
    },
}

# Outcome checks O1/O2 (PRD 13.4)
for c, m, label in [('MARKETPLACE', 'discount_rate_pct', 'O1'), ('DTC', 'contribution_margin_pct', 'O2')]:
    before = rates(agg('2026-07-27', '2026-08-09', c))[m]
    after = rates(agg('2026-08-10', '2026-08-23', c))[m]
    diff = D(after) - D(before)
    good_up = m == 'contribution_margin_pct'
    improved = (diff >= 1) if good_up else (diff <= -1)
    worse = (diff <= -1) if good_up else (diff >= 1)
    verdict = 'improving' if improved else ('not_improved_worse' if worse else 'not_improved_flat')
    anchors['A8_outcome_checks'].append({'id': label, 'channel': c, 'metric': m, 'started_at': '2026-08-10', 'check_date': '2026-08-23',
                                         'baseline_period': ['2026-07-27', '2026-08-09'], 'after_period': ['2026-08-10', '2026-08-23'],
                                         'before': before, 'after': after, 'diff_pp': q(diff, '0.0001'), 'min_change_pp': '1.0', 'verdict': verdict})
anchors['A8_outcome_checks'].append({'id': 'O3', 'check_date': '2026-09-06', 'data_through': '2026-08-23', 'verdict': 'insufficient_data'})

with open(OUT, 'w', encoding='utf-8') as fh:
    json.dump(anchors, fh, ensure_ascii=False, indent=2)
print('written', OUT)
print('S4', anchors['A6_scenario']['S4_marketplace'])
print('S8', anchors['A6_scenario']['S8_goal_seek_discount_cap'])
print('S9', anchors['A6_scenario']['S9_goal_seek_ad_cap'])
print('O', anchors['A8_outcome_checks'])
print('lights', lights)
print('pacing', pacing['net_revenue'], pacing['contribution_after_ads'], pacing['ad_budget'])
print('rule10', anchors['A10_rule_triggers_cur_vs_prev']['AD_INCREMENT_BELOW_BREAKEVEN'])
print('iso', anchors['iso_weeks'])
print('tax', anchors['A7_tax_inclusive_5pct'])
