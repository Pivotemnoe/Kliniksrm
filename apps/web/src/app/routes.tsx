import { Navigate, RouteObject } from 'react-router-dom';
import { AppointmentCardPage } from '../features/appointments/AppointmentCardPage';
import { AppointmentsPage } from '../features/appointments/AppointmentsPage';
import { AuditLogsPage } from '../features/audit/AuditLogsPage';
import { AnimalCardPage } from '../features/animals/AnimalCardPage';
import { AnimalsPage } from '../features/animals/AnimalsPage';
import { ClientPortalPage } from '../features/clientPortal/ClientPortalPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { DocumentTemplatesPage } from '../features/documents/DocumentTemplatesPage';
import { EmployeesPage } from '../features/employees/EmployeesPage';
import { FinanceSettingsPage } from '../features/finance/FinanceSettingsPage';
import { HospitalPage } from '../features/hospital/HospitalPage';
import { BillCardPage } from '../features/billing/BillCardPage';
import { BillsPage } from '../features/billing/BillsPage';
import { LaboratoryPage } from '../features/laboratory/LaboratoryPage';
import { NewsPage } from '../features/news/NewsPage';
import { MessagesPage } from '../features/notifications/MessagesPage';
import { MedicalPhrasesSettingsPage } from '../features/medicalPhrases/MedicalPhrasesSettingsPage';
import { OrganizationSettingsPage } from '../features/organization/OrganizationSettingsPage';
import { OnlineRequestsPage } from '../features/onlineRequests/OnlineRequestsPage';
import { PublicOnlineRequestPage } from '../features/onlineRequests/PublicOnlineRequestPage';
import { OwnerCardPage } from '../features/owners/OwnerCardPage';
import { OwnersPage } from '../features/owners/OwnersPage';
import { QueueCardPage } from '../features/queue/QueueCardPage';
import { QueuePage } from '../features/queue/QueuePage';
import { QueueTvPage } from '../features/queue/QueueTvPage';
import { SaleCardPage } from '../features/sales/SaleCardPage';
import { SalesPage } from '../features/sales/SalesPage';
import { ClinicResourcesPage } from '../features/scheduling/ClinicResourcesPage';
import { SettingsOverviewPage } from '../features/settings/SettingsOverviewPage';
import { StockPage } from '../features/stock/StockPage';
import { SystemSettingsPage } from '../features/system/SystemSettingsPage';
import { TaskCardPage } from '../features/tasks/TaskCardPage';
import { TasksPage } from '../features/tasks/TasksPage';
import { VisitCardPage } from '../features/visits/VisitCardPage';
import { VisitsPage } from '../features/visits/VisitsPage';
import { CrmLayout } from '../layouts/CrmLayout';
import { LoginPage } from '../pages/LoginPage';
import { ProfilePage } from '../pages/ProfilePage';
import { DefaultRouteRedirect } from './DefaultRouteRedirect';
import { ProtectedRoute } from './ProtectedRoute';

export const routes: RouteObject[] = [
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/queue/tv',
    element: <QueueTvPage />,
  },
  {
    path: '/portal',
    element: <ClientPortalPage />,
  },
  {
    path: '/portal/:token',
    element: <ClientPortalPage />,
  },
  {
    path: '/online',
    element: <PublicOnlineRequestPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <CrmLayout />,
        children: [
          { index: true, element: <DefaultRouteRedirect /> },
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/profile', element: <ProfilePage /> },
          { path: '/news', element: <NewsPage /> },
          { path: '/schedule', element: <AppointmentsPage /> },
          { path: '/schedule/:appointmentId', element: <AppointmentCardPage /> },
          { path: '/queue', element: <QueuePage /> },
          { path: '/queue/:queueEntryId', element: <QueueCardPage /> },
          { path: '/tasks', element: <TasksPage /> },
          { path: '/tasks/:taskId', element: <TaskCardPage /> },
          { path: '/owners', element: <OwnersPage /> },
          { path: '/owners/:ownerId', element: <OwnerCardPage /> },
          { path: '/patients', element: <AnimalsPage /> },
          { path: '/patients/:animalId', element: <AnimalCardPage /> },
          { path: '/visits', element: <VisitsPage /> },
          { path: '/visits/:visitId', element: <VisitCardPage /> },
          { path: '/hospital', element: <HospitalPage /> },
          { path: '/bills', element: <BillsPage /> },
          { path: '/bills/:billId', element: <BillCardPage /> },
          { path: '/sales', element: <SalesPage /> },
          { path: '/sales/:saleId', element: <SaleCardPage /> },
          { path: '/stock', element: <StockPage /> },
          { path: '/stock/goods', element: <StockPage /> },
          { path: '/stock/services', element: <StockPage /> },
          { path: '/stock/supplies', element: <StockPage /> },
          { path: '/stock/invoices', element: <StockPage /> },
          { path: '/employees', element: <EmployeesPage /> },
          { path: '/settings', element: <SettingsOverviewPage /> },
          { path: '/settings/organization', element: <OrganizationSettingsPage /> },
          { path: '/settings/organization/profile', element: <OrganizationSettingsPage /> },
          { path: '/settings/organization/details', element: <OrganizationSettingsPage /> },
          { path: '/settings/organization/tariffs', element: <FinanceSettingsPage /> },
          { path: '/settings/office', element: <ClinicResourcesPage /> },
          { path: '/settings/office/profile', element: <ClinicResourcesPage /> },
          { path: '/settings/office/schedule', element: <ClinicResourcesPage /> },
          { path: '/settings/office/rooms', element: <ClinicResourcesPage /> },
          { path: '/settings/office/warehouses', element: <ClinicResourcesPage /> },
          { path: '/settings/office/cashboxes', element: <FinanceSettingsPage /> },
          { path: '/settings/office/hospital', element: <ClinicResourcesPage /> },
          { path: '/settings/office/laboratories', element: <LaboratoryPage /> },
          { path: '/settings/employees', element: <EmployeesPage /> },
          { path: '/settings/documents', element: <DocumentTemplatesPage /> },
          { path: '/settings/phrases', element: <MedicalPhrasesSettingsPage /> },
          { path: '/settings/laboratories', element: <LaboratoryPage /> },
          { path: '/settings/finance', element: <FinanceSettingsPage /> },
          { path: '/settings/audit', element: <AuditLogsPage /> },
          { path: '/settings/system', element: <SystemSettingsPage /> },
          { path: '/messages', element: <MessagesPage /> },
          { path: '/online-requests', element: <OnlineRequestsPage /> },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
];
