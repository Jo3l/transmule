# Copilot / Agent instructions

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
