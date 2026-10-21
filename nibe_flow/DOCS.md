# Installation und Konfiguration

## Voraussetzungen

- Home Assistant OS oder eine Supervisor-Installation mit App-Unterstützung.
- Vorhandene NIBE-Entitäten, deren Werte und Schreibbereiche bereits geprüft sind.
- Eine NIBE-Flow-Karte in einem speicherbasierten Dashboard: daraus importiert die App ihre Entitätszuordnungen. Die App schreibt das Dashboard nicht um.

## Optionen

| Option | Bedeutung | Voreinstellung |
|---|---|---|
| `dashboard` | URL-Pfad des Dashboards mit NIBE-Flow-Karten | `nibe-flow` |
| `enable_controls` | Geprüfte Bedienaktionen freigeben | `false` |
| `eedc_slug` | Optional: installierte EEDC-App-ID, in den App-Informationen sichtbar | leer |
| `eedc_anlage_id` | Anlagen-ID innerhalb von EEDC | `1` |

Optionen speichern und die App neu starten. Das ist kein Neustart von Home Assistant.

## Zugriff

Öffnen über **Weboberfläche öffnen** oder die HA-Seitenleiste. Die App akzeptiert nur den Supervisor-Ingress-Gateway. Direkte LAN-Zugriffe auf ihren Container werden abgewiesen. Ein vorhandener HA-Administrator wird anhand der Ingress-Benutzerkennung geprüft. Eine fehlende Kennung wird nicht als Administrator behandelt; in diesem Fall über Home Assistant neu öffnen. Schutzmodus darf eingeschaltet bleiben.

## Steuerung

Nach Installation sind Steuerungen gesperrt. `enable_controls` nach Prüfung der Zuordnungen einschalten. Ein Schieberegler oder Plus/Minus ändert zunächst nur die vorgemerkte Einstellung. Erst **Speichern** sendet die einzelne Änderung. **Zurück** verwirft sie.

Der Server liest vor dem Schreiben den aktuellen Entitätszustand mit Grenzen, Schrittweite und Auswahlmöglichkeiten. Freigegeben sind nur `number.set_value`, `input_number.set_value`, `select.select_option`, `switch.turn_on/off` für zugeordnete Entitäten. Gradminuten sind zusätzlich auf −400…+100 begrenzt. Die WP-Abfrage ist separat auf die konfigurierte Koordinator-Entität eingeschränkt und wird serverseitig gedrosselt.

Die Sperre betrifft diese App. Sie verändert keine HA-Berechtigungen und keine globale Gerätesperre.

## Werte und Verlauf

Die Oberfläche übernimmt HA-Werte alle fünf Sekunden. Die NIBE-Koordinatorabfrage erfolgt bei sichtbarer Seite beim Öffnen und anschließend alle 30 Sekunden. Daten aus Recorder/Statistiken benötigen aufgezeichnete Entitäten. Alte Daten werden durch die Installation nicht nachträglich erzeugt.

Beim Anklicken eines zugeordneten Live-Wertes öffnet sich ein app-eigener Verlauf über 24 Stunden. Unbekannte Zustände unterbrechen die Kurve. Die Darstellung verwendet HA-Historie, nicht die native HA-Mehr-Informationen-Komponente.

## EEDC

Die App liest zwei begrenzte EEDC-Routen über das interne HA-App-Netzwerk. Keine öffentliche Portfreigabe oder MQTT-Publikation ist erforderlich. EEDC muss laufen und unter seiner App-ID erreichbar sein. Fehlende EEDC-Daten sperren keine anderen Ansichten.

## Entfernen

App stoppen und deinstallieren. Vorhandene NIBE-Entitäten, Dashboard-Konfiguration und Recorder-Daten bleiben in HA; die App hat sie nicht angelegt oder umgeschrieben.
