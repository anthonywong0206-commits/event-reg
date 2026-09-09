export type ApiResponsePayload = Record<string, unknown> & { error?: string };

function humanizeNonJsonError(status: number, text: string) {
  const normalized = text.trim();

  if (
    status === 413 ||
    /request entity too large|payload too large|request body too large/i.test(normalized)
  ) {
    return "上載或提交內容太大。圖片請使用 JPG、PNG 或 WebP 並控制在 8MB 內；如仍出現此訊息，請重新整理頁面後再試。";
  }

  if (status === 401) return "登入狀態已失效，請重新登入管理員後再試。";
  if (status === 403) return "你沒有權限執行此操作。";
  if (status >= 500) return `伺服器暫時未能處理要求（HTTP ${status}）。請稍後重試。`;

  if (normalized && normalized.length <= 300 && !normalized.startsWith("<!DOCTYPE") && !normalized.startsWith("<html")) {
    return normalized;
  }

  return `伺服器回傳非預期格式（HTTP ${status}）。`;
}

/**
 * Read API responses safely even when an upstream platform (for example Vercel)
 * returns a plain-text/HTML error instead of JSON.
 */
export async function readApiResponse<T extends Record<string, unknown> = Record<string, unknown>>(
  response: Response,
): Promise<T & { error?: string }> {
  const text = await response.text();
  if (!text) return {} as T & { error?: string };

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text) as T & { error?: string };
    } catch {
      return { error: `伺服器回傳無效 JSON（HTTP ${response.status}）。` } as T & { error?: string };
    }
  }

  // Some proxies omit the JSON content-type. Try JSON once before treating it as text.
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    return { error: humanizeNonJsonError(response.status, text) } as T & { error?: string };
  }
}
