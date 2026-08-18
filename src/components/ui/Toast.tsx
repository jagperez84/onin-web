import { useEffect } from 'react';

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
 useEffect(() => { const timer = window.setTimeout(onClose, 5000); return () => window.clearTimeout(timer); }, [onClose]);
 return <div className="app-toast" role="status" aria-live="polite">{message}</div>;
}
