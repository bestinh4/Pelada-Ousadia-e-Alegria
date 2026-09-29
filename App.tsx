
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Layout from './components/Layout.tsx';
import Login from './pages/Login.tsx';
import Onboarding from './pages/Onboarding.tsx';
import Dashboard from './pages/Dashboard.tsx';
import PlayerList from './pages/PlayerList.tsx';
import Ranking from './pages/Ranking.tsx';
import Finance from './pages/Finance.tsx';
import CreateMatch from './pages/CreateMatch.tsx';
import Profile from './pages/Profile.tsx';
import TeamBalancing from './pages/TeamBalancing.tsx';
import NotificationToast, { Notification as InAppNotification } from './components/NotificationToast.tsx';
import { MaintenanceScreen } from './components/MaintenanceScreen.tsx';
import { Page, Player, Match } from './types.ts';
import { MASTER_ADMIN_EMAIL, MAIN_LOGO_URL } from './constants.tsx';
import { auth, db, loginWithGoogle, onAuthStateChanged, onSnapshot, collection, query, orderBy, doc, getDoc, updateDoc, setDoc, getDocs, limit, where } from './services/firebase.ts';
import { requestNotificationPermission, sendPushNotification, setupForegroundNotifications, sendPendingAthletesReminder } from './services/notificationService.ts';
import { checkMatchEveInfo } from './utils/timeUtils.ts';
import { playSound } from './utils/sound.ts';

const VALID_PAGES = new Set<string>(Object.values(Page));

