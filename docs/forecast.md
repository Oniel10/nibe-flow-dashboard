# Prognose und Stromherkunft

Hausverbrauch einschließlich WP, PV und Akku-Tagesvorschau stammen direkt aus EEDCs Tagesprognose. Datumsauswahl: heute bis Tag +14, soweit der Wetterdienst Daten liefert.

Die WP-Schätzung wird getrennt aus maximal 30 Tagen EEDC-Rohhistorie gebildet: nur vollständige vergangene Tage, bevorzugt mindestens drei gleiche Wochentage, sonst fünf gleiche Tagtypen, sonst mindestens drei beliebige Tage. Jüngere Tage werden stärker gewichtet (Halbwertszeit 14 Tage). Fehlende Werte werden nicht als null eingesetzt. Es gibt keine zusätzliche Wetterkorrektur und keine daraus abgeleitete Wärme- oder COP-Prognose. `≈` kennzeichnet die Schätzung.

EEDCs historische Stundenanzeige und Rohhistorie können unterschiedliche Stundenraster verwenden. Für das WP-Muster wird ausschließlich die Rohhistorie verwendet; die Anzeige-Raster werden nicht vermischt.

Pro Stunde werden zunächst alle übrigen Verbraucher aus PV und Akku versorgt. Die WP erhält verbleibende PV, danach verbleibende Batterie, zuletzt Netzstrom. Der WP-Anteil wird vom Gesamtverbrauch abgezogen, niemals zusätzlich auf den EEDC-Gesamtverbrauch addiert. Übersteigt die WP-Schätzung das Hausprofil oder fehlt eine Bilanzgröße, bleibt die Zuordnung offen. Späterer PV-Überschuss gleicht früheren Netzbezug nicht aus.

EEDCs Akku-Ganztagssimulation startet aus historischen Mitternachtsständen, sonst 50 %. Sie führt den aktuellen Live-Ladestand nicht bis zum gewählten Datum fort. PV und Akku bezeichnen die unmittelbaren Stromquellen; der ursprüngliche Lade-Mix des Akkus wird hier nicht rekonstruiert.

Prognosedaten werden bei sichtbarer Seite nach zehn Minuten neu gelesen. Datumwechsel löschen alte Anzeigen sofort. Verspätete Antworten überschreiben keinen inzwischen ausgewählten Tag.
