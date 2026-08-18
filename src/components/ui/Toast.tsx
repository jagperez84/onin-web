import { useEffect } from 'react';

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
 useEffect(() => { const timer = window.setTimeout(onClose, 5000); return () => window.clearTimeout(timer); }, [onClose]);
 return <div className="app-toast" role="status" aria-live="polite" style={{position:'fixed',right:24,bottom:24,zIndex:11000,maxWidth:420,padding:'12px 16px',borderRadius:8,background:'var(--text)',color:'#fff',boxShadow:'0 10px 28px rgba(15,23,42,.2)',fontSize:13,fontWeight:600}}>{message}</div>;
}
