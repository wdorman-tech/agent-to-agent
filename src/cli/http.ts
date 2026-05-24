export interface LocalClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  del<T>(path: string): Promise<T>;
}

export function makeClient(baseUrl: string, token?: string | null): LocalClient {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`${method} ${path} → HTTP ${res.status}: ${text.slice(0, 400)}`);
    }
    if (!text) return undefined as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`${method} ${path} returned non-JSON body`);
    }
  }
  return {
    get: <T>(p: string) => request<T>('GET', p),
    post: <T>(p: string, body?: unknown) => request<T>('POST', p, body ?? {}),
    del: <T>(p: string) => request<T>('DELETE', p),
  };
}

export function baseUrlFromConfig(host: string, port: number): string {
  const h = host === '0.0.0.0' ? '127.0.0.1' : host;
  return `http://${h}:${port}`;
}
