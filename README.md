# Typing Speed & Accuracy Test

A small, self-contained typing test that runs entirely in the browser.
No accounts, no database, no build step, no internet connection required.

* Timer starts on your first keystroke
* Live WPM, accuracy and error count while you type
* Every character marked as you go — green for correct, red for wrong
* Optional PASS / FAIL against a WPM and accuracy target you set
* Works on desktop and mobile browsers
* Nothing is stored or sent anywhere

---

## Running it

**Simplest:** open `index.html` in a browser. That is all — it works straight
off the file system.

**On a small server**, copy the folder into your web root and point a browser
at it. Any static host will do; there is no backend. For example:

```bash
# Python (already on most machines)
cd typing-test
python3 -m http.server 8000
# then open http://localhost:8000

# or Node
npx serve .

# or just drop the folder into nginx / Apache / Caddy / a CDN bucket
```

Nothing needs installing, and the whole thing is about 45 KB.

---

## Files

```
typing-test/
├── index.html          the page
├── css/styles.css      all styling, both themes
└── js/
    ├── config.js       ← the settings you are most likely to change
    ├── passages.js     ← the practice texts
    └── app.js          the test itself
```

---

## Settings — `js/config.js`

Edit the values, save, refresh the browser.

| Setting | Default | What it does |
|---|---|---|
| `showPassFail` | `true` | Show a PASS / NOT PASSED banner on the result panel |
| `targetWpm` | `40` | Net WPM needed to pass |
| `targetAccuracy` | `80` | Accuracy % needed to pass |
| `accuracyMode` | `'keystroke'` | Which accuracy figure is the headline, and which one the pass check uses. `'keystroke'` or `'final'` — see below |
| `defaultMode` | `'timed'` | `'timed'` = countdown clock, `'passage'` = type the whole passage |
| `defaultDuration` | `60` | Seconds for a timed run |
| `durations` | `[15,30,60,120]` | The choices in the seconds dropdown |
| `allowPaste` | `false` | `false` blocks pasting the passage into the input |
| `allowBackspace` | `true` | `false` means no corrections at all |
| `stopOnFirstError` | `false` | `true` ends the run the instant you mistype |
| `blindMode` | `false` | `true` hides the right/wrong marking, live accuracy and error count until the run finishes |
| `defaultTheme` | `'dark'` | `'dark'` or `'light'`. The toggle in the corner remembers your choice |
| `fontSize` | `22` | Size of the passage text, in px |
| `keepSessionHistory` | `true` | Show a table of this session's runs |
| `historyLength` | `8` | How many rows that table keeps |

### Adding your own passages — `js/passages.js`

```js
{
  title: 'Name shown in the dropdown',
  text:  "One single line of text. No line breaks."
}
```

Keep each passage as one line and use straight quotes `'` `"`. If you paste in
something with curly quotes, em dashes or ellipsis characters, the app converts
them to their plain keyboard equivalents automatically, so what is on screen is
always something you can actually type.

You can also click **Own text** in the page itself and paste a passage in
without touching any files. Line breaks are flattened to single spaces, so
Enter is never needed.

---

## How the numbers are worked out

### First, how your text is lined up against the passage

Comparison is done **word by word**, not character by character, and this is
worth understanding because it is what makes the accuracy figure sensible.

If a straight character-by-character comparison is used, dropping a single
letter early in a passage shifts everything after it out of step, and the rest
of the passage — hundreds of characters you typed perfectly well — is marked
wrong. Accuracy collapses from one small slip.

Here each word you type is measured against the corresponding word of the
passage, and the space bar moves you to the next one. A slip costs you that
word and nothing more:

* **wrong character** — red, on a red background
* **typed past the end of a word** — the extra characters are appended in red and struck through
* **skipped by pressing space early** — the characters you never typed stay in red with a dotted underline, and count as errors

### The numbers themselves

The word here is the standard **five characters = one word**, which is how
typing tests have measured this for about a hundred years. It means the score
does not swing wildly depending on whether a passage happens to use long or
short words.

**Gross WPM** — raw speed, mistakes ignored:

```
gross wpm = (characters typed ÷ 5) ÷ minutes elapsed
```

**Net WPM** — the headline speed. Each mistake still showing on screen at the
end costs you one word:

