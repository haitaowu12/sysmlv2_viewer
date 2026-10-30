#!/usr/bin/env python3
"""Export/check the canonical frontend specialist without a global skill symlink.

Only the fixed files below are packaged. Other relative Markdown links become
revision-pinned GitHub links and still need network access. Checks establish
package integrity/discoverability, not host activation or model/visual quality.
The caller supplies the source revision; this tool does not fetch or attest Git.
"""

import argparse
import hashlib
import json
import os
import posixpath
import re
import shutil
import sys
import tempfile
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit, urlunsplit


REPOSITORY = "https://github.com/haitaowu12/tonys-second-brain"
FORMAT = "tonys-second-brain.frontend-capsule.v1"
SKILL = "frontend-skill"
BASE = ".agent/skills/development-workflow"
SPECIALIST = BASE + "/specialists/frontend-skill"
SOURCES = {
    "SKILL.md": SPECIALIST + "/SKILL.md",
    "agents/openai.yaml": SPECIALIST + "/agents/openai.yaml",
    "LICENSE.txt": SPECIALIST + "/LICENSE.txt",
    "references/ui-design-delivery.md": BASE + "/references/ui-design-delivery.md",
    "references/ui-direction-decisions.md": BASE + "/references/ui-direction-decisions.md",
    "references/evidence-qa-contract.md": ".agent/skills/quality-verification/references/evidence-qa-contract.md",
    "references/product-design-practice.md": SPECIALIST + "/references/product-design-practice.md",
    "scripts/frontend_capsule.py": "scripts/frontend_capsule.py",
}
ENTRY_LINKS = {"references/ui-design-delivery.md", "references/product-design-practice.md"}
REVISION = re.compile(r"[0-9a-fA-F]{40}\Z")
HASH = re.compile(r"[0-9a-f]{64}\Z")


class CapsuleError(ValueError):
    """A package cannot be created or trusted with these inputs."""


def digest(data):
    return hashlib.sha256(data).hexdigest()


def local_path(value):
    """Do not resolve symlinks before checking them, including ancestor links."""
    path = Path(os.path.abspath(value))
    for part in (path, *path.parents):
        if part.is_symlink():
            raise CapsuleError(f"symlink is not allowed: {part}")
    return path


def read_file(path):
    path = local_path(path)
    if not path.is_file():
        raise CapsuleError(f"missing regular file: {path}")
    return path.read_bytes()


def text_file(data, path):
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise CapsuleError(f"not UTF-8: {path}") from exc


def prose_mask(text):
    """Preserve offsets while excluding fenced and inline code from link edits."""
    chars = list(text)
    fence = None
    offset = 0
    for line in text.splitlines(keepends=True):
        marker = re.match(r"^ {0,3}(`{3,}|~{3,})", line)
        if fence or marker:
            if fence and marker and marker[1][0] == fence[0] and len(marker[1]) >= len(fence):
                fence = None
            elif not fence:
                fence = marker[1]
            chars[offset:offset + len(line)] = ["\n" if c == "\n" else " " for c in line]
        offset += len(line)
    masked = "".join(chars)
    for match in re.finditer(r"(`+)([^`]|(?!\1)`)*?\1", masked):
        chars[match.start():match.end()] = ["\n" if c == "\n" else " " for c in match[0]]
    return "".join(chars)


def destinations(text):
    """Yield destination spans for inline/image and reference-definition links.

    This handles escaped/nested parentheses and angle destinations. It is a
    focused Markdown link scanner, not a renderer; fenced/inline code is ignored.
    """
    masked = prose_mask(text)
    starts = [m.end() for m in re.finditer(r"(?<!\\)\]\([ \t]*", masked)]
    starts += [m.end() for m in re.finditer(r"^ {0,3}\[[^\]\n]+\]:[ \t]*", masked, re.M)]
    for start in sorted(set(starts)):
        if start >= len(text):
            continue
        if text[start] == "<":
            end = masked.find(">", start + 1)
            if end == -1 or "\n" in masked[start:end]:
                raise CapsuleError("malformed angle Markdown destination")
            yield start + 1, end
            continue
        end, depth = start, 0
        while end < len(masked):
            char = masked[end]
            if char == "\\" and end + 1 < len(masked):
                end += 2
                continue
            if char.isspace() or (char == ")" and depth == 0):
                break
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
            end += 1
        if depth:
            raise CapsuleError("unbalanced Markdown destination")
        if start < end:
            yield start, end


