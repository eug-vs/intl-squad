import { Command } from "@effect/platform";
import { Effect, pipe, Schema } from "effect";

const Message = Schema.Struct({
  ruleId: Schema.NullishOr(Schema.String),
  line: Schema.NullishOr(Schema.Number),
  column: Schema.NullishOr(Schema.Number),
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

export function findUnlocalizedStrings(path: string, filter: string) {
  return pipe(
    Command.make("pnpm", "eslint", "-f", "json", filter),
    Command.workingDirectory(path),
    Effect.succeed,
    Effect.tap((cmd) => Effect.logInfo(`Executing command`, cmd)),
    Effect.flatMap(Command.string),
    Effect.flatMap((stdout) => Effect.try(() => JSON.parse(stdout))),
    Effect.flatMap(Schema.decode(EslintOutputSchema)),
    Effect.map((s) =>
      s.filter((f) =>
        f.messages.some((m) => m.ruleId === "react/jsx-no-literals"),
      ),
    ),
    Effect.tap((files) =>
      Effect.logDebug(
        `Found unlocalized strings in ${files.length} files`,
        ...files.map((f) => f.filePath),
      ),
    ),
    Effect.withLogSpan("findUnlocalizedStrings"),
  );
}
