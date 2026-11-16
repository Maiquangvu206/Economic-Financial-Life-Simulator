import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { CorporationController } from './corporation.controller.js';
import {
  BuyShareOfferingRequestSchema,
  CompanyInvestRequestSchema,
  CompanyOperationRequestSchema,
  CreateCompanyRequestSchema,
  CreateCompanyTaxFilingRequestSchema,
  CreateHiringPlanRequestSchema,
  CreateLedgerEntryRequestSchema,
  CreateShareOfferingRequestSchema,
  DecideHiringCandidateRequestSchema,
  DividendRequestSchema,
  IpoCompanyRequestSchema,
  RelocateCompanyPremisesRequestSchema,
  SetRevenueRetainRequestSchema,
  TakeoverRequestSchema,
} from '@efls/contracts';

const controller = new CorporationController();

export const corporationRouter: Router = Router();

corporationRouter.use(attachActor);

/** Danh sách tất cả công ty (mọi người chơi). */
corporationRouter.get('/', asyncHandler(controller.getOverview));

/** Địa điểm/cơ sở khả dụng để thành lập công ty (đất nền sở hữu hoặc BĐS thuộc công ty khác). */
corporationRouter.get('/premises-options', asyncHandler(controller.getPremisesOptions));

/** Danh sách đợt chào bán cổ phần (thị trường). */
corporationRouter.get('/share-offerings', asyncHandler(controller.listShareOfferings));
/** Mua cổ phần trong đợt chào bán (ai mua trước được trước). */
corporationRouter.post(
  '/share-offerings/:offeringId/buy',
  validateBody(BuyShareOfferingRequestSchema),
  asyncHandler(controller.buyShareOffering),
);

/** Chọn/đổi trụ sở công ty (bắt buộc khi trụ sở cũ bị phá dỡ). */
corporationRouter.post(
  '/:companyId/premises',
  validateBody(RelocateCompanyPremisesRequestSchema),
  asyncHandler(controller.relocatePremises),
);

/** Chi tiết một công ty (kèm danh sách cổ đông). */
corporationRouter.get('/:companyId', asyncHandler(controller.getCompany));

/** Thành lập công ty mới (trừ vốn từ ví cá nhân). */
corporationRouter.post(
  '/',
  validateBody(CreateCompanyRequestSchema),
  asyncHandler(controller.createCompany),
);

/** Đầu tư vốn vào một công ty. */
corporationRouter.post(
  '/:companyId/invest',
  validateBody(CompanyInvestRequestSchema),
  asyncHandler(controller.investCompany),
);

/** Niêm yết công ty (IPO): tạo mã chứng khoán, cấp cổ phiếu ban đầu. */
corporationRouter.post(
  '/:companyId/ipo',
  validateBody(IpoCompanyRequestSchema),
  asyncHandler(controller.ipoCompany),
);

/** (Đã tắt) Cổ tức thủ công: hệ thống tự động chia cổ tức theo kỳ 30 ngày sau khi khai/nộp thuế. */
corporationRouter.post(
  '/:companyId/dividend',
  asyncHandler(controller.payDividend),
);

/** Khiêu kích thác đoá công ty (>51% cổ phiếu). */
corporationRouter.post(
  '/:companyId/takeover',
  validateBody(TakeoverRequestSchema),
  asyncHandler(controller.takeoverCompany),
);

/** Danh sách nhân sự của công ty (chủ sở hữu). */
corporationRouter.get('/:companyId/employees', asyncHandler(controller.getEmployees));

/** Sa thải nhân sự. */
corporationRouter.post(
  '/:companyId/employees/:employmentId/fire',
  asyncHandler(controller.fireEmployee),
);

/** Giải thể/phá sản công ty (chủ sở hữu). */
corporationRouter.post('/:companyId/dissolve', asyncHandler(controller.dissolveCompany));

/** (Đã tắt) Ghi nhận doanh thu thủ công: doanh thu được hệ thống tự động tính/chốt theo chu kỳ 30 ngày game. */
corporationRouter.post(
  '/:companyId/revenue',
  asyncHandler(controller.collectRevenue),
);

/** Chi OPEX từ quỹ công ty. */
corporationRouter.post(
  '/:companyId/opex',
  validateBody(CompanyOperationRequestSchema),
  asyncHandler(controller.payOpex),
);

/** HR & Kế toán (tổng hợp): kế hoạch tuyển dụng AI, nhân sự, sổ cái, khai thuế. */
corporationRouter.get('/:companyId/hr-accounting', asyncHandler(controller.getHrAccounting));

/** AI đề xuất kế hoạch tuyển dụng (chờ chủ doanh nghiệp duyệt). */
corporationRouter.post(
  '/:companyId/hiring-plans',
  validateBody(CreateHiringPlanRequestSchema),
  asyncHandler(controller.createHiringPlan),
);

/** Duyệt/từ chối ứng viên trong kế hoạch. */
corporationRouter.post(
  '/:companyId/hiring-plans/:planId/candidates/:candidateId/decision',
  validateBody(DecideHiringCandidateRequestSchema),
  asyncHandler(controller.decideHiringCandidate),
);

/** Áp dụng kế hoạch: tuyển các ứng viên đã duyệt. */
corporationRouter.post(
  '/:companyId/hiring-plans/:planId/apply',
  asyncHandler(controller.applyHiringPlan),
);

/** Sa thải nhân sự (AI-tuyển / company_staff). */
corporationRouter.post('/:companyId/staff/:staffId/fire', asyncHandler(controller.fireStaff));

/** Ghi bút toán sổ cái (có thể khai báo lệch thực tế). */
corporationRouter.post(
  '/:companyId/ledger',
  validateBody(CreateLedgerEntryRequestSchema),
  asyncHandler(controller.addLedgerEntry),
);

/** Lập & nộp hồ sơ khai thuế doanh nghiệp (tính rủi ro trốn thuế/lách luật). */
corporationRouter.post(
  '/:companyId/tax-filings',
  validateBody(CreateCompanyTaxFilingRequestSchema),
  asyncHandler(controller.createTaxFiling),
);

/** 2B: Cấu hình % giữ lại doanh thu tự động vào quỹ công ty (áp dụng kỳ tiếp theo). */
corporationRouter.put(
  '/:companyId/revenue-retain',
  validateBody(SetRevenueRetainRequestSchema),
  asyncHandler(controller.setRevenueRetain),
);

/** 4: Đợt chào bán cổ phần (IPO) - danh sách theo công ty / tạo đợt / thị trường đã có route riêng. */
corporationRouter.get('/:companyId/share-offerings', asyncHandler(controller.listShareOfferings));
corporationRouter.post(
  '/:companyId/share-offerings',
  validateBody(CreateShareOfferingRequestSchema),
  asyncHandler(controller.createShareOffering),
);
