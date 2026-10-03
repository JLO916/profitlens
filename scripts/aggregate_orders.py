#!/usr/bin/env python3
"""ProfitLens 訂單明細彙總工具（R3 / 決策 D5：CLI，不在 UI 內彙總）。

把「一列一個訂單商品行」的平台匯出檔，依 rules.json 彙總成 ProfitLens 的三份標準 CSV：
  sales_daily.csv          date × channel × sku
  channel_costs_daily.csv  date × channel，費用全部填 0（佔位，使用者須自行填入實際費用）
  ad_spend_daily.csv       date × channel，廣告費全部填 0（佔位，使用者須自行填入）
並寫出 aggregation_log.md（套用的規則、讀取／保留／丟棄列數與原因、彙總前後合計對帳、含稅換算摘要）。

用法：
  python3 scripts/aggregate_orders.py --orders <訂單明細.csv> --rules <rules.json> --out <輸出資料夾>

只用 Python 3 標準函式庫。所有金額以 decimal.Decimal 計算，ROUND_HALF_UP 到 2 位小數，不使用 float。
規則細節見 docs/ORDER_AGGREGATION.md。

結束碼：0 成功；1 訂單資料有問題（訊息列出原始行號）；2 參數或 rules.json 有問題。
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from pathlib import Path

CENT = Decimal("0.01")
ZERO = Decimal("0")
DEFAULT_TAX_RATE = "0.05"
DEFAULT_CURRENCY = "TWD"
MAX_ERRORS_SHOWN = 30

COLUMN_KEYS = (
    "order_id", "date", "channel", "sku", "category", "units", "line_amount", "unit_price",
    "order_discount", "line_discount", "refund_amount", "refund_date", "unit_cost", "line_cogs", "status",
)
REQUIRED_COLUMN_KEYS = ("order_id", "date", "sku", "units")
# 這些鍵可以給陣列：把列出的欄位相加（空白＝0），折扣一律取絕對值（91APP 以負數表示折扣、蝦皮以正數）。
LIST_COLUMN_KEYS = ("order_discount", "line_discount")


def column_names(value: "str | list[str]") -> list[str]:
    return value if isinstance(value, list) else [value]
TOP_LEVEL_KEYS = (
    "columns", "channel", "channel_map", "category", "inclusive_tax", "tax_rate",
    "cogs_inclusive_tax", "currency", "encoding", "exclude_status", "description",
)
SALES_HEADER = ["date", "channel", "sku", "category", "units_sold", "gross_sales", "discounts", "refunds", "cogs_net", "currency"]
COSTS_HEADER = ["date", "channel", "platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs", "currency"]
ADS_HEADER = ["date", "channel", "ad_spend", "currency"]
DATE_RE = re.compile(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$")
AMOUNT_RE = re.compile(r"^-?\d+(?:\.\d{1,2})?$")
COST_RE = re.compile(r"^-?\d+(?:\.\d+)?$")
INT_RE = re.compile(r"^\d+$")


class RulesError(Exception):
    """rules.json 或參數錯誤（結束碼 2）。"""


class DataError(Exception):
    """訂單資料錯誤（結束碼 1）。"""

    def __init__(self, problems: list[str]):
        super().__init__("\n".join(problems))
        self.problems = problems


def money(value: Decimal) -> str:
    return format(value.quantize(CENT, rounding=ROUND_HALF_UP), ".2f")


def round2(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------- rules


@dataclass
class Rules:
    columns: "dict[str, str | list[str]]"
    fixed_channel: str | None
    channel_map: dict[str, str]
    default_category: str | None
    inclusive_tax: bool
    tax_rate: Decimal
    cogs_inclusive_tax: bool
    currency: str
    encoding: str
    status_column: str | None
    exclude_values: list[str]
    raw: dict


def load_rules(path: Path) -> Rules:
    try:
        text = path.read_text(encoding="utf-8-sig")
    except OSError as error:
        raise RulesError(f"讀不到 rules 檔：{path}（{error.strerror}）") from error
    try:
        raw = json.loads(text)
    except json.JSONDecodeError as error:
        raise RulesError(f"rules 檔不是有效的 JSON：第 {error.lineno} 行第 {error.colno} 欄，{error.msg}") from error
    if not isinstance(raw, dict):
        raise RulesError("rules 檔最外層必須是 JSON 物件 {...}。")
    unknown_top = sorted(set(raw) - set(TOP_LEVEL_KEYS))
    if unknown_top:
        raise RulesError(f"rules 檔有不認得的鍵：{', '.join(unknown_top)}（可用：{', '.join(TOP_LEVEL_KEYS)}）")

    columns = raw.get("columns")
    if not isinstance(columns, dict):
        raise RulesError("rules 檔缺少 columns 物件（來源欄名對照）。")
    unknown_cols = sorted(set(columns) - set(COLUMN_KEYS))
    if unknown_cols:
        raise RulesError(f"columns 有不認得的鍵：{', '.join(unknown_cols)}（可用：{', '.join(COLUMN_KEYS)}）")
    for key, value in columns.items():
        if key in LIST_COLUMN_KEYS and isinstance(value, list):
            if not value or not all(isinstance(v, str) and v.strip() for v in value):
                raise RulesError(f"columns.{key} 若是陣列，必須是非空字串陣列（這些欄位會相加）。")
            continue
        if not isinstance(value, str) or not value.strip():
            raise RulesError(f"columns.{key} 必須是非空字串（訂單檔裡的欄名）。")
    for key in REQUIRED_COLUMN_KEYS:
        if key not in columns:
            raise RulesError(f"columns.{key} 是必填（訂單檔裡對應的欄名）。")
    if ("line_amount" in columns) == ("unit_price" in columns):
        raise RulesError("商品金額請二擇一：columns.line_amount（該列金額合計）或 columns.unit_price（單價，會乘以數量）。")
    if "order_discount" in columns and "line_discount" in columns:
        raise RulesError("折扣請二擇一：columns.order_discount（訂單層折扣，按商品金額比例分攤到各列）或 columns.line_discount（該列自己的折扣）。")

    fixed_channel = raw.get("channel")
    if fixed_channel is not None and (not isinstance(fixed_channel, str) or not fixed_channel.strip()):
        raise RulesError("channel 必須是非空字串（固定通路名稱）。")
    if ("channel" in columns) == (fixed_channel is not None):
        raise RulesError("通路請二擇一：columns.channel（從欄位讀）或 channel（整份檔案固定一個通路名稱）。")

    channel_map = raw.get("channel_map", {})
    if not isinstance(channel_map, dict) or not all(isinstance(k, str) and isinstance(v, str) and v.strip() for k, v in channel_map.items()):
        raise RulesError("channel_map 必須是 {\"來源通路值\": \"標準通路名稱\"} 的物件。")

    default_category = raw.get("category")
    if default_category is not None and (not isinstance(default_category, str) or not default_category.strip()):
        raise RulesError("category 必須是非空字串（沒有分類欄時，全部 SKU 使用的品類）。")
    if "category" not in columns and default_category is None:
        raise RulesError("品類請二擇一：columns.category（從欄位讀）或 category（固定品類名稱）。")
    if "category" in columns and default_category is not None:
        raise RulesError("columns.category 與 category 只能設定一個。")

    if "refund_amount" in columns and "refund_date" not in columns:
        raise RulesError("設定 columns.refund_amount 時必須同時設定 columns.refund_date（退款以退款日入帳）。")
    if "refund_date" in columns and "refund_amount" not in columns:
        raise RulesError("設定 columns.refund_date 時必須同時設定 columns.refund_amount。")
    if "unit_cost" in columns and "line_cogs" in columns:
        raise RulesError("成本請二擇一：columns.unit_cost（單位成本 × 數量）或 columns.line_cogs（該列成本合計）。")

    inclusive_tax = raw.get("inclusive_tax")
    if not isinstance(inclusive_tax, bool):
        raise RulesError("inclusive_tax 是必填，請填 true（金額含 5% 營業稅）或 false（已是未稅）。")
    cogs_inclusive_tax = raw.get("cogs_inclusive_tax", False)
    if not isinstance(cogs_inclusive_tax, bool):
        raise RulesError("cogs_inclusive_tax 必須是 true 或 false。")
    rate_raw = raw.get("tax_rate", DEFAULT_TAX_RATE)
    if not isinstance(rate_raw, str) or not re.fullmatch(r"\d+(?:\.\d{1,4})?", rate_raw.strip()):
        raise RulesError("tax_rate 必須是字串小數，例如 \"0.05\"（避免 JSON 浮點數誤差）。")
    tax_rate = Decimal(rate_raw.strip())
    if tax_rate < ZERO or tax_rate > Decimal("0.2"):
        raise RulesError("tax_rate 必須介於 0 到 0.2 之間。")

    currency = raw.get("currency", DEFAULT_CURRENCY)
    if not isinstance(currency, str) or not re.fullmatch(r"[A-Z]{3}", currency):
        raise RulesError("currency 必須是三碼大寫幣別，例如 \"TWD\"。")
    encoding = raw.get("encoding", "utf-8-sig")
    if not isinstance(encoding, str):
        raise RulesError("encoding 必須是字串，例如 \"utf-8-sig\" 或 \"cp950\"。")
    try:
        "".encode(encoding)
    except LookupError as error:
        raise RulesError(f"不認得的編碼：{encoding}") from error

    exclude_values: list[str] = []
    status_column = columns.get("status")
    exclude_status = raw.get("exclude_status")
    if exclude_status is not None:
        if status_column is None:
            raise RulesError("設定 exclude_status 時必須同時設定 columns.status（訂單狀態欄名）。")
        if not isinstance(exclude_status, list) or not all(isinstance(v, str) for v in exclude_status):
            raise RulesError("exclude_status 必須是字串陣列，例如 [\"已取消\"]。")
        exclude_values = [v.strip() for v in exclude_status]

    return Rules(
        columns={k: ([name.strip() for name in v] if isinstance(v, list) else v.strip()) for k, v in columns.items()}, fixed_channel=fixed_channel.strip() if fixed_channel else None,
        channel_map={k.strip(): v.strip() for k, v in channel_map.items()}, default_category=default_category.strip() if default_category else None,
        inclusive_tax=inclusive_tax, tax_rate=tax_rate, cogs_inclusive_tax=cogs_inclusive_tax, currency=currency,
        encoding=encoding, status_column=status_column, exclude_values=exclude_values, raw=raw,
    )


# ---------------------------------------------------------------- parsing


def parse_date(value: str) -> str | None:
    match = DATE_RE.match(value.strip())
    if not match:
        return None
    try:
        return date(int(match.group(1)), int(match.group(2)), int(match.group(3))).isoformat()
    except ValueError:
        return None


def clean_number(value: str) -> str:
    """去掉前後空白、NT$／$ 前綴與千分位逗號；其他字元一律保留讓檢查報錯。"""
    text = value.strip()
    for prefix in ("NT$", "$"):
        if text.startswith(prefix):
            text = text[len(prefix):].strip()
    return text.replace(",", "")


def parse_amount(value: str, pattern: re.Pattern[str] = AMOUNT_RE) -> Decimal | None:
    text = clean_number(value)
    if not pattern.fullmatch(text):
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


@dataclass
class Line:
    line_no: int
    order_id: str
    date: str
    channel: str
    sku: str
    category: str
    units: int
    gross_incl: Decimal          # 來源原值（可能含稅）
    order_discount_raw: str      # 訂單層折扣原字串（尚未分攤）
    refund_incl: Decimal
    refund_date: str | None
    cogs: Decimal | None         # None = 未知成本（不是 0）
    discount_incl: Decimal = ZERO  # 分攤後（仍為來源口徑）
    gross: Decimal = ZERO          # 換算後（未稅）
    discount: Decimal = ZERO
    refund: Decimal = ZERO
    cogs_out: Decimal | None = None


@dataclass
class ReadResult:
    rows_read: int = 0
    lines: list[Line] = field(default_factory=list)
    dropped: "OrderedDict[str, list[int]]" = field(default_factory=OrderedDict)
    unmapped_channels: dict[str, int] = field(default_factory=dict)
    normalized_numbers: int = 0
    headers: list[str] = field(default_factory=list)


def read_orders(path: Path, rules: Rules) -> ReadResult:
    try:
        handle = path.open(encoding=rules.encoding, newline="")
    except OSError as error:
        raise RulesError(f"讀不到訂單檔：{path}（{error.strerror}）") from error
    result = ReadResult()
    problems: list[str] = []
    with handle:
        try:
            reader = csv.reader(handle)
            header = next(reader, None)
            if header is None:
                raise DataError([f"{path.name}：檔案是空的，沒有標題列。"])
            header = [h.strip() for h in header]
            result.headers = header
            duplicated = sorted({h for h in header if header.count(h) > 1 and h})
            if duplicated:
                raise DataError([f"{path.name}：標題列有重複欄名：{', '.join(duplicated)}"])
            missing = [f"columns.{k} → 「{name}」" for k, v in rules.columns.items() for name in column_names(v) if name not in header]
            if missing:
                raise RulesError(f"訂單檔標題列找不到 rules 指定的欄位：{'；'.join(missing)}。檔案裡的欄名：{', '.join(header)}")
            index = {key: header.index(name) for key, name in rules.columns.items() if isinstance(name, str)}
            list_index = {key: [header.index(name) for name in names] for key, names in rules.columns.items() if isinstance(names, list)}

            previous_end = reader.line_num
            for cells in reader:
                # 原始行號＝這筆紀錄在檔案中的起始實體行（欄位內含換行時仍正確）。
                line_no = previous_end + 1
                previous_end = reader.line_num
                result.rows_read += 1
                if not any(cell.strip() for cell in cells):
                    result.dropped.setdefault("空白列", []).append(line_no)
                    continue
                if len(cells) != len(header):
                    problems.append(f"第 {line_no} 行：欄位數 {len(cells)} 與標題列 {len(header)} 不同（可能有未加引號的逗號）。")
                    continue

                def get(key: str) -> str:
                    return cells[index[key]].strip() if key in index else ""

                def values_of(key: str) -> list[str]:
                    if key in list_index:
                        return [cells[position].strip() for position in list_index[key]]
                    return [get(key)] if key in index else []

                def discount_total(key: str, label: str, row_problems: list[str]) -> "Decimal | None":
                    """折扣欄（單欄或陣列）相加後取絕對值；空白＝0；非數字記錯誤。"""
                    total = ZERO
                    for raw_value in values_of(key):
                        if not raw_value:
                            continue
                        parsed = parse_amount(raw_value, COST_RE)
                        if parsed is None:
                            row_problems.append(f"{label}「{raw_value}」必須是數字、最多兩位小數")
                            return None
                        total += abs(parsed)
                    return round2(total)

                if rules.status_column and get("status") in rules.exclude_values:
                    result.dropped.setdefault(f"訂單狀態＝{get('status')}（exclude_status）", []).append(line_no)
                    continue

                row_problems: list[str] = []
                order_id = get("order_id")
                if not order_id:
                    row_problems.append("訂單編號空白")
                day = parse_date(get("date"))
                if day is None:
                    row_problems.append(f"日期「{get('date')}」無法辨識（需 YYYY-MM-DD 或 YYYY/MM/DD）")
                if rules.fixed_channel:
                    channel = rules.fixed_channel
                else:
                    source_channel = get("channel")
                    if not source_channel:
                        row_problems.append("通路空白")
                    if source_channel in rules.channel_map:
                        channel = rules.channel_map[source_channel]
                    else:
                        channel = source_channel
                        if rules.channel_map and source_channel:
                            result.unmapped_channels[source_channel] = result.unmapped_channels.get(source_channel, 0) + 1
                sku = get("sku")
                if not sku:
                    row_problems.append("SKU 空白")
                category = get("category") if "category" in index else (rules.default_category or "")
                if not category:
                    row_problems.append("品類空白")
                units_text = clean_number(get("units"))
                units = int(units_text) if INT_RE.fullmatch(units_text) else None
                if units is None:
                    row_problems.append(f"數量「{get('units')}」必須是非負整數")
                gross: Decimal | None
                if "line_amount" in index:
                    gross = parse_amount(get("line_amount"))
                    if gross is None or gross < ZERO:
                        row_problems.append(f"商品金額「{get('line_amount')}」必須是非負數字、最多兩位小數")
                else:
                    # 單價 × 數量（蝦皮「商品活動價格」、momo「單筆售價」這類只有單價的匯出）。
                    unit_price = parse_amount(get("unit_price"))
                    if unit_price is None or unit_price < ZERO:
                        row_problems.append(f"單價「{get('unit_price')}」必須是非負數字、最多兩位小數")
                        gross = None
                    else:
                        gross = None if units is None else round2(unit_price * units)
                discount_raw = ""
                if "order_discount" in index or "order_discount" in list_index:
                    order_total = discount_total("order_discount", "訂單折扣", row_problems)
                    if order_total is not None and order_total != ZERO:
                        discount_raw = format(order_total, "f")
                line_discount_value = ZERO
                if "line_discount" in index or "line_discount" in list_index:
                    line_total = discount_total("line_discount", "該列折扣", row_problems)
                    if line_total is not None:
                        line_discount_value = line_total
                refund = ZERO
                refund_day: str | None = None
                refund_raw = get("refund_amount")
                if refund_raw:
                    parsed = parse_amount(refund_raw)
                    if parsed is None or parsed < ZERO:
                        row_problems.append(f"退款金額「{refund_raw}」必須是非負數字、最多兩位小數")
                    else:
                        refund = parsed
                        if parsed > ZERO:
                            refund_day = parse_date(get("refund_date"))
                            if refund_day is None:
                                row_problems.append(f"有退款金額但退款日期「{get('refund_date')}」空白或無法辨識（退款要以退款日入帳）")
                cogs: Decimal | None = None
                if "unit_cost" in index and get("unit_cost"):
                    unit_cost = parse_amount(get("unit_cost"), COST_RE)
                    if unit_cost is None:
                        row_problems.append(f"單位成本「{get('unit_cost')}」不是數字")
                    elif units is not None:
                        cogs = round2(unit_cost * units)
                elif "line_cogs" in index and get("line_cogs"):
                    cogs = parse_amount(get("line_cogs"))
                    if cogs is None:
                        row_problems.append(f"成本「{get('line_cogs')}」必須是數字、最多兩位小數")
                for key in ("units", "line_amount", "unit_price", "order_discount", "line_discount", "refund_amount", "unit_cost", "line_cogs"):
                    for raw_value in values_of(key):
                        if raw_value and clean_number(raw_value) != raw_value:
                            result.normalized_numbers += 1

                if row_problems:
                    problems.append(f"第 {line_no} 行：" + "；".join(row_problems))
                    continue
                assert day is not None and units is not None and gross is not None
                result.lines.append(Line(
                    line_no=line_no, order_id=order_id, date=day, channel=channel, sku=sku, category=category,
                    units=units, gross_incl=gross, order_discount_raw=discount_raw, refund_incl=refund,
                    refund_date=refund_day, cogs=cogs, discount_incl=line_discount_value,
                ))
        except UnicodeDecodeError as error:
            raise DataError([f"{path.name}：無法用 {rules.encoding} 讀取（位置 {error.start}）。若是 Excel 存的 Big5 檔，請在 rules.json 設定 \"encoding\": \"cp950\"。"]) from error
        except csv.Error as error:
            raise DataError([f"{path.name}：CSV 格式錯誤（{error}）"]) from error
    if problems:
        raise DataError(problems)
    if not result.lines:
        raise DataError([f"{path.name}：沒有任何可彙總的訂單列。"])
    return result


# ---------------------------------------------------------------- transform


def allocate_discounts(lines: list[Line]) -> list[str]:
    """訂單層折扣按商品金額比例分攤；ROUND_HALF_UP 2 位，四捨五入差額放在訂單最後一列（有金額者）。"""
    problems: list[str] = []
    orders: "OrderedDict[str, list[Line]]" = OrderedDict()
    for line in lines:
        orders.setdefault(line.order_id, []).append(line)
    for order_id, order_lines in orders.items():
        # 以數值比較：「10」與「10.00」是同一個折扣。
        values = {str(Decimal(line.order_discount_raw).quantize(CENT)) for line in order_lines if line.order_discount_raw}
        if not values:
            continue
        if len(values) > 1:
            numbers = ", ".join(str(line.line_no) for line in order_lines)
            problems.append(f"訂單 {order_id}（第 {numbers} 行）：同一訂單出現不同的訂單折扣值 {sorted(values)}；訂單層折扣請每列重複同一值，或只填在其中一列。")
            continue
        total_discount = Decimal(values.pop())
        if total_discount == ZERO:
            continue
        base = [line for line in order_lines if line.gross_incl > ZERO]
        total_gross = sum((line.gross_incl for line in base), ZERO)
        if total_gross == ZERO:
            problems.append(f"訂單 {order_id}：有訂單折扣 {money(total_discount)} 但商品金額合計為 0，無法按比例分攤。")
            continue
        if total_discount > total_gross:
            problems.append(f"訂單 {order_id}：訂單折扣 {money(total_discount)} 大於商品金額合計 {money(total_gross)}。")
            continue
        allocated = ZERO
        for position, line in enumerate(base):
            if position == len(base) - 1:
                share = total_discount - allocated
            else:
                share = round2(total_discount * line.gross_incl / total_gross)
                allocated += share
            if share < ZERO or share > line.gross_incl:
                problems.append(f"訂單 {order_id} 第 {line.line_no} 行：分攤後折扣 {money(share)} 超出該列商品金額 {money(line.gross_incl)}，請改成逐列折扣。")
            line.discount_incl = share
    return problems


def convert(value: Decimal, rules: Rules, applies: bool) -> Decimal:
    if not applies or rules.tax_rate == ZERO:
        return round2(value)
    return round2(value / (Decimal(1) + rules.tax_rate))


def apply_tax(lines: list[Line], rules: Rules) -> None:
    for line in lines:
        line.gross = convert(line.gross_incl, rules, rules.inclusive_tax)
        line.discount = convert(line.discount_incl, rules, rules.inclusive_tax)
        line.refund = convert(line.refund_incl, rules, rules.inclusive_tax)
        line.cogs_out = None if line.cogs is None else convert(line.cogs, rules, rules.inclusive_tax and rules.cogs_inclusive_tax)


@dataclass
class SalesKey:
    units: int = 0
    gross: Decimal = ZERO
    discounts: Decimal = ZERO
    refunds: Decimal = ZERO
    cogs: Decimal = ZERO
    cogs_unknown_lines: list[int] = field(default_factory=list)
    category: str = ""


def aggregate(lines: list[Line], rules: Rules) -> tuple[dict[tuple[str, str, str], SalesKey], list[str]]:
    problems: list[str] = []
    categories: dict[str, tuple[str, int]] = {}
    for line in lines:
        seen = categories.get(line.sku)
        if seen is None:
            categories[line.sku] = (line.category, line.line_no)
        elif seen[0] != line.category:
            problems.append(f"SKU {line.sku}：第 {seen[1]} 行品類「{seen[0]}」與第 {line.line_no} 行「{line.category}」不同；同一 SKU 品類必須一致。")
    has_cost_rule = "unit_cost" in rules.columns or "line_cogs" in rules.columns
    out: dict[tuple[str, str, str], SalesKey] = {}

    def bucket(day: str, line: Line) -> SalesKey:
        key = (day, line.channel, line.sku)
        if key not in out:
            out[key] = SalesKey(category=categories[line.sku][0])
        return out[key]

    for line in lines:
        sale = bucket(line.date, line)
        sale.units += line.units
        sale.gross += line.gross
        sale.discounts += line.discount
        if has_cost_rule:
            if line.cogs_out is None:
                sale.cogs_unknown_lines.append(line.line_no)
            else:
                sale.cogs += line.cogs_out
        if line.refund > ZERO:
            assert line.refund_date is not None
            bucket(line.refund_date, line).refunds += line.refund
    for key, sale in out.items():
        if sale.discounts > sale.gross:
            problems.append(f"{key[0]} {key[1]} {key[2]}：彙總後折扣 {money(sale.discounts)} 大於原價收入 {money(sale.gross)}。")
    return out, problems


# ---------------------------------------------------------------- output


def write_csv(path: Path, header: list[str], rows: list[list[str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(header)
        writer.writerows(rows)


def md_cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def build_log(orders_path: Path, rules_path: Path, rules: Rules, read: ReadResult, lines: list[Line],
              sales: dict[tuple[str, str, str], SalesKey], day_channels: list[tuple[str, str]]) -> str:
    has_cost_rule = "unit_cost" in rules.columns or "line_cogs" in rules.columns
    kept = len(lines)
    dropped_total = sum(len(v) for v in read.dropped.values())
    out: list[str] = []
    out.append("# 訂單明細彙總紀錄（aggregation_log）\n")
    out.append(f"- 訂單檔：`{orders_path.name}`")
    out.append(f"- 規則檔：`{rules_path.name}`")
    out.append("- 工具：`scripts/aggregate_orders.py`（Python 標準函式庫，Decimal、ROUND_HALF_UP、2 位小數）")
    out.append("- 本紀錄與三份 CSV 一起保存，作為 ProfitLens 匯入前處理的來源說明。\n")

    out.append("## 套用的規則\n")
    out.append("| 項目 | 設定 |")
    out.append("|---|---|")
    for key in COLUMN_KEYS:
        if key in rules.columns:
            out.append(f"| columns.{key} | 「{md_cell('＋'.join(column_names(rules.columns[key])))}」 |")
    if rules.fixed_channel:
        out.append(f"| channel（固定通路） | {md_cell(rules.fixed_channel)} |")
    for source, target in rules.channel_map.items():
        out.append(f"| channel_map | 「{md_cell(source)}」→ {md_cell(target)} |")
    if rules.default_category:
        out.append(f"| category（固定品類） | {md_cell(rules.default_category)} |")
    out.append(f"| inclusive_tax | {'true（含稅，逐列換算成未稅）' if rules.inclusive_tax else 'false（已是未稅，不換算）'} |")
    out.append(f"| tax_rate | {rules.tax_rate} |")
    out.append(f"| cogs_inclusive_tax | {'true' if rules.cogs_inclusive_tax else 'false（成本視為未稅，不換算）'} |")
    out.append(f"| currency | {rules.currency} |")
    out.append(f"| encoding | {rules.encoding} |")
    if rules.exclude_values:
        out.append(f"| exclude_status | {md_cell('、'.join(rules.exclude_values))} |")
    out.append("| 訂單折扣分攤 | 按該訂單各列商品金額比例，ROUND_HALF_UP 2 位，差額放在訂單最後一列 |")
    out.append("| 退款入帳 | 以退款日期入帳到同通路、同 SKU；不影響件數，不沖回成本 |")
    out.append("| 換算順序 | 先在來源口徑分攤折扣，再逐列換算未稅並四捨五入，最後才加總 |\n")
    if rules.currency != "TWD":
        out.append(f"> 注意：currency 設為 {rules.currency}，但 ProfitLens v1 只接受 TWD，匯入時會被擋下。\n")

    out.append("## 讀取、保留與丟棄\n")
    out.append(f"- 讀取資料列：{read.rows_read}")
    out.append(f"- 保留：{kept}")
    out.append(f"- 丟棄：{dropped_total}")
    for reason, numbers in read.dropped.items():
        shown = ", ".join(str(n) for n in numbers[:MAX_ERRORS_SHOWN]) + (" …" if len(numbers) > MAX_ERRORS_SHOWN else "")
        out.append(f"  - {reason}：{len(numbers)} 列（第 {shown} 行）")
    if read.normalized_numbers:
        out.append(f"- 數字前處理：{read.normalized_numbers} 個值去掉了千分位逗號或 NT$／$ 前綴")
    if read.unmapped_channels:
        listing = "、".join(f"「{k}」{v} 列" for k, v in read.unmapped_channels.items())
        out.append(f"- 注意：以下通路值不在 channel_map 內，直接沿用原值：{listing}")
    out.append(f"- 訂單數：{len({line.order_id for line in lines})}；輸出銷售列（日 × 通路 × SKU）：{len(sales)}；日 × 通路：{len(day_channels)}\n")

    def total(attr: str) -> Decimal:
        return sum((getattr(line, attr) for line in lines), ZERO)

    out.append("## 合計對帳（彙總前逐列加總 vs 彙總後輸出）\n")
    out.append("| 欄位 | 彙總前（逐列，已換算） | 彙總後（sales_daily.csv） | 一致 |")
    out.append("|---|---:|---:|---|")
    units_before = sum(line.units for line in lines)
    units_after = sum(s.units for s in sales.values())
    out.append(f"| units_sold | {units_before} | {units_after} | {'是' if units_before == units_after else '否'} |")
    pairs = [
        ("gross_sales", total("gross"), sum((s.gross for s in sales.values()), ZERO)),
        ("discounts", total("discount"), sum((s.discounts for s in sales.values()), ZERO)),
        ("refunds", total("refund"), sum((s.refunds for s in sales.values()), ZERO)),
    ]
    for name, before, after in pairs:
        out.append(f"| {name} | {money(before)} | {money(after)} | {'是' if before == after else '否'} |")
    if has_cost_rule:
        before = sum((line.cogs_out for line in lines if line.cogs_out is not None), ZERO)
        after = sum((s.cogs for s in sales.values() if not s.cogs_unknown_lines), ZERO)
        unknown_lines = [n for s in sales.values() for n in s.cogs_unknown_lines]
        unknown_keys = [s for s in sales.values() if s.cogs_unknown_lines]
        excluded = sum((s.cogs for s in unknown_keys), ZERO)
        consistent = before == after + excluded
        out.append(f"| cogs_net（已知） | {money(before)} | {money(after)} | {'是' if consistent else '否'}（另有 {money(excluded)} 屬於成本留白的列） |")
        out.append("")
        if unknown_lines:
            out.append(f"- 成本未知：{len(unknown_lines)} 個訂單列沒有成本（第 {', '.join(str(n) for n in unknown_lines[:MAX_ERRORS_SHOWN])} 行），"
                       f"影響 {len(unknown_keys)} 個日 × 通路 × SKU，這些列的 cogs_net 留白（未知，不是 0）。")
    else:
        out.append("| cogs_net | — | 全部留白 | — |")
        out.append("")
        out.append("- 沒有設定成本欄（columns.unit_cost 或 columns.line_cogs），cogs_net 全部留白；匯入後毛利會顯示「資料待補」。")
    if "order_discount" not in rules.columns and "line_discount" not in rules.columns:
        out.append("- 沒有設定 columns.order_discount，discounts 全部填 0.00。")
    if "refund_amount" not in rules.columns:
        out.append("- 沒有設定 columns.refund_amount，refunds 全部填 0.00；退款若在其他報表，請另外整理。")
    refund_lines = [line for line in lines if line.refund > ZERO]
    shifted = [line for line in refund_lines if line.refund_date != line.date]
    out.append(f"- 退款：{len(refund_lines)} 列有退款，其中 {len(shifted)} 列的退款日與訂單日不同，已記在退款日。")
    discounted_orders = len({line.order_id for line in lines if line.discount_incl > ZERO})
    out.append(f"- 訂單折扣：{discounted_orders} 筆訂單的折扣已按商品金額比例分攤到各列。\n")

    out.append("## 含稅換算摘要\n")
    if not rules.inclusive_tax:
        out.append("- inclusive_tax = false：金額視為未稅，未做換算（只做 2 位小數 ROUND_HALF_UP）。\n")
    else:
        out.append(f"- 公式：未稅 = 含稅 ÷ (1 + {rules.tax_rate})，逐列 ROUND_HALF_UP 到 2 位小數後才加總。")
        fields = ["gross_sales", "discounts", "refunds"] + (["cogs_net"] if rules.cogs_inclusive_tax else [])
        out.append(f"- 換算欄位：{', '.join(fields)}" + ("" if rules.cogs_inclusive_tax else "（cogs_net 未換算：cogs_inclusive_tax = false）"))
        out.append("")
        out.append("| 欄位 | 換算列數 | 含稅原值合計 | 逐列換算後合計 | 合計後才換算（對照） | 差額 |")
        out.append("|---|---:|---:|---:|---:|---:|")
        divisor = Decimal(1) + rules.tax_rate
        conversions = [("gross_sales", "gross_incl", "gross"), ("discounts", "discount_incl", "discount"), ("refunds", "refund_incl", "refund")]
        for name, raw_attr, out_attr in conversions:
            count = sum(1 for line in lines if getattr(line, raw_attr) != ZERO)
            raw_total = total(raw_attr)
            converted = total(out_attr)
            whole = round2(raw_total / divisor)
            out.append(f"| {name} | {count} | {money(raw_total)} | {money(converted)} | {money(whole)} | {money(converted - whole)} |")
        if rules.cogs_inclusive_tax:
            known = [line for line in lines if line.cogs is not None]
            raw_total = sum((line.cogs for line in known if line.cogs is not None), ZERO)
            converted = sum((line.cogs_out for line in known if line.cogs_out is not None), ZERO)
            whole = round2(raw_total / divisor)
            out.append(f"| cogs_net | {len(known)} | {money(raw_total)} | {money(converted)} | {money(whole)} | {money(converted - whole)} |")
        out.append("")
        out.append("- 差額是「逐列四捨五入」與「合計後才四捨五入」的分位差，屬正常；ProfitLens 以逐列結果為準。\n")

    out.append("## 費用與廣告是佔位 0，請自行填入\n")
    out.append(f"- `channel_costs_daily.csv` 與 `ad_spend_daily.csv` 已列出銷售出現過的每個日 × 通路（{len(day_channels)} 列），**金額全部是 0**。")
    out.append("- 這些 0 只是佔位，不代表真的沒有平台抽成、金流費、物流費或廣告費。請依平台對帳單與廣告後台填入實際已入帳金額後再匯入；直接匯入會把費用當成 0，通路貢獻會被高估。")
    out.append("- 本工具不做廣告費歸屬或分攤；Meta、Google 等媒體平台的花費請依「銷售目的通路」整理後填入。")
    out.append("- 涵蓋期間內「沒有訂單的日期」不會出現在這兩份檔案，若該日仍有費用或廣告，請自行補列。\n")

    out.append("## 輸出檔案\n")
    out.append(f"- `sales_daily.csv`：{len(sales)} 列")
    out.append(f"- `channel_costs_daily.csv`：{len(day_channels)} 列（費用為 0 佔位）")
    out.append(f"- `ad_spend_daily.csv`：{len(day_channels)} 列（廣告費為 0 佔位）")
    out.append("- `aggregation_log.md`：本紀錄")
    return "\n".join(out) + "\n"


def run(orders_path: Path, rules_path: Path, out_dir: Path) -> str:
    rules = load_rules(rules_path)
    read = read_orders(orders_path, rules)
    lines = read.lines
    problems = allocate_discounts(lines)
    if problems:
        raise DataError(problems)
    apply_tax(lines, rules)
    sales, problems = aggregate(lines, rules)
    if problems:
        raise DataError(problems)
    has_cost_rule = "unit_cost" in rules.columns or "line_cogs" in rules.columns

    sales_rows: list[list[str]] = []
    for (day, channel, sku) in sorted(sales):
        sale = sales[(day, channel, sku)]
        cogs = money(sale.cogs) if has_cost_rule and not sale.cogs_unknown_lines else ""
        sales_rows.append([day, channel, sku, sale.category, str(sale.units), money(sale.gross), money(sale.discounts), money(sale.refunds), cogs, rules.currency])
    day_channels = sorted({(day, channel) for (day, channel, _sku) in sales})
    cost_rows = [[day, channel, "0.00", "0.00", "0.00", "0.00", rules.currency] for day, channel in day_channels]
    ad_rows = [[day, channel, "0.00", rules.currency] for day, channel in day_channels]

    try:
        out_dir.mkdir(parents=True, exist_ok=True)
    except OSError as error:
        raise RulesError(f"無法建立輸出資料夾：{out_dir}（{error.strerror}）") from error
    write_csv(out_dir / "sales_daily.csv", SALES_HEADER, sales_rows)
    write_csv(out_dir / "channel_costs_daily.csv", COSTS_HEADER, cost_rows)
    write_csv(out_dir / "ad_spend_daily.csv", ADS_HEADER, ad_rows)
    log = build_log(orders_path, rules_path, rules, read, lines, sales, day_channels)
    (out_dir / "aggregation_log.md").write_text(log, encoding="utf-8")
    dropped_total = sum(len(v) for v in read.dropped.values())
    return (f"完成：讀取 {read.rows_read} 列，保留 {len(lines)} 列，丟棄 {dropped_total} 列；"
            f"輸出 sales_daily.csv {len(sales_rows)} 列、channel_costs_daily.csv 與 ad_spend_daily.csv 各 {len(day_channels)} 列到 {out_dir}。\n"
            "提醒：通路費用與廣告費都是 0 佔位，請先填入實際金額再匯入 ProfitLens（詳見 aggregation_log.md）。")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="aggregate_orders.py",
        description="把訂單明細 CSV 依 rules.json 彙總成 ProfitLens 三份標準 CSV 與 aggregation_log.md。",
    )
    parser.add_argument("--orders", required=True, help="訂單明細 CSV（一列一個訂單商品行）")
    parser.add_argument("--rules", required=True, help="rules.json（欄位對照、通路、含稅等規則）")
    parser.add_argument("--out", required=True, help="輸出資料夾（不存在會自動建立）")
    args = parser.parse_args(argv)
    try:
        message = run(Path(args.orders), Path(args.rules), Path(args.out))
    except RulesError as error:
        print(f"錯誤（規則或參數）：{error}", file=sys.stderr)
        return 2
    except DataError as error:
        shown = error.problems[:MAX_ERRORS_SHOWN]
        print(f"錯誤（訂單資料）：共 {len(error.problems)} 個問題，本次未輸出任何檔案（--out 裡既有的舊輸出不會被刪除，請勿誤用）。", file=sys.stderr)
        for problem in shown:
            print(f"  - {problem}", file=sys.stderr)
        if len(error.problems) > len(shown):
            print(f"  …另有 {len(error.problems) - len(shown)} 個問題未列出。", file=sys.stderr)
        return 1
    print(message)
    return 0


if __name__ == "__main__":
    sys.exit(main())
