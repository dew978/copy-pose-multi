#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist/assets/wasm
VISION_BASE='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21'
curl --fail --location --retry 3 --max-time 120 "$VISION_BASE/vision_bundle.mjs" -o dist/assets/vision_bundle.mjs
for file in vision_wasm_internal.js vision_wasm_internal.wasm vision_wasm_nosimd_internal.js vision_wasm_nosimd_internal.wasm; do
  curl --fail --location --retry 3 --max-time 120 "$VISION_BASE/wasm/$file" -o "dist/assets/wasm/$file"
done
curl --fail --location --retry 3 --max-time 120 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task' -o dist/assets/pose_landmarker_full.task
