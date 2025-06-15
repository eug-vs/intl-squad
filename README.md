# intl-squad
The department of AI agents designed to take the i18n burden off you

 - Bring your own AI
 - Compatible with `next-intl`


## Proposed workflow
1. Development: develop your React or Server code as usual, leave hard-coded English strings in code
2. Extraction: replace hard-coded strings with `next-intl` API calls, come up with semantically good JSON structure, update `en.json` (main locale file)
3. Translation: translate the *changes* in `en.json` into desired languages, update corresponding locale files

## Philosophy
The following problems exist that we need to be aware of:
1. AI can make mistakes
2. Token usage is a concern

The following criteria need to be met:
1. Atomic - the AI-generated changes need to be atomic, scoped into some small units of work
2. Reviewable - the AI-generated chagnes need to be easily reviewable and modifiable by a human
3. Robust - no progress should be lost, no modifications should be applied automatically unless explicitly requried
4. Suckless (dare I say) - no bloat / unnecessary features, don't reinvent the wheel, use standard tools where possible, be composable, follow UNIX philosophy

Each agent therefore acts as independent team member, and you should treat them as such.
You give them a task and they generate commits in a form of git patches. You can review them, apply, cherry-pick, rebase, squash, open pull requests...


## Agents
### Extractor
Extractor is a technical agent that is proficient in next-intl.

The main goal of extractor is:
 - locate files with unlocalized strings (uses `react/jsx-no-literals` eslint rule under the hood)
 - replace them in code with `useTranslations/getTranslations`
 - update main locale file (`en.json`) with extracted messages
 - update `meta.json` with relevant metadata about component (helpful for translators)

Usage:
1. `$ extractor src/path/to/some/part/of/repo/**/*.tsx` <-- Optional glob to filter files
2. `$ git checkout -b i18n`
3. `$ git am --3way /tmp/patches/`
4. From now on, treat commits as performed by another developer


### Translator
Translator is a non-technical agent that specializes in translations.

The main goal of extractor is:
 - review the **diff** in main locale file
 - translate this diff into desired locales, respecting component metadata `meta.json` and existing glossary (e.g `de.glossary.json`)
 - update glossary with new entities

Note that translator takes a **diff** in main locale file as an input. It is very useful to translate certain commits, ranges of commits.

Usage (translate last 5 commits):
1. `$ git diff HEAD~5 src/messages/en.json | translator pl ru de` <-- First command here grabs the diff of the last 5 commits in `en.json` file
3. `$ git am --3way /tmp/patches/`

To bootstrap a new locale, just generate a diff against `/dev/null`:
``` 
git diff --no-index /dev/null src/messages/en.json | translator es
```
