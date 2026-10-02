#!/usr/bin/env python3
# =============================================================================
#  Agrega el NDJSON de k6 para una ronda de tasa de llegada fija.
#  Uso:
#    k6-aggregate.py <raw.ndjson> <stack> <out.json> <rate> <duration> <round>
# =============================================================================
import json
import math
import sys
from collections import defaultdict
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
    if len(sys.argv) != 7:
        print("uso: k6-aggregate.py <raw.ndjson> <stack> <out.json> <rate> <duration> <round>")
        sys.exit(2)

    raw_path, stack, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    offered_rps = float(sys.argv[4])
    duration = sys.argv[5]
    round_number = int(sys.argv[6])

    samples = []
    endpoint_samples = defaultdict(list)
    counts = defaultdict(float)
    endpoint_counts = defaultdict(lambda: defaultdict(float))
    metric_counts = {
        "http_reqs", "dropped_iterations", "successful_requests",
        "expected_client_errors", "contract_failures", "server_failures",
        "network_failures", "request_failure_rate", "checks",
    }

    with open(raw_path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            if obj.get("type") != "Point":
                continue
            metric = obj.get("metric")
            data = obj.get("data") or {}
            value = data.get("value")
            if value is None:
                continue
            endpoint = (data.get("tags") or {}).get("endpoint", "unlabelled")
            if metric == "http_req_duration":
                samples.append(value)
                endpoint_samples[endpoint].append(value)
            elif metric in metric_counts:
                if metric == "checks":
                    key = "checks_pass" if value else "checks_fail"
                    counts[key] += 1
                    endpoint_counts[endpoint][key] += 1
                elif metric == "request_failure_rate":
                    counts["request_failures"] += value
                    endpoint_counts[endpoint]["request_failures"] += value
                else:
                    counts[metric] += value
                    endpoint_counts[endpoint][metric] += value

    seconds = parse_duration(duration)
    if seconds <= 0:
        raise ValueError(f"duración inválida: {duration}")
    http_reqs = int(counts["http_reqs"])
    failures = int(counts["request_failures"])

    def endpoint_result(name):
        c = endpoint_counts[name]
        n = int(c["http_reqs"])
        return {
            "requests": n,
            "rps": round(n / seconds, 4),
            "failure_rate": round(c["request_failures"] / n, 6) if n else None,
            "latency_ms": stats(endpoint_samples[name]),
        }

    summary = {
        "stack": stack,
        "round": round_number,
        "duration": duration,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "offered_rps": offered_rps,
        "completed_rps": round(http_reqs / seconds, 4),
        "requests": http_reqs,
        "dropped_iterations": int(counts["dropped_iterations"]),
        "failures": failures,
        "failure_rate": round(failures / http_reqs, 6) if http_reqs else None,
        "successful_requests": int(counts["successful_requests"]),
        "expected_client_errors": int(counts["expected_client_errors"]),
        "contract_failures": int(counts["contract_failures"]),
        "server_failures": int(counts["server_failures"]),
        "network_failures": int(counts["network_failures"]),
        "checks": {"passes": int(counts["checks_pass"]), "fails": int(counts["checks_fail"])},
        "latency_ms": stats(samples),
        "endpoints": {name: endpoint_result(name) for name in sorted(endpoint_samples)},
    }

    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=2)
        fh.write("\n")


if __name__ == "__main__":
    main()
