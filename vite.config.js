import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/* Runs the /api serverless handlers inside the Vite dev server so
   `npm run dev` behaves like a deploy. In production Vercel serves
   /api/*.js directly and this plugin is not involved. */
function devApi(env) {
  return {
    name: "dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith("/api/")) return next();

        const route = req.url.split("?")[0].replace(/\/$/, "");
        const file = `.${route}.js`;

        let handler;
        try {
          handler = (await server.ssrLoadModule(file)).default;
        } catch (e) {
          return next();
        }

        let raw = "";
        for await (const chunk of req) raw += chunk;

        const shimReq = {
          method: req.method,
          headers: req.headers,
          body: raw ? JSON.parse(raw) : {},
        };
        const shimRes = {
          statusCode: 200,
          status(code) {
            this.statusCode = code;
            return this;
          },
          json(obj) {
            res.statusCode = this.statusCode;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(obj));
          },
          setHeader: (k, v) => res.setHeader(k, v),
          end: (body) => {
            res.statusCode = this.statusCode || 200;
            res.end(body);
          },
        };

        for (const key of ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"]) {
          if (env[key] && !process.env[key]) process.env[key] = env[key];
        }

        try {
          await handler(shimReq, shimRes);
        } catch (e) {
          console.error("dev-api error", e);
          if (!res.writableEnded) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "dev-api handler threw" }));
          }
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return { plugins: [react(), devApi(env)] };
});
