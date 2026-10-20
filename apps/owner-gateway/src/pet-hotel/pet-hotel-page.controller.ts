import { Controller, Get, Res } from '@nestjs/common';
import { resolve } from 'node:path';
import type { Response } from 'express';
@Controller()
export class PetHotelPageController {
  @Get(['portal/pet-hotel', 'portal/pet-hotel/'])
  page(@Res() res: Response) { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); return res.sendFile('pet-hotel.html', { root: resolve(__dirname, '../public') }); }
  @Get('portal/pet-hotel.js') script(@Res() res: Response) { return res.sendFile('pet-hotel.js', { root: resolve(__dirname, '../public') }); }
  @Get('portal/pet-hotel.css') styles(@Res() res: Response) { return res.sendFile('pet-hotel.css', { root: resolve(__dirname, '../public') }); }
}
