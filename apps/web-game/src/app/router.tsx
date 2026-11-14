import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { RedirectIfAuthenticated, RequireAuth } from '../features/auth/guards';
import { AppLayout } from '../shared/layout/AppLayout';
import { BusinessPage } from '../pages/BusinessPage';
import { CharacterPage } from '../pages/CharacterPage';
import { CityPage } from '../pages/CityPage';
import { EducationPage } from '../pages/EducationPage';
import { FinancePage } from '../pages/FinancePage';
import { LawPage } from '../pages/LawPage';
import { LoginPage } from '../pages/LoginPage';
import { OfflineRecapPage } from '../pages/OfflineRecapPage';
import { PoliticsPage } from '../pages/PoliticsPage';
import { RealEstatePage } from '../pages/RealEstatePage';
import { StockMarketPage } from '../pages/StockMarketPage';
import { UnderworldPage } from '../pages/UnderworldPage';

const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <RedirectIfAuthenticated>
        <LoginPage />
      </RedirectIfAuthenticated>
    ),
  },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <CityPage /> },
          { path: 'character', element: <CharacterPage /> },
          { path: 'finance', element: <FinancePage /> },
          { path: 'real-estate', element: <RealEstatePage /> },
          { path: 'business', element: <BusinessPage /> },
          { path: 'stocks', element: <StockMarketPage /> },
          { path: 'education', element: <EducationPage /> },
          { path: 'law', element: <LawPage /> },
          { path: 'politics', element: <PoliticsPage /> },
          { path: 'underworld', element: <UnderworldPage /> },
          { path: 'recap', element: <OfflineRecapPage /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
