import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ClinicModulesModule } from '../clinic-modules/clinic-modules.module';
import { AvitoApiClient } from './avito-api.client';
import { AvitoController, AvitoEventsController } from './avito.controller';
import { AvitoService } from './avito.service';
import { AvitoWorker } from './avito.worker';
import { AvitoCrmKnowledgeService } from './avito-crm-knowledge.service';
import { AvitoModelGatewayClient } from './avito-model-gateway.client';
import { AvitoEditorService } from './avito-editor.service';
import { AvitoEditorController } from './avito-editor.controller';
@Module({ imports: [AuditModule, ClinicModulesModule], controllers: [AvitoController, AvitoEventsController, AvitoEditorController], providers: [AvitoApiClient, AvitoCrmKnowledgeService, AvitoModelGatewayClient, AvitoService, AvitoEditorService, AvitoWorker] })
export class AvitoModule {}
