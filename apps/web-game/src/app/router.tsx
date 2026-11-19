import { Suspense, lazy, type ReactElement } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { RedirectIfAuthenticated, RequireAuth } from '../features/auth/guards';
import { AppLayout } from '../shared/layout/AppLayout';
import { LoginPage } from '../pages/LoginPage';

const CityPage = lazy(() => import('../pages/CityPage').then((m) => ({ default: m.CityPage })));
const CharacterPage = lazy(() => import('../pages/CharacterPage').then((m) => ({ default: m.CharacterPage })));
const CharacterWellnessPage = lazy(() =>
  import('../pages/CharacterWellnessPage').then((m) => ({ default: m.CharacterWellnessPage })),
);
const CharacterAccountPage = lazy(() =>
  import('../pages/CharacterAccountPage').then((m) => ({ default: m.CharacterAccountPage })),
);
const EducationPage = lazy(() => import('../pages/EducationPage').then((m) => ({ default: m.EducationPage })));
const RecruitmentPage = lazy(() => import('../pages/RecruitmentPage').then((m) => ({ default: m.RecruitmentPage })));
const FinancePage = lazy(() => import('../pages/FinancePage').then((m) => ({ default: m.FinancePage })));
const RealEstatePage = lazy(() => import('../pages/RealEstatePage').then((m) => ({ default: m.RealEstatePage })));
const BusinessPage = lazy(() => import('../pages/BusinessPage').then((m) => ({ default: m.BusinessPage })));
const StockMarketPage = lazy(() => import('../pages/StockMarketPage').then((m) => ({ default: m.StockMarketPage })));
const LawPage = lazy(() => import('../pages/LawPage').then((m) => ({ default: m.LawPage })));
const PoliticsPage = lazy(() => import('../pages/PoliticsPage').then((m) => ({ default: m.PoliticsPage })));
const UnderworldPage = lazy(() => import('../pages/UnderworldPage').then((m) => ({ default: m.UnderworldPage })));
const GiftCodesPage = lazy(() => import('../pages/GiftCodesPage').then((m) => ({ default: m.GiftCodesPage })));
const OfflineRecapPage = lazy(() => import('../pages/OfflineRecapPage').then((m) => ({ default: m.OfflineRecapPage })));

function PageLoader() {
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center text-sm text-slate-500">
      Đang tải trang...
    </div>
  );
}

function withSuspense(element: ReactElement) {
  return <Suspense fallback={<PageLoader />}>{element}</Suspense>;
}

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
          { index: true, element: withSuspense(<CityPage />) },
          { path: 'character', element: withSuspense(<CharacterPage />) },
          { path: 'character/wellness', element: withSuspense(<CharacterWellnessPage />) },
          { path: 'character/account', element: withSuspense(<CharacterAccountPage />) },
          { path: 'education', element: withSuspense(<EducationPage />) },
          { path: 'recruitment', element: withSuspense(<RecruitmentPage />) },
          { path: 'finance', element: withSuspense(<FinancePage />) },
          { path: 'real-estate', element: withSuspense(<RealEstatePage />) },
          { path: 'business', element: withSuspense(<BusinessPage />) },
          { path: 'stocks', element: withSuspense(<StockMarketPage />) },
          { path: 'law', element: withSuspense(<LawPage />) },
          { path: 'politics', element: withSuspense(<PoliticsPage />) },
          { path: 'underworld', element: withSuspense(<UnderworldPage />) },
          { path: 'gift-codes', element: withSuspense(<GiftCodesPage />) },
          { path: 'recap', element: withSuspense(<OfflineRecapPage />) },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
