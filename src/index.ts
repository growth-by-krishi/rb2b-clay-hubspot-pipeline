import { demoPage } from "./demo.js";
import { createHandler } from "./http.js";
import type { Env } from "./types.js";

const handle = createHandler({ html: demoPage });

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
};
