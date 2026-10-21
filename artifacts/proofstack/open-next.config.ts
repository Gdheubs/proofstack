import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Pages render per request (no ISR/data cache), so no cache bindings are needed.
export default defineCloudflareConfig();
