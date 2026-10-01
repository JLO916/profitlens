import { AI_METRIC_NAMES, AI_MONEY_METRICS, AI_SNAPSHOT_VERSION, AiSnapshotSchema, type AiFact, type AiSnapshot } from "../ai/contracts";
import { COST_FIELDS, SALES_FIELDS, type Fact, type SourceRef } from "../domain/types";
import { metricDefinitions } from "./presentation";
import type { WorkspaceSnapshot } from "./workspace";
export interface PreparedAiSnapshot { payload: AiSnapshot; localFacts: Record<string, Fact>; localChannels: Record<string, string> }
const roles: Record<SourceRef["file"], AiFact["source_refs"][number]["role"]> = { "sales_daily.csv": "sales", "channel_costs_daily.csv": "channel_costs", "ad_spend_daily.csv": "ad_spend", "manifest.json": "manifest" };
function sourceSummary(fact: Fact): AiFact["source_refs"] {
  const allowed = new Set<SourceRef["file"]>(["manifest.json"]);
  for (const field of metricDefinitions[fact.metric].fields) {
    if ((SALES_FIELDS as readonly string[]).includes(field)) allowed.add("sales_daily.csv");
    else if ((COST_FIELDS as readonly string[]).includes(field)) allowed.add("channel_costs_daily.csv");
    else if (field === "ad_spend") allowed.add("ad_spend_daily.csv");
  }
  const counts = new Map<AiFact["source_refs"][number]["role"], { rows: number; missing_rows: number }>();
  const unique = new Set<string>();
  for (const source of fact.sources) {
    if (!allowed.has(source.file)) continue;
    const key = JSON.stringify(source);
    if (unique.has(key)) continue;
    unique.add(key);
    const role = roles[source.file], count = counts.get(role) ?? { rows: 0, missing_rows: 0 };
    if (source.line === null && source.file !== "manifest.json") count.missing_rows++;
    else count.rows++;
    counts.set(role, count);
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([role, count]) => ({ role, ...count }));
}

/** Selected-channel aggregate only; raw names, SKU facts and source rows remain in local maps. */
export function prepareAiSnapshot(snapshot: WorkspaceSnapshot, revision: number): PreparedAiSnapshot {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new RangeError("INVALID_AI_REVISION");
  const channels = [...snapshot.report.scope.channels].sort();
  const localChannels = Object.fromEntries(channels.map((channel, index) => [`C${String(index + 1).padStart(2, "0")}`, channel]));
  const localFacts: Record<string, Fact> = {};
  const facts: AiFact[] = [];
  for (const period of ["previous", "current"] as const) {
    const selected = snapshot.report[period].period;
    for (const metric of AI_METRIC_NAMES) {
      const original = snapshot.report.facts.find(fact => fact.metric === metric && fact.scope.kind === "all" && fact.period.start === selected.start && fact.period.end === selected.end && JSON.stringify([...fact.scope.channels].sort()) === JSON.stringify(channels));
      if (!original) throw new Error("AI_SOURCE_FACT_MISSING");
      const id = `F${String(facts.length + 1).padStart(3, "0")}`;
      localFacts[id] = structuredClone(original);
      facts.push({ id, kind: "metric", metric, period, scope: "selected_channels", value: original.value, reason_codes: [...original.reason_codes], source_refs: sourceSummary(original) });
    }
  }
  const missing_fact_ids = facts.filter(fact => AI_MONEY_METRICS.includes(fact.metric) && fact.value === null).map(fact => fact.id);
  const payload = AiSnapshotSchema.parse({
    schema_version: AI_SNAPSHOT_VERSION, snapshot_id: `ai-v2:${snapshot.dataset_hash}:${snapshot.filter_hash}:${revision}`,
    currency: "TWD", metric_version: snapshot.metric_version, data_as_of: snapshot.data_as_of,
    comparison: { mode: snapshot.report.comparison.mode, previous_days: snapshot.report.comparison.previous_days, current_days: snapshot.report.comparison.current_days },
    periods: { previous: { ...snapshot.report.previous.period }, current: { ...snapshot.report.current.period } },
    filters: { channels: Object.keys(localChannels) }, data_quality: { status: missing_fact_ids.length ? "partial" : "complete", missing_fact_ids }, facts,
  });
  return { payload, localFacts, localChannels };
}
