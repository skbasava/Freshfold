import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type {
  InternalContext,
  LoginResponse,
  SessionResponse,
} from "../../../packages/contracts/src/auth";
import {
  internalContextSchema,
  loginRequestSchema,
} from "../../../packages/contracts/src/auth";
import {
  CSRF_COOKIE,
  CSRF_HEADER,
} from "../../../packages/contracts/src/http";
import {
  createLogger,
  safeError,
} from "../../../packages/shared/src/observability";
import {
  hashPassword,
  verifyPassword,
  type StoredPassword,
} from "./password";
import {
  createSession,
  findSessionByTokenHash,
  findUserByEmail,
  listMemberships,
  revokeSession,
  type SessionRecord,
} from "./store";
import {
  generateToken,
  hashToken,
  timingSafeStringEqual,
} from "./tokens";

export const SESSION_COOKIE = "laundry_session";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const DUMMY_PASSWORD: StoredPassword = {
  hash: "6vmV5gEuS-Xjt6WEQOAW70JM5VnReXrgQGw8JXWiF8I",
  salt: "nywdTmqLDD1ef5AS",
  iterations: 600_000,
};

export type AuthBindings = {
  AUTH_DB: D1Database;
  ENVIRONMENT?: string;
};

type AuthVariables = {
  requestId: string;
};

type AuthDependencies = {
  now: () => number;
};

type AuthContext = Context<{
  Bindings: AuthBindings;
  Variables: AuthVariables;
}>;

export function createAuthApp(
  dependencies: AuthDependencies = { now: Date.now },
) {
  const app = new Hono<{
    Bindings: AuthBindings;
    Variables: AuthVariables;
  }>();

  app.use("*", async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
    c.set("requestId", requestId);
    c.header("x-request-id", requestId);
    c.header("cache-control", "no-store");
    await next();
  });

  app.get("/health", (c) =>
    c.json({ status: "ok" as const, service: "auth" }),
  );

  app.post("/login", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_request" }, 400);
    }

    const parsed = loginRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_request" }, 400);
    }

    const user = await findUserByEmail(c.env.AUTH_DB, parsed.data.email);
    if (!user) {
      await verifyPassword(parsed.data.password, DUMMY_PASSWORD);
      return c.json({ error: "invalid_credentials" }, 401);
    }

    const passwordMatches = await verifyPassword(parsed.data.password, {
      hash: user.passwordHash,
      salt: user.passwordSalt,
      iterations: user.passwordIterations,
    });
    if (!passwordMatches) {
      return c.json({ error: "invalid_credentials" }, 401);
    }

    const memberships = await listMemberships(c.env.AUTH_DB, user.id);
    const membership = parsed.data.hubId
      ? memberships.find((candidate) => candidate.hubId === parsed.data.hubId)
      : memberships[0];

    if (!membership) {
      return c.json({ error: "hub_not_allowed" }, 403);
    }

    const previousToken = getCookie(c, SESSION_COOKIE);
    if (previousToken) {
      await revokeSession(
        c.env.AUTH_DB,
        await hashToken(previousToken),
        dependencies.now(),
      );
    }

    const token = generateToken();
    const csrfToken = generateToken();
    const createdAt = dependencies.now();
    const expiresAt = createdAt + SESSION_TTL_MS;

    await createSession(c.env.AUTH_DB, {
      tokenHash: await hashToken(token),
      userId: user.id,
      tenantId: membership.tenantId,
      hubId: membership.hubId,
      csrfHash: await hashToken(csrfToken),
      createdAt,
      expiresAt,
    });

    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });

    setCookie(c, CSRF_COOKIE, csrfToken, {
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });

    const response: LoginResponse = {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
      hub: {
        id: membership.hubId,
        tenantId: membership.tenantId,
      },
      role: membership.role,
      csrfToken,
      expiresAt,
    };

    return c.json(response, 200);
  });

  app.get("/session", async (c) => {
    const session = await authenticate(c, dependencies.now());
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const response: SessionResponse = {
      user: {
        id: session.userId,
        email: session.email,
        displayName: session.displayName,
      },
      hub: {
        id: session.hubId,
        tenantId: session.tenantId,
      },
      role: session.role,
    };

    return c.json(response, 200);
  });

  app.get("/internal/session", async (c) => {
    const session = await authenticate(c, dependencies.now());
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const context: InternalContext = internalContextSchema.parse({
      actorId: session.userId,
      actorType: "user",
      role: session.role,
      tenantId: session.tenantId,
      hubId: session.hubId,
      exp: session.expiresAt,
    });

    return c.json(context, 200);
  });

  app.post("/logout", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) {
      clearAuthCookies(c);
      return c.body(null, 204);
    }

    const session = await findSessionByTokenHash(
      c.env.AUTH_DB,
      await hashToken(token),
    );
    if (!session) {
      clearAuthCookies(c);
      return c.body(null, 204);
    }

    const csrfToken = c.req.header(CSRF_HEADER);
    if (
      !csrfToken ||
      !timingSafeStringEqual(await hashToken(csrfToken), session.csrfHash)
    ) {
      return c.json({ error: "csrf_failed" }, 403);
    }

    await revokeSession(
      c.env.AUTH_DB,
      session.tokenHash,
      dependencies.now(),
    );
    clearAuthCookies(c);
    return c.body(null, 204);
  });

  app.notFound((c) => c.json({ error: "not_found" }, 404));

  app.onError((error, c) => {
    createLogger({
      service: "auth",
      ...(c.env.ENVIRONMENT ? { environment: c.env.ENVIRONMENT } : {}),
      requestId: c.get("requestId"),
    }).error("auth_request_failed", { error: safeError(error) });

    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}

async function authenticate(
  c: AuthContext,
  now: number,
): Promise<SessionRecord | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) {
    return null;
  }

  const session = await findSessionByTokenHash(
    c.env.AUTH_DB,
    await hashToken(token),
  );

  if (
    !session ||
    !session.isActive ||
    session.revokedAt !== null ||
    session.expiresAt <= now
  ) {
    return null;
  }

  return session;
}

function clearAuthCookies(c: AuthContext): void {
  setCookie(c, SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 0,
  });

  setCookie(c, CSRF_COOKIE, "", {
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 0,
  });
}

const app = createAuthApp();

export default app;
