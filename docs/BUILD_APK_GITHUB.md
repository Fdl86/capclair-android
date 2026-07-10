# Compiler l'APK avec GitHub Actions

Aucun Android Studio ni JDK local n'est nécessaire.

## Étapes

1. Copier le zip complet dans la branche `dev15-mobile-foundation`.
2. Commit recommandé : `DEV15.1.2 trace durability and native hardening`.
3. Push avec GitHub Desktop.
4. Ouvrir `Actions` -> `Android Debug APK`.
5. Attendre que toutes les étapes passent au vert.
6. Télécharger l'artifact `cap-clair-dev15-1-2-debug-apk`.
7. Dézipper puis installer `app-debug.apk` par-dessus la version précédente.

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
