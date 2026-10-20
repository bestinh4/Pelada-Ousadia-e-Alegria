import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CoverTeam, Player } from '../types.ts';
import { db, doc, onSnapshot, setDoc, deleteDoc, collection, getDocs, query, orderBy, limit, addDoc } from '../services/firebase.ts';
import { MASTER_ADMIN_EMAIL } from '../constants.tsx';

interface CoverTeamSectionProps {
  players: Player[];
  user: any;
  currentUserRole?: 'admin' | 'player';
  variant?: 'full' | 'compact';
}

// Ícone SVG vetorizado de alta fidelidade do Instagram
export const InstagramIcon: React.FC<{ className?: string; color?: string }> = ({ className = "w-4 h-4", color = "currentColor" }) => (
  <svg 
    className={className} 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <path 
      d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" 
      fill={color} 
    />
  </svg>
);

// Função para compactar imagens de celular para caber perfeitamente no Firestore
async function compressCoverPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result || ''));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Qualidade 0.82 gera ~100-140KB com visual impecável
        const base64 = canvas.toDataURL('image/jpeg', 0.82);
        resolve(base64);
      };
      img.onerror = reject;
      img.src = String(e.target?.result || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const CoverTeamSection: React.FC<CoverTeamSectionProps> = ({
  players = [],
  user,
  currentUserRole
}) => {
  const [coverTeam, setCoverTeam] = useState<CoverTeam | null>(null);
  const [historyList, setHistoryList] = useState<CoverTeam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  // Estados do formulário de edição
  const [isSaving, setIsSaving] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [formData, setFormData] = useState({
    teamName: '',
    photoUrl: '',
    matchDate: '',
    editionTitle: '',
    caption: '',
    instagramUrl: '',
    playerIds: [] as string[],
    highlightPlayer: ''
  });
  const [photoMode, setPhotoMode] = useState<'upload' | 'url'>('upload');
  const [availableTeamsFromSession, setAvailableTeamsFromSession] = useState<any[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isMaster = user?.email === MASTER_ADMIN_EMAIL;
  const isAdmin = isMaster || currentUserRole === 'admin';

  // Carregar capa atual em tempo real
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "coverTeam"), (docSnap) => {
      if (docSnap.exists()) {
        setCoverTeam(docSnap.data() as CoverTeam);
      } else {
        setCoverTeam(null);
      }
      setIsLoading(false);
    }, (err) => {
      console.warn("Erro ao carregar time capa:", err);
      setIsLoading(false);
    });

    return () => unsub();
  }, []);

  // Carregar histórico de capas anteriores
  const loadHistory = async () => {
    try {
      const q = query(collection(db, "coverTeamHistory"), orderBy("createdAt", "desc"), limit(20));
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as CoverTeam));
      setHistoryList(items);
    } catch (e) {
      console.warn("Erro ao buscar histórico de capas:", e);
    }
  };

  // Carregar equipes da sessão ativa para preenchimento com 1 clique
  const loadSessionTeams = async () => {
    try {
      const snap = await doc(db, "sessions", "current");
      onSnapshot(snap, (s) => {
        if (s.exists()) {
          const d = s.data();
          if (Array.isArray(d?.teams)) {
            setAvailableTeamsFromSession(d.teams);
          }
        }
      });
    } catch {}
  };

  // Abrir modal automaticamente se solicitado de outra tela (ex: final da pelada no Sorteio & Equipes)
  useEffect(() => {
    try {
      const openModal = localStorage.getItem('oa_open_cover_modal');
      const selectedTeamRaw = localStorage.getItem('oa_selected_cover_team');
      if (openModal === 'true' && isAdmin) {
        localStorage.removeItem('oa_open_cover_modal');
        let prefilledTeam = null;
        if (selectedTeamRaw) {
          try {
            prefilledTeam = JSON.parse(selectedTeamRaw);
            localStorage.removeItem('oa_selected_cover_team');
          } catch {}
        }
        handleOpenEditModal(prefilledTeam);
      }
    } catch {}
  }, [isAdmin]);

  const handleOpenEditModal = (prefilledTeam?: any) => {
    loadSessionTeams();
    const todayStr = new Date().toISOString().split('T')[0];
    if (prefilledTeam) {
      setFormData({
        teamName: prefilledTeam.teamName || prefilledTeam.name || 'Time Campeão',
        photoUrl: '',
        matchDate: prefilledTeam.matchDate || todayStr,
        editionTitle: 'Time Capa da Semana',
        caption: 'Parabéns à equipe campeã pelo show de bola e pela vitória na pelada! 🏆⚽',
        instagramUrl: '',
        playerIds: Array.isArray(prefilledTeam.playerIds) ? prefilledTeam.playerIds : [],
        highlightPlayer: ''
      });
    } else if (coverTeam) {
      setFormData({
        teamName: coverTeam.teamName || '',
        photoUrl: coverTeam.photoUrl || '',
        matchDate: coverTeam.matchDate || todayStr,
        editionTitle: coverTeam.editionTitle || 'Time Capa da Semana',
        caption: coverTeam.caption || '',
        instagramUrl: coverTeam.instagramUrl || '',
        playerIds: coverTeam.playerIds || [],
        highlightPlayer: coverTeam.highlightPlayer || ''
      });
    } else {
      setFormData({
        teamName: 'Time 1 - Campeão da Pelada',
        photoUrl: '',
        matchDate: todayStr,
        editionTitle: 'Time Capa da Semana',
        caption: 'Parabéns à equipe campeã pelo show de bola e pela vitória na pelada! 🏆⚽',
        instagramUrl: '',
        playerIds: [],
        highlightPlayer: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert("Por favor selecione um arquivo de imagem válido.");
      return;
    }

    setIsCompressing(true);
    try {
      const compressedBase64 = await compressCoverPhoto(file);
      setFormData(prev => ({ ...prev, photoUrl: compressedBase64 }));
    } catch (err) {
      alert("Erro ao processar imagem. Tente novamente.");
    } finally {
      setIsCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleApplyTeamFromSession = (team: any) => {
    if (!team) return;
    setFormData(prev => ({
      ...prev,
      teamName: team.name || prev.teamName,
      playerIds: Array.isArray(team.playerIds) ? team.playerIds : prev.playerIds
    }));
  };

  const handleTogglePlayer = (playerId: string) => {
    setFormData(prev => {
      const exists = prev.playerIds.includes(playerId);
      const next = exists 
        ? prev.playerIds.filter(id => id !== playerId)
        : [...prev.playerIds, playerId];
      return { ...prev, playerIds: next };
    });
  };

  const handleSaveCoverTeam = async () => {
    if (!formData.photoUrl.trim()) {
      alert("Adicione uma foto do time (faça upload ou insira um link da foto).");
      return;
    }

    if (!formData.teamName.trim()) {
      alert("Informe o nome do time.");
      return;
    }

    setIsSaving(true);
    try {
      // Normalizar link do Instagram se o usuário digitou apenas @usuario
      let cleanInsta = (formData.instagramUrl || '').trim();
      if (cleanInsta && !cleanInsta.startsWith('http')) {
        if (cleanInsta.startsWith('@')) {
          cleanInsta = `https://www.instagram.com/${cleanInsta.replace('@', '')}/`;
        } else if (!cleanInsta.includes('/')) {
          cleanInsta = `https://www.instagram.com/${cleanInsta}/`;
        }
      }

      const playerNames = formData.playerIds
        .map(id => players.find(p => p.id === id)?.name)
        .filter(Boolean) as string[];

      const payload: CoverTeam = {
        teamName: formData.teamName.trim(),
        photoUrl: formData.photoUrl.trim(),
        matchDate: formData.matchDate || new Date().toISOString().split('T')[0],
        editionTitle: formData.editionTitle.trim() || 'Time Capa da Semana',
        caption: formData.caption.trim(),
        instagramUrl: cleanInsta,
        playerIds: formData.playerIds,
        playerNames: playerNames,
        highlightPlayer: formData.highlightPlayer.trim() || undefined,
        createdAt: coverTeam?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: user?.displayName || user?.email || 'Admin'
      };

      // 1. Atualizar a capa principal em settings/coverTeam
      await setDoc(doc(db, "settings", "coverTeam"), payload, { merge: true });

      // 2. Salvar também no histórico de capas para a galeria permanente
      await addDoc(collection(db, "coverTeamHistory"), {
        ...payload,
        archivedAt: new Date().toISOString()
      });

      setIsModalOpen(false);
      alert("📸 Time Capa da Semana publicado com sucesso!");
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar o time capa.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveCover = async () => {
    if (!confirm("Deseja realmente remover o destaque do Time Capa atual?")) return;
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, "settings", "coverTeam"));
      setIsModalOpen(false);
      alert("Time capa removido.");
    } catch {
      alert("Erro ao remover capa.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = async () => {
    if (!coverTeam) return;
    const shareText = `📸 Time Capa da Semana • Ousadia & Alegria Futebol Clube!\n🏆 ${coverTeam.teamName}\n⚽ Parabéns aos atletas! Confira no app e no Instagram: ${coverTeam.instagramUrl || ''}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Time Capa da Semana - ${coverTeam.teamName}`,
          text: shareText,
          url: window.location.href
        });
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(shareText);
        alert("Link e mensagem copiados para a área de transferência!");
      } catch {}
    }
  };

  if (isLoading) {
    return null;
  }

  // Se não houver capa cadastrada ainda:
  if (!coverTeam) {
    if (!isAdmin) {
      // Atleta comum: pequeno banner de convite para acompanhar o Instagram
      return (
        <div className="w-full rounded-2xl bg-gradient-to-r from-navy-deep via-[#2d1b4e] to-slate-950 p-4 border border-purple-500/30 text-white shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center text-white shrink-0 shadow-md">
              <InstagramIcon className="w-5 h-5" color="#ffffff" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                  Instagram Oficial
                </span>
                <span className="text-xs font-bold text-amber-300">📸 Time Capa da Semana</span>
              </div>
              <p className="text-xs text-white/80 mt-0.5">
                Ao final da pelada, a foto da equipe campeã é tirada e destacada aqui e no nosso perfil!
              </p>
            </div>
          </div>
          <a
            href="https://www.instagram.com"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 hover:opacity-95 text-white font-headline-sm text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all shrink-0"
          >
            <InstagramIcon className="w-4 h-4" color="#ffffff" />
            <span>Seguir no Instagram</span>
          </a>
        </div>
      );
    }

    // Diretoria (Admin): Card atrativo de convite para publicar a primeira foto da semana
    return (
      <div className="w-full rounded-2xl bg-gradient-to-r from-navy-deep via-[#1e1e38] to-slate-900 p-4 sm:p-5 border-2 border-dashed border-amber-400/50 text-white shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center text-white shrink-0 shadow-lg shadow-rose-900/40">
            <span className="material-symbols-outlined text-[26px]">photo_camera</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-label-md text-[10px] font-black uppercase tracking-wider">
                Novidade
              </span>
              <h3 className="font-headline-sm text-sm sm:text-base font-bold text-white">
                Time Capa da Semana (Instagram)
              </h3>
            </div>
            <p className="text-xs text-white/80 mt-1 leading-relaxed">
              Tirou a foto da equipe vencedora no fim da pelada? Publique a foto aqui para ficar em destaque no app e linkar com o post do Instagram!
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenEditModal}
          className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-700 text-slate-950 font-headline-sm text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-amber-500/25 active:scale-95 transition-all shrink-0 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">add_a_photo</span>
          <span>Publicar Time Capa</span>
        </button>

        {isModalOpen && renderModal()}
      </div>
    );
  }

  // Formatador da data da conquista
  const formattedMatchDate = (() => {
    if (!coverTeam.matchDate) return '';
    try {
      const parts = coverTeam.matchDate.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      }
      return coverTeam.matchDate;
    } catch {
      return coverTeam.matchDate;
    }
  })();

  // Render do Modal de Edição/Criação da Capa
  function renderModal() {
    if (typeof document === 'undefined') return null;

    return createPortal(
      <div
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', zIndex: 99999 }}
        className="bg-navy-deep/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-hidden"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isSaving && !isCompressing) setIsModalOpen(false);
        }}
      >
        <div
          className="bg-white text-navy-deep max-w-lg w-full max-h-[92dvh] rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-surface-container-high/60 shadow-2xl flex flex-col gap-4 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-surface-container-high/40 pb-3 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center text-white shadow-xs">
                <span className="material-symbols-outlined text-[22px]">photo_camera</span>
              </div>
              <div>
                <h3 className="font-headline-sm text-sm sm:text-base text-navy-deep font-bold">
                  {coverTeam ? 'Editar Time Capa da Semana' : 'Publicar Time Capa da Semana'}
                </h3>
                <p className="text-[11px] text-outline">Destaque oficial da equipe no app e no Instagram</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              disabled={isSaving || isCompressing}
              className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-outline hover:text-navy-deep transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          {/* Form Scrollable Area */}
          <div className="flex flex-col gap-3.5 overflow-y-auto min-h-0 flex-1 pr-1">
            {/* Foto do Time */}
            <div className="space-y-2">
              <label className="font-label-md text-xs text-navy-deep font-bold flex items-center justify-between">
                <span>FOTO OFICIAL DO TIME *</span>
                <span className="text-[10px] text-outline font-semibold">Tirada no final da pelada</span>
              </label>

              {/* Botões de Escolha: Câmera/Galeria ou URL */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPhotoMode('upload')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all border ${
                    photoMode === 'upload'
                      ? 'bg-navy-deep text-white border-navy-deep'
                      : 'bg-surface-container text-outline border-transparent'
                  }`}
                >
                  📸 Câmera ou Galeria do Celular
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoMode('url')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all border ${
                    photoMode === 'url'
                      ? 'bg-navy-deep text-white border-navy-deep'
                      : 'bg-surface-container text-outline border-transparent'
                  }`}
                >
                  🔗 Link da Imagem
                </button>
              </div>

              {photoMode === 'upload' ? (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isCompressing}
                    className="w-full min-h-[50px] py-3 px-4 rounded-xl border-2 border-dashed border-primary-container/40 hover:border-primary-container bg-surface-container-low hover:bg-surface-container text-navy-deep font-headline-sm text-xs sm:text-sm font-bold flex items-center justify-center gap-2 active:scale-98 transition-all"
                  >
                    {isCompressing ? (
                      <>
                        <span className="w-4 h-4 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
                        <span>Otimizando foto...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[22px] text-primary-container">add_a_photo</span>
                        <span>{formData.photoUrl ? 'Trocar Foto da Câmera / Galeria' : 'Tirar Foto ou Escolher da Galeria'}</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    type="url"
                    placeholder="https://exemplo.com/foto-do-time.jpg"
                    value={formData.photoUrl}
                    onChange={(e) => setFormData({ ...formData, photoUrl: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-surface-container-high outline-none text-xs text-navy-deep font-semibold"
                  />
                </div>
              )}

              {/* Preview da Imagem */}
              {formData.photoUrl && (
                <div className="relative w-full h-44 rounded-xl overflow-hidden bg-slate-900 border border-surface-container-high/60 shadow-inner group">
                  <img
                    src={formData.photoUrl}
                    alt="Pré-visualização"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, photoUrl: '' })}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold shadow-md flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                      <span>Remover Foto</span>
                    </button>
                  </div>
                  <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-bold">
                    ✅ Foto Carregada
                  </span>
                </div>
              )}
            </div>

            {/* Atalho: Carregar Equipe da Última Pelada */}
            {availableTeamsFromSession.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex flex-col gap-2">
                <span className="text-[11px] font-bold text-amber-950 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-amber-700">bolt</span>
                  <span>Preencher com uma equipe da última pelada:</span>
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {availableTeamsFromSession.map((t, idx) => (
                    <button
                      key={t.id || idx}
                      type="button"
                      onClick={() => handleApplyTeamFromSession(t)}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-100 border border-amber-300 text-amber-950 font-label-md text-xs font-bold active:scale-95 transition-all"
                    >
                      ⚽ {t.name} ({t.playerIds?.length || 0} atletas)
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Nome do Time e Título */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-label-md text-xs text-navy-deep font-bold block mb-1">
                  NOME DA EQUIPE *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Time 1 - Campeão"
                  value={formData.teamName}
                  onChange={(e) => setFormData({ ...formData, teamName: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-surface-container-high outline-none text-xs text-navy-deep font-bold"
                />
              </div>

              <div>
                <label className="font-label-md text-xs text-navy-deep font-bold block mb-1">
                  DATA DA PELADA
                </label>
                <input
                  type="date"
                  value={formData.matchDate}
                  onChange={(e) => setFormData({ ...formData, matchDate: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-surface-container-high outline-none text-xs text-navy-deep font-bold"
                />
              </div>
            </div>

            {/* Link do Post do Instagram */}
            <div>
              <label className="font-label-md text-xs text-navy-deep font-bold flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5">
                  <InstagramIcon className="w-3.5 h-3.5 text-rose-600" color="#dc2743" />
                  <span>LINK DO POST OU PERFIL DO INSTAGRAM</span>
                </span>
                <span className="text-[10px] text-outline font-normal">Opcional</span>
              </label>
              <input
                type="text"
                placeholder="Ex: https://www.instagram.com/p/C-xyz... ou @ousadiaealegriapelada"
                value={formData.instagramUrl}
                onChange={(e) => setFormData({ ...formData, instagramUrl: e.target.value })}
                className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-surface-container-high outline-none text-xs text-navy-deep font-semibold"
              />
              <span className="text-[10px] text-outline mt-1 block">
                Ao clicar no card, os atletas serão direcionados diretamente para o post/perfil para curtir e comentar!
              </span>
            </div>

            {/* Legenda / Mensagem da Conquista */}
            <div>
              <label className="font-label-md text-xs text-navy-deep font-bold block mb-1">
                LEGENDA / COMEMORAÇÃO
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Equipe invicta da noite com 4 vitórias seguidas! Show de bola na Granja Cantinho do Céu."
                value={formData.caption}
                onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                className="w-full p-2.5 rounded-xl bg-surface-container-low border border-surface-container-high outline-none text-xs text-navy-deep font-semibold resize-none"
              />
            </div>

            {/* Seleção de Atletas do Time Campeão */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-label-md text-xs text-navy-deep font-bold">
                  ATLETAS DO TIME ({formData.playerIds.length} selecionado{formData.playerIds.length === 1 ? '' : 's'})
                </label>
                <span className="text-[10px] text-outline font-medium">Toque para marcar/desmarcar</span>
              </div>

              <div className="max-h-36 overflow-y-auto p-2 bg-surface-container-low rounded-xl border border-surface-container-high/60 flex flex-wrap gap-1.5">
                {players.map(p => {
                  const isSelected = formData.playerIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleTogglePlayer(p.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        isSelected
                          ? 'bg-primary-container text-white shadow-xs'
                          : 'bg-white hover:bg-surface-container text-navy-deep border border-surface-container-high/60'
                      }`}
                    >
                      <img
                        src={p.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}`}
                        alt={p.name}
                        className="w-4 h-4 rounded-full object-cover shrink-0"
                      />
                      <span className="truncate max-w-[110px]">{p.name}</span>
                      {isSelected && <span className="text-[11px]">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-surface-container-high/40 shrink-0 gap-2">
            {coverTeam ? (
              <button
                type="button"
                onClick={handleRemoveCover}
                disabled={isSaving}
                className="px-3 py-2 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all"
              >
                Remover Capa
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl bg-surface-container-high text-navy-deep font-label-md text-xs font-bold active:scale-95 transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveCoverTeam}
                disabled={isSaving || isCompressing || !formData.photoUrl}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 hover:opacity-95 text-white font-headline-sm text-xs font-bold flex items-center gap-1.5 shadow-md shadow-rose-900/20 active:scale-95 transition-all disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[17px]">
                  {isSaving ? 'sync' : 'publish'}
                </span>
                <span>{isSaving ? 'Publicando...' : 'Salvar & Destacar'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // Render do Lightbox em Tela Cheia
  function renderLightbox() {
    if (!coverTeam || typeof document === 'undefined') return null;

    return createPortal(
      <div
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', zIndex: 100000 }}
        className="bg-black/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-6 select-none animate-fade-in"
        onClick={() => setIsLightboxOpen(false)}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between text-white z-10" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            <span className="text-xl">📸</span>
            <div>
              <h4 className="font-headline-sm text-sm sm:text-base font-bold text-white">
                {coverTeam.teamName}
              </h4>
              <p className="text-xs text-white/70">{formattedMatchDate || 'Time Capa da Semana'}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsLightboxOpen(false)}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
          >
            <span className="material-symbols-outlined text-[24px]">close</span>
          </button>
        </div>

        {/* Center Image */}
        <div className="flex-1 flex items-center justify-center p-2 min-h-0" onClick={(e) => e.stopPropagation()}>
          <img
            src={coverTeam.photoUrl}
            alt={coverTeam.teamName}
            className="max-w-full max-h-[75dvh] object-contain rounded-xl shadow-2xl"
          />
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-center gap-3 pt-2 z-10" onClick={(e) => e.stopPropagation()}>
          {coverTeam.instagramUrl && (
            <a
              href={coverTeam.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg active:scale-95"
            >
              <InstagramIcon className="w-4 h-4" color="#ffffff" />
              <span>Ver no Instagram</span>
            </a>
          )}
          <button
            type="button"
            onClick={handleShare}
            className="px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center gap-1.5 border border-white/20 active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">share</span>
            <span>Compartilhar</span>
          </button>
        </div>
      </div>,
      document.body
    );
  }

  // Render do Histórico de Capas Anteriores
  function renderHistoryModal() {
    if (typeof document === 'undefined') return null;

    return createPortal(
      <div
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', zIndex: 99999 }}
        className="bg-navy-deep/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-hidden"
        onClick={() => setIsHistoryModalOpen(false)}
      >
        <div
          className="bg-white text-navy-deep max-w-2xl w-full max-h-[88dvh] rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-surface-container-high/60 shadow-2xl flex flex-col gap-4 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-surface-container-high/40 pb-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xl">🏆</span>
              <div>
                <h3 className="font-headline-sm text-base text-navy-deep font-bold">
                  Mural das Capas da Semana
                </h3>
                <p className="text-xs text-outline">Galeria com as fotos dos times campeões de cada pelada</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsHistoryModalOpen(false)}
              className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-outline hover:text-navy-deep"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          <div className="overflow-y-auto min-h-0 flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3.5 pr-1">
            {historyList.length === 0 ? (
              <div className="sm:col-span-2 text-center py-8 text-outline text-xs">
                Nenhuma foto anterior arquivada ainda.
              </div>
            ) : (
              historyList.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="rounded-xl border border-surface-container-high/60 overflow-hidden bg-surface-container-lowest flex flex-col shadow-xs"
                >
                  <div className="relative h-40 bg-slate-900 overflow-hidden">
                    <img
                      src={item.photoUrl}
                      alt={item.teamName}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-bold">
                      {item.matchDate || 'Pelada'}
                    </div>
                  </div>
                  <div className="p-3 flex flex-col gap-1.5 flex-1 justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-navy-deep">{item.teamName}</h4>
                      {item.caption && <p className="text-[11px] text-outline line-clamp-2 mt-0.5">{item.caption}</p>}
                    </div>
                    {item.instagramUrl && (
                      <a
                        href={item.instagramUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-rose-600 font-bold hover:underline flex items-center gap-1 mt-1"
                      >
                        <InstagramIcon className="w-3 h-3" color="#dc2743" />
                        <span>Ver no Instagram</span>
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // Atletas escalados no time da capa
  const squadPlayers = (coverTeam.playerIds || []).map(id => {
    return players.find(p => p.id === id) || {
      id,
      name: coverTeam.playerNames?.[coverTeam.playerIds?.indexOf(id) || 0] || 'Atleta',
      photoUrl: `https://ui-avatars.com/api/?name=Atleta&background=003a75&color=fff`,
      position: 'Linha'
    };
  });

  return (
    <div className="w-full rounded-2xl sm:rounded-3xl bg-surface-container-lowest p-3.5 sm:p-5 shadow-[0_12px_36px_rgba(0,58,117,0.06)] border border-amber-400/30 overflow-hidden relative group">
      {/* Detalhe superior brilhante */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-rose-500 to-purple-600" />

      {/* Header do Card */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-surface-container-high/50 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center text-white shrink-0 shadow-sm shadow-rose-900/30">
            <InstagramIcon className="w-5 h-5" color="#ffffff" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-label-md text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                <span>⭐</span>
                <span>TIME CAPA DA SEMANA</span>
              </span>
              {formattedMatchDate && (
                <span className="text-[11px] font-semibold text-outline">
                  {formattedMatchDate}
                </span>
              )}
            </div>
            <h3 className="font-headline-sm text-sm sm:text-base font-extrabold text-navy-deep truncate mt-0.5">
              {coverTeam.teamName}
            </h3>
          </div>
        </div>

        {/* Ações no Header */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              loadHistory();
              setIsHistoryModalOpen(true);
            }}
            className="px-2.5 py-1.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-navy-deep font-label-md text-xs font-bold border border-surface-container-high/60 flex items-center gap-1 active:scale-95 transition-all"
            title="Ver galeria de capas de edições anteriores"
          >
            <span className="material-symbols-outlined text-[16px] text-amber-600">history_edu</span>
            <span className="hidden sm:inline">Galeria</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={handleOpenEditModal}
              className="px-3 py-1.5 rounded-xl bg-navy-deep hover:bg-slate-900 text-white font-headline-sm text-xs font-bold flex items-center gap-1 shadow-xs active:scale-95 transition-all"
              title="Trocar a foto ou editar informações do Time Capa"
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>
              <span>Editar Capa</span>
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo Principal: Foto Panorâmica com Efeito Instagram */}
      <div className="mt-3.5 flex flex-col gap-3">
        <div
          onClick={() => setIsLightboxOpen(true)}
          className="relative w-full h-56 sm:h-72 md:h-80 rounded-2xl overflow-hidden bg-slate-950 cursor-pointer shadow-md group border border-surface-container-high/50"
          title="Toque para ver em tela cheia com alta resolução"
        >
          <img
            src={coverTeam.photoUrl}
            alt={coverTeam.teamName}
            className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
          />

          {/* Degradê na base da foto para contraste */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent pointer-events-none" />

          {/* Tag de Zoom no canto superior */}
          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-[11px] font-bold flex items-center gap-1 shadow-sm opacity-90 group-hover:opacity-100 transition-opacity">
            <span className="material-symbols-outlined text-[15px]">zoom_in</span>
            <span>Ver Foto</span>
          </div>

          {/* Informações sobrepostas na foto */}
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
            <div className="text-white min-w-0 drop-shadow">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1">
                <span>🏆</span>
                <span>CAMPEÕES DO DIA • BONFIM DA PELADA</span>
              </span>
              <h4 className="font-headline-sm text-base sm:text-xl font-black leading-tight text-white truncate">
                {coverTeam.teamName}
              </h4>
            </div>

            {coverTeam.instagramUrl && (
              <a
                href={coverTeam.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 hover:opacity-95 text-white font-headline-sm text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-rose-900/40 shrink-0 active:scale-95 transition-all"
              >
                <InstagramIcon className="w-4 h-4" color="#ffffff" />
                <span className="hidden sm:inline">Ver no Instagram</span>
                <span className="sm:hidden">Instagram</span>
              </a>
            )}
          </div>
        </div>

        {/* Legenda Oficial */}
        {coverTeam.caption && (
          <p className="text-xs sm:text-sm text-navy-deep font-medium leading-relaxed bg-surface-container-low/70 p-3 rounded-xl border border-surface-container-high/40">
            &ldquo;{coverTeam.caption}&rdquo;
          </p>
        )}

        {/* Atletas do Time Campeão em Destaque */}
        {squadPlayers.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[11px] text-outline font-bold">
              <span>ELENCO DA CAPA ({squadPlayers.length} ATLETAS)</span>
              <span>PARABÉNS AOS CAMPEÕES! 👏</span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {squadPlayers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-surface-container-low border border-surface-container-high/60 shrink-0 shadow-2xs hover:bg-surface-container transition-colors"
                >
                  <img
                    src={p.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=003a75&color=fff`}
                    alt={p.name}
                    className="w-6 h-6 rounded-full object-cover shrink-0 border border-white"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-xs text-navy-deep leading-tight truncate max-w-[120px]">
                      {p.name}
                    </span>
                    <span className="text-[10px] text-outline font-semibold leading-none">
                      {p.position || 'Atleta'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Barra de Ações Inferior: Compartilhar & Instagram */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-surface-container-high/40 flex-wrap">
          <button
            type="button"
            onClick={handleShare}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-navy-deep font-label-md text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[17px] text-primary-container">share</span>
            <span>Compartilhar com a Turma</span>
          </button>

          {coverTeam.instagramUrl ? (
            <a
              href={coverTeam.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[40px] px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 hover:opacity-95 text-white font-headline-sm text-xs font-bold flex items-center gap-2 shadow-sm shadow-rose-900/20 active:scale-95 transition-all"
            >
              <InstagramIcon className="w-4 h-4" color="#ffffff" />
              <span>Curtir no Instagram Oficial</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </a>
          ) : (
            <a
              href="https://www.instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-outline hover:text-navy-deep font-label-md text-xs font-bold flex items-center gap-1.5 transition-all"
            >
              <InstagramIcon className="w-3.5 h-3.5" color="currentColor" />
              <span>Instagram da Pelada</span>
            </a>
          )}
        </div>
      </div>

      {isModalOpen && renderModal()}
      {isLightboxOpen && renderLightbox()}
      {isHistoryModalOpen && renderHistoryModal()}
    </div>
  );
};
