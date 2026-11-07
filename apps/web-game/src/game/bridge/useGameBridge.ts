import type { GameSocket } from '../../shared/realtime/socket';
import { getGameSocket } from '../../shared/realtime/socket';

/**
 * React <-> Phaser bridge.
 *
 * Rules:
 * - Phaser owns canvas rendering and input inside the canvas.
 * - React owns HTML UI, routing and server state.
 * - Communication goes through this typed bridge, never through globals.
 */
export interface CityBridge {
  socket: GameSocket;
  onSelectPlot: (plotId: string) => void;
}

let current: CityBridge | null = null;

export function createCityBridge(onSelectPlot: (plotId: string) => void): CityBridge {
  current = { socket: getGameSocket(), onSelectPlot };
  return current;
}

export function getCityBridge(): CityBridge | null {
  return current;
}

export function disposeCityBridge(): void {
  current = null;
}
