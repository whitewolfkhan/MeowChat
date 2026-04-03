'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { encryptMessage, decryptMessage, generateKeyFingerprint, getKeyStrength } from '@/lib/encryption';
import {
  generateKeyPair as generateECCKeyPair,
  encryptWithPublicKey,
  decryptWithPrivateKey,
  getPublicKeyFingerprint,
} from '@/lib/publicKeyEncryption';
import {
  DoubleRatchet,
  computeSharedSecret,
  getSessionFingerprint,
} from '@/lib/signalProtocol';
import { extractMessage } from '@/lib/steganography';
import MatrixRain from '@/components/MatrixRain';
import StegoPanel from '@/components/StegoPanel';
import DecryptText from '@/components/DecryptText';

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [codename, setCodename] = useState('');
  const [channel, setChannel] = useState('');
  const [mode, setMode] = useState('aes');
  const [agents, setAgents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [showCiphertext, setShowCiphertext] = useState(false);
  const [typingAgents, setTypingAgents] = useState(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // AES state
  const [secretKey, setSecretKey] = useState('');
  const [aesFingerprint, setAesFingerprint] = useState('');
  const [keyStrength, setKeyStrengthState] = useState(null);

  // ECC / Signal shared state
  const [myKeyPair, setMyKeyPair] = useState(null);
  const [eccFingerprint, setEccFingerprint] = useState('');
  const [peerKeys, setPeerKeys] = useState(new Map());
  const myKeyPairRef = useRef(null);

  // Signal-specific state
  const [ratchetInfo, setRatchetInfo] = useState({
    ready: false, ratchetCount: 0, totalSent: 0, totalRecvd: 0, sessionsReady: 0,
  });
  const sessionsRef = useRef(new Map());
  const pendingRatchetKeysRef = useRef(new Map());

  // Stego state
  const [stegoOpen, setStegoOpen] = useState(false);
  const [decodedMessages, setDecodedMessages] = useState({});

  // Message status & read receipts
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(true);
  const readReceiptsRef = useRef(true);
  const unreadRef = useRef(new Map());
  const [screenshotAlert, setScreenshotAlert] = useState(null);

  // Media state
  const [mediaPreview, setMediaPreview] = useState(null);
  const fileInputRef = useRef(null);

  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const addSystemMessage = useCallback((text) => {
    setMessages((prev) => [
      ...prev,
      { id: `sys-${Date.now()}-${Math.random()}`, type: 'system', plaintext: text, timestamp: new Date() },
    ]);
  }, []);

  const updateRatchetInfo = useCallback(() => {
    let totalR = 0, totalS = 0, totalRv = 0, ready = 0;
    sessionsRef.current.forEach((s) => {
      const st = s.getStats();
      totalR += st.ratchetCount;
      totalS += st.totalSent;
      totalRv += st.totalRecvd;
      if (st.initialized) ready++;
    });
    setRatchetInfo({ ready: ready > 0, ratchetCount: totalR, totalSent: totalS, totalRecvd: totalRv, sessionsReady: ready });
  }, []);

  useEffect(() => {
    const storedCodename = sessionStorage.getItem('meowchat_codename');
    const storedChannel = sessionStorage.getItem('meowchat_channel');
    const storedMode = sessionStorage.getItem('meowchat_mode') || 'aes';
    const storedKey = sessionStorage.getItem('meowchat_key');

    if (!storedCodename || !storedChannel) { router.push('/'); return; }
    if (storedMode === 'aes' && !storedKey) { router.push('/'); return; }

    setCodename(storedCodename);
    setChannel(storedChannel);
    setMode(storedMode);
    if (sessionStorage.getItem('meowchat_read_receipts') === 'false') {
      setReadReceiptsEnabled(false);
      readReceiptsRef.current = false;
    }
    if (window.innerWidth >= 768) setSidebarOpen(true);

    // AES setup
    if (storedMode === 'aes') {
      setSecretKey(storedKey);
      setAesFingerprint(generateKeyFingerprint(storedKey));
      setKeyStrengthState(getKeyStrength(storedKey));
    }

    // ECC / Signal: generate identity key pair
    if (storedMode === 'ecc' || storedMode === 'signal') {
      const kp = generateECCKeyPair();
      setMyKeyPair(kp);
      myKeyPairRef.current = kp;
      setEccFingerprint(getPublicKeyFingerprint(kp.publicKey));
    }

    const socket = connectSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join-room', { roomId: storedChannel, codename: storedCodename });

      if ((storedMode === 'ecc' || storedMode === 'signal') && myKeyPairRef.current) {
        socket.emit('share-public-key', { roomId: storedChannel, publicKey: myKeyPairRef.current.publicKey });
      }

      addSystemMessage(`Secure channel [#${storedChannel}] established. You are Agent [${storedCodename}].`);
      if (storedMode === 'ecc') addSystemMessage('ECC-25519 active. Exchanging public keys...');
      if (storedMode === 'signal') addSystemMessage('Signal Protocol active. Initializing Double Ratchet...');
    });

    socket.on('agent-joined', ({ codename: name }) => {
      addSystemMessage(`Agent [${name}] has entered the channel.`);
      if ((storedMode === 'ecc' || storedMode === 'signal') && myKeyPairRef.current) {
        socket.emit('share-public-key', { roomId: storedChannel, publicKey: myKeyPairRef.current.publicKey });
      }
    });

    socket.on('agent-left', ({ codename: name, id }) => {
      addSystemMessage(`Agent [${name}] has left the channel.`);
      if (id) {
        setPeerKeys((prev) => { const n = new Map(prev); n.delete(id); return n; });
        sessionsRef.current.delete(id);
        pendingRatchetKeysRef.current.delete(id);
      }
    });

    socket.on('room-update', ({ agents: a }) => setAgents(a));

    // --- AES messages ---
    socket.on('encrypted-message', ({ ciphertext, sender, senderId, timestamp, msgId }) => {
      const r = decryptMessage(ciphertext, storedKey);
      setMessages((prev) => [...prev, {
        id: `msg-${Date.now()}-${Math.random()}`, type: 'received', sender, ciphertext,
        plaintext: r.message, decryptSuccess: r.success, timestamp: new Date(timestamp), encryption: 'AES',
      }]);
      if (msgId) {
        socket.emit('message-delivered', { msgId, senderId });
        if (document.visibilityState === 'visible' && readReceiptsRef.current) {
          socket.emit('message-read', { msgIds: [msgId], senderId });
        } else { unreadRef.current.set(msgId, senderId); }
      }
    });

    // --- ECC messages ---
    socket.on('encrypted-message-ecc', ({ payloads, sender, senderId, senderPublicKey, timestamp, msgId }) => {
      const myPayload = payloads[socket.id];
      let r;
      if (myPayload && myKeyPairRef.current) {
        r = decryptWithPrivateKey(myPayload.ciphertext, myPayload.nonce, senderPublicKey, myKeyPairRef.current.secretKey);
      } else {
        r = { success: false, message: '[NO PAYLOAD]' };
      }
      setMessages((prev) => [...prev, {
        id: `msg-${Date.now()}-${Math.random()}`, type: 'received', sender, ciphertext: myPayload?.ciphertext || '',
        plaintext: r.message, decryptSuccess: r.success, timestamp: new Date(timestamp), encryption: 'ECC',
      }]);
      if (msgId) {
        socket.emit('message-delivered', { msgId, senderId });
        if (document.visibilityState === 'visible' && readReceiptsRef.current) {
          socket.emit('message-read', { msgIds: [msgId], senderId });
        } else { unreadRef.current.set(msgId, senderId); }
      }
    });

    // --- Signal messages ---
    socket.on('encrypted-message-signal', ({ payloads, sender, senderId, timestamp, msgId }) => {
      const session = sessionsRef.current.get(senderId);
      const myPayload = payloads[socket.id];
      if (!session || !myPayload) {
        setMessages((prev) => [...prev, {
          id: `msg-${Date.now()}-${Math.random()}`, type: 'received', sender, ciphertext: '',
          plaintext: '[NO SESSION / PAYLOAD]', decryptSuccess: false, timestamp: new Date(timestamp), encryption: 'SIGNAL',
        }]);
        return;
      }
      try {
        const plaintext = session.decrypt(myPayload);
        const stats = session.getStats();
        setMessages((prev) => [...prev, {
          id: `msg-${Date.now()}-${Math.random()}`, type: 'received', sender, ciphertext: myPayload.ciphertext,
          plaintext, decryptSuccess: true, timestamp: new Date(timestamp), encryption: 'SIGNAL',
          ratchetStep: stats.ratchetCount,
        }]);
        updateRatchetInfo();
        if (msgId) {
          socket.emit('message-delivered', { msgId, senderId });
          if (document.visibilityState === 'visible' && readReceiptsRef.current) {
            socket.emit('message-read', { msgIds: [msgId], senderId });
          } else { unreadRef.current.set(msgId, senderId); }
        }
      } catch (e) {
        setMessages((prev) => [...prev, {
          id: `msg-${Date.now()}-${Math.random()}`, type: 'received', sender, ciphertext: myPayload.ciphertext,
          plaintext: '[DECRYPTION FAILED // RATCHET DESYNC]', decryptSuccess: false,
          timestamp: new Date(timestamp), encryption: 'SIGNAL',
        }]);
      }
    });

    // --- ECC/Signal key exchange ---
    socket.on('public-key-shared', ({ id, codename: name, publicKey }) => {
      setPeerKeys((prev) => { const n = new Map(prev); n.set(id, { codename: name, publicKey }); return n; });

      if (storedMode === 'ecc') {
        addSystemMessage(`Key exchange with Agent [${name}] complete.`);
      }

      if (storedMode === 'signal' && !sessionsRef.current.has(id)) {
        const sharedSecret = computeSharedSecret(myKeyPairRef.current.secretKey, publicKey);
        const isAlice = myKeyPairRef.current.publicKey < publicKey;
        const session = new DoubleRatchet(sharedSecret, isAlice);
        sessionsRef.current.set(id, session);

        socket.emit('signal-ratchet-key', {
          roomId: storedChannel,
          targetId: id,
          ratchetPublicKey: session.getRatchetPublicKey(),
        });

        const pending = pendingRatchetKeysRef.current.get(id);
        if (pending) {
          session.setupWithPeerRatchetKey(pending.ratchetPublicKey);
          pendingRatchetKeysRef.current.delete(id);
          updateRatchetInfo();
          addSystemMessage(`Double Ratchet with [${pending.codename}] initialized. Forward secrecy ACTIVE.`);
        } else {
          addSystemMessage(`Session created with [${name}]. Exchanging ratchet keys...`);
        }
      }
    });

    // --- Signal ratchet key exchange ---
    socket.on('signal-ratchet-key', ({ senderId, codename: name, ratchetPublicKey }) => {
      const session = sessionsRef.current.get(senderId);
      if (session && !session.initialized) {
        session.setupWithPeerRatchetKey(ratchetPublicKey);
        updateRatchetInfo();
        addSystemMessage(`Double Ratchet with [${name}] initialized. Forward secrecy ACTIVE.`);
      } else if (!session) {
        pendingRatchetKeysRef.current.set(senderId, { codename: name, ratchetPublicKey });
      }
    });

    // --- Stego messages ---
    socket.on('stego-message', ({ imageData, sender, senderId, timestamp, msgId }) => {
      setMessages((prev) => [...prev, {
        id: `msg-${Date.now()}-${Math.random()}`, type: 'received', sender,
        isStego: true, imageData, plaintext: '', decryptSuccess: true,
        timestamp: new Date(timestamp), encryption: 'STEGO',
      }]);
      if (msgId) {
        socket.emit('message-delivered', { msgId, senderId });
        if (document.visibilityState === 'visible' && readReceiptsRef.current) {
          socket.emit('message-read', { msgIds: [msgId], senderId });
        } else { unreadRef.current.set(msgId, senderId); }
      }
    });

    // --- Media messages ---
    socket.on('media-message', ({ mediaData, mediaType, fileName, sender, senderId, timestamp, msgId }) => {
      setMessages((prev) => [...prev, {
        id: `msg-${Date.now()}-${Math.random()}`, type: 'received', sender,
        isMedia: true, mediaData, mediaType, fileName,
        plaintext: '', decryptSuccess: true,
        timestamp: new Date(timestamp), encryption: 'MEDIA',
      }]);
      if (msgId) {
        socket.emit('message-delivered', { msgId, senderId });
        if (document.visibilityState === 'visible' && readReceiptsRef.current) {
          socket.emit('message-read', { msgIds: [msgId], senderId });
        } else { unreadRef.current.set(msgId, senderId); }
      }
    });

    // --- Message status receipts ---
    socket.on('message-delivered', ({ msgId }) => {
      setMessages((prev) => prev.map((m) =>
        m.id === msgId && m.status === 'sent' ? { ...m, status: 'delivered' } : m
      ));
    });
    socket.on('message-read', ({ msgIds }) => {
      setMessages((prev) => prev.map((m) =>
        msgIds.includes(m.id) ? { ...m, status: 'read' } : m
      ));
    });

    // --- Screenshot alerts ---
    socket.on('screenshot-alert', ({ codename: name }) => {
      addSystemMessage(`⚠ SECURITY ALERT: Agent [${name}] may have captured the screen!`);
      setScreenshotAlert(name);
      setTimeout(() => setScreenshotAlert(null), 5000);
    });

    // Screenshot detection (PrintScreen, Ctrl+Shift+S, Cmd+Shift+3/4/5, Print)
    const detectScreenshot = () => {
      socket.emit('screenshot-alert', { roomId: storedChannel });
      addSystemMessage('⚠ Screenshot attempt detected from YOUR device.');
    };
    const onKeyDown = (e) => {
      if (e.key === 'PrintScreen' ||
          (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) ||
          (e.metaKey && e.shiftKey && ['3','4','5'].includes(e.key))) {
        detectScreenshot();
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const pending = unreadRef.current;
        if (pending.size > 0 && readReceiptsRef.current) {
          const bySender = new Map();
          pending.forEach((sid, mid) => {
            if (!bySender.has(sid)) bySender.set(sid, []);
            bySender.get(sid).push(mid);
          });
          bySender.forEach((mids, sid) => socket.emit('message-read', { msgIds: mids, senderId: sid }));
          pending.clear();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeprint', detectScreenshot);

    socket.on('typing', ({ codename: name }) => setTypingAgents((prev) => new Set([...prev, name])));
    socket.on('stop-typing', ({ codename: name }) => setTypingAgents((prev) => { const n = new Set(prev); n.delete(name); return n; }));

    socket.on('disconnect', () => { setConnected(false); addSystemMessage('CONNECTION LOST. Reconnecting...'); });
    socket.on('reconnect', () => {
      setConnected(true);
      socket.emit('join-room', { roomId: storedChannel, codename: storedCodename });
      if ((storedMode === 'ecc' || storedMode === 'signal') && myKeyPairRef.current) {
        socket.emit('share-public-key', { roomId: storedChannel, publicKey: myKeyPairRef.current.publicKey });
      }
      addSystemMessage('CONNECTION RE-ESTABLISHED.');
    });

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeprint', detectScreenshot);
      disconnectSocket();
    };
  }, [router, addSystemMessage, updateRatchetInfo]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ---- SEND ----
  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim() || !socketRef.current) return;
    const msg = input.trim();
    const timestamp = new Date();

    const msgId = `m${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

    if (mode === 'signal') {
      const payloads = {};
      let anyFailed = false;
      sessionsRef.current.forEach((session, peerId) => {
        if (session.canSend()) {
          try { payloads[peerId] = session.encrypt(msg); } catch { anyFailed = true; }
        }
      });
      if (Object.keys(payloads).length === 0) { addSystemMessage('No ready sessions. Wait for ratchet initialization.'); return; }
      socketRef.current.emit('encrypted-message-signal', { roomId: channel, payloads, timestamp: timestamp.toISOString(), msgId });
      const firstPayload = Object.values(payloads)[0];
      updateRatchetInfo();
      setMessages((prev) => [...prev, {
        id: msgId, type: 'sent', sender: codename,
        ciphertext: firstPayload?.ciphertext || '', plaintext: msg, decryptSuccess: true,
        timestamp, encryption: 'SIGNAL', ratchetStep: ratchetInfo.ratchetCount, status: 'sent',
      }]);
    } else if (mode === 'ecc') {
      const payloads = {};
      peerKeys.forEach((peer, peerId) => {
        payloads[peerId] = encryptWithPublicKey(msg, peer.publicKey, myKeyPair.secretKey);
      });
      if (Object.keys(payloads).length === 0) { addSystemMessage('No peer keys. Wait for another agent.'); return; }
      socketRef.current.emit('encrypted-message-ecc', {
        roomId: channel, payloads, senderPublicKey: myKeyPair.publicKey, timestamp: timestamp.toISOString(), msgId,
      });
      setMessages((prev) => [...prev, {
        id: msgId, type: 'sent', sender: codename,
        ciphertext: Object.values(payloads)[0]?.ciphertext || '', plaintext: msg, decryptSuccess: true,
        timestamp, encryption: 'ECC', status: 'sent',
      }]);
    } else {
      const ciphertext = encryptMessage(msg, secretKey);
      socketRef.current.emit('encrypted-message', { roomId: channel, ciphertext, timestamp: timestamp.toISOString(), msgId });
      setMessages((prev) => [...prev, {
        id: msgId, type: 'sent', sender: codename,
        ciphertext, plaintext: msg, decryptSuccess: true, timestamp, encryption: 'AES', status: 'sent',
      }]);
    }
    socketRef.current.emit('stop-typing', { roomId: channel });
    setInput('');
    inputRef.current?.focus();
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (socketRef.current && channel) {
      socketRef.current.emit('typing', { roomId: channel });
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => socketRef.current?.emit('stop-typing', { roomId: channel }), 2000);
    }
  };

  const handleDisconnect = () => { sessionStorage.clear(); disconnectSocket(); router.push('/'); };

  const handleStegoSend = (imageDataUrl, hiddenText) => {
    if (!socketRef.current) return;
    const msgId = `m${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date();
    socketRef.current.emit('stego-message', { roomId: channel, imageData: imageDataUrl, timestamp: timestamp.toISOString(), msgId });
    setMessages((prev) => [...prev, {
      id: msgId, type: 'sent', sender: codename,
      isStego: true, imageData: imageDataUrl, plaintext: hiddenText, decryptSuccess: true,
      timestamp, encryption: 'STEGO', status: 'sent',
    }]);
    setStegoOpen(false);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) {
      addSystemMessage('Unsupported file type. Images and videos only.');
      return;
    }
    const maxSize = isVideo ? 25 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      addSystemMessage(`File too large. Max: ${isVideo ? '25MB' : '10MB'}.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setMediaPreview({ data: reader.result, type: isImage ? 'image' : 'video', name: file.name, size: file.size });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleMediaSend = () => {
    if (!socketRef.current || !mediaPreview) return;
    const msgId = `m${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date();
    socketRef.current.emit('media-message', {
      roomId: channel, mediaData: mediaPreview.data, mediaType: mediaPreview.type,
      fileName: mediaPreview.name, timestamp: timestamp.toISOString(), msgId,
    });
    setMessages((prev) => [...prev, {
      id: msgId, type: 'sent', sender: codename,
      isMedia: true, mediaData: mediaPreview.data, mediaType: mediaPreview.type,
      fileName: mediaPreview.name, plaintext: '', decryptSuccess: true,
      timestamp, encryption: 'MEDIA', status: 'sent',
    }]);
    setMediaPreview(null);
  };

  const handleDecode = (msgId, imageDataUrl) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        const text = extractMessage(canvas);
        setDecodedMessages((prev) => ({ ...prev, [msgId]: { success: true, text } }));
      } catch {
        setDecodedMessages((prev) => ({ ...prev, [msgId]: { success: false, text: 'No hidden message detected.' } }));
      }
    };
    img.onerror = () => {
      setDecodedMessages((prev) => ({ ...prev, [msgId]: { success: false, text: 'Failed to load image.' } }));
    };
    img.src = imageDataUrl;
  };

  const toggleReadReceipts = () => {
    setReadReceiptsEnabled((prev) => {
      const next = !prev;
      readReceiptsRef.current = next;
      sessionStorage.setItem('meowchat_read_receipts', next.toString());
      return next;
    });
  };

  const formatTime = (d) => new Date(d).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const copyToClipboard = (t) => navigator.clipboard.writeText(t);

  const eccReady = mode === 'ecc' && peerKeys.size > 0;
  const signalReady = mode === 'signal' && ratchetInfo.ready;
  const canSend = connected && input.trim() && (mode === 'aes' || eccReady || signalReady);

  const modeLabel = mode === 'signal' ? 'Signal' : mode === 'ecc' ? 'ECC-25519' : 'AES-256';
  const modeColor = mode === 'signal' ? 'terminal-amber' : mode === 'ecc' ? 'terminal-cyan' : 'terminal-green';
  const fingerprint = mode === 'aes' ? aesFingerprint : eccFingerprint;

  return (
    <div className="relative h-screen flex overflow-hidden bg-terminal-dark">
      <MatrixRain opacity={0.06} />

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ===== SIDEBAR ===== */}
      <aside className={`fixed md:relative inset-y-0 left-0 z-30 md:z-10 flex-shrink-0 border-r border-terminal-border bg-terminal-panel/95 backdrop-blur-sm transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
        <div className="flex flex-col h-full w-64">
          <div className="border-b border-terminal-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🐱</span>
              <div>
                <h2 className="text-sm font-bold text-terminal-green text-glow tracking-wider">MEOWCHAT</h2>
                <p className="text-[0.55rem] text-gray-600">SECURE RELAY v3.0</p>
              </div>
            </div>
          </div>

          <div className="border-b border-terminal-border px-4 py-3">
            <div className="text-[0.6rem] text-gray-500 tracking-[0.15em] uppercase mb-1">Channel</div>
            <div className="text-sm text-terminal-cyan text-glow-cyan font-bold">#{channel}</div>
          </div>

          {/* Agents */}
          <div className="border-b border-terminal-border px-4 py-3 flex-1 overflow-y-auto min-h-0">
            <div className="text-[0.6rem] text-gray-500 tracking-[0.15em] uppercase mb-2">Agents ({agents.length})</div>
            <div className="space-y-2">
              {agents.map((a) => (
                <div key={a.id} className="flex items-center gap-2">
                  <span className="connection-dot online" />
                  <span className={`text-xs ${a.codename === codename ? 'text-terminal-green' : 'text-gray-300'}`}>
                    {a.codename}{a.codename === codename && <span className="text-gray-600 ml-1">(you)</span>}
                  </span>
                  {mode !== 'aes' && a.codename !== codename && peerKeys.has(a.id) && (
                    <span className="text-[0.5rem] text-terminal-green">🔑</span>
                  )}
                  {mode === 'signal' && sessionsRef.current.get(a.id)?.initialized && (
                    <span className="text-[0.5rem] text-terminal-amber">⚡</span>
                  )}
                </div>
              ))}
              {agents.length === 0 && <p className="text-[0.6rem] text-gray-600 italic">No agents</p>}
            </div>
          </div>

          {/* Encryption */}
          <div className="border-b border-terminal-border px-4 py-3">
            <div className="text-[0.6rem] text-gray-500 tracking-[0.15em] uppercase mb-2">Encryption</div>
            <div className="space-y-1.5 text-[0.65rem]">
              <div className="flex justify-between">
                <span className="text-gray-500">Protocol</span>
                <span className={`text-${modeColor}`}>{modeLabel}</span>
              </div>
              {mode === 'signal' && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Algorithm</span>
                    <span className="text-terminal-amber">Double Ratchet</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Forward Sec.</span>
                    <span className={ratchetInfo.ready ? 'text-terminal-green' : 'text-gray-500'}>
                      {ratchetInfo.ready ? 'ACTIVE ✓' : 'PENDING'}
                    </span>
                  </div>
                </>
              )}
              {mode === 'aes' && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Strength</span>
                  <span className={keyStrength?.color || 'text-gray-400'}>{keyStrength?.label || '—'}</span>
                </div>
              )}
              {mode !== 'aes' && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Mode</span>
                  <span className={`text-${modeColor}`}>{mode === 'ecc' ? 'ASYMMETRIC' : 'E2EE'}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Key ID</span>
                <button onClick={() => copyToClipboard(fingerprint)}
                  className="text-terminal-amber font-mono text-[0.55rem] hover:text-terminal-amber/80 transition-colors"
                  title="Copy">{fingerprint?.substring(0, 8) || '——'}..
                </button>
              </div>
            </div>
          </div>

          {/* Signal: Ratchet State */}
          {mode === 'signal' && (
            <div className="border-b border-terminal-border px-4 py-3">
              <div className="text-[0.6rem] text-gray-500 tracking-[0.15em] uppercase mb-2">Ratchet State</div>
              <div className="space-y-1.5 text-[0.65rem]">
                <div className="flex justify-between">
                  <span className="text-gray-500">DH Ratchets</span>
                  <span className="text-terminal-amber">{ratchetInfo.ratchetCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Msgs Sent</span>
                  <span className="text-gray-300">{ratchetInfo.totalSent}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Msgs Recv</span>
                  <span className="text-gray-300">{ratchetInfo.totalRecvd}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Sessions</span>
                  <span className="text-terminal-green">{ratchetInfo.sessionsReady} ready</span>
                </div>
              </div>
            </div>
          )}

          {/* ECC: Key Exchange */}
          {mode === 'ecc' && (
            <div className="border-b border-terminal-border px-4 py-3">
              <div className="text-[0.6rem] text-gray-500 tracking-[0.15em] uppercase mb-2">Key Exchange</div>
              <div className="space-y-1.5">
                {Array.from(peerKeys.entries()).map(([id, p]) => (
                  <div key={id} className="flex items-center justify-between">
                    <span className="text-[0.6rem] text-gray-400">{p.codename}</span>
                    <span className="text-[0.5rem] text-terminal-green font-mono">{getPublicKeyFingerprint(p.publicKey).substring(0, 8)}.. ✓</span>
                  </div>
                ))}
                {peerKeys.size === 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-terminal-amber rounded-full animate-pulse" />
                    <span className="text-[0.55rem] text-terminal-amber/70">Awaiting peers...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="px-4 py-3 space-y-2">
            <button onClick={() => setShowCiphertext((v) => !v)}
              className={`w-full text-[0.65rem] px-3 py-1.5 rounded border transition-all ${showCiphertext ? 'border-terminal-cyan/40 bg-terminal-cyan/10 text-terminal-cyan' : 'border-terminal-border text-gray-500 hover:border-gray-500'}`}>
              {showCiphertext ? '🔓 HIDE CIPHERTEXT' : '🔒 SHOW CIPHERTEXT'}
            </button>
            <button onClick={toggleReadReceipts}
              className={`w-full text-[0.65rem] px-3 py-1.5 rounded border transition-all ${readReceiptsEnabled ? 'border-terminal-cyan/40 bg-terminal-cyan/10 text-terminal-cyan' : 'border-terminal-border text-gray-500 hover:border-gray-500'}`}>
              {readReceiptsEnabled ? '👁️ READ RECEIPTS ON' : '👁️ READ RECEIPTS OFF'}
            </button>
            <button onClick={handleDisconnect}
              className="w-full text-[0.65rem] px-3 py-1.5 rounded border border-terminal-red/30 text-terminal-red/70 hover:bg-terminal-red/10 hover:border-terminal-red/50 transition-all">
              ✕ TERMINATE SESSION
            </button>
          </div>
        </div>
      </aside>

      {/* ===== MAIN ===== */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex-shrink-0 border-b border-terminal-border bg-terminal-panel/95 backdrop-blur-sm px-2 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button onClick={() => setSidebarOpen((v) => !v)}
              className="text-gray-500 hover:text-terminal-green transition-colors text-lg leading-none flex-shrink-0">☰</button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-300 tracking-wider hidden sm:inline">SECURE CHANNEL</span>
                <span className="text-terminal-cyan text-xs font-bold truncate"><span className="hidden sm:inline">// </span>#{channel}</span>
              </div>
              <div className="text-[0.55rem] text-gray-600">
                {agents.length} agent{agents.length !== 1 ? 's' : ''} &middot; {modeLabel}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {mode === 'signal' && (
              <span className={`text-[0.55rem] px-1.5 py-0.5 rounded border ${
                signalReady ? 'border-terminal-amber/30 text-terminal-amber bg-terminal-amber/10' : 'border-gray-600 text-gray-500 bg-gray-800/50'
              }`}>
                {signalReady ? `⚡ RATCHET #${ratchetInfo.ratchetCount}` : '⏳ INIT'}
              </span>
            )}
            {mode === 'ecc' && (
              <span className={`text-[0.55rem] px-1.5 py-0.5 rounded border ${
                eccReady ? 'border-terminal-cyan/30 text-terminal-cyan bg-terminal-cyan/10' : 'border-gray-600 text-gray-500 bg-gray-800/50'
              }`}>
                {eccReady ? '🔑 KEYS OK' : '⏳ EXCHANGE'}
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <span className={`connection-dot ${connected ? 'online' : 'offline'}`} />
              <span className={`text-[0.6rem] ${connected ? 'text-terminal-green' : 'text-terminal-red'}`}>
                {connected ? 'ENCRYPTED' : 'OFFLINE'}
              </span>
            </div>
            <span className="stamp-classified text-[0.5rem] hidden sm:inline-block">CLASSIFIED</span>
          </div>
        </header>

        {/* Screenshot alert */}
        {screenshotAlert && (
          <div className="mx-2 sm:mx-4 mt-2 px-3 py-2 bg-terminal-red/10 border border-terminal-red/40 rounded text-terminal-red text-[0.65rem] font-bold tracking-wider animate-fadeIn flex items-center gap-2">
            <span className="text-sm">⚠</span>
            <span>SCREENSHOT DETECTED &mdash; Agent [{screenshotAlert}]</span>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-2 sm:px-4 py-4 space-y-1">
          {messages.map((msg) => (
            <div key={msg.id} className="message-in">
              {msg.type === 'system' ? (
                <div className="flex items-center gap-2 py-1.5">
                  <div className="flex-1 h-px bg-terminal-border" />
                  <span className="text-[0.6rem] text-gray-600 tracking-wider px-2">{msg.plaintext}</span>
                  <div className="flex-1 h-px bg-terminal-border" />
                </div>
              ) : (
                <div className={`flex ${msg.type === 'sent' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] sm:max-w-[75%] rounded-lg px-3 sm:px-3.5 py-2 sm:py-2.5 ${
                    msg.type === 'sent' ? 'bg-terminal-green/10 border border-terminal-green/20' : 'bg-terminal-panel border border-terminal-border'
                  }`}>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className={`text-[0.65rem] font-bold ${msg.type === 'sent' ? 'text-terminal-green' : 'text-terminal-cyan'} ${
                          msg.isStego && msg.type === 'received' && !decodedMessages[msg.id] ? 'cursor-pointer hover:underline hover:brightness-125 transition-all' : ''
                        }`}
                        onClick={() => {
                          if (msg.isStego && msg.type === 'received' && !decodedMessages[msg.id]) {
                            handleDecode(msg.id, msg.imageData);
                          }
                        }}
                      >
                        [{msg.sender}]
                      </span>
                      <span className="text-[0.55rem] text-gray-600">{formatTime(msg.timestamp)}</span>
                      {msg.decryptSuccess ? (
                        <span className={`text-[0.5rem] ${
                          msg.encryption === 'SIGNAL' ? 'text-terminal-amber/60' : msg.encryption === 'ECC' ? 'text-terminal-cyan/60' : 'text-terminal-green/60'
                        }`}>
                          🔒 {msg.encryption}
                          {msg.encryption === 'SIGNAL' && msg.ratchetStep !== undefined && (
                            <span className="ml-1 opacity-70">R#{msg.ratchetStep}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[0.5rem] text-terminal-red">⚠ FAIL</span>
                      )}
                      {msg.type === 'sent' && msg.status && (
                        <span className={`text-[0.6rem] ml-auto pl-2 ${
                          msg.status === 'read' ? 'text-terminal-cyan'
                          : msg.status === 'delivered' ? 'text-terminal-green'
                          : 'text-gray-600'
                        }`}>
                          {msg.status === 'read' ? '👁️' : msg.status === 'delivered' ? '✔✔' : '✔'}
                        </span>
                      )}
                    </div>
                    {/* Stego image */}
                    {msg.isStego && msg.imageData && (
                      <div className="mb-1.5">
                        <img src={msg.imageData} alt="Stego" className="max-w-[180px] rounded border border-terminal-amber/20" />
                        {msg.type === 'received' && decodedMessages[msg.id] && (
                          <div className={`mt-1.5 text-[0.65rem] px-2 py-1.5 rounded border animate-fadeIn ${
                            decodedMessages[msg.id].success
                              ? 'border-terminal-amber/20 bg-terminal-amber/5 text-terminal-amber'
                              : 'border-terminal-red/20 bg-terminal-red/5 text-terminal-red'
                          }`}>
                            {decodedMessages[msg.id].success ? '🔓 ' : '⚠ '}{decodedMessages[msg.id].text}
                          </div>
                        )}
                        {msg.type === 'sent' && (
                          <div className="mt-1.5 text-[0.55rem] text-terminal-amber/50 italic">
                            Hidden: &ldquo;{msg.plaintext}&rdquo;
                          </div>
                        )}
                      </div>
                    )}
                    {/* Media (image/video) */}
                    {msg.isMedia && msg.mediaData && (
                      <div className="mb-1.5">
                        {msg.mediaType === 'image' ? (
                          <img src={msg.mediaData} alt={msg.fileName || 'Image'}
                            className="max-w-[250px] max-h-[300px] rounded border border-terminal-green/20 cursor-pointer hover:brightness-110 transition-all object-contain"
                            onClick={() => {
                              const w = window.open('', '_blank');
                              w.document.write(`<html><head><title>${msg.fileName}</title><style>body{margin:0;background:#0a0a0f;display:flex;align-items:center;justify-content:center;min-height:100vh}</style></head><body><img src="${msg.mediaData}" style="max-width:100%;max-height:100vh"/></body></html>`);
                            }} />
                        ) : (
                          <video src={msg.mediaData} controls preload="metadata"
                            className="max-w-[300px] max-h-[250px] rounded border border-terminal-green/20" />
                        )}
                        <div className="mt-1 text-[0.5rem] text-gray-600 flex items-center gap-1">
                          <span>{msg.mediaType === 'image' ? '🖼️' : '🎬'}</span>
                          <span className="truncate max-w-[200px]">{msg.fileName}</span>
                        </div>
                      </div>
                    )}
                    {/* Regular text with decrypt animation */}
                    {!msg.isStego && !msg.isMedia && (
                      <p className={`text-sm leading-relaxed ${msg.decryptSuccess ? 'text-gray-200' : 'text-terminal-red/80 italic'}`}>
                        {msg.decryptSuccess ? (
                          <DecryptText text={msg.plaintext} speed={25} />
                        ) : (
                          msg.plaintext
                        )}
                      </p>
                    )}
                    {showCiphertext && msg.ciphertext && !msg.isStego && (
                      <div className="mt-2 pt-2 border-t border-terminal-border/50">
                        <div className="text-[0.5rem] text-gray-600 mb-0.5 tracking-wider">CIPHERTEXT:</div>
                        <p className="ciphertext select-all">{msg.ciphertext}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {typingAgents.size > 0 && (
            <div className="flex items-center gap-2 py-1 animate-fadeIn">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-terminal-cyan rounded-full animate-pulse" />
                <span className="w-1.5 h-1.5 bg-terminal-cyan rounded-full animate-pulse [animation-delay:0.15s]" />
                <span className="w-1.5 h-1.5 bg-terminal-cyan rounded-full animate-pulse [animation-delay:0.3s]" />
              </div>
              <span className="text-[0.6rem] text-terminal-cyan/70">{Array.from(typingAgents).join(', ')} typing...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Stego Panel */}
        {stegoOpen && (
          <StegoPanel onSend={handleStegoSend} onClose={() => setStegoOpen(false)} />
        )}

        {/* Media Preview */}
        {mediaPreview && (
          <div className="flex-shrink-0 border-t border-terminal-border bg-terminal-panel/95 backdrop-blur-sm px-2 sm:px-4 py-2.5">
            <div className="text-[0.6rem] text-gray-500 tracking-wider uppercase mb-2">Attachment Preview</div>
            <div className="flex items-end gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {mediaPreview.type === 'image' ? (
                  <img src={mediaPreview.data} alt="Preview" className="max-h-[100px] max-w-[120px] rounded border border-terminal-border object-contain" />
                ) : (
                  <video src={mediaPreview.data} className="max-h-[100px] max-w-[120px] rounded border border-terminal-border" />
                )}
                <div className="min-w-0">
                  <p className="text-xs text-gray-300 truncate">{mediaPreview.name}</p>
                  <p className="text-[0.55rem] text-gray-600 mt-0.5">
                    {mediaPreview.size < 1024 * 1024
                      ? `${(mediaPreview.size / 1024).toFixed(1)} KB`
                      : `${(mediaPreview.size / (1024 * 1024)).toFixed(1)} MB`}
                    {' · '}{mediaPreview.type === 'image' ? '🖼️ Image' : '🎬 Video'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button type="button" onClick={() => setMediaPreview(null)}
                  className="text-[0.65rem] px-3 py-1.5 rounded border border-terminal-red/30 text-terminal-red/70 hover:bg-terminal-red/10 transition-all">
                  ✕
                </button>
                <button type="button" onClick={handleMediaSend}
                  className={`text-[0.65rem] px-4 py-1.5 rounded border font-bold transition-all
                    ${mode === 'signal' ? 'bg-terminal-amber/10 border-terminal-amber/30 text-terminal-amber hover:bg-terminal-amber/20'
                    : mode === 'ecc' ? 'bg-terminal-cyan/10 border-terminal-cyan/30 text-terminal-cyan hover:bg-terminal-cyan/20'
                    : 'bg-terminal-green/10 border-terminal-green/30 text-terminal-green hover:bg-terminal-green/20'}`}>
                  SEND
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSend}
          className="flex-shrink-0 border-t border-terminal-border bg-terminal-panel/95 backdrop-blur-sm px-2 sm:px-4 py-2 sm:py-3">
          <input type="file" ref={fileInputRef} onChange={handleFileSelect}
            accept="image/*,video/*" className="hidden" />
          <div className="flex items-center gap-2 sm:gap-3">
            <button type="button" onClick={() => fileInputRef.current?.click()} title="Send Image / Video"
              className="text-sm flex-shrink-0 transition-colors text-gray-600 hover:text-terminal-green/70">
              📎
            </button>
            <button type="button" onClick={() => setStegoOpen((v) => !v)} title="Steganography"
              className={`text-sm flex-shrink-0 transition-colors ${stegoOpen ? 'text-terminal-amber' : 'text-gray-600 hover:text-terminal-amber/70'}`}>
              🕵️
            </button>
            <span className={`text-sm flex-shrink-0 text-${modeColor}/40`}>&gt;</span>
            <input ref={inputRef} type="text" value={input} onChange={handleInputChange}
              placeholder={
                (mode === 'ecc' && !eccReady) ? 'waiting for key exchange...'
                : (mode === 'signal' && !signalReady) ? 'waiting for ratchet init...'
                : 'type secure message...'
              }
              className="terminal-input flex-1 px-3 py-2.5 rounded text-sm" autoComplete="off" spellCheck={false}
              disabled={!connected || (mode === 'ecc' && !eccReady) || (mode === 'signal' && !signalReady)} />
            <button type="submit" disabled={!canSend}
              className={`flex-shrink-0 px-4 py-2.5 border text-xs font-bold tracking-wider rounded disabled:opacity-30 disabled:cursor-not-allowed transition-all
                ${mode === 'signal' ? 'bg-terminal-amber/10 border-terminal-amber/30 text-terminal-amber hover:bg-terminal-amber/20'
                : mode === 'ecc' ? 'bg-terminal-cyan/10 border-terminal-cyan/30 text-terminal-cyan hover:bg-terminal-cyan/20'
                : 'bg-terminal-green/10 border-terminal-green/30 text-terminal-green hover:bg-terminal-green/20'}`}>
              SEND
            </button>
          </div>
          <div className="hidden sm:flex items-center justify-between mt-1.5">
            <span className="text-[0.5rem] text-gray-600">
              {mode === 'signal' ? `Double Ratchet // forward secrecy active // ${ratchetInfo.ratchetCount} DH ratchets`
                : mode === 'ecc' ? `Curve25519-XSalsa20-Poly1305 // ${peerKeys.size} peer key${peerKeys.size !== 1 ? 's' : ''}`
                : 'AES-256 client-side encryption'}
            </span>
            <span className={`text-[0.5rem] text-${modeColor}/40`}>
              {mode === 'signal' ? `RATCHET #${ratchetInfo.ratchetCount}` : `KEY: ${(fingerprint || '').substring(0, 8)}...`}
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