def relative_target(target, origin):
    """Resolve a local Markdown destination; return None for online links."""
    raw = re.sub(r"\\([\\()<> ])", r"\1", target)
    if any(ord(c) < 32 for c in raw) or "\\" in raw:
        raise CapsuleError(f"unsafe Markdown destination in {origin}: {target}")
    parsed = urlsplit(raw)
    if parsed.scheme or parsed.netloc:
        if parsed.scheme.lower() in {"file", "javascript", "vbscript"}:
            raise CapsuleError(f"unsafe URL in {origin}: {target}")
        return None
    path = unquote(parsed.path)
    if path.startswith(("/", "~")) or "\\" in path or any(ord(c) < 32 for c in path):
        raise CapsuleError(f"absolute/unsafe local link in {origin}: {target}")
    resolved = posixpath.normpath(posixpath.join(posixpath.dirname(origin), path)) if path else origin
    if resolved == ".." or resolved.startswith("../"):
        raise CapsuleError(f"link escapes source/package root in {origin}: {target}")
    return resolved, parsed.query, parsed.fragment


def rewrite(text, source, destination, revision):
    reverse = {src: dst for dst, src in SOURCES.items()}
    replacements = []
    for start, end in destinations(text):
        target = text[start:end]
        local = relative_target(target, source)
        if local is None or target.startswith("#"):
            continue
        resolved, query, fragment = local
        if resolved in reverse:
            new_path = posixpath.relpath(reverse[resolved], posixpath.dirname(destination) or ".")
            new = urlunsplit(("", "", quote(new_path, safe="/.-_"), query, fragment))
        else:
            new = f"{REPOSITORY}/blob/{revision}/{quote(resolved, safe='/.-_')}"
            if query:
                new += "?" + query
            if fragment:
                new += "#" + fragment
        replacements.append((start, end, new))
    for start, end, new in reversed(replacements):
        text = text[:start] + new + text[end:]
    return text


def scalar(value):
    """Read the small scalar YAML subset used by this native skill's metadata."""
    value = value.strip()
    if not value:
        raise CapsuleError("empty native skill metadata value")
    if value.startswith('"'):
        try:
            result = json.loads(value)
        except ValueError as exc:
            raise CapsuleError("malformed quoted native skill metadata") from exc
    elif value.startswith("'"):
        if not value.endswith("'") or len(value) < 2:
            raise CapsuleError("malformed quoted native skill metadata")
        if not re.fullmatch(r"(?:[^']|'')*", value[1:-1]):
            raise CapsuleError("malformed quoted native skill metadata")
        result = value[1:-1].replace("''", "'")
    else:
        indicator = value[0] in "-?:" and (len(value) == 1 or value[1].isspace())
        if value[0] in "[]{},&*!>|%@`#" or indicator or ": " in value:
            raise CapsuleError("unsupported native metadata scalar syntax")
        result = value.split(" #", 1)[0].rstrip()
        if result.lower() in {"true", "false", "null", "yes", "no", "on", "off", "~"} or re.fullmatch(r"[-+]?\d+(?:\.\d+)?", result):
            raise CapsuleError("native metadata values must be YAML strings")
    if not isinstance(result, str) or not result.strip():
        raise CapsuleError("native skill metadata values must be nonempty text")
    return result


