/* ------------------------------------------------------------------
   config.js  —  everything you are likely to want to change lives here.
   Edit the values, save, refresh the browser. No build step needed.
------------------------------------------------------------------- */

const CONFIG = {

  /* ---- Pass / fail thresholds -------------------------------------
     Set showPassFail to false if you just want the raw numbers.       */
  showPassFail : true,
  targetWpm    : 40,      // minimum net WPM required to pass
  targetAccuracy : 80,    // minimum accuracy % required to pass

  /* ---- Which accuracy number is the headline ----------------------
     'keystroke' : every key you press is judged. A mistake still
                   counts against you even if you backspace and fix it.
                   This is the stricter, "real time" measure.
     'final'     : only the text you leave on screen at the end is
                   judged. Corrected mistakes are forgiven.
     Both numbers are always shown in the result panel; this setting
     only decides which one is treated as THE accuracy score (and which
     one the pass/fail check uses).                                    */
  accuracyMode : 'keystroke',

  /* ---- Default test settings --------------------------------------
     mode: 'timed'   = countdown clock, type as much as you can
           'passage' = count-up clock, stops when the passage is done  */
  defaultMode     : 'timed',
  defaultDuration : 60,            // seconds, used by 'timed' mode
  durations       : [15, 30, 60, 120],

  /* ---- Behaviour ---------------------------------------------------*/
  allowPaste       : false,  // false = pasting the passage in is blocked
  allowBackspace   : true,   // false = no corrections allowed at all
  stopOnFirstError : false,  // true  = test ends the moment you mistype
  blindMode        : false,  // true  = hides right/wrong colours while
                             //         typing, reveals them at the end

  /* ---- Look --------------------------------------------------------*/
  defaultTheme : 'dark',     // 'dark' or 'light'
  fontSize     : 22,         // px, size of the passage text

  /* ---- Session history ---------------------------------------------
     Kept in memory only. Refreshing the page clears it. Nothing is ever
     written to a database or sent anywhere.                            */
  keepSessionHistory : true,
  historyLength      : 8
};
