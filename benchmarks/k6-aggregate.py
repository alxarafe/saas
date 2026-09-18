#!/usr/bin/env python3
# =============================================================================
#  Agrega el JSON en formato NDJSON que k6 escribe con `--out json` y genera
#  un resumen por stack (percentiles exactos p50/p90/p95/p99 por categoría).
#  Uso:
#    k6-aggregate.py <raw.ndjson> <stack> <out.json> [vus] [duration]
# =============================================================================
import json
import math
import sys
from datetime import datetime, timezone


def pct(sorted_vals, p):
    if not sorted_vals:
        return None
    idx = math.ceil((p / 100) * len(sorted_vals)) - 1
    return sorted_vals[max(0, idx)]


def stats(vals):
    vals = sorted(vals)
    n = len(vals)
    return {
        "n": n,
        "avg": round(sum(vals) / n, 4) if n else None,
        "min": round(vals[0], 4) if n else None,
        "p50": round(pct(vals, 50), 4) if pct(vals, 50) is not None else None,
        "p90": round(pct(vals, 90), 4) if pct(vals, 90) is not None else None,
        "p95": round(pct(vals, 95), 4) if pct(vals, 95) is not None else None,
        "p99": round(pct(vals, 99), 4) if pct(vals, 99) is not None else None,
        "max": round(vals[-1], 4) if n else None,
    }


def parse_duration(s):
    """Convierte '30s', '1m' o '1m30s' a segundos."""
    total = 0.0
    num = ""
    for ch in s or "":
        if ch.isdigit() or ch == ".":
            num += ch
        else:
            mult = {"s": 1, "m": 60, "h": 3600}.get(ch, 0)
            if num:
                total += float(num) * mult
            num = ""
    return total or 0.0


def main():
    if len(sys.argv) < 4:
        print("uso: k6-aggregate.py <raw.ndjson> <stack> <out.json> [vus] [duration]")
        sys.exit(2)

    raw_path, stack, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    vus = sys.argv[4] if len(sys.argv) > 4 else "?"
    duration = sys.argv[5] if len(sys.argv) > 5 else "?"

    trend_names = {
        "http_req_duration",
        "read_latency",
        "write_latency",
        "auth_latency",
        "error_latency",
    }
    samples = {name: [] for name in trend_names}
    http_reqs = 0
    failed = 0
    checks_pass = 0
    checks_fail = 0

    with open(raw_path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            if obj.get("type") != "Point":
                continue
            metric = obj.get("metric")
            value = (obj.get("data") or {}).get("value")
            if metric in trend_names:
                samples[metric].append(value)
            elif metric == "http_reqs":
                http_reqs += value or 0
            elif metric == "http_req_failed":
                failed += value or 0
            elif metric == "checks":
                if value:
                    checks_pass += 1
                else:
                    checks_fail += 1

    seconds = parse_duration(duration)
    duration_seconds = seconds or 1.0
    error_rate = failed / http_reqs if http_reqs else None

    summary = {
        "stack": stack,
        "vus": vus,
        "duration": duration,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "http_reqs": http_reqs,
        "throughput_rps": round(http_reqs / duration_seconds, 4),
        "http_req_failed_rate": round(error_rate, 6) if error_rate is not None else None,
        "checks": {"passes": checks_pass, "fails": checks_fail},
        "http_req_duration": stats(samples["http_req_duration"]),
        "read_latency": stats(samples["read_latency"]),
        "write_latency": stats(samples["write_latency"]),
        "auth_latency": stats(samples["auth_latency"]),
        "error_latency": stats(samples["error_latency"]),
    }

    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=2)
        fh.write("\n")


if __name__ == "__main__":
    main()