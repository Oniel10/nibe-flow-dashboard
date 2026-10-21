# Bestehende Entitäten zuordnen

Die App übernimmt Zuordnungen aus vorhandenen NIBE-Flow-Karten. Damit können Karte und App parallel verwendet werden. Für neue Installationen:

1. `dist/nibe-flow-card.js` nach `/config/www/nibe-flow-card.js` kopieren und `/local/nibe-flow-card.js?v=0.5.0` als JavaScript-Modul unter Dashboard-Ressourcen hinzufügen.
2. In einem Dashboard eine Karte mit `type: custom:nibe-flow-card` anlegen.
3. Im Karteneditor die tatsächlich verfügbaren Entitäten auswählen. Leere Rollen bleiben unbekannt.
4. In der App den URL-Pfad dieses Dashboards unter `dashboard` eintragen.

Eine minimale Kartenkonfiguration:

```yaml
type: custom:nibe-flow-card
title: Wärmepumpe
enable_controls: false
default_view: overview
zero_temperature: 40
entities: {}
```

`examples/entities.s1155.json` dokumentiert die Rollen mit absichtlich synthetischen `demo_`-Entitäten. Diese Werte sind **keine gültige Zuordnung deiner Anlage** und dürfen nicht ungeprüft als echte Geräte übernommen werden.

Die App vereinigt die Zuordnungen der NIBE-Flow-Karten im gewählten Dashboard. Erweiterte Steuerungen benötigen entsprechende vorhandene Entitäten; unbekannte Register werden nicht hinzugefügt.
