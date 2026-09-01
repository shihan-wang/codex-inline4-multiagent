# Collaboration rules

- Work only inside this project directory. Do not inspect or reuse engine implementations elsewhere.
- Keep geometry procedural and editable; do not import complete engine models.
- Use the contracts in `docs/SHARED_CONTRACTS.md` as the integration boundary.
- One animation source of truth: crank angle in radians, increasing in the engine's positive rotation direction.
- Do not overwrite unrelated changes. Prefer additive modules and coordinate before modifying shared entry files.
- Run type checking/build after material changes and report exact issues rather than hiding them.

