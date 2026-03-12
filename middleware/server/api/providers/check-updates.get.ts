/**
 * GET /api/providers/check-updates
 *
 * For every installed plugin that exposes `meta.repository` (a URL to a
 * repository manifest JSON), fetches the manifest and compares the available
 * version to the installed version.
 *
 * Returns: UpdateInfo[]
 */
import { getAllProviders, ensureProviders } from "../../providers/loader";
import { fetchTextSafe } from "../../utils/plugin-url";

export interface UpdateInfo {
  id: string;
  name: string;
  installedVersion: string;
  latestVersion: string;
  url: string;
  hasUpdate: boolean;
}

export default defineEventHandler(async (event) => {
  requireUser(event);

  await ensureProviders();
  const providers = getAllProviders();

  // Only check plugins that declare meta.repository
  const candidates = providers.filter(
    (p) =>
      typeof (p.meta as any).repository === "string" &&
      (p.meta as any).repository,
  );

  const results = await Promise.allSettled(
    candidates.map(async (p): Promise<UpdateInfo> => {
      const meta = p.meta as any;
      const installedVersion = meta.version ?? "0.0.0";
      const repoUrl: string = meta.repository;

      const text = await fetchTextSafe(repoUrl);
      let manifest: any;
      try {
        manifest = JSON.parse(text);
      } catch {
        throw new Error("Invalid JSON");
      }

      const entry = (manifest?.plugins ?? []).find(
        (e: any) => e.id === p.meta.id,
      );
      const latestVersion = entry?.version ?? installedVersion;
      const pluginUrl = entry?.url ?? "";

      return {
        id: p.meta.id,
        name: p.meta.name,
        installedVersion,
        latestVersion,
        url: pluginUrl,
        hasUpdate: _isNewer(latestVersion, installedVersion),
      };
    }),
  );

  return results
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<UpdateInfo>).value);
});

function _isNewer(a: string, b: string): boolean {
  const parse = (v: string) =>
    String(v)
      .replace(/^v/, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const va = parse(a);
  const vb = parse(b);
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const an = va[i] ?? 0;
    const bn = vb[i] ?? 0;
    if (an > bn) return true;
    if (an < bn) return false;
  }
  return false;
}
