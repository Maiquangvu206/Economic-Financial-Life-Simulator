import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { StockMarketController } from './stock-market.controller.js';
import { PlaceOrderRequestSchema } from '@efls/contracts';

const controller = new StockMarketController();

export const stockMarketRouter: Router = Router();

stockMarketRouter.use(attachActor);

stockMarketRouter.get('/tickers', asyncHandler(controller.getTickers));
stockMarketRouter.get('/orderbook/:tickerId', asyncHandler(controller.getOrderBook));
stockMarketRouter.get('/snapshot', asyncHandler(controller.getMarketSnapshot));
stockMarketRouter.get('/orders', asyncHandler(controller.getOrders));
stockMarketRouter.post(
  '/orders',
  validateBody(PlaceOrderRequestSchema),
  asyncHandler(controller.placeOrder),
);
stockMarketRouter.delete('/orders/:orderId', asyncHandler(controller.cancelOrder));
stockMarketRouter.get('/portfolio', asyncHandler(controller.getPortfolio));
stockMarketRouter.get('/trades', asyncHandler(controller.getTrades));
