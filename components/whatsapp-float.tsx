'use client';

import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';

export function WhatsAppFloat() {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/api/settings').then(response => response.ok ? response.json() : null).then(settings => {
      if (!active || !settings?.whatsappNumber) return;
      const digits = String(settings.whatsappNumber).replace(/\D/g, '');
      const number = digits.startsWith('00') ? digits.slice(2) : digits.startsWith('0') ? `92${digits.slice(1)}` : digits;
      if (number.length >= 7) setUrl(`https://wa.me/${number}?text=${encodeURIComponent('Assalam o Alaikum, I have a question about AS Collection.')}`);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  if (!url) return null;
  return <a className="whatsapp-float" href={url} target="_blank" rel="noopener noreferrer" aria-label="Chat with AS Collection on WhatsApp" title="Chat with us on WhatsApp"><MessageCircle size={24}/><span>WhatsApp</span></a>;
}
