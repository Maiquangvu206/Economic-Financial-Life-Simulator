import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { RequireAdmin } from '../features/auth/guards';
import { AdminLayout } from '../shared/layout/AdminLayout';
import { AdminLoginPage } from '../pages/AdminLoginPage';
import { AiEventConsolePage } from '../pages/AiEventConsolePage';
import { ChatPage } from '../pages/ChatPage';
import { AuditLogsPage } from '../pages/AuditLogsPage';
import { EducationConfigPage } from '../pages/EducationConfigPage';
import { MacroDashboardPage } from '../pages/MacroDashboardPage';
import { MapEditorPage } from '../pages/MapEditorPage';
import { OfflinePolicyPage } from '../pages/OfflinePolicyPage';
import { PlayersPage } from '../pages/PlayersPage';
import { PoliticsConfigPage } from '../pages/PoliticsConfigPage';
import { RestrictionSettingsPage } from '../pages/RestrictionSettingsPage';
import { SeasonCalendarPage } from '../pages/SeasonCalendarPage';
import { GiftCodesPage } from '../pages/GiftCodesPage';
import { SsoPage } from '../pages/SsoPage';
import { SystemBroadcastPage } from '../pages/SystemBroadcastPage';
import { InterestRatesConfigPage } from '../pages/InterestRatesConfigPage';
import { IndustryRevenueConfigPage } from '../pages/IndustryRevenueConfigPage';
import { StockMarketControlPage } from '../pages/StockMarketControlPage';

const router = createBrowserRouter([
  {
    path: '/login',
    element: <AdminLoginPage />,
  },
  {
    // Nhận phiên quản trị từ cổng đăng nhập duy nhất SSO.
    path: '/sso',
    element: <SsoPage />,
  },
  {
    element: <RequireAdmin />,
    children: [
      {
        path: '/',
        element: <AdminLayout />,
        children: [
          { index: true, element: <MacroDashboardPage /> },
          { path: 'broadcast', element: <SystemBroadcastPage /> },
          { path: 'gift-codes', element: <GiftCodesPage /> },
          { path: 'calendar-seasons', element: <SeasonCalendarPage /> },
          { path: 'education-config', element: <EducationConfigPage /> },
          { path: 'politics', element: <PoliticsConfigPage /> },
          { path: 'interest-rates', element: <InterestRatesConfigPage /> },
          { path: 'industry-revenue', element: <IndustryRevenueConfigPage /> },
          { path: 'stock-market-control', element: <StockMarketControlPage /> },
          { path: 'offline', element: <OfflinePolicyPage /> },
          { path: 'restriction', element: <RestrictionSettingsPage /> },
          { path: 'audit-logs', element: <AuditLogsPage /> },
          { path: 'players', element: <PlayersPage /> },
          { path: 'map-editor', element: <MapEditorPage /> },
          { path: 'ai-events', element: <AiEventConsolePage /> },
          { path: 'chat', element: <ChatPage /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
