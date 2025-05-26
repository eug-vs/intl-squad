import { Command, Path } from "@effect/platform";
import { Effect, pipe } from "effect";

export function formatGitDiff(filePath: string, patchedContents: string) {
  return pipe(
    Effect.all({
      patch: pipe(
        Command.make("git", "diff", "--no-index", "--", filePath, "-"),
        Command.feed(patchedContents),
        Command.string,
      ),
      relativeFilePath: pipe(
        Path.Path,
        Effect.map((path) => path.dirname(filePath)),
        Effect.flatMap((dirName) =>
          pipe(
            Command.make("git", "rev-parse", "--show-toplevel"),
            Command.workingDirectory(dirName),
            Command.string,
            Effect.map((repoPath) => repoPath.trim()),
            Effect.tap((repoPath) => Effect.logDebug({ repoPath })),
            Effect.flatMap((repoPath) =>
              Path.Path.pipe(
                Effect.map((path) => path.relative(repoPath, filePath)),
              ),
            ),
            Effect.tap((relativePath) =>
              Effect.logDebug({ relativePath, filePath }),
            ),
          ),
        ),
      ),
    }),
    Effect.map(({ patch, relativeFilePath }) => {
      return patch
        .split("\n")
        .toSpliced(
          0,
          1,
          `diff --git a/${relativeFilePath} b/${relativeFilePath}`,
        )
        .toSpliced(
          2,
          2,
          `--- a/${relativeFilePath}`,
          `+++ b/${relativeFilePath}`,
        )
        .join("\n");
    }),
  );
}
