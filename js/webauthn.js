import { encoderPayloadBase64url } from './crypto.js';

let credentialId = null;

function genererOctetsAleatoires(longueur) {
  return crypto.getRandomValues(new Uint8Array(longueur));
}

function encoderBase64url(buffer) {
  const octets = new Uint8Array(buffer);
  let chaine = '';
  octets.forEach(octet => { chaine += String.fromCharCode(octet); });
  return btoa(chaine)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function decoderBase64url(chaine) {
  const base64  = chaine.replace(/-/g, '+').replace(/_/g, '/');
  const binaire = atob(base64);
  const octets  = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) {
    octets[i] = binaire.charCodeAt(i);
  }
  return octets;
}

export async function registerPasskey() {
  const challenge = genererOctetsAleatoires(32);
  const userId    = genererOctetsAleatoires(16);

  const credential = await navigator.credentials.create({
    publicKey: {
      rp: {
        name: 'Signex',
        id:   window.location.hostname,
      },
      user: {
        id:          userId,
        name:        'utilisateur@signex.local',
        displayName: 'Utilisateur Signex',
      },
      challenge,
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // -7 = ES256 dans le registre COSE
      ],
      timeout: 60000,
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification:        'required', // base légale DSP2 : possession + inhérence
        residentKey:             'preferred',
      },
    },
  });

  credentialId = credential.id;
  return credential.id.slice(0, 4).toUpperCase();
}

// dynamic linking DSP2 : le challenge IS le payload — timestamp + nonce garantissent la non-rejouabilité
export async function signTransaction(payload) {
  if (!credentialId) {
    throw new Error('Aucun passkey enregistré — créer un passkey d\'abord');
  }

  const challengeBase64 = encoderPayloadBase64url(payload);

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge:        decoderBase64url(challengeBase64),
      allowCredentials: [{ type: 'public-key', id: decoderBase64url(credentialId) }],
      rpId:             window.location.hostname,
      userVerification: 'required',
      timeout:          60000,
    },
  });

  const signatureOctets = new Uint8Array(assertion.response.signature);
  const signatureHex    = Array.from(signatureOctets)
    .map(o => o.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

  return {
    signatureHex,
    byteCount:    signatureOctets.length,
    credentialId,
  };
}

export function passkeyEstEnregistre() {
  return credentialId !== null;
}
