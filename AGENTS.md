# Copilot / Agent instructions

## Versioning rule

Every time the user asks to **commit and push**, bump the minor version first:

- `frontend/utils/constants.ts` → `APP_VERSION`
- `frontend/package.json` → `version`

Increment pattern: `1.0` → `1.1` → `1.2` → … until the user says to move to the next major version (e.g. `2.0`).
