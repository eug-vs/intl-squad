import { openai } from "@ai-sdk/openai";
import { GenerateObjectResult } from "ai";
import { Effect, pipe } from "effect";

export const model = openai("o3-mini", {
  structuredOutputs: false, // This is needed to allow flexible schemas with z.ZodAny values
});

export function runAgent<O>(
  name: string,
  generateObject: () => Promise<GenerateObjectResult<O>>,
) {
  return pipe(
    Effect.logDebug("Running agent"),
    Effect.andThen(() => Effect.tryPromise(() => generateObject())),
    Effect.tap((result) => Effect.logInfo(result.usage)),
    Effect.map((result) => result.object),
    Effect.tap(Effect.logDebug),
    Effect.withLogSpan(name),
  );
}
