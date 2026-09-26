
import React, { useState, useEffect, useRef } from 'react';
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
import { MASTER_ADMIN_EMAIL } from './constants.tsx';
import { auth, db, onAuthStateChanged, onSnapshot, collection, query, orderBy, doc, getDoc, updateDoc, setDoc, getDocs, limit, where } from './services/firebase.ts';
import { requestNotificationPermission, sendPushNotification, setupForegroundNotifications } from './services/notificationService.ts';
import { playSound } from './utils/sound.ts';

const DEFAULT_PREVIEW_USER = {
  uid: 'master_admin_diogo',
  email: MASTER_ADMIN_EMAIL,
  displayName: 'Diogo (Admin)',
  photoURL: 'https://ui-avatars.com/api/?name=Diogo&background=003a75&color=fff'
};

const App: React.FC = () => {
  const [user, setUser] = useState<any>(() => {
    const saved = localStorage.getItem('oa_preview_user');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    const hasLoggedOut = localStorage.getItem('oa_has_logged_out');
    if (!hasLoggedOut) {
      return DEFAULT_PREVIEW_USER;
    }
    return null;
  });

  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState<Page>(() => {
    const hasLoggedOut = localStorage.getItem('oa_has_logged_out');
    if (hasLoggedOut) return Page.Login;
    const saved = localStorage.getItem('oa_current_page');
    return saved && saved !== Page.Login && saved !== Page.Onboarding ? (saved as Page) : Page.Dashboard;
  });

  // Inicializa instantaneamente com os últimos dados reais salvos em cache local (nunca dados genéricos)
  const [players, setPlayers] = useState<Player[]>(() => {
    try {
      const cached = localStorage.getItem('oa_real_players_cache');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [currentMatch, setCurrentMatch] = useState<Match | null>(() => {
    try {
      const cached = localStorage.getItem('oa_real_match_cache');
      return cached ? JSON.parse(cached) : null;
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
    localStorage.removeItem('oa_has_logged_out');
    localStorage.setItem('oa_preview_user', JSON.stringify(mockUser));
    setUser(mockUser);
    setCurrentPage(Page.Dashboard);
  };

  const handleLogout = () => {
    localStorage.setItem('oa_has_logged_out', 'true');
    localStorage.removeItem('oa_preview_user');
    localStorage.removeItem('oa_current_page');
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

        try {
          setupForegroundNotifications();
          const playerDocRef = doc(db, "players", firebaseUser.uid);
          const playerDoc = await getDoc(playerDocRef);
          let userProfileExists = playerDoc.exists();

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
            const updates: any = {};
            if (!userProfileExists || playerDoc.data()?.role !== 'admin') updates.role = 'admin';
            if (playerDoc.exists() && playerDoc.data()?.email !== MASTER_ADMIN_EMAIL) updates.email = MASTER_ADMIN_EMAIL;
            if (Object.keys(updates).length > 0) await setDoc(playerDocRef, updates, { merge: true }).catch(() => {});
          }

          if (!userProfileExists) {
            setCurrentPage(Page.Onboarding);
          } else {
            const saved = localStorage.getItem('oa_current_page');
            if (!saved || saved === Page.Login || saved === Page.Onboarding) {
              setCurrentPage(Page.Dashboard);
            }
          }
        } catch (err) { 
          setCurrentPage(Page.Dashboard);
        }
      } else {
        const previewUser = localStorage.getItem('oa_preview_user');
        const hasLoggedOut = localStorage.getItem('oa_has_logged_out');
        if (previewUser && !hasLoggedOut) {
          try {
            setUser(JSON.parse(previewUser));
          } catch {
            setUser(DEFAULT_PREVIEW_USER);
          }
        } else if (!hasLoggedOut) {
          setUser(DEFAULT_PREVIEW_USER);
        } else {
          setUser(null);
          setCurrentPage(Page.Login);
        }
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
        .map(doc => ({ id: doc.id, ...doc.data() } as Player))
        .sort((a, b) => (b.goals || 0) - (a.goals || 0));
      
      if (!isInitialPlayersSync) {
        snapshot.docChanges().forEach((change) => {
          const playerData = change.doc.data() as Player;
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
        localStorage.setItem('oa_real_players_cache', JSON.stringify(playerList));
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

  if (loading) {
    return (
      <div className="min-h-screen bg-neo-dots flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="w-20 h-20 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-navy font-black text-[11px] tracking-[0.5em] uppercase animate-pulse">Sincronizando Arena...</p>
        </div>
      </div>
    );
  }

  const currentPlayer = players.find(p => 
    p.id === user?.uid || 
    (user?.email && p.email && p.email.toLowerCase() === user.email.toLowerCase())
  );
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
          onAdminLogin={() => {
            if (adminPreviewMaintenance) {
              setAdminPreviewMaintenance(false);
            } else {
              handleDirectLogin(DEFAULT_PREVIEW_USER);
            }
          }}
        />
      </div>
    );
  }

  return (
    <Layout currentPage={currentPage} onPageChange={setCurrentPage} currentUserRole={effectiveRole} currentUser={enrichedUser}>
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
        {user && currentPage === Page.Onboarding && <Onboarding user={user} onComplete={() => setCurrentPage(Page.Dashboard)} />}
        {user && currentPage === Page.Dashboard && <Dashboard match={currentMatch} players={players} user={user} currentUserRole={effectiveRole} onPageChange={setCurrentPage} />}
        {user && currentPage === Page.PlayerList && <PlayerList players={players} currentUser={user} match={currentMatch} onPageChange={setCurrentPage} />}
        {user && currentPage === Page.Ranking && <Ranking players={players} currentUser={user} onPageChange={setCurrentPage} />}
        {user && currentPage === Page.Finance && <Finance players={players} currentUser={user} match={currentMatch} onPageChange={setCurrentPage} />}
        {user && currentPage === Page.CreateMatch && <CreateMatch user={user} onPageChange={setCurrentPage} />}
        {user && (currentPage === Page.TeamBalancing || currentPage === Page.ArenaPanel) && (
          <TeamBalancing players={players} user={user} currentUserRole={effectiveRole} onPageChange={setCurrentPage} />
        )}
        {user && currentPage === Page.Profile && (
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
  );
};

export default App;
