#!/bin/bash
# -----------------------------------------------------------------------------
# Wrapper: profile Llama-3.1-8B on an NVIDIA H100 for use as a new LLMServingSim
# HW target. Run this INSIDE the vLLM container (scripts/docker-vllm.sh) at the
# LLMServingSim repo root.
#
# Why a wrapper and not edit profile.sh directly? profile.sh hardcodes MODEL
# and HARDWARE at the top — easier to override here than to keep the diff.
#
# Time estimate (rough, with skew sweep):
#   Llama-3.1-8B × H100 × TP=1 only  : ~25-45 min
#   Llama-3.1-8B × H100 × TP=1,2,4   : ~1.5-2 h (TP=4 needs 4 H100s though)
#
# Time estimate (skip skew):
#   Llama-3.1-8B × H100 × TP=1, SKIP_SKEW=1  : ~10-20 min
#
# Requirements (on the GPU host):
#   - 1× NVIDIA H100 (SXM5 80GB ideal; 40GB / PCIe also fine for 8B model)
#   - HF_TOKEN env var (Llama is gated)
#   - LLMServingSim repo cloned with --recurse-submodules
#   - scripts/docker-vllm.sh already brought up vllm_docker container
# -----------------------------------------------------------------------------

set -euo pipefail

if [[ -z "${HF_TOKEN:-}" ]]; then
  echo "ERROR: HF_TOKEN env var not set (Llama-3.1-8B is gated)" >&2
  exit 1
fi

# Sanity check repo layout
if [[ ! -f profiler/profile.sh ]]; then
  echo "ERROR: profiler/profile.sh not found. Run this from LLMServingSim repo root." >&2
  exit 1
fi

# Use sed to override MODEL and HARDWARE inline (write a temp copy)
TMP_PROFILE=$(mktemp --suffix=.sh)
trap "rm -f $TMP_PROFILE" EXIT

sed \
  -e 's|^MODEL=.*|MODEL="meta-llama/Llama-3.1-8B"|' \
  -e 's|^HARDWARE=.*|HARDWARE="H100"|' \
  -e 's|^TP_DEGREES=.*|TP_DEGREES="1"|' \
  profiler/profile.sh > "$TMP_PROFILE"

chmod +x "$TMP_PROFILE"

echo "=== Profile config ==="
grep -E '^(MODEL|HARDWARE|TP_DEGREES|MEASUREMENT_ITERATIONS)=' "$TMP_PROFILE"
echo ""

# Run the profiler
echo "=== Starting profile (will take 25-45 min for Llama-3.1-8B / H100 / TP=1) ==="
echo "    To skip the skew sweep (cut ~15 min): SKIP_SKEW=1 $0"
echo ""

time bash "$TMP_PROFILE"

# Smoke test: verify all 5 CSVs exist
PERF_DIR="profiler/perf/H100/meta-llama/Llama-3.1-8B/bf16/tp1"
echo ""
echo "=== Smoke test: artifacts ==="
for f in attention.csv dense.csv per_sequence.csv skew_fit.csv; do
  if [[ -f "$PERF_DIR/$f" ]]; then
    rows=$(wc -l < "$PERF_DIR/$f")
    echo "  ✓ $f ($rows rows)"
  else
    echo "  ✗ $f MISSING (if SKIP_SKEW=1 was set, skew_fit.csv missing is OK)"
  fi
done

META="profiler/perf/H100/meta-llama/Llama-3.1-8B/bf16/meta.yaml"
if [[ -f "$META" ]]; then
  echo "  ✓ meta.yaml — $(grep -E '^(gpu_name|vllm_version|cuda_version):' $META)"
else
  echo "  ✗ meta.yaml MISSING"
fi

echo ""
echo "=== Done. Next steps ==="
echo "  1. Copy profile artifacts to your sim host if it's a different machine:"
echo "       tar czf perf-h100.tar.gz profiler/perf/H100/"
echo "       scp perf-h100.tar.gz <sim-host>:~/LLMServingSim/"
echo "       (on sim host) tar xzf perf-h100.tar.gz"
echo "  2. Drop in the cluster config for H100 (already prepared in inference-study repo):"
echo "       cp <inference-study>/data/llmservingsim-vs-vllm/cluster_llama8b_h100.json \\"
echo "          configs/cluster/"
echo "  3. Re-run baseline sim on the H100 profile:"
echo "       docker exec servingsim_docker bash -c \"cd /app/LLMServingSim && python -m serving \\"
echo "         --cluster-config configs/cluster/cluster_llama8b_h100.json \\"
echo "         --dtype bfloat16 --block-size 16 \\"
echo "         --dataset workloads/sharegpt-llama-3.1-8b-300-sps10.jsonl \\"
echo "         --output outputs/sim_llama8b_h100.csv --log-interval 1.0\""
