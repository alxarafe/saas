#!/usr/bin/env python3
"""Genera un resumen comparativo de una ejecución completa del laboratorio."""
import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("lab_dir", type=Path)
    parser.add_argument("--k6-dirs", nargs="*", type=Path, default=[])
    args = parser.parse_args()
    args.lab_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    for directory in args.k6_dirs:
        if not directory.exists():
            continue
        scenario = "error" if "-error" in directory.name else "mixed"
        for path in sorted(directory.glob(f"{scenario}-*.json")):
            result = json.loads(path.read_text(encoding="utf-8"))
            result["scenario"] = scenario
            rows.append(result)

    lines = [
        f"# Informe de laboratorio — {args.lab_dir.name}",
        "",
        "Los logs de cada fase están junto a este informe. Las fortalezas y "
        "debilidades se expresan como métricas observadas bajo las mismas condiciones; "
        "`APTO` usa los umbrales del benchmark, no es un SLA de producción.",
        "",
        "## Fases ejecutadas",
        "",
        "- `contract.log`: suite contractual Bruno.",
        "- `latency.log`: latencia básica Bruno frente a HTTP directo.",
        "- `k6-*.log`: carga y comparación por escenario.",
        "",
    ]
    if rows:
        lines += [
            "## Resultados k6 por punto de carga",
            "",
            "| Escenario | Stack | RPS ofrecidos | RPS completados | p95 (ms) | Fallos | Descartadas |",
            "|---|---|---:|---:|---:|---:|---:|",
        ]
        for result in sorted(rows, key=lambda r: (r["stack"], r["offered_rps"], r["round"])):
            status = "APTO" if (
                result["latency_ms"]["p95"] is not None
                and result["latency_ms"]["p95"] <= 100
                and (result["failure_rate"] or 0) <= 0.01
                and result["dropped_iterations"] == 0
                and result["completed_rps"] / result["offered_rps"] >= 0.99
            ) else "NO APTO"
            lines.append(
                f"| {result.get('scenario', 'k6')} {status} | {result['stack']} "
                f"| {result['offered_rps']:g} | {result['completed_rps']:.1f} "
                f"| {result['latency_ms']['p95'] or 0:.2f} "
                f"| {(result['failure_rate'] or 0):.2%} | {result['dropped_iterations']} |"
            )
        lines += [
            "",
            "### Lectura rápida",
            "",
            "- Fortaleza de rendimiento: mayor RPS ofrecido que mantiene `APTO`, "
            "con menor p95 y sin errores/descartes.",
            "- Debilidad: primer punto que queda `NO APTO`, indicando latencia, "
            "errores o capacidad insuficiente bajo esa carga.",
            "",
        ]
    else:
        lines += ["No se encontraron resúmenes k6.", ""]

    (args.lab_dir / "report.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
