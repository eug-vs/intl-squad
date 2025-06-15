import { pipe, Effect } from "effect";
import _ from "lodash";
import { findUnlocalizedStrings } from "../finder";
import { extractMessages } from "./agent";
import { makePatchWriterLayer, RepoWriter } from "../repoWriter";
import { RepoReader } from "../repoReader";

export function runExtractor() {
  return pipe(
    RepoReader.pipe(
      Effect.flatMap((repoReader) =>
        Effect.all(
          {
            mainLocaleFile: repoReader.getLocaleFile(repoReader.defaultLocale),
            metadataFile: repoReader.getMetadataFile(),
            filesToRefactor: findUnlocalizedStrings(
              repoReader.eslintRoot,
              process.argv.slice(3),
            ),
          },
          { concurrency: "unbounded" },
        ),
      ),
    ),
    Effect.flatMap(({ mainLocaleFile, metadataFile, filesToRefactor }) =>
      pipe(
        Effect.forEach(
          filesToRefactor,
          (file) =>
            pipe(
              extractMessages({
                file,
                mainLocaleFile,
              }),
              Effect.flatMap((result) =>
                Effect.all([
                  file.applyPatch(result.patch),
                  mainLocaleFile.applyPatch(result.messages),
                  metadataFile.applyPatch(result.metadata),
                  pipe(
                    RepoWriter,
                    Effect.flatMap((writer) =>
                      writer.provideSummary({
                        subject: `refactor(i18n): extract messages for ${Object.keys(result.messages).join(", ")}`,
                        body: result.notes,
                      }),
                    ),
                  ),
                ]),
              ),
              Effect.provide(
                makePatchWriterLayer("AI Extractor <extractor@intl-squad.dev>"),
              ),
            ),
          { concurrency: "unbounded" },
        ),
      ),
    ),
  );
}
