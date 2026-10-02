#!/usr/bin/env python3
"""Compare completed benchmark rounds under explicit latency and failure limits."""
import argparse
import json
import statistics
from collections import defaultdict
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", type=Path)
    parser.add_argument("--scenario", default="mixed", help="prefijo de los resúmenes")
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--p95-ms", type=float, default=100)
    parser.add_argument("--max-failure-rate", type=float, default=0.01)
    parser.add_argument("--min-completion-ratio", type=float, default=0.99)
    args = parser.parse_args()

    grouped = defaultdict(list)
    for path in args.run_dir.glob(f"{args.scenario}-*.json"):
        result = json.loads(path.read_text(encoding="utf-8"))
        grouped[(result["stack"], result["offered_rps"])].append(result)

    if not grouped:
        parser.error(f"no hay resúmenes {args.scenario}-*.json en el directorio")

    print(f"Criterio: p95 <= {args.p95_ms:g} ms, fallos <= {args.max_failure_rate:.1%}, "
          f"completadas/ofrecidas >= {args.min_completion_ratio:.1%}, "
          f"descartadas = 0; {args.repeats} rondas por punto")
    print(f"{'stack':<8} {'RPS ofrecidos':>13} {'rondas':>7} {'RPS mediana':>12} "
          f"{'p95 mediana':>11} {'fallos máx.':>11} {'estado':>10}")

    best = {}
    for (stack, rate), runs in sorted(grouped.items()):
        unique_rounds = {run["round"] for run in runs}
        complete = len(runs) == args.repeats and len(unique_rounds) == args.repeats
        valid = complete and all(
            run["latency_ms"]["p95"] is not None
            and run["latency_ms"]["p95"] <= args.p95_ms
            and run["failure_rate"] is not None
            and run["failure_rate"] <= args.max_failure_rate
            and run["dropped_iterations"] == 0
            and run["completed_rps"] / rate >= args.min_completion_ratio
            for run in runs
        )
        status = "APTO" if valid else ("INCOMPLETO" if not complete else "NO APTO")
        median_rps = statistics.median(r["completed_rps"] for r in runs)
        p95_values = [r["latency_ms"]["p95"] for r in runs if r["latency_ms"]["p95"] is not None]
        failure_values = [r["failure_rate"] for r in runs if r["failure_rate"] is not None]
        median_p95 = statistics.median(p95_values) if p95_values else None
        max_failure = max(failure_values) if failure_values else None
        p95_text = f"{median_p95:.2f}" if median_p95 is not None else "n/a"
        failure_text = f"{max_failure:.2%}" if max_failure is not None else "n/a"
        print(f"{stack:<8} {rate:>13g} {len(runs):>7} {median_rps:>12.1f} "
              f"{p95_text:>11} {failure_text:>11} {status:>10}")
        if valid:
            best[stack] = max(best.get(stack, 0), rate)

    print("\nMayor tasa ofrecida que cumple todos los criterios:")
    for stack in sorted({stack for stack, _ in grouped}):
        print(f"  {stack}: {best.get(stack, 'ninguna tasa aprobada')}")


if __name__ == "__main__":
    main()
