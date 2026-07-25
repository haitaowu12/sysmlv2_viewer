# Troubleshooting

| Symptom | Action |
|---|---|
| Bundle integrity failure | Replace the whole installation. Do not patch individual files. |
| Pairing rejected | Reload the loopback page and use the newest code within two minutes. |
| Session expired | Pair again; sessions are intentionally short-lived. |
| Workspace path rejected | Start the service with the intended project root and remove source-root symlinks. |
| Runtime hash mismatch | Use the exact locked engine binaries; do not override the lock. |
| `failed · control-only` | The qualified runtime did not start. This is not a usable authoring authority. |
| Stale command proposal | Regenerate after external or concurrent source changes. |
| Stale review finding | Inspect the cited identity; the anchor was changed or deleted since baseline. |
| Missing interface attributes | The semantic profile cannot prove them; add source semantics or record the limitation. |
| AI citation rejected | The provider named an identity absent from the current snapshot. |
| Report differs | Compare commit, baseline, release, rule pack, view configuration, diagnostics, and exclusions in its manifest. |

Logs are content-minimized. Do not paste model source, credentials, pairing
codes, bearer tokens, audit records, or proprietary report contents into
external issue trackers.
