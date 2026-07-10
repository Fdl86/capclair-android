# Compiler l'APK avec GitHub Actions

Aucun Android Studio ni JDK local n'est nécessaire.

## Étapes

1. Vider le dossier local du dépôt `capclair-android` en conservant uniquement `.git`.
2. Copier le contenu complet du zip dans ce dossier.
3. Commit recommandé : `DEV15.1.3 cockpit map modes`.
4. Push sur `main` avec GitHub Desktop.
5. Ouvrir `Actions` -> `Android Debug APK`.
6. Attendre que toutes les étapes passent au vert.
7. Télécharger l'artifact `cap-clair-dev15-1-3-debug-apk`.
8. Dézipper puis installer `app-debug.apk` par-dessus DEV15.1.2.

L'artifact contient aussi `apk-signature.txt`. L'empreinte SHA-256 doit rester identique entre les versions.

## Étapes CI

- validation des secrets ;
- installation npm ;
- tests unitaires ;
- Java 21 ;
- build natif sans service worker ;
- synchronisation Capacitor ;
- compilation Gradle ;
- vérification de signature ;
- upload de l'APK.

## En cas d'échec d'installation par-dessus

Ne pas désinstaller immédiatement. Vérifier d'abord :

- même `applicationId` ;
- même empreinte SHA-256 ;
- `versionCode` supérieur ;
- APK non corrompu.
