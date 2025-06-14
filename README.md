# intl-squad
The department of AI agents designed to take the i18n burden off you

 - Bring your own AI
 - Compatible with `next-intl`


## Proposed workflow
1. Development: develop your React or Server code as usual, leave hard-coded English strings in code
2. Extraction: replace hard-coded strings with `next-intl` API calls, come up with semantically good JSON structure, update `en.json` (main locale file)
3. Translation: review the diff between `en.json` and `target.json` (desired locale file), translate

## Philosophy
The following problems exist that we need to be aware of:
1. AI can make mistakes
2. Token usage is a concern

The following criteria need to be met:
1. Atomic - the AI-generated changes need to be atomic, scoped into some small units of work
2. Reviewable - the AI-generated chagnes need to be easily reviewable and modifiable by a human
3. Robust - no progress should be lost, no modifications should be applied automatically unless explicitly requried
4. Suckless - no bloat / unnecessary features, don't reinvent the wheel, use standard tools where possible, be composable, follow UNIX philosophy

Each agent therefore acts as independent team member, and you should treat them as such.
You give them a task and they generate commits in form of patches.


## Agents
### Extractor
Given the file `codeWithHardCodedStrings.tsx`, generate `extract.patch` that contains:
1. Commit message with notes and extra details about component to resolve ambiguities
2. Diff for `codeWithHardCodedStrings.tsx` file that will use next-intl APIs (`useTranslations` / `getTranslations`)
3. Diff for `en.json` that adds extracted localizations

Usage:
1. `$ extractor src/path/to/some/part/of/repo/**/*.tsx /tmp/patches/`
2. `$ git checkout -b i18n`
3. `$ git am --3way /tmp/patches/`
4. From now on, treat commits as performed by another developer. Review them, cherry-pick, rebase, squash, open pull requests...


### Translator
Given the `en.json.diff` (changes in main localization file), list of target locales and optionally some extra context, generate `translate.patch`:
1. Commit message with notes to reviewer
2. Diff for all `<locale>.json` files that adds translated localizations

Usage (translate a commit):
1. `$ git diff HEAD en.json > en.json.diff` (or any other commit)
2. `$ translator en.json.diff pl.json de.json ru.json /tmp/patches/`
3. `$ git am --3way /tmp/patches/`
