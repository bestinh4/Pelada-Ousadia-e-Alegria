
export interface Player {
  id: string;
  name: string;
  email?: string | null;
  photoUrl: string;
  number?: number;
  team?: string;
  goals: number;
  assists: number;
  concededGoals: number;
  totalGames: number;
  totalWins: number;
  position: string;
  status: 'presente' | 'pendente' | 'ausente';
  confirmedAt?: string;
  createdAt?: string;
  playerType: 'mensalista' | 'avulso';
  role?: 'admin' | 'player';
  skills?: {
    attack: number;
    defense: number;
    stamina: number;
  };
  // Fix: Adding financial tracking properties used in Ranking.tsx
  monthlyPaid?: boolean;
  paymentStatus?: 'pago' | 'pendente';
  pushEnabled?: boolean;
  fcmToken?: string | null;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: string;
}

export interface Team {
  id: string;
  name: string;
  playerIds: string[];
  hasGK: boolean;
  isComplete: boolean;
  consecutiveWins: number;
  totalWins: number;
}

export interface MatchSession {
  id: string;
  activeMatch: {
    teamAId: string | null;
    teamBId: string | null;
    scoreA: number;
    scoreB: number;
    startTime: number | null; // timestamp
  };
  queue: string[]; // IDs dos times na fila
  teams: Team[];
  status: 'inactive' | 'active';
}

export interface Match {
  id: string;
  location: string;
  date: string;
  time: string;
  type: 'Futsal' | 'Society' | 'Campo';
  price: number;
  fieldSlots: number;
  gkSlots: number;
  confirmedPlayers: number;
  createdAt: string;
}

export interface MatchHistory {
  id: string;
  teamAName: string;
  teamBName: string;
  scoreA: number;
  scoreB: number;
  winnerId: string | 'draw';
  timestamp: string;
  matchId: string; // ID da pelada (Match)
}

export enum Page {
  Login = 'login',
  Onboarding = 'onboarding',
  Dashboard = 'dashboard',
  PlayerList = 'players',
  Ranking = 'ranking',
  Finance = 'finance',
  CreateMatch = 'create-match',
  Profile = 'profile',
  TeamBalancing = 'team-balancing',
  ArenaPanel = 'arena-panel'
}
