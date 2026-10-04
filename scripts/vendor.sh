#!/usr/bin/env bash
# Puts every toolchain into public/vendor (gitignored). Large files are gzipped, because static hosts cap files at
# 25 MB, and the workers inflate them. Delete public/vendor to refetch after upgrading a toolchain.
set -euo pipefail
cd "$(dirname "$0")/.."
V=public/vendor
mkdir -p $V/clang $V/pyodide $V/java $V/ruby $V/php $V/go

# C and C++: YoWASP clang, from node_modules
if [ ! -f $V/clang/llvm.core.wasm.gz ]; then
  cp -r node_modules/@yowasp/clang/gen/. $V/clang/
  gzip -9f $V/clang/llvm.core.wasm $V/clang/llvm-resources.tar
fi

# Python: Pyodide, from node_modules
for f in pyodide.mjs pyodide.asm.mjs pyodide.asm.wasm python_stdlib.zip pyodide-lock.json; do
  cp -u node_modules/pyodide/$f $V/pyodide/
done

# Java: JDK 8 javac, via JavaFiddle
[ -f $V/java/tools.jar ] || cp spike/tools.jar $V/java/ 2>/dev/null ||
  curl -fsSL -o $V/java/tools.jar https://raw.githubusercontent.com/leaningtech/javafiddle/main/static/tools.jar

# Ruby and PHP: WebAssembly Language Runtimes releases
WLR=https://github.com/vmware-labs/webassembly-language-runtimes/releases/download
fetch_gz() { # url destination
  [ -f "$2.gz" ] && return 0
  [ -f "$2" ] || curl -fsSL -o "$2" "$1"
  gzip -9f "$2"
}
fetch_gz "$WLR/ruby%2F3.2.2%2B20230714-11be424/ruby-3.2.2.wasm" $V/ruby/ruby.wasm
fetch_gz "$WLR/php%2F8.2.6%2B20230714-11be424/php-cgi-8.2.6.wasm" $V/php/php-cgi.wasm

# Go: the yaegi interpreter. Committed prebuilt because build machines (Vercel's, for one) have no Go.
# Rebuild it with `npm run build:go` after changing go/main.go, and commit prebuilt/yaegi.wasm.gz.
if [ ! -f $V/go/yaegi.wasm.gz ]; then
  if [ -f prebuilt/yaegi.wasm.gz ]; then
    cp prebuilt/yaegi.wasm.gz $V/go/
  elif command -v go >/dev/null; then
    (cd go && GOOS=wasip1 GOARCH=wasm go build -ldflags="-s -w" -o "../$V/go/yaegi.wasm" .)
    gzip -9f $V/go/yaegi.wasm
  else
    echo "vendor: no prebuilt Go runtime and no Go toolchain, skipping Go" >&2
  fi
fi
