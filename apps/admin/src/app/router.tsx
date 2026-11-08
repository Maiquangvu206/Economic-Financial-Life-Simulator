import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { RequireAdmin } from '../features/auth/guards';
import { AdminLayout } from '../shared/layout/AdminLayout';
import { AiEventConsolePage } from '../pages/AiEventConsolePage';
import { AuditLogsPage } from '../pages/AuditLogsPage';
import { MacroDashboardPage } from '../pages/MacroDashboardPage';
import { MapEditorPage } from '../pages/MapEditorPage';
import { PlayersPage } from '../pages/PlayersPage';
import { SeasonCalendarPage } from '../pages/SeasonCalendarPage';
import { SsoPage } from '../pages/SsoPage';
import { SystemBroadcastPage } from '../pages/SystemBroadcastPage';

const router = createBrowserRouter([
  {
    // Nhận phiên quản trị từ cổng đăng nhập duy nhất.
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
          { path: 'calendar-seasons', element: <SeasonCalendarPage /> },
          { path: 'audit-logs', element: <AuditLogsPage /> },
          { path: 'players', element: <PlayersPage /> },
          { path: 'map-editor', element: <MapEditorPage /> },
          { path: 'ai-events', element: <AiEventConsolePage /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
