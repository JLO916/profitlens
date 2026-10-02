/**
 * ProfitLens review, 2026-10-01.
 * Narrow expressions manually transcribed from the deployed page bundle fetched via
 * Vercel.web_fetch_vercel_url. This is NOT a whole-app build or browser E2E test.
 * URL: https://profitlens-tau.vercel.app/_next/static/chunks/app/page-1507c22542a1d442.js
 * Synthetic test inputs below were created by the reviewer, not from any merchant.
 */
const fs=require('node:fs');
const assert=require('node:assert/strict');
function i(e){if("string"!=typeof e||!/^\d{4}-\d{2}-\d{2}$/.test(e))return!1;let s=Date.parse(`${e}T00:00:00Z`);return Number.isFinite(s)&&new Date(s).toISOString().slice(0,10)===e}
function a(e){if(!i(e.start)||!i(e.end)||e.start>e.end)throw RangeError("INVALID_PERIOD");return(Date.parse(`${e.end}T00:00:00Z`)-Date.parse(`${e.start}T00:00:00Z`))/864e5+1}
function o(e){return!!i(e.start)&&!!i(e.end)&&!!e.start.endsWith("-01")&&e.start.slice(0,7)===e.end.slice(0,7)&&new Date(Date.parse(`${e.end}T00:00:00Z`)+864e5).toISOString().slice(0,10).endsWith("-01")}
function c(e){let s={start:e.coverage_start,end:e.coverage_end};if([s,e.previous_period,e.current_period].some(e=>!e||!i(e.start)||!i(e.end)||e.start>e.end))return["INVALID_PERIOD"];let t=void 0===e.comparison_mode?"same_days":e.comparison_mode,n=[];for(let r of("same_days"!==t&&"calendar_months"!==t&&n.push("INVALID_COMPARISON_MODE"),"same_days"===t&&a(e.previous_period)!==a(e.current_period)&&n.push("UNEQUAL_PERIOD_LENGTH"),"calendar_months"!==t||[e.previous_period,e.current_period].every(o)||n.push("INCOMPLETE_CALENDAR_MONTH"),e.previous_period.start<=e.current_period.end&&e.current_period.start<=e.previous_period.end&&n.push("OVERLAPPING_PERIODS"),e.previous_period.end>=e.current_period.start&&n.push("PERIOD_ORDER_INVALID"),void 0===e.data_as_of||i(e.data_as_of)||n.push("INVALID_DATA_AS_OF"),[e.previous_period,e.current_period]))(r.start<s.start||r.end>s.end)&&n.push("PERIOD_OUTSIDE_COVERAGE"),void 0!==e.data_as_of&&i(e.data_as_of)&&r.end>e.data_as_of&&n.push("PERIOD_AFTER_DATA_AS_OF");return[...new Set(n)]}
function sz(e){return JSON.stringify(function e(s){return Array.isArray(s)?s.map(e):s&&"object"==typeof s?Object.fromEntries(Object.entries(s).filter(([,e])=>void 0!==e).sort(([e],[s])=>e<s?-1:+(e>s)).map(([s,t])=>[s,e(t)])):s}(e))}
function sH(e){return sz({dataset_id:e.report.dataset_id,dataset_hash:e.dataset_hash,filter_hash:e.filter_hash,metric_version:e.metric_version,data_as_of:e.data_as_of,scope:e.report.scope,period:e.report.current.period})}
function sB(e){if(!Number.isSafeInteger(e)||e<0)throw Error("INVALID_REVISION")}
function sJ(e,s,t){return sB(t),e.stale||e.revision!==t||e.snapshot_signature!==sH(s)}
function sQ(e,s,t){sB(t);let n=[...e.stale_reasons];return e.revision!==t&&n.push("WORKSPACE_REVISION_CHANGED"),e.snapshot_signature!==sH(s)&&n.push("SNAPSHOT_CHANGED"),{...e,stale:sJ(e,s,t),stale_reasons:[...new Set(n)]}}
function s3(e,s,t){return{...e,contexts:e.contexts.map(e=>({...e,session:sQ(e.session,s,t)}))}}
const monthly={coverage_start:'2026-08-01',coverage_end:'2026-09-30',data_as_of:'2026-10-01',comparison_mode:'calendar_months',previous_period:{start:'2026-08-01',end:'2026-08-31'},current_period:{start:'2026-09-01',end:'2026-09-30'}};
const dateCases=[
 ['complete_august_september',monthly,[]],
 ['same_days_rejects_unequal_months',{...monthly,comparison_mode:'same_days'},['UNEQUAL_PERIOD_LENGTH']],
 ['reversed_periods',{...monthly,previous_period:monthly.current_period,current_period:monthly.previous_period},['PERIOD_ORDER_INVALID']],
 ['after_data_as_of',{...monthly,data_as_of:'2026-09-29'},['PERIOD_AFTER_DATA_AS_OF']],
 ['incomplete_calendar_month',{...monthly,current_period:{start:'2026-09-01',end:'2026-09-29'}},['INCOMPLETE_CALENDAR_MONTH']]
].map(([name,input,expected])=>{const actual=c(input);assert.deepEqual(actual,expected);return{name,input,actual,expected,passed:true}});
const original={dataset_hash:'UNCHANGED_DATASET',filter_hash:'ALL_CHANNELS',metric_version:'contribution-v1',data_as_of:'2026-10-01',report:{dataset_id:'review-synthetic',scope:{channels:['DTC','MARKETPLACE'],previous_period:monthly.previous_period,current_period:monthly.current_period,comparison_mode:'calendar_months'},current:{period:monthly.current_period}}};
const single=structuredClone(original);single.filter_hash='DTC_ONLY';single.report.scope.channels=['DTC'];
const session={revision:1,snapshot_signature:sH(original),stale:false,stale_reasons:[]};
const initial={contexts:[{id:'existing-task-context',session}],items:[]};
const filtered=s3(initial,single,2);const restoredFilter=s3(filtered,original,3);
assert.equal(filtered.contexts[0].session.stale,true);assert.equal(restoredFilter.contexts[0].session.stale,true);
const actions={input_is_synthetic:true,dataset_hash_unchanged:original.dataset_hash===single.dataset_hash,steps:[{step:'create action with all-channel view',stale:initial.contexts[0].session.stale},{step:'switch only view filter to DTC',stale:filtered.contexts[0].session.stale,reasons:filtered.contexts[0].session.stale_reasons},{step:'switch view filter back to original',stale:restoredFilter.contexts[0].session.stale,reasons:restoredFilter.contexts[0].session.stale_reasons}],ui_source:'const p=l.session.stale; fieldset disabled:p; the entire action edit form is disabled when stale.',limitation:'Pure deployed freshness functions and supplied state transition executed; React click handler / actual disabled control not executed in a live browser.'};
// Same bucket-boundary expressions used inside deployed J. Amounts below are
// independently calculated uniform synthetic examples, not the deployed U aggregator.
const weekly=[monthly.previous_period,monthly.current_period].map(period=>{let r=a(period),l=Date.parse(`${period.start}T00:00:00Z`),o=e=>new Date(l+864e5*e).toISOString().slice(0,10);const buckets=[];for(let t=0;t<r;t+=7){let start=o(t),end=o(Math.min(t+6,r-1));const days=a({start,end});buckets.push({start,end,days,synthetic_daily_revenue:1000,synthetic_bucket_revenue:days*1000})}return{period,buckets}});
assert.deepEqual(weekly[0].buckets.map(x=>x.days),[7,7,7,7,3]);assert.deepEqual(weekly[1].buckets.map(x=>x.days),[7,7,7,7,2]);
// Isolated group-member selection and importance expressions, transcribed from nh.
function g(e){if(null==e||"string"==typeof e&&""===e.trim())return null;if("string"!=typeof e||!/^-?\d+(?:\.\d{1,2})?$/.test(e))throw TypeError("INVALID_MONEY");let s=e.startsWith("-"),[t,n=""]=(s?e.slice(1):e).split("."),r=100n*BigInt(t)+BigInt(n.padEnd(2,"0"));return s?-r:r}
const nl=e=>e<0n?-e:e,na=(e,s)=>e<s?-1:+(e>s),nc=e=>g(e.ranking_amount?.value);
const members=[{id:'all',scope:{kind:'all',channels:['DTC','MARKETPLACE']},ranking_amount:{value:'10.00'}},{id:'DTC',scope:{kind:'channel',channels:['DTC']},ranking_amount:{value:'100000.00'}}];
let n=[...members].sort((e,s)=>{let t,n;return Number("all"===s.scope.kind)-Number("all"===e.scope.kind)||(t=nl(nc(e)??0n),t>(n=nl(nc(s)??0n))?-1:t<n?1:na(e.id,s.id))}),primary=n[0],magnitudes=n.map(nc).filter(e=>null!==e).map(nl),maxMagnitude=magnitudes.reduce((e,s)=>s>e?s:e,0n);
assert.equal(primary.id,'all');assert.equal(maxMagnitude,10000000n);
const priority={input_is_synthetic:true,case:'Opposing channel spend changes can leave a small aggregate change while a subchannel change is large.',members,threshold:'1000.00',qualifies:maxMagnitude>=g('1000.00'),threshold_basis_amount:'100000.00',displayed_primary_amount:primary.ranking_amount.value,default_action_scope:primary.scope,limitation:'Isolated selection/sort expressions evaluated, not the full diagnostics rule engine. Synthetic feasibility: previous total revenue 2,000,000, current 1,999,000; total ads 200,000 -> 200,010; DTC revenue 1,000,000 -> 999,500 and ads 100,000 -> 200,000; marketplace ads 100,000 -> 10. Both aggregate and DTC ad/revenue ratios rise.'};
const output={scope:'Narrow deployed-source regression checks, not browser E2E',source_url:'https://profitlens-tau.vercel.app/_next/static/chunks/app/page-1507c22542a1d442.js',source_etag:'W/"e022f3f22f904c520fe028d0cfc8fc2f"',date_validation:dateCases,action_freshness:actions,weekly_buckets:weekly,priority_display_alignment:priority};
fs.writeFileSync(__dirname+'/logic_results.json',JSON.stringify(output,null,2));
console.log(JSON.stringify({date_checks:dateCases.length,all_date_assertions_passed:true,action_stale_on_filter:filtered.contexts[0].session.stale,action_stale_after_switch_back:restoredFilter.contexts[0].session.stale,month_bucket_days:weekly.map(x=>x.buckets.map(y=>y.days)),priority_qualifies:priority.qualifies,priority_shown:primary.ranking_amount.value,priority_threshold_basis:priority.threshold_basis_amount},null,2));
