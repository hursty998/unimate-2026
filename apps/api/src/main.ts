import "reflect-metadata";
import { createApiApplication } from "./app.js";
import { parseApiConfig } from "./config/environment.js";

const config = parseApiConfig();
const app = await createApiApplication(config);

app.enableShutdownHooks();
await app.listen(config.port, config.host);
