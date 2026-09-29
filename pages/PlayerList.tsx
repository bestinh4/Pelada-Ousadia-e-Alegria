import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'confirmed' | 'waiting' | 'goalkeeper' | 'monthly' | 'guest'>('all');
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

  // 5 equipes oficiais da pelada com 4 goleiros e 30 atletas de linha (6 por time)
  const fieldSlots = match?.fieldSlots && match.fieldSlots === 30 ? match.fieldSlots : 30; 
  const gkSlots = 4; // Exatamente e estritamente 4 vagas para goleiros
  const totalSlots = fieldSlots + gkSlots; // 34 atletas titulares no total

  // Garantir que as vagas no banco sejam estritamente 4 goleiros e 30 atletas de linha
  useEffect(() => {
    if (match?.id && (match.gkSlots !== 4 || match.fieldSlots !== 30)) {
      updateDoc(doc(db, "matches", match.id), { gkSlots: 4, fieldSlots: 30 }).catch(() => {});
    }
  }, [match]);

  // Trava de rolagem de tela quando modal estiver aberto (evita descolamento em mobile)
  useEffect(() => {
    if (selectedPlayerForStats) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedPlayerForStats]);

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

  // Para atletas comuns, exibir apenas os atletas confirmados (Titulares + Suplentes), ocultando quem está pendente ou ausente
  const visibleBasePlayers = isCurrentUserAdmin ? players : sortedPresent;

  // Filtro
  const filteredPlayers = visibleBasePlayers.filter(p => {
    const safeName = (p.name || '').toLowerCase();
    const safePos = (p.position || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    const matchesSearch = safeName.includes(q) || safePos.includes(q);
    if (!matchesSearch) return false;

    if (selectedFilter === 'confirmed') return confirmed.some(c => c.id === p.id);
    if (selectedFilter === 'waiting') return waitingList.some(w => w.id === p.id);
    if (selectedFilter === 'goalkeeper') return p.position === 'Goleiro';
    if (isCurrentUserAdmin && selectedFilter === 'monthly') return p.playerType === 'mensalista';
    if (isCurrentUserAdmin && selectedFilter === 'guest') return p.playerType === 'avulso';
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
      text += `${String(idx + 1).padStart(2, '0')}. ${p.name} (GK) [${p.goals || 0}G]\n`;
    });

    confirmedField.forEach((p, idx) => {
      text += `${String(confirmedGKs.length + idx + 1).padStart(2, '0')}. ${p.name} [${p.goals || 0}G]\n`;
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
        suplenteNextMatch: false,
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
    <div className="flex flex-col w-full max-w-4xl mx-auto pb-6 gap-4 animate-fade-in">
      {/* PAINEL DE OCUPAÇÃO E COMPARTILHAMENTO */}
      <div className="w-full rounded-2xl bg-surface-container-lowest p-4 sm:p-5 shadow-[0_12px_36px_rgba(0,58,117,0.06)] border border-surface-container-high/40 flex flex-col gap-3.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary-container/10 text-primary-container flex items-center justify-center shrink-0 border border-primary-container/20">
              <span className="material-symbols-outlined text-[22px]">groups</span>
            </div>
            <div className="min-w-0">
              <h2 className="font-headline-sm text-sm sm:text-base text-navy-deep font-bold truncate">
                Lista Oficial • {confirmed.length}/{totalSlots} Confirmados
              </h2>
              <p className="font-body-sm text-xs text-outline truncate">
                {remainingSlots === 0 
                  ? 'Vagas completas • Novos confirmados entram na suplência'
                  : `Restam ${remainingSlots} vagas para fechar as 5 equipes`}
              </p>
            </div>
          </div>

          <button 
            onClick={handleShareRoster}
            className="min-h-[40px] py-2 px-3.5 rounded-xl bg-tertiary hover:opacity-95 text-on-tertiary font-headline-sm text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">share</span>
            <span>{copiedFeedback ? 'COPIADO!' : 'ZAP DA LISTA'}</span>
          </button>
        </div>

        {/* Barra de Progresso */}
        <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
          <div 
            className="h-full rounded-full bg-gradient-to-r from-navy-deep via-secondary to-primary-container transition-all duration-500" 
            style={{ width: `${Math.min(100, (confirmed.length / totalSlots) * 100)}%` }}
          ></div>
        </div>

        {/* 3 Indicadores Rápidos */}
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-surface-container-low text-center border border-surface-container-high/40">
            <span className="font-headline-sm text-sm sm:text-base text-navy-deep font-bold tabular-nums">
              {confirmedField.length}/{fieldSlots}
            </span>
            <span className="text-[11px] text-on-surface-variant font-medium">
              Linha
            </span>
          </div>

          <div className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-surface-container-low text-center border border-surface-container-high/40">
            <span className="font-headline-sm text-sm sm:text-base text-primary-container font-bold tabular-nums">
              {confirmedGKs.length}/{gkSlots}
            </span>
            <span className="text-[11px] text-on-surface-variant font-medium">
              Goleiros
            </span>
          </div>

          <div className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-surface-container-low text-center border border-surface-container-high/40">
            <span className="font-headline-sm text-sm sm:text-base text-amber-700 font-bold tabular-nums">
              {waitingList.length}
            </span>
            <span className="text-[11px] text-on-surface-variant font-medium">
              Suplentes
            </span>
          </div>
        </div>
      </div>

      {/* BUSCA E FILTROS */}
      <div className="flex flex-col gap-2.5">
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
            search
          </span>
          <input 
            type="text" 
            id="player-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar atleta por nome ou posição..."
            className="w-full pl-10 pr-4 py-2.5 min-h-[44px] rounded-xl bg-surface-container-lowest text-on-surface font-body-md text-sm shadow-xs outline-none placeholder:text-outline focus:bg-canvas-white transition-all border border-surface-container-high/50"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {isCurrentUserAdmin && (
            <button 
              onClick={() => setSelectedFilter('all')}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg font-label-md text-xs font-semibold transition-all active:scale-95 ${
                selectedFilter === 'all' 
                  ? 'bg-navy-deep text-on-secondary shadow-xs' 
                  : 'bg-surface-container-lowest text-navy-deep border border-surface-container-high/40'
              }`}
            >
              Todos ({players.length})
            </button>
          )}
          <button 
            onClick={() => setSelectedFilter(isCurrentUserAdmin ? 'confirmed' : 'all')}
            className={`whitespace-nowrap px-3 py-1.5 rounded-lg font-label-md text-xs font-semibold transition-all active:scale-95 ${
              (isCurrentUserAdmin ? selectedFilter === 'confirmed' : (selectedFilter === 'all' || selectedFilter === 'confirmed'))
                ? 'bg-navy-deep text-on-secondary shadow-xs' 
                : 'bg-surface-container-lowest text-navy-deep border border-surface-container-high/40'
            }`}
          >
            Confirmados ({confirmed.length})
          </button>
          {waitingList.length > 0 && (
            <button 
              onClick={() => setSelectedFilter('waiting')}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg font-label-md text-xs font-semibold transition-all active:scale-95 ${
                selectedFilter === 'waiting' 
                  ? 'bg-amber-600 text-white shadow-xs' 
                  : 'bg-amber-50 text-amber-900 border border-amber-300/60'
              }`}
            >
              Suplentes ({waitingList.length})
            </button>
          )}
          <button 
            onClick={() => setSelectedFilter('goalkeeper')}
            className={`whitespace-nowrap px-3 py-1.5 rounded-lg font-label-md text-xs font-semibold transition-all active:scale-95 ${
              selectedFilter === 'goalkeeper' 
                ? 'bg-navy-deep text-on-secondary shadow-xs' 
                : 'bg-surface-container-lowest text-navy-deep border border-surface-container-high/40'
            }`}
          >
            Goleiros ({visibleBasePlayers.filter(p => p.position === 'Goleiro').length})
          </button>
          {isCurrentUserAdmin && (
            <>
              <button 
                onClick={() => setSelectedFilter('monthly')}
                className={`whitespace-nowrap px-3 py-1.5 rounded-lg font-label-md text-xs font-semibold transition-all active:scale-95 ${
                  selectedFilter === 'monthly' 
                    ? 'bg-navy-deep text-on-secondary shadow-xs' 
                    : 'bg-surface-container-lowest text-navy-deep border border-surface-container-high/40'
                }`}
              >
                Mensalistas
              </button>
              <button 
                onClick={() => setSelectedFilter('guest')}
                className={`whitespace-nowrap px-3 py-1.5 rounded-lg font-label-md text-xs font-semibold transition-all active:scale-95 ${
                  selectedFilter === 'guest' 
                    ? 'bg-navy-deep text-on-secondary shadow-xs' 
                    : 'bg-surface-container-lowest text-navy-deep border border-surface-container-high/40'
                }`}
              >
                Avulsos
              </button>
            </>
          )}
        </div>
      </div>

      {/* LISTA DE ATLETAS (SEM DUPLICIDADE DE TAGS OU DE FILA) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5" id="player-roster-list">
        {filteredPlayers.length > 0 ? (
          filteredPlayers.map((player, idx) => {
            const isGK = player.position === 'Goleiro';
            const isPresent = player.status === 'presente';
            const isAbsent = player.status === 'ausente';
            const waitingIdx = waitingList.findIndex(w => w.id === player.id);

            const jerseyNum = player.number || (idx + 1);
            const jerseyFormatted = String(jerseyNum).padStart(2, '0');

            return (
              <div 
                key={player.id}
                className={`player-card relative w-full rounded-2xl p-3.5 shadow-xs transition-all flex flex-col justify-between gap-2.5 border ${
                  isAbsent 
                    ? 'bg-surface-container-low/70 border-surface-container-high/30 opacity-75' 
                    : waitingIdx >= 0
                      ? 'bg-amber-50/40 border-amber-300/60'
                      : 'bg-surface-container-lowest border-surface-container-high/40'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Número */}
                    <span 
                      className={`font-scoreboard-num text-2xl leading-none tracking-tight w-6 text-center shrink-0 tabular-nums ${
                        isPresent 
                          ? (isGK ? 'text-secondary' : 'text-primary-container') 
                          : 'text-outline'
                      }`}
                    >
                      {jerseyFormatted}
                    </span>

                    {/* Avatar */}
                    <div className={`relative w-10 h-10 rounded-full overflow-hidden shrink-0 bg-surface-container ${isAbsent ? 'grayscale' : ''}`}>
                      <img 
                        src={player.photoUrl} 
                        alt={player.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    {/* Nome, Posição e Categoria (Categoria visível apenas para Diretoria) */}
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className={`font-headline-sm text-sm text-navy-deep font-bold truncate ${isAbsent ? 'line-through text-on-surface-variant' : ''}`}>
                        {player.name}
                      </span>

                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        {isCurrentUserAdmin ? (
                          <select
                            value={player.position}
                            onChange={(e) => handleQuickChangePosition(player.id, e.target.value)}
                            className="text-[11px] font-bold text-navy-deep bg-surface-container-high/60 rounded px-1.5 py-0.5 border border-surface-container-high outline-none cursor-pointer hover:bg-surface-container"
                            title="Alterar posição do atleta"
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
                          <span className="text-xs font-semibold text-navy-deep">{player.position}</span>
                        )}
                        {isCurrentUserAdmin && (
                          <>
                            <span className="text-outline text-xs">·</span>
                            <span className="text-xs text-outline font-medium">
                              {player.playerType === 'mensalista' ? 'Mensalista' : 'Avulso'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status Único + Alertas de Exceção (Multas e Pendentes visíveis apenas para Diretoria) */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {isCurrentUserAdmin ? (
                      <span 
                        onClick={() => handleToggleStatus(player)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-label-md text-[11px] font-bold select-none cursor-pointer hover:opacity-85 active:scale-95 ${
                          isPresent
                            ? 'bg-tertiary-fixed text-on-tertiary-fixed'
                            : isAbsent
                              ? 'bg-error-container text-on-error-container'
                              : 'bg-surface-container-highest text-on-surface-variant'
                        }`}
                        title="Clique para alternar status"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          isPresent ? 'bg-tertiary' : isAbsent ? 'bg-error' : 'bg-outline'
                        }`}></span>
                        {isPresent ? 'PRESENTE' : isAbsent ? 'AUSENTE' : 'PENDENTE'}
                      </span>
                    ) : waitingIdx < 0 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-label-md text-[11px] font-bold bg-tertiary-fixed text-on-tertiary-fixed">
                        <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span>
                        CONFIRMADO
                      </span>
                    ) : null}

                    {waitingIdx >= 0 && (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                        ⏳ #{waitingIdx + 1} Suplente
                      </span>
                    )}

                    {isCurrentUserAdmin && (player.hasNoShowFine || player.hasLateRemovalFine) && (
                      <span className="text-[10px] font-bold text-red-800 bg-red-100 px-2 py-0.5 rounded">
                        🚨 Multado {player.fineAmount ? `(R$ ${player.fineAmount})` : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Ações do Administrador */}
                {isCurrentUserAdmin && (
                  <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-surface-container-high/40 flex-wrap">
                    {waitingIdx >= 0 && (
                      <button
                        onClick={() => handlePullToMatch(player.id)}
                        className="text-[11px] font-bold text-primary-container hover:underline flex items-center gap-0.5 active:scale-95"
                        title="Promover da fila de espera para confirmado"
                      >
                        <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
                        <span>Confirmar</span>
                      </button>
                    )}

                    {(player.hasNoShowFine || player.hasLateRemovalFine) && (
                      <button
                        onClick={async () => {
                          if (!confirm(`Confirmar quitação/remoção da multa de ${player.name}?`)) return;
                          await updateDoc(doc(db, "players", player.id), {
                            hasNoShowFine: false,
                            hasLateRemovalFine: false,
                            fineAmount: 0,
                            fineReason: null
                          }).catch(() => {});
                        }}
                        className="text-[11px] font-bold text-red-700 hover:underline flex items-center gap-0.5 active:scale-95"
                      >
                        <span className="material-symbols-outlined text-[14px]">paid</span>
                        <span>Quitar Multa</span>
                      </button>
                    )}

                    <button 
                      onClick={() => handleToggleSuplentePenalty(player)}
                      className={`text-[11px] font-bold flex items-center gap-0.5 active:scale-95 ${
                        player.suplenteNextMatch ? 'text-amber-700 hover:underline' : 'text-outline hover:text-amber-700'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {player.suplenteNextMatch ? 'event_available' : 'person_cancel'}
                      </span>
                      <span>{player.suplenteNextMatch ? 'Liberar da Suplência' : 'Suplente'}</span>
                    </button>

                    <button 
                      onClick={() => openEditModal(player)}
                      className="text-[11px] font-bold text-secondary flex items-center gap-0.5 hover:underline active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[14px]">tune</span>
                      <span>Editar</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="md:col-span-2 p-6 rounded-2xl bg-surface-container-lowest text-center text-outline text-xs border border-surface-container-high/40">
            Nenhum atleta encontrado para o filtro selecionado.
          </div>
        )}
      </div>

      {/* MODAL: EDITAR ATLETA & GOLS MARCADOS (PORTALIZADO PARA EVITAR TELA AZUL E COM TOTAL RESPONSIVIDADE) */}
      {selectedPlayerForStats && typeof document !== 'undefined' && createPortal(
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', zIndex: 99999 }}
          className="bg-navy-deep/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedPlayerForStats(null);
          }}
        >
          <div 
            className="bg-white text-navy-deep rounded-2xl sm:rounded-3xl p-4 sm:p-6 w-full max-w-lg max-h-[90dvh] shadow-2xl border border-surface-container-high/60 flex flex-col gap-4 relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-surface-container-high/60 pb-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary-container/10 text-primary-container flex items-center justify-center font-bold shrink-0">
                  <span className="material-symbols-outlined text-[22px]">manage_accounts</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse"></span>
                    <h3 className="font-headline-sm text-base sm:text-lg text-navy-deep font-bold uppercase truncate">
                      Editar Atleta (Admin)
                    </h3>
                  </div>
                  <p className="font-body-sm text-xs text-outline truncate">
                    Modifique dados, scout e penalidades
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedPlayerForStats(null)} 
                className="w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-outline hover:text-navy-deep transition-all shrink-0 active:scale-95"
                title="Fechar"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex flex-col gap-3.5 overflow-y-auto min-h-0 flex-1 pr-1">
              {/* NOME DO ATLETA */}
              <div>
                <label className="font-label-md text-xs sm:text-sm text-navy-deep font-bold block mb-1">
                  Nome do Atleta
                </label>
                <input 
                  type="text"
                  value={statsData.name}
                  onChange={(e) => setStatsData({ ...statsData, name: e.target.value })}
                  placeholder="Nome do atleta"
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-surface-container-high outline-none font-body-md font-semibold text-navy-deep text-base focus:bg-white focus:border-primary-container transition-all"
                />
              </div>

              {/* POSIÇÃO TÁTICA CADASTRADA */}
              <div>
                <label className="font-label-md text-xs sm:text-sm text-navy-deep font-bold block mb-1">
                  Posição Cadastrada
                </label>
                <select 
                  value={statsData.position}
                  onChange={(e) => setStatsData({ ...statsData, position: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-surface-container-high outline-none font-body-md font-bold text-navy-deep text-base focus:bg-white focus:border-primary-container transition-all cursor-pointer"
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-label-md text-xs sm:text-sm text-outline font-semibold block mb-1">Categoria</label>
                  <select 
                    value={statsData.playerType}
                    onChange={(e) => setStatsData({ ...statsData, playerType: e.target.value as any })}
                    className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-surface-container-high outline-none font-body-md text-navy-deep font-semibold text-base cursor-pointer"
                  >
                    <option value="mensalista">Mensalista VIP</option>
                    <option value="avulso">Avulso</option>
                  </select>
                </div>

                <div>
                  <label className="font-label-md text-xs sm:text-sm text-outline font-semibold block mb-1">Permissão</label>
                  <select 
                    value={statsData.role}
                    onChange={(e) => setStatsData({ ...statsData, role: e.target.value as any })}
                    className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-surface-container-high outline-none font-body-md text-navy-deep font-semibold text-base cursor-pointer"
                  >
                    <option value="player">Atleta</option>
                    <option value="admin">Diretoria (Admin)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-label-md text-xs sm:text-sm text-outline font-semibold block mb-1">Status na Lista da Pelada</label>
                <select 
                  value={statsData.status}
                  onChange={(e) => setStatsData({ ...statsData, status: e.target.value as any })}
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-surface-container-high outline-none font-body-md text-navy-deep font-bold text-base cursor-pointer"
                >
                  <option value="presente">🟢 Presente (Confirmado)</option>
                  <option value="pendente">🟡 Pendente</option>
                  <option value="ausente">🔴 Ausente</option>
                </select>
              </div>

              {/* PENALIDADE DE SUPLENTE AUTOMÁTICO */}
              <div className="bg-amber-500/10 p-3 sm:p-3.5 rounded-xl border border-amber-500/30 flex items-center justify-between gap-3">
                <div>
                  <label className="font-label-md text-xs sm:text-sm text-amber-900 font-bold flex items-center gap-1.5">
                    <span>⚠️</span> Suplente Automático
                  </label>
                  <span className="font-body-sm text-[11px] sm:text-xs text-amber-800 block leading-tight">
                    Colocou o nome na lista e faltou na pelada anterior
                  </span>
                </div>
                <input 
                  type="checkbox"
                  checked={statsData.suplenteNextMatch}
                  onChange={(e) => setStatsData({ ...statsData, suplenteNextMatch: e.target.checked })}
                  className="w-5 h-5 accent-amber-600 rounded cursor-pointer shrink-0"
                />
              </div>

              {/* SCOUT: GOLS MARCADOS */}
              <div className="bg-surface-container-low p-3 sm:p-3.5 rounded-xl flex items-center justify-between border border-surface-container-high/60 gap-2">
                <div>
                  <label className="font-label-md text-xs sm:text-sm text-navy-deep font-bold flex items-center gap-1.5">
                    <span>⚽</span> Gols Marcados
                  </label>
                  <span className="font-body-sm text-xs text-outline block leading-tight">
                    Scout oficial da temporada
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setStatsData({ ...statsData, goals: Math.max(0, statsData.goals - 1) })}
                    className="w-9 h-9 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-navy-deep flex items-center justify-center font-bold text-lg active:scale-95 transition-all"
                  >
                    -
                  </button>
                  <input 
                    type="number"
                    min="0"
                    value={statsData.goals}
                    onChange={(e) => setStatsData({ ...statsData, goals: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-14 sm:w-16 h-9 rounded-lg bg-white text-center font-scoreboard-num text-xl text-primary-container font-bold border border-surface-container-high outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setStatsData({ ...statsData, goals: statsData.goals + 1 })}
                    className="w-9 h-9 rounded-lg bg-primary-container hover:bg-primary-bright text-on-primary flex items-center justify-center font-bold text-lg active:scale-95 shadow-sm transition-all"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-surface-container-high/60 shrink-0 flex-wrap sm:flex-nowrap">
              <button 
                type="button"
                onClick={() => {
                  const p = selectedPlayerForStats;
                  setSelectedPlayerForStats(null);
                  handleDeletePlayer(p);
                }}
                className="px-3 py-2.5 rounded-xl text-error hover:bg-error/10 font-label-md text-xs sm:text-sm flex items-center gap-1 transition-all active:scale-95"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                <span>Excluir</span>
              </button>

              <div className="flex items-center gap-2 ml-auto">
                <button 
                  type="button"
                  onClick={() => setSelectedPlayerForStats(null)}
                  className="px-3.5 sm:px-4 py-2.5 rounded-xl bg-surface-container text-navy-deep font-label-md text-xs sm:text-sm hover:bg-surface-container-high transition-all active:scale-95"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={handleSaveStats}
                  disabled={isSavingStats}
                  className="px-4 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary-container to-primary-bright text-on-primary font-headline-sm text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-md shadow-primary/20 active:scale-95 transition-all disabled:opacity-50"
                >
                  <span>{isSavingStats ? 'Salvando...' : 'Salvar Alterações'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default PlayerList;
