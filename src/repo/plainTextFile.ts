import { Effect, Match, pipe } from "effect";
import { PatchHunk } from "../extractor/agent";
import { RepoWriter } from "./repoWriter";

/**
 * Represents a plaintext file without known structure
 * It can only be patched via series of find-and-replace/append operations
 */
export class PlainTextFile {
  constructor(
    public readonly path: string,
    public readonly contents: string,
  ) {}
  applyPatch(hunks: PatchHunk[]) {
    return pipe(
      applyHunks(this.contents, hunks),
      Effect.flatMap((updatedContents) =>
        pipe(
          RepoWriter,
          Effect.flatMap((writer) =>
            writer.updateFile(this.path, updatedContents),
          ),
        ),
      ),
    );
  }
}

function applyHunks(source: string, patch: PatchHunk[]) {
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

// Find the shortest substring of source that contains
// the entire pattern as a subsequence (possibly with missed characters)
// - missing characters *are* allowed (AI can trim inner whitespace sometimes)
// - extra characters *are not* allowed
// - reorders *are not* allowed (AI doesnt seem to mess up order)
function matchRange(source: string, pattern: string): [number, number] {
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
