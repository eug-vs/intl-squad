import { pipe, Effect, Stream } from "effect";
import _ from "lodash";
import { fileContentsBeforeDiff } from "../git";
import { readAndParseJson } from "../ops";
import { getStdinStream } from "../stdin";
import { translate } from "./agent";
import { Config } from "../../config";
import { diff as objectDiff } from "deep-object-diff";
import { makePatchWriterLayer, RepoWriter } from "../repoWriter";

export function runTranslator(config: Config) {
  const sourceMessagesFilePath = `${config.messagesPath}/${config.defaultLocale}.json`;

  const getJsonDiffFromStdin = pipe(
    getStdinStream("stdin"),
    Effect.flatMap(
      Stream.runFold(
        "",
        (output, chunk) => output + Buffer.from(chunk).toString(),
      ),
    ),
    Effect.flatMap((diff) =>
      Effect.all(
        {
          before: pipe(
            fileContentsBeforeDiff(sourceMessagesFilePath, diff),
            Effect.map((fileContents) => JSON.parse(fileContents || "{}")),
          ),
          after: readAndParseJson(sourceMessagesFilePath),
        },
        {
          concurrency: "unbounded",
        },
      ),
    ),
    Effect.tap(Effect.log),
    Effect.map(({ before, after }) => objectDiff(before, after)),
    Effect.map((delta) => _.pickBy(delta, (x) => x !== undefined)),
    Effect.tap(Effect.log),
  );

  return pipe(
    Effect.all({
      diff: getJsonDiffFromStdin,
      requestedLocales: Effect.forEach(config.locales, (locale) =>
        pipe(
          readAndParseJson(`${config.messagesPath}/${locale}.glossary.json`),
          Effect.orElseSucceed(() => ({})),
          Effect.map((glossary) => ({
            locale,
            glossary,
          })),
        ),
      ),
    }),
    Effect.flatMap(({ diff, requestedLocales }) =>
      pipe(
        translate({
          projectContext: "",
          translatorNotes: "",
          requestedLocales,
          stringifedMessages: JSON.stringify(diff),
        }),
        Effect.flatMap((translatedResults) =>
          pipe(
            RepoWriter,
            Effect.flatMap((writer) =>
              Effect.forEach(
                translatedResults,
                (translation) => {
                  const path = `${config.messagesPath}/${translation.locale}.json`;
                  const glossaryPath = `${config.messagesPath}/${translation.locale}.glossary.json`;
                  return Effect.all([
                    pipe(
                      readAndParseJson(path),
                      Effect.map((json) =>
                        _.merge({}, json, translation.messages),
                      ),
                      Effect.map((json) => JSON.stringify(json, null, "  ")),
                      Effect.flatMap((newContents) =>
                        writer.updateFile(path, newContents),
                      ),
                    ),
                    pipe(
                      readAndParseJson(glossaryPath),
                      Effect.orElseSucceed(() => ({})),
                      Effect.map((json) =>
                        _.merge({}, json, translation.glossaryUpdate),
                      ),
                      Effect.map((json) => JSON.stringify(json, null, "  ")),
                      Effect.flatMap((newContents) =>
                        writer.updateFile(glossaryPath, newContents),
                      ),
                    ),
                    writer.provideSummary({
                      subject: `feat(i18n): translate ${Object.keys(diff).join(", ")}`,
                      body: translatedResults
                        .map(
                          (result) =>
                            `${result.locale.toUpperCase()}: ${result.notes}`,
                        )
                        .join("\n\n"),
                    }),
                  ]);
                },
                {
                  concurrency: "unbounded",
                },
              ),
            ),
          ),
        ),
      ),
    ),
    Effect.provide(
      makePatchWriterLayer("AI Translator <translator@intl.squad>"),
    ),
  );
}
