
import React, { useState } from 'react';
import { Player, Page, Match } from '../types.ts';
import { MASTER_ADMIN_EMAIL } from '../constants.tsx';
import { db, doc, updateDoc, deleteDoc, collection, addDoc } from '../services/firebase.ts';
import { broadcastNotification } from '../services/notificationService.ts';
import { isLateRemovalTime } from '../utils/timeUtils.ts';

interface PlayerListProps {
  players: Player[];
  currentUser: any;
  match: Match | null;
  onPageChange: (page: Page) => void;
}

const mainLogoUrl = "https://i.postimg.cc/QCGV109g/Gemini-Generated-Image-xrrv8axrrv8axrrv-removebg-preview.png";

const PlayerList: React.FC<PlayerListProps> = ({ players, currentUser, match, onPageChange }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlayerForStats, setSelectedPlayerForStats] = useState<Player | null>(null);
  const [statsData, setStatsData] = useState({ 
    goals: 0, 
    assists: 0, 
    role: 'player' as 'admin' | 'player',
    playerType: 'avulso' as 'mensalista' | 'avulso',
    status: 'presente' as 'presente' | 'pendente' | 'ausente'
  });
  const [isSavingStats, setIsSavingStats] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [newPlayerData, setNewPlayerData] = useState({
    name: '',
    position: 'Atacante',
    playerType: 'avulso' as 'mensalista' | 'avulso',
    status: 'presente' as 'presente' | 'pendente' | 'ausente'
  });
  const [isCreating, setIsCreating] = useState(false);

  const adminUser = players.find(p => p.id === currentUser?.uid);
  const isCurrentUserAdmin = adminUser?.role === 'admin' || currentUser?.email === MASTER_ADMIN_EMAIL;

  const filtered = players.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
  
  // Lógica de separação para a mensagem
  const sortedPresent = players
    .filter(p => p.status === 'presente')
    .sort((a, b) => {
      const timeA = a.confirmedAt ? new Date(a.confirmedAt).getTime() : new Date(a.createdAt || 0).getTime();
      const timeB = b.confirmedAt ? new Date(b.confirmedAt).getTime() : new Date(b.createdAt || 0).getTime();
      return timeA - timeB;
    });

  const fieldSlots = match?.fieldSlots || 30;
  const gkSlots = match?.gkSlots !== undefined ? match.gkSlots : 5;

  const confirmed: Player[] = [];
  const waitingList: Player[] = [];
  const refusedList: Player[] = [];
  const pendingList: Player[] = [];

  let fieldCount = 0;
  let gkCount = 0;

  sortedPresent.forEach(p => {
    if (p.position === 'Goleiro') {
      if (gkCount < gkSlots) {
        confirmed.push(p);
        gkCount++;
      } else {
        waitingList.push(p);
      }
    } else {
      if (fieldCount < fieldSlots) {
        confirmed.push(p);
        fieldCount++;
      } else {
        waitingList.push(p);
      }
    }
  });

  players.forEach(p => {
    if (p.status === 'ausente') refusedList.push(p);
    if (p.status === 'pendente') pendingList.push(p);
  });

  const handleShareList = () => {
    const dateStr = match?.date ? new Date(match.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }) : '--/--';
    const location = match?.location || 'A DEFINIR';
    const time = match?.time || '--:--';
    const totalSlots = fieldSlots + gkSlots;

    let message = `🏆 *ARENA OUSADIA & ALEGRIA* 🇭🇷\n`;
    message += `_Convocação Oficial para a Pelada_\n`;
    message += `-------------------------------------------\n\n`;
    message += `📍 *LOCAL:* ${location.toUpperCase()}\n`;
    message += `📅 *DATA:* ${dateStr.toUpperCase()}\n`;
    message += `⏰ *HORÁRIO:* ${time}H\n\n`;

    message += `✅ *CONFIRMADOS (${confirmed.length}/${totalSlots})*\n`;
    confirmed.forEach((p, i) => {
      const posIcon = p.position === 'Goleiro' ? '🧤' : '🏃';
      message += `${i + 1}. ${p.name.toUpperCase()} (${posIcon} ${p.position})\n`;
    });

    if (waitingList.length > 0) {
      message += `\n⏳ *LISTA DE ESPERA*\n`;
      waitingList.forEach((p, i) => {
        message += `${i + 1}. ${p.name.toUpperCase()} (AGUARDANDO VAGA)\n`;
      });
    }

    if (pendingList.length > 0) {
      message += `\n⏳ *AINDA NÃO CONFIRMARAM*\n`;
      pendingList.forEach((p) => {
        message += `- ${p.name.toUpperCase()}\n`;
      });
    }

    message += `\n-------------------------------------------\n`;
    message += `⚽ *Acesse o App:* https://pelada-app.vercel.app/\n`;
    message += `_Gestão Ousadia & Alegria_`;

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleCreateManualPlayer = async () => {
    if (!newPlayerData.name.trim()) return alert("Digite o nome do jogador!");
    
    setIsCreating(true);
    try {
      await addDoc(collection(db, "players"), {
        ...newPlayerData,
        goals: 0,
        assists: 0,
        role: 'player',
        photoUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(newPlayerData.name)}&background=random&color=fff&size=256`,
        createdAt: new Date().toISOString(),
        confirmedAt: newPlayerData.status === 'presente' ? new Date().toISOString() : null,
        manual: true // Flag para identificar que foi adicionado manualmente
      });
      setIsAddingManual(false);
      setNewPlayerData({ name: '', position: 'Atacante', playerType: 'avulso', status: 'presente' });
    } catch (e) {
      alert("Erro ao adicionar jogador.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col animate-fade-in px-6">
      <header className="py-8 md:py-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 sm:gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl md:text-3xl font-black text-navy uppercase italic tracking-tighter leading-none">ELENCO O&A</h2>
          <p className="text-[9px] md:text-[10px] font-black text-primary uppercase tracking-[0.4em]">CONVOCAÇÃO ATUAL</p>
        </div>
        <div className="flex items-center gap-3 md:gap-4 w-full sm:w-auto justify-end">
          {isCurrentUserAdmin && (
            <button 
              onClick={() => setIsAddingManual(true)} 
              className="w-11 h-11 md:w-12 md:h-12 bg-primary text-white rounded-2xl flex items-center justify-center shadow-glow-red active:scale-90 transition-all group"
              title="Adicionar Jogador Manual"
            >
              <span className="material-symbols-outlined text-xl md:text-2xl group-hover:rotate-90 transition-transform">person_add</span>
            </button>
          )}
          <button onClick={handleShareList} className="w-11 h-11 md:w-12 md:h-12 bg-white border border-slate-100 rounded-2xl flex items-center justify-center shadow-soft-white active:scale-90 transition-all text-navy group">
            <span className="material-symbols-outlined text-xl md:text-2xl group-hover:scale-110 transition-transform">share</span>
          </button>
          <div className="w-11 h-11 md:w-12 md:h-12 bg-white rounded-2xl flex items-center justify-center shadow-soft-white animate-float border border-slate-100 p-2">
            <img src={mainLogoUrl} className="w-7 h-7 md:w-8 md:h-8 object-contain" />
          </div>
        </div>
      </header>

      <div className="mb-8 md:mb-10 relative">
        <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-slate-300">search</span>
        <input 
          type="text" placeholder="Buscar atleta no elenco..." value={searchQuery} 
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-14 md:h-16 bg-white border border-slate-100 rounded-2xl pl-14 pr-6 text-[14px] md:text-[15px] font-bold text-navy outline-none shadow-soft-white focus:border-navy transition-all" 
        />
      </div>

      <main className="lg:grid lg:grid-cols-12 lg:gap-10 lg:items-start pb-48">
        <div className="lg:col-span-8 space-y-14">
          <PlayerSection 
          title="CONFIRMADOS" 
          list={confirmed.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))} 
          isAdmin={isCurrentUserAdmin} 
          onQuickToggle={async (p: Player) => {
            setProcessingId(p.id);
            
            // Registro de desistência tardia se o admin remover alguém confirmado
            if (p.status === 'presente' && isLateRemovalTime() && match) {
              await addDoc(collection(db, "lateRemovals"), {
                playerId: p.id,
                playerName: p.name,
                timestamp: new Date().toISOString(),
                matchId: match.id,
                matchLocation: match.location,
                removedBy: currentUser.uid // Registra que foi o admin que removeu
              });
            }

            await updateDoc(doc(db, "players", p.id), { status: 'pendente', confirmedAt: null });
            await broadcastNotification("❌ REMOVIDO!", `${p.name} foi removido da lista pela diretoria.`, currentUser.uid);
            setProcessingId(null);
          }}
          onEdit={(p: Player) => {
            setSelectedPlayerForStats(p);
            setStatsData({ 
              goals: p.goals || 0, 
              assists: p.assists || 0, 
              role: (p.role as any) || 'player', 
              playerType: p.playerType || 'avulso', 
              status: p.status || 'pendente' 
            });
          }} 
          onDelete={async (p: Player) => {
            if (confirm(`Remover ${p.name.toUpperCase()} da pelada?`)) {
              await deleteDoc(doc(db, "players", p.id));
            }
          }}
          processingId={processingId}
          type="confirmed"
        />

        {waitingList.length > 0 && (
          <PlayerSection 
            title="LISTA DE ESPERA" 
            list={waitingList.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))} 
            isAdmin={isCurrentUserAdmin} 
            onQuickToggle={async (p: Player) => {
              setProcessingId(p.id);
              await updateDoc(doc(db, "players", p.id), { status: 'pendente', confirmedAt: null });
              setProcessingId(null);
            }}
            onEdit={(p: Player) => {
              setSelectedPlayerForStats(p);
              setStatsData({ 
                goals: p.goals || 0, 
                assists: p.assists || 0, 
                role: (p.role as any) || 'player', 
                playerType: p.playerType || 'avulso', 
                status: p.status || 'pendente' 
              });
            }} 
            onDelete={async (p: Player) => {
              if (confirm(`Remover ${p.name.toUpperCase()} da espera?`)) {
                await deleteDoc(doc(db, "players", p.id));
              }
            }}
            processingId={processingId}
            type="waiting"
          />
        )}
        </div>

        <div className="lg:col-span-4 mt-14 lg:mt-0 space-y-14">
          <PlayerSection 
            title="AINDA NÃO CONFIRMARAM" 
            list={pendingList.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))} 
            isAdmin={isCurrentUserAdmin} 
            onQuickToggle={async (p: Player) => {
              setProcessingId(p.id);
              await updateDoc(doc(db, "players", p.id), { 
                status: 'presente',
                confirmedAt: new Date().toISOString()
              });
              setProcessingId(null);
            }}
            onEdit={(p: Player) => {
              setSelectedPlayerForStats(p);
              setStatsData({ 
                goals: p.goals || 0, 
                assists: p.assists || 0, 
                role: (p.role as any) || 'player', 
                playerType: p.playerType || 'avulso', 
                status: p.status || 'pendente' 
              });
            }} 
            onDelete={async (p: Player) => {
              if (confirm(`Remover ${p.name.toUpperCase()} do elenco?`)) {
                await deleteDoc(doc(db, "players", p.id));
              }
            }}
            processingId={processingId}
            type="pending"
          />
        </div>
      </main>

      {selectedPlayerForStats && (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-md z-[200] flex items-center justify-center p-4 md:p-6">
           <div className="w-full max-w-[400px] bg-white rounded-[2.5rem] md:rounded-[3rem] shadow-2xl overflow-hidden animate-slide-up max-h-[90vh] flex flex-col">
              <div className="p-6 md:p-8 bg-slate-50 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                 <div className="flex items-center gap-3 md:gap-4">
                    <img src={selectedPlayerForStats.photoUrl} className="w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl object-cover border-2 border-white shadow-sm" alt="" />
                    <div>
                      <h3 className="text-lg md:text-xl font-black text-navy uppercase italic tracking-tighter leading-none truncate max-w-[150px] md:max-w-none">{selectedPlayerForStats.name}</h3>
                      <p className="text-[8px] md:text-[9px] font-black text-slate-300 uppercase tracking-widest mt-1">CONFIGURAÇÕES DE ACESSO</p>
                    </div>
                 </div>
                 <button onClick={() => setSelectedPlayerForStats(null)} className="w-9 h-9 md:w-10 md:h-10 bg-white border border-slate-100 rounded-xl flex items-center justify-center text-slate-300 active:scale-90">
                    <span className="material-symbols-outlined text-xl">close</span>
                 </button>
              </div>
              
              <div className="p-6 md:p-8 space-y-6 md:space-y-8 overflow-y-auto hide-scrollbar relative flex-1">
                 <img src="https://i.postimg.cc/QCGV109g/Gemini-Generated-Image-xrrv8axrrv8axrrv-removebg-preview.png" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 opacity-[0.08] grayscale pointer-events-none" />

                 <div className="grid grid-cols-2 gap-4 relative z-10">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest px-1">GOLS</label>
                       <input type="number" value={statsData.goals} onChange={e => setStatsData({...statsData, goals: Number(e.target.value)})} className="w-full h-16 bg-slate-50 rounded-2xl border border-slate-100 font-black text-navy text-center text-2xl outline-none focus:border-primary" />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest px-1">ASSISTS</label>
                       <input type="number" value={statsData.assists} onChange={e => setStatsData({...statsData, assists: Number(e.target.value)})} className="w-full h-16 bg-slate-50 rounded-2xl border border-slate-100 font-black text-navy text-center text-2xl outline-none focus:border-primary" />
                    </div>
                 </div>

                 <div className="space-y-4 relative z-10">
                    <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest px-1">MODALIDADE FINANCEIRA</label>
                    <div className="grid grid-cols-2 gap-3">
                       <button onClick={() => setStatsData({...statsData, playerType: 'mensalista'})} className={`h-14 rounded-xl border-2 font-black text-[10px] uppercase tracking-widest transition-all ${statsData.playerType === 'mensalista' ? 'bg-navy border-navy text-white shadow-elite' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>MENSALISTA</button>
                       <button onClick={() => setStatsData({...statsData, playerType: 'avulso'})} className={`h-14 rounded-xl border-2 font-black text-[10px] uppercase tracking-widest transition-all ${statsData.playerType === 'avulso' ? 'bg-primary border-primary text-white shadow-glow-red' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>AVULSO</button>
                    </div>
                 </div>

                 {isCurrentUserAdmin && (
                   <div className="space-y-4 relative z-10">
                      <label className="text-[10px] font-black text-primary uppercase tracking-widest px-1">CARGO NA ARENA</label>
                      <div className="grid grid-cols-2 gap-3">
                         <button onClick={() => setStatsData({...statsData, role: 'player'})} className={`h-14 rounded-xl border-2 font-black text-[10px] uppercase tracking-widest transition-all ${statsData.role === 'player' ? 'bg-navy border-navy text-white shadow-elite' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>ATLETA</button>
                         <button onClick={() => setStatsData({...statsData, role: 'admin'})} className={`h-14 rounded-xl border-2 font-black text-[10px] uppercase tracking-widest transition-all ${statsData.role === 'admin' ? 'bg-primary border-primary text-white shadow-glow-red' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>DIRETOR (ADM)</button>
                      </div>
                      {statsData.role === 'admin' && selectedPlayerForStats.email !== MASTER_ADMIN_EMAIL && (
                        <p className="text-[9px] font-bold text-primary uppercase text-center animate-pulse">Este ADM será isento de pagamentos 💼</p>
                      )}
                   </div>
                 )}
                 
                 <button 
                  onClick={async () => {
                    setIsSavingStats(true);
                    try {
                      const updates: any = { ...statsData };
                      if (statsData.status === 'presente' && selectedPlayerForStats.status !== 'presente') {
                        updates.confirmedAt = new Date().toISOString();
                      } else if (statsData.status !== 'presente') {
                        updates.confirmedAt = null;
                      }
                      await updateDoc(doc(db, "players", selectedPlayerForStats.id), updates);
                      setSelectedPlayerForStats(null);
                    } catch (e) {
                      alert("Erro ao salvar permissões.");
                    } finally {
                      setIsSavingStats(false);
                    }
                  }}
                  className="w-full h-20 bg-navy text-white rounded-[2rem] font-black uppercase text-[12px] tracking-[0.2em] shadow-elite active:scale-95 transition-all mt-4 relative z-10"
                 >
                    {isSavingStats ? <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto"></div> : "CONFIRMAR ALTERAÇÕES"}
                 </button>
              </div>
           </div>
        </div>
      )}
      {isAddingManual && (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-md z-[200] flex items-center justify-center p-4 md:p-6">
           <div className="w-full max-w-[400px] bg-white rounded-[2.5rem] md:rounded-[3rem] shadow-2xl overflow-hidden animate-slide-up max-h-[90vh] flex flex-col">
              <div className="p-6 md:p-8 bg-slate-50 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                 <div className="flex items-center gap-3 md:gap-4">
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                       <span className="material-symbols-outlined text-xl md:text-2xl">person_add</span>
                    </div>
                    <div>
                      <h3 className="text-lg md:text-xl font-black text-navy uppercase italic tracking-tighter leading-none">NOVO ATLETA</h3>
                      <p className="text-[8px] md:text-[9px] font-black text-slate-300 uppercase tracking-widest mt-1">CADASTRO MANUAL (SEM APP)</p>
                    </div>
                 </div>
                 <button onClick={() => setIsAddingManual(false)} className="w-9 h-9 md:w-10 md:h-10 bg-white border border-slate-100 rounded-xl flex items-center justify-center text-slate-300 active:scale-90">
                    <span className="material-symbols-outlined text-xl">close</span>
                 </button>
              </div>
              
              <div className="p-6 md:p-8 space-y-5 md:space-y-6 overflow-y-auto hide-scrollbar flex-1">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest px-1">NOME COMPLETO / APELIDO</label>
                    <input 
                      type="text" 
                      value={newPlayerData.name} 
                      onChange={e => setNewPlayerData({...newPlayerData, name: e.target.value})} 
                      placeholder="Ex: Romário"
                      className="w-full h-16 bg-slate-50 rounded-2xl border border-slate-100 px-6 font-black text-navy outline-none focus:border-primary" 
                    />
                 </div>

                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest px-1">POSIÇÃO</label>
                    <select 
                      value={newPlayerData.position} 
                      onChange={e => setNewPlayerData({...newPlayerData, position: e.target.value})} 
                      className="w-full h-16 bg-slate-50 rounded-2xl border border-slate-100 px-6 font-black text-navy outline-none focus:border-primary"
                    >
                      <option value="Goleiro">Goleiro</option>
                      <option value="Zagueiro">Zagueiro</option>
                      <option value="Lateral">Lateral</option>
                      <option value="Volante">Volante</option>
                      <option value="Meia">Meia</option>
                      <option value="Atacante">Atacante</option>
                    </select>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest px-1">TIPO</label>
                       <select 
                        value={newPlayerData.playerType} 
                        onChange={e => setNewPlayerData({...newPlayerData, playerType: e.target.value as any})} 
                        className="w-full h-14 bg-slate-50 rounded-xl border border-slate-100 px-4 font-black text-navy text-[11px] outline-none"
                       >
                         <option value="avulso">AVULSO</option>
                         <option value="mensalista">MENSALISTA</option>
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest px-1">PRESENÇA</label>
                       <select 
                        value={newPlayerData.status} 
                        onChange={e => setNewPlayerData({...newPlayerData, status: e.target.value as any})} 
                        className="w-full h-14 bg-slate-50 rounded-xl border border-slate-100 px-4 font-black text-navy text-[11px] outline-none"
                       >
                         <option value="presente">CONFIRMADO</option>
                         <option value="pendente">PENDENTE</option>
                       </select>
                    </div>
                 </div>

                 <button 
                  onClick={handleCreateManualPlayer}
                  disabled={isCreating}
                  className="w-full h-20 bg-navy text-white rounded-[2rem] font-black uppercase text-[12px] tracking-[0.2em] shadow-elite active:scale-95 transition-all mt-4"
                 >
                    {isCreating ? <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto"></div> : "CADASTRAR JOGADOR"}
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const PlayerSection = ({ title, list, isAdmin, onQuickToggle, onEdit, onDelete, processingId, type }: any) => {
  const getStatusInfo = (status: string, sectionType: string) => {
    switch (status) {
      case 'presente':
        if (sectionType === 'waiting') return { icon: 'hourglass_top', color: 'text-amber-500', bg: 'bg-amber-50' };
        return { icon: 'check_circle', color: 'text-success', bg: 'bg-success/10' };
      case 'ausente':
        return { icon: 'cancel', color: 'text-slate-400', bg: 'bg-slate-100' };
      default:
        return { icon: 'pending', color: 'text-slate-300', bg: 'bg-slate-50' };
    }
  };

  return (
    <section className="animate-slide-up">
      <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between mb-6 md:mb-8 px-2 gap-2">
         <div className="flex items-center gap-3">
            <div className={`w-2 h-2 ${type === 'confirmed' ? 'bg-primary shadow-glow-red' : type === 'waiting' ? 'bg-amber-400 shadow-glow-amber' : type === 'refused' ? 'bg-slate-800 shadow-elite' : 'bg-slate-200'} rounded-full animate-pulse`}></div>
            <h3 className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-navy italic">{title}</h3>
         </div>
         <span className="text-[9px] md:text-[10px] font-black text-slate-300 uppercase tracking-widest">{list.length} ATLETAS</span>
      </div>
      <div className="space-y-4">
        {list.length > 0 ? list.map((p: Player) => {
          const statusInfo = getStatusInfo(p.status, type);
          return (
            <div key={p.id} className="bg-white rounded-[2rem] md:rounded-[2.5rem] p-4 md:p-5 border border-slate-100 shadow-soft-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group transition-all hover:border-navy/20">
              <div className="flex items-center gap-4 md:gap-5 w-full">
                <div className="relative flex-shrink-0">
                  <img src={p.photoUrl} className="w-14 h-14 md:w-16 md:h-16 rounded-[1.2rem] md:rounded-[1.5rem] object-cover border-2 border-slate-50 shadow-sm" alt="" />
                  {isAdmin && (
                    <button 
                      disabled={processingId === p.id}
                      onClick={() => onQuickToggle(p)}
                      className={`absolute -top-2 -right-2 w-7 h-7 md:w-8 md:h-8 rounded-xl border-2 border-white shadow-xl flex items-center justify-center transition-all ${p.status === 'presente' ? 'bg-primary text-white' : 'bg-slate-50 text-slate-300'}`}
                    >
                      {processingId === p.id ? <div className="w-3 h-3 border-2 border-current/20 border-t-current rounded-full animate-spin"></div> : <span className="material-symbols-outlined text-[14px] md:text-[16px] font-black">{p.status === 'presente' ? 'check' : 'add'}</span>}
                    </button>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h4 className="text-[15px] md:text-[16px] font-black text-navy uppercase italic leading-none truncate">{p.name}</h4>
                    {p.role === 'admin' && (
                      <span className={`text-white text-[6px] md:text-[7px] font-black px-1.5 md:px-2 py-0.5 rounded-md uppercase animate-pulse ${p.email === MASTER_ADMIN_EMAIL ? 'bg-navy shadow-elite' : 'bg-primary shadow-glow-red'}`}>
                        {p.email === MASTER_ADMIN_EMAIL ? 'MASTER' : 'DIRETORIA'}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                     <div className={`flex items-center gap-1 px-1.5 md:px-2 py-0.5 rounded-lg ${statusInfo.bg}`}>
                        <span className={`material-symbols-outlined text-[10px] md:text-[12px] font-black ${statusInfo.color}`}>{statusInfo.icon}</span>
                        <p className={`text-[7px] md:text-[8px] font-black uppercase tracking-widest ${statusInfo.color}`}>
                          {p.status === 'presente' ? (type === 'waiting' ? 'ESPERA' : 'CONFIRMADO') : p.status === 'ausente' ? 'AUSENTE' : 'PENDENTE'}
                        </p>
                     </div>
                     <span className="w-1 h-1 bg-slate-200 rounded-full hidden xs:block"></span>
                     <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">{p.position}</p>
                     <span className="w-1 h-1 bg-slate-200 rounded-full hidden xs:block"></span>
                     <p className={`text-[9px] md:text-[10px] font-black uppercase tracking-widest ${p.playerType === 'mensalista' ? 'text-navy' : 'text-slate-300'}`}>{p.playerType || 'avulso'}</p>
                  </div>
                </div>
              </div>
              {isAdmin && (
                <div className="flex gap-2 md:gap-3 w-full sm:w-auto justify-end border-t sm:border-t-0 border-slate-50 pt-3 sm:pt-0">
                   <button onClick={() => onEdit(p)} className="flex-1 sm:flex-none h-11 px-4 sm:px-0 sm:w-11 rounded-xl md:rounded-2xl bg-slate-50 text-navy flex items-center justify-center border border-slate-100 hover:bg-navy hover:text-white transition-all gap-2">
                      <span className="material-symbols-outlined text-lg">edit_document</span>
                      <span className="sm:hidden text-[10px] font-black uppercase tracking-widest">Editar</span>
                   </button>
                   <button onClick={() => onDelete(p)} className="flex-1 sm:flex-none h-11 px-4 sm:px-0 sm:w-11 rounded-xl md:rounded-2xl bg-red-50 text-primary flex items-center justify-center border border-red-100 hover:bg-primary hover:text-white transition-all gap-2">
                      <span className="material-symbols-outlined text-lg">delete</span>
                      <span className="sm:hidden text-[10px] font-black uppercase tracking-widest">Excluir</span>
                   </button>
                </div>
              )}
            </div>
          );
        }) : (
          <div className="py-10 text-center bg-slate-50/50 border border-dashed border-slate-100 rounded-[2rem]">
             <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">Nenhum atleta nesta categoria</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default PlayerList;
