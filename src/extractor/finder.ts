import { Command } from "@effect/platform";
import { Effect, pipe, Schema } from "effect";
import { PlainTextFile } from "../repo/plainTextFile";

const Message = Schema.Struct({
  ruleId: Schema.NullishOr(Schema.String),
  line: Schema.NullishOr(Schema.Number),
  column: Schema.NullishOr(Schema.Number),
  endLine: Schema.NullishOr(Schema.Number),
  endColumn: Schema.NullishOr(Schema.Number),
});

const EslintOutputSchema = Schema.Array(
  Schema.Struct({
    filePath: Schema.String,
    messages: Schema.Array(Message),
    source: Schema.optionalWith(Schema.String, {
      default: () => "",
    }),
  }),
);

export function findFilesWithUnlocalizedStrings(
  path: string,
  filter: string[],
) {
  return pipe(
    Command.make("pnpm", "eslint", "-f", "json", ...filter),
    Command.workingDirectory(path),
    Effect.succeed,
    Effect.tap((cmd) => Effect.logInfo(`Executing command`, cmd)),
    Effect.flatMap(Command.string),
    Effect.flatMap((stdout) => Effect.try(() => JSON.parse(stdout))),
    Effect.flatMap(Schema.decode(EslintOutputSchema)),
    Effect.map((s) =>
      s
        .map((f) => ({
          ...f,
          messages: f.messages.filter(
            (m) => m.ruleId === "react/jsx-no-literals",
          ),
        }))
        .filter((f) => f.messages.length),
    ),
    Effect.tap((files) =>
      Effect.logDebug(
        `Found unlocalized strings in ${files.length} files`,
        ...files.map((f) => f.filePath),
      ),
    ),
    Effect.map((files) =>
      files.map((file) => new PlainTextFile(file.filePath, file.source)),
    ),
    Effect.withLogSpan("findFilesWithUnlocalizedStrings"),
  );
}
