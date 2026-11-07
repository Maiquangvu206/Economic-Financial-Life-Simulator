import type { UserRole } from '@efls/contracts';

export interface SocketActor {
  id: string;
  role: UserRole;
}
