#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")" && pwd)
: "${ECLIPSE:?Set ECLIPSE to the Eclipse application directory containing Contents/Eclipse/plugins}"
CLASSES=$(mktemp -d)
trap 'rm -rf "$CLASSES"' EXIT
CLASSPATH=$(find "$ECLIPSE/Contents/Eclipse/plugins" -maxdepth 1 \
  -name '*.jar' ! -name '*.source_*' -print | paste -sd: -)

javac -cp "$CLASSPATH" -d "$CLASSES" \
  $(find "$ROOT/src" -name '*.java' -print) \
  "$ROOT/test/local/sysml/validator/PortConjugationTransientRuleTest.java"
java -cp "$CLASSES:$CLASSPATH" local.sysml.validator.PortConjugationTransientRuleTest
