import { handlers } from "@/auth";
import { initSchema } from "@/lib/db";

function withSchema<T extends unknown[]>(handler: (...args: T) => Promise<Response>) {
  return async (...args: T) => {
    await initSchema();
    return handler(...args);
  };
}

export const GET = withSchema(handlers.GET);
export const POST = withSchema(handlers.POST);
