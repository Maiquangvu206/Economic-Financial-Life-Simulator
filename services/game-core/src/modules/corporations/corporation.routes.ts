import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { CorporationController } from './corporation.controller.js';
import {
  CompanyInvestRequestSchema,
  CompanyOperationRequestSchema,
  CreateCompanyRequestSchema,
  DividendRequestSchema,
  IpoCompanyRequestSchema,
  TakeoverRequestSchema,
} from '@efls/contracts';

const controller = new CorporationController();

export const corporationRouter: Router = Router();

corporationRouter.use(attachActor);

/** Danh sách tất cả công ty (mọi người chơi). */
corporationRouter.get('/', asyncHandler(controller.getOverview));

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

/** Phát hành cổ tức cho cổ đông. */
corporationRouter.post(
  '/:companyId/dividend',
  validateBody(DividendRequestSchema),
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

/** Ghi nhận doanh thu vào quỹ công ty. */
corporationRouter.post(
  '/:companyId/revenue',
  validateBody(CompanyOperationRequestSchema),
  asyncHandler(controller.collectRevenue),
);

/** Chi OPEX từ quỹ công ty. */
corporationRouter.post(
  '/:companyId/opex',
  validateBody(CompanyOperationRequestSchema),
  asyncHandler(controller.payOpex),
);
