'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MatrixRain from '@/components/MatrixRain';

const MODES = [
  { id: 'aes', icon: '🔰', label: 'AES-256', sub: 'Shared key · Symmetric', color: 'green' },
  { id: 'ecc', icon: '🔐', label: 'ECC-25519', sub: 'Key pair · Asymmetric', color: 'cyan' },
  { id: 'signal', icon: '🚀', label: 'Signal', sub: 'Double Ratchet · E2EE', color: 'amber' },
];

export default function Home() {
  const router = useRouter();
  const [form, setForm] = useState({ codename: '', channel: '', secretKey: '' });
  const [mode, setMode] = useState('aes');
  const [isConnecting, setIsConnecting] = useState(false);
  const [titleText, setTitleText] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showKeyTip, setShowKeyTip] = useState(false);

  useEffect(() => {
    const full = 'MEOWCHAT';
    let i = 0;
    const interval = setInterval(() => {
      setTitleText(full.substring(0, i + 1));
      i++;
      if (i >= full.length) {
        clearInterval(interval);
        setTimeout(() => setShowForm(true), 300);
      }
    }, 120);
    return () => clearInterval(interval);
  }, []);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.codename.trim() || !form.channel.trim()) return;
    if (mode === 'aes' && !form.secretKey.trim()) return;

    setIsConnecting(true);
    sessionStorage.setItem('meowchat_codename', form.codename.trim());
    sessionStorage.setItem('meowchat_channel', form.channel.trim());
    sessionStorage.setItem('meowchat_mode', mode);

    if (mode === 'aes') {
      sessionStorage.setItem('meowchat_key', form.secretKey);
    } else {
      sessionStorage.removeItem('meowchat_key');
    }

    setTimeout(() => router.push('/chat'), 1500);
  };

  const keyStrength = !form.secretKey
    ? null
    : form.secretKey.length >= 32
      ? { label: 'STRONG', cls: 'text-terminal-green' }
      : form.secretKey.length >= 16
        ? { label: 'MODERATE', cls: 'text-terminal-amber' }
        : { label: 'WEAK', cls: 'text-terminal-red' };

  const isFormValid = form.codename && form.channel && (mode !== 'aes' || form.secretKey);

  const modeColors = { green: 'terminal-green', cyan: 'terminal-cyan', amber: 'terminal-amber' };
  const currentColor = MODES.find((m) => m.id === mode)?.color || 'green';

  const connectLabel =
    mode === 'signal' ? 'Initializing Double Ratchet...'
    : mode === 'ecc' ? 'Generating ECC-25519 key pair...'
    : 'Initializing AES-256 cipher...';

  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden bg-terminal-dark">
      <MatrixRain opacity={0.2} />

      {isConnecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="text-center animate-fadeIn">
            <div className="text-terminal-green text-lg text-glow mb-2 typing-cursor">
              ESTABLISHING SECURE CHANNEL
            </div>
            <div className="text-[0.65rem] text-gray-500 mb-4">{connectLabel}</div>
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 bg-terminal-green rounded-full animate-pulse" />
              <div className="w-2 h-2 bg-terminal-green rounded-full animate-pulse [animation-delay:0.2s]" />
              <div className="w-2 h-2 bg-terminal-green rounded-full animate-pulse [animation-delay:0.4s]" />
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 w-full max-w-lg mx-3 sm:mx-4">
        <div className="flex justify-center mb-6">
          <span className="stamp-classified opacity-60">TOP SECRET // SCI</span>
        </div>

        <div className="bg-terminal-panel/90 backdrop-blur-md border border-terminal-border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="border-b border-terminal-border px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center gap-3">
              <div className="text-2xl">🐱</div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-terminal-green text-glow tracking-wider">
                  {titleText}
                  {titleText.length < 8 && <span className="animate-pulse">_</span>}
                </h1>
                <p className="text-[0.65rem] text-gray-500 tracking-[0.3em] uppercase mt-0.5">
                  Encrypted Communications System
                </p>
              </div>
            </div>
          </div>

          {/* Version bar */}
          <div className="bg-black/40 px-4 sm:px-6 py-1.5 flex items-center justify-between text-[0.6rem] text-gray-600 border-b border-terminal-border">
            <span>v3.0.0 // {mode === 'aes' ? 'AES-256' : mode === 'ecc' ? 'ECC-25519' : 'SIGNAL PROTOCOL'}</span>
            <span className="text-terminal-red/50">CLASSIFIED</span>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className={`px-4 sm:px-6 py-5 sm:py-6 space-y-4 sm:space-y-5 transition-all duration-500 ${
              showForm ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            {/* Mode Selector */}
            <div>
              <label className="block text-[0.65rem] text-gray-500 tracking-[0.2em] uppercase mb-2">
                Encryption Protocol
              </label>
              <div className="grid grid-cols-3 gap-2">
                {MODES.map((m) => {
                  const active = mode === m.id;
                  const c = modeColors[m.color];
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      className={`px-2 py-2.5 rounded border text-left transition-all duration-200 ${
                        active
                          ? `border-${c}/50 bg-${c}/10 text-${c}`
                          : 'border-terminal-border text-gray-500 hover:border-gray-500'
                      }`}
                      style={active ? {
                        borderColor: `var(--tw-${m.color}, ${m.color === 'green' ? '#00ff41' : m.color === 'cyan' ? '#00d4ff' : '#ffb000'})`,
                        backgroundColor: `${m.color === 'green' ? 'rgba(0,255,65,0.1)' : m.color === 'cyan' ? 'rgba(0,212,255,0.1)' : 'rgba(255,176,0,0.1)'}`,
                        color: m.color === 'green' ? '#00ff41' : m.color === 'cyan' ? '#00d4ff' : '#ffb000',
                      } : {}}
                    >
                      <div className="text-[0.7rem] font-bold flex items-center gap-1">
                        <span>{m.icon}</span> {m.label}
                      </div>
                      <div className="text-[0.45rem] mt-0.5 opacity-60">{m.sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Codename */}
            <div>
              <label className="block text-[0.65rem] text-gray-500 tracking-[0.2em] uppercase mb-1.5">
                Agent Codename
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-terminal-green/40 text-sm">&gt;</span>
                <input
                  type="text" name="codename" value={form.codename} onChange={handleChange}
                  placeholder="e.g. Shadow, Ghost, Phoenix"
                  className="terminal-input w-full pl-7 pr-4 py-2.5 rounded text-sm"
                  maxLength={20} autoComplete="off" spellCheck={false} required
                />
              </div>
            </div>

            {/* Channel */}
            <div>
              <label className="block text-[0.65rem] text-gray-500 tracking-[0.2em] uppercase mb-1.5">
                Secure Channel
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-terminal-green/40 text-sm">#</span>
                <input
                  type="text" name="channel" value={form.channel} onChange={handleChange}
                  placeholder="e.g. phantom-ops, alpha-7"
                  className="terminal-input w-full pl-7 pr-4 py-2.5 rounded text-sm"
                  maxLength={30} autoComplete="off" spellCheck={false} required
                />
              </div>
            </div>

            {/* AES: Secret Key */}
            {mode === 'aes' && (
              <div className="animate-fadeIn">
                <label className="block text-[0.65rem] text-gray-500 tracking-[0.2em] uppercase mb-1.5 flex items-center gap-2">
                  Shared Secret Key
                  <button type="button" onClick={() => setShowKeyTip((v) => !v)}
                    className="text-terminal-cyan/50 hover:text-terminal-cyan transition-colors">[?]</button>
                </label>
                {showKeyTip && (
                  <div className="mb-2 text-[0.6rem] text-terminal-cyan/70 bg-terminal-cyan/5 border border-terminal-cyan/10 rounded px-3 py-2 animate-fadeIn">
                    Both agents must use the exact same key. Share it through a separate secure channel. Longer keys = stronger encryption.
                  </div>
                )}
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-terminal-amber/40 text-sm">🔑</span>
                  <input type="password" name="secretKey" value={form.secretKey} onChange={handleChange}
                    placeholder="enter shared encryption key"
                    className="terminal-input w-full pl-8 pr-4 py-2.5 rounded text-sm" autoComplete="off" required />
                </div>
                {keyStrength && (
                  <div className={`text-[0.6rem] mt-1.5 ${keyStrength.cls}`}>
                    KEY STRENGTH: {keyStrength.label}
                    <span className="text-gray-600 ml-2">({form.secretKey.length} chars)</span>
                  </div>
                )}
              </div>
            )}

            {/* ECC info */}
            {mode === 'ecc' && (
              <div className="animate-fadeIn bg-terminal-cyan/5 border border-terminal-cyan/15 rounded px-4 py-3">
                <div className="flex items-start gap-2">
                  <span className="text-terminal-cyan text-sm mt-0.5">🔑</span>
                  <div>
                    <p className="text-[0.65rem] text-terminal-cyan font-bold mb-1">PUBLIC KEY ENCRYPTION</p>
                    <ul className="text-[0.6rem] text-gray-400 space-y-0.5">
                      <li>• Key pair auto-generated on connect</li>
                      <li>• No shared secret needed</li>
                      <li>• Curve25519 + XSalsa20-Poly1305</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Signal info */}
            {mode === 'signal' && (
              <div className="animate-fadeIn bg-terminal-amber/5 border border-terminal-amber/15 rounded px-4 py-3">
                <div className="flex items-start gap-2">
                  <span className="text-terminal-amber text-sm mt-0.5">🚀</span>
                  <div>
                    <p className="text-[0.65rem] text-terminal-amber font-bold mb-1">SIGNAL PROTOCOL // E2EE</p>
                    <ul className="text-[0.6rem] text-gray-400 space-y-0.5">
                      <li>• Double Ratchet Algorithm</li>
                      <li>• Forward secrecy &mdash; past messages safe if keys leak</li>
                      <li>• Unique encryption key per message</li>
                      <li>• DH ratchet on every conversation turn</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit" disabled={!isFormValid || isConnecting}
              className="w-full py-3 bg-terminal-green/10 border border-terminal-green/30 text-terminal-green
                         rounded text-sm tracking-[0.15em] uppercase font-bold
                         hover:bg-terminal-green/20 hover:border-terminal-green/50 hover:shadow-[0_0_20px_rgba(0,255,65,0.15)]
                         disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300"
            >
              {isConnecting ? 'Connecting...' : 'Initiate Secure Channel'}
            </button>
          </form>

          <div className="border-t border-terminal-border px-4 sm:px-6 py-3 text-[0.55rem] text-gray-600 flex items-center justify-between">
            <span>{mode === 'aes' ? 'AES-256' : mode === 'ecc' ? 'ECC-25519' : 'SIGNAL PROTOCOL'} // CLIENT-SIDE</span>
            <span>ZERO-KNOWLEDGE SERVER</span>
          </div>
        </div>

        <p className="text-center text-[0.55rem] text-gray-700 mt-4 tracking-wider">
          ALL COMMUNICATIONS ARE END-TO-END ENCRYPTED. SERVER SEES ONLY CIPHERTEXT.
        </p>
      </div>
    </main>
  );
}
