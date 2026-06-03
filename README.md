# Signex

> Démonstration de transaction signing cryptographique par passkey WebAuthn, dans le contexte anti-fraude DSP2/SCA.

<img width="1320" height="2342" alt="15E36530-124E-4943-AEEA-21D6400BE658_1_201_a" src="https://github.com/user-attachments/assets/7d786ccd-bf23-4745-aff2-df3ee8ce1f64" />

Signex illustre le mécanisme de **dynamic linking** exigé par la DSP2 : chaque transaction génère une signature ES256 unique, ancrée dans le biométrique de l'utilisateur (Face ID / Touch ID). La signature est non-rejouable par construction — le payload signé contient un timestamp et un nonce, ce qui garantit qu'aucune deux signatures ne seront jamais identiques.

## Lancer le projet

```bash
git clone https://github.com/jxgedouard/signex.git
cd signex
python -m http.server 8000
```

Ouvre `http://localhost:8000` dans Chrome ou Safari.

WebAuthn fonctionne sur `localhost` sans HTTPS. Pour tester Face ID sur mobile, utilise l'URL GitHub Pages ci-dessous.

**Demo en ligne** : `https://jxgedouard.github.io/signex`

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Authentification | WebAuthn L2, ECDSA P-256 (ES256) |
| Cryptographie | Secure Enclave natif (Face ID / Touch ID) |
| Frontend | HTML, CSS, JavaScript vanilla, ES modules |
| Typo | Syne (display), JetBrains Mono (technique) |
| Dépendances | Aucune |

## Architecture

```
[Utilisateur]
      |
      | clique "Créer mon passkey"
      v
[navigator.credentials.create()]
      |
      | pop-up Face ID / Touch ID natif
      v
[Secure Enclave — génère paire de clés ECDSA P-256]
      |
      | retourne credentialId + clé publique
      v
[Mémoire de session — webauthn.js]

      |
      | saisie montant + destinataire
      v
[construirePayload() — crypto.js]
      |
      | { montant, destinataire, timestamp, nonce }
      v
[encoderBase64url() — challenge WebAuthn]
      |
      | navigator.credentials.get()
      v
[Secure Enclave — signe le challenge avec clé privée]
      |
      | retourne signature ES256 brute (DER)
      v
[formaterSignature() — crypto.js]
      |
      | "A3F7·92BC·E1D4·..."
      v
[Historique de session — ui.js]
```

## Structure du projet

```
signex/
├── index.html          Structure HTML des 3 écrans (register, transaction, historique)
├── style.css           Design system complet, animations
├── js/
│   ├── webauthn.js     Enregistrement et assertion WebAuthn (navigator.credentials)
│   ├── crypto.js       Construction payload, encodage base64url, formatage signature
│   └── ui.js           Navigation, événements, historique, démonstration replay
└── README.md
```

## Choix techniques

### Pourquoi WebAuthn et pas OTP ou HMAC

Un OTP (code SMS) repose sur un secret partagé entre le serveur et l'utilisateur. Si le serveur est compromis, tous les OTPs sont compromis. WebAuthn est asymétrique : la clé privée ne quitte jamais le secure enclave de l'appareil, le serveur ne connaît que la clé publique. Rien à voler côté serveur.

HMAC exige que le serveur stocke un secret symétrique par utilisateur — même problème. WebAuthn n'a aucun secret côté serveur.

### Pourquoi ES256 (ECDSA P-256)

ES256 est l'algorithme de signature défini dans le registre COSE (RFC 8152) et recommandé par le NIST (FIPS 186-5). Sur la courbe P-256, une clé de 256 bits offre une sécurité équivalente à RSA-3072, avec des signatures plus courtes (~72 octets vs ~384 octets) et des opérations plus rapides. C'est le standard de facto des passkeys sur iOS, macOS, Android et Windows Hello.

### Pourquoi vanilla JS sans framework

Zéro dépendance signifie zéro surface d'attaque sur la chaîne d'approvisionnement (supply chain). Pour une démo de sécurité, importer 300 packages npm serait contradictoire. Le code est lisible directement, sans compilation ni bundler.

### Pourquoi "never roll your own crypto"

Toute la cryptographie dans Signex est déléguée au navigateur (`crypto.getRandomValues`, `crypto.randomUUID`) et au secure enclave (signature ES256 via WebAuthn). Aucune implémentation maison d'algorithme cryptographique. En production, la vérification de signature se ferait via `fido2-lib` (Node.js) ou `py_webauthn` (Python).

### Lien avec la DSP2

La DSP2 exige pour les paiements deux facteurs parmi : connaissance, possession, inhérence. WebAuthn couvre possession (l'appareil enregistré) et inhérence (biométrique). Le dynamic linking exige que la signature soit cryptographiquement liée au montant et au bénéficiaire — c'est exactement ce que fait le payload `{ montant, destinataire, timestamp, nonce }` encodé dans le challenge WebAuthn.

## Limites de la démo

| Point | Dans Signex | En production |
|-------|-------------|---------------|
| Vérification signature | Simulée côté client | Vérifiée côté serveur via fido2-lib |
| Stockage clé publique | Mémoire de session | Base de données serveur |
| Persistance historique | Session uniquement | Base de données avec logs d'audit |
| Gestion multi-appareils | Non implémentée | Plusieurs credentials par compte |
| Révocation passkey | Non implémentée | Endpoint DELETE /auth/passkey/:id |

La vérification côté client est un raccourci pédagogique assumé. Elle démontre la logique du mécanisme sans backend.
