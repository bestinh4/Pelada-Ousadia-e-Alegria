import React, { useState, useEffect } from 'react';
import { Player, Page, Match } from '../types.ts';
import { MASTER_ADMIN_EMAIL, MAIN_LOGO_URL } from '../constants.tsx';
import { db, doc, updateDoc, deleteDoc, collection, addDoc } from '../services/firebase.ts';

interface PlayerListProps {
  players: Player[];
  currentUser: any;
  match: Match | null;
  onPageChange: (page: Page) => void;
}

const PlayerList: React.FC<PlayerListProps> = ({ players, currentUser, match, onPageChange }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'confirmed' | 'goalkeeper' | 'monthly' | 'guest'>('all');
  const [selectedPlayerForStats, setSelectedPlayerForStats] = useState<Player | null>(null);
  const [statsData, setStatsData] = useState({ 
    name: '',
    position: 'Atacante',
    goals: 0,
    role: 'player' as 'admin' | 'player',
    playerType: 'avulso' as 'mensalista' | 'avulso',
    status: 'presente' as 'presente' | 'pendente' | 'ausente',
    suplenteNextMatch: false
  });
  const [isSavingStats, setIsSavingStats] = useState(false);
  const [copiedFeedback, setCopiedFeedback] = useState(false);

  const adminUser = players.find(p => 
    (currentUser?.uid && p.id === currentUser.uid) || 
    (currentUser?.email && p.email && p.email.toLowerCase() === currentUser.email.toLowerCase())
  );
  const isCurrentUserAdmin = 
    currentUser?.email === MASTER_ADMIN_EMAIL || 
    currentUser?.role === 'admin' || 
    adminUser?.role === 'admin';

  const openEditModal = (player: Player) => {
    setSelectedPlayerForStats(player);
    setStatsData({
      name: player.name || '',
      position: player.position || 'Atacante',
      goals: player.goals || 0,
      role: player.role || 'player',
      playerType: player.playerType || 'avulso',
      status: player.status || 'presente',
      suplenteNextMatch: !!player.suplenteNextMatch
    });
  };

  const handleToggleSuplentePenalty = async (player: Player) => {
    if (!isCurrentUserAdmin) return;
    const newPenalty = !player.suplenteNextMatch;
    try {
      await updateDoc(doc(db, "players", player.id), {
        suplenteNextMatch: newPenalty
      });
    } catch (e) {
      alert("Erro ao alterar penalidade do atleta.");
    }
  };

  const handleQuickChangePosition = async (playerId: string, newPosition: string) => {
    if (!isCurrentUserAdmin) return;
    try {
      await updateDoc(doc(db, "players", playerId), {
        position: newPosition
      });
    } catch (e) {
      alert("Erro ao alterar posição do atleta.");
    }
  };

  const fieldSlots = 24; // Exatamente 24 jogadores de linha (6 por time x 4 times)
  const gkSlots = 4; // Exatamente e estritamente 4 vagas para goleiros (1 por time)
  const totalSlots = fieldSlots + gkSlots; // Total 28 convocados (7 por time)

  // Garantir que a partida no banco de dados esteja com exatamente 4 vagas de goleiro e 24 de linha
  useEffect(() => {
    if (match?.id && (match.gkSlots !== 4 || match.fieldSlots !== 24)) {
      updateDoc(doc(db, "matches", match.id), { gkSlots: 4, fieldSlots: 24 }).catch(() => {});
    }
  }, [match]);

  // Ordenar jogadores confirmados por tempo de confirmação
  const sortedPresent = [...players]
    .filter(p => p.status === 'presente')
    .sort((a, b) => {
      const timeA = a.confirmedAt ? new Date(a.confirmedAt).getTime() : new Date(a.createdAt || 0).getTime();
      const timeB = b.confirmedAt ? new Date(b.confirmedAt).getTime() : new Date(b.createdAt || 0).getTime();
      return timeA - timeB;
    });

  const confirmedGKs: Player[] = [];
  const waitingGKs: Player[] = [];
  const confirmedField: Player[] = [];
  const waitingField: Player[] = [];

  sortedPresent.forEach(p => {
    // Atletas que colocaram o nome e não compareceram na pelada anterior ficam como suplentes automaticamente
    if (p.suplenteNextMatch) {
      if (p.position === 'Goleiro') {
        waitingGKs.push(p);
      } else {
        waitingField.push(p);
      }
      return;
    }

    if (p.position === 'Goleiro') {
      if (confirmedGKs.length < gkSlots) {
        confirmedGKs.push(p);
      } else {
        waitingGKs.push(p);
      }
    } else {
      if (confirmedField.length < fieldSlots) {
        confirmedField.push(p);
      } else {
        waitingField.push(p);
      }
    }
  });

  const confirmed = [...confirmedGKs, ...confirmedField];
  const waitingList = [...waitingGKs, ...waitingField];
  const remainingSlots = Math.max(0, totalSlots - confirmed.length);

  // Filtro
  const filteredPlayers = players.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.position.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (selectedFilter === 'confirmed') return p.status === 'presente';
    if (selectedFilter === 'goalkeeper') return p.position === 'Goleiro';
    if (selectedFilter === 'monthly') return p.playerType === 'mensalista';
    if (selectedFilter === 'guest') return p.playerType === 'avulso';
    return true;
  });

  const handleShareRoster = () => {
    const dateStr = match?.date ? new Date(match.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }) : 'Sábado';
    const timeStr = match?.time || '20h00';

    let text = `⚽ *OUSADIA & ALEGRIA F.C.* ⚽\n`;
    text += `📅 Pelada de ${dateStr} • ${timeStr}\n`;
    text += `🏟️ ${match?.location || 'Granja Cantinho do Céu'}\n\n`;
    text += `*CONFIRMADOS (${confirmed.length}/${totalSlots}):*\n`;
    
    confirmedGKs.forEach((p, idx) => {
      const isPaid = p.playerType === 'mensalista' ? p.monthlyPaid : p.paymentStatus === 'pago';
      text += `${String(idx + 1).padStart(2, '0')}. ${p.name} (GK) [${p.goals || 0}G] [${isPaid ? 'PIX OK' : 'PIX PENDENTE'}]\n`;
    });

    confirmedField.forEach((p, idx) => {
      const isPaid = p.playerType === 'mensalista' ? p.monthlyPaid : p.paymentStatus === 'pago';
      text += `${String(confirmedGKs.length + idx + 1).padStart(2, '0')}. ${p.name} [${p.goals || 0}G] [${isPaid ? 'PIX OK' : 'PIX PENDENTE'}]\n`;
    });

    if (waitingList.length > 0) {
      text += `\n⏳ *FILA DE ESPERA:*\n`;
      waitingList.forEach((p, idx) => {
        text += `#${idx + 1}. ${p.name} (${p.position})\n`;
      });
    }

    text += `\n🔗 Confirme sua presença no app: https://pelada-app.vercel.app/`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedFeedback(true);
        setTimeout(() => setCopiedFeedback(false), 2500);
      });
    }

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handlePullToMatch = async (playerId: string) => {
    if (!isCurrentUserAdmin) return;
    try {
      await updateDoc(doc(db, "players", playerId), {
        status: 'presente',
        confirmedAt: new Date().toISOString()
      });
    } catch (e) {
      alert("Erro ao puxar atleta.");
    }
  };

  const handleToggleStatus = async (player: Player) => {
    if (!isCurrentUserAdmin) return;
    const nextStatus = player.status === 'presente' ? 'ausente' : player.status === 'ausente' ? 'pendente' : 'presente';
    await updateDoc(doc(db, "players", player.id), {
      status: nextStatus,
      confirmedAt: nextStatus === 'presente' ? new Date().toISOString() : null
    }).catch(() => {});
  };

  const handleDeletePlayer = async (player: Player) => {
    if (!isCurrentUserAdmin) return;
    if (!confirm(`Remover atleta "${player.name}" permanentemente?`)) return;
    await deleteDoc(doc(db, "players", player.id)).catch(() => {});
  };

  const handleSaveStats = async () => {
    if (!selectedPlayerForStats || !isCurrentUserAdmin) return;
    setIsSavingStats(true);
    try {
      const isNowPresent = statsData.status === 'presente';
      await updateDoc(doc(db, "players", selectedPlayerForStats.id), {
        name: statsData.name.trim() || selectedPlayerForStats.name,
        position: statsData.position,
        role: statsData.role,
        playerType: statsData.playerType,
        status: statsData.status,
        goals: Math.max(0, Number(statsData.goals) || 0),
        suplenteNextMatch: statsData.suplenteNextMatch,
        confirmedAt: isNowPresent ? (selectedPlayerForStats.confirmedAt || new Date().toISOString()) : null
      });
      setSelectedPlayerForStats(null);
    } catch (e) {
      alert("Erro ao salvar alterações do atleta.");
    } finally {
      setIsSavingStats(false);
    }
  };

  return (
    <div className="flex flex-col w-full max-w-2xl mx-auto px-margin pb-space-xl gap-space-md animate-fade-in">
      {/* SUMMARY BANNER */}
      <div className="relative w-full rounded-2xl bg-surface-container-lowest p-space-md shadow-[0_12px_36px_rgba(0,58,117,0.06)] overflow-hidden border border-surface-container-high/40 transition-all">
        {/* Stadium Aura Decoration */}
        <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full bg-primary-container/10 blur-2xl pointer-events-none animate-pulse-slow"></div>
        <div className="absolute -left-12 -bottom-12 w-36 h-36 rounded-full bg-secondary/10 blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col gap-space-sm">
          {/* Header Row: Title + Logo Badge */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-primary-container/10 text-primary-container flex items-center justify-center shrink-0 border border-primary-container/20">
                <span className="material-symbols-outlined text-[22px]">groups</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary-container animate-ping"></span>
                  <span className="font-headline-sm text-headline-sm text-navy-deep font-bold">
                    {match ? `Pelada • ${match.time || '20h00'}` : 'Pelada de Sábado • 20h00'}
                  </span>
                </div>
                <span className="font-body-sm text-body-sm text-outline">
                  Lista Oficial de Convocados
                </span>
              </div>
            </div>

            <span className="bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md px-2.5 py-1 rounded-full uppercase tracking-wider font-semibold">
              {match?.location ? match.location.toUpperCase() : 'GRANJA CANTINHO DO CÉU'}
            </span>
          </div>

          {/* Capacity Counter */}
          <div className="flex flex-col gap-1.5 mt-1">
            <div className="flex justify-between items-baseline">
              <span className="font-label-caps text-label-caps text-on-surface-variant tracking-wider">
                OCUPAÇÃO TOTAL
              </span>
              <div className="flex items-baseline gap-1">
                <span className="font-headline-lg-mobile text-headline-lg-mobile text-primary-container leading-none">
                  {confirmed.length}
                </span>
                <span className="font-body-md text-body-md text-on-surface-variant">
                  / {totalSlots} convocados
                </span>
              </div>
            </div>

            {/* Progress Track */}
            <div className="w-full h-2.5 bg-surface-container rounded-full overflow-hidden p-0.5">
              <div 
                className="h-full rounded-full bg-gradient-to-r from-navy-deep via-secondary to-primary-container transition-all duration-700" 
                style={{ width: `${Math.min(100, (confirmed.length / totalSlots) * 100)}%` }}
              ></div>
            </div>

            <span className="font-label-md text-label-md text-outline">
              {remainingSlots === 0 
                ? 'Lista principal completa! Novos confirmados entram na fila de espera.'
                : `Faltam ${remainingSlots} vagas para fechar os 4 times`}
            </span>
          </div>

          {/* Live Metric Pills - Indicadores Exatos */}
          <div className="grid grid-cols-3 gap-2.5 pt-1.5">
            <div className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-surface-container-low text-center border border-surface-container-high/40">
              <div className="flex items-baseline gap-1">
                <span className="font-headline-sm text-headline-sm text-navy-deep font-bold">
                  {confirmedField.length}
                </span>
                <span className="text-[11px] text-outline font-semibold">
                  /{fieldSlots}
                </span>
              </div>
              <span className="font-label-md text-label-md text-on-surface-variant font-medium">
                Linha
              </span>
            </div>

            <div className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-surface-container-low text-center border border-surface-container-high/40">
              <div className="flex items-baseline gap-1">
                <span className="font-headline-sm text-headline-sm text-primary-container font-bold">
                  {confirmedGKs.length}
                </span>
                <span className="text-[11px] text-outline font-semibold">
                  /{gkSlots}
                </span>
              </div>
              <span className="font-label-md text-label-md text-on-surface-variant font-medium">
                Goleiros
              </span>
            </div>

            <div className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-surface-container-low text-center border border-surface-container-high/40">
              <span className="font-headline-sm text-headline-sm text-amber-700 font-bold">
                {waitingList.length}
              </span>
              <span className="font-label-md text-label-md text-on-surface-variant font-medium">
                Suplentes
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SEARCH & TACTICAL FILTERS */}
      <div className="flex flex-col gap-space-sm">
        {/* Tactical Search Field */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
              search
            </span>
            <input 
              type="text" 
              id="player-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome, camisa ou posição..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-container-lowest text-on-surface font-body-md text-body-md shadow-sm outline-none placeholder:text-outline focus:bg-canvas-white transition-all border border-surface-container-high/40"
            />
          </div>
        </div>

        {/* Filter Pills (Scrollable) */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar py-0.5">
          <button 
            onClick={() => setSelectedFilter('all')}
            className={`whitespace-nowrap px-3.5 py-1.5 rounded-full font-label-md text-label-md transition-all active:scale-95 shadow-sm ${
              selectedFilter === 'all' 
                ? 'bg-navy-deep text-on-secondary' 
                : 'bg-surface-container-lowest text-navy-deep hover:bg-surface-container-high'
            }`}
          >
            Todos ({players.length})
          </button>
          <button 
            onClick={() => setSelectedFilter('confirmed')}
            className={`whitespace-nowrap px-3.5 py-1.5 rounded-full font-label-md text-label-md transition-all active:scale-95 shadow-sm ${
              selectedFilter === 'confirmed' 
                ? 'bg-navy-deep text-on-secondary' 
                : 'bg-surface-container-lowest text-navy-deep hover:bg-surface-container-high'
            }`}
          >
            Confirmados ({confirmed.length})
          </button>
          <button 
            onClick={() => setSelectedFilter('goalkeeper')}
            className={`whitespace-nowrap px-3.5 py-1.5 rounded-full font-label-md text-label-md transition-all active:scale-95 shadow-sm ${
              selectedFilter === 'goalkeeper' 
                ? 'bg-navy-deep text-on-secondary' 
                : 'bg-surface-container-lowest text-navy-deep hover:bg-surface-container-high'
            }`}
          >
            Goleiros ({players.filter(p => p.position === 'Goleiro').length})
          </button>
          <button 
            onClick={() => setSelectedFilter('monthly')}
            className={`whitespace-nowrap px-3.5 py-1.5 rounded-full font-label-md text-label-md transition-all active:scale-95 shadow-sm ${
              selectedFilter === 'monthly' 
                ? 'bg-navy-deep text-on-secondary' 
                : 'bg-surface-container-lowest text-navy-deep hover:bg-surface-container-high'
            }`}
          >
            Mensalistas
          </button>
          <button 
            onClick={() => setSelectedFilter('guest')}
            className={`whitespace-nowrap px-3.5 py-1.5 rounded-full font-label-md text-label-md transition-all active:scale-95 shadow-sm ${
              selectedFilter === 'guest' 
                ? 'bg-navy-deep text-on-secondary' 
                : 'bg-surface-container-lowest text-navy-deep hover:bg-surface-container-high'
            }`}
          >
            Avulsos
          </button>
        </div>
      </div>

      {/* ROSTER SECTION */}
      <div className="flex flex-col gap-space-sm" id="player-roster-list">
        {filteredPlayers.length > 0 ? (
          filteredPlayers.map((player, idx) => {
            const isGK = player.position === 'Goleiro';
            const isPresent = player.status === 'presente';
            const isAbsent = player.status === 'ausente';
            const isPaid = player.playerType === 'mensalista' ? player.monthlyPaid : player.paymentStatus === 'pago';

            const jerseyNum = player.number || (idx + 1);
            const jerseyFormatted = String(jerseyNum).padStart(2, '0');

            return (
              <div 
                key={player.id}
                className={`player-card relative w-full rounded-2xl p-space-md shadow-[0_4px_20px_rgba(0,58,117,0.05)] transition-all duration-300 hover:shadow-md flex flex-col gap-2.5 animate-slide-up border border-surface-container-high/40 ${
                  isAbsent 
                    ? 'bg-surface-container-low/70 opacity-80' 
                    : 'bg-surface-container-lowest/95 backdrop-blur-md'
                }`}
                style={{ animationDelay: `${idx * 30}ms` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Jersey Number */}
                    <span 
                      className={`font-scoreboard-num text-[36px] leading-none tracking-tighter w-7 text-center shrink-0 ${
                        isPresent 
                          ? (isGK ? 'text-secondary' : 'text-primary-container') 
                          : 'text-outline'
                      }`}
                    >
                      {jerseyFormatted}
                    </span>

                    {/* Avatar */}
                    <div className={`relative w-12 h-12 rounded-full overflow-hidden shrink-0 shadow-sm ${isAbsent ? 'grayscale' : ''}`}>
                      <img 
                        src={player.photoUrl} 
                        alt={player.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    {/* Name & Category */}
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`font-headline-sm text-headline-sm text-navy-deep break-words ${isAbsent ? 'line-through text-on-surface-variant' : ''}`}>
                          {player.name}
                        </span>
                        {isGK && (
                          <span className="font-label-caps text-label-caps text-primary-container px-1.5 py-0.5 rounded bg-primary-fixed/30 text-[11px] leading-none font-bold shrink-0">
                            GK
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isCurrentUserAdmin ? (
                          <select
                            value={player.position}
                            onChange={(e) => handleQuickChangePosition(player.id, e.target.value)}
                            className="text-[12px] font-bold text-navy-deep bg-surface-container-high/60 rounded-md px-1.5 py-0.5 border border-surface-container-high outline-none cursor-pointer hover:bg-surface-container active:scale-95 transition-all"
                            title="Alterar posição cadastrada do atleta"
                          >
                            <option value="Goleiro">🧤 Goleiro</option>
                            <option value="Zagueiro">🛡️ Zagueiro</option>
                            <option value="Lateral">⚡ Lateral</option>
                            <option value="Volante">⚓ Volante</option>
                            <option value="Meia">🎯 Meia</option>
                            <option value="Meia-atacante">🪄 Meia-atacante</option>
                            <option value="Atacante">⚽ Atacante</option>
                          </select>
                        ) : (
                          <span className="font-semibold text-navy-deep text-body-sm">{player.position}</span>
                        )}
                        <span className="text-outline text-xs">•</span>
                        <span className="font-body-sm text-body-sm text-outline break-words">
                          {player.playerType === 'mensalista' ? 'Mensalista VIP' : 'Avulso'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status Badges */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span 
                      onClick={() => handleToggleStatus(player)}
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-label-md text-[11px] font-semibold select-none ${
                        isCurrentUserAdmin ? 'cursor-pointer hover:opacity-80 active:scale-95' : ''
                      } ${
                        isPresent
                          ? 'bg-tertiary-fixed text-on-tertiary-fixed'
                          : isAbsent
                            ? 'bg-error-container text-on-error-container'
                            : 'bg-surface-container-highest text-on-surface-variant'
                      }`}
                      title={isCurrentUserAdmin ? "Clique para alternar status" : undefined}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        isPresent ? 'bg-tertiary animate-pulse' : isAbsent ? 'bg-error' : 'bg-outline'
                      }`}></span>
                      {isPresent ? 'PRESENTE' : isAbsent ? 'AUSENTE' : 'PENDENTE'}
                    </span>

                    <span className={`inline-flex items-center px-2 py-0.5 rounded font-label-md text-[10px] font-bold ${
                      isPaid 
                        ? 'bg-secondary-fixed text-on-secondary-fixed' 
                        : 'bg-primary-fixed text-on-primary-fixed-variant'
                    }`}>
                      {isPaid ? 'PIX OK' : 'PIX PENDENTE'}
                    </span>

                    {player.suplenteNextMatch && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                        ⚠️ Suplente (Faltoso)
                      </span>
                    )}
                  </div>
                </div>

                {/* Ações de Administração */}
                {isCurrentUserAdmin && (
                  <div className="flex items-center justify-end gap-3 pt-2 border-t border-surface-container-high/40 mt-0.5 flex-wrap">
                    <button 
                      onClick={() => handleToggleSuplentePenalty(player)}
                      className={`text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-transform ${
                        player.suplenteNextMatch ? 'text-amber-700 hover:underline' : 'text-outline hover:text-amber-700'
                      }`}
                      title="Atletas que colocam o nome na lista e não comparecem ficam como suplentes automaticamente na próxima pelada"
                    >
                      <span className="material-symbols-outlined text-[15px]">
                        {player.suplenteNextMatch ? 'event_available' : 'person_cancel'}
                      </span>
                      <span>{player.suplenteNextMatch ? 'Remover Suplência' : 'Marcar Falta (Suplente)'}</span>
                    </button>
                    <button 
                      onClick={() => openEditModal(player)}
                      className="text-[11px] font-bold text-secondary flex items-center gap-1 hover:underline active:scale-95 transition-transform"
                    >
                      <span className="material-symbols-outlined text-[15px]">tune</span>
                      Editar
                    </button>
                    <button 
                      onClick={() => handleDeletePlayer(player)}
                      className="text-[11px] font-bold text-error flex items-center gap-1 hover:underline active:scale-95 transition-transform"
                    >
                      <span className="material-symbols-outlined text-[15px]">delete</span>
                      Excluir
                    </button>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="p-space-lg rounded-2xl bg-canvas-white text-center text-outline font-body-sm shadow-sm">
            Nenhum atleta encontrado para o filtro selecionado.
          </div>
        )}
      </div>

      {/* WAITING LIST SECTION (ADMIN ACTION) */}
      {waitingList.length > 0 && (
        <div className="flex flex-col gap-space-sm mt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[20px]">hourglass_top</span>
              <span className="font-headline-sm text-headline-sm text-navy-deep">
                Fila de Espera ({waitingList.length})
              </span>
            </div>
            <span className="font-label-md text-label-md text-outline">
              Próximo da fila assume
            </span>
          </div>

          {waitingList.map((player, idx) => (
            <div 
              key={player.id}
              className="relative w-full rounded-2xl bg-surface-container-lowest p-space-md shadow-[0_4px_20px_rgba(0,58,117,0.04)] flex items-center justify-between gap-3 border border-surface-container-high/40 animate-fade-in"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-7 h-7 rounded-full bg-secondary-fixed flex items-center justify-center font-label-caps text-label-caps text-on-secondary-fixed shrink-0 font-bold">
                  #{idx + 1}
                </div>
                <div className="relative w-10 h-10 rounded-full overflow-hidden shrink-0">
                  <img 
                    src={player.photoUrl} 
                    alt={player.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-headline-sm text-headline-sm text-navy-deep break-words">
                    {player.name}
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isCurrentUserAdmin ? (
                      <select
                        value={player.position}
                        onChange={(e) => handleQuickChangePosition(player.id, e.target.value)}
                        className="text-[11px] font-bold text-secondary bg-surface-container-high/60 rounded px-1.5 py-0.5 border border-surface-container-high outline-none cursor-pointer hover:bg-surface-container"
                        title="Alterar posição cadastrada do atleta na fila"
                      >
                        <option value="Goleiro">🧤 Goleiro</option>
                        <option value="Zagueiro">🛡️ Zagueiro</option>
                        <option value="Lateral">⚡ Lateral</option>
                        <option value="Volante">⚓ Volante</option>
                        <option value="Meia">🎯 Meia</option>
                        <option value="Meia-atacante">🪄 Meia-atacante</option>
                        <option value="Atacante">⚽ Atacante</option>
                      </select>
                    ) : (
                      <span className="font-body-sm text-body-sm text-tertiary font-semibold">
                        {player.position}
                      </span>
                    )}
                    <span className="text-outline text-xs">• {player.playerType === 'mensalista' ? 'Mensalista VIP' : 'Avulso'}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isCurrentUserAdmin && (
                  <button 
                    onClick={() => openEditModal(player)}
                    className="p-2 rounded-xl bg-surface-container text-navy-deep hover:bg-surface-container-high active:scale-95 transition-all"
                    title="Editar Atleta da Fila"
                  >
                    <span className="material-symbols-outlined text-[18px]">tune</span>
                  </button>
                )}
                {isCurrentUserAdmin && (
                  <button 
                    onClick={() => handlePullToMatch(player.id)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-primary-container to-primary-bright text-on-primary font-label-lg text-label-lg shadow-md shadow-primary/20 active:scale-95 transition-transform"
                  >
                    <span className="material-symbols-outlined text-[18px]">add_circle</span>
                    <span>PUXAR</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FLOATING STICKY SHARE ACTION (ZAP DA LISTA) */}
      <div className="sticky bottom-2 w-full pt-2 z-40">
        <button 
          onClick={handleShareRoster}
          className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-tertiary-container via-tertiary to-navy-deep text-on-tertiary font-headline-sm text-headline-sm flex items-center justify-center gap-2.5 shadow-[0_10px_25px_-5px_rgba(0,129,88,0.4)] active:scale-[0.98] transition-all duration-200"
        >
          <span className="material-symbols-outlined text-[22px]">send_to_mobile</span>
          <span className="tracking-wide">
            {copiedFeedback ? 'COPIADO COM SUCESSO! ABRINDO WHATSAPP...' : 'ZAP DA LISTA • COPIAR ESCALAÇÃO'}
          </span>
        </button>
      </div>

      {/* MODAL: EDITAR ATLETA & GOLS MARCADOS */}
      {selectedPlayerForStats && (
        <div className="fixed inset-0 bg-navy-deep/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-canvas-white rounded-2xl p-6 w-full max-w-md shadow-2xl flex flex-col gap-4 animate-pop-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-surface-container-high/60 pb-3">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse"></span>
                  <h3 className="font-headline-sm text-headline-sm text-navy-deep font-bold uppercase">
                    GERENCIAR ATLETA (ADMIN)
                  </h3>
                </div>
                <p className="font-body-sm text-body-sm text-outline">
                  Modifique a posição, nome, status e categoria
                </p>
              </div>
              <button 
                onClick={() => setSelectedPlayerForStats(null)} 
                className="w-8 h-8 rounded-full bg-surface-container-low hover:bg-surface-container flex items-center justify-center text-outline hover:text-navy-deep transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-3.5">
              {/* NOME DO ATLETA */}
              <div>
                <label className="font-label-md text-label-md text-navy-deep font-semibold block mb-1">
                  Nome do Atleta
                </label>
                <input 
                  type="text"
                  value={statsData.name}
                  onChange={(e) => setStatsData({ ...statsData, name: e.target.value })}
                  placeholder="Nome do atleta"
                  className="w-full p-2.5 rounded-xl bg-surface-container-low border border-surface-container-high outline-none font-body-md font-semibold text-navy-deep focus:bg-canvas-white focus:border-primary-container transition-all"
                />
              </div>

              {/* POSIÇÃO TÁTICA CADASTRADA */}
              <div>
                <label className="font-label-md text-label-md text-navy-deep font-semibold block mb-1">
                  Posição Cadastrada
                </label>
                <select 
                  value={statsData.position}
                  onChange={(e) => setStatsData({ ...statsData, position: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-surface-container-low border border-surface-container-high outline-none font-body-md font-bold text-navy-deep focus:bg-canvas-white focus:border-primary-container transition-all cursor-pointer"
                >
                  <option value="Goleiro">🧤 Goleiro</option>
                  <option value="Zagueiro">🛡️ Zagueiro</option>
                  <option value="Lateral">⚡ Lateral</option>
                  <option value="Volante">⚓ Volante</option>
                  <option value="Meia">🎯 Meia</option>
                  <option value="Meia-atacante">🪄 Meia-atacante</option>
                  <option value="Atacante">⚽ Atacante</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-label-md text-label-md text-outline block mb-1">Categoria</label>
                  <select 
                    value={statsData.playerType}
                    onChange={(e) => setStatsData({ ...statsData, playerType: e.target.value as any })}
                    className="w-full p-2.5 rounded-xl bg-surface-container-low border border-surface-container-high outline-none font-body-md text-navy-deep font-medium cursor-pointer"
                  >
                    <option value="mensalista">Mensalista VIP</option>
                    <option value="avulso">Avulso</option>
                  </select>
                </div>

                <div>
                  <label className="font-label-md text-label-md text-outline block mb-1">Permissão</label>
                  <select 
                    value={statsData.role}
                    onChange={(e) => setStatsData({ ...statsData, role: e.target.value as any })}
                    className="w-full p-2.5 rounded-xl bg-surface-container-low border border-surface-container-high outline-none font-body-md text-navy-deep font-medium cursor-pointer"
                  >
                    <option value="player">Atleta</option>
                    <option value="admin">Diretoria (Admin)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-label-md text-label-md text-outline block mb-1">Status na Lista da Pelada</label>
                <select 
                  value={statsData.status}
                  onChange={(e) => setStatsData({ ...statsData, status: e.target.value as any })}
                  className="w-full p-2.5 rounded-xl bg-surface-container-low border border-surface-container-high outline-none font-body-md text-navy-deep font-bold cursor-pointer"
                >
                  <option value="presente">🟢 Presente (Confirmado)</option>
                  <option value="pendente">🟡 Pendente</option>
                  <option value="ausente">🔴 Ausente</option>
                </select>
              </div>

              {/* PENALIDADE DE SUPLENTE AUTOMÁTICO */}
              <div className="bg-amber-500/10 p-3.5 rounded-xl border border-amber-500/30 flex items-center justify-between">
                <div>
                  <label className="font-label-md text-label-md text-amber-900 font-bold flex items-center gap-1.5">
                    <span>⚠️</span> Suplente Automático
                  </label>
                  <span className="font-body-sm text-xs text-amber-800 block">
                    Colocou o nome na lista e faltou na pelada anterior
                  </span>
                </div>
                <input 
                  type="checkbox"
                  checked={statsData.suplenteNextMatch}
                  onChange={(e) => setStatsData({ ...statsData, suplenteNextMatch: e.target.checked })}
                  className="w-5 h-5 accent-amber-600 rounded cursor-pointer"
                />
              </div>

              {/* SCOUT: GOLS MARCADOS */}
              <div className="bg-surface-container-low p-3.5 rounded-xl flex items-center justify-between border border-surface-container-high/60">
                <div>
                  <label className="font-label-md text-label-md text-navy-deep font-bold flex items-center gap-1.5">
                    <span>⚽</span> Gols Marcados
                  </label>
                  <span className="font-body-sm text-body-sm text-outline">
                    Scout oficial da temporada
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStatsData({ ...statsData, goals: Math.max(0, statsData.goals - 1) })}
                    className="w-8 h-8 rounded-lg bg-surface-container-high text-navy-deep flex items-center justify-center font-bold text-lg active:scale-95"
                  >
                    -
                  </button>
                  <input 
                    type="number"
                    min="0"
                    value={statsData.goals}
                    onChange={(e) => setStatsData({ ...statsData, goals: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-16 p-2 rounded-lg bg-canvas-white text-center font-scoreboard-num text-[22px] text-primary-container font-bold border border-surface-container-high outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setStatsData({ ...statsData, goals: statsData.goals + 1 })}
                    className="w-8 h-8 rounded-lg bg-primary-container text-on-primary flex items-center justify-center font-bold text-lg active:scale-95 shadow-sm"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-surface-container-high/60">
              <button 
                type="button"
                onClick={() => {
                  const p = selectedPlayerForStats;
                  setSelectedPlayerForStats(null);
                  handleDeletePlayer(p);
                }}
                className="px-3 py-2 rounded-xl text-error hover:bg-error/10 font-label-md flex items-center gap-1 transition-all"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                <span>Excluir</span>
              </button>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setSelectedPlayerForStats(null)}
                  className="px-4 py-2 rounded-xl bg-surface-container-high text-navy-deep font-label-md hover:bg-surface-container-highest transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleSaveStats}
                  disabled={isSavingStats}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-primary-container to-primary-bright text-on-primary font-headline-sm flex items-center gap-1 shadow-md shadow-primary/20 active:scale-95 transition-all"
                >
                  <span>{isSavingStats ? 'Salvando...' : 'Salvar Alterações'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayerList;
