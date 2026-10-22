import { PUBLIC_CATALOG, normalizeCatalog } from "./catalog.js";
export async function priceResponse(request, fetcher = fetch) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (!["GET", "HEAD"].includes(request.method))
    return new Response(JSON.stringify({ status: "unavailable" }), {
      status: 405,
      headers: { ...headers, Allow: "GET, HEAD" },
    });
  try {
    const response = await fetcher(PUBLIC_CATALOG, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    if (!response.ok) throw Error("upstream");
    const json = normalizeCatalog(await response.json());
    // Explicit allowlist: no unknown upstream fields leave the public proxy.
    const body = {
      status: "ready",
      currency: "RUB",
      updatedAt: json.updatedAt,
      items: json.items.map((x) => ({
        id: x.id,
        title: x.title,
        category: x.category,
        priceType: x.priceType,
        minimumPrice: x.minimumPrice,
        maximumPrice: x.maximumPrice,
        ...(x.priceType === "FIXED" ? { price: x.minimumPrice } : {}),
      })),
    };
    return new Response(
      request.method === "HEAD" ? null : JSON.stringify(body),
      { status: 200, headers },
    );
  } catch {
    return new Response(
      request.method === "HEAD"
        ? null
        : JSON.stringify({ status: "unavailable" }),
      { status: 503, headers },
    );
  }
}
