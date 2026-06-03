// ─────────────────────────────────────────────────────
// webauthn.js — Enregistrement et assertion WebAuthn
// Utilise l'API navigator.credentials native du navigateur
// pour déclencher le pop-up Face ID / Touch ID réel
// ─────────────────────────────────────────────────────

// ── État de session ───────────────────────────────────────────────────────
// On stocke l'ID du passkey enregistré en mémoire (variable de session).
// En production : ce credentialId serait persisté côté serveur, lié au compte.
let credentialId = null;

// ── Utilitaire : génère des octets aléatoires ─────────────────────────────
// WebAuthn exige un challenge et un userId sous forme d'ArrayBuffer (tableau d'octets).
// crypto.getRandomValues() utilise le générateur cryptographique du navigateur —
// pas Math.random() qui est prévisible.
function genererOctetsAleatoires(longueur) {
  return crypto.getRandomValues(new Uint8Array(longueur));
}

// ── Utilitaire : encode un ArrayBuffer en base64url ───────────────────────
// base64url = base64 standard sans +, / ni = (safe pour les URLs et JSON).
// On en a besoin pour afficher l'ID du credential de façon lisible.
function encoderBase64url(buffer) {
  const octets = new Uint8Array(buffer);
  let chaine = '';
  octets.forEach(octet => { chaine += String.fromCharCode(octet); });
  return btoa(chaine)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// ── Utilitaire : décode une chaîne base64url en Uint8Array ────────────────
// Nécessaire pour passer le challenge encodé à WebAuthn lors de l'assertion.
function decoderBase64url(chaine) {
  const base64 = chaine.replace(/-/g, '+').replace(/_/g, '/');
  const binaire = atob(base64);
  const octets  = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) {
    octets[i] = binaire.charCodeAt(i);
  }
  return octets;
}

// ── ENREGISTREMENT ────────────────────────────────────────────────────────
// Crée un nouveau passkey sur l'appareil via navigator.credentials.create().
// Déclenche le pop-up Face ID / Touch ID natif.
// Retourne un identifiant court (4 chars) pour l'affichage dans l'UI.
export async function registerPasskey() {
  // Challenge aléatoire — WebAuthn l'exige pour prouver que la réponse
  // vient bien de cette session et non d'un replay d'une ancienne requête.
  const challenge = genererOctetsAleatoires(32);

  // UserId — identifie l'utilisateur côté application (pas un nom lisible).
  // En production : ce serait l'ID du compte bancaire en base de données.
  const userId = genererOctetsAleatoires(16);

  const optionsCreation = {
    publicKey: {
      // Qui demande la création du passkey (le "site")
      rp: {
        name: 'Signex',
        id:   window.location.hostname, // "localhost" en dev
      },

      // Qui crée le passkey (l'"utilisateur")
      user: {
        id:          userId,
        name:        'utilisateur@signex.local',
        displayName: 'Utilisateur Signex',
      },

      // Challenge anti-replay — doit être unique par requête
      challenge: challenge,

      // Algorithmes acceptés — on exige ES256 (ECDSA P-256), standard DSP2
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // -7 = ES256 dans le registre COSE
      ],

      // Timeout en millisecondes — si l'utilisateur ne réagit pas en 60s
      timeout: 60000,

      // "platform" = biométrique natif (Face ID / Touch ID)
      // "cross-platform" = clé USB FIDO2 externe
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification:        'required', // force la biométrie
        residentKey:             'preferred',
      },
    },
  };

  // navigator.credentials.create() déclenche le pop-up natif.
  // Si l'utilisateur refuse ou annule → exception DOMException attrapée par ui.js.
  const credential = await navigator.credentials.create(optionsCreation);

  // On stocke l'ID en mémoire pour les assertions futures
  credentialId = credential.id;

  // Retourne les 4 premiers chars de l'ID pour l'affichage (ex: "passkey#A3F7")
  return credential.id.slice(0, 4).toUpperCase();
}

// ── ASSERTION (SIGNING) ───────────────────────────────────────────────────
// Signe un payload de transaction via navigator.credentials.get().
// Le payload est encodé en base64url et passé comme challenge WebAuthn —
// c'est le "dynamic linking" au sens DSP2 : la signature est liée au contenu.
// Retourne la signature brute ES256 formatée pour l'affichage.
export async function signTransaction(payload) {
  if (!credentialId) {
    throw new Error('Aucun passkey enregistré — créer un passkey d\'abord');
  }

  // Encode le payload JSON en base64url pour l'injecter dans le challenge.
  // Ainsi la signature ES256 retournée "couvre" ce payload exact.
  const payloadJson    = JSON.stringify(payload);
  const payloadOctets  = new TextEncoder().encode(payloadJson);
  const challengeBase64 = encoderBase64url(payloadOctets);

  const optionsAssertion = {
    publicKey: {
      // Le challenge est le payload encodé — non-rejouable car il contient
      // le timestamp et le nonce qui changent à chaque transaction.
      challenge: decoderBase64url(challengeBase64),

      // On indique quel credential utiliser (celui enregistré)
      allowCredentials: [{
        type: 'public-key',
        id:   decoderBase64url(credentialId),
      }],

      rpId:            window.location.hostname,
      userVerification: 'required',
      timeout:          60000,
    },
  };

  // Pop-up Face ID / Touch ID — si refus → exception attrapée par ui.js
  const assertion = await navigator.credentials.get(optionsAssertion);

  // response.signature contient la vraie signature ES256 brute (format DER)
  const signatureBuffer = assertion.response.signature;
  const signatureOctets = new Uint8Array(signatureBuffer);

  // Convertit en hex pour l'affichage (plus lisible que base64 pour une démo)
  const signatureHex = Array.from(signatureOctets)
    .map(octet => octet.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

  return {
    signatureHex,                    // chaîne hex brute — formatée en blocs par ui.js
    byteCount: signatureOctets.length, // taille en octets pour l'affichage
    credentialId,                    // pour lier la signature à un passkey dans l'historique
  };
}

// ── EXPORT ÉTAT ───────────────────────────────────────────────────────────
// Permet à ui.js de vérifier si un passkey est déjà enregistré
// (utile si on veut sauter l'écran d'enregistrement en dev).
export function passkeyEstEnregistre() {
  return credentialId !== null;
}