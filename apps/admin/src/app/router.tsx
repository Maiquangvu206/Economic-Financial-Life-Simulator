import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AdminLayout } from '../shared/layout/AdminLayout';
import { AiEventConsolePage } from '../pages/AiEventConsolePage';
import { MacroDashboardPage } from '../pages/MacroDashboardPage';
import { MapEditorPage } from '../pages/MapEditorPage';
import { PlayersPage } from '../pages/PlayersPage';
import { SeasonCalendarPage } from '../pages/SeasonCalendarPage';
import { SystemBroadcastPage } from '../pages/SystemBroadcastPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <AdminLayout />,
    children: [
      { index: true, element: <MacroDashboardPage /> },
      { path: 'broadcast', element: <SystemBroadcastPage /> },
      { path: 'calendar-seasons', element: <SeasonCalendarPage /> },
      { path: 'players', element: <PlayersPage /> },
      { path: 'map-editor', element: <MapEditorPage /> },
      { path: 'ai-events', element: <AiEventConsolePage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
