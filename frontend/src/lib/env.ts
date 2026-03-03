export const BASENAME = import.meta.env.VITE_BASENAME ?? "/";

const API_URL = import.meta.env.VITE_API_URL ?? "http://tea.uv.es:5300";

export function buildApiUrl(endpoint: string): URL {
  let prefixUrl = API_URL;

  if (!prefixUrl.endsWith("/")) {
    prefixUrl += "/";
  }

  if (endpoint.startsWith("/")) {
    throw new Error("`endpoint` must not begin with a slash");
  }

  return new URL(endpoint, prefixUrl);
}
