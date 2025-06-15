import _ from "lodash";
import { Brand, pipe, Effect } from "effect";
import { RepoWriter } from "./repoWriter";

export type JSONValue = unknown & Brand.Brand<"JSONValue">;
export const JSONValue = Brand.nominal<JSONValue>();

/**
 * Represents a file that stores JSON
 * It can be patched by merging new values into it
 * Removing is currently not supported
 */
export class JSONFile {
  constructor(
    public readonly path: string,
    public readonly json: JSONValue,
  ) {}
  applyPatch(update: JSONValue) {
    return pipe(
      Effect.sync(() => _.merge({}, this.json, update)),
      Effect.map((json) => JSON.stringify(json, null, "  ")),
      Effect.flatMap((updatedContents) =>
        pipe(
          RepoWriter,
          Effect.flatMap((writer) =>
            writer.updateFile(this.path, updatedContents),
          ),
        ),
      ),
    );
  }
}
