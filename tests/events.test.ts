import { describe, expect, it } from "vitest";
import { EVENT_LABEL_MAX, eventBands, eventSuffix, eventsCsvTemplate, exportEventsCsv, overlapping, parseEvents, type EventSet } from "../src/application/events";
import { fill, labels } from "../src/i18n";

const encoder = new TextEncoder();
const load = (text: string, name = "events.csv") => parseEvents({ name, bytes: encoder.encode(text) });
// 標籤取自 labels 以外的中性字串，避免在測試硬編中文；夏季特賣等例子用英文代稱。
const SUMMER = "Summer Sale";
const MID = "Mid-month";
const AUTUMN = "Autumn";

// 週軸：2026-07-06（一）起四週，每週 7 天；第 i 週佔 [i, i+1)。
const WEEKS = [
  { start: "2026-07-06", end: "2026-07-12" },
  { start: "2026-07-13", end: "2026-07-19" },
  { start: "2026-07-20", end: "2026-07-26" },
  { start: "2026-07-27", end: "2026-08-02" },
];

// 三個檔期：一個跨週界（07-15..07-20）、一個在週內（07-08..07-09）、一個在軸外（09-01..09-03）。故意亂序以驗證排序。
const THREE = `start,end,label,note\r\n2026-09-01,2026-09-03,${AUTUMN},x\r\n2026-07-15,2026-07-20, ${SUMMER} ,y\r\n2026-07-08,2026-07-09,${MID},z\r\n`;

describe("R4 events.csv parsing", () => {
  it("reads a 3-event file, trims labels, ignores extra columns and sorts by start then end", () => {
    const { set, issues } = load(THREE);
    expect(issues).toEqual([]);
    expect(set).toEqual({
      filename: "events.csv",
      rows: [
        { start: "2026-07-08", end: "2026-07-09", label: MID, line: 4 },
        { start: "2026-07-15", end: "2026-07-20", label: SUMMER, line: 3 },
        { start: "2026-09-01", end: "2026-09-03", label: AUTUMN, line: 2 },
      ],
    });
  });

  it("sorts same-start events by end and keeps file order for identical ranges", () => {
    const { set } = load("start,end,label\n2026-07-01,2026-07-09,A\n2026-07-01,2026-07-03,B\n2026-07-01,2026-07-03,C\n");
    expect(set?.rows.map(row => row.label)).toEqual(["B", "C", "A"]);
  });

  it("accepts a single-day event and a BOM-prefixed file", () => {
    const { set, issues } = load("﻿start,end,label\n2026-07-15,2026-07-15,Flash\n");
    expect(issues).toEqual([]);
    expect(set?.rows).toEqual([{ start: "2026-07-15", end: "2026-07-15", label: "Flash", line: 2 }]);
  });

  it("reports MISSING_COLUMN for each absent column on the header line", () => {
    const { set, issues } = load("start,name\n2026-07-01,2026-07-02\n");
    expect(set).toBeNull();
    expect(issues.map(({ reason_code, line, field }) => ({ reason_code, line, field }))).toEqual([
      { reason_code: "MISSING_COLUMN", line: 1, field: "end" },
      { reason_code: "MISSING_COLUMN", line: 1, field: "label" },
    ]);
    expect(issues[0].message).toBe(fill(labels.events.errors.MISSING_COLUMN, { field: "end" }));
  });

  it("reports INVALID_DATE per field with its line", () => {
    const { set, issues } = load("start,end,label\n2026-07-01,2026-07-02,OK\n2026/07/03,2026-02-30,Bad\n");
    expect(set).toBeNull();
    expect(issues.map(({ reason_code, line, field }) => ({ reason_code, line, field }))).toEqual([
      { reason_code: "INVALID_DATE", line: 3, field: "start" },
      { reason_code: "INVALID_DATE", line: 3, field: "end" },
    ]);
    expect(issues[0].message).toBe(fill(labels.events.errors.INVALID_DATE, { line: 3 }));
  });

  it("reports PERIOD_ORDER when end is before start", () => {
    const { set, issues } = load("start,end,label\n2026-07-20,2026-07-15,Back\n");
    expect(set).toBeNull();
    expect(issues).toEqual([{ line: 2, field: "end", reason_code: "PERIOD_ORDER", message: fill(labels.events.errors.PERIOD_ORDER, { line: 2 }) }]);
  });

  it("reports EMPTY_LABEL for blank or whitespace-only labels", () => {
    const { set, issues } = load("start,end,label\n2026-07-01,2026-07-02,\n2026-07-03,2026-07-04,\"   \"\n");
    expect(set).toBeNull();
    expect(issues.map(({ reason_code, line }) => [reason_code, line])).toEqual([["EMPTY_LABEL", 2], ["EMPTY_LABEL", 3]]);
    expect(issues[1].message).toBe(fill(labels.events.errors.EMPTY_LABEL, { line: 3 }));
  });

  it("allows exactly 60 characters (counted by code point) and rejects 61 as LABEL_TOO_LONG", () => {
    const sixty = "\u{1F389}".repeat(EVENT_LABEL_MAX);
    expect(load(`start,end,label\n2026-07-01,2026-07-02,${sixty}\n`).issues).toEqual([]);
    const { set, issues } = load(`start,end,label\n2026-07-01,2026-07-02,${"x".repeat(EVENT_LABEL_MAX + 1)}\n`);
    expect(set).toBeNull();
    expect(issues).toEqual([{ line: 2, field: "label", reason_code: "LABEL_TOO_LONG", message: fill(labels.events.errors.LABEL_TOO_LONG, { line: 2 }) }]);
  });

  it("reports EMPTY for an empty file and a header-only file", () => {
    for (const text of ["", "start,end,label\r\n"]) {
      const { set, issues } = load(text);
      expect(set).toBeNull();
      expect(issues).toEqual([{ line: null, field: "$record", reason_code: "EMPTY", message: labels.events.errors.EMPTY }]);
    }
  });

  it("surfaces CSV structure errors from the parser with their line", () => {
    const { set, issues } = load("start,end,label\n2026-07-01,2026-07-02\n");
    expect(set).toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ reason_code: "COLUMN_COUNT_MISMATCH", line: 2 });
    expect(parseEvents({ name: "e.csv", bytes: new Uint8Array([0xff, 0xfe]) }).issues[0]).toMatchObject({ reason_code: "INVALID_UTF8", line: null });
  });

  it("returns every issue across rows and no partial set", () => {
    const { set, issues } = load("start,end,label\nbad,2026-07-02,A\n2026-07-05,2026-07-04,B\n2026-07-06,2026-07-07,\n");
    expect(set).toBeNull();
    expect(issues.map(({ reason_code, line }) => `${reason_code}@${line}`)).toEqual(["INVALID_DATE@2", "PERIOD_ORDER@3", "EMPTY_LABEL@4"]);
  });
});

