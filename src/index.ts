import { NodeContext } from "@effect/platform-node";
import { Effect, LogLevel, Logger, pipe } from "effect";
import _ from "lodash";
import { extractMessages } from "./extractor";
import { findUnlocalizedStrings } from "./finder";
import { translate } from "./translator";
import { applyPatch, readAndParseJson, updateFileContents } from "./ops";
import { formatGitDiff, formatPatch } from "./git";

const config = {
  cwd: "/home/eug-vs/Documents/Projects/1moment.io/apps/web",
  filter: "**/business/**/*.tsx",
  projectContext: `Hint: "Tables" most likely means dining tables, not data-tables.`,
  locales: ["en", "pl", "ru"],
  defaultLocale: "en",
  messagesPath:
    "/home/eug-vs/Documents/Projects/1moment.io/apps/web/src/messages",
};

function program(args: {
  cwd: string;
  filter: string;
  messagesPath: string;
  locales: string[];
  defaultLocale: string;
  projectContext: string;
}) {
  return pipe(
    Effect.all(
      {
        messagesJson: readAndParseJson(
          `${args.messagesPath}/${args.defaultLocale}.json`,
        ),
        filesToRefactor: findUnlocalizedStrings(args.cwd, args.filter),
      },
      { concurrency: "unbounded" },
    ),
    Effect.flatMap(({ messagesJson, filesToRefactor }) =>
      pipe(
        Effect.forEach(
          filesToRefactor.slice(0, 5),
          (file, fileIndex) =>
            pipe(
              extractMessages({
                source: file.source,
                messagesJson: JSON.stringify(messagesJson),
                occurences: file.messages.map((msg) => {
                  if (!msg.line || !msg.endLine)
                    throw new Error("Rule violation region not specified");
                  return file.source
                    .split("\n")
                    .slice(msg.line, msg.endLine + 1)
                    .join("\n");
                }),
              }),
              Effect.flatMap((result) =>
                pipe(
                  translate({
                    projectContext: args.projectContext,
                    translatorNotes: result.translatorNotes,
                    requestedLocales: args.locales,
                    stringifedMessages: JSON.stringify(result.messages),
                  }),
                  Effect.flatMap((localizations) =>
                    pipe(
                      Effect.all({
                        fileDiff: pipe(
                          applyPatch(file.source, result.patch),
                          Effect.flatMap((contents) =>
                            formatGitDiff(file.filePath, contents),
                          ),
                        ),
                        jsonDiffs: Effect.forEach(localizations, (loc) => {
                          const jsonPath = `${args.messagesPath}/${loc.locale}.json`;
                          return pipe(
                            readAndParseJson(jsonPath),
                            Effect.map((json) => _.merge(json, loc.messages)),
                            Effect.map((json) =>
                              JSON.stringify(json, null, "  "),
                            ),
                            Effect.flatMap((newContents) =>
                              formatGitDiff(jsonPath, newContents),
                            ),
                          );
                        }),
                      }),
                      Effect.map(({ fileDiff, jsonDiffs }) =>
                        formatPatch([fileDiff, ...jsonDiffs], {
                          body: result.translatorNotes,
                        }),
                      ),
                      Effect.tap(Effect.logInfo),
                      Effect.flatMap((patch) =>
                        updateFileContents(`/tmp/${fileIndex}.patch`, patch),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          { concurrency: "unbounded" },
        ),
      ),
    ),
    Logger.withMinimumLogLevel(LogLevel.Debug),
    Effect.tapError(Effect.logError),
    Effect.provide(Logger.pretty),
    Effect.provide(NodeContext.layer),
  );
}

Effect.runPromise(program(config));
