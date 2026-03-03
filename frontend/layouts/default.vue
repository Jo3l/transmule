<template>
  <div id="layout-default" class="app-layout">
    <LazyAppSidebar :open="sidebarOpen" @close="sidebarOpen = false" />

    <div class="app-main">
      <div class="app-topbar">
        <div class="flex-center gap-md">
          <SButton
            size="sm"
            class="is-hidden-tablet"
            @click="sidebarOpen = !sidebarOpen"
          >
            <span class="mdi mdi-menu" />
          </SButton>
          <LazyConnectionStatus class="is-hidden-mobile" />
        </div>

        <div class="flex-center gap-md">
          <LazyServiceDropdown />
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
  </div>
</template>

<script setup lang="ts">
const sidebarOpen = ref(false);
const auth = useAuth();
const user = auth.user;

function doLogout() {
  auth.clear();
  navigateTo("/login");
}
</script>
