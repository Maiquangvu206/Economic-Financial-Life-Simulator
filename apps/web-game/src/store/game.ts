import { create } from 'zustand';

export interface GameState {
  day: number;
  year: number;
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  cash: number;
  netWorth: number;
  creditScore: number;
  heatLevel: number;
  energy: number;
  incomePerYear: number;
  expensePerYear: number;
  loanCount: number;
  setGameState: (partial: Partial<GameState>) => void;
  addCash: (delta: number) => void;
  setEnergy: (value: number) => void;
  addHeat: (delta: number) => void;
}

export const useGameStore = create<GameState>((set) => ({
  day: 0,
  year: 1,
  season: 'spring',
  cash: 0,
  netWorth: 0,
  creditScore: 650,
  heatLevel: 0,
  energy: 100,
  incomePerYear: 0,
  expensePerYear: 0,
  loanCount: 0,
  setGameState: (partial) => set(partial),
  addCash: (delta) => set((state) => ({ cash: Math.max(0, state.cash + delta) })),
  setEnergy: (value) => set({ energy: Math.min(100, Math.max(0, value)) }),
  addHeat: (delta) =>
    set((state) => ({ heatLevel: Math.min(100, Math.max(0, state.heatLevel + delta)) })),
}));
