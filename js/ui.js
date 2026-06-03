import { registerPasskey, signTransaction } from './webauthn.js';
import { construirePayload, formaterSignature, construireTransactionSignee } from './crypto.js';

// Références DOM
const screens          = document.querySelectorAll('.screen');
const btnRegister      = document.getElementById('btn-register');
const btnSign          = document.getElementById('btn-sign');
const passkeyBadge     = document.getElementById('passkey-status-badge');
const passkeyIdDisplay = document.getElementById('passkey-id-display');
const inputMontant     = document.getElementById('input-montant');
const inputDest        = document.getElementById('input-destinataire');
const timestampLive    = document.getElementById('timestamp-live');
const payloadPreview   = document.getElementById('payload-preview');
const payloadCode      = document.getElementById('payload-code');
const sigResult        = document.getElementById('sig-result');
const sigValueDisplay  = document.getElementById('sig-value-display');
const sigBytesCount    = document.getElementById('sig-bytes-count');
const toastContainer   = document.getElementById('toast-container');
const historyList      = document.getElementById('history-list');
const txCount          = document.getElementById('tx-count');

// État de session : liste des transactions signées
let transactions = [];

// Affiche un écran par son id, cache les autres
function showScreen(id) {
  screens.forEach(s => s.classList.remove('screen--active'));
  document.getElementById(id).classList.add('screen--active');
}

// Affiche plusieurs écrans simultanément (formulaire + historique)
function showScreens(...ids) {
  screens.forEach(s => s.classList.remove('screen--active'));
  ids.forEach(id => document.getElementById(id).classList.add('screen--active'));
}

// Timestamp live mis à jour chaque seconde
function updateTimestamp() {
  timestampLive.textContent = new Date().toISOString();
}
setInterval(updateTimestamp, 1000);
updateTimestamp();

// Colorisation syntaxique JSON pour le payload preview
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

// Met à jour le payload preview en temps réel quand l'utilisateur tape
function updatePayloadPreview() {
  const montant = parseFloat(inputMontant.value);
  const dest    = inputDest.value.trim();

  if (!montant || !dest) {
    payloadCode.innerHTML = 'Remplir le formulaire...';
    payloadPreview.classList.remove('payload-preview--active');
    btnSign.disabled = true;
    return null;
  }

  const payload   = construirePayload(montant, dest);
  const formatted = JSON.stringify(payload, null, 2);
  payloadCode.innerHTML = syntaxHighlight(formatted);
  payloadPreview.classList.add('payload-preview--active');
  btnSign.disabled = false;

  return payload;
}

inputMontant.addEventListener('input', updatePayloadPreview);
inputDest.addEventListener('input', updatePayloadPreview);

// Typewriter par blocs sur la valeur de signature
// Attend une signature formatée "A3F7·92BC·..." et révèle bloc par bloc
function typewriterReveal(element, text, speed = 120) {
  const blocs = text.split('·');
  element.textContent = '';
  element.classList.remove('sig-value--done');

  let i = 0;
  const interval = setInterval(() => {
    if (i < blocs.length) {
      element.textContent += (i === 0 ? '' : '·') + blocs[i];
      i++;
    } else {
      clearInterval(interval);
      element.classList.add('sig-value--done');
      setTimeout(() => element.classList.remove('sig-value--done'), 2200);
    }
  }, speed);
}

// Affiche la zone de résultat avec animation et typewriter
function showSigResult(signatureFormatee, byteCount) {
  sigValueDisplay.textContent = signatureFormatee;
  sigBytesCount.textContent   = `${byteCount} octets`;

  sigResult.classList.remove('sig-result--visible');
  void sigResult.offsetWidth; // force reflow pour rejouer l'animation
  sigResult.classList.add('sig-result--visible');

  setTimeout(() => typewriterReveal(sigValueDisplay, signatureFormatee), 350);
}

function hideSigResult() {
  sigResult.classList.remove('sig-result--visible');
}

