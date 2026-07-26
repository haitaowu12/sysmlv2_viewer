# View and Query Schema

Saved views are JSON files under `views/`:

```json
{
  "schemaVersion": 1,
  "id": "propulsion-interface-review",
  "name": "Propulsion Interface Review",
  "query": {
    "schemaVersion": 1,
    "mode": "interfaces",
    "roots": ["Vehicle::Propulsion"],
    "depth": 3,
    "maxResults": 2000
  },
  "notation": "interconnection",
  "layout": {
    "positions": {
      "wb:workspace:element": { "x": 120, "y": 80 }
    }
  },
  "updatedAt": "2026-07-25T00:00:00.000Z"
}
```

Query modes are containment, type hierarchy, dependency, neighbourhood,
requirements, verification, and interfaces. Roots resolve against stable
identity or qualified semantic name. Depth and result limits are mandatory
bounds; truncation is disclosed.

Notation and layout are projections only. Positions key stable identity and do
not change source. Source, diagram, explorer, matrix, and report views must be
reproducible from the same snapshot plus this configuration.
