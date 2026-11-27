# Reprise du projet — 26 novembre 2026

Conversation d’origine retrouvée dans Codex : **Planifier TokenFlex**.
Identifiant : `01a1ec80-33b9-76b3-9513-64ad353d8923`.

La copie `GitHub/tokenflex` datait du 19 novembre et appliquait un tarif uniforme à tous les tokens d’entrée. Les améliorations suivantes se trouvaient dans les livrables de la conversation d’origine : séparation du cache, stockage SQLite et vue du jour.

Cette version reprend ces améliorations et remplace le calcul de prix autonome par les résultats du CLI CodexBar. La base privée et les journaux ne font pas partie de l’export GitHub.

L’affichage ancien pouvait être gonflé par la facturation du cache au prix de l’entrée normale. Le montant précis de 400 $ par jour n’a pas été reproduit avec une capture et des paramètres identiques ; il ne doit pas être présenté comme une dépense réelle vérifiée.
