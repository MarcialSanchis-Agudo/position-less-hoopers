# Security

PLH coordinates agents but should not grant authority implicitly.

Integrations should:

- separate model reasoning from deterministic commit authority,
- use least privilege for tools and external systems,
- scope mutation permissions,
- avoid secrets in manifests/traces,
- avoid publishing private prompts or repository content,
- validate stale-state and conflict conditions at commit boundaries.

Report security-sensitive issues privately to the repository owner rather than posting exploit details publicly.

