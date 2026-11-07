import type { Request, Response } from 'express';
import type { LoginRequest, RefreshRequest, RegisterRequest } from '@efls/contracts';
import { AuthService } from './auth.service.js';

export class AuthController {
  constructor(private readonly service: AuthService = new AuthService()) {}

  register = async (req: Request, res: Response): Promise<void> => {
    const tokens = await this.service.register(req.body as RegisterRequest);
    res.status(201).json(tokens);
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const tokens = await this.service.login(req.body as LoginRequest);
    res.status(200).json(tokens);
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.body as RefreshRequest;
    const tokens = await this.service.refresh(refreshToken);
    res.status(200).json(tokens);
  };
}
