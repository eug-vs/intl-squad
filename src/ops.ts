import { FileSystem } from "@effect/platform";
import { Effect, Match, pipe } from "effect";
import { PatchHunk } from "./extractor";

export function readAndParseJson(filePath: string) {
  return pipe(
    FileSystem.FileSystem,
    Effect.tap(Effect.logInfo(`Reading ${filePath}`)),
    Effect.flatMap((fs) => fs.readFileString(filePath)),
    Effect.flatMap((contents) => Effect.try(() => JSON.parse(contents))),
    Effect.withLogSpan("readAndParseJson"),
  );
}

export function updateFileContents(filePath: string, contents: string) {
  return pipe(
    FileSystem.FileSystem,
    Effect.tap(Effect.logInfo(`Updating ${filePath}`)),
    Effect.flatMap((fs) => fs.writeFileString(filePath, contents)),
    Effect.withLogSpan("updateFileContents"),
  );
}

// Find the shortest substring of source that contains
// the entire pattern as a subsequence (possibly with missed characters)
// - missing characters *are* allowed (AI can trim inner whitespace sometimes)
// - extra characters *are not* allowed
// - reorders *are not* allowed (AI doesnt seem to mess up order)
export function matchRange(source: string, pattern: string): [number, number] {
  let best: [number, number] = [0, source.length + 1]; // init with max range

  for (let i = 0; i < source.length; i++) {
    if (source[i] !== pattern[0]) continue;

    let si = i;
    let pi = 0;

    while (si < source.length && pi < pattern.length) {
      if (source[si] === pattern[pi]) pi++;
      si++;
    }

    if (pi === pattern.length && si - i < best[1] - best[0]) {
      best = [i, si];
    }
  }

  if (best[1] > source.length) {
    throw new Error("No match found");
  }

  return best;
}

export function applyPatch(source: string, patch: PatchHunk[]) {
  return pipe(
    Effect.reduce(patch, source, (contents, hunk) =>
      Match.value(hunk)
        .pipe(
          Match.tag("find-and-replace", (hunk) =>
            pipe(
              Effect.try(() => matchRange(contents, hunk.find)),
              Effect.tap(() => Effect.logInfo("Applying hunk", hunk)),
              Effect.map(([start, end]) =>
                contents
                  .split("")
                  .toSpliced(start, end - start, hunk.replace)
                  .join(""),
              ),
            ),
          ),
          Match.tag("append-line", (hunk) =>
            pipe(
              Effect.sync(() => contents.split("\n")),
              Effect.tap(() => Effect.logInfo("Applying hunk", hunk)),
              Effect.flatMap((lines) =>
                pipe(
                  Effect.sync(() =>
                    lines.map((s) => s.includes(hunk.matchLine)),
                  ),
                  Effect.filterOrFail(
                    (matchedLines) =>
                      matchedLines.filter((x) => x).length === 1,
                    () => `Matched more than one line`,
                  ),
                  Effect.map((matchedLines) => matchedLines.indexOf(true)),
                  Effect.map((index) =>
                    lines
                      .toSpliced(index + 1, 0, hunk.appendAfter.trim())
                      .join("\n"),
                  ),
                ),
              ),
            ),
          ),
          Match.exhaustive,
        )
        .pipe(
          Effect.catchAll((e) =>
            Effect.logError(`Hunk does not apply: ${e}`).pipe(
              Effect.andThen(() => Effect.succeed(contents)),
            ),
          ),
        ),
    ),
    Effect.withLogSpan("applyPatch"),
  );
}
