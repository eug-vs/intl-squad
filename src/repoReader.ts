import { Brand, Context, Effect, Layer, pipe } from "effect";
import { Command, FileSystem } from "@effect/platform";
import { PatchHunk } from "./extractor/agent";
import { applyPatch } from "./ops";
import { RepoWriter } from "./repoWriter";
import _ from "lodash";
import { PlatformError } from "@effect/platform/Error";

export class PlainTextFile {
  constructor(
    public readonly path: string,
    public readonly contents: string,
  ) {}
  applyPatch(hunks: PatchHunk[]) {
    return pipe(
      applyPatch(this.contents, hunks),
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
export type JSONValue = unknown & Brand.Brand<"JSONValue">;
export const JSONValue = Brand.nominal<JSONValue>();

class JSONFile {
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

export class MetadataFile extends JSONFile {
  readonly _tag = "MetadataFile";
}
export class LocaleFile extends JSONFile {
  readonly _tag = "LocaleFile";
  constructor(
    public readonly locale: string,
    path: string,
    json: JSONValue,
  ) {
    super(path, json);
  }
}
export class GlossaryFile extends JSONFile {
  readonly _tag = "GlossaryFile";
  constructor(
    public readonly locale: string,
    path: string,
    json: JSONValue,
  ) {
    super(path, json);
  }
}
export class CodeFile extends PlainTextFile {
  readonly _tag = "CodeFile";
}

export class RepoReader extends Context.Tag("RepoReader")<
  RepoReader,
  {
    gitRepoRoot: string;
    eslintRoot: string;
    defaultLocale: string;
    derivedLocales: string[];
    getMetadataFile(): Effect.Effect<MetadataFile>;
    getLocaleFile(locale: string): Effect.Effect<LocaleFile>;
    getGlossaryFile(locale: string): Effect.Effect<GlossaryFile>;
    getCodeFile(path: string): Effect.Effect<CodeFile, PlatformError>;
  }
>() {}

function parseJSON(s: string) {
  return Effect.try(() => JSON.parse(s));
}

export const RepoReaderLive = ({
  messagesDir,
  eslintRoot,
  defaultLocale,
  derivedLocales,
}: {
  messagesDir: string;
  eslintRoot: string;
  defaultLocale: string;
  derivedLocales: string[];
}) =>
  Layer.effect(
    RepoReader,
    pipe(
      Effect.all({
        fs: FileSystem.FileSystem,
        gitRepoRoot: pipe(
          Command.make("git", "rev-parse", "--show-toplevel"),
          Command.workingDirectory(messagesDir),
          Command.string,
        ),
      }),
      Effect.map(({ gitRepoRoot, fs }) =>
        RepoReader.of({
          gitRepoRoot,
          eslintRoot,
          defaultLocale,
          derivedLocales,
          getMetadataFile() {
            const path = `${messagesDir}/meta.json`;
            return pipe(
              fs.readFileString(path),
              Effect.flatMap(parseJSON),
              Effect.orElseSucceed(() => ({})),
              Effect.map((json) => new MetadataFile(path, json)),
            );
          },
          getLocaleFile(locale) {
            const path = `${messagesDir}/${locale}.json`;
            return pipe(
              fs.readFileString(path),
              Effect.flatMap(parseJSON),
              Effect.orElseSucceed(() => ({})),
              Effect.map((json) => new LocaleFile(locale, path, json)),
            );
          },
          getGlossaryFile(locale) {
            const path = `${messagesDir}/${locale}.glossary.json`;
            return pipe(
              fs.readFileString(path),
              Effect.flatMap(parseJSON),
              Effect.orElseSucceed(() => ({})),
              Effect.map((json) => new GlossaryFile(locale, path, json)),
            );
          },
          getCodeFile(path) {
            return pipe(
              fs.readFileString(path),
              Effect.map((contents) => new CodeFile(path, contents)),
            );
          },
        }),
      ),
    ),
  );
