import { pipe, Effect } from "effect";
import _ from "lodash";
import { findUnlocalizedStrings } from "../finder";
import { formatGitDiff, formatPatch } from "../git";
import { readAndParseJson, applyPatch, updateFileContents } from "../ops";
import { extractMessages } from "./agent";
import { Config } from "../../config";

export function runExtractor(config: Config) {
  const sourceMessagesFilePath = `${config.messagesPath}/${config.defaultLocale}.json`;

  return pipe(
    Effect.all(
      {
        messagesJson: readAndParseJson(sourceMessagesFilePath),
        filesToRefactor: findUnlocalizedStrings(config.cwd, config.filter),
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
                  Effect.all({
                    fileDiff: pipe(
                      applyPatch(file.source, result.patch),
                      Effect.flatMap((contents) =>
                        formatGitDiff(file.filePath, contents),
                      ),
                    ),
                    messagesDiff: pipe(
                      Effect.sync(() => _.merge(messagesJson, result.messages)),
                      Effect.map((json) => JSON.stringify(json, null, "  ")),
                      Effect.flatMap((newContents) =>
                        formatGitDiff(sourceMessagesFilePath, newContents),
                      ),
                    ),
                  }),
                  Effect.map(({ fileDiff, messagesDiff }) =>
                    formatPatch([fileDiff, messagesDiff], {
                      body: result.translatorNotes,
                      author: "AI Extractor <extractor@intl.squad>",
                    }),
                  ),
                  Effect.tap(Effect.logInfo),
                  Effect.flatMap((patch) =>
                    updateFileContents(`/tmp/${fileIndex}.patch`, patch),
                  ),
                ),
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
