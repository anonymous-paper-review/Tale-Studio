#!/usr/bin/env python3
"""
DB schema cache generator for tale-studio.

Introspects the live Supabase PostgREST API (OpenAPI spec at /rest/v1/) and writes
one markdown file per table under .claude/cache/db/, plus an index README and a
migration-drift report (_migration-sync.md).

No Supabase MCP required — reads SUPABASE_URL + service role key from .env.local.
PostgREST exposes columns/types/PK/FK/defaults but NOT indexes, CHECK constraints,
or column comments, so we enrich from observed data (enum-like values, JSONB shape)
and diff the live schema against databases/migrations/*.sql.

Refresh:  python3 .claude/cache/db/_refresh.py
"""
import json
import os
import re
import sys
import urllib.request
import urllib.error
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]  # project root
OUT = Path(__file__).resolve().parent
ENV = ROOT / ".env.local"
MIGRATIONS = ROOT / "databases" / "migrations"
EXAMPLE_ROWS = 2
SAMPLE_ROWS = 300          # rows sampled to derive enum-like values / JSONB shape
ENUM_MAX_DISTINCT = 20     # text column with <= this many distinct sampled values -> list them
TEXT_FORMATS = {"text", "character varying", "varchar", "char", "name"}


def load_env():
    env = {}
    if ENV.exists():
        for line in ENV.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    url = env.get("SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = (env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_SERVICE_KEY")
           or env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY"))
    if not url or not key:
        sys.exit("Missing SUPABASE_URL / service key in .env.local")
    return url.rstrip("/"), key


def get(url, key, path, headers=None, want_resp=False):
    req = urllib.request.Request(
        f"{url}/rest/v1/{path}",
        headers={"apikey": key, "Authorization": f"Bearer {key}", **(headers or {})},
    )
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        body = resp.read().decode()
        return (body, resp) if want_resp else body
    except urllib.error.HTTPError as e:
        return (e.read().decode(), e) if want_resp else e.read().decode()


def parse_note(desc):
    """Extract PK / FK / human comment from PostgREST description annotations."""
    pk = "<pk/>" in (desc or "")
    fk = None
    m = re.search(r"<fk table='([^']+)' column='([^']+)'/>", desc or "")
    if m:
        fk = f"{m.group(1)}.{m.group(2)}"
    clean = re.sub(r"<[^>]+>", "", desc or "")
    clean = clean.replace("Note:", "").replace("This is a Primary Key.", "")
    clean = re.sub(r"This is a Foreign Key to `[^`]+`\.", "", clean)
    return pk, fk, " ".join(clean.split())


def md_escape(v):
    return str(v).replace("|", "\\|").replace("\n", " ")


def derive_observed(schema, sample):
    """Return {col: {'values': [...]} | {'jsonb_keys': [...]}} from sampled rows."""
    out = {}
    props = schema.get("properties", {})
    for col, spec in props.items():
        fmt = spec.get("format", "")
        vals = [r.get(col) for r in sample if isinstance(r, dict) and r.get(col) is not None]
        if not vals:
            continue
        if fmt in TEXT_FORMATS:
            strs = [v for v in vals if isinstance(v, str)]
            distinct = Counter(strs)
            # enum-like only when values are short codes — skip URLs / free text / uuids
            looks_enum = (
                0 < len(distinct) <= ENUM_MAX_DISTINCT
                and all(len(v) <= 24 and "://" not in v and "\n" not in v for v in distinct)
                and not all(re.fullmatch(r"[0-9a-f-]{32,}", v) for v in distinct)
            )
            if looks_enum:
                out[col] = {"values": sorted(distinct)}
        elif fmt == "jsonb" or fmt == "json":
            keys = Counter()
            arr = False
            for v in vals:
                if isinstance(v, dict):
                    keys.update(v.keys())
                elif isinstance(v, list):
                    arr = True
                    for item in v:
                        if isinstance(item, dict):
                            keys.update(f"[].{k}" for k in item.keys())
            if keys:
                out[col] = {"jsonb_keys": sorted(keys), "array": arr}
            elif arr:
                out[col] = {"jsonb_keys": [], "array": True}
    return out


