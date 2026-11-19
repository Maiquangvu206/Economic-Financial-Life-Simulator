import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { RedirectIfAuthenticated, RequireAuth } from '../features/auth/guards';
import { AppLayout } from '../shared/layout/AppLayout';
import { BusinessPage } from '../pages/BusinessPage';
import { CharacterPage } from '../pages/CharacterPage';
import { CharacterWellnessPage } from '../pages/CharacterWellnessPage';
import { CharacterAccountPage } from '../pages/CharacterAccountPage';
import { CityPage } from '../pages/CityPage';
import { FinancePage } from '../pages/FinancePage';
import { GiftCodesPage } from '../pages/GiftCodesPage';
import { LawPage } from '../pages/LawPage';
import { LoginPage } from '../pages/LoginPage';
import { OfflineRecapPage } from '../pages/OfflineRecapPage';
import { PoliticsPage } from '../pages/PoliticsPage';
import { RealEstatePage } from '../pages/RealEstatePage';
import { EducationPage } from '../pages/EducationPage';
import { RecruitmentPage } from '../pages/RecruitmentPage';
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
          { path: 'character/wellness', element: <CharacterWellnessPage /> },
          { path: 'character/account', element: <CharacterAccountPage /> },
          { path: 'education', element: <EducationPage /> },
          { path: 'recruitment', element: <RecruitmentPage /> },
          { path: 'finance', element: <FinancePage /> },
          { path: 'real-estate', element: <RealEstatePage /> },
          { path: 'business', element: <BusinessPage /> },
          { path: 'stocks', element: <StockMarketPage /> },
          { path: 'law', element: <LawPage /> },
          { path: 'politics', element: <PoliticsPage /> },
          { path: 'underworld', element: <UnderworldPage /> },
          { path: 'gift-codes', element: <GiftCodesPage /> },
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
