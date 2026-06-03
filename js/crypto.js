// never roll your own crypto — la crypto réelle est déléguée au secure enclave via WebAuthn

export function construirePayload(montant, destinataire) {
  return {
    montant:      parseFloat(montant),
    destinataire: destinataire.trim(),
    timestamp:    new Date().toISOString(),
    nonce:        crypto.randomUUID().replace(/-/g, '').slice(0, 8),
  };
}

// dynamic linking DSP2 : la signature ES256 couvre ce payload exact
export function encoderPayloadBase64url(payload) {
  const json   = JSON.stringify(payload);
  const octets = new TextEncoder().encode(json);

  let chaine = '';
  octets.forEach(octet => { chaine += String.fromCharCode(octet); });

  return btoa(chaine)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// convention empreinte bancaire : blocs 4 chars séparés par ·
export function formaterSignature(signatureHex) {
  const blocs = signatureHex.match(/.{1,4}/g) || [signatureHex];
  return blocs.join('·');
}

export function tronquerSignature(signatureFormatee, nbBlocs = 4) {
  const blocs = signatureFormatee.split('·');
  if (blocs.length <= nbBlocs) return signatureFormatee;
  return blocs.slice(0, nbBlocs).join('·') + '·…';
}

export function empreinteSignature(signatureFormatee) {
  const blocs = signatureFormatee.split('·');
  if (blocs.length <= 4) return signatureFormatee;

  const debut = blocs.slice(0, 2).join('·');
  const fin   = blocs.slice(-2).join('·');
  return `${debut}···${fin}`;
}

// comparaison côté client uniquement — en production : vérification serveur via clé publique
export function signaturesIdentiques(sigA, sigB) {
  return sigA === sigB;
}

export function construireTransactionSignee(payload, signatureHex, credentialId) {
  const signatureFormatee = formaterSignature(signatureHex);

  return {
    id:                crypto.randomUUID(),
    payload,
    signatureHex,
    signatureFormatee,
    empreinte:         empreinteSignature(signatureFormatee),
    credentialId,
    signeeA:           new Date().toISOString(),
  };
}