def render_table(name, schema, rows, count, observed):
    req = set(schema.get("required", []))
    props = schema.get("properties", {})
    lines = [f"# `{name}`", ""]
    if count is not None:
        lines.append(f"> rows: **{count}**  ·  columns: **{len(props)}**")
        lines.append("")
    lines += ["## Schema", "",
              "| column | type | null | key | default | observed values / shape |",
              "|---|---|---|---|---|---|"]
    for col, spec in props.items():
        pk, fk, note = parse_note(spec.get("description", ""))
        typ = spec.get("format", spec.get("type", "?"))
        nullable = "" if col in req else "✓"
        keycol = "PK" if pk else (f"FK→{fk}" if fk else "")
        default = md_escape(spec.get("default", ""))[:40]
        obs = ""
        o = observed.get(col)
        if o and "values" in o:
            obs = "enum-like: " + ", ".join(f"`{v}`" for v in o["values"])
        elif o and "jsonb_keys" in o:
            prefix = "array of " if o.get("array") else ""
            obs = prefix + "keys: " + ", ".join(f"`{k}`" for k in o["jsonb_keys"]) if o["jsonb_keys"] else (prefix + "objects").strip()
        merged = note
        if obs:
            merged = (note + " · " if note else "") + obs
        lines.append(f"| `{col}` | {typ} | {nullable} | {keycol} | {md_escape(default)} | {md_escape(merged)[:90]} |")
    lines.append("")
    lines += ["## Example rows", ""]
    if rows:
        lines += ["```json", json.dumps(rows, ensure_ascii=False, indent=2, default=str), "```"]
    else:
        lines.append("_(no rows / empty table)_")
    lines.append("")
    return "\n".join(lines)


# ---- migration drift ----------------------------------------------------------

def migration_expectations():
    """Parse databases/migrations/*.sql for CREATE TABLE / ALTER ADD/DROP COLUMN.

    Returns (created_tables: set, col_adds: {table: set(cols)}, col_drops: {table: set(cols)}).
    """
    created, adds, drops = set(), {}, {}
    if not MIGRATIONS.exists():
        return created, adds, drops
    for f in sorted(MIGRATIONS.glob("*.sql")):
        sql = f.read_text()
        for m in re.finditer(r"CREATE TABLE(?: IF NOT EXISTS)?\s+(\w+)", sql, re.I):
            created.add(m.group(1))
        for m in re.finditer(r"ALTER TABLE\s+(\w+)([\s\S]*?);", sql, re.I):
            tbl, body = m.group(1), m.group(2)
            for a in re.finditer(r"ADD COLUMN(?: IF NOT EXISTS)?\s+(\w+)", body, re.I):
                adds.setdefault(tbl, set()).add(a.group(1))
            for d in re.finditer(r"DROP COLUMN(?: IF EXISTS)?\s+(\w+)", body, re.I):
                drops.setdefault(tbl, set()).add(d.group(1))
    return created, adds, drops


