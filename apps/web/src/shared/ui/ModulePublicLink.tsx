import { LinkOutlined } from '@ant-design/icons';
import './module-ui.css';

export const groomingPublicUrl = import.meta.env.VITE_GROOMING_STOREFRONT_URL || 'https://pet.temichevvet.ru/';
export const avitoPublicUrl = import.meta.env.VITE_AVITO_PUBLIC_URL || 'https://www.avito.ru/armavir/predlozheniya_uslug/zoogostinitsa_dlya_koshek_i_sobak_4322482374';

export function ModulePublicLink({ label, href, address }: { label: string; href: string; address?: string }) {
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
  const listingId = url.hostname.endsWith('avito.ru') ? url.pathname.match(/_(\d+)$/)?.[1] : undefined;
  const display = address || (listingId ? `${url.host}/…/${listingId}` : url.host + (url.pathname === '/' ? '' : url.pathname));
  return <div className="module-public-link"><LinkOutlined aria-hidden="true" /><span>{label}:</span><a href={url.href} target="_blank" rel="noopener noreferrer" title={url.href}>{display} <span aria-hidden="true">↗</span></a></div>;
}
