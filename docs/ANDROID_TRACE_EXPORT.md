# CAP CLAIR - Traces Android durables

## Pendant l'enregistrement

Le service Android écrit chaque point dans un journal JSONL interne. Le fichier natif reste la sauvegarde de sécurité si la WebView est suspendue ou recréée.

## À l'arrêt

CAP CLAIR :

1. récupère les derniers points du journal ;
2. arrête le service GPS ;
3. construit la trace filtrée ;
4. vérifie l'écriture locale ;
5. marque la session native comme sauvegardée.

Si l'étape 4 échoue, la session native reste récupérable.

## Export

- APK Android : fichier temporaire puis feuille de partage Android ;
- Web/PWA : téléchargement navigateur ;
- GPX : plusieurs segments après les coupures GPS ;
- JSON : sauvegarde brute de secours.

Les fichiers temporaires d'export sont limités aux huit plus récents et nettoyés après 24 heures.