```
net wpm = gross wpm − (errors left uncorrected ÷ minutes elapsed)
```

Never shown below zero.

**Keystroke accuracy** — the strict measure. Every character-producing key is
judged as you press it, and a mistake counts even if you notice it and
backspace over it:

```
keystroke accuracy = correct keys pressed ÷ all keys pressed × 100
```

**Final text accuracy** — the forgiving measure. Only the text sitting on
screen when the clock stops is judged, so anything you fixed is forgiven:

```
final text accuracy = matching characters ÷ (characters typed + characters skipped) × 100
```

Characters you skipped by pressing space early are in the divisor, so skipping
half a word cannot flatter the score.

Both are always shown in the result panel. `accuracyMode` decides which one is
the headline figure and which one the pass/fail check uses.

**Pass / fail** needs the WPM *and* the accuracy to reach the target, and both
are judged on the numbers exactly as they are displayed — the rounded ones you
can see — rather than on the raw figures behind them. Otherwise a run showing
`40 wpm` against a 40 wpm target could be marked "needs 1 more wpm", because
the true figure was 39.6. Correct arithmetic, but it reads as a bug. Meeting
the target exactly is a pass.

**The clock** starts on your first keystroke, not when the page loads, and it
reads `performance.now()` — a monotonic clock. It cannot drift if the tab
stutters, and it cannot jump if the machine's system clock changes. Elapsed
time is always the difference between two stamps rather than a count of ticks,
so a slow frame never costs you time. On a timed run the reported time is
pinned to the limit exactly, so a 60 second test always reports 60.0 seconds
rather than 60.1 or 59.9.

Note that **net WPM** counts errors still showing at the end, while
**keystroke accuracy** counts every mistake you ever made. A run where you
mistyped a lot but corrected everything gives a high net WPM and a low
keystroke accuracy — which is exactly the picture you want.

### Worked examples

Both use the passage `the quick brown fox jumps over the lazy dog`
(43 characters, 9 words).

**1. Mistakes made and corrected.** You type the first 20 characters
correctly, then three wrong characters, backspace over them, and type the
remaining 23 correctly. It takes 2.0 seconds.

* keys pressed: 20 + 3 + 23 = **46**, of which 3 were wrong → keystroke accuracy = 43 ÷ 46 = **93.5%**
* characters on screen at the end: 43, all matching → final text accuracy = **100%**
* gross wpm = (43 ÷ 5) ÷ (2 ÷ 60) = **258**
* errors left uncorrected = 0, so net wpm = **258** as well

**2. A dropped letter, left uncorrected.** You type `the quik brown fox jumps
over the lazy dog` — the `c` of *quick* is missing, so the `k` lands on the
`c`'s place and the last letter of the word is never typed.

* only the word *quick* is affected; every later word still reads as correct
* 42 characters typed, 1 of them wrong, 1 character skipped
* errors left uncorrected = 1 wrong + 1 skipped = **2**
* final text accuracy = 41 ÷ (42 + 1) = **95.3%**

Both of these are checked automatically by the test script the app was built
against, so the arithmetic above is what the app actually produces.

---

## Controls

| Key | Does |
|---|---|
| `Tab` | Restart the same passage |
| `Esc` | Load a new passage |
| `Enter` | Only used at the very end of a passage: finishes the run and scores it, even if mistakes are still showing |

Reaching the end of a passage with everything correct ends the run by itself.
If mistakes are still showing, the run waits so you have the chance to correct
them — press `Enter` if you would rather be scored as you are.

On a phone, tap the passage to bring up the keyboard.

---

## Notes

* Mistyped characters show the **passage's** character in red, not the wrong
  one you typed, so the text you are copying stays readable throughout.
* Double spaces and leading spaces are ignored, since they would silently
  skip a whole word.
* You can overrun the end of a word by up to a few characters, but not the end
  of the passage.
* Autocorrect, autocapitalise and spellcheck are switched off on the input, so
  a phone keyboard cannot quietly "fix" your typing and skew the score.
* Pasting is blocked by default (`allowPaste`).
* Session history lives in memory only. Refreshing the page clears it. The one
  and only thing written to `localStorage` is your light/dark preference.
* Browser support: anything current — Chrome, Edge, Firefox, Safari, and their
  mobile versions.

## Licence

Yours to use, modify and host however you like.
