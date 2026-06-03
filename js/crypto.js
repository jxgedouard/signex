// ─────────────────────────────────────────────────────
// crypto.js — Encodage payload et formatage signature ES256
// Ce fichier ne fait pas de cryptographie directement —
// il prépare les données AVANT et APRÈS la signature WebAuthn.
// Principe "never roll your own crypto" : la crypto réelle
// est déléguée au secure enclave via WebAuthn.
// ─────────────────────────────────────────────────────

// ── Construction du payload de transaction ────────────────────────────────
// Construit l'objet qui sera signé cryptographiquement.
// Le triplet { montant, destinataire, timestamp } + nonce garantit
// qu'aucune deux transactions ne produiront jamais le même challenge.
export function construirePayload(montant, destinataire) {
  return {
    montant:      parseFloat(montant),
    destinataire: destinataire.trim(),
    // toISOString() retourne une chaîne UTC précise à la milliseconde
    // ex: "2024-01-15T14:23:07.842Z" — le "Z" signifie UTC (Zulu time)
    timestamp:    new Date().toISOString(),
    // randomUUID() génère un identifiant unique universel (UUID v4)
    // on prend les 8 premiers chars pour garder le payload compact
    nonce:        crypto.randomUUID().replace(/-/g, '').slice(0, 8),
  };
}

// ── Encodage du payload en base64url ─────────────────────────────────────
// Transforme le payload JSON en chaîne base64url pour l'injecter
// dans le challenge WebAuthn. C'est le "dynamic linking" DSP2 :
// la signature ES256 couvre ce payload exact et aucun autre.
export function encoderPayloadBase64url(payload) {
  // JSON.stringify → chaîne texte
  // TextEncoder → octets bruts (Uint8Array)
  // btoa → base64 standard → remplacements pour base64url
  const json   = JSON.stringify(payload);
  const octets = new TextEncoder().encode(json);

  let chaine = '';
  octets.forEach(octet => { chaine += String.fromCharCode(octet); });

  return btoa(chaine)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// ── Formatage de la signature pour l'affichage ───────────────────────────
// Transforme une chaîne hex brute "A3F792BCE1D4..."
// en blocs lisibles "A3F7·92BC·E1D4·..." façon empreinte PGP/SSH.
// Longueur des blocs : 4 chars (2 octets) — convention d'affichage bancaire.
export function formaterSignature(signatureHex) {
  // match(/.{1,4}/g) découpe la chaîne en groupes de 4 caractères maximum
  const blocs = signatureHex.match(/.{1,4}/g) || [signatureHex];
  return blocs.join('·');
}

// ── Tronquer la signature pour l'historique ──────────────────────────────
// Une signature ES256 fait ~72 octets = ~144 chars hex = ~36 blocs.
// Pour l'historique on affiche seulement les 4 premiers blocs + "…"
// pour indiquer que la signature continue.
export function tronquerSignature(signatureFormatee, nbBlocs = 4) {
  const blocs = signatureFormatee.split('·');
  if (blocs.length <= nbBlocs) return signatureFormatee;
  return blocs.slice(0, nbBlocs).join('·') + '·…';
}

// ── Calcul d'empreinte courte ─────────────────────────────────────────────
// Retourne un identifiant visuel court de la transaction :
// les 2 premiers et 2 derniers blocs séparés par "···"
// Ex: "A3F7·92BC···E1D4·FF21"
// Utile pour différencier visuellement deux signatures dans l'historique.
export function empreinteSignature(signatureFormatee) {
  const blocs = signatureFormatee.split('·');
  if (blocs.length <= 4) return signatureFormatee;

  const debut = blocs.slice(0, 2).join('·');
  const fin   = blocs.slice(-2).join('·');
  return `${debut}···${fin}`;
}

// ── Comparaison de deux signatures ───────────────────────────────────────
// Vérifie si deux signatures sont identiques.
// En production : cette vérification se ferait côté serveur via
// la clé publique enregistrée (fido2-lib / py_webauthn).
// Ici : comparaison directe des chaînes hex — simulé côté client.
// IMPORTANT : ne jamais faire ça en production, c'est une démo pédagogique.
export function signaturesIdentiques(sigA, sigB) {
  return sigA === sigB;
}

// ── Métadonnées de la transaction ─────────────────────────────────────────
// Construit l'objet complet d'une transaction signée, prêt pour l'historique.
// Centralise la structure pour que ui.js n'ait pas à la connaître.
export function construireTransactionSignee(payload, signatureHex, credentialId) {
  const signatureFormatee = formaterSignature(signatureHex);

  return {
    id:           crypto.randomUUID(),           // identifiant unique de la transaction
    payload,                                      // payload original signé
    signatureHex,                                 // signature brute (pour le replay)
    signatureFormatee,                            // "A3F7·92BC·E1D4·..."
    empreinte:    empreinteSignature(signatureFormatee), // affichage court
    credentialId,                                 // passkey utilisé
    signeeA:      new Date().toISOString(),       // horodatage de signature
  };
}