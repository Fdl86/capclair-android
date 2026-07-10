# CAP CLAIR - Signature Android stable

La clé stable a déjà été créée. Ne jamais lancer un nouveau workflow de génération de clé.

## Secrets GitHub obligatoires

Dans `Settings` -> `Secrets and variables` -> `Actions` -> `Secrets` :

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

## Règles absolues

- conserver `applicationId "fr.capclair.app"` ;
- conserver exactement les mêmes quatre secrets ;
- augmenter `versionCode` à chaque APK ;
- mettre à jour `versionName` ;
- sauvegarder hors GitHub le fichier keystore téléchargé lors de sa création.

DEV15.1.3 utilise :

```text
versionCode 15013
versionName 15.1.3
```

## Contrôle automatique

Le workflow :

1. refuse de démarrer si un secret manque ;
2. décode le keystore ;
3. compile l'APK avec cette clé ;
4. exécute `apksigner verify --print-certs` ;
5. joint `apk-signature.txt` à l'artifact.

Conserver l'empreinte SHA-256 affichée dans ce fichier. Elle doit rester identique d'une version à l'autre.