def validate_native(files):
    skill = text_file(files["SKILL.md"], "SKILL.md")
    match = re.match(r"\A---\r?\n(.*?)\r?\n---(?:\r?\n|\Z)", skill, re.S)
    if not match:
        raise CapsuleError("SKILL.md has no native YAML frontmatter")
    fields = {}
    for line in match[1].splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        item = re.fullmatch(r"(name|description):[ \t]*(.+)", line)
        if not item or item[1] in fields:
            raise CapsuleError("malformed or duplicate native skill frontmatter")
        fields[item[1]] = scalar(item[2])
    if fields.get("name") != SKILL or not fields.get("description"):
        raise CapsuleError("native skill name/description must identify frontend-skill")
    metadata = text_file(files["agents/openai.yaml"], "agents/openai.yaml")
    fields = {}
    lines = [line for line in metadata.splitlines() if line.strip() and not line.lstrip().startswith("#")]
    if not lines or lines[0] != "interface:":
        raise CapsuleError("native metadata requires interface")
    for line in lines[1:]:
        item = re.fullmatch(r"  (display_name|short_description|default_prompt):[ \t]*(.+)", line)
        if not item or item[1] in fields:
            raise CapsuleError("malformed or duplicate native interface metadata")
        fields[item[1]] = scalar(item[2])
    if set(fields) != {"display_name", "short_description", "default_prompt"}:
        raise CapsuleError("native interface metadata is incomplete")
    if not re.search(r"\$frontend-skill(?![a-zA-Z0-9_-])", fields["default_prompt"]):
        raise CapsuleError("native default_prompt must invoke $frontend-skill")
    if not files["LICENSE.txt"].strip():
        raise CapsuleError("empty license notice")


def validate_links(files):
    graph = {}
    for path, data in files.items():
        if not path.endswith(".md"):
            continue
        graph[path] = set()
        text = text_file(data, path)
        for start, end in destinations(text):
            local = relative_target(text[start:end], path)
            if local is None:
                continue
            target = local[0]
            if target not in files:
                raise CapsuleError(f"missing local link target: {path} -> {target}")
            graph[path].add(target)
    if not ENTRY_LINKS <= graph.get("SKILL.md", set()):
        raise CapsuleError("entry must link to bundled delivery and product-design practice")
    reached, pending = set(), ["SKILL.md"]
    while pending:
        item = pending.pop()
        if item not in reached:
            reached.add(item)
            pending.extend(graph.get(item, set()) - reached)
    if set(graph) - reached:
        raise CapsuleError("undiscoverable bundled Markdown: " + ", ".join(sorted(set(graph) - reached)))


def build(source_root, revision):
    files, records = {}, {}
    for destination, source in SOURCES.items():
        original = read_file(source_root / source)
        text = text_file(original, source)
        data = rewrite(text, source, destination, revision).encode("utf-8") if destination.endswith(".md") else original
        files[destination] = data
        records[destination] = {"source": source, "source_sha256": digest(original), "sha256": digest(data)}
    validate_native(files)
    validate_links(files)
    manifest = {"format": FORMAT, "repository": REPOSITORY, "source_revision": revision,
                "source_revision_verified": False, "skill": SKILL, "files": records}
    files["SOURCE.json"] = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8")
    return files


