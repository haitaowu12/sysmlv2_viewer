"""Portable, read-only HTML export for contributor review packets.

The exporter deliberately treats its input as already prepared review data.  It
does not resolve model semantics, read files, fetch assets, or record approval.
All user supplied text is escaped and diagrams are embedded as isolated data
URI images so the resulting file can be opened offline.
"""

from __future__ import annotations

import base64
import html
import json
import math
import re
from collections.abc import Mapping, Sequence
from typing import Any
import xml.etree.ElementTree as ET


__all__ = ["render_review"]


_UNSAFE_SVG = re.compile(
    r"(?:"
    r"<!\s*(?:doctype|entity)|"
    r"<\s*(?:script|foreignObject|iframe|object|embed)\b|"
    r"\bon[a-z][a-z0-9_-]*\s*=|"
    r"\b(?:javascript|vbscript)\s*:|"
    r"\b(?:href|xlink:href)\s*=\s*(['\"])(?!\s*#)|"
    r"url\(\s*(['\"]?)(?:https?:|//|javascript:)|"
    r"@import\b"
    r")",
    re.IGNORECASE,
)
_SVG_ROOT = re.compile(r"^\s*(?:<\?xml[^>]*>\s*)?(?:<!--.*?-->\s*)*<svg\b", re.IGNORECASE | re.DOTALL)
_XLINK_HREF = "{http://www.w3.org/1999/xlink}href"
_SVG_HREF_NAMES = {"href", _XLINK_HREF}
_SVG_NUMBER = r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?"
_VIEWBOX = re.compile(rf"^\s*({_SVG_NUMBER})[\s,]+({_SVG_NUMBER})[\s,]+({_SVG_NUMBER})[\s,]+({_SVG_NUMBER})\s*$")
_FONT_SIZE = re.compile(rf"^\s*({_SVG_NUMBER})(?:px)?\s*$", re.IGNORECASE)
_STYLE_FONT_SIZE = re.compile(rf"(?:^|;)\s*font-size\s*:\s*({_SVG_NUMBER})(?:px)?\s*(?:;|$)", re.IGNORECASE)
_TARGET_TEXT_PX = 12.0
_MIN_DIAGRAM_WIDTH_PX = 320
_MAX_DIAGRAM_WIDTH_PX = 8192


class _RejectingSvgTreeBuilder(ET.TreeBuilder):
    """Reject DTD/entity callbacks before an SVG is serialized for embedding."""

    def doctype(self, *_args: Any) -> None:
        raise ValueError("DOCTYPE is not allowed")

    def entity(self, *_args: Any) -> None:
        raise ValueError("entities are not allowed")


def _positive_number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or number <= 0:
        return None
    return number


def _svg_min_render_width(root: ET.Element) -> int:
    """Scale an SVG so its smallest numeric text remains at least 12 CSS px."""

    viewbox = _VIEWBOX.fullmatch(root.attrib.get("viewBox", ""))
    viewbox_width = _positive_number(viewbox.group(3)) if viewbox else None
    if viewbox_width is None:
        return _MIN_DIAGRAM_WIDTH_PX
    font_sizes: list[float] = []
    for element in root.iter():
        direct = element.attrib.get("font-size")
        if direct is not None:
            match = _FONT_SIZE.fullmatch(direct)
            if match:
                number = _positive_number(match.group(1))
                if number is not None:
                    font_sizes.append(number)
        style = element.attrib.get("style")
        if style:
            match = _STYLE_FONT_SIZE.search(style)
            if match:
                number = _positive_number(match.group(1))
                if number is not None:
                    font_sizes.append(number)
    smallest_text = min(font_sizes) if font_sizes else _TARGET_TEXT_PX
    required = viewbox_width * max(1.0, _TARGET_TEXT_PX / smallest_text)
    bounded = min(max(required, float(_MIN_DIAGRAM_WIDTH_PX)), float(_MAX_DIAGRAM_WIDTH_PX))
    return math.ceil(bounded)


def _display(value: Any, empty: str = "Not recorded") -> str:
    """Return a stable human representation before HTML escaping."""

    if value is None or value == "":
        return empty
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, (Mapping, list, tuple)):
        try:
            return json.dumps(value, ensure_ascii=False, sort_keys=True)
        except (TypeError, ValueError):
            return str(value)
    return str(value)