describe("R4 events overlap and suffix", () => {
  const set = load(THREE).set as EventSet;

  it("finds events intersecting a period in sorted order", () => {
    expect(overlapping(set, { start: "2026-07-01", end: "2026-07-31" }).map(row => row.label)).toEqual([MID, SUMMER]);
    expect(overlapping(set, { start: "2026-07-10", end: "2026-07-14" })).toEqual([]);
    expect(overlapping(null, { start: "2026-07-01", end: "2026-07-31" })).toEqual([]);
  });

  it("counts touching boundaries as overlap on both sides", () => {
    // 檔期迄日＝期間起日
    expect(overlapping(set, { start: "2026-07-20", end: "2026-07-26" }).map(row => row.label)).toEqual([SUMMER]);
    // 檔期起日＝期間迄日
    expect(overlapping(set, { start: "2026-07-10", end: "2026-07-15" }).map(row => row.label)).toEqual([SUMMER]);
    // 差一天就不算
    expect(overlapping(set, { start: "2026-07-21", end: "2026-07-26" })).toEqual([]);
  });

  it("builds the title suffix from labels.events.during and never touches numbers", () => {
    expect(eventSuffix(set, { start: "2026-07-16", end: "2026-07-18" })).toBe(fill(labels.events.during, { label: SUMMER }));
    expect(eventSuffix(set, { start: "2026-07-01", end: "2026-07-31" })).toBe(fill(labels.events.during, { label: `${MID}、${SUMMER}` }));
    expect(eventSuffix(set, { start: "2026-10-01", end: "2026-10-31" })).toBe("");
    expect(eventSuffix(undefined, { start: "2026-07-01", end: "2026-07-31" })).toBe("");
    const duplicate = load("start,end,label\n2026-07-01,2026-07-02,Same\n2026-07-03,2026-07-04,Same\n").set;
    expect(eventSuffix(duplicate, { start: "2026-07-01", end: "2026-07-04" })).toBe(fill(labels.events.during, { label: "Same" }));
  });
});

