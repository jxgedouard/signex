# Signex

**A browser demo of DSP2/SCA-style transaction signing using WebAuthn passkeys — Face ID / Touch ID instead of OTP.**

[![Status: demo](https://img.shields.io/badge/status-demo-ec815c)](#limites-de-la-démo)
[![WebAuthn L2](https://img.shields.io/badge/WebAuthn-L2-3c873a)](https://www.w3.org/TR/webauthn-2/)
[![ES256 · ECDSA P-256](https://img.shields.io/badge/signature-ES256%20%2F%20P--256-149eca)](#choix-techniques)
[![Dependencies: none](https://img.shields.io/badge/dependencies-none-555)](#stack-technique)

Signex illustre le mécanisme de **dynamic linking** exigé par la DSP2 pour l'authentification forte des paiements
(SCA) : chaque transaction génère une signature ES256 unique, ancrée dans le biométrique de l'utilisateur. Le
payload signé embarque le montant, le destinataire, un timestamp et un nonce — la signature est donc liée à
*cette* transaction précise et non-rejouable par construction.

Side project pédagogique, pas un produit : pas de backend, la vérification de signature est simulée côté client.

<img src="https://github.com/user-attachments/assets/7d786ccd-bf23-4745-aff2-df3ee8ce1f64" alt="Signex sur mobile" width="320">

## Lancer le projet

```bash
git clone https://github.com/jxgedouard/signex.git
cd signex
python -m http.server 8000
```

Ouvre `http://localhost:8000` dans Chrome ou Safari. WebAuthn fonctionne sur `localhost` sans HTTPS ; pour
tester Face ID sur mobile, utilise la démo en ligne.

**Demo** : [jxgedouard.github.io/signex](https://jxgedouard.github.io/signex)

## Comment ça marche

```mermaid
flowchart TD
  A["Créer mon passkey"] --> B["navigator.credentials.create()<br/>Face ID / Touch ID"]
  B --> C["Secure Enclave : paire de clés ECDSA P-256"]
  C --> D["Saisie montant + destinataire"]
  D --> E["Payload { montant, destinataire, timestamp, nonce }"]
  E --> F["navigator.credentials.get()<br/>signe le challenge"]
  F --> G["Signature ES256 formatée + historique"]
```

| Fichier | Rôle |
|---|---|
| `js/webauthn.js` | Enregistrement et assertion WebAuthn (`navigator.credentials`) |
| `js/crypto.js` | Construction du payload, encodage base64url, formatage de la signature |
| `js/ui.js` | Navigation, historique, démonstration de non-rejouabilité |

## Choix techniques

**WebAuthn plutôt qu'OTP/HMAC.** Un OTP ou un HMAC repose sur un secret partagé — si le serveur est compromis,
tout est compromis. WebAuthn est asymétrique : la clé privée ne quitte jamais le secure enclave de l'appareil,
le serveur ne connaît que la clé publique.

**ES256 (ECDSA P-256).** Algorithme recommandé par le NIST, standard de facto des passkeys sur iOS, macOS,
Android et Windows Hello — signatures courtes, rapides à vérifier.

**Vanilla JS, zéro dépendance.** Pour une démo de sécurité, importer des centaines de packages npm serait
contradictoire. Toute la cryptographie est déléguée au navigateur et au secure enclave — aucune implémentation
maison d'algorithme ("never roll your own crypto").

**Lien avec la DSP2.** La SCA exige deux facteurs parmi connaissance/possession/inhérence : WebAuthn couvre
possession (l'appareil) et inhérence (le biométrique). Le dynamic linking est assuré par le payload
`{ montant, destinataire, timestamp, nonce }` encodé dans le challenge WebAuthn.

## Limites de la démo

| Point | Dans Signex | En production |
|---|---|---|
| Vérification de signature | Simulée côté client | Côté serveur, via `fido2-lib` / `py_webauthn` |
| Stockage clé publique / historique | Mémoire de session | Base de données |
| Multi-appareils, révocation | Non implémentés | Plusieurs credentials, endpoint de révocation |

## License

Side project personnel, sans licence explicite — demande avant réutilisation.
