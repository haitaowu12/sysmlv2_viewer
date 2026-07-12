#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")" && pwd)
CLASSES=$(mktemp -d)
trap 'rm -rf "$CLASSES"' EXIT

javac -d "$CLASSES" \
  "$ROOT/src/local/sysml/validator/TextOutputGuard.java" \
  "$ROOT/test/local/sysml/validator/TextOutputGuardTest.java"
java -cp "$CLASSES" local.sysml.validator.TextOutputGuardTest
