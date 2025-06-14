import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect, Logger, LogLevel, Match, pipe, Stream } from "effect";
import _ from "lodash";
import { extractMessages } from "./extractor";
import { findUnlocalizedStrings } from "./finder";
import { applyPatch, readAndParseJson, updateFileContents } from "./ops";
import { fileContentsBeforeDiff, formatGitDiff, formatPatch } from "./git";
import { projectConfig, Config } from "../config";
import { getStdinStream } from "./stdin";
import { diff as objectDiff } from "deep-object-diff";
import { translate } from "./translator";

function extractorAgent(config: Config) {
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

function translatorAgent(config: Config) {
  const sourceMessagesFilePath = `${config.messagesPath}/${config.defaultLocale}.json`;

  return pipe(
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
            Effect.map(JSON.parse),
          ),
          after: readAndParseJson(sourceMessagesFilePath),
        },
        {
          concurrency: "unbounded",
        },
      ),
    ),
    Effect.map(({ before, after }) => objectDiff(before, after)),
    Effect.map((delta) => _.pickBy(delta, (x) => x !== undefined)),
    Effect.tap(Effect.log),
    Effect.flatMap((diff) =>
      translate({
        projectContext: "",
        translatorNotes: "",
        requestedLocales: config.locales,
        stringifedMessages: JSON.stringify(diff),
      }),
    ),
    Effect.flatMap((translatedResults) =>
      Effect.forEach(
        translatedResults,
        (translation) => {
          const path = `${config.messagesPath}/${translation.locale}.json`;
          return pipe(
            readAndParseJson(path),
            Effect.map((json) => _.merge(json, translation.messages)),
            Effect.map((json) => JSON.stringify(json, null, "  ")),
            Effect.flatMap((newContents) => formatGitDiff(path, newContents)),
          );
        },
        {
          concurrency: "unbounded",
        },
      ),
    ),
    Effect.map((diffs) =>
      formatPatch(diffs, {
        author: "AI Translator <translator@intl.squad>",
      }),
    ),
    Effect.tap(Effect.log),
    Effect.flatMap((patch) =>
      updateFileContents(`/tmp/translator.patch`, patch),
    ),
  );
}

NodeRuntime.runMain(
  pipe(
    Match.value(process.argv[2]).pipe(
      Match.when("extractor", () => extractorAgent(projectConfig)),
      Match.when("translator", () => translatorAgent(projectConfig)),
      Match.orElseAbsurd,
    ),
    Effect.tapError(Effect.logError),
    Effect.tap(() => Effect.logDebug("Exiting")),
    Effect.scoped,
    Logger.withMinimumLogLevel(LogLevel.Debug),
    Effect.provide(NodeContext.layer),
  ),
);
