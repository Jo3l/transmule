<template>
  <div id="layout-default" class="app-layout">
    <LazyAppSidebar :open="sidebarOpen" @close="sidebarOpen = false" />
    <Transition name="sidebar-backdrop">
      <div v-if="sidebarOpen" class="sidebar-backdrop" @click="sidebarOpen = false" />
    </Transition>

    <div class="app-main">
      <div class="app-topbar">
        <div class="flex-center gap-md">
          <SButton size="sm" class="is-hidden-tablet" @click="sidebarOpen = !sidebarOpen">
            <span class="mdi mdi-menu" />
          </SButton>
          <LazyConnectionStatus class="is-hidden-mobile" />
        </div>

        <div class="flex-center gap-md">
          <ClientOnly>
            <LazyDiskUsageWidget />
          </ClientOnly>
          <LazyServiceDropdown />
          <!-- Transfer jobs systray -->
          <ClientOnly>
            <LazyTransferSystray />
          </ClientOnly>
          <span class="has-text-grey-dark is-size-7">
            <STag size="sm" class="ml-1">
              <span class="mdi mdi-account" /> {{ user?.username }}
            </STag>
          </span>
          <SButton size="sm" @click="doLogout">
            <span class="mdi mdi-logout" />
          </SButton>
        </div>
      </div>

      <div class="app-content">
        <slot />
      </div>
    </div>

    <LazySToastContainer />

    <!-- ── Webamp — mounted here so it persists across route changes ── -->
    <ClientOnly>
      <Webamp v-if="webampTrack" :key="webampKey" :track="webampTrack" />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
const sidebarOpen = ref(false);
const auth = useAuth();
const user = auth.user;

// Ensure transfer job polling resumes after page refresh
useTransferJobs();

// Check for newer version on GitHub
useVersionCheck();

// Global Webamp state — persists across route changes
const { webampTrack, webampKey } = useWebamp();

function doLogout() {
  auth.clear();
  navigateTo("/login");
}
</script>