const sanitizePlayer = (id: string, raw: any): Player => {
  const safeData = raw && typeof raw === 'object' ? raw : {};
  const safeName = typeof safeData.name === 'string' && safeData.name.trim()
    ? safeData.name.trim()
    : (safeData.email === MASTER_ADMIN_EMAIL ? 'Diogo (Admin)' : 'Atleta');
  const safePosition = typeof safeData.position === 'string' && safeData.position.trim()
    ? safeData.position.trim()
    : 'Meia';
  const safePhoto = typeof safeData.photoUrl === 'string' && safeData.photoUrl.trim()
    ? safeData.photoUrl
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(safeName)}&background=003a75&color=fff`;

  return {
    ...safeData,
    id: id || safeData.id || 'unknown',
    name: safeName,
    position: safePosition,
    photoUrl: safePhoto,
    goals: Number(safeData.goals) || 0,
    assists: Number(safeData.assists) || 0,
    status: safeData.status === 'presente' || safeData.status === 'ausente' || safeData.status === 'pendente'
      ? safeData.status
      : 'pendente',
    playerType: safeData.playerType === 'mensalista' ? 'mensalista' : 'avulso',
    role: safeData.role === 'admin' || safeData.email === MASTER_ADMIN_EMAIL ? 'admin' : 'player',
  } as Player;
};

const App: React.FC = () => {
  // Limpa qualquer sessão fake antiga salva no localStorage para impedir acesso admin sem login real
  useEffect(() => {
    localStorage.removeItem('oa_preview_user');
  }, []);

  const [user, setUser] = useState<any>(() => auth.currentUser || null);
  const [loading, setLoading] = useState<boolean>(true);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);
  const [currentPage, setCurrentPage] = useState<Page>(() => {
    const saved = localStorage.getItem('oa_current_page');
    return saved && VALID_PAGES.has(saved) && saved !== Page.Login && saved !== Page.Onboarding
      ? (saved as Page)
      : Page.Dashboard;
  });

  // Inicializa instantaneamente com os últimos dados reais salvos em cache local (nunca dados genéricos)
  const [players, setPlayers] = useState<Player[]>(() => {
    try {
      const cached = localStorage.getItem('oa_real_players_cache');
      if (!cached) return [];
      const parsed = JSON.parse(cached);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(p => p && typeof p === 'object')
        .map((p, idx) => sanitizePlayer(p.id || `cached_${idx}`, p));
    } catch {
      return [];
    }
  });

  const [currentMatch, setCurrentMatch] = useState<Match | null>(() => {
    try {
      const cached = localStorage.getItem('oa_real_match_cache');
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      return parsed && typeof parsed === 'object' && parsed.id ? parsed : null;
    } catch {
      return null;
    }
  });

  const currentMatchRef = useRef<Match | null>(currentMatch);
  const [inAppNotifications, setInAppNotifications] = useState<InAppNotification[]>([]);
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [adminPreviewMaintenance, setAdminPreviewMaintenance] = useState(false);
  
  const prevPlayersState = useRef<Record<string, Player>>({});
  const lastNotificationId = useRef<string | null>(null);

  // Listener para status global de Manutenção
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "system"), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setIsMaintenance(!!d?.isMaintenance);
      } else {
        setIsMaintenance(false);
      }
    }, () => {
      setIsMaintenance(false);
    });
    return () => unsub();
  }, []);

  // Persistir página atual
  useEffect(() => {
    if (currentPage !== Page.Login && currentPage !== Page.Onboarding) {
      localStorage.setItem('oa_current_page', currentPage);
    }
  }, [currentPage]);

  const handleDirectLogin = (mockUser: any) => {
    setUser(mockUser);
    setCurrentPage(Page.Dashboard);
  };

  const handleLogout = async () => {
    localStorage.removeItem('oa_preview_user');
    localStorage.removeItem('oa_current_page');
    try {
      await auth.signOut();
    } catch {}
    setUser(null);
    setCurrentPage(Page.Login);
  };

  const addInAppNotification = (title: string, message: string, type: InAppNotification['type'] = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setInAppNotifications(prev => [{ id, title, message, type, createdAt: Date.now() }, ...prev]);
    setTimeout(() => {
      setInAppNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        localStorage.removeItem('oa_has_logged_out');
        localStorage.removeItem('oa_preview_user');
        setUser(firebaseUser);

        // Garante imediatamente uma página válida antes de qualquer chamada assíncrona ao banco
        setCurrentPage(prev => (prev === Page.Login ? Page.Dashboard : prev));

        try {
          setupForegroundNotifications();
          const playerDocRef = doc(db, "players", firebaseUser.uid);
          const playerDoc = await getDoc(playerDocRef);
          let userProfileExists = playerDoc.exists() && !!playerDoc.data()?.name;

          // Se não encontrou pelo UID mas o usuário tem email, verifica se já existe perfil cadastrado com esse email
          if (!userProfileExists && firebaseUser.email) {
            try {
              const qEmail = query(collection(db, "players"), where("email", "==", firebaseUser.email), limit(1));
              const emailSnap = await getDocs(qEmail);
              if (!emailSnap.empty) {
                const existingData = emailSnap.docs[0].data();
                await setDoc(playerDocRef, {
                  ...existingData,
                  id: firebaseUser.uid,
                  email: firebaseUser.email,
                  name: existingData.name || firebaseUser.displayName || 'Atleta',
                  photoUrl: existingData.photoUrl || firebaseUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(existingData.name || firebaseUser.displayName || 'Atleta')}&background=0051a2&color=fff`
                }, { merge: true });
                userProfileExists = true;
              }
            } catch {}
          }
          
          if (firebaseUser.email === MASTER_ADMIN_EMAIL) {
            const existing = playerDoc.exists() ? playerDoc.data() : {};
            await setDoc(playerDocRef, {
              id: firebaseUser.uid,
              name: existing?.name || firebaseUser.displayName || 'Diogo (Admin)',
              position: existing?.position || 'Meia',
              role: 'admin',
              email: MASTER_ADMIN_EMAIL,
              photoUrl: existing?.photoUrl || firebaseUser.photoURL || `https://ui-avatars.com/api/?name=Diogo&background=003a75&color=fff`
            }, { merge: true }).catch(() => {});
            userProfileExists = true;
          }

          if (!userProfileExists) {
            setCurrentPage(Page.Onboarding);
          } else {
            const saved = localStorage.getItem('oa_current_page');
            if (!saved || !VALID_PAGES.has(saved) || saved === Page.Login || saved === Page.Onboarding) {
              setCurrentPage(Page.Dashboard);
            }
          }
        } catch (err) { 
          setCurrentPage(Page.Dashboard);
        }
      } else {
        setUser(null);
        setCurrentPage(Page.Login);
      }
      setLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Flags locais para esta execução do efeito
    let isInitialPlayersSync = true;

    const qPlayers = collection(db, "players");
    const unsubscribePlayers = onSnapshot(qPlayers, (snapshot) => {
      const playerList = snapshot.docs
        .filter(d => {
          const raw = d.data();
          // Ignora documentos vazios sem nome e sem email criados acidentalmente
          return raw && (raw.name || raw.email);
        })
        .map(d => sanitizePlayer(d.id, d.data()))
        .sort((a, b) => (b.goals || 0) - (a.goals || 0));
      
      if (!isInitialPlayersSync) {
        snapshot.docChanges().forEach((change) => {
          const playerData = sanitizePlayer(change.doc.id, change.doc.data());
          const oldPlayerData = prevPlayersState.current[change.doc.id];

          if (change.type === "modified" && oldPlayerData) {
            if (oldPlayerData.status !== playerData.status) {
              // Evitar notificar se não houver partida ativa (ex: ao encerrar pelada)
              if (!currentMatchRef.current) return;

              // Evitar notificar o próprio usuário que fez a ação
              if (playerData.id === user.uid) return;

              if (playerData.status === 'presente') {
                playSound('cheer');
                sendPushNotification("✅ CONFIRMADO!", `${playerData.name} vai pro jogo!`);
                addInAppNotification("✅ CONFIRMADO!", `${playerData.name} vai pro jogo!`, 'success');
              } else if (playerData.status === 'ausente') {
                playSound('boo');
                sendPushNotification("🚫 RECUSOU!", `${playerData.name} não poderá participar.`);
                addInAppNotification("🚫 RECUSOU!", `${playerData.name} não poderá participar.`, 'error');
              } else {
                playSound('boo');
                sendPushNotification("❌ SAIU DA LISTA!", `${playerData.name} voltou para pendente.`);
                addInAppNotification("❌ SAIU DA LISTA!", `${playerData.name} voltou para pendente.`, 'error');
              }
            }
          }
        });
      }

      const newState: Record<string, Player> = {};
      playerList.forEach(p => newState[p.id] = p);
      prevPlayersState.current = newState;
      isInitialPlayersSync = false;
      setPlayers(playerList);
      try {
        // Evita estourar quota do localStorage caso algum atleta tenha foto base64 gigante
        const lightCache = playerList.map(p => ({
          ...p,
          photoUrl: p.photoUrl && p.photoUrl.length > 2048
            ? `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=003a75&color=fff`
            : p.photoUrl
        }));
        localStorage.setItem('oa_real_players_cache', JSON.stringify(lightCache));
      } catch {}
    });

    // Busca apenas a convocação atual (limit 1) para carregamento ultrarrápido
    const qMatches = query(collection(db, "matches"), orderBy("createdAt", "desc"), limit(1));
    const unsubscribeMatches = onSnapshot(qMatches, (snapshot) => {
      if (!snapshot.empty) {
        const matchData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Match;
        setCurrentMatch(matchData);
        currentMatchRef.current = matchData;
        try {
          localStorage.setItem('oa_real_match_cache', JSON.stringify(matchData));
        } catch {}
      } else {
        setCurrentMatch(null);
        currentMatchRef.current = null;
        localStorage.removeItem('oa_real_match_cache');
      }
    });

    // Listener para transmissões de notificações (Broadcasts)
    // Usamos um pequeno atraso para garantir que não percamos notificações por diferença de relógio
    const startTime = new Date(Date.now() - 30000).toISOString(); 
    const qBroadcasts = query(
      collection(db, "notifications"), 
      where("createdAt", ">", startTime),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    
    const unsubscribeBroadcasts = onSnapshot(qBroadcasts, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          
          // Evitar notificar o próprio remetente
          if (data.senderId === user.uid) return;

          // Se a notificação for exclusiva para atletas pendentes, verificar o status do atleta logado
          if (data.targetStatus === 'pendente') {
            const myPlayer = prevPlayersState.current[user.uid] || Object.values(prevPlayersState.current).find(
              p => user.email && p.email && p.email.toLowerCase() === user.email.toLowerCase()
            );
            const myStatus = myPlayer?.status || 'pendente';
            if (myStatus !== 'pendente') return;
          }

          playSound('cheer');
          sendPushNotification(data.title, data.body);
          addInAppNotification(data.title, data.body, 'info');
        }
      });
    }, () => {});

    return () => {
      unsubscribePlayers();
      unsubscribeMatches();
      unsubscribeBroadcasts();
    };
  }, [user]);

  const currentPlayer = players.find(p => 
    p.id === user?.uid || 
    (user?.email && p.email && p.email.toLowerCase() === user.email.toLowerCase())
  );

  // SISTEMA AUTOMÁTICO DE LEMBRETES PUSH NA VÉSPERA DA PELADA (PARA ATLETAS COM STATUS PENDENTE)
  useEffect(() => {
    if (!user || players.length === 0) return;

    const eveInfo = checkMatchEveInfo(currentMatch);
    if (!eveInfo.isEve) return;

    // 1. Lembrete Push Individual Automático no dispositivo do atleta que ainda está com status 'pendente'
    const myStatus = currentPlayer?.status || 'pendente';
    const personalStorageKey = `oa_eve_push_notified_${user.uid}_${eveInfo.eveDateKey}`;

    if (myStatus === 'pendente' && !localStorage.getItem(personalStorageKey)) {
      localStorage.setItem(personalStorageKey, 'true');
      const timer = setTimeout(() => {
        const title = '⏰ VÉSPERA DA PELADA • CONFIRME SUA PRESENÇA!';
        const body = `Olá, ${currentPlayer?.name || user.displayName || 'Atleta'}! Seu status ainda está PENDENTE para a pelada de amanhã às ${eveInfo.matchTime}. Confirme agora sua vaga antes das 18h!`;
        sendPushNotification(title, body);
        addInAppNotification(title, body, 'info');
      }, 2200);
      return () => clearTimeout(timer);
    }
  }, [user, currentMatch, players, currentPlayer]);

  // 2. Disparo Push Coletivo Automático de Véspera sincronizado via Firestore (1x na véspera para todos os pendentes)
  useEffect(() => {
    if (!user || players.length === 0) return;
    const eveInfo = checkMatchEveInfo(currentMatch);
    if (!eveInfo.isEve) return;

    const pendingCount = players.filter(p => p.status === 'pendente').length;
    if (pendingCount === 0) return;

    let isCancelled = false;
    const checkAndTriggerGlobalEveReminder = async () => {
      try {
        const reminderRef = doc(db, "settings", "reminders");
        const snap = await getDoc(reminderRef);
        const lastKey = snap.exists() ? snap.data()?.lastAutoEveReminderKey : null;

        if (!isCancelled && lastKey !== eveInfo.eveDateKey) {
          await setDoc(reminderRef, {
            lastAutoEveReminderKey: eveInfo.eveDateKey,
            lastAutoEveSentAt: new Date().toISOString(),
            pendingCountAtSend: pendingCount
          }, { merge: true });

          await sendPendingAthletesReminder(currentMatch, 'system_auto_eve', true);
        }
      } catch {}
    };

    checkAndTriggerGlobalEveReminder();
    return () => {
      isCancelled = true;
    };
  }, [user, currentMatch, players]);

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-deep flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <div className="w-24 h-24 rounded-3xl bg-white p-2 shadow-2xl border-2 border-amber-400/60">
            <img src={MAIN_LOGO_URL} alt="Ousadia & Alegria" className="w-full h-full object-contain rounded-2xl" referrerPolicy="no-referrer" />
          </div>
          <p className="text-white font-bold text-xs tracking-[0.3em] uppercase animate-pulse">Sincronizando Arena...</p>
        </div>
      </div>
    );
  }

  const isMaster = user?.email === MASTER_ADMIN_EMAIL;
  const effectiveRole = isMaster ? 'admin' : (currentPlayer?.role || 'player');
  const isAdmin = effectiveRole === 'admin' || isMaster;
  const enrichedUser = currentPlayer 
    ? { ...user, photoURL: currentPlayer.photoUrl || user?.photoURL, displayName: currentPlayer.name || user?.displayName }
    : user;

  // Se o aplicativo estiver em Modo de Manutenção (para atletas) ou o Admin estiver pré-visualizando
  if ((isMaintenance && !isAdmin) || (isAdmin && adminPreviewMaintenance)) {
    return (
      <div className="relative">
        {isAdmin && adminPreviewMaintenance && (
          <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] bg-navy-deep/95 backdrop-blur-md text-white px-4 py-2.5 rounded-2xl shadow-2xl border border-amber-400/80 flex items-center gap-3 animate-pop-in">
            <div className="flex items-center gap-2 text-xs font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></span>
              <span className="text-amber-300">MODO PRÉ-VISUALIZAÇÃO:</span>
              <span className="text-white/90">Esta é exatamente a tela que os atletas comuns veem agora.</span>
            </div>
            <button
              onClick={() => setAdminPreviewMaintenance(false)}
              className="px-3 py-1.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 rounded-xl font-headline-sm text-xs font-bold active:scale-95 transition-all flex items-center gap-1 shadow-md"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              <span>Voltar ao Painel Admin</span>
            </button>
          </div>
        )}
        <MaintenanceScreen 
          onCheckAgain={() => {
            if (adminPreviewMaintenance) {
              setAdminPreviewMaintenance(false);
            } else {
              window.location.reload();
            }
          }}
          onAdminLogin={async () => {
            if (adminPreviewMaintenance) {
              setAdminPreviewMaintenance(false);
            } else {
              try {
                await loginWithGoogle();
              } catch {}
            }
          }}
        />
      </div>
    );
  }

  const rawActivePage: Page = !user 
    ? Page.Login 
    : (currentPage === Page.Login || !VALID_PAGES.has(currentPage) ? Page.Dashboard : currentPage);

  const activePage: Page = (!isAdmin && (rawActivePage === Page.Finance || rawActivePage === Page.CreateMatch))
    ? Page.Dashboard
    : rawActivePage;

  return (
    <>
      <AnimatePresence>
        {showSplash && (
          <motion.div
            key="oa-splash-screen"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            onClick={() => setShowSplash(false)}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', zIndex: 100000 }}
            className="bg-gradient-to-b from-slate-950 via-navy-deep to-slate-950 flex flex-col items-center justify-center p-6 overflow-hidden select-none cursor-pointer"
          >
            {/* Iluminação de Estádio */}
            <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-primary-container/25 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-amber-400/15 blur-3xl pointer-events-none" />

            <motion.div
              initial={{ scale: 0.78, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex flex-col items-center z-10"
            >
              {/* Halo Dourado / Vermelho atrás do Novo Escudo */}
              <motion.div
                animate={{ scale: [1, 1.08, 1], opacity: [0.45, 0.75, 0.45] }}
                transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
                className="absolute -inset-4 rounded-full bg-gradient-to-tr from-primary-container/40 via-amber-400/35 to-blue-500/40 blur-2xl pointer-events-none"
              />

              {/* Moldura Oficial do Novo Escudo */}
              <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-[32px] bg-gradient-to-br from-amber-300 via-primary-container to-navy-deep p-[3px] shadow-[0_20px_60px_rgba(0,0,0,0.55)] relative z-10">
                <div className="w-full h-full bg-white rounded-[29px] p-2.5 flex items-center justify-center overflow-hidden">
                  <img
                    src={MAIN_LOGO_URL}
                    alt="Escudo Oficial Ousadia & Alegria"
                    className="w-full h-full object-contain rounded-2xl"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>

              {/* Tipografia do Clube */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4 }}
                className="text-center mt-6 space-y-1.5"
              >
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/10 border border-amber-400/30 text-amber-300 text-[10px] font-bold uppercase tracking-[0.2em]">
                  <span>⚽</span>
                  <span>Arena Oficial • Temporada 2026</span>
                </div>
                <h1 className="font-headline-lg text-3xl sm:text-4xl text-white font-black tracking-wider uppercase drop-shadow">
                  OUSADIA & ALEGRIA
                </h1>
                <p className="text-xs text-white/70 font-medium tracking-widest uppercase">
                  Granja Cantinho do Céu
                </p>
              </motion.div>

              {/* Barra de Progresso Rápida */}
              <div className="w-48 h-1.5 bg-white/15 rounded-full overflow-hidden mt-7 border border-white/10">
                <motion.div
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 1.35, ease: "easeInOut" }}
                  className="h-full bg-gradient-to-r from-primary-container via-amber-400 to-emerald-400 rounded-full"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Layout currentPage={activePage} onPageChange={setCurrentPage} currentUserRole={effectiveRole} currentUser={enrichedUser}>
      {isMaintenance && isAdmin && (
        <div className="bg-amber-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-between z-50 sticky top-0 shadow-md flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] animate-pulse">engineering</span>
            <span>MODO MANUTENÇÃO ATIVO: Atletas comuns estão bloqueados nesta tela especial.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAdminPreviewMaintenance(true)}
              className="px-2.5 py-1 bg-amber-800 hover:bg-amber-900 text-white rounded-lg font-headline-sm text-xs font-bold active:scale-95 shadow-sm flex items-center gap-1 border border-white/20"
              title="Veja exatamente a tela que está aparecendo para os atletas"
            >
              <span className="material-symbols-outlined text-[16px]">visibility</span>
              <span>Ver Tela dos Atletas</span>
            </button>
            {isMaster && (
              <button
                onClick={async () => {
                  if (confirm("Deseja desativar o modo de manutenção e liberar o app para todos os usuários?")) {
                    await updateDoc(doc(db, "settings", "system"), { isMaintenance: false });
                  }
                }}
                className="px-2.5 py-1 bg-white text-amber-900 hover:bg-white/90 rounded-lg font-headline-sm text-xs font-bold active:scale-95 shadow-sm"
              >
                DESATIVAR
              </button>
            )}
          </div>
        </div>
      )}

      <NotificationToast 
        notifications={inAppNotifications} 
        onClose={(id) => setInAppNotifications(prev => prev.filter(n => n.id !== id))} 
      />
      <div className="animate-fade-in h-full">
        {!user && <Login onDirectLogin={handleDirectLogin} />}
        {user && activePage === Page.Onboarding && <Onboarding user={user} onComplete={() => setCurrentPage(Page.Dashboard)} />}
        {user && activePage === Page.Dashboard && <Dashboard match={currentMatch} players={players} user={user} currentUserRole={effectiveRole} onPageChange={setCurrentPage} />}
        {user && activePage === Page.PlayerList && <PlayerList players={players} currentUser={user} match={currentMatch} onPageChange={setCurrentPage} />}
        {user && activePage === Page.Ranking && <Ranking players={players} currentUser={user} onPageChange={setCurrentPage} />}
        {user && activePage === Page.Finance && <Finance players={players} currentUser={user} match={currentMatch} onPageChange={setCurrentPage} />}
        {user && activePage === Page.CreateMatch && <CreateMatch user={user} onPageChange={setCurrentPage} />}
        {user && (activePage === Page.TeamBalancing || activePage === Page.ArenaPanel) && (
          <TeamBalancing players={players} user={user} currentUserRole={effectiveRole} onPageChange={setCurrentPage} />
        )}
        {user && activePage === Page.Profile && (
          <Profile 
            player={currentPlayer || { id: user.uid, name: user.displayName || 'Atleta', email: user.email || '', photoUrl: user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'Atleta')}&background=0051a2&color=fff`, goals: 0, assists: 0, position: 'Meio-Campo', status: 'pendente', role: effectiveRole, playerType: 'avulso' } as Player} 
            currentUser={user}
            currentUserEmail={user?.email} 
            isMaintenance={isMaintenance}
            onPageChange={setCurrentPage} 
            onLogout={handleLogout}
            onPreviewMaintenance={() => setAdminPreviewMaintenance(true)}
          />
        )}
      </div>
    </Layout>
    </>
  );
};

export default App;
