# Rozkrój — aplikacja

Kalkulator rozkroju płyt meblowych w wyglądzie aplikacji **Półkownik**: szałwiowe karty, duże pola z liczbami (Barlow Condensed), przełączniki w kształcie pigułek, zielony pasek podsumowania na dole, projekty w wysuwanym arkuszu, styl „rysunek techniczny” i tryb ciemny.

Logika (optymalizator, formatki, okleina, słoje, płyty z kodem, import PRO100, odejmowanie okleiny, PDF/CSV) pochodzi z projektu `../rozkroj-plyt` (stan z commita 7f5cf65).

## Uruchomienie

Otwórz `index.html` w przeglądarce (albo `python3 -m http.server` w tym folderze).

## Pliki

- `index.html` — wygląd (CSS w stylu Półkownika) + logika aplikacji + powłoka (motyw, styl, arkusz projektów, pasek).
- `optimizer.js` — optymalizator rozkroju (kopia z `rozkroj-plyt`).

## Dane

Projekty i ustawienia zapisują się w przeglądarce pod własnymi kluczami (`rozkroj-app-v1`, `rozkroj-app-projekty-v1`, `rozkroj-app-ui`), osobno od `rozkroj-plyt`. W artefakcie Claude projekty zapisują się na koncie.

## Artefakt

https://claude.ai/artifact/6548qj741pCsmWBs8xFdNU — publikowany z `index.html` + `optimizer.js`, uprawnienia: db, downloads, user.

## Aplikacja na Androida

Folder `android/` to projekt Androida (WebView). Strona jest serwowana z `assets/www` spod `https://appassets.androidplatform.net`, więc działają projekty (localStorage) i liczenie w tle. PDF i CSV trafiają do systemowego „Zapisz lub udostępnij”, import PRO100 otwiera wybór pliku z telefonu, a biblioteka PDF jest wbudowana (działa bez internetu; czcionki z internetu, bez niego systemowe).

**Budowa:** GitHub Actions (`.github/workflows/android.yml`) przy każdym pushu buduje APK (artefakt „rozkroj-…” przy przebiegu). Tag `v*` (np. `v1.0.0`) tworzy wydanie z plikiem APK do pobrania w zakładce Releases.

Lokalnie (wymaga Android SDK i Gradle 8.7+):

```bash
bash android/prepare-assets.sh && cd android && gradle assembleDebug
```

APK jest podpisany kluczem debug: instalacja wymaga zgody na instalację z nieznanych źródeł.
