const upstream = "https://clinic.temichevvet.ru/v1/public/clinic/inquiries";
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
export function inquiryEnabled(config = {}) {
  try {
    return (
      config.INQUIRIES_ENABLED === "true" &&
      new URL(config.PRIVACY_URL).protocol === "https:"
    );
  } catch {
    return false;
  }
}
export function validInquiry(x) {
  const text = (key, min, max) =>
    typeof x[key] === "string" &&
    x[key].trim().length >= min &&
    x[key].length <= max;
  return (
    x &&
    text("clientRequestId", 16, 80) &&
    text("contactName", 1, 120) &&
    text("animalNickname", 1, 160) &&
    text("message", 1, 1000) &&
    typeof x.phone === "string" &&
    /^[+\d\s()\-]{10,32}$/.test(x.phone) &&
    x.phone.replace(/\D/g, "").length >= 10 &&
    x.contactConsent === true &&
    !x.website
  );
}
export async function inquiryResponse(request, config = {}, fetcher = fetch) {
  const fail = (status) => Response.json({ ok: false }, { status, headers });
  if (request.method !== "POST") return fail(405);
  if (!inquiryEnabled(config)) return fail(503);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return fail(403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return fail(415);
  try {
    if (Number(request.headers.get("content-length")) > 16384) return fail(413);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 16384) return fail(413);
    const input = JSON.parse(raw);
    if (!validInquiry(input)) return fail(400);
    const body = Object.fromEntries(
      [
        "clientRequestId",
        "contactName",
        "phone",
        "animalNickname",
        "message",
        "contactConsent",
      ].map((key) => [key, input[key]]),
    );
    const response = await fetcher(upstream, {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return fail(response.status === 429 ? 429 : 502);
    const result = await response.json();
    if (
      result.ok !== true ||
      result.status !== "received" ||
      typeof result.requestId !== "string" ||
      !result.requestId
    )
      return fail(502);
    return Response.json(
      { ok: true, status: "received", requestId: result.requestId },
      { headers },
    );
  } catch {
    return fail(502);
  }
}
