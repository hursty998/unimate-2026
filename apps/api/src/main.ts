import "reflect-metadata";
import { createApiApplication } from "./app.js";
import { parseApiConfig } from "./config/environment.js";

const config = parseApiConfig();
const app = await createApiApplication(config);

await app.listen(config.port, config.host);
