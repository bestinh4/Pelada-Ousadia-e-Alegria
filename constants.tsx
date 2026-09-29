
// Fix: Removing unused and invalid import 'PastMatch' to resolve compilation error
import { Player, Match } from './types.ts';

export const MASTER_ADMIN_EMAIL = 'diiogo49@gmail.com';

export const MAIN_LOGO_URL = "/images/ousadia_alegria_crest.png?v=20";

export const MAINTENANCE_MASCOTS_IMG = "/images/maintenance_mascots.jpg";

// Sem dados genéricos: o aplicativo carrega exclusivamente dados reais do banco
export const MOCK_PLAYERS: Player[] = [];

export const CURRENT_MATCH: Match | null = null;

