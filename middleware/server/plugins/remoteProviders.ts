/**
 * Nitro plugin to initialize remote providers at startup
 */
import { ProviderRegistry } from "../utils/remoteProvider";
import { SmbProvider } from "../utils/smbProvider";
import { WebdavProvider } from "../utils/webdavProvider";

export default defineNitroPlugin(() => {
  // Register providers
  ProviderRegistry.register("smb", SmbProvider);
  ProviderRegistry.register("webdav", WebdavProvider);
  
  console.log("[providers] Remote providers registered:", ProviderRegistry.getSupportedTypes());
});
