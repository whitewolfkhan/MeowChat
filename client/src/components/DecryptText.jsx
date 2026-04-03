'use client';

import { useState, useEffect, useRef, memo } from 'react';

const CIPHER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=!@#$%^&*';

function DecryptText({ text, speed = 25, className = '' }) {
  const [display, setDisplay] = useState('');
  const [done, setDone] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!text) { setDisplay(''); setDone(true); return; }

    let resolved = 0;
    let tick = 0;

    const step = () => {
      let out = '';
      for (let i = 0; i < text.length; i++) {
        if (i < resolved) {
          out += text[i];
        } else if (text[i] === ' ') {
          out += ' ';
        } else {
          out += CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)];
        }
      }
      setDisplay(out);
      tick++;

      if (tick % 2 === 0) resolved++;

      if (resolved > text.length) {
        setDisplay(text);
        setDone(true);
        return;
      }
      timerRef.current = setTimeout(step, speed);
    };

    step();
    return () => clearTimeout(timerRef.current);
  }, [text, speed]);

  return (
    <span className={className}>
      {display}
      {!done && <span className="text-terminal-green/40 animate-pulse ml-0.5">▌</span>}
    </span>
  );
}

export default memo(DecryptText);
