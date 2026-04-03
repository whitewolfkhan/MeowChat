import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

function concat(...arrays) {
  const len = arrays.reduce((s, a) => s + a.length, 0);
  const r = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) { r.set(a, off); off += a.length; }
  return r;
}

function arraysEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function kdfRoot(rootKey, dhOutput) {
  const hash = nacl.hash(concat(rootKey, dhOutput));
  return { rootKey: hash.slice(0, 32), chainKey: hash.slice(32, 64) };
}

function kdfChain(chainKey) {
  const mkHash = nacl.hash(concat(chainKey, new Uint8Array([0x01])));
  const ckHash = nacl.hash(concat(chainKey, new Uint8Array([0x02])));
  return { messageKey: mkHash.slice(0, 32), chainKey: ckHash.slice(0, 32) };
}

export class DoubleRatchet {
  constructor(sharedSecret, isAlice) {
    this.rootKey = nacl.hash(sharedSecret).slice(0, 32);
    this.sendCK = null;
    this.recvCK = null;
    this.sendRatchetKP = nacl.box.keyPair();
    this.recvRatchetPK = null;
    this.Ns = 0;
    this.Nr = 0;
    this.PNs = 0;
    this.isAlice = isAlice;
    this.initialized = false;
    this.ratchetCount = 0;
    this.totalSent = 0;
    this.totalRecvd = 0;
    this.shouldRatchetOnNextSend = false;
  }

  getRatchetPublicKey() {
    return naclUtil.encodeBase64(this.sendRatchetKP.publicKey);
  }

  setupWithPeerRatchetKey(peerRatchetPKBase64) {
    const peerRatchetPK = naclUtil.decodeBase64(peerRatchetPKBase64);
    this.recvRatchetPK = peerRatchetPK;

    const dhOut = nacl.box.before(peerRatchetPK, this.sendRatchetKP.secretKey);
    const material = concat(this.rootKey, dhOut);

    const aliceChain = nacl.hash(concat(material, new Uint8Array([0x01]))).slice(0, 32);
    const bobChain = nacl.hash(concat(material, new Uint8Array([0x02]))).slice(0, 32);

    this.rootKey = nacl.hash(material).slice(0, 32);

    if (this.isAlice) {
      this.sendCK = aliceChain;
      this.recvCK = bobChain;
    } else {
      this.sendCK = bobChain;
      this.recvCK = aliceChain;
    }

    this.initialized = true;
  }

  canSend() {
    return this.sendCK !== null && this.initialized;
  }

  encrypt(plaintext) {
    if (!this.canSend()) throw new Error('Session not initialized');

    if (this.shouldRatchetOnNextSend) {
      this._performSendRatchet();
      this.shouldRatchetOnNextSend = false;
    }

    const { messageKey, chainKey } = kdfChain(this.sendCK);
    this.sendCK = chainKey;

    const msgBytes = naclUtil.decodeUTF8(plaintext);
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const ciphertext = nacl.secretbox(msgBytes, nonce, messageKey);

    const result = {
      header: {
        ratchetPK: naclUtil.encodeBase64(this.sendRatchetKP.publicKey),
        n: this.Ns,
        pn: this.PNs,
      },
      ciphertext: naclUtil.encodeBase64(ciphertext),
      nonce: naclUtil.encodeBase64(nonce),
    };

    this.Ns++;
    this.totalSent++;
    return result;
  }

  decrypt({ header, ciphertext, nonce }) {
    const ratchetPK = naclUtil.decodeBase64(header.ratchetPK);

    if (!arraysEqual(ratchetPK, this.recvRatchetPK)) {
      this._performDHRatchet(ratchetPK);
      this.shouldRatchetOnNextSend = false;
    } else {
      this.shouldRatchetOnNextSend = true;
    }

    const { messageKey, chainKey } = kdfChain(this.recvCK);
    this.recvCK = chainKey;

    const ciphertextBytes = naclUtil.decodeBase64(ciphertext);
    const nonceBytes = naclUtil.decodeBase64(nonce);
    const decrypted = nacl.secretbox.open(ciphertextBytes, nonceBytes, messageKey);

    if (!decrypted) throw new Error('Decryption failed - key mismatch or corrupted');

    this.Nr++;
    this.totalRecvd++;
    return naclUtil.encodeUTF8(decrypted);
  }

  _performSendRatchet() {
    this.sendRatchetKP = nacl.box.keyPair();
    const dhOut = nacl.box.before(this.recvRatchetPK, this.sendRatchetKP.secretKey);
    const { rootKey, chainKey } = kdfRoot(this.rootKey, dhOut);
    this.rootKey = rootKey;
    this.PNs = this.Ns;
    this.Ns = 0;
    this.sendCK = chainKey;
    this.ratchetCount++;
  }

  _performDHRatchet(newPeerRatchetPK) {
    this.PNs = this.Ns;
    this.Ns = 0;
    this.Nr = 0;

    const dhOut1 = nacl.box.before(newPeerRatchetPK, this.sendRatchetKP.secretKey);
    const { rootKey: rk1, chainKey: recvCK } = kdfRoot(this.rootKey, dhOut1);
    this.recvCK = recvCK;
    this.recvRatchetPK = newPeerRatchetPK;

    this.sendRatchetKP = nacl.box.keyPair();

    const dhOut2 = nacl.box.before(newPeerRatchetPK, this.sendRatchetKP.secretKey);
    const { rootKey: rk2, chainKey: sendCK } = kdfRoot(rk1, dhOut2);
    this.rootKey = rk2;
    this.sendCK = sendCK;

    this.ratchetCount++;
  }

  getStats() {
    return {
      ratchetCount: this.ratchetCount,
      totalSent: this.totalSent,
      totalRecvd: this.totalRecvd,
      initialized: this.initialized,
      canSend: this.canSend(),
    };
  }
}

export function computeSharedSecret(mySecretKeyBase64, peerPublicKeyBase64) {
  return nacl.box.before(
    naclUtil.decodeBase64(peerPublicKeyBase64),
    naclUtil.decodeBase64(mySecretKeyBase64),
  );
}

export function getSessionFingerprint(base64Key) {
  if (!base64Key) return '--------';
  const bytes = naclUtil.decodeBase64(base64Key);
  const hash = nacl.hash(bytes);
  return Array.from(hash.slice(0, 4)).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}
