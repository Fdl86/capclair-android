# CAP CLAIR DEV15.4.1

- Adoption du pipeline SUP AIP versionné de WEB13.30.4 via `latest.json` et ses révisions immuables.
- Distinction entre la date de dernière modification métier et la date du dernier contrôle SIA réussi.
- Vérification de la taille et du SHA-256 du manifeste avant toute utilisation.
- Vérification de la taille et du SHA-256 du statut, du GeoJSON et de l'index des publications incomplètes.
- Installation transactionnelle de chaque nouvelle base SUP AIP après validation complète de son contenu.
- Conservation locale d'une base active, d'une base précédente et de la base embarquée de secours.
- Retour automatique vers la base précédente si la base active locale est absente, corrompue ou incohérente.
- Aucun téléchargement de la base complète lorsque la révision serveur n'a pas changé.
- Actualisation séparée de la fraîcheur serveur et de la dernière vérification effectuée par l'appareil.
- Ajout d'un pont Android natif limité au domaine CAP CLAIR pour préserver les octets exacts nécessaires aux contrôles SHA-256.
- Maintien temporaire de la compatibilité avec l'ancien contrat serveur SUP AIP.
- Aucun changement fonctionnel du GPS, du Suivi, des traces, du Replay, du relief, du PDF Log nav ou de l'auto-update.
