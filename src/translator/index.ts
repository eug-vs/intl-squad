import { pipe, Effect, Stream } from "effect";
import _ from "lodash";
import { fileContentsBeforeDiff } from "../git";
import { getStdinStream } from "../stdin";
import { translate } from "./agent";
import { diff as objectDiff } from "deep-object-diff";
import { makePatchWriterLayer, RepoWriter } from "../repoWriter";
import { JSONValue, RepoReader } from "../repoReader";

export function runTranslator() {
  const localesFromArgs = process.argv.slice(3);
  return pipe(
    RepoReader,
    Effect.flatMap((repoReader) =>
      pipe(
        Effect.all({
          mainLocaleFileDiff: pipe(
            repoReader.getLocaleFile(repoReader.defaultLocale),
            Effect.flatMap((localeFile) =>
              pipe(
                getStdinStream("stdin"),
                Effect.flatMap(
                  Stream.runFold(
                    "",
                    (output, chunk) => output + Buffer.from(chunk).toString(),
                  ),
                ),
                Effect.flatMap((diff) =>
                  pipe(
                    fileContentsBeforeDiff(localeFile.path, diff),
                    Effect.map((fileContents) =>
                      JSON.parse(fileContents || "{}"),
                    ),
                  ),
                ),
                Effect.tap(Effect.log),
                Effect.map((before) =>
                  objectDiff(before, localeFile.json as object),
                ),
                Effect.map((delta) => _.pickBy(delta, (x) => x !== undefined)),
                Effect.map(JSONValue),
                Effect.tap(Effect.log),
              ),
            ),
          ),
          metadataFile: repoReader.getMetadataFile(),
          glossaries: Effect.forEach(
            localesFromArgs.length
              ? localesFromArgs
              : repoReader.derivedLocales,
            (locale) => repoReader.getGlossaryFile(locale),
          ),
        }),
        Effect.flatMap(({ mainLocaleFileDiff, metadataFile, glossaries }) =>
          pipe(
            translate({
              projectContext: "",
              glossaries,
              messagesToTranslate: mainLocaleFileDiff,
            }),
            Effect.flatMap((translatedResults) =>
              Effect.forEach(
                translatedResults,
                (result) =>
                  Effect.all([
                    pipe(
                      repoReader.getLocaleFile(result.locale),
                      Effect.flatMap((localeFile) =>
                        localeFile.applyPatch(result.messages),
                      ),
                    ),
                    pipe(
                      repoReader.getGlossaryFile(result.locale),
                      Effect.flatMap((localeFile) =>
                        result.glossaryUpdate
                          ? localeFile.applyPatch(result.glossaryUpdate)
                          : Effect.void,
                      ),
                    ),
                    pipe(
                      RepoWriter,
                      Effect.flatMap((writer) =>
                        writer.provideSummary({
                          subject: `feat(i18n): translate ${Object.keys(mainLocaleFileDiff).join(", ")}`,
                          body: translatedResults
                            .map(
                              (result) =>
                                `${result.locale.toUpperCase()}: ${result.notes}`,
                            )
                            .join("\n\n"),
                        }),
                      ),
                    ),
                  ]),
                {
                  concurrency: "unbounded",
                },
              ),
            ),
          ),
        ),
        Effect.provide(
          makePatchWriterLayer("AI Translator <translator@intl-squad.dev>"),
        ),
      ),
    ),
  );
}
