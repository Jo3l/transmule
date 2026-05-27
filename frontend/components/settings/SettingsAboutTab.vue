<template>
  <div class="box">
    <div class="about-layout">
      <!-- Left: canvas scene -->
      <div class="about-scene-wrap">
        <canvas ref="aboutSceneRef" class="about-scene" :data-scroll-text="scrollText" />
        <button
          class="about-mute-btn"
          :title="muted ? $t('settings.unmute') : $t('settings.mute')"
          @click="toggleMute"
        >
          <span class="mdi" :class="muted ? 'mdi-volume-off' : 'mdi-volume-high'" />
        </button>
      </div>

      <!-- Right: GitHub project card -->
      <div class="about-gh-card">
        <template v-if="ghData">
          <div class="gh-card-header">
            <img
              v-if="ghData.owner?.avatar_url"
              :src="ghData.owner.avatar_url"
              class="gh-avatar"
              alt=""
            />
            <div class="gh-card-title">
              <a
                :href="ghData.html_url"
                target="_blank"
                rel="noopener noreferrer"
                class="gh-repo-link"
              >
                <span class="mdi mdi-github mr-1" />{{ ghData.full_name }}
              </a>
              <span class="gh-visibility-tag" v-if="ghData.visibility">{{
                ghData.visibility
              }}</span>
            </div>
          </div>

          <p class="gh-description">{{ ghData.description }}</p>

          <div class="gh-stats-row">
            <span class="gh-stat" :title="$t('settings.stars')">
              <span class="mdi mdi-star" /> {{ formatNum(ghData.stargazers_count) }}
            </span>
            <span class="gh-stat" :title="$t('settings.forks')">
              <span class="mdi mdi-source-fork" /> {{ formatNum(ghData.forks_count) }}
            </span>
            <span class="gh-stat" :title="$t('settings.openIssues')">
              <span class="mdi mdi-alert" /> {{ formatNum(ghData.open_issues_count) }}
            </span>
          </div>

          <div class="gh-meta-row" v-if="ghData.language || ghData.license">
            <span v-if="ghData.language" class="gh-meta">
              <span class="gh-lang-dot" :style="{ background: langColor(ghData.language) }" />
              {{ ghData.language }}
            </span>
            <span v-if="ghData.license" class="gh-meta">
              <span class="mdi mdi-scale-balance mr-1" />{{ ghData.license.spdx_id }}
            </span>
          </div>

          <div class="gh-footer">
            <div class="gh-footer-left">
              <span class="gh-updated">
                <span class="mdi mdi-clock-outline mr-1" />{{
                  $t("settings.updatedTimeAgo", { time: timeAgo(ghData.updated_at) })
                }}
              </span>
              <iframe
                src="https://ghbtns.com/github-btn.html?user=jo3l&repo=transmule&type=star&count=true"
                frameborder="0"
                scrolling="0"
                width="150"
                height="20"
                title="Star"
                class="gh-star-btn"
              />
            </div>
            <a
              :href="ghData.html_url"
              target="_blank"
              rel="noopener noreferrer"
              class="gh-view-btn"
            >
              {{ $t("settings.viewOnGitHub") }}
              <span class="mdi mdi-open-in-new ml-1" />
            </a>
          </div>
        </template>

        <div v-else-if="ghError" class="has-text-danger is-size-7">{{ ghError }}</div>
        <div v-else class="has-text-grey is-size-7">{{ $t("settings.loading") }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { init as initSceneAbout } from "~/assets/scenes/scene-about.js";

const { t } = useI18n();

const route = useRoute();
const isAboutTab = computed(() => route.hash === "#about");

const aboutSceneRef = ref<HTMLCanvasElement | null>(null);
const muted = ref(true);
let sceneCtrl: {
  destroy: () => void;
  toggleMusic: () => void;
  isMusicPlaying: () => boolean;
} | null = null;
const scrollText = ref(
  "hello! i hope you find this app useful. thanks for using it and remember to give it a star on github if you like it!",
);

function startAboutScene() {
  stopAboutScene();
  if (!aboutSceneRef.value) return;
  sceneCtrl = initSceneAbout(aboutSceneRef.value) as any;
  // Start muted by default
  muted.value = true;
  sceneCtrl?.toggleMusic();
}

function stopAboutScene() {
  sceneCtrl?.destroy();
  sceneCtrl = null;
}

function toggleMute() {
  sceneCtrl?.toggleMusic();
  muted.value = !sceneCtrl?.isMusicPlaying();
}

watch(isAboutTab, (isActive) => {
  if (isActive) {
    nextTick(() => startAboutScene());
  } else {
    stopAboutScene();
  }
});

onMounted(() => {
  if (window.location.hash === "#about") {
    startAboutScene();
  }
});

// ── GitHub repo info ────────────────────────────────────────────────────────
const ghData = ref<any>(null);
const ghError = ref("");
const ghLoading = ref(false);

onMounted(async () => {
  ghLoading.value = true;
  ghError.value = "";
  try {
    const res = await fetch("https://api.github.com/repos/jo3l/transmule");
    if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
    ghData.value = await res.json();
  } catch (e: any) {
    ghError.value = e.message || "Failed to fetch repo info";
  } finally {
    ghLoading.value = false;
  }
});

function formatNum(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("settings.justNow");
  if (mins < 60) return t("settings.minutesAgo", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("settings.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t("settings.daysAgo", { count: days });
  const months = Math.floor(days / 30);
  return t("settings.monthsAgo", { count: months });
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  CSS: "#563d7c",
  HTML: "#e34c26",
  Vue: "#41b883",
  SCSS: "#c6538c",
  Shell: "#89e051",
  Dockerfile: "#384d54",
};

function langColor(lang: string): string {
  return LANG_COLORS[lang] || "#6b7280";
}
</script>

<style scoped>
.about-layout {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
}

.about-scene-wrap {
  flex-shrink: 0;
  max-width: 640px;
  width: 50%;
  position: relative;
}

.about-scene {
  width: 100%;
  aspect-ratio: 4/3;
  border-radius: 6px;
  image-rendering: pixelated;
}

.about-mute-btn {
  position: absolute;
  bottom: 6px;
  right: 6px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  font-size: 1rem;
  transition:
    background 0.15s,
    color 0.15s;
}

.about-mute-btn:hover {
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
}

@media (max-width: 768px) {
  .about-layout {
    flex-direction: column;
  }
  .about-scene-wrap {
    width: 100%;
  }
}

/* ── GitHub card ──────────────────────────────────────────────────────────── */
.about-gh-card {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--s-border);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  background: var(--s-bg-card, var(--s-bg-surface));
}

.gh-card-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.6rem;
}

.gh-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  flex-shrink: 0;
}

