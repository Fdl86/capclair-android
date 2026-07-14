# CAP CLAIR DEV15.2.8 - TRACE COMPLETENESS HOTFIX

Hotfix Android ciblée sur la complétude des traces GPS lorsque la WebView est suspendue ou reprend après une longue période en arrière-plan.

## Correctifs DEV15.2.8

- Le journal JSONL Android redevient la source de vérité au moment de l'arrêt.
- La trace finale est reconstruite depuis l'intégralité du journal natif, triée chronologiquement, dédupliquée puis filtrée avec les mêmes règles de sécurité que le suivi live.
- Les événements du bridge GPS ne sont plus injectés directement dans la trace React. Ils déclenchent une lecture incrémentale sérialisée du journal, ce qui garantit l'ordre des points.
- Le byte offset natif est désormais prioritaire. Une reprise tardive de la WebView ne peut plus faire éliminer les points plus anciens par un timestamp déjà avancé.
- Le plugin Android retourne l'intégralité du journal lors de l'arrêt de la session.
- Les traces Android déjà sauvegardées mais manifestement incomplètes peuvent être réparées automatiquement au lancement si leur journal natif complet est encore conservé.
- La réparation ne réinjecte jamais une ancienne trace absente du stockage local. Elle ne remplace qu'une trace locale existante portant le même sessionId.
- Les protections DEV15.2.7 restent présentes : lignes JSONL illisibles ignorées, sessions saved exclues de la récupération normale, vitesse sol sans plancher optimiste.

## Récupération de la trace du 14/07/2026

Après installation par-dessus DEV15.2.7, ouvrir CAP CLAIR puis `Mes traces`. Si le journal Android de la session est encore présent, la trace incomplète est remplacée automatiquement par sa reconstruction complète. Un message indique qu'une trace a été réparée.

Ne pas désinstaller l'application et ne pas effacer ses données avant cette tentative, car cela supprimerait le journal natif.

## Version

- versionName : 15.2.8
- versionCode : 1502008
- APP_VERSION : CAP CLAIR DEV15.2.8 - TRACE COMPLETENESS HOTFIX
- artifact : cap-clair-dev15-2-8-debug-apk

## Livraison GitHub Desktop

1. Conserver uniquement `.git` dans le dossier local de la branche APK.
2. Copier tout le contenu du ZIP dans ce dossier.
3. Commit conseillé : `DEV15.2.8 - Trace completeness hotfix`.
4. Pousser sur `main` avec GitHub Desktop.
5. Attendre le dernier run GitHub Actions entièrement vert.
6. Télécharger uniquement `cap-clair-dev15-2-8-debug-apk`.
7. Installer l'APK par-dessus la version existante, sans désinstallation.
8. Vérifier `DEV15.2.8` et le hash court dans l'application.