// Toast notifications
function showToast(message, type = 'info', duration = 3500) {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// Ajoute une transaction à l'historique et met à jour le compteur
function ajouterAuHistorique(tx) {
  transactions.unshift(tx); // la plus récente en premier
  txCount.textContent = `${transactions.length} tx`;
  renderHistorique();
}

// Construit le HTML d'une carte de transaction
function renderCarteTransaction(tx) {
  const carte = document.createElement('div');
  carte.className = 'tx-card';
  carte.dataset.txId = tx.id;

  carte.innerHTML = `
    <div class="tx-card__header">
      <span class="tx-amount">${tx.payload.montant.toFixed(2)} EUR</span>
      <span class="tx-signed-badge">Signe</span>
    </div>
    <div class="tx-card__meta">
      <span class="tx-dest">${tx.payload.destinataire}</span>
      <span class="tx-ts mono">${tx.payload.timestamp}</span>
    </div>
    <div class="tx-sig-line">
      <span class="tx-sig-value mono">${tx.empreinte}</span>
    </div>
    <div class="replay-zone">
      <button class="btn btn--danger replay-trigger" data-tx-id="${tx.id}">
        Tenter un replay
      </button>
    </div>
  `;

  // Attache le listener sur le bouton replay de cette carte
  carte.querySelector('.replay-trigger').addEventListener('click', () => {
    lancerReplay(tx, carte);
  });

  return carte;
}

// Reconstruit la liste complète de l'historique
function renderHistorique() {
  historyList.innerHTML = '';
  transactions.forEach(tx => {
    historyList.appendChild(renderCarteTransaction(tx));
  });
}

// Lance la démonstration de non-rejouabilité pour une transaction
async function lancerReplay(txOriginale, carte) {
  const btnReplay = carte.querySelector('.replay-trigger');
  btnReplay.disabled = true;
  btnReplay.textContent = 'Signature en cours...';

  try {
    // Re-signe les memes montant + destinataire avec un nouveau timestamp + nonce
    // C'est la démonstration : même données de base, signature totalement différente
    const payloadReplay = construirePayload(
      txOriginale.payload.montant,
      txOriginale.payload.destinataire
    );

    const { signatureHex, byteCount } = await signTransaction(payloadReplay);
    const signatureReplay = formaterSignature(signatureHex);

    // Affiche la comparaison côte à côte
    afficherResultatReplay(carte, txOriginale.signatureFormatee, signatureReplay);

  } catch (err) {
    showToast(`Replay annulé : ${err.message}`, 'error');
    btnReplay.disabled = false;
    btnReplay.textContent = 'Tenter un replay';
  }
}

// Injecte le bloc de comparaison original vs replay dans la carte
function afficherResultatReplay(carte, sigOriginale, sigReplay) {
  // Retire l'ancien résultat s'il existe déjà
  const ancienResultat = carte.querySelector('.replay-result');
  if (ancienResultat) ancienResultat.remove();

  const zone = carte.querySelector('.replay-zone');

  const resultat = document.createElement('div');
  resultat.className = 'replay-result';

  resultat.innerHTML = `
    <div class="replay-compare">
      <div class="replay-col replay-col--original">
        <span class="replay-col-label">Originale</span>
        <span class="replay-col-sig mono">${sigOriginale}</span>
      </div>
      <div class="replay-col replay-col--replay">
        <span class="replay-col-label">Replay</span>
        <span class="replay-col-sig mono">${sigReplay}</span>
      </div>
    </div>
    <div class="replay-verdict">
      <span class="replay-verdict__title">Token invalide - non-rejouable</span>
      <span class="replay-verdict__reason">
        Le timestamp a change, le nonce est different, le challenge WebAuthn est different,
        la signature ES256 est differente. Le serveur rejetterait cette transaction.
      </span>
    </div>
  `;

  zone.appendChild(resultat);

  // Remet le bouton disponible pour rejouer autant de fois qu'on veut
  const btnReplay = carte.querySelector('.replay-trigger');
  btnReplay.disabled = false;
  btnReplay.textContent = 'Rejouer';
}

// Enregistrement du passkey
btnRegister.addEventListener('click', async () => {
  btnRegister.disabled = true;
  btnRegister.classList.add('btn--loading');

  try {
    const passkeyId = await registerPasskey();

    passkeyBadge.classList.add('badge--active');
    passkeyBadge.querySelector('.badge-label').textContent = 'Passkey actif';
    passkeyIdDisplay.textContent = `passkey#${passkeyId}`;

    showToast('Passkey enregistré avec succès', 'success');
    showScreen('screen-transaction');

  } catch (err) {
    showToast(`Erreur : ${err.message}`, 'error');
    btnRegister.disabled = false;
  } finally {
    btnRegister.classList.remove('btn--loading');
  }
});

// Signature d'une transaction
btnSign.addEventListener('click', async () => {
  const payload = updatePayloadPreview();
  if (!payload) return;

  btnSign.disabled = true;
  btnSign.classList.add('btn--loading');
  hideSigResult();

  try {
    const { signatureHex, byteCount, credentialId } = await signTransaction(payload);
    const signatureFormatee = formaterSignature(signatureHex);

    showSigResult(signatureFormatee, byteCount);

    const tx = construireTransactionSignee(payload, signatureHex, credentialId);
    ajouterAuHistorique(tx);

    // Affiche formulaire + historique côte à côte dès la première transaction
    showScreens('screen-transaction', 'screen-history');

    showToast('Transaction signée', 'success');

    // Remet le formulaire à zéro pour la prochaine transaction
    inputMontant.value = '';
    inputDest.value    = '';
    updatePayloadPreview();

  } catch (err) {
    showToast(`Signature échouée : ${err.message}`, 'error');
  } finally {
    btnSign.disabled = false;
    btnSign.classList.remove('btn--loading');
  }
});