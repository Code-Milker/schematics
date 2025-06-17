import { serve } from "bun";
import { createUser } from "./db.user";

const server = serve({
  port: 3000,
  routes: {
    "/users": async (req) => {
      const method = req.method;

      // POST /users
      if (method === "POST") {
        try {
          const body = await req.json();
          const result = await createUser.execute(body);
          if (result.err) {
            return Response.json(result.err, { status: 400 });
          }
          return Response.json(result.res, { status: 201 });
        } catch (error) {
          return Response.json({ message: "Invalid JSON" }, { status: 400 });
        }
      }

      // GET /users
      if (method === "GET") {
      }

      // Method not allowed
      return Response.json({ message: "Method Not Allowed" }, { status: 405 });
    },
  },
  fetch(req) {
    // Fallback for unmatched routes
    return Response.json({ message: "Not Found" }, { status: 404 });
  },
});
