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
        ? patch
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
            .join("\n")
        : "";
    }),
  );
}

function formatBody(text: string, width = 72): string[] {
  return text
    .trim()
    .split("\n")
    .flatMap((line) => {
      if (line.length <= width) return line;
      const cropped = line.slice(0, width);
      const splitIndex = cropped.lastIndexOf(" ");
      return [
        line.slice(0, splitIndex),
        ...formatBody(line.slice(splitIndex + 1), width),
      ];
    });
}

export function formatPatch(
  diffs: string[],
  options: {
    author?: string;
    subject?: string;
    body?: string;
    date?: Date;
  } = {},
): string {
  const {
    author = "AI Assistant <ai@eug-vs.xyz>",
    subject = "AI Refactor",
    body = "",
    date = new Date(),
  } = options;

  const patchDate = date.toUTCString();
  const commitSha = "0000000000000000000000000000000000000000"; // dummy SHA

  const header = [
    `From ${commitSha} Mon Sep 17 00:00:00 2001`,
    `From: ${author}`,
    `Date: ${patchDate}`,
    `Subject: [PATCH] ${subject}`,
    "",
  ];

  const bodyLines = formatBody(body);

  const separator = ["---"];
  return [...header, ...bodyLines, ...separator, ...diffs].join("\n");
}

export function fileContentsBeforeDiff(filePath: string, diff: string) {
  return pipe(
    Command.make("patch", "-R", filePath, "-o", "-"),
    Command.feed(diff),
    Command.string,
  );
}
