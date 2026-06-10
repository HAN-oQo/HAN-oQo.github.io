#!/usr/bin/env python3
"""Replay an LLMServingSim-format JSONL workload against an OpenAI-compatible
vLLM endpoint and emit a CSV in the same schema as LLMServingSim's outputs/*.csv.

Usage:
  python replay_jsonl.py \
    --workload /path/to/sharegpt-llama-3.1-8b-300-sps10.jsonl \
    --endpoint http://localhost:8000/v1/completions \
    --model meta-llama/Llama-3.1-8B \
    --tokenizer meta-llama/Llama-3.1-8B \
    --output llama8b_real_300.csv

Output columns (matches LLMServingSim scheduler.save_output exactly):
  instance id, request id, model, input, output, arrival, end_time,
  latency, queuing_delay, TTFT, TPOT, ITL

All time fields are nanoseconds since the replay start (matches sim's ns units).

Requires: aiohttp, transformers
"""

import argparse
import asyncio
import csv
import json
import time
from pathlib import Path
from typing import List, Dict, Any

import aiohttp


async def fire_one_request(
    session: aiohttp.ClientSession,
    endpoint: str,
    model: str,
    prompt: str,
    max_tokens: int,
    request_id: int,
    arrival_offset_ns: int,
    base_t0_ns: int,
) -> Dict[str, Any]:
    """Dispatch one streaming completion. Returns metric dict."""
    # Wait until this request's scheduled arrival relative to base_t0_ns.
    target_send_ns = base_t0_ns + arrival_offset_ns
    now_ns = time.monotonic_ns()
    if target_send_ns > now_ns:
        await asyncio.sleep((target_send_ns - now_ns) / 1e9)

    arrival_ns = time.monotonic_ns() - base_t0_ns

    payload = {
        "model": model,
        "prompt": prompt,
        "max_tokens": max_tokens,
        "temperature": 0.0,        # deterministic — single token at each step
        "top_p": 1.0,
        "stream": True,
        "ignore_eos": True,        # force exactly max_tokens generation
    }

    ttft_ns = -1
    last_chunk_ns = -1
    itl_ns: List[int] = []        # inter-token latency list (ns)
    tokens_emitted = 0
    error_msg = None

    try:
        async with session.post(endpoint, json=payload, timeout=aiohttp.ClientTimeout(total=600)) as resp:
            if resp.status != 200:
                error_msg = f"HTTP {resp.status}: {await resp.text()}"
            else:
                async for raw_line in resp.content:
                    if not raw_line:
                        continue
                    line = raw_line.decode("utf-8", errors="ignore").strip()
                    if not line or not line.startswith("data:"):
                        continue
                    payload_str = line[len("data:"):].strip()
                    if payload_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(payload_str)
                    except json.JSONDecodeError:
                        continue
                    choices = chunk.get("choices") or []
                    if not choices:
                        continue
                    text = choices[0].get("text", "")
                    if not text:
                        continue
                    now = time.monotonic_ns()
                    if ttft_ns < 0:
                        ttft_ns = now - base_t0_ns - arrival_ns
                    else:
                        itl_ns.append(now - last_chunk_ns)
                    last_chunk_ns = now
                    tokens_emitted += 1
    except Exception as exc:
        error_msg = f"{type(exc).__name__}: {exc}"

    end_ns = time.monotonic_ns() - base_t0_ns
    latency_ns = end_ns - arrival_ns
    if tokens_emitted > 1 and ttft_ns >= 0:
        tpot_ns = (latency_ns - ttft_ns) // (tokens_emitted - 1)
    else:
        tpot_ns = 0

    return {
        "request_id": request_id,
        "arrival_ns": arrival_ns,
        "end_ns": end_ns,
        "latency_ns": latency_ns,
        "ttft_ns": ttft_ns,
        "tpot_ns": tpot_ns,
        "itl_ns": itl_ns,
        "tokens_emitted": tokens_emitted,
        "error": error_msg,
    }


