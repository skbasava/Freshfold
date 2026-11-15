import type { Role } from "@laundry/contracts";

export interface UserSession {
  user: {
    name: string;
    role: Role;
  };
  hub: {
    id: string;
    name: string;
  };
  today: number;
}

