# Auto Update Bridge Hotfix - DEV15.3.2

## Symptôme

DEV15.3.0 détecte correctement une Release plus récente et affiche son changelog. Au clic sur `Télécharger la mise à jour`, le plugin Android refuse immédiatement l'opération avec :

`versionCode de mise à jour invalide`

Aucun téléchargement n'est alors créé.

## Cause

Le service TypeScript transmet `versionCode` comme nombre JavaScript au plugin Capacitor. Selon la représentation produite par le pont JSON, la valeur peut être un `Double` plutôt qu'un `Long` Java.

L'appel suivant pouvait donc renvoyer `null` :

`call.getLong("versionCode")`

## Correctif

Le plugin utilise désormais :

`NativeBridgeNumbers.nonNegativeLong(call.getData().opt("versionCode"), 0L)`

Ce convertisseur accepte les objets Java dérivés de `Number` ainsi que les chaînes numériques, puis ramène toute valeur négative à zéro. La validation existante refuse toujours zéro et les valeurs invalides.

## Tests

Les tests couvrent :

- `1503002` comme entier ;
- `1503002.0` comme nombre JavaScript ;
- `"1503002"` comme chaîne ;
- une chaîne invalide ;
- une valeur négative.

Un contrat Vitest vérifie également que `PluginCall.getLong("versionCode")` n'est plus utilisé dans le plugin de mise à jour.

## Périmètre

Le correctif ne modifie pas :

- le moteur GPS ;
- le service GPS de premier plan ;
- le journal ou le stockage natif des traces ;
- le PDF Log nav ;
- la logique de sécurité SHA-256, package, signature et refus de downgrade.
