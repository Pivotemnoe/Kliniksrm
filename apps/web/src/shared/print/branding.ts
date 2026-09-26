/** All print windows use the same logo and wait for decoded images before printing. */
export function printLogoUrl(logoUrl?: string | null, baseHref = window.location.href) {
  return new URL(logoUrl === undefined ? '/api/v1/organization/print-logo' : logoUrl || '/brand/temichevvet-logo.jpg', baseHref).href;
}

export function printImagesScript(autoPrint = true, baseHref = window.location.href) {
  const fallback = JSON.stringify(printLogoUrl(null, baseHref)).replace(/</g, '\\u003c');
  return `<script>
    (() => {
      let printing = false;
      const ready = (image) => new Promise((resolve, reject) => {
        const loaded = () => image.decode ? image.decode().then(resolve, reject) : resolve();
        const failed = () => {
          if (image.dataset.clinicLogo !== undefined && image.src !== ${fallback}) {
            image.src = ${fallback};
          } else reject(new Error('Логотип не загрузился. Проверьте подключение и повторите печать.'));
        };
        image.onload = loaded;
        image.onerror = failed;
        if (image.complete) image.naturalWidth ? loaded() : failed();
      });
      window.printWithImages = async () => {
        if (printing) return;
        printing = true;
        try {
          await Promise.all(Array.from(document.images, ready));
          if (document.fonts) await document.fonts.ready;
          window.print();
        } catch (error) {
          window.alert(error.message);
        } finally { printing = false; }
      };
      ${autoPrint ? 'window.printWithImages();' : ''}
    })();
  </script>`;
}

export function printBrandHeader(logoUrl?: string | null, name = 'TemichevVet') {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<header style="display:flex;gap:12px;align-items:center;margin-bottom:12px"><img data-clinic-logo src="${escape(printLogoUrl(logoUrl))}" alt="Логотип клиники" style="width:54px;height:54px;object-fit:contain"/><strong>${escape(name)}</strong></header>`;
}