def _esc(value: Any, empty: str = "Not recorded") -> str:
    """Escape text for either element content or an attribute."""

    return html.escape(_display(value, empty), quote=True)


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _items(value: Any) -> list[Any]:
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return list(value)
    return []


def _slug(value: Any, fallback: str = "item") -> str:
    """Make a static CSS token without carrying user text into markup."""

    token = re.sub(r"[^a-z0-9]+", "-", str(value).lower()).strip("-")
    return token or fallback


def _safe_svg_data_uri(svg: Any) -> tuple[str | None, str | None, str | None, int | None]:
    """Return a base64 SVG URI, omission reason, note and minimum render width.

    An SVG in an ``img`` element is isolated from the document, but rejecting
    active content and external references as well keeps the exported review
    independent of network access and prevents a supplied diagram from being
    used as a script or frame.  The reference renderer emits ``psysml:`` links
    for model navigation; those links are removed from the in-memory copy so
    the graphic remains useful in a frozen review without preserving a live
    navigation surface.
    """

    if not isinstance(svg, str) or not svg.strip():
        return None, None, None, None
    try:
        root = ET.fromstring(svg, parser=ET.XMLParser(target=_RejectingSvgTreeBuilder()))
    except (ET.ParseError, ValueError):
        return None, "Diagram omitted because the supplied SVG contains invalid XML or disallowed entities.", None, None
    if not _SVG_ROOT.search(svg):
        return None, "Diagram omitted because the supplied SVG is not a standalone SVG document.", None, None
    removed_navigation_links = False
    for element in root.iter():
        for name, value in list(element.attrib.items()):
            if name in _SVG_HREF_NAMES and isinstance(value, str) and value.startswith("psysml:"):
                del element.attrib[name]
                removed_navigation_links = True
    if removed_navigation_links:
        ET.register_namespace("", "http://www.w3.org/2000/svg")
        sanitized_svg = ET.tostring(root, encoding="unicode")
    else:
        sanitized_svg = svg
    if _UNSAFE_SVG.search(sanitized_svg):
        return None, "Diagram omitted because the supplied SVG contains active or external content.", None, None
    encoded = base64.b64encode(sanitized_svg.encode("utf-8")).decode("ascii")
    note = "Model navigation links are disabled in this frozen review." if removed_navigation_links else None
    return "data:image/svg+xml;base64," + encoded, None, note, _svg_min_render_width(root)


def _empty(message: str) -> str:
    return f'<p class="empty-state">{_esc(message)}</p>'


def _kind_label(kind: Any) -> str:
    text = _display(kind, "Model information")
    text = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text).replace("_", " ").replace("-", " ")
    return text[:1].upper() + text[1:] if text else "Model information"


def _row_bucket(row: Mapping[str, Any]) -> str:
    kind = _display(row.get("kind"), "").lower()
    if "requirement" in kind or "obligation" in kind or kind in {"req", "need"}:
        return "requirements"
    if "interface" in kind or "port" in kind or "flow" in kind or "exchange" in kind:
        return "interfaces"
    return "other"


def _render_field_rows(fields: list[Any]) -> str:
    rows: list[str] = []
    for field in fields:
        data = _mapping(field)
        label = data.get("label", data.get("id", "Unnamed field"))
        identifier = data.get("id")
        value = data.get("value")
        unit = data.get("unit")
        # The exported artifact is a frozen review, so its rendered fields are
        # always read-only even when the contributor manifest supports edits.
        edit_state = '<span class="badge badge-readonly">Read-only</span>'
        kind = _kind_label(data.get("kind"))
        detail = f'<span class="field-kind">{_esc(kind)}</span>'
        if identifier not in (None, ""):
            detail += f'<code class="field-id">{_esc(identifier)}</code>'
        rows.append(
            "<tr>"
            f'<th scope="row"><span class="field-label">{_esc(label)}</span>{detail}</th>'
            f'<td class="field-value">{_esc(value)}</td>'
            f'<td class="field-unit">{_esc(unit, "")}</td>'
            f'<td class="field-editability">{edit_state}</td>'
            "</tr>"
        )
    if not rows:
        return f'<tr><td colspan="4">{_empty("No fields were supplied for this register item.")}</td></tr>'
    return "".join(rows)


