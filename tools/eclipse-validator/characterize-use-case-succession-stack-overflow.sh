#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")" && pwd)
: "${ECLIPSE:?Set ECLIPSE to the Eclipse application directory}"
: "${SYSML_CORPUS:?Set SYSML_CORPUS to the pinned SysML-v2-Release checkout}"

PINNED_CORPUS=9baca5908ca28b53da085de69336fde48420ea8f
FIXTURE_SHA=5776df99885ad8ff4a52c74322a28b2f02c18a30c0dc6bd1919a5e76c957ff16
FIXTURE="$ROOT/fixtures/use-case-succession-stack-overflow"
WORKSPACE=$(mktemp -d)
OUTPUT=$(mktemp -d)
STDOUT=$(mktemp)
STDERR=$(mktemp)
trap 'rm -rf "$WORKSPACE" "$OUTPUT" "$STDOUT" "$STDERR"' EXIT

test "$(git -C "$SYSML_CORPUS" rev-parse HEAD)" = "$PINNED_CORPUS"
test "$(shasum -a 256 "$FIXTURE/model.sysml" | awk '{print $1}')" = "$FIXTURE_SHA"

set +e
"$ECLIPSE/Contents/MacOS/eclipse" -nosplash -clean \
  -data "$WORKSPACE" \
  -application local.sysml.validator.application \
  --roundtrip-output "$OUTPUT" \
  --roundtrip-mode bridge-filtered \
  "$SYSML_CORPUS/sysml.library" \
  "$FIXTURE" >"$STDOUT" 2>"$STDERR"
status=$?
set -e

LOG="$WORKSPACE/.metadata/.log"
test -f "$LOG"
grep -q 'java.lang.StackOverflowError' "$LOG"
grep -q 'GrammarConstraintProvider[$]Constraint.computeUpperBound' "$LOG"
test -z "$(find "$OUTPUT" -type f -print -quit)"

printf 'PASS: characterized bridge-filtered use-case succession StackOverflowError (process exit %s)\n' "$status"
