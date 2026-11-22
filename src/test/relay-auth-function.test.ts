import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type GlobalWithProcess = { process?: { env: Record<string, string | undefined> } };

function env(): Record<string, string | undefined> {
  const holder = globalThis as unknown as GlobalWithProcess;
  if (!holder.process) holder.process = { env: {} };
  return holder.process.env;
}

function login(payload: unknown, ip = '1.2.3.4'): Request {
  return new Request('https://breadcrumbapp.netlify.app/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': ip },
    body: JSON.stringify(payload),
  });
}

interface HandlerModule {
  default: (request: Request) => Promise<Response>;
}

describe('relay password gate', () => {
  let auth: HandlerModule;

  beforeEach(async () => {
    // Fresh instance each test: the attempt counter is module state.
    vi.resetModules();
    auth = (await import('../../netlify/functions/relay-auth.mts')) as unknown as HandlerModule;
    env().APP_PASSWORD = 'hunter2';
  });

  afterEach(() => {
    delete env().APP_PASSWORD;
    vi.restoreAllMocks();
  });

  it('is closed until a password is configured', async () => {
    delete env().APP_PASSWORD;
    const response = await auth.default(login({ password: 'anything' }));
    expect(response.status).toBe(503);
  });

  it('refuses a wrong password without leaking the right one', async () => {
    const response = await auth.default(login({ password: 'hunter3' }));
    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain('hunter2');
  });

  it('refuses an empty or malformed body', async () => {
    for (const body of [{}, { password: '' }, { password: 42 }]) {
      const response = await auth.default(login(body));
      expect(response.status).toBe(401);
    }
    const broken = await auth.default(
      new Request('https://breadcrumbapp.netlify.app/api/auth/login', { method: 'POST', body: 'not json' })
    );
    expect(broken.status).toBe(401);
  });

  it('only answers POST', async () => {
    const response = await auth.default(
      new Request('https://breadcrumbapp.netlify.app/api/auth/login', { method: 'GET' })
    );
    expect(response.status).toBe(405);
  });

  it('issues an expiring token for the right password', async () => {
    const response = await auth.default(login({ password: 'hunter2' }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; token: string; expiresAt: number };
    expect(body.ok).toBe(true);
    expect(body.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });

  it('throttles repeated guessing from one address', async () => {
    let last: Response | null = null;
    for (let i = 0; i < 10; i += 1) {
      last = await auth.default(login({ password: `guess-${i}` }, '9.9.9.9'));
    }
    expect(last?.status).toBe(429);
    // A different address still gets a fair shot.
    const other = await auth.default(login({ password: 'hunter2' }, '5.5.5.5'));
    expect(other.status).toBe(200);
  });

  it('clears the counter after a successful sign-in', async () => {
    await auth.default(login({ password: 'nope' }, '7.7.7.7'));
    await auth.default(login({ password: 'hunter2' }, '7.7.7.7'));
    const after = await auth.default(login({ password: 'nope' }, '7.7.7.7'));
    expect(after.status).toBe(401);
  });
});