def _render_row_card(row: Mapping[str, Any]) -> str:
    label = row.get("label", row.get("id", "Unnamed item"))
    kind = _kind_label(row.get("kind"))
    identifier = row.get("id")
    target = row.get("target")
    heading = f'<h3>{_esc(label)}</h3>'
    id_text = f'<code class="identifier">{_esc(identifier)}</code>' if identifier not in (None, "") else ""
    target_text = (
        f'<p class="target"><strong>Model target:</strong> <code>{_esc(target)}</code></p>'
        if target not in (None, "")
        else ""
    )
    fields = _items(row.get("fields"))
    return (
        '<article class="register-card">'
        '<header class="card-heading">'
        f'<div><p class="eyebrow">{_esc(kind)}</p>{heading}</div>{id_text}'
        "</header>"
        f"{target_text}"
        '<div class="table-wrap"><table class="field-table">'
        '<caption class="sr-only">Fields for '
        f"{_esc(label)}"
        '</caption><thead><tr><th scope="col">Field</th><th scope="col">Value</th>'
        '<th scope="col">Unit</th><th scope="col">Editing</th></tr></thead><tbody>'
        f"{_render_field_rows(fields)}"
        "</tbody></table></div>"
        "</article>"
    )


def _render_register_section(section_id: str, title: str, question: str, rows: list[Any]) -> str:
    cards = [_render_row_card(_mapping(row)) for row in rows if isinstance(row, Mapping)]
    body = "".join(cards) if cards else _empty(f"No {title.lower()} records were supplied.")
    return (
        f'<section class="panel register-section" id="{section_id}" aria-labelledby="{section_id}-title">'
        '<p class="section-kicker">Question-led register</p>'
        f'<h2 id="{section_id}-title">{_esc(title)}</h2>'
        f'<p class="question">{_esc(question)}</p>'
        f'<div class="register-list">{body}</div>'
        "</section>"
    )


def _is_stale_observation(item: Mapping[str, Any], revision: Any) -> bool:
    status = _display(item.get("status"), "").lower().replace("_", "-")
    stale_statuses = {"stale", "outdated", "superseded", "not-current", "stale-historical"}
    source_revision = item.get("sourceRevision")
    revision_known = revision not in (None, "")
    source_known = source_revision not in (None, "")
    return status in stale_statuses or (revision_known and source_known and str(source_revision) != str(revision))


def _is_historical_observation(item: Mapping[str, Any], revision: Any, stale: bool) -> bool:
    status = _display(item.get("status"), "").lower()
    source_revision = item.get("sourceRevision")
    has_revision_basis = revision not in (None, "") and source_revision not in (None, "")
    return stale or has_revision_basis or "histor" in status or "superseded" in status or "outdated" in status


def _evidence_status(item: Mapping[str, Any], revision: Any) -> Any:
    """Describe applicability without implying verification or approval."""

    source_revision = item.get("sourceRevision")
    if source_revision not in (None, "") and revision not in (None, ""):
        if str(source_revision) != str(revision):
            return "needs applicability review"
        return "historical baseline observation"
    return item.get("status", "Status not recorded")


def _render_evidence(evidence: list[Any], revision: Any) -> str:
    cards: list[str] = []
    for item in evidence:
        data = _mapping(item)
        label = data.get("label", data.get("id", "Unnamed observation"))
        identifier = data.get("id")
        status = _evidence_status(data, revision)
        stale = _is_stale_observation(data, revision)
        historical = _is_historical_observation(data, revision, stale)
        badges = [f'<span class="badge badge-neutral">{_esc(status)}</span>']
        if historical:
            badges.append('<span class="badge badge-history">Historical observation</span>')
        if stale:
            badges.append('<span class="badge badge-stale">Stale for current revision</span>')
        source_revision = data.get("sourceRevision")
        source = _esc(source_revision, "Revision not recorded")
        observation = _esc(data.get("observedValue"))
        unit = _esc(data.get("unit"), "")
        value = observation + (f" {unit}" if unit else "")
        explanation = data.get("explanation")
        id_text = f'<code class="identifier">{_esc(identifier)}</code>' if identifier not in (None, "") else ""
        stale_note = (
            '<p class="notice notice-stale">This observation was recorded against an earlier or explicitly stale '
            "revision. Its applicability to the current revision requires review.</p>"
            if stale
            else ""
        )
        cards.append(
            '<article class="evidence-card' + (" evidence-card-stale" if stale else "") + '">'
            '<header class="card-heading"><div>'
            f'<p class="eyebrow">Recorded observation</p><h3>{_esc(label)}</h3>'
            f"</div>{id_text}</header>"
            f'<div class="badges">{"".join(badges)}</div>'
            f'<dl class="evidence-facts"><div><dt>Observed value</dt><dd>{value}</dd></div>'
            f'<div><dt>Source revision</dt><dd><code>{source}</code></dd></div></dl>'
            f'<p class="explanation">{_esc(explanation)}</p>'
            f"{stale_note}"
            "</article>"
        )
    if not cards:
        return _empty("No historical observations or evidence records were supplied.")
    return "".join(cards)


