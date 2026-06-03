import { registerPasskey, signTransaction } from './webauthn.js';

// ── Références DOM ───────────────────────────────────────────────────────
const screens         = document.querySelectorAll('.screen');
const btnRegister     = document.getElementById('btn-register');
const btnSign         = document.getElementById('btn-sign');
const passkeyBadge    = document.getElementById('passkey-status-badge');
const passkeyIdDisplay = document.getElementById('passkey-id-display');
const inputMontant    = document.getElementById('input-montant');
const inputDest       = document.getElementById('input-destinataire');
const timestampLive   = document.getElementById('timestamp-live');
const payloadPreview  = document.getElementById('payload-preview');
const payloadCode     = document.getElementById('payload-code');
const sigResult       = document.getElementById('sig-result');
const sigValueDisplay = document.getElementById('sig-value-display');
const sigBytesCount   = document.getElementById('sig-bytes-count');
const toastContainer  = document.getElementById('toast-container');

// ── Navigation entre écrans ──────────────────────────────────────────────
function showScreen(id) {
  screens.forEach(s => s.classList.remove('screen--active'));
  document.getElementById(id).classList.add('screen--active');
}

// ── Timestamp live ───────────────────────────────────────────────────────
function updateTimestamp() {
  timestampLive.textContent = new Date().toISOString();
}
setInterval(updateTimestamp, 1000);
updateTimestamp();

// ── Colorisation syntaxique JSON ─────────────────────────────────────────
function syntaxHighlight(json) {
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[{}\[\],:])/g,
    (match) => {
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          return `<span class="json-key">${match.slice(0, -1)}</span><span class="json-punct">:</span>`;
        }
        return `<span class="json-string">${match}</span>`;
      }
      if (/[{}\[\],]/.test(match)) {
        return `<span class="json-punct">${match}</span>`;
      }
      return `<span class="json-number">${match}</span>`;
    }
  );
}

// ── Update du payload preview ────────────────────────────────────────────
function updatePayloadPreview() {
  const montant = parseFloat(inputMontant.value);
  const dest    = inputDest.value.trim();

  if (!montant || !dest) {
    payloadCode.innerHTML = 'Remplir le formulaire\u2026';
    payloadPreview.classList.remove('payload-preview--active');
    btnSign.disabled = true;
    return;
  }

  const payload = {
    montant,
    destinataire: dest,
    timestamp: new Date().toISOString(),
    nonce: crypto.randomUUID().slice(0, 8),
  };

  const formatted = JSON.stringify(payload, null, 2);
  payloadCode.innerHTML = syntaxHighlight(formatted);
  payloadPreview.classList.add('payload-preview--active');
  btnSign.disabled = false;

  return payload;
}

inputMontant.addEventListener('input', updatePayloadPreview);
inputDest.addEventListener('input', updatePayloadPreview);

// ── Typewriter par blocs sur sig-value ───────────────────────────────────
// Attend une signature formatée "A3F7·92BC·E1D4·..." et révèle bloc par bloc
function typewriterReveal(element, text, speed = 120) {
  const blocks = text.split('·');
  element.textContent = '';
  element.classList.remove('sig-value--done');

  let i = 0;
  const interval = setInterval(() => {
    if (i < blocks.length) {
      element.textContent += (i === 0 ? '' : '·') + blocks[i];
      i++;
    } else {
      clearInterval(interval);
      element.classList.add('sig-value--done');
      setTimeout(() => element.classList.remove('sig-value--done'), 2200);
    }
  }, speed);
}

// ── Affichage du résultat de signature ───────────────────────────────────
function showSigResult(signatureHex, byteCount) {
  // Formate la signature en blocs de 4 chars séparés par ·
  const blocks = signatureHex.match(/.{1,4}/g) || [signatureHex];
  const formatted = blocks.join('·');

  // Place le texte dans l'élément avant le typewriter
  sigValueDisplay.textContent = formatted;
  sigBytesCount.textContent   = `${byteCount} octets`;

  // Reset puis affichage animé
  sigResult.classList.remove('sig-result--visible');
  // Force reflow pour que l'animation se rejoue si on signe plusieurs fois
  void sigResult.offsetWidth;
  sigResult.classList.add('sig-result--visible');

  // Lance le typewriter après le délai du sig-enter (350ms)
  setTimeout(() => typewriterReveal(sigValueDisplay, formatted), 350);
}

function hideSigResult() {
  sigResult.classList.remove('sig-result--visible');
}

// ── Toast notifications ───────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// ── Enregistrement du passkey ────────────────────────────────────────────
btnRegister.addEventListener('click', async () => {
  btnRegister.disabled = true;
  btnRegister.classList.add('btn--loading');

  try {
    const passkeyId = await registerPasskey();

    passkeyBadge.classList.add('badge--active');
    passkeyBadge.querySelector('.badge-label').textContent = 'Passkey actif';
    passkeyIdDisplay.textContent = `passkey#${passkeyId.slice(0, 4)}`;

    showToast('Passkey enregistré avec succès', 'success');
    showScreen('screen-transaction');
  } catch (err) {
    showToast(`Erreur : ${err.message}`, 'error');
    btnRegister.disabled = false;
  } finally {
    btnRegister.classList.remove('btn--loading');
  }
});

// ── Signature de transaction ─────────────────────────────────────────────
btnSign.addEventListener('click', async () => {
  const payload = updatePayloadPreview();
  if (!payload) return;

  btnSign.disabled = true;
  btnSign.classList.add('btn--loading');
  hideSigResult();

  try {
    const { signatureHex, byteCount } = await signTransaction(payload);
    showSigResult(signatureHex, byteCount);
    showToast('Transaction signée', 'success');
  } catch (err) {
    showToast(`Signature échouée : ${err.message}`, 'error');
  } finally {
    btnSign.disabled = false;
    btnSign.classList.remove('btn--loading');
  }
});
