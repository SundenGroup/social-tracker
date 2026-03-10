import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import type { Session } from "next-auth";

interface ApiHandlerOptions {
  requireAuth?: boolean;
  requireAdmin?: boolean;
}

type ApiHandlerFn = (
  req: Request,
  session: Session | null
) => Promise<NextResponse>;

export function apiHandler(
  handler: ApiHandlerFn,
  options: ApiHandlerOptions = {}
) {
  return async (req: Request) => {
    const start = Date.now();
    const { method } = req;
    const url = new URL(req.url);

    try {
      let session: Session | null = null;

      if (options.requireAuth || options.requireAdmin) {
        session = await auth();

        if (!session?.user) {
          console.log(
            `[API] ${method} ${url.pathname} - 401 (${Date.now() - start}ms)`
          );
          return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 }
          );
        }

        if (options.requireAdmin && session.user.role !== "admin") {
          console.log(
            `[API] ${method} ${url.pathname} - 403 (${Date.now() - start}ms)`
          );
          return NextResponse.json(
            { error: "Insufficient permissions" },
            { status: 403 }
          );
        }
      }

      const response = await handler(req, session);

      console.log(
        `[API] ${method} ${url.pathname} - ${response.status} (${Date.now() - start}ms)`
      );

      return response;
    } catch (error) {
      const duration = Date.now() - start;

      if (error instanceof AppError) {
        console.log(
          `[API] ${method} ${url.pathname} - ${error.statusCode} (${duration}ms)`
        );
        return NextResponse.json(
          { error: error.message },
          { status: error.statusCode }
        );
      }

      console.error(
        `[API] ${method} ${url.pathname} - 500 (${duration}ms)`,
        error
      );
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}