def _render_change(review: Mapping[str, Any]) -> str:
    summary = review.get("summary")
    changes = [_mapping(change) for change in _items(review.get("changes")) if isinstance(change, Mapping)]
    diff = review.get("diff")
    change_rows: list[str] = []
    for change in changes:
        label = change.get("label", change.get("fieldId", change.get("rowId", "Changed field")))
        location: list[str] = []
        if change.get("rowId") not in (None, ""):
            location.append(f"row {_display(change['rowId'])}")
        if change.get("fieldId") not in (None, ""):
            location.append(f"field {_display(change['fieldId'])}")
        location_text = f'<span class="change-location">{" · ".join(_esc(part) for part in location)}</span>' if location else ""
        unit = _esc(change.get("unit"), "")
        change_rows.append(
            "<tr>"
            f'<th scope="row">{_esc(label)}{location_text}</th>'
            f'<td class="before">{_esc(change.get("before"))}</td>'
            f'<td class="after">{_esc(change.get("after"))}</td>'
            f'<td>{unit}</td>'
            "</tr>"
        )
    if change_rows:
        table = (
            '<div class="table-wrap"><table class="change-table"><caption class="sr-only">Engineering change fields</caption>'
            '<thead><tr><th scope="col">Field</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Unit</th></tr></thead>'
            f'<tbody>{"".join(change_rows)}</tbody></table></div>'
        )
    else:
        table = _empty("No field-level changes were supplied.")
    diff_block = ""
    if diff not in (None, "", [], {}):
        diff_block = f'<h3 class="subheading">Recorded difference</h3><pre class="diff">{_esc(diff)}</pre>'
    else:
        diff_block = '<h3 class="subheading">Recorded difference</h3>' + _empty("No textual difference was supplied.")
    intro = (
        '<section class="panel" id="engineering-change" aria-labelledby="engineering-change-title">'
        '<p class="section-kicker">Change review</p><h2 id="engineering-change-title">Engineering change</h2>'
        '<p class="question">What engineering statement changed between the recorded baselines?</p>'
    )
    if summary not in (None, ""):
        intro += f'<p class="review-summary">{_esc(summary)}</p>'
    return intro + (
        '<section class="change-body">'
        f'{table}{diff_block}'
        '</section></section>'
    )


def _render_unresolved(unresolved: list[Any]) -> str:
    rows: list[str] = []
    for item in unresolved:
        data = _mapping(item)
        identifier = data.get("id")
        id_text = f'<code class="identifier">{_esc(identifier)}</code>' if identifier not in (None, "") else ""
        rows.append(
            '<article class="question-card"><header class="card-heading"><h3>'
            f'{_esc(data.get("question", data.get("label", "Unresolved question")))}</h3>{id_text}</header>'
            f'<p class="question-status"><strong>Status:</strong> {_esc(data.get("status"), "Status not recorded")}</p>'
            '</article>'
        )
    body = "".join(rows) if rows else _empty("No unresolved-question records were supplied.")
    return (
        '<section class="panel" id="unresolved" aria-labelledby="unresolved-title">'
        '<p class="section-kicker">Open decisions</p><h2 id="unresolved-title">Unresolved questions</h2>'
        '<p class="question">Which decisions still require an answer before this review can be closed?</p>'
        f'<div class="question-list">{body}</div></section>'
    )