describe("R4 event bands on the weekly axis", () => {
  const set = load(THREE).set as EventSet;

  it("positions in-week and week-spanning events fractionally and skips events outside the axis", () => {
    const bands = eventBands(set, WEEKS);
    expect(bands.map(band => band.event.label)).toEqual([MID, SUMMER]);
    // 07-08 是第 0 週第 3 天（索引 2）：from = 2/7；07-09 當天結束：to = 4/7。
    expect(bands[0].from).toBeCloseTo(2 / 7, 12);
    expect(bands[0].to).toBeCloseTo(4 / 7, 12);
    // 07-15 是第 1 週索引 2：from = 1 + 2/7；07-20 是第 2 週索引 0，當天結束：to = 2 + 1/7。
    expect(bands[1].from).toBeCloseTo(1 + 2 / 7, 12);
    expect(bands[1].to).toBeCloseTo(2 + 1 / 7, 12);
  });

  it("clamps events that start before or end after the axis", () => {
    const wide = load("start,end,label\n2026-06-01,2026-07-07,Early\n2026-07-30,2026-08-30,Late\n2026-06-01,2026-09-30,All\n").set as EventSet;
    const bands = eventBands(wide, WEEKS);
    expect(bands.map(({ event, from, to }) => [event.label, from, to])).toEqual([
      ["Early", 0, 2 / 7],
      ["All", 0, 4],
      ["Late", expect.closeTo(3 + 3 / 7, 12), 4],
    ]);
  });

  it("handles partial weeks with fewer than seven days", () => {
    const partial = [{ start: "2026-07-01", end: "2026-07-05" }, { start: "2026-07-06", end: "2026-07-12" }];
    const one = load("start,end,label\n2026-07-05,2026-07-06,Edge\n").set as EventSet;
    const [band] = eventBands(one, partial);
    expect(band.from).toBeCloseTo(4 / 5, 12);
    expect(band.to).toBeCloseTo(1 + 1 / 7, 12);
  });

  it("returns nothing without events or weeks", () => {
    expect(eventBands(null, WEEKS)).toEqual([]);
    expect(eventBands(set, [])).toEqual([]);
  });
});

describe("R4 events template and export", () => {
  it("provides a header-only template that parses as EMPTY", () => {
    expect(eventsCsvTemplate()).toBe("﻿start,end,label\r\n");
    expect(load(eventsCsvTemplate()).issues.map(item => item.reason_code)).toEqual(["EMPTY"]);
  });

  it("exports rows that re-import to the same set (line numbers follow the sorted order)", () => {
    const set = load(THREE).set as EventSet;
    const csv = exportEventsCsv(set);
    expect(csv.startsWith("﻿\"start\",\"end\",\"label\"\r\n")).toBe(true);
    const again = load(csv).set as EventSet;
    expect(again.rows.map(({ start, end, label }) => ({ start, end, label }))).toEqual(set.rows.map(({ start, end, label }) => ({ start, end, label })));
  });

  it("neutralizes formula-like labels on export", () => {
    const set: EventSet = { filename: null, rows: [{ start: "2026-07-01", end: "2026-07-02", label: "=HYPERLINK(1)", line: 2 }] };
    expect(exportEventsCsv(set)).toContain("\"'=HYPERLINK(1)\"");
  });
});

describe("R4 review follow-ups: event row cap", () => {
  it("rejects more than MAX_EVENT_ROWS events and re-validates rows for restore", async () => {
    const { MAX_EVENT_ROWS, parseEvents, eventRowIssues } = await import("@/application/events");
    const lines = Array.from({ length: MAX_EVENT_ROWS + 1 }, (_, index) => `2026-01-01,2026-01-02,E${index}`);
    const result = parseEvents({ name: "big.csv", bytes: new TextEncoder().encode(["start,end,label", ...lines].join("\n")) });
    expect(result.set).toBeNull();
    expect(result.issues.map(issue => issue.reason_code)).toContain("TOO_MANY_ROWS");
    expect(eventRowIssues([{ start: "2026-08-10", end: "2026-08-01", label: "x", line: 2 }]).map(issue => issue.reason_code)).toEqual(["PERIOD_ORDER"]);
  });
});
