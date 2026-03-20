const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

function getToken(): string | null {
  return localStorage.getItem("access_token");
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
}

export function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

export function getRefreshToken(): string | null {
  return localStorage.getItem("refresh_token");
}

/** Attempts to refresh the access token. Returns true on success, false on failure. */
async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (refreshRes.ok) {
    const { accessToken, refreshToken: newRefresh } = await refreshRes.json();
    setTokens(accessToken, newRefresh);
    return true;
  }

  clearTokens();
  return false;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) ?? {}),
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) return request(path, options);
    window.location.href = "/login";
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const message =
      body.error ??
      (body.issues
        ? body.issues
            .map(
              (i: { message?: string; path?: unknown[] }) =>
                `${i.path?.join(".")}: ${i.message ?? "invalid"}`,
            )
            .join("; ")
        : null) ??
      "Request failed";
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export function importPlanFromAI(plan: object): Promise<{ id: string }> {
  return request<{ id: string }>("/plans/from-ai", {
    method: "POST",
    body: JSON.stringify(plan),
  });
}

async function doStreamCoach(
  conversationId: string,
  content: string,
  signal: AbortSignal,
  onChunk: (chunk: string) => void,
  onDone: (messageId: string) => void,
  onError: (err: Error) => void,
  isRetry = false,
): Promise<void> {
  const token = getToken();

  const res = await fetch(`${BASE_URL}/coach/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ content }),
    signal,
  });

  if (res.status === 401 && !isRetry) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      return doStreamCoach(conversationId, content, signal, onChunk, onDone, onError, true);
    }
    window.location.href = "/login";
    return;
  }

  if (!res.ok || !res.body) {
    onError(new Error("Failed to connect to coach"));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    for (const line of text.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.chunk) onChunk(data.chunk);
        if (data.done) onDone(data.messageId);
        if (data.error) onError(new Error(data.error));
      } catch {
        // ignore malformed lines
      }
    }
  }
}

// SSE streaming for coach
export function streamCoach(
  conversationId: string,
  content: string,
  onChunk: (chunk: string) => void,
  onDone: (messageId: string) => void,
  onError: (err: Error) => void,
): AbortController {
  const controller = new AbortController();

  doStreamCoach(conversationId, content, controller.signal, onChunk, onDone, onError).catch(
    (err) => {
      if (err.name !== "AbortError") {
        onError(err instanceof Error ? err : new Error(err));
      }
    },
  );

  return controller;
}