def _render_views(views: list[Any]) -> str:
    cards: list[str] = []
    for item in views:
        data = _mapping(item)
        label = data.get("label", data.get("id", "Unnamed view"))
        identifier = data.get("id")
        scope = data.get("scope")
        source, omission, navigation_note, minimum_width = _safe_svg_data_uri(data.get("svg"))
        if source:
            visual = (
                f'<img loading="lazy" src="{source}" alt="Diagram for {_esc(label)}" '
                f'style="width:max(100%, {minimum_width}px); min-width:{minimum_width}px; max-width:none;" />'
                '<p class="diagram-scroll-note">Scroll diagram horizontally on narrow screens.</p>'
            )
            if navigation_note:
                visual += f'<p class="notice notice-offline">{_esc(navigation_note)}</p>'
        elif omission:
            visual = f'<p class="notice notice-stale">{_esc(omission)}</p>'
        else:
            visual = _empty("No diagram was supplied for this view.")
        limits = [_display(limit) for limit in _items(data.get("limits")) if limit not in (None, "")]
        limit_block = ""
        if limits:
            limit_block = '<h4>View limits</h4><ul class="limit-list">' + "".join(f"<li>{_esc(limit)}</li>" for limit in limits) + "</ul>"
        else:
            limit_block = _empty("No view-specific limits were supplied.")
        id_text = f'<code class="identifier">{_esc(identifier)}</code>' if identifier not in (None, "") else ""
        scope_text = f'<p class="target"><strong>Scope:</strong> <code>{_esc(scope)}</code></p>' if scope not in (None, "") else ""
        cards.append(
            '<article class="view-card"><header class="card-heading"><div>'
            f'<p class="eyebrow">Saved perspective</p><h3>{_esc(label)}</h3>'
            f"</div>{id_text}</header>{scope_text}"
            f'<figure class="view-figure">{visual}<figcaption>{_esc(label)} · read-only diagram</figcaption></figure>'
            f'<div class="view-limits">{limit_block}</div></article>'
        )
    body = "".join(cards) if cards else _empty("No saved views were supplied.")
    return (
        '<section class="panel" id="views" aria-labelledby="views-title">'
        '<p class="section-kicker">Bounded perspectives</p><h2 id="views-title">Review views</h2>'
        '<p class="question">Which bounded visual perspectives support this review?</p>'
        f'<div class="view-list">{body}</div></section>'
    )


def _render_limits(limits: list[Any]) -> str:
    values = [_display(limit) for limit in limits if limit not in (None, "")]
    body = (
        '<ul class="limit-list">' + "".join(f"<li>{_esc(value)}</li>" for value in values) + "</ul>"
        if values
        else _empty("No additional scope limits were supplied.")
    )
    return (
        '<section class="panel" id="scope-limits" aria-labelledby="scope-limits-title">'
        '<p class="section-kicker">Boundary statement</p><h2 id="scope-limits-title">Scope limits</h2>'
        '<p class="question">What does this export leave out or require the reader to check elsewhere?</p>'
        f"{body}</section>"
    )


