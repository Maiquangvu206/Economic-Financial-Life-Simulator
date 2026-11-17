import type { UserRole } from '@efls/contracts';

export interface SocketActor {
  userId: string;
  characterId: string | null;
  displayName: string;
  role: UserRole;
  // backward-compat field used by existing room logic; equals userId
  id: string;
}

