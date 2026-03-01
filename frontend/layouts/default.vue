<template>
  <div class="app-layout">
    <AppSidebar :open="sidebarOpen" @close="sidebarOpen = false" />

    <div class="app-main">
      <div class="app-topbar">
        <div style="display: flex; align-items: center; gap: 0.75rem">
          <SButton
            size="sm"
            class="is-hidden-tablet"
            @click="sidebarOpen = !sidebarOpen"
          >
            <span class="mdi mdi-menu" />
          </SButton>
          <ConnectionStatus class="is-hidden-mobile" />
        </div>

        <div style="display: flex; align-items: center; gap: 0.75rem">
          <ServiceDropdown />
          <span class="has-text-grey-dark is-size-7">
            <span class="mdi mdi-account" /> {{ user?.username }}
            <STag v-if="user?.isAdmin" size="sm" class="ml-1">{{
              $t("app.admin")
            }}</STag>
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

    <SToastContainer />
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
