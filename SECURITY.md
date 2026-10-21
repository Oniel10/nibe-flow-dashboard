# Sicherheit

Die App akzeptiert ausschließlich den Supervisor-Ingress-Gateway `172.30.32.2`. HA prüft die Anmeldung; die App prüft zusätzlich die übermittelte Benutzer-ID gegen aktive HA-Administratoren. Alle App-API-Routen benötigen diese Prüfung. Benutzerrechte werden höchstens 30 Sekunden zwischengespeichert.

Der vom Supervisor gelieferte Token bleibt im App-Server. Er wird weder in HTML/JavaScript ausgegeben noch im Browser gespeichert. Die App öffnet keinen Host-Port, benötigt keinen Docker-Socket und keine Dateisystemfreigaben von HA. Die Berechtigungen `homeassistant_api` und `hassio_api` (Rolle `default`) dienen zum Lesen des Dashboards, von Zuständen, Recorder-Daten, Benutzerrechten und EEDC-App-Informationen sowie für ausdrücklich freigegebene Bedienaktionen.

Es gibt keinen allgemeinen REST-/WebSocket-Proxy. Statistiken, Historie, EEDC-Leserouten und Services sind begrenzt; Steuerungen zusätzlich standardmäßig aus. POST-Anfragen brauchen JSON und einen app-eigenen Header; Cross-Site-Fetches werden abgewiesen. Vor jedem Geräte-Schreibzugriff werden Ziel, aktueller Zustand, Auswahl, Grenzen und Schrittweite geprüft. Die Admin-Prüfung schlägt bei fehlender Benutzerkennung geschlossen fehl.

Frontend-Ressourcen bleiben vertrauenswürdiger JavaScript-Code. Die optionale Lovelace-Karte verwendet die normale HA-Sitzung und deren Berechtigungen; ihre UI-Sperre ersetzt keine HA-Berechtigungen.

Bitte keine Tokens, Passwörter, vollständigen HA-Konfigurationen oder privaten Messdaten in öffentliche Issues einfügen. Für vertrauliche Befunde GitHubs privaten Meldeweg verwenden, sofern im Repository aktiviert; andernfalls zunächst ein Issue ohne vertrauliche Details zur Kontaktaufnahme öffnen.

Die erste App-Version ist experimentell. Automatisierte Prüfungen verwenden Mocks und synthetische Daten; Hardware-Betrieb und Container-Laufzeit auf HA sind gesondert zu verifizieren.
