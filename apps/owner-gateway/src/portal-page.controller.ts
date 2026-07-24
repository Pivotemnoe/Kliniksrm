import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { resolve } from 'node:path';

@Controller()
export class PortalPageController {
  @Get(['portal', 'portal/', 'portal/activate'])
  portal(@Res() response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return response.sendFile(resolve(__dirname, 'public/index.html'));
  }

  @Get('portal/app.js')
  script(@Res() response: Response) {
    return response.sendFile(resolve(__dirname, 'public/app.js'));
  }

  @Get('portal/app.css')
  styles(@Res() response: Response) {
    return response.sendFile(resolve(__dirname, 'public/app.css'));
  }

  @Get('manifest.webmanifest')
  manifest(@Res() response: Response) {
    response.type('application/manifest+json');
    return response.sendFile(resolve(__dirname, 'public/manifest.webmanifest'));
  }

  @Get('portal/sw.js')
  serviceWorker(@Res() response: Response) {
    response.type('application/javascript');
    response.setHeader('Cache-Control', 'no-cache');
    return response.sendFile(resolve(__dirname, 'public/sw.js'));
  }

  @Get('portal/icons/:fileName')
  icon(@Param('fileName') fileName: string, @Res() response: Response) {
    if (!portalIconFiles.has(fileName)) {
      throw new NotFoundException('Иконка не найдена');
    }

    response.setHeader('Cache-Control', 'public, max-age=86400');
    return response.sendFile(resolve(__dirname, `public/icons/${fileName}`));
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