async def replay(args) -> None:
    # Load workload
    requests: List[Dict[str, Any]] = []
    with open(args.workload, "r") as fp:
        for idx, line in enumerate(fp):
            if not line.strip():
                continue
            rec = json.loads(line)
            requests.append({
                "id": idx,
                "input_toks": rec["input_toks"],
                "output_toks": rec["output_toks"],
                "arrival_time_ns": rec["arrival_time_ns"],
                "input_tok_ids": rec.get("input_tok_ids"),
            })
            if args.limit and len(requests) >= args.limit:
                break

    print(f"[replay] loaded {len(requests)} requests from {args.workload}")

    # Detokenize input_tok_ids to prompt strings
    from transformers import AutoTokenizer
    tok = AutoTokenizer.from_pretrained(args.tokenizer, trust_remote_code=True)
    for req in requests:
        ids = req["input_tok_ids"]
        if ids is None:
            raise RuntimeError(f"request {req['id']} has no input_tok_ids — cannot replay exactly")
        req["prompt"] = tok.decode(ids, skip_special_tokens=False)

    print(f"[replay] detokenized {len(requests)} prompts (tokenizer={args.tokenizer})")
    print(f"[replay] firing against {args.endpoint} (model={args.model})")

    base_t0_ns = time.monotonic_ns()

    connector = aiohttp.TCPConnector(limit=args.max_inflight)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = [
            asyncio.create_task(
                fire_one_request(
                    session, args.endpoint, args.model,
                    req["prompt"], req["output_toks"],
                    req["id"], req["arrival_time_ns"], base_t0_ns,
                )
            )
            for req in requests
        ]
        done_results = []
        for i, fut in enumerate(asyncio.as_completed(tasks)):
            res = await fut
            done_results.append(res)
            if (i + 1) % 10 == 0:
                print(f"[replay] {i+1}/{len(tasks)} done")

    # Match results back to requests by id and write CSV in LLMServingSim schema
    res_by_id = {r["request_id"]: r for r in done_results}

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", newline="") as fp:
        writer = csv.writer(fp)
        writer.writerow([
            "instance id", "request id", "model",
            "input", "output",
            "arrival", "end_time", "latency",
            "queuing_delay", "TTFT", "TPOT", "ITL",
        ])
        for req in requests:
            r = res_by_id.get(req["id"])
            if r is None or r.get("error"):
                continue
            writer.writerow([
                0,                      # instance id (real vLLM = single instance)
                req["id"],
                args.model,
                req["input_toks"],
                req["output_toks"],     # gen tokens only (matches sim: output - input == gen)
                r["arrival_ns"],
                r["end_ns"],
                r["latency_ns"],
                0,                      # queuing_delay — real vLLM doesn't separately expose this
                r["ttft_ns"],
                r["tpot_ns"],
                r["itl_ns"],
            ])

    errs = [r for r in done_results if r.get("error")]
    print(f"[replay] wrote {len(done_results) - len(errs)} rows to {out_path}")
    if errs:
        print(f"[replay] {len(errs)} errors:")
        for r in errs[:5]:
            print(f"  req {r['request_id']}: {r['error']}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--workload", required=True, help="Path to LLMServingSim-format JSONL")
    p.add_argument("--endpoint", required=True, help="vLLM /v1/completions URL")
    p.add_argument("--model", required=True, help="Model name (matches --model on vLLM server)")
    p.add_argument("--tokenizer", required=True, help="HF tokenizer name (e.g. meta-llama/Llama-3.1-8B)")
    p.add_argument("--output", required=True, help="Output CSV path")
    p.add_argument("--max-inflight", type=int, default=512, help="Max concurrent TCP connections")
    p.add_argument("--limit", type=int, default=0, help="Only replay first N requests (0=all)")
    args = p.parse_args()
    asyncio.run(replay(args))


if __name__ == "__main__":
    main()
