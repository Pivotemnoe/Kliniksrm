import { Body, Controller, Get, Header, Headers, Put } from '@nestjs/common';
import { assertSecret } from './security';
import { UpsertPublicCatalogDto } from './dto/upsert-public-catalog.dto';
import { PublicClinicCatalogService } from './public-clinic-catalog.service';

@Controller()
export class PublicClinicCatalogController {
  constructor(private readonly catalog: PublicClinicCatalogService) {}

  @Get('v1/public/clinic/catalog')
  @Header('Cache-Control', 'no-store')
  get() { return this.catalog.get(); }

  @Put('internal/v1/clinic/catalog')
  put(@Headers('x-owner-gateway-secret') secret: string | undefined, @Body() body: UpsertPublicCatalogDto) {
    assertSecret(secret, process.env.OWNER_GATEWAY_SYNC_SECRET, 'OWNER_GATEWAY_SYNC_SECRET');
    return this.catalog.upsert(body);
  }
}
