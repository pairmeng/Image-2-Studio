type ApiErrorBody = {
  error?: string;
  code?: string;
};

type FetchJsonOptions = RequestInit & {
  fallbackMessage?: string;
};

type FetchBlobOptions = RequestInit & {
  fallbackMessage?: string;
};

export class ApiClientError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body: unknown;

  constructor(message: string, options: { status: number; code?: string; body?: unknown }) {
    super(message);
    this.name = "ApiClientError";
    this.status = options.status;
    this.code = options.code;
    this.body = options.body;
  }
}

function hasErrorBody(value: unknown): value is ApiErrorBody {
  return Boolean(value && typeof value === "object");
}

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function fetchJson<T>(input: RequestInfo | URL, options: FetchJsonOptions = {}): Promise<T> {
  const { fallbackMessage = "Request failed.", ...init } = options;
  const response = await fetch(input, init);
  const body = await readJson<T & ApiErrorBody>(response);

  if (!response.ok) {
    const message = hasErrorBody(body) && typeof body.error === "string" && body.error.trim()
      ? body.error
      : fallbackMessage;
    const code = hasErrorBody(body) && typeof body.code === "string" ? body.code : undefined;

    throw new ApiClientError(message, {
      status: response.status,
      code,
      body
    });
  }

  return (body ?? {}) as T;
}

export async function fetchBlob(input: RequestInfo | URL, options: FetchBlobOptions = {}) {
  const { fallbackMessage = "Request failed.", ...init } = options;
  const response = await fetch(input, init);

  if (!response.ok) {
    const body = await readJson<ApiErrorBody>(response);
    const message = hasErrorBody(body) && typeof body.error === "string" && body.error.trim()
      ? body.error
      : fallbackMessage;
    const code = hasErrorBody(body) && typeof body.code === "string" ? body.code : undefined;

    throw new ApiClientError(message, {
      status: response.status,
      code,
      body
    });
  }

  return response.blob();
}

export function isUnauthorizedError(error: unknown) {
  return error instanceof ApiClientError && error.status === 401;
}
