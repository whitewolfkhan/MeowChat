import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

export function generateKeyPair() {
  const pair = nacl.box.keyPair();
  return {
    publicKey: naclUtil.encodeBase64(pair.publicKey),
    secretKey: naclUtil.encodeBase64(pair.secretKey),
  };
}

export function encryptWithPublicKey(message, recipientPublicKey, senderSecretKey) {
  const msgBytes = naclUtil.decodeUTF8(message);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const recipientPK = naclUtil.decodeBase64(recipientPublicKey);
  const senderSK = naclUtil.decodeBase64(senderSecretKey);

  const encrypted = nacl.box(msgBytes, nonce, recipientPK, senderSK);
  if (!encrypted) throw new Error('Encryption failed');

  return {
    ciphertext: naclUtil.encodeBase64(encrypted),
    nonce: naclUtil.encodeBase64(nonce),
  };
}

export function decryptWithPrivateKey(ciphertext, nonce, senderPublicKey, recipientSecretKey) {
  try {
    const ciphertextBytes = naclUtil.decodeBase64(ciphertext);
    const nonceBytes = naclUtil.decodeBase64(nonce);
    const senderPK = naclUtil.decodeBase64(senderPublicKey);
    const recipientSK = naclUtil.decodeBase64(recipientSecretKey);

    const decrypted = nacl.box.open(ciphertextBytes, nonceBytes, senderPK, recipientSK);
    if (!decrypted) throw new Error('Decryption failed');

    return { success: true, message: naclUtil.encodeUTF8(decrypted) };
  } catch {
    return { success: false, message: '[DECRYPTION FAILED // KEY MISMATCH]' };
  }
}

export function getPublicKeyFingerprint(publicKeyBase64) {
  const keyBytes = naclUtil.decodeBase64(publicKeyBase64);
  const hash = nacl.hash(keyBytes);
  const hex = Array.from(hash.slice(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return hex;
}
