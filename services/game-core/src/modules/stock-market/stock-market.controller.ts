import type { Request, Response } from 'express';
import type { PlaceOrderRequest } from '@efls/contracts';
import { requireActorId } from '../../shared/http/actor.js';
import { StockMarketService } from './stock-market.service.js';

export class StockMarketController {
  constructor(private readonly service: StockMarketService = new StockMarketService()) {}

  getTickers = async (_req: Request, res: Response): Promise<void> => {
    const tickers = await this.service.getTickers();
    res.status(200).json(tickers);
  };

  getOrderBook = async (req: Request, res: Response): Promise<void> => {
    const { tickerId } = req.params as { tickerId: string };
    const book = await this.service.getOrderBook(tickerId);
    res.status(200).json(book);
  };

  getMarketSnapshot = async (_req: Request, res: Response): Promise<void> => {
    const snapshot = await this.service.getMarketSnapshot();
    res.status(200).json(snapshot);
  };

  getOrders = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const orders = await this.service.getOrders(userId);
    res.status(200).json(orders);
  };

  placeOrder = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { tickerId, side, price, amount } = req.body as PlaceOrderRequest;
    const result = await this.service.placeOrder(userId, tickerId, side, price.amount, amount);
    res.status(201).json(result);
  };

  cancelOrder = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { orderId } = req.params as { orderId: string };
    await this.service.cancelOrder(userId, orderId);
    res.status(204).end();
  };

  getPortfolio = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const portfolio = await this.service.getPortfolio(userId);
    res.status(200).json(portfolio);
  };

  getTrades = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const trades = await this.service.getTrades(userId);
    res.status(200).json(trades);
  };
}

export const stockMarketController = new StockMarketController();
