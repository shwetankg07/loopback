#!/usr/bin/env bash
# Builds the Go runtime (the yaegi interpreter) to prebuilt/yaegi.wasm.gz, which IS committed: build machines
# like Vercel's have no Go toolchain, and scripts/vendor.sh copies this file into public/vendor.
# Run this after changing go/main.go, then commit prebuilt/yaegi.wasm.gz.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p prebuilt public/vendor/go
(cd go && GOOS=wasip1 GOARCH=wasm go build -ldflags="-s -w" -o ../prebuilt/yaegi.wasm .)
gzip -9f prebuilt/yaegi.wasm
cp prebuilt/yaegi.wasm.gz public/vendor/go/
ls -lh prebuilt/yaegi.wasm.gz
