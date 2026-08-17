# Agent instructions

## Git permission gate (non-negotiable)

Git operations (`git add`, `git commit`, `git tag`, `git push`, `git push --tags`, `git tag -d`, `git push origin --delete`) are **forbidden by default**. They require the user's **explicit, literal** authorization first — every single time, including after long multi-step tasks.

**Only these authorize git** (or an unambiguous equivalent):
- `sí`
- `commit y push`
- `haz commit y push`
- `commit` / `push` — only when they clearly answer "¿Commit y push?"

**These do NOT authorize git** — they only approve the code changes:
- `continua`, `adelante`, `adelante con los cambios`, `vale`, `ok`, `perfecto`, `dale`, `yes`, `go ahead`

Rules:
- Making code changes does **NOT** imply git permission. Code approval and git approval are separate.
- Ask "¿Commit y push?" and treat the answer as **DENIED** unless it is a literal authorization above.
- If the answer is ambiguous, re-ask. Never interpret a vague continuation as git permission.
- If you already committed/pushed without permission, stop and tell the user immediately; do not hide it.

## Versioning rule

Every time the user asks to **commit and push**, bump the minor version first:

- `frontend/utils/constants.ts` → `APP_VERSION`
- `frontend/package.json` → `version`

Increment pattern: `1.0` → `1.1` → `1.2` → … until the user says to move to the next major version (e.g. `2.0`).

## Commit and push procedure

After bumping the version, run the following commands in order:

```bash
git add -A
git commit -m "<message>"
git tag v<NEW_VERSION>
git push && git push --tags
```

Pushing the tag triggers the GitHub Actions workflow (`.github/workflows/docker-publish.yml`), which builds and pushes the Docker image to **GitHub Container Registry** with both the version tag (`ghcr.io/jo3l/transmule:1.x`) and `latest`. No extra secrets needed — it uses the built-in `GITHUB_TOKEN`.

## Tag housekeeping

After each `git push --tags`, clean up old tags to keep only the latest 2:

```bash
# Capture the tags to delete (all but the two most recent) BEFORE deleting,
# so the same list can be pushed for remote deletion afterwards.
TAGS_TO_DELETE=$(git tag -l | sort -V | head -n -2)
# Delete them locally
[ -n "$TAGS_TO_DELETE" ] && echo "$TAGS_TO_DELETE" | xargs -r git tag -d
# Delete them on the remote
[ -n "$TAGS_TO_DELETE" ] && git push origin --delete $TAGS_TO_DELETE
```

This prevents tag bloat on the repository and keeps the tag list useful. The two most recent tags are always retained so the Docker CI can still build from the previous tag if needed.
