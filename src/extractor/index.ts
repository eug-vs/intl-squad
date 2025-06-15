import { pipe, Effect } from "effect";
import _ from "lodash";
import { findUnlocalizedStrings } from "../finder";
import { readAndParseJson, applyPatch } from "../ops";
import { extractMessages } from "./agent";
import { Config } from "../../config";
import { makePatchWriterLayer, RepoWriter } from "../repoWriter";

export function runExtractor(config: Config) {
  const sourceMessagesFilePath = `${config.messagesPath}/${config.defaultLocale}.json`;
  const metaPath = `${config.messagesPath}/meta.json`;

  return pipe(
    Effect.all(
      {
        messagesJson: readAndParseJson(sourceMessagesFilePath),
        metadataJson: readAndParseJson(metaPath),
        filesToRefactor: findUnlocalizedStrings(config.cwd, config.filter),
      },
      { concurrency: "unbounded" },
    ),
    Effect.flatMap(({ messagesJson, metadataJson, filesToRefactor }) =>
      pipe(
        Effect.forEach(
          filesToRefactor.slice(0, 5),
          (file) =>
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
                  RepoWriter,
                  Effect.flatMap((writer) =>
                    Effect.all({
                      updateCode: pipe(
                        applyPatch(file.source, result.patch),
                        Effect.flatMap((contents) =>
                          writer.updateFile(file.filePath, contents),
                        ),
                      ),
                      updateMessages: pipe(
                        Effect.sync(() =>
                          _.merge({}, messagesJson, result.messages),
                        ),
                        Effect.map((json) => JSON.stringify(json, null, "  ")),
                        Effect.flatMap((newContents) =>
                          writer.updateFile(
                            sourceMessagesFilePath,
                            newContents,
                          ),
                        ),
                      ),
                      updateMetadata: pipe(
                        Effect.sync(() =>
                          _.merge({}, metadataJson, result.metadata),
                        ),
                        Effect.map((json) => JSON.stringify(json, null, "  ")),
                        Effect.flatMap((newContents) =>
                          writer.updateFile(metaPath, newContents),
                        ),
                      ),
                      summary: writer.provideSummary({
                        subject: `refactor(i18n): extract messages for ${Object.keys(result.messages).join(", ")}`,
                        body: result.notes,
                      }),
                    }),
                  ),
                ),
              ),
              Effect.provide(
                makePatchWriterLayer("AI Extractor <extractor@intl.squad>"),
              ),
            ),
          { concurrency: "unbounded" },
        ),
      ),
    ),
    Effect.tap(
      Effect.logInfo(
        "Patches generated, apply them with `git am --3way /tmp/*.patch`",
      ),
    ),
  );
}
