import CryptoJS from 'crypto-js';

export function encryptMessage(plaintext, secretKey) {
  return CryptoJS.AES.encrypt(plaintext, secretKey).toString();
}

export function decryptMessage(ciphertext, secretKey) {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, secretKey);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (!decrypted) throw new Error('Empty result');
    return { success: true, message: decrypted };
  } catch {
    return { success: false, message: '[DECRYPTION FAILED // INVALID KEY]' };
  }
}

export function generateKeyFingerprint(key) {
  return CryptoJS.SHA256(key).toString().substring(0, 16).toUpperCase();
}

export function getKeyStrength(key) {
  if (key.length >= 32) return { label: 'STRONG', color: 'text-terminal-green' };
  if (key.length >= 16) return { label: 'MODERATE', color: 'text-terminal-amber' };
  return { label: 'WEAK', color: 'text-terminal-red' };
}
