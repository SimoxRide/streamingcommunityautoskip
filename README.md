# Auto Timer Click Streaming Community

Estensione browser Manifest V3 che monitora un timer in pagina e clicca automaticamente un pulsante quando il conto alla rovescia scende sotto una soglia definita.

Il progetto include anche una logica di avvio automatico del player: se il timer risulta fermo a `00:00`, l'estensione prova a cliccare il pulsante `play` e continua a verificare finché il timer non riparte.

## Funzionalita'

- Attivazione e disattivazione rapida da popup.
- Monitoraggio del timer ogni secondo.
- Click automatico del pulsante di skip quando il timer arriva a 60 secondi o meno.
- Countdown visivo prima del click.
- Tentativo automatico di click su `play` se il timer e' bloccato a `00:00`.
- Salvataggio dello stato tramite `chrome.storage.local`.
- Notifiche visive direttamente nella pagina.

## Struttura del progetto

- `manifest.json`: configurazione dell'estensione.
- `popup.html`: interfaccia del popup.
- `popup.js`: logica UI del popup e comunicazione con il content script.
- `content.js`: monitoraggio timer, gestione play/skip, stato e notifiche.

## Come installarla

1. Apri `chrome://extensions` in Chrome o in un browser Chromium compatibile.
2. Attiva la modalita' sviluppatore.
3. Clicca su `Carica estensione non pacchettizzata`.
4. Seleziona la cartella del progetto.

## Come usarla

1. Apri la pagina web target su cui e' presente il player.
2. Apri il popup dell'estensione.
3. Premi `Attiva`.
4. Lascia aperta la pagina: l'estensione iniziera' a leggere il timer e ad agire automaticamente.
5. Premi `Disattiva` per fermare il monitoraggio.

## Configurazione tecnica

La logica principale e' in `content.js`, dentro l'oggetto `CONFIG`:

- `TIMER_XPATH`: XPath dell'elemento che contiene il timer.
- `BUTTON_XPATH`: XPath del pulsante da cliccare allo scadere della soglia.
- `PLAY_BUTTON_PRIMARY_XPATH`: XPath principale del pulsante play.
- `PLAY_BUTTON_XPATH`: XPath di fallback del pulsante play.
- `THRESHOLD_SECONDS`: soglia sotto la quale eseguire lo skip.
- `CLICK_DELAY_MS`: attesa prima del click automatico.
- `CHECK_INTERVAL_MS`: frequenza di controllo del timer.

Se la struttura DOM della pagina target cambia, gli XPath dovranno essere aggiornati.

## Permessi usati

- `storage`: salva stato attivo/disattivo e stato operativo.
- `tabs`: invia messaggi alla scheda attiva dal popup.
- `host_permissions: <all_urls>`: il content script e' iniettato su tutte le pagine.

## Limiti attuali

- Il funzionamento dipende da XPath molto specifici.
- L'estensione e' pensata per una webapp precisa, non per siti generici.
- Se il DOM cambia, il timer o i pulsanti potrebbero non essere piu' trovati.
- Non sono presenti test automatici o una pipeline di build.

## Note

Il nome mostrato nel browser e' `Auto Timer Click Streaming Community`, mentre nel popup compare `Auto Timer Click`.
