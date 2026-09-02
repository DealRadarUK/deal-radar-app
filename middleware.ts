import { NextRequest, NextResponse } from "next/server";

/**
 * Simple HTTP Basic Auth for the whole app.
 *
 * Every request (pages AND API routes) has to present the username/password
 * set in APP_BASIC_AUTH_USER / APP_BASIC_AUTH_PASSWORD before it's allowed
 * through. The browser handles this with its native login prompt — there's
 * no login page to build or session cookies to manage, which is the right
 * amount of security for a single-founder internal tool.
 *
 * If you outgrow this later (e.g. multiple team members who each need their
 * own login), swap this file out for NextAuth — everything else in the app
 * is unaffected since auth is fully isolated here.
 */

function isAuthorized(req: NextRequest): boolean {
  const user = process.env.APP_BASIC_AUTH_USER;
  const pass = process.env.APP_BASIC_AUTH_PASSWORD;

  // If no credentials are configured, fail closed (deny) rather than
  // silently leaving the app open — this is meant to catch a missed env
  // var during deploy, not to be a way to "turn auth off".
  if (!user || !pass) return false;

  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Basic ")) return false;

  // Middleware runs on Vercel's Edge Runtime, not Node — Node's `Buffer`
  // isn't reliably available there, so we use the Web-standard atob()
  // instead (available in both the Edge Runtime and modern Node).
  let decoded: string;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) return false;

  const suppliedUser = decoded.slice(0, separatorIndex);
  const suppliedPass = decoded.slice(separatorIndex + 1);

  return suppliedUser === user && suppliedPass === pass;
}

// Routes that deliberately bypass Basic Auth:
//  - /api/telegram/webhook: Telegram calls this directly and can't present a
//    username/password. It's secured a different way instead — a secret
//    token Telegram sends with every request, checked inside the route
//    itself (see app/api/telegram/webhook/route.ts).
//  - /api/public/deals: the whole point of this endpoint is that your
//    public website's widget can read it with no login, from any visitor's
//    browser. It only ever returns deals you've already approved — nothing
//    private.
const PUBLIC_PATHS = ["/api/telegram/webhook", "/api/public/deals"];

export function middleware(req: NextRequest) {
  if (PUBLIC_PATHS.some((path) => req.nextUrl.pathname.startsWith(path))) {
    return NextResponse.next();
  }

  if (isAuthorized(req)) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Deal Radar UK", charset="UTF-8"',
    },
  });
}

export const config = {
  // Protect everything except Next.js's own static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
