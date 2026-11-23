import type {
  AlgorithmDTO,
  ComparisonResponse,
  ComparisonRunRequest,
  SearchExecuteRequest,
  SearchExecuteResponse,
  ServerConfig,
} from "../types";

const API_BASE = "";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

/** Pull a readable message out of the backend's {"error": {...}} body. */
export function messageFromBody(text: string, status: number): string {
  try {
    const parsed = JSON.parse(text);
    const message = parsed?.error?.message ?? parsed?.detail;
    if (typeof message === "string" && message) return message;
  } catch {
    /* not JSON */
  }
  return `Request failed (HTTP ${status})`;
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Cannot reach the API. Is the backend running?", 0);
  }
  if (!res.ok) {
    throw new ApiError(
      messageFromBody(await res.text().catch(() => ""), res.status),
      res.status,
    );
  }
  return (await res.json()) as T;
}

export const searchApi = {
  health: () => request<{ status: string; service: string }>("/api/health"),
  config: () => request<ServerConfig>("/api/config"),
  algorithms: () => request<AlgorithmDTO[]>("/api/algorithms"),
  execute: (body: SearchExecuteRequest) =>
    request<SearchExecuteResponse>("/api/search/execute", body),
  comparisons: (body: ComparisonRunRequest) =>
    request<ComparisonResponse>("/api/comparisons", body),
};
