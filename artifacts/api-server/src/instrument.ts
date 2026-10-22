// Imported first by every entry point so monitoring starts before the HTTP
// server and other modules load.
import { initMonitoring } from "./lib/monitoring";

initMonitoring(process.env.SENTRY_SERVICE ?? "api");
