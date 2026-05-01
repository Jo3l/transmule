/**
 * Initialize and register all remote providers.
 * This file should be imported once at application startup.
 */

import { ProviderRegistry } from "./remoteProvider";
import { SmbProvider } from "./smbProvider";
import { WebdavProvider } from "./webdavProvider";

// Register all providers
ProviderRegistry.register("smb", SmbProvider);
ProviderRegistry.register("webdav", WebdavProvider);

/**
 * Call this function to ensure all providers are registered.
 * Safe to call multiple times.
 */
let initialized = false;
export function initProviders() {
  if (initialized) return;
  // Providers are already registered via static initialization above
  initialized = true;
}

// Auto-initialize when this module is imported
initProviders();
