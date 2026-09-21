
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
import ArenaPanel from './pages/ArenaPanel.tsx';
import NotificationToast, { Notification as InAppNotification } from './components/NotificationToast.tsx';
import { Page, Player, Match } from './types.ts';
import { MASTER_ADMIN_EMAIL } from './constants.tsx';
import { auth, db, onAuthStateChanged, onSnapshot, collection, query, orderBy, doc, getDoc, updateDoc, limit, where } from './services/firebase.ts';
import { requestNotificationPermission, sendPushNotification, setupForegroundNotifications } from './services/notificationService.ts';
import { playSound } from './utils/sound.ts';

const App: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<Page>(() => {
    const saved = localStorage.getItem('oa_current_page');
    return saved ? (saved as Page) : Page.Login;
  });
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const currentMatchRef = useRef<Match | null>(null);
  const [inAppNotifications, setInAppNotifications] = useState<InAppNotification[]>([]);
  
  const prevPlayersState = useRef<Record<string, Player>>({});
  const lastNotificationId = useRef<string | null>(null);

  // Persistir página atual
  useEffect(() => {
    if (currentPage !== Page.Login && currentPage !== Page.Onboarding) {
      localStorage.setItem('oa_current_page', currentPage);
    }
  }, [currentPage]);

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
        setUser(firebaseUser);
        // Removido o pedido automático de permissão para evitar alertas de spam do navegador
        // requestNotificationPermission(firebaseUser.uid);

        try {
          setupForegroundNotifications();
          const playerDocRef = doc(db, "players", firebaseUser.uid);
          const playerDoc = await getDoc(playerDocRef);
          
          if (firebaseUser.email === MASTER_ADMIN_EMAIL) {
            const updates: any = {};
            if (!playerDoc.exists() || playerDoc.data()?.role !== 'admin') updates.role = 'admin';
            if (playerDoc.exists() && playerDoc.data()?.email !== MASTER_ADMIN_EMAIL) updates.email = MASTER_ADMIN_EMAIL;
            if (Object.keys(updates).length > 0) await updateDoc(playerDocRef, updates).catch(() => {});
          }

          if (!playerDoc.exists()) {
            setCurrentPage(Page.Onboarding);
          } else {
            // Se já tiver uma página salva, mantém ela, senão vai pro Dashboard
            const saved = localStorage.getItem('oa_current_page');
            if (!saved || saved === Page.Login || saved === Page.Onboarding) {
              setCurrentPage(Page.Dashboard);
            }
          }
        } catch (err) { 
          setCurrentPage(Page.Dashboard);
        }
      } else {
        setUser(null);
        setCurrentPage(Page.Login);
        localStorage.removeItem('oa_current_page');
      }
      setLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Flags locais para esta execução do efeito
    let isInitialPlayersSync = true;

    const qPlayers = query(collection(db, "players"), orderBy("goals", "desc"));
    const unsubscribePlayers = onSnapshot(qPlayers, (snapshot) => {
      const playerList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
      
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
    });

    // Ajustado para garantir que a UI limpe quando não houver partidas
    const qMatches = query(collection(db, "matches"), orderBy("createdAt", "desc"));
    const unsubscribeMatches = onSnapshot(qMatches, (snapshot) => {
      if (!snapshot.empty) {
        const matchData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Match;
        setCurrentMatch(matchData);
        currentMatchRef.current = matchData;
      } else {
        setCurrentMatch(null);
        currentMatchRef.current = null;
      }
    });

    // Listener para transmissões de notificações (Broadcasts)
    // Usamos um pequeno atraso para garantir que não percamos notificações por diferença de relógio
    const startTime = new Date(Date.now() - 30000).toISOString(); 
    const qBroadcasts = query(
      collection(db, "notifications"), 
      where("createdAt", ">", startTime),
      orderBy("createdAt", "desc")
    );
    
    console.log("📡 Ouvindo novas notificações desde:", startTime);

    const unsubscribeBroadcasts = onSnapshot(qBroadcasts, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          
          // Evitar notificar o próprio remetente
          if (data.senderId === user.uid) return;

          console.log("🔔 Nova notificação recebida via DB:", data.title);
          playSound('cheer');
          sendPushNotification(data.title, data.body);
          addInAppNotification(data.title, data.body, 'info');
        }
      });
    }, (error) => {
      console.error("❌ Erro no listener de notificações:", error);
    });

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

  const currentPlayer = players.find(p => p.id === user?.uid);
  const effectiveRole = user?.email === MASTER_ADMIN_EMAIL ? 'admin' : currentPlayer?.role;

  return (
    <Layout currentPage={currentPage} onPageChange={setCurrentPage} currentUserRole={effectiveRole}>
      <NotificationToast 
        notifications={inAppNotifications} 
        onClose={(id) => setInAppNotifications(prev => prev.filter(n => n.id !== id))} 
      />
      <div className="animate-fade-in h-full">
        {!user && <Login />}
        {user && currentPage === Page.Onboarding && <Onboarding user={user} onComplete={() => setCurrentPage(Page.Dashboard)} />}
        {user && currentPage === Page.Dashboard && <Dashboard match={currentMatch} players={players} user={user} onPageChange={setCurrentPage} />}
        {user && currentPage === Page.PlayerList && <PlayerList players={players} currentUser={user} match={currentMatch} onPageChange={setCurrentPage} />}
        {user && currentPage === Page.Ranking && <Ranking players={players} currentUser={user} onPageChange={setCurrentPage} />}
        {user && currentPage === Page.Finance && <Finance players={players} currentUser={user} match={currentMatch} onPageChange={setCurrentPage} />}
        {user && currentPage === Page.CreateMatch && <CreateMatch user={user} onPageChange={setCurrentPage} />}
        {user && currentPage === Page.TeamBalancing && <TeamBalancing players={players} onPageChange={setCurrentPage} />}
        {user && currentPage === Page.ArenaPanel && <ArenaPanel user={user} players={players} match={currentMatch} onPageChange={setCurrentPage} />}
        {user && currentPage === Page.Profile && (
          <Profile 
            player={currentPlayer || { id: user.uid, name: user.displayName, email: user.email, photoUrl: user.photoURL, goals: 0, assists: 0, position: 'A definir', status: 'pendente', role: effectiveRole } as Player} 
            currentUserEmail={user?.email} 
            onPageChange={setCurrentPage} 
          />
        )}
      </div>
    </Layout>
  );
};

export default App;
