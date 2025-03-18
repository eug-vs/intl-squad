import { FileSystem } from "@effect/platform";
import { Effect, Match, pipe } from "effect";
import { PatchHunk } from "./extractor";

export function readAndParseJson(filePath: string) {
  return pipe(
    FileSystem.FileSystem,
    Effect.tap(Effect.logInfo(`Reading ${filePath}`)),
    Effect.flatMap((fs) => fs.readFileString(filePath)),
    Effect.flatMap((contents) => Effect.try(() => JSON.parse(contents))),
    Effect.withLogSpan("updateFileContents"),
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

// This is probably very bugged and can cause infinite recursion,
// but I don't care it works better than any fuzzy matcher I've tried
// WARN: the underlying assumption is that the pattern string *actually* exists
// in source, and is (relatively) unique
function matchRange(source: string, pattern: string): [number, number] {
  if (!pattern) null;

  const start = source.indexOf(pattern);
  if (start !== -1) return [start, start + pattern.length];
  else {
    const midpoint = Math.floor(pattern.length / 2);
    const left = matchRange(source, pattern.slice(0, midpoint));
    const right = matchRange(source, pattern.slice(midpoint));
    if (!left || !right) throw ":(";
    return [left[0], right[1]];
  }
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
