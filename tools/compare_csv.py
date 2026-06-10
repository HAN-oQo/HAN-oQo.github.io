#!/usr/bin/env python3
"""Compare LLMServingSim-predicted CSV vs real-vLLM-measured CSV (same schema).

Both CSVs must have the LLMServingSim scheduler.save_output() column layout:
  instance id, request id, model, input, output, arrival, end_time,
  latency, queuing_delay, TTFT, TPOT, ITL

Matches rows by `request id`. Computes per-request and aggregate error metrics
and emits a Markdown table. If --plot is given, also writes scatter plots of
sim vs real for TTFT / TPOT / latency.

Usage:
  python compare_csv.py \
    --sim outputs/llama8b_baseline_300.csv \
    --real outputs/llama8b_real_300.csv \
    --md outputs/comparison-report.md \
    [--plot outputs/comparison-plots/]
"""

import argparse
import ast
import csv
import statistics as stat
from pathlib import Path
from typing import Dict, List, Tuple


def load_csv(path: str) -> Dict[int, Dict[str, float]]:
    rows: Dict[int, Dict[str, float]] = {}
    with open(path, "r", newline="") as fp:
        reader = csv.DictReader(fp)
        for r in reader:
            rid = int(r["request id"])
            try:
                rows[rid] = {
                    "input": int(r["input"]),
                    "output": int(r["output"]),
                    "arrival_ns": int(r["arrival"]),
                    "end_ns": int(r["end_time"]),
                    "latency_ns": int(r["latency"]),
                    "ttft_ns": int(r["TTFT"]),
                    "tpot_ns": int(r["TPOT"]),
                    "itl_raw": r["ITL"],
                }
            except (ValueError, KeyError) as exc:
                print(f"[load] skip rid={rid}: {exc}")
    return rows


def rel_err_pct(sim: float, real: float) -> float:
    if real == 0:
        return float("nan")
    return 100.0 * (sim - real) / real


