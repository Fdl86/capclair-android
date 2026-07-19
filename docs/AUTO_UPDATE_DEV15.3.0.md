# Mise à jour semi-automatique Android - DEV15.3.0

## Source distante

Manifest stable :

`https://github.com/Fdl86/capclair-android/releases/latest/download/update.json`

Le dépôt doit rester public. Aucun jeton GitHub n'est intégré dans l'APK.

## Chaîne de confiance

`update.json` annonce la version, l'URL de l'APK et son SHA-256. Il ne constitue pas à lui seul une source de confiance.

Le plugin Android vérifie également :

1. le package `fr.capclair.app` codé en dur ;
2. le `versionCode` réel contenu dans l'APK ;
3. le fait que ce code soit strictement supérieur à celui installé ;
4. le certificat réel de l'APK ;
5. la correspondance avec le certificat de l'application installée ;
6. la correspondance avec l'empreinte CAP CLAIR épinglée :
   `d6d2de057dcd199dfbdaa3085b59d4c227530015f817355ddcc403f33ea0d737`.

La vérification complète est répétée immédiatement avant l'ouverture de l'installateur.

## Téléchargement

Le DownloadManager Android écrit dans :

`Android/data/fr.capclair.app/files/Download/capclair-updates/`

Le FileProvider n'expose que ce sous-dossier pour l'installation. Les téléchargements non vérifiés sont supprimés après 24 heures. Un APK vérifié est supprimé après 7 jours ou dès que sa version est installée.

## Installation

Sur Android 8 et plus, l'utilisateur doit autoriser CAP CLAIR comme source d'installation. CAP CLAIR ouvre la page système dédiée, puis l'utilisateur revient dans l'application et appuie sur `Vérifier et installer`.

L'installation reste entièrement gérée par Android. CAP CLAIR n'utilise pas de session PackageInstaller et ne confirme jamais silencieusement l'installation.

## Verrouillage des activités

Le niveau React bloque les actions selon les états UI. Le plugin natif relit aussi `NativeGpsStore.getStatus()` avant le téléchargement, la vérification et l'installation.

Une session native terminée mais pas encore marquée comme sauvegardée bloque également la mise à jour afin de laisser la récupération de trace se terminer.

## Premier déploiement

DEV15.3.0 doit encore être installée manuellement depuis l'artifact du workflow. Une fois DEV15.3.0 installée, une version DEV15.3.1 ou ultérieure pourra servir à valider le parcours complet de mise à jour dans l'application.
