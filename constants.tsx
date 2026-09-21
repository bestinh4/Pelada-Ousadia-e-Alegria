
// Fix: Removing unused and invalid import 'PastMatch' to resolve compilation error
import { Player, Match } from './types.ts';

export const MASTER_ADMIN_EMAIL = 'diiogo49@gmail.com';

export const MOCK_PLAYERS: Player[] = [
  // ... mantendo os mocks se necessário para testes, mas o foco é no Master Email
];

export const CURRENT_MATCH: Match = {
  id: 'match-2026-feb',
  location: 'Elite Arena Pro',
  date: '2026-02-15',
  time: '20:00',
  type: 'Society',
  price: 40.00,
  confirmedPlayers: 18,
  fieldSlots: 30,
  gkSlots: 5,
  createdAt: '2026-02-01T10:00:00Z'
};