.gh-card-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  min-width: 0;
}

.gh-repo-link {
  font-size: 0.95rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--s-accent);
  text-decoration: none;
}

.gh-repo-link:hover {
  text-decoration: underline;
}

.gh-visibility-tag {
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.15em 0.45em;
  border: 1px solid var(--s-border);
  border-radius: 3px;
  color: var(--s-text-muted);
}

.gh-description {
  font-size: 0.82rem;
  color: var(--s-text-secondary);
  margin-bottom: 0.75rem;
  line-height: 1.4;
}

.gh-stats-row {
  display: flex;
  gap: 1rem;
  margin-bottom: 0.5rem;
  font-size: 0.8rem;
}

.gh-stat {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--s-text-muted);
}

.gh-meta-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.78rem;
  color: var(--s-text-muted);
  margin-bottom: 0.75rem;
}

.gh-meta {
  display: inline-flex;
  align-items: center;
}

.gh-lang-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 0.3rem;
  display: inline-block;
  flex-shrink: 0;
}

.gh-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--s-border);
}

.gh-footer-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.gh-star-btn {
  display: inline-block;
  vertical-align: middle;
}

.gh-updated {
  font-size: 0.72rem;
  color: var(--s-text-muted);
  display: inline-flex;
  align-items: center;
}

.gh-view-btn {
  font-size: 0.78rem;
  display: inline-flex;
  align-items: center;
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--s-border);
  border-radius: 5px;
  color: var(--s-text);
  text-decoration: none;
  transition: background 0.15s;
}

.gh-view-btn:hover {
  background: var(--s-table-hover-bg, rgba(128, 128, 128, 0.08));
}
</style>
