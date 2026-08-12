import { auth } from "@/lib/auth/server";

const handler = auth.handler();

type RouteContext = { params: Promise<{ path: string[] }> };

async function rejectPublicRegistration(context: RouteContext) {
  const { path } = await context.params;
  return path.join("/") === "sign-up/email";
}

export const GET = handler.GET;
export const PUT = handler.PUT;
export const PATCH = handler.PATCH;
export const DELETE = handler.DELETE;

export async function POST(request: Request, context: RouteContext) {
  if (await rejectPublicRegistration(context)) {
    return Response.json(
      { error: "Accounts are created by a MoonRift Media administrator." },
      { status: 403 },
    );
  }
  return handler.POST(request, context);
}
