import { priceResponse } from "./price-api.js";
import { inquiryResponse } from "./inquiry-api.js";
import { pageAsset } from "./routes.js";
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/prices") return priceResponse(request);
    if (url.pathname === "/api/inquiries") return inquiryResponse(request, env);
    if (url.pathname.startsWith("/api/"))
      return new Response("Not found", { status: 404 });
    const asset = pageAsset(url.pathname);
    if (asset) {
      url.pathname = asset;
      url.search = "";
    }
    const result = asset
      ? await env.ASSETS.fetch(new Request(url, request))
      : await env.ASSETS.fetch(request);
    const headers = new Headers(result.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers,
    });
  },
};
