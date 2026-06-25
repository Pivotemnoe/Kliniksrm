import { Module } from '@nestjs/common';
import { AnimalsModule } from './modules/animals/animals.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { ClientPortalModule } from './modules/client-portal/client-portal.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { FinanceModule } from './modules/finance/finance.module';
import { HealthModule } from './modules/health/health.module';
import { HospitalModule } from './modules/hospital/hospital.module';
import { ImportsModule } from './modules/imports/imports.module';
import { LaboratoryModule } from './modules/laboratory/laboratory.module';
import { MedicalPhrasesModule } from './modules/medical-phrases/medical-phrases.module';
import { MetaModule } from './modules/meta/meta.module';
import { NewsModule } from './modules/news/news.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OnlineRequestsModule } from './modules/online-requests/online-requests.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { OwnersModule } from './modules/owners/owners.module';
import { QueueModule } from './modules/queue/queue.module';
import { SalesModule } from './modules/sales/sales.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { StockModule } from './modules/stock/stock.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { VisitsModule } from './modules/visits/visits.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    HealthModule,
    MetaModule,
    NewsModule,
    OrganizationModule,
    NotificationsModule,
    DocumentsModule,
    EmployeesModule,
    FinanceModule,
    OnlineRequestsModule,
    OwnersModule,
    AnimalsModule,
    SchedulingModule,
    QueueModule,
    TasksModule,
    AppointmentsModule,
    VisitsModule,
    BillingModule,
    ClientPortalModule,
    DashboardModule,
    SalesModule,
    StockModule,
    HospitalModule,
    LaboratoryModule,
    ImportsModule,
    MedicalPhrasesModule,
  ],
})
export class AppModule {}