_STYLE = """
:root { color-scheme: light; --ink:#192522; --muted:#52645f; --line:#d3ded9; --paper:#ffffff; --wash:#f3f7f5; --accent:#276b5d; --warning:#8a4b13; --warning-wash:#fff4e5; }
* { box-sizing:border-box; }
html { background:#e9efec; }
body { margin:0; color:var(--ink); background:#e9efec; font:16px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
main, header.page-header { width:min(1160px,100%); margin:0 auto; padding-inline:clamp(1rem,3vw,2.5rem); }
header.page-header { padding-top:clamp(2rem,6vw,5rem); padding-bottom:1.75rem; }
.eyebrow,.section-kicker { margin:0 0 .35rem; color:var(--accent); font-size:.74rem; font-weight:750; letter-spacing:.1em; text-transform:uppercase; }
h1,h2,h3,h4 { line-height:1.18; margin:0; }
h1 { max-width:28ch; font-size:clamp(2rem,5vw,4rem); letter-spacing:-.04em; }
h2 { font-size:clamp(1.35rem,2.2vw,2rem); letter-spacing:-.02em; }
h3 { font-size:1.08rem; }
h4 { margin-top:1rem; font-size:.9rem; }
.lede { max-width:70ch; margin:1rem 0 0; color:var(--muted); }
.badge,.identifier,.field-id,.field-kind,code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
.identifier { color:var(--muted); font-size:.73rem; overflow-wrap:anywhere; }
.metadata { display:grid; grid-template-columns:repeat(auto-fit,minmax(12rem,1fr)); gap:.7rem; margin:1.5rem 0 0; }
.metadata div { padding:.85rem 1rem; border:1px solid var(--line); border-radius:.7rem; background:rgba(255,255,255,.68); }
.metadata dt { color:var(--muted); font-size:.75rem; font-weight:700; text-transform:uppercase; }
.metadata dd { margin:.15rem 0 0; overflow-wrap:anywhere; }
.notice { padding:.8rem 1rem; border-left:.25rem solid var(--accent); background:var(--wash); color:var(--muted); }
.notice-stale { border-left-color:var(--warning); background:var(--warning-wash); color:#63380f; }
.panel { margin:1rem 0; padding:clamp(1.1rem,3vw,2rem); border:1px solid var(--line); border-radius:1rem; background:var(--paper); box-shadow:0 1rem 2.5rem rgba(25,37,34,.045); }
.question { margin:.45rem 0 1.25rem; color:var(--muted); font-size:1.02rem; }
.register-list,.evidence-list,.change-body,.question-list,.view-list { display:grid; gap:.9rem; }
.register-card,.evidence-card,.question-card,.view-card { padding:1rem; border:1px solid var(--line); border-radius:.75rem; background:#fbfdfc; }
.register-list > *, .evidence-list > *, .change-body > *, .question-list > *, .view-list > *, .register-card, .evidence-card, .question-card, .view-card { min-width:0; }
.card-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; }
.card-heading h3 { overflow-wrap:anywhere; }
.target { margin:.65rem 0; color:var(--muted); font-size:.88rem; overflow-wrap:anywhere; }
.target code { color:var(--ink); }
.table-wrap { min-width:0; max-width:100%; overflow-x:auto; }
table { width:100%; border-collapse:collapse; }
th,td { padding:.65rem .55rem; border-top:1px solid var(--line); text-align:left; vertical-align:top; }
thead th { color:var(--muted); font-size:.75rem; letter-spacing:.04em; text-transform:uppercase; }
.field-table { min-width:38rem; }
.field-table th[scope=row],.change-table th[scope=row] { width:30%; font-weight:650; }
.field-label { display:block; overflow-wrap:anywhere; }
.field-kind,.field-id { display:block; margin-top:.18rem; color:var(--muted); font-size:.72rem; font-weight:400; overflow-wrap:anywhere; }
.field-value,.field-unit,.before,.after { overflow-wrap:anywhere; white-space:pre-wrap; }
.badges { display:flex; flex-wrap:wrap; gap:.45rem; margin:.85rem 0; }
.badge { display:inline-block; padding:.2rem .48rem; border:1px solid var(--line); border-radius:999px; color:var(--muted); font-size:.7rem; line-height:1.35; }
.badge-editable { border-color:#98c9ba; background:#e5f4ee; color:#155647; }
.badge-history { border-color:#d8b87d; background:#fff6df; color:#754b09; }
.badge-stale { border-color:#e0a36e; background:var(--warning-wash); color:var(--warning); font-weight:750; }
.evidence-card-stale { border-color:#e0a36e; }
.evidence-facts { display:grid; grid-template-columns:repeat(auto-fit,minmax(11rem,1fr)); gap:.75rem; margin:0; }
.evidence-facts div { padding:.7rem .8rem; border-radius:.55rem; background:var(--wash); }
.evidence-facts dt { color:var(--muted); font-size:.75rem; font-weight:700; }
.evidence-facts dd { margin:.15rem 0 0; overflow-wrap:anywhere; }
.explanation,.review-summary { white-space:pre-wrap; overflow-wrap:anywhere; }
.change-location { display:block; margin-top:.2rem; color:var(--muted); font-size:.72rem; font-weight:400; }
.before { background:#fff8f4; }
.after { background:#f2fbf5; }
.subheading { margin-top:.4rem; }
.diff { max-height:24rem; overflow:auto; padding:1rem; border-radius:.6rem; background:#18231f; color:#e9f5ef; white-space:pre-wrap; overflow-wrap:anywhere; }
.limit-list { margin:.5rem 0 0; padding-left:1.35rem; }
.limit-list li { margin:.35rem 0; overflow-wrap:anywhere; }
.view-figure { min-width:0; margin:1rem 0 0; padding:.75rem; border:1px solid var(--line); border-radius:.65rem; background:#fff; overflow-x:auto; }
.view-figure img { display:block; width:100%; max-width:none; max-height:32rem; object-fit:contain; }
.view-figure figcaption { margin-top:.65rem; color:var(--muted); font-size:.78rem; }
.diagram-scroll-note { margin:.65rem 0 0; color:var(--muted); font-size:.78rem; }
.empty-state { margin:0; color:var(--muted); font-style:italic; }
footer { width:min(1160px,100%); margin:0 auto; padding:1.25rem clamp(1rem,3vw,2.5rem) 3rem; color:var(--muted); font-size:.84rem; }
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
@media (min-width:651px) { .diagram-scroll-note { display:none; } }
@media (max-width:650px) { body { font-size:15px; } .panel { border-radius:.75rem; } .card-heading { display:block; } .identifier { display:block; margin-top:.45rem; } .metadata { grid-template-columns:1fr; } }
@media print { html,body { background:#fff; } .panel { box-shadow:none; break-inside:avoid; } .view-card { break-inside:avoid; } footer { padding-bottom:0; } }
"""


