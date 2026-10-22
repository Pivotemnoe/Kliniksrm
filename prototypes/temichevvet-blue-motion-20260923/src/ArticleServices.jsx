import { createContext, useContext, useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Stethoscope,
  Scan,
  Flask,
} from "@phosphor-icons/react";
import { normalizeCatalog, displayPrice } from "./catalog.js";
import {
  articleServices,
  articleVisitHref,
  serviceFromCatalog,
} from "./articles-data.js";

const CatalogContext = createContext({ catalog: null, status: "loading" });
export const useArticleCatalog = () => useContext(CatalogContext);
export function ArticleCatalog({ children }) {
  const [result, setResult] = useState({ catalog: null, status: "loading" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true,
      pending = false,
      controller,
      timeout;
    const load = async () => {
      if (pending) return;
      pending = true;
      controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch("/api/prices", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw Error("unavailable");
        const catalog = normalizeCatalog(await response.json());
        if (alive) setResult({ catalog, status: "ready" });
      } catch {
        if (alive) setResult({ catalog: null, status: "error" });
      } finally {
        pending = false;
        clearTimeout(timeout);
      }
    };
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 60000);
    const visible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive = false;
      controller?.abort();
      clearTimeout(timeout);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [retry]);
  let catalog = result.catalog;
  // Never retain stale prices while the tab is being resumed or a refresh fails.
  if (catalog) {
    try {
      catalog = normalizeCatalog(catalog);
    } catch {
      catalog = null;
    }
  }
  return (
    <CatalogContext.Provider
      value={{ ...result, catalog, retry: () => setRetry((x) => x + 1) }}
    >
      {children}
    </CatalogContext.Provider>
  );
}

export function ArticleServiceCard({
  topic,
  serviceKey = "consultation",
  compact = false,
}) {
  const { catalog, status, retry } = useContext(CatalogContext);
  const service = articleServices[serviceKey],
    item = serviceFromCatalog(catalog?.items || [], serviceKey);
  const Icon =
    serviceKey === "consultation"
      ? Stethoscope
      : serviceKey === "stool"
        ? Flask
        : Scan;
  return (
    <aside
      className={`article-service ${compact ? "compact" : ""}`}
      aria-label={service.title}
    >
      <div className="article-service-heading">
        <Icon size={26} />
        <span>
          {serviceKey === "consultation"
            ? "С чего начать в TemichevVET"
            : "По назначению врача"}
        </span>
      </div>
      <h3>
        <a href={service.path}>{service.title}</a>
      </h3>
      <p>{service.description}</p>
      <div className="article-service-price">
        {item ? (
          <>
            <span>{item.title}</span>
            <strong>{displayPrice(item)}</strong>
          </>
        ) : (
          <span>
            {!service.id
              ? service.priceNote || "Стоимость зависит от объёма исследования."
              : status === "loading"
                ? "Проверяем актуальную стоимость…"
                : "Стоимость уточните в клинике."}
          </span>
        )}
      </div>
      {status === "error" && service.id && (
        <button className="article-price-retry" onClick={retry}>
          Обновить стоимость
        </button>
      )}
      <a className="button" href={articleVisitHref(topic, serviceKey)}>
        {service.action}
        <ArrowRight size={20} />
      </a>
      <a
        className="text-link"
        href={`/prices?q=${encodeURIComponent(item?.title || service.query)}`}
      >
        В прейскурант
        <ArrowUpRight size={18} />
      </a>
    </aside>
  );
}
