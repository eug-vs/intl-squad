import { NodeContext } from "@effect/platform-node";
import { Effect, LogLevel, Logger, pipe } from "effect";
import _ from "lodash";
import { extractMessages } from "./extractor";
import { findUnlocalizedStrings } from "./finder";
import { translate } from "./translator";
import { applyPatch, readAndParseJson, updateFileContents } from "./ops";

const config = {
  cwd: "/home/eug-vs/Documents/Projects/1moment.io/apps/web",
  filter: "**/settings/page.tsx",
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
          filesToRefactor,
          (file) =>
            pipe(
              extractMessages({
                source: file.source,
                messagesJson: JSON.stringify(messagesJson),
              }),
              Effect.tap((result) =>
                pipe(
                  applyPatch(file.source, result.patch),
                  Effect.flatMap((contents) =>
                    updateFileContents(file.filePath, contents),
                  ),
                ),
              ),
              Effect.flatMap((result) =>
                translate({
                  projectContext: args.projectContext,
                  translatorNotes: result.translatorNotes,
                  requestedLocales: args.locales,
                  stringifedMessages: JSON.stringify(result.messages),
                }),
              ),
            ),
          { concurrency: "unbounded" },
        ),
        Effect.flatMap((results) => {
          return Effect.forEach(
            args.locales,
            (locale) => {
              const jsonPath = `${args.messagesPath}/${locale}.json`;
              return pipe(
                readAndParseJson(jsonPath),
                Effect.map((currentJson) =>
                  results
                    .flat()
                    .filter((r) => r.locale === locale)
                    .reduce(
                      (json, data) => _.merge(json, data.messages),
                      currentJson,
                    ),
                ),
                Effect.flatMap((updatedJson) =>
                  updateFileContents(
                    jsonPath,
                    JSON.stringify(updatedJson, null, "  "),
                  ),
                ),
              );
            },
            {
              concurrency: "unbounded",
            },
          );
        }),
      ),
    ),
    Logger.withMinimumLogLevel(LogLevel.Debug),
    Effect.tapError(Effect.logError),
    Effect.provide(Logger.pretty),
    Effect.provide(NodeContext.layer),
  );
}

Effect.runPromise(program(config));
