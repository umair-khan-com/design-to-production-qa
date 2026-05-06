import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { getJwtSecret } from "./auth";
import { registerRoutes } from "./routes";

export async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: getJwtSecret() });
  await registerRoutes(app);

  return app;
}

