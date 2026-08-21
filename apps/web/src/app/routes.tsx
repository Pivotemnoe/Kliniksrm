import { lazy, type ComponentType } from 'react';
import { Navigate, RouteObject } from 'react-router-dom';
import { CrmLayout } from '../layouts/CrmLayout';
import { DefaultRouteRedirect } from './DefaultRouteRedirect';
import { ProtectedRoute } from './ProtectedRoute';

function lazyPage(loader: () => Promise<unknown>, exportName: string) {
  return lazy(async () => {
    const pageModule = (await loader()) as Record<string, ComponentType>;
    const Page = pageModule[exportName];

    if (!Page) {
      throw new Error(`Раздел ${exportName} не найден в загруженном модуле`);
    }

    return { default: Page };
  });
}

const AppointmentCardPage = lazyPage(() => import('../features/appointments/AppointmentCardPage'), 'AppointmentCardPage');
const AppointmentsPage = lazyPage(() => import('../features/appointments/AppointmentsPage'), 'AppointmentsPage');
const AuditLogsPage = lazyPage(() => import('../features/audit/AuditLogsPage'), 'AuditLogsPage');
const AnimalCardPage = lazyPage(() => import('../features/animals/AnimalCardPage'), 'AnimalCardPage');
const AnimalsPage = lazyPage(() => import('../features/animals/AnimalsPage'), 'AnimalsPage');
const ClientPortalPage = lazyPage(() => import('../features/clientPortal/ClientPortalPage'), 'ClientPortalPage');
const DashboardPage = lazyPage(() => import('../features/dashboard/DashboardPage'), 'DashboardPage');
const DocumentTemplatesPage = lazyPage(() => import('../features/documents/DocumentTemplatesPage'), 'DocumentTemplatesPage');
const EmployeesPage = lazyPage(() => import('../features/employees/EmployeesPage'), 'EmployeesPage');
const FinanceSettingsPage = lazyPage(() => import('../features/finance/FinanceSettingsPage'), 'FinanceSettingsPage');
const HospitalPage = lazyPage(() => import('../features/hospital/HospitalPage'), 'HospitalPage');
const HospitalCardPage = lazyPage(() => import('../features/hospital/HospitalCardPage'), 'HospitalCardPage');
const HelpPage = lazyPage(() => import('../features/help/HelpPage'), 'HelpPage');
const BillCardPage = lazyPage(() => import('../features/billing/BillCardPage'), 'BillCardPage');
const BillsPage = lazyPage(() => import('../features/billing/BillsPage'), 'BillsPage');
const VetafImportPage = lazyPage(() => import('../features/imports/VetafImportPage'), 'VetafImportPage');
const LaboratoryPage = lazyPage(() => import('../features/laboratory/LaboratoryPage'), 'LaboratoryPage');
const NewsPage = lazyPage(() => import('../features/news/NewsPage'), 'NewsPage');
const MessagesPage = lazyPage(() => import('../features/notifications/MessagesPage'), 'MessagesPage');
const MedicalPhrasesSettingsPage = lazyPage(
  () => import('../features/medicalPhrases/MedicalPhrasesSettingsPage'),
  'MedicalPhrasesSettingsPage',
);
const OrganizationSettingsPage = lazyPage(
  () => import('../features/organization/OrganizationSettingsPage'),
  'OrganizationSettingsPage',
);
const OnlineRequestsPage = lazyPage(() => import('../features/onlineRequests/OnlineRequestsPage'), 'OnlineRequestsPage');
const PublicOnlineRequestPage = lazyPage(
  () => import('../features/onlineRequests/PublicOnlineRequestPage'),
  'PublicOnlineRequestPage',
);
const OwnerCardPage = lazyPage(() => import('../features/owners/OwnerCardPage'), 'OwnerCardPage');
const OwnersPage = lazyPage(() => import('../features/owners/OwnersPage'), 'OwnersPage');
const QueueCardPage = lazyPage(() => import('../features/queue/QueueCardPage'), 'QueueCardPage');
const QueuePage = lazyPage(() => import('../features/queue/QueuePage'), 'QueuePage');
const QueueTvPage = lazyPage(() => import('../features/queue/QueueTvPage'), 'QueueTvPage');
const ReportsPage = lazyPage(() => import('../features/reports/ReportsPage'), 'ReportsPage');
const RemoteAccessEnrollmentPage = lazyPage(
  () => import('../features/remoteAccess/RemoteAccessEnrollmentPage'),
  'RemoteAccessEnrollmentPage',
);
const RemoteAccessSettingsPage = lazyPage(
  () => import('../features/remoteAccess/RemoteAccessSettingsPage'),
  'RemoteAccessSettingsPage',
);
const PayrollPage = lazyPage(() => import('../features/payroll/PayrollPage'), 'PayrollPage');
const BusinessPage = lazyPage(() => import('../features/business/BusinessPage'), 'BusinessPage');
const DailyFinancePage = lazyPage(() => import('../features/business/DailyFinancePage'), 'DailyFinancePage');
const SaleCardPage = lazyPage(() => import('../features/sales/SaleCardPage'), 'SaleCardPage');
const SalesPage = lazyPage(() => import('../features/sales/SalesPage'), 'SalesPage');
const ClinicResourcesPage = lazyPage(() => import('../features/scheduling/ClinicResourcesPage'), 'ClinicResourcesPage');
const SettingsOverviewPage = lazyPage(() => import('../features/settings/SettingsOverviewPage'), 'SettingsOverviewPage');
const StaffMessagesPage = lazyPage(() => import('../features/internalMessages/StaffMessagesPage'), 'StaffMessagesPage');
const StockPage = lazyPage(() => import('../features/stock/StockPage'), 'StockPage');
const StockOperationsPage = lazyPage(() => import('../features/stock/StockOperationsPage'), 'StockOperationsPage');
const StorePage = lazyPage(() => import('../features/store/StorePage'), 'StorePage');
const SupportPage = lazyPage(() => import('../features/support/SupportPage'), 'SupportPage');
const SystemSettingsPage = lazyPage(() => import('../features/system/SystemSettingsPage'), 'SystemSettingsPage');
const TaskCardPage = lazyPage(() => import('../features/tasks/TaskCardPage'), 'TaskCardPage');
const TasksPage = lazyPage(() => import('../features/tasks/TasksPage'), 'TasksPage');
const VisitCardPage = lazyPage(() => import('../features/visits/VisitCardPage'), 'VisitCardPage');
const VisitsPage = lazyPage(() => import('../features/visits/VisitsPage'), 'VisitsPage');
const LoginPage = lazyPage(() => import('../pages/LoginPage'), 'LoginPage');
const ProfilePage = lazyPage(() => import('../pages/ProfilePage'), 'ProfilePage');

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
    path: '/remote/enroll',
    element: <RemoteAccessEnrollmentPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <CrmLayout />,
        children: [
          { index: true, element: <DefaultRouteRedirect /> },
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/reports', element: <ReportsPage /> },
          { path: '/payroll', element: <PayrollPage /> },
          { path: '/daily-finance', element: <DailyFinancePage /> },
          { path: '/business', element: <BusinessPage /> },
          { path: '/profile', element: <ProfilePage /> },
          { path: '/help', element: <HelpPage /> },
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
          { path: '/laboratory', element: <LaboratoryPage /> },
          { path: '/hospital', element: <HospitalPage /> },
          { path: '/hospital/:stayId', element: <HospitalCardPage /> },
          { path: '/bills', element: <BillsPage /> },
          { path: '/bills/:billId', element: <BillCardPage /> },
          { path: '/sales', element: <SalesPage /> },
          { path: '/sales/:saleId', element: <SaleCardPage /> },
          { path: '/stock', element: <StockPage /> },
          { path: '/stock/goods', element: <StockPage /> },
          { path: '/stock/services', element: <StockPage /> },
          { path: '/stock/labels', element: <StockPage /> },
          { path: '/stock/supplies', element: <StockPage /> },
          { path: '/stock/invoices', element: <StockPage /> },
          { path: '/stock/operations', element: <StockOperationsPage /> },
          { path: '/store', element: <StorePage /> },
          { path: '/store/products', element: <StorePage /> },
          { path: '/store/labels', element: <StorePage /> },
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
          { path: '/settings/remote-access', element: <RemoteAccessSettingsPage /> },
          { path: '/settings/support', element: <SupportPage /> },
          { path: '/settings/import', element: <VetafImportPage /> },
          { path: '/messages', element: <MessagesPage /> },
          { path: '/staff-messages', element: <StaffMessagesPage /> },
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