def read_capsule(out):
    """Recognize only an intact generated package; never overwrite local edits."""
    if not out.is_dir():
        raise CapsuleError(f"capsule directory is missing: {out}")
    actual = set()
    expected = set(SOURCES) | {"SOURCE.json"}
    allowed_dirs = {str(p) for name in expected for p in Path(name).parents if str(p) != "."}
    for path in out.rglob("*"):
        relative = path.relative_to(out).as_posix()
        if path.is_symlink():
            raise CapsuleError(f"symlink in capsule: {relative}")
        if path.is_dir():
            if relative not in allowed_dirs:
                raise CapsuleError(f"unrecognized capsule directory: {relative}")
        elif path.is_file():
            actual.add(relative)
        else:
            raise CapsuleError(f"non-regular capsule entry: {relative}")
    if actual != expected:
        raise CapsuleError(f"capsule file set differs; missing={sorted(expected - actual)}, extra={sorted(actual - expected)}")
    files = {name: read_file(out / name) for name in expected}
    def unique_keys(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise CapsuleError("duplicate key in SOURCE.json")
            result[key] = value
        return result

    try:
        manifest = json.loads(files["SOURCE.json"], object_pairs_hook=unique_keys)
    except (ValueError, UnicodeDecodeError) as exc:
        raise CapsuleError("malformed SOURCE.json") from exc
    if (not isinstance(manifest, dict) or set(manifest) != {"format", "repository", "source_revision", "source_revision_verified", "skill", "files"}
            or manifest["format"] != FORMAT or manifest["repository"] != REPOSITORY or manifest["skill"] != SKILL
            or manifest["source_revision_verified"] is not False
            or not isinstance(manifest["source_revision"], str) or not REVISION.fullmatch(manifest["source_revision"])
            or not isinstance(manifest["files"], dict) or set(manifest["files"]) != set(SOURCES)):
        raise CapsuleError("unrecognized SOURCE.json identity or mapping")
    for name, source in SOURCES.items():
        record = manifest["files"][name]
        if (not isinstance(record, dict) or set(record) != {"source", "source_sha256", "sha256"}
                or record["source"] != source or any(not isinstance(record[key], str) or not HASH.fullmatch(record[key])
                                                    for key in ("source_sha256", "sha256"))):
            raise CapsuleError(f"malformed source mapping: {name}")
        if digest(files[name]) != record["sha256"]:
            raise CapsuleError(f"generated file was modified: {name}")
    validate_native(files)
    validate_links(files)
    return files


def write_capsule(out, files, update):
    if out.exists():
        if not update:
            raise CapsuleError(f"output exists; refusing overwrite: {out}")
        read_capsule(out)
    elif update:
        raise CapsuleError("--update requires an existing recognized generated capsule")
    out.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=f".{out.name}.stage-", dir=out.parent))
    backup = None
    reserved = False
    try:
        for name, data in files.items():
            target = stage / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        read_capsule(stage)
        local_path(out)
        if update:
            read_capsule(out)
            backup = Path(tempfile.mkdtemp(prefix=f".{out.name}.backup-", dir=out.parent))
            backup.rmdir()
            out.rename(backup)
        else:
            # Reserve the absent name without ever replacing an existing folder.
            out.mkdir()
            reserved = True
        try:
            stage.replace(out)
            reserved = False
        except OSError:
            if reserved:
                out.rmdir()
                reserved = False
            if backup is not None and not out.exists():
                backup.rename(out)
                backup = None
            raise
        if backup is not None:
            # The new package is already committed. A cleanup failure must not
            # report the replacement itself as failed or discard the old copy.
            try:
                shutil.rmtree(backup)
            except OSError:
                print(f"frontend capsule: previous package retained at {backup}", file=sys.stderr)
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    inspect = commands.add_parser("inspect", help="check a consumer package without the canonical checkout")
    inspect.add_argument("--out", required=True, type=Path)
    for command in ("export", "check"):
        sub = commands.add_parser(command)
        sub.add_argument("--source-root", required=True, type=Path)
        sub.add_argument("--out", required=True, type=Path)
        sub.add_argument("--source-revision", required=True, help="explicit 40-hex source commit label")
        if command == "export":
            sub.add_argument("--update", action="store_true", help="replace only an intact generated capsule")
    args = parser.parse_args(argv)
    try:
        if args.command == "inspect":
            out = local_path(args.out)
            read_capsule(out)
            print(f"inspect: packaged bytes, local links and native metadata verified at {out}")
            print("Source currency, host activation and design quality were not assessed.")
            return 0
        if not REVISION.fullmatch(args.source_revision):
            raise CapsuleError("--source-revision must be exactly 40 hexadecimal characters")
        source_root, out = local_path(args.source_root), local_path(args.out)
        if not source_root.is_dir():
            raise CapsuleError(f"source root is not a directory: {source_root}")
        if out == source_root or out in source_root.parents:
            raise CapsuleError("output must not contain the source root")
        for source in SOURCES.values():
            path = source_root / source
            if out == path or out in path.parents:
                raise CapsuleError("output overlaps canonical source files")
        expected = build(source_root, args.source_revision.lower())
        if args.command == "check":
            actual = read_capsule(out)
            changed = sorted(name for name in expected if actual[name] != expected[name])
            if changed:
                raise CapsuleError("stale capsule relative to supplied source/revision: " + ", ".join(changed))
        else:
            write_capsule(out, expected, args.update)
        print(f"{args.command}: frontend capsule bytes, local links and native metadata verified at {out}")
        print("Optional unbundled links require network access. Host activation and design quality were not assessed.")
        return 0
    except (CapsuleError, OSError, ValueError) as exc:
        print(f"frontend capsule: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
