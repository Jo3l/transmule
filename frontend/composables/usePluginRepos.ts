/**
 * Composable for managing plugin repositories.
 */

export interface PluginRepo {
  id: number;
  url: string;
  name: string | null;
  added_at: string;
}

export interface RepoPluginEntry {
  id: string;
  name: string;
  version: string;
  description?: string;
  pluginType?: string;
  icon?: string;
  url: string;
  installed: boolean;
  hasUpdate: boolean;
  installedVersion?: string | null;
}

export interface RepoPluginsResult {
  name: string;
  plugins: RepoPluginEntry[];
}

export function usePluginRepos() {
  const { apiFetch } = useApi();

  const repos = ref<PluginRepo[]>([]);
  const reposLoading = ref(false);

  async function loadRepos(): Promise<void> {
    reposLoading.value = true;
    try {
      repos.value = (await apiFetch<PluginRepo[]>("/api/plugin-repos")) ?? [];
    } catch {
      /* silent */
    } finally {
      reposLoading.value = false;
    }
  }

  async function addRepo(url: string): Promise<PluginRepo> {
    const repo = await apiFetch<PluginRepo>("/api/plugin-repos", {
      method: "POST",
      body: { url },
    });
    repos.value = [...repos.value, repo];
    return repo;
  }

  async function removeRepo(id: number): Promise<void> {
    await apiFetch(`/api/plugin-repos/${id}`, { method: "DELETE" });
    repos.value = repos.value.filter((r) => r.id !== id);
  }

  async function fetchRepoPlugins(repoId: number): Promise<RepoPluginsResult> {
    return apiFetch<RepoPluginsResult>(`/api/plugin-repos/${repoId}/plugins`);
  }

  return {
    repos,
    reposLoading,
    loadRepos,
    addRepo,
    removeRepo,
    fetchRepoPlugins,
  };
}
