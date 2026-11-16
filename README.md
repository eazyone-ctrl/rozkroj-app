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
