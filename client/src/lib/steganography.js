const MAGIC = 0xCA7;
const MAGIC_BITS = 16;
const LENGTH_BITS = 32;
const HEADER_BITS = MAGIC_BITS + LENGTH_BITS;

function textToBytes(text) { return new TextEncoder().encode(text); }
function bytesToText(bytes) { return new TextDecoder().decode(bytes); }

function bytesToBits(bytes) {
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  return bits;
}

function bitsToBytes(bits) {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.substring(i * 8, i * 8 + 8).padEnd(8, '0'), 2);
  }
  return bytes;
}

export function getCapacity(width, height) {
  return Math.floor((width * height * 3 - HEADER_BITS) / 8);
}

export function hideMessage(canvas, message) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  const msgBytes = textToBytes(message);
  const msgBits = bytesToBits(msgBytes);
  const magicBits = MAGIC.toString(2).padStart(MAGIC_BITS, '0');
  const lenBits = msgBits.length.toString(2).padStart(LENGTH_BITS, '0');
  const fullBits = magicBits + lenBits + msgBits;

  const maxBits = (data.length / 4) * 3;
  if (fullBits.length > maxBits) {
    throw new Error(`Message too long. Max ${getCapacity(canvas.width, canvas.height)} characters.`);
  }

  let bitIdx = 0;
  for (let i = 0; i < data.length && bitIdx < fullBits.length; i++) {
    if (i % 4 === 3) continue;
    data[i] = (data[i] & 0xFE) | parseInt(fullBits[bitIdx]);
    bitIdx++;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function extractMessage(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  let bits = '';
  for (let i = 0; i < data.length; i++) {
    if (i % 4 === 3) continue;
    bits += (data[i] & 1).toString();
  }

  const magic = parseInt(bits.substring(0, MAGIC_BITS), 2);
  if (magic !== MAGIC) throw new Error('No hidden message detected in this image.');

  const msgBitLen = parseInt(bits.substring(MAGIC_BITS, MAGIC_BITS + LENGTH_BITS), 2);
  if (msgBitLen <= 0 || msgBitLen > bits.length - HEADER_BITS) {
    throw new Error('Corrupted hidden data.');
  }

  const msgBits = bits.substring(HEADER_BITS, HEADER_BITS + msgBitLen);
  return bytesToText(bitsToBytes(msgBits));
}

// --- Cover Image Generators ---

export function generateCoverImage(type, width = 200, height = 200) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  switch (type) {
    case 'cat': drawCat(ctx, width, height); break;
    case 'noise': drawNoise(ctx, width, height); break;
    case 'abstract': drawAbstract(ctx, width, height); break;
    default: drawNoise(ctx, width, height);
  }

  return canvas;
}

function drawCat(ctx, w, h) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = Math.floor(18 + Math.random() * 14 + (y / h) * 28);
      const g = Math.floor(12 + Math.random() * 14 + (x / w) * 18);
      const b = Math.floor(38 + Math.random() * 18 + (y / h) * 38);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const cx = w / 2, cy = h / 2;

  ctx.fillStyle = 'rgba(5,5,15,0.35)';
  ctx.beginPath(); ctx.arc(cx, cy + 12, 38, 0, Math.PI * 2); ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx - 28, cy - 12); ctx.lineTo(cx - 38, cy - 48); ctx.lineTo(cx - 4, cy - 22); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 28, cy - 12); ctx.lineTo(cx + 38, cy - 48); ctx.lineTo(cx + 4, cy - 22); ctx.fill();

  ctx.fillStyle = 'rgba(0,255,65,0.35)';
  ctx.beginPath(); ctx.ellipse(cx - 13, cy + 6, 7, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 13, cy + 6, 7, 9, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.ellipse(cx - 13, cy + 6, 2, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 13, cy + 6, 2, 7, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = 'rgba(255,140,140,0.25)';
  ctx.beginPath(); ctx.moveTo(cx, cy + 18); ctx.lineTo(cx - 5, cy + 24); ctx.lineTo(cx + 5, cy + 24); ctx.fill();

  ctx.strokeStyle = 'rgba(200,200,200,0.08)';
  ctx.lineWidth = 1;
  [[-1, -2], [-1, 0], [-1, 2], [1, -2], [1, 0], [1, 2]].forEach(([dx, dy]) => {
    ctx.beginPath(); ctx.moveTo(cx + dx * 18, cy + 20);
    ctx.lineTo(cx + dx * 50, cy + 16 + dy * 6); ctx.stroke();
  });
}

function drawNoise(ctx, w, h) {
  const imageData = ctx.createImageData(w, h);
  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i] = Math.floor(Math.random() * 50) + 8;
    imageData.data[i + 1] = Math.floor(Math.random() * 70) + 15;
    imageData.data[i + 2] = Math.floor(Math.random() * 55) + 25;
    imageData.data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

function drawAbstract(ctx, w, h) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = Math.max(0, Math.floor(12 + Math.sin(x * 0.05) * 20 + Math.random() * 10));
      const g = Math.max(0, Math.floor(22 + Math.cos(y * 0.03) * 16 + Math.random() * 10));
      const b = Math.max(0, Math.floor(32 + Math.sin((x + y) * 0.04) * 24 + Math.random() * 10));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(${Math.random() * 40},${Math.random() * 70 + 20},${Math.random() * 50 + 35},0.12)`;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 35 + 12, 0, Math.PI * 2);
    ctx.fill();
  }
}
