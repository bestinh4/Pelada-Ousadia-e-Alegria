
import { Timestamp } from "firebase/firestore";

export interface Player {
  id: string;
  name: string;
  position: "Goleiro" | "Zagueiro" | "Lateral" | "Volante" | "Meia" | "Atacante";
  photoUrl: string;
  goals: number;
  assists: number;
  totalGames: number;
  totalWins: number;
  status: 'presente' | 'pendente';
  playerType: 'mensalista' | 'avulso';
  role?: 'admin' | 'player';
  suplenteNextMatch?: boolean;
  courtCheckIn?: boolean;
}

export interface Team {
  id: string;
  name: string;
  playerIds: string[];
  hasGoalkeeper: boolean;
  consecutiveWins: number;
  totalWins: number;
  isIncomplete: boolean;
}

export interface MatchSession {
  id: string;
  status: "waiting" | "active" | "finished";
  teams: Team[];
  waitingQueue: string[]; // Array de teamIds
  activeMatch: {
    teamAId: string | null;
    teamBId: string | null;
    scoreA: number;
    scoreB: number;
    startedAt: number | null; // Timestamp
  } | null;
  createdAt: number;
  drawDate?: string;
  courtPresence?: Record<string, boolean>;
  reserves?: string[]; // Atletas suplentes / excedentes além dos 24 de linha e 4 goleiros
  matchCount?: number;
  peladaStartedAt?: number;
}
