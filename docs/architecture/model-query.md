# Model Query Contract

- Schema: `1`
- Workbench Protocol: `0.2.0`
- Protocol method: `model/query`
- Input authority: normalized semantic snapshot
- Product status: Phase 2 bounded containment query

## Query

```yaml
schemaVersion: 1
roots:
  - Phase1Sample::Vehicle
relationships:
  - containment
depth: 3
filters:
  includeKinds:
    - PartDefinition
    - PortUsage
  nameContains: command
maxResults: 1000
```

Roots may be durable identities or exact qualified names. A missing or
ambiguous qualified name fails visibly. Duplicate roots resolve once.

Traversal occurs before filters. Filters select returned elements; a
relationship is returned only when both endpoints remain in the result.
Elements and relationships are identity-sorted, making equivalent requests
deterministic.

## Bounds

- at most 100 roots;
- each root is a non-empty string of at most 1,024 characters;
- depth is an integer from 0 through 20;
- `maxResults` is an integer from 1 through 10,000;
- name filters are non-empty and at most 256 characters;
- element kinds must be members of the normalized schema;
- schema 1 accepts only qualified `containment`.

When matching elements exceed `maxResults`, the result is deterministically
truncated and contains an explicit warning. It never silently broadens a query
or invents a relationship.

## Result

Every result identifies the input `snapshotSha256`, resolved durable root
identities, normalized elements, qualified relationships, truncation state, and
warnings. Consumers can therefore cite the exact semantic input used to produce
a diagram, matrix, report, or AI answer.

## Deferred schema work

Typing, reference, import/dependency, connection, flow, requirement,
verification, and interface traversal remain unavailable until those
relationships exist in the normalized snapshot with authority provenance.
Saved view configuration and projection-specific layout are separate contracts.
