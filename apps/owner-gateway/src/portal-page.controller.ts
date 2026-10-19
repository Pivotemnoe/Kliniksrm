import { Controller, Get, NotFoundException, Param, Redirect, Res, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

@Controller()
export class PortalPageController {
  @Get(['assistant', 'assistant/'])
  async assistant(@Res() response: Response) {
    this.assertAssistantEnabled();
    const nonce = randomBytes(24).toString('base64');
    let html: string;
    try { html = await readFile(resolve(__dirname, 'public/assistant/assistant.html'), 'utf8'); }
    catch { throw new ServiceUnavailableException('Чат ещё не подготовлен'); }
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    // Ant Design creates style elements with this nonce and uses layout style
    // attributes. The portal retains its stricter, unchanged policy.
    response.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self' 'nonce-${nonce}'; style-src-attr 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
    return response.type('html').send(html.replace('__CLINIC_CSP_NONCE__', nonce));
  }

  @Get('assistant/assets/:fileName')
  assistantAsset(@Param('fileName') fileName: string, @Res() response: Response) {
    this.assertAssistantEnabled();
    if (!/^[A-Za-z0-9_-]+\.(?:js|css)$/.test(fileName)) throw new NotFoundException('Файл не найден');
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return response.sendFile(fileName, { root: resolve(__dirname, 'public/assistant/assets') });
  }

  private assertAssistantEnabled() { if (process.env.CLINIC_ASSISTANT_ENABLED !== 'true') throw new NotFoundException('Чат пока не включён'); }

  @Get()
  @Redirect('/portal', 302)
  root() {
    return undefined;
  }

  @Get(['portal', 'portal/', 'portal/activate'])
  portal(@Res() response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return response.sendFile('index.html', { root: resolve(__dirname, 'public') });
  }

  @Get('portal/app.js')
  script(@Res() response: Response) {
    return response.sendFile('app.js', { root: resolve(__dirname, 'public') });
  }

  @Get(['portal/grooming', 'portal/grooming/'])
  grooming(@Res() response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return response.sendFile('grooming.html', { root: resolve(__dirname, 'public') });
  }

  @Get('portal/grooming.js')
  groomingScript(@Res() response: Response) { return response.sendFile('grooming.js', { root: resolve(__dirname, 'public') }); }

  @Get('portal/grooming.css')
  groomingStyles(@Res() response: Response) { return response.sendFile('grooming.css', { root: resolve(__dirname, 'public') }); }

  @Get('portal/app.css')
  styles(@Res() response: Response) {
    return response.sendFile('app.css', { root: resolve(__dirname, 'public') });
  }

  @Get('manifest.webmanifest')
  manifest(@Res() response: Response) {
    response.type('application/manifest+json');
    return response.sendFile('manifest.webmanifest', { root: resolve(__dirname, 'public') });
  }

  @Get(['sw.js', 'portal/sw.js'])
  serviceWorker(@Res() response: Response) {
    response.type('application/javascript');
    response.setHeader('Cache-Control', 'no-cache');
    return response.sendFile('sw.js', { root: resolve(__dirname, 'public') });
  }

  @Get('portal/icons/:fileName')
  icon(@Param('fileName') fileName: string, @Res() response: Response) {
    if (!portalIconFiles.has(fileName)) {
      throw new NotFoundException('Иконка не найдена');
    }

    response.setHeader('Cache-Control', 'public, max-age=86400');
    return response.sendFile(fileName, { root: resolve(__dirname, 'public/icons') });
  }
}

const portalIconFiles = new Set([
  'icon-64.png',
  'icon-180.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'lk-icon-64.png',
  'lk-icon-180.png',
  'lk-icon-192.png',
  'lk-icon-512.png',
  'lk-icon-maskable-512.png',
]);
