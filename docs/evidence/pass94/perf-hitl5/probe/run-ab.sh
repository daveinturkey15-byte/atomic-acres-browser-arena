#!/usr/bin/env bash
# A/B frame-cost runs, one headless browser at a time, interleaved so ComfyUI noise cancels.
set -u
cd C:/Users/david/projects/aa-claude-perf
OUT=docs/evidence/pass94/perf-hitl5/probe
A_URL=http://127.0.0.1:4300/
B_URL=https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/channels/pass93/
run() { # label url arena
  echo "=== $(date +%H:%M:%S) $1 $3  gpu: $(nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader)" | tee -a $OUT/log.txt
  node scripts/qa/hf399-fps-phase-probe-cdp.mjs --url "$2" --arena "$3" --label "$1" --profile none --seconds 10 --out-dir $OUT 2>&1 | grep -E "^\[hf399\]|Error|error" | tee -a $OUT/log.txt
}
run A1-hitl4 $A_URL nuketown2
run B1-pass93 $B_URL nuketown2
run A1-hitl4 $A_URL atomic-acres
run B1-pass93 $B_URL atomic-acres
run A2-hitl4 $A_URL nuketown2
run B2-pass93 $B_URL nuketown2
echo "=== done $(date +%H:%M:%S)" | tee -a $OUT/log.txt
