
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  createdAt: number;
}

interface NotificationToastProps {
  notifications: Notification[];
  onClose: (id: string) => void;
}

const NotificationToast: React.FC<NotificationToastProps> = ({ notifications, onClose }) => {
  return (
    <div className="fixed top-6 left-6 right-6 z-[100] pointer-events-none flex flex-col gap-3">
      <AnimatePresence>
        {notifications.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: -20, scale: 0.95, filter: 'blur(4px)' }}
            animate={{ 
              opacity: 1, 
              y: 0, 
              scale: 1, 
              filter: 'blur(0px)',
              transition: {
                type: "spring",
                stiffness: 350,
                damping: 25
              }
            }}
            exit={{ 
              opacity: 0, 
              scale: 0.95, 
              y: -10,
              filter: 'blur(4px)',
              transition: { duration: 0.25, ease: "easeInOut" } 
            }}
            layout
            className="pointer-events-auto bg-white/90 backdrop-blur-xl border border-slate-100 rounded-3xl p-5 shadow-elite flex items-center gap-4 relative overflow-hidden"
          >
            {/* Accent Bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
              n.type === 'success' ? 'bg-success' : 
              n.type === 'error' ? 'bg-primary' : 
              n.type === 'warning' ? 'bg-yellow-400' : 'bg-navy'
            }`} />

            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
              n.type === 'success' ? 'bg-success/10 text-success' : 
              n.type === 'error' ? 'bg-primary/10 text-primary' : 
              n.type === 'warning' ? 'bg-yellow-400/10 text-yellow-600' : 'bg-navy/10 text-navy'
            }`}>
              <span className="material-symbols-outlined text-2xl">
                {n.type === 'success' ? 'check_circle' : 
                 n.type === 'error' ? 'error' : 
                 n.type === 'warning' ? 'warning' : 'notifications'}
              </span>
            </div>

            <div className="flex-1 pr-4">
              <h4 className="text-[11px] font-black text-navy uppercase italic tracking-tighter leading-none mb-1">
                {n.title}
              </h4>
              <p className="text-[13px] font-bold text-slate-500 leading-tight">
                {n.message}
              </p>
            </div>

            <button 
              onClick={() => onClose(n.id)}
              className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-300 hover:text-navy transition-colors"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default NotificationToast;
