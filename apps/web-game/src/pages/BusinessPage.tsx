import { useBusinessPage } from '../features/business/useBusinessPage';
import { BusinessPageView } from '../features/business/BusinessPageView';

export function BusinessPage() {
  const biz = useBusinessPage();
  return <BusinessPageView {...biz} />;
}