def render_sync(defs, url):
    created, adds, drops = migration_expectations()
    live_tables = {k for k, v in defs.items() if isinstance(v, dict) and "properties" in v}
    live_cols = {t: set(defs[t].get("properties", {})) for t in live_tables}

    lines = ["# Migration ↔ live DB drift report", "",
             f"Live source: `{url}/rest/v1/` · Migrations: `databases/migrations/*.sql`",
             "Regenerated by `_refresh.py`. **Diagnostic only — no DDL is applied.**", ""]

    missing_tables = sorted(t for t in created if t not in live_tables)
    lines += ["## Tables declared in migrations but ABSENT in live DB", ""]
    lines.append("\n".join(f"- `{t}`" for t in missing_tables) if missing_tables else "_none_")
    lines.append("")

    lines += ["## Live tables with NO migration `CREATE TABLE` (managed outside migrations)", ""]
    orphan = sorted(t for t in live_tables if t not in created)
    lines.append("\n".join(f"- `{t}`" for t in orphan) if orphan else "_none_")
    lines.append("")

    lines += ["## Columns migrations ADD but live DB is MISSING", "",
              "| table | missing column |", "|---|---|"]
    any_miss = False
    for tbl in sorted(adds):
        if tbl not in live_tables:
            continue  # table itself absent — covered above
        for col in sorted(adds[tbl]):
            if col not in live_cols.get(tbl, set()):
                lines.append(f"| `{tbl}` | `{col}` |")
                any_miss = True
    if not any_miss:
        lines.append("| _none_ |  |")
    lines.append("")

    lines += ["## Columns migrations DROP but still PRESENT in live", "",
              "| table | column still present |", "|---|---|"]
    any_drop = False
    for tbl in sorted(drops):
        for col in sorted(drops[tbl]):
            if col in live_cols.get(tbl, set()):
                lines.append(f"| `{tbl}` | `{col}` |")
                any_drop = True
    if not any_drop:
        lines.append("| _none_ |  |")
    lines.append("")
    return "\n".join(lines)


def main():
    url, key = load_env()
    print(f"Introspecting {url} ...")
    root = json.loads(get(url, key, ""))
    defs = root.get("definitions") or root.get("components", {}).get("schemas", {})
    tables = sorted(k for k in defs if isinstance(defs[k], dict) and "properties" in defs[k])

    OUT.mkdir(parents=True, exist_ok=True)
    index = ["# DB schema cache", "",
             f"Source: live Supabase PostgREST introspection (`{url}/rest/v1/`).",
             "Generated by `.claude/cache/db/_refresh.py` — **do not hand-edit**; re-run to refresh.",
             "",
             "Supabase MCP is **not** connected; this cache is the offline schema reference.",
             "Enum-like values & JSONB shapes are derived from a live row sample (best-effort,",
             f"≤{SAMPLE_ROWS} rows). Indexes / CHECK constraints are not exposed by PostgREST.",
             "See [`_migration-sync.md`](_migration-sync.md) for migration drift.",
             "",
             "| table | rows | cols | foreign keys |",
             "|---|---|---|---|"]

    for t in tables:
        schema = defs[t]
        _, resp = get(url, key, f"{t}?select=*", headers={"Prefer": "count=exact", "Range": "0-0"}, want_resp=True)
        count = None
        cr = resp.headers.get("Content-Range") if hasattr(resp, "headers") else None
        if cr and "/" in cr:
            tail = cr.split("/")[-1]
            count = int(tail) if tail.isdigit() else None
        rows = _json_list(get(url, key, f"{t}?select=*&limit={EXAMPLE_ROWS}"))
        sample = rows if count and count <= EXAMPLE_ROWS else _json_list(
            get(url, key, f"{t}?select=*&limit={SAMPLE_ROWS}"))
        observed = derive_observed(schema, sample)
        (OUT / f"{t}.md").write_text(render_table(t, schema, rows, count, observed))
        fks = []
        for col, spec in schema.get("properties", {}).items():
            _, fk, _ = parse_note(spec.get("description", ""))
            if fk:
                fks.append(f"`{col}`→{fk}")
        index.append(f"| [`{t}`]({t}.md) | {count if count is not None else '?'} | "
                     f"{len(schema.get('properties', {}))} | {', '.join(fks) or '—'} |")
        print(f"  ✓ {t}  ({count if count is not None else '?'} rows)")

    index.append("")
    (OUT / "README.md").write_text("\n".join(index))
    (OUT / "_migration-sync.md").write_text(render_sync(defs, url))
    print(f"Wrote {len(tables)} tables + README + _migration-sync.md to {OUT}")


def _json_list(body):
    try:
        v = json.loads(body)
        return v if isinstance(v, list) else []
    except json.JSONDecodeError:
        return []


if __name__ == "__main__":
    main()