def render_review(state: dict) -> str:
    """Render a portable, self-contained, read-only contributor review export.

    ``state`` is intentionally treated as presentation input.  Missing lists
    render explicit empty states, while missing metadata remains visibly
    unrecorded.  No value in ``state`` is trusted as HTML.
    """

    if not isinstance(state, Mapping):
        raise TypeError("state must be a mapping")

    title = state.get("title", "Contributor review")
    revision = state.get("revision")
    source_sha = state.get("sourceSha256")
    profile = state.get("profile", "local-contributor-v1")
    rows = _items(state.get("rows"))
    buckets = {"requirements": [], "interfaces": [], "other": []}
    for row in rows:
        data = _mapping(row)
        buckets[_row_bucket(data)].append(row)
    review = _mapping(state.get("review"))
    evidence = _items(state.get("evidence"))
    unresolved = _items(state.get("unresolved"))
    views = _items(state.get("views"))
    limits = _items(state.get("limits"))

    page_title = f"{_esc(title)} · Contributor review"
    source_label = _esc(source_sha, "Source hash not recorded")
    revision_label = _esc(revision, "Revision not recorded")
    profile_label = _esc(profile, "Profile not recorded")
    body = [
        _render_register_section(
            "requirements",
            "Requirements",
            "What must the system achieve, and how will it be checked?",
            buckets["requirements"],
        ),
        _render_register_section(
            "interfaces",
            "Interfaces",
            "What crosses a system boundary, and what still needs resolution?",
            buckets["interfaces"],
        ),
        _render_register_section(
            "model-information",
            "Model information",
            "What additional typed information supports this review?",
            buckets["other"],
        ),
        '<section class="panel" id="evidence" aria-labelledby="evidence-title">'
        '<p class="section-kicker">Recorded basis</p><h2 id="evidence-title">Evidence and historical observations</h2>'
        '<p class="question">Which observations remain applicable to this revision?</p>'
        f'<div class="evidence-list">{_render_evidence(evidence, revision)}</div></section>',
        _render_change(review),
        _render_unresolved(unresolved),
        _render_views(views),
        _render_limits(limits),
    ]
    return (
        '<!doctype html>\n<html lang="en">\n<head>\n'
        '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f"<title>{page_title}</title>\n<style>{_STYLE}</style>\n</head>\n<body>\n"
        '<header class="page-header"><p class="section-kicker">Read-only contributor review export</p>'
        f'<h1>{_esc(title)}</h1>'
        '<p class="lede">A portable review package for engineering participation. It presents recorded model information, changes, observations, questions, views, and limits without creating a second model or recording approval.</p>'
        '<dl class="metadata">'
        f'<div><dt>Revision</dt><dd><code>{revision_label}</code></dd></div>'
        f'<div><dt>Source SHA-256</dt><dd><code>{source_label}</code></dd></div>'
        f'<div><dt>Profile</dt><dd><code>{profile_label}</code></dd></div>'
        '</dl></header><main>'
        + "\n".join(body)
        + '</main><footer><p>This export is read-only. It does not record approval, verification execution, authorization, or completeness beyond the supplied review state.</p></footer>\n</body>\n</html>\n'
    )
