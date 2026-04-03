'use client';

import { useState, useRef } from 'react';
import { generateCoverImage, hideMessage, getCapacity } from '@/lib/steganography';

const COVER_TYPES = [
  { type: 'cat', icon: '🐱', label: 'Cat' },
  { type: 'noise', icon: '📡', label: 'Noise' },
  { type: 'abstract', icon: '🎨', label: 'Art' },
];

export default function StegoPanel({ onSend, onClose }) {
  const [coverUrl, setCoverUrl] = useState(null);
  const [message, setMessage] = useState('');
  const [capacity, setCapacity] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleGenerate = (type) => {
    setError('');
    const canvas = generateCoverImage(type, 200, 200);
    canvasRef.current = canvas;
    setCoverUrl(canvas.toDataURL());
    setCapacity(getCapacity(200, 200));
  };

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 300;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.floor(w * ratio);
          h = Math.floor(h * ratio);
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvasRef.current = canvas;
        setCoverUrl(canvas.toDataURL());
        setCapacity(getCapacity(w, h));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSend = () => {
    if (!canvasRef.current || !message.trim()) return;
    setSending(true);
    setError('');
    try {
      hideMessage(canvasRef.current, message.trim());
      const dataUrl = canvasRef.current.toDataURL('image/png');
      onSend(dataUrl, message.trim());
      setMessage('');
      setCoverUrl(null);
      canvasRef.current = null;
      setCapacity(0);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-t border-terminal-amber/20 bg-terminal-darker/95 backdrop-blur-sm px-4 py-3 animate-slideUp">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[0.65rem] text-terminal-amber font-bold tracking-[0.15em]">
          🕵️ STEGANOGRAPHY MODULE
        </span>
        <button onClick={onClose} className="text-gray-500 hover:text-terminal-red transition-colors text-xs px-1">✕</button>
      </div>

      {/* Cover image buttons */}
      <div className="flex gap-2 mb-3">
        {COVER_TYPES.map((opt) => (
          <button key={opt.type} onClick={() => handleGenerate(opt.type)}
            className="flex-1 px-2 py-1.5 text-[0.6rem] rounded border border-terminal-border text-gray-400
                       hover:border-terminal-amber/40 hover:text-terminal-amber transition-all text-center">
            <div>{opt.icon}</div>
            <div className="mt-0.5">{opt.label}</div>
          </button>
        ))}
        <button onClick={() => fileInputRef.current?.click()}
          className="flex-1 px-2 py-1.5 text-[0.6rem] rounded border border-terminal-border text-gray-400
                     hover:border-terminal-amber/40 hover:text-terminal-amber transition-all text-center">
          <div>📁</div>
          <div className="mt-0.5">Upload</div>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      </div>

      {/* Preview + message */}
      <div className="flex gap-3">
        {coverUrl ? (
          <div className="flex-shrink-0">
            <img src={coverUrl} alt="Cover" className="w-24 h-24 rounded border border-terminal-amber/20 object-cover" />
            <div className="text-[0.45rem] text-gray-600 mt-1 text-center">{capacity.toLocaleString()} chars avail</div>
          </div>
        ) : (
          <div className="w-24 h-24 flex-shrink-0 rounded border border-dashed border-terminal-border/50 flex items-center justify-center">
            <span className="text-[0.5rem] text-gray-600 text-center px-1">Select cover<br />image</span>
          </div>
        )}

        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="type secret message to hide in image..."
            className="terminal-input w-full px-3 py-2 rounded text-[0.75rem] flex-1 resize-none min-h-[60px]"
            maxLength={capacity || 5000}
          />
          {error && <p className="text-[0.55rem] text-terminal-red">{error}</p>}
          <div className="flex items-center gap-2">
            <button onClick={handleSend} disabled={!coverUrl || !message.trim() || sending}
              className="px-4 py-1.5 bg-terminal-amber/10 border border-terminal-amber/30 text-terminal-amber
                         text-[0.65rem] font-bold tracking-wider rounded hover:bg-terminal-amber/20
                         disabled:opacity-30 disabled:cursor-not-allowed transition-all">
              {sending ? 'EMBEDDING...' : '🕵️ EMBED & SEND'}
            </button>
            {message && (
              <span className="text-[0.5rem] text-gray-600">
                {message.length}/{capacity} chars
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