def pct_summary(values: List[float]) -> Dict[str, float]:
    cleaned = [v for v in values if v == v]  # drop NaN
    if not cleaned:
        return {"n": 0}
    cleaned.sort()
    n = len(cleaned)
    return {
        "n": n,
        "median": stat.median(cleaned),
        "p25": cleaned[n * 25 // 100],
        "p75": cleaned[n * 75 // 100],
        "p95": cleaned[min(n - 1, n * 95 // 100)],
        "mean": stat.mean(cleaned),
        "mean_abs": stat.mean(abs(v) for v in cleaned),
    }


def latency_percentiles(values_ns: List[int]) -> Dict[str, float]:
    if not values_ns:
        return {}
    s = sorted(values_ns)
    n = len(s)
    return {
        "p50_ms": s[n // 2] / 1e6,
        "p95_ms": s[min(n - 1, n * 95 // 100)] / 1e6,
        "p99_ms": s[min(n - 1, n * 99 // 100)] / 1e6,
        "mean_ms": stat.mean(s) / 1e6,
    }


def throughput(rows: Dict[int, Dict[str, float]]) -> Tuple[float, float]:
    """Return (requests_per_sec, generated_tokens_per_sec) over the run."""
    if not rows:
        return 0.0, 0.0
    ends = [r["end_ns"] for r in rows.values()]
    arrs = [r["arrival_ns"] for r in rows.values()]
    span_s = (max(ends) - min(arrs)) / 1e9
    if span_s <= 0:
        return 0.0, 0.0
    total_gen = sum(r["output"] for r in rows.values())
    return len(rows) / span_s, total_gen / span_s


def compare(sim_path: str, real_path: str) -> Dict:
    sim = load_csv(sim_path)
    real = load_csv(real_path)
    common = set(sim.keys()) & set(real.keys())
    only_sim = set(sim.keys()) - common
    only_real = set(real.keys()) - common

    ttft_err, tpot_err, lat_err = [], [], []
    divergence_table: List[Tuple[float, int, Dict]] = []

    for rid in sorted(common):
        s, r = sim[rid], real[rid]
        e_ttft = rel_err_pct(s["ttft_ns"], r["ttft_ns"])
        e_tpot = rel_err_pct(s["tpot_ns"], r["tpot_ns"])
        e_lat = rel_err_pct(s["latency_ns"], r["latency_ns"])
        ttft_err.append(e_ttft)
        tpot_err.append(e_tpot)
        lat_err.append(e_lat)
        divergence_table.append((abs(e_lat) if e_lat == e_lat else 0.0, rid, {
            "input": r["input"], "output": r["output"],
            "arrival_ms": r["arrival_ns"] / 1e6,
            "sim_latency_ms": s["latency_ns"] / 1e6,
            "real_latency_ms": r["latency_ns"] / 1e6,
            "err_pct": e_lat,
        }))

    divergence_table.sort(reverse=True)

    return {
        "n_sim": len(sim), "n_real": len(real), "n_common": len(common),
        "n_only_sim": len(only_sim), "n_only_real": len(only_real),
        "ttft_err_pct": pct_summary(ttft_err),
        "tpot_err_pct": pct_summary(tpot_err),
        "latency_err_pct": pct_summary(lat_err),
        "sim_throughput": throughput(sim),
        "real_throughput": throughput(real),
        "sim_latency_pct": latency_percentiles([r["latency_ns"] for r in sim.values()]),
        "real_latency_pct": latency_percentiles([r["latency_ns"] for r in real.values()]),
        "top_divergent": divergence_table[:10],
    }


def fmt_md(report: Dict) -> str:
    L = []
    L.append("# LLMServingSim vs vLLM — comparison\n")
    L.append(f"- Sim rows: **{report['n_sim']}**, Real rows: **{report['n_real']}**, "
             f"matched: **{report['n_common']}**\n")
    if report["n_only_sim"] or report["n_only_real"]:
        L.append(f"- Sim-only: {report['n_only_sim']}, Real-only: {report['n_only_real']}\n")

    L.append("\n## Aggregate throughput\n")
    L.append("| | req/s | gen tok/s |\n|---|---:|---:|\n")
    s_rps, s_tps = report["sim_throughput"]
    r_rps, r_tps = report["real_throughput"]
    L.append(f"| LLMServingSim | {s_rps:.2f} | {s_tps:.0f} |\n")
    L.append(f"| Real vLLM     | {r_rps:.2f} | {r_tps:.0f} |\n")
    if r_rps:
        L.append(f"| Δ% | {rel_err_pct(s_rps, r_rps):+.1f}% | {rel_err_pct(s_tps, r_tps):+.1f}% |\n")

    L.append("\n## Latency percentiles (ms)\n")
    L.append("| | p50 | p95 | p99 | mean |\n|---|---:|---:|---:|---:|\n")
    sp, rp = report["sim_latency_pct"], report["real_latency_pct"]
    if sp and rp:
        L.append(f"| Sim  | {sp['p50_ms']:.0f} | {sp['p95_ms']:.0f} | {sp['p99_ms']:.0f} | {sp['mean_ms']:.0f} |\n")
        L.append(f"| Real | {rp['p50_ms']:.0f} | {rp['p95_ms']:.0f} | {rp['p99_ms']:.0f} | {rp['mean_ms']:.0f} |\n")
        L.append(f"| Δ%   | {rel_err_pct(sp['p50_ms'], rp['p50_ms']):+.1f}% "
                 f"| {rel_err_pct(sp['p95_ms'], rp['p95_ms']):+.1f}% "
                 f"| {rel_err_pct(sp['p99_ms'], rp['p99_ms']):+.1f}% "
                 f"| {rel_err_pct(sp['mean_ms'], rp['mean_ms']):+.1f}% |\n")

    L.append("\n## Per-request relative error (sim vs real, %)\n")
    L.append("| metric | n | median | mean | mean(\\|err\\|) | p25 | p75 | p95 |\n")
    L.append("|---|---:|---:|---:|---:|---:|---:|---:|\n")
    for label, key in [("TTFT", "ttft_err_pct"), ("TPOT", "tpot_err_pct"), ("latency", "latency_err_pct")]:
        s = report[key]
        if s["n"] == 0:
            continue
        L.append(f"| {label} | {s['n']} | {s['median']:+.1f}% | {s['mean']:+.1f}% | "
                 f"{s['mean_abs']:.1f}% | {s['p25']:+.1f}% | {s['p75']:+.1f}% | {s['p95']:+.1f}% |\n")

    L.append("\n## Top 10 divergent requests (by |latency error %|)\n")
    L.append("| rid | input | output | arrival(ms) | sim latency(ms) | real latency(ms) | err% |\n")
    L.append("|---:|---:|---:|---:|---:|---:|---:|\n")
    for _, rid, d in report["top_divergent"]:
        L.append(f"| {rid} | {d['input']} | {d['output']} | {d['arrival_ms']:.0f} | "
                 f"{d['sim_latency_ms']:.0f} | {d['real_latency_ms']:.0f} | "
                 f"{d['err_pct']:+.1f}% |\n")

    return "".join(L)


def maybe_plot(sim_path: str, real_path: str, plot_dir: str) -> None:
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        print("[plot] matplotlib not installed — skipping plots")
        return
    sim = load_csv(sim_path)
    real = load_csv(real_path)
    common = sorted(set(sim.keys()) & set(real.keys()))
    Path(plot_dir).mkdir(parents=True, exist_ok=True)
    for metric, key in [("TTFT_ms", "ttft_ns"), ("TPOT_us", "tpot_ns"), ("latency_ms", "latency_ns")]:
        scale = 1e6 if "ms" in metric else 1e3
        xs = [real[r][key] / scale for r in common]
        ys = [sim[r][key] / scale for r in common]
        fig, ax = plt.subplots(figsize=(6, 6))
        ax.scatter(xs, ys, s=8, alpha=0.5)
        lo, hi = min(min(xs), min(ys)), max(max(xs), max(ys))
        ax.plot([lo, hi], [lo, hi], "k--", lw=1, label="y = x")
        ax.set_xlabel(f"Real vLLM ({metric})")
        ax.set_ylabel(f"LLMServingSim ({metric})")
        ax.set_title(f"{metric}: sim vs real")
        ax.legend()
        out = Path(plot_dir) / f"{metric}.png"
        fig.savefig(out, dpi=110, bbox_inches="tight")
        plt.close(fig)
        print(f"[plot] wrote {out}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--sim", required=True)
    p.add_argument("--real", required=True)
    p.add_argument("--md", required=True, help="Output Markdown path")
    p.add_argument("--plot", default="", help="Optional dir for matplotlib plots")
    args = p.parse_args()

    report = compare(args.sim, args.real)
    md = fmt_md(report)
    Path(args.md).parent.mkdir(parents=True, exist_ok=True)
    Path(args.md).write_text(md)
    print(f"[md] wrote {args.md}")
    print()
    print(md)
    if args.plot:
        maybe_plot(args.sim, args.real, args.plot)


if __name__ == "__main__":
    main()
