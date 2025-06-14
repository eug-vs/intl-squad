import { pipe, Effect, Stream } from "effect";
import _ from "lodash";
import { fileContentsBeforeDiff, formatGitDiff, formatPatch } from "../git";
import { readAndParseJson, updateFileContents } from "../ops";
import { getStdinStream } from "../stdin";
import { translate } from "./agent";
import { Config } from "../../config";
import { diff as objectDiff } from "deep-object-diff";

export function runTranslator(config: Config) {
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
            Effect.map((fileContents) => JSON.parse(fileContents || "{}")),
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
