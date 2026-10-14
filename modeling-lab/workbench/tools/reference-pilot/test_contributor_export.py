"""Focused acceptance checks for the portable contributor review export."""

from __future__ import annotations

import base64
import re
import unittest

from contributor_export import render_review


class ContributorExportTests(unittest.TestCase):
    def test_all_state_strings_are_escaped_and_svg_is_embedded(self) -> None:
        state = {
            "title": '<Review & <script>alert("title")</script>',
            "revision": 'rev-<img src=x onerror="boom">',
            "sourceSha256": 'hash" onclick="bad',
            "rows": [
                {
                    "id": 'REQ-<svg onload="bad">',
                    "label": 'Requirement </h3><script>alert("row")</script>',
                    "kind": "requirement",
                    "target": 'System::<unsafe>',
                    "fields": [
                        {
                            "id": 'field"><script>x</script>',
                            "label": 'Threshold & limit',
                            "kind": "quantity",
                            "value": '<b>5</b>',
                            "unit": 'ms" onmouseover="bad',
                            "editable": True,
                        }
                    ],
                }
            ],
            "evidence": [
                {
                    "id": "OBS-1",
                    "label": 'Observation <em>one</em>',
                    "observedValue": '<value>',
                    "unit": "ms",
                    "sourceRevision": "rev-1",
                    "status": "observed",
                    "explanation": '<p>Recorded & explained</p>',
                }
            ],
            "review": {
                "summary": 'Changed <strong>bound</strong>',
                "changes": [
                    {"rowId": "R1", "fieldId": "F1", "label": "Limit", "before": "1 < 2", "after": "3 & 4", "unit": "ms"}
                ],
                "diff": '--- before\n+++ after\n<script>bad()</script>',
            },
            "views": [{"id": "v1", "label": "Boundary", "scope": "System", "svg": '<svg xmlns="http://www.w3.org/2000/svg"><text>Safe</text></svg>', "limits": []}],
            "limits": ["No execution result is included."],
        }

        output = render_review(state)

        self.assertIn("&lt;script&gt;alert(&quot;title&quot;)&lt;/script&gt;", output)
        self.assertIn("&lt;Review &amp;", output)
        self.assertNotIn('<script>alert("title")</script>', output)
        self.assertNotIn(' onerror="', output)
        self.assertNotIn(' onmouseover="', output)
        self.assertIn("Read-only", output)
        self.assertNotIn(">Editable<", output)
        self.assertIn("data:image/svg+xml;base64,", output)
        data_uri = re.search(r'src="(data:image/svg\+xml;base64,[^"]+)"', output)
        self.assertIsNotNone(data_uri)
        decoded = base64.b64decode(data_uri.group(1).split(",", 1)[1]).decode("utf-8")
        self.assertIn("<svg", decoded)
        self.assertNotIn("<script", decoded)

    def test_unicode_and_long_text_are_preserved(self) -> None:
        long_text = "工程接口 / Δ " + ("long-value " * 1500)
        output = render_review(
            {
                "title": "Résumé — 供給界面",
                "rows": [
                    {
                        "label": "接口说明",
                        "kind": "interface",
                        "fields": [{"label": "说明", "value": long_text, "unit": "—", "editable": False}],
                    }
                ],
            }
        )

        self.assertIn("Résumé — 供給界面", output)
        self.assertIn("工程接口 / Δ", output)
        self.assertIn(long_text, output)
        self.assertGreater(len(output), len(long_text))

    def test_empty_sections_are_explicit_and_renderable(self) -> None:
        output = render_review({})

        for heading in (
            "Requirements",
            "Interfaces",
            "Model information",
            "Evidence and historical observations",
            "Engineering change",
            "Unresolved questions",
            "Review views",
            "Scope limits",
        ):
            self.assertIn(heading, output)
        self.assertIn("No requirements records were supplied.", output)
        self.assertIn("No interfaces records were supplied.", output)
        self.assertIn("No saved views were supplied.", output)
        self.assertIn("No additional scope limits were supplied.", output)

    def test_stale_historical_observation_is_visibly_distinguished(self) -> None:
        output = render_review(
            {
                "revision": "current-rev",
                "evidence": [
                    {
                        "id": "OBS-OLD",
                        "label": "Baseline timing observation",
                        "observedValue": 95,
                        "unit": "ms",
                        "sourceRevision": "baseline-rev",
                        "status": "observed",
                        "explanation": "Recorded before the interface revision.",
                    }
                ],
            }
        )

        self.assertIn("Historical observation", output)
        self.assertIn("Stale for current revision", output)
        self.assertIn("needs applicability review", output)
        self.assertNotIn("Status not recorded", output)
        self.assertIn("applicability to the current revision requires review", output)
        self.assertIn("baseline-rev", output)

    def test_same_revision_historical_evidence_has_explicit_status(self) -> None:
        output = render_review(
            {
                "revision": "baseline-rev",
                "evidence": [
                    {
                        "id": "OBS-SAME",
                        "label": "Baseline observation",
                        "observedValue": 95,
                        "unit": "ms",
                        "sourceRevision": "baseline-rev",
                        "status": "observed",
                        "explanation": "Retained unchanged for review.",
                    }
                ],
            }
        )

        self.assertIn("historical baseline observation", output)
        self.assertIn("Historical observation", output)
        self.assertNotIn("Status not recorded", output)

    def test_missing_views_do_not_create_a_broken_image_or_external_resource(self) -> None:
        output = render_review({"views": None})

        self.assertIn("No saved views were supplied.", output)
        self.assertNotIn("<img", output)
        self.assertNotIn("http://", output)
        self.assertNotIn("https://", output)

    def test_unsafe_svg_is_omitted(self) -> None:
        output = render_review({"views": [{"label": "Unsafe", "svg": '<svg><script>alert(1)</script></svg>'}]})

        self.assertIn("active or external content", output)
        self.assertNotIn("alert(1)", output)
        self.assertNotIn("<script", output)

    def test_psysml_navigation_links_are_removed_but_graphic_is_embedded(self) -> None:
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">'
            '<a xlink:href="psysml:element-1"><text>InfrastructureControlSystem</text></a>'
            "</svg>"
        )
        output = render_review({"views": [{"label": "System boundary", "svg": svg}]})

        self.assertIn("data:image/svg+xml;base64,", output)
        self.assertIn("Model navigation links are disabled in this frozen review.", output)
        data_uri = re.search(r'src="(data:image/svg\+xml;base64,[^\"]+)"', output)
        self.assertIsNotNone(data_uri)
        decoded = base64.b64decode(data_uri.group(1).split(",", 1)[1]).decode("utf-8")
        self.assertIn("InfrastructureControlSystem", decoded)
        self.assertNotIn("psysml:", decoded)
        self.assertNotIn("xlink:href", decoded)
        self.assertIn("Scroll diagram horizontally on narrow screens.", output)

    def test_narrow_layout_keeps_card_and_table_overflow_local(self) -> None:
        output = render_review(
            {
                "rows": [
                    {
                        "label": "Narrow interface",
                        "kind": "interface",
                        "fields": [{"label": "Long value", "value": "x" * 200, "editable": True}],
                    }
                ],
                "views": [{"label": "Boundary", "svg": '<svg xmlns="http://www.w3.org/2000/svg"><text>Boundary</text></svg>'}],
            }
        )

        self.assertIn("min-width:0", output)
        self.assertIn(".table-wrap { min-width:0; max-width:100%; overflow-x:auto; }", output)
        self.assertIn("overflow-x:auto", output)

    def test_diagram_min_width_scales_from_viewbox_and_text_size(self) -> None:
        cases = ((1000, 10, 1200), (500, 20, 500))
        for viewbox_width, font_size, expected_width in cases:
            with self.subTest(viewbox_width=viewbox_width, font_size=font_size):
                svg = (
                    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {viewbox_width} 100">'
                    f'<text font-size="{font_size}">Scaled label</text></svg>'
                )
                output = render_review({"views": [{"label": "Scaled", "svg": svg}]})

                self.assertIn(f"width:max(100%, {expected_width}px)", output)
                self.assertIn(f"min-width:{expected_width}px", output)

    def test_external_svg_links_are_rejected(self) -> None:
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">'
            '<a xlink:href="https://example.invalid/model"><text>External</text></a>'
            "</svg>"
        )
        output = render_review({"views": [{"label": "External", "svg": svg}]})

        self.assertIn("active or external content", output)
        self.assertNotIn("data:image/svg+xml;base64,", output)
        self.assertNotIn("https://example.invalid", output)

    def test_svg_doctype_and_entities_are_rejected(self) -> None:
        svg = '<!DOCTYPE svg [<!ENTITY unsafe "unsafe">]><svg><text>&unsafe;</text></svg>'
        output = render_review({"views": [{"label": "DTD", "svg": svg}]})

        self.assertIn("invalid XML or disallowed entities", output)
        self.assertNotIn("data:image/svg+xml;base64,", output)
        self.assertNotIn("unsafe", output)


if __name__ == "__main__":
    unittest.main()
