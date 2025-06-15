import { Context, Effect, Layer, pipe } from "effect";
import { Command, FileSystem, Path } from "@effect/platform";
import _ from "lodash";
import { PlatformError } from "@effect/platform/Error";
import { PlainTextFile } from "./plainTextFile";
import { JSONFile, JSONValue } from "./jsonFile";

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
    packageRoot: string;
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

function findNearestPackageJson(
  directoryPath: string,
): Effect.Effect<string, PlatformError, Path.Path | FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;

    const dirName = path.dirname(directoryPath);
    const pkgPath = path.join(dirName, "package.json");
    const exists = yield* fs.exists(pkgPath);
    return exists
      ? yield* Effect.succeed(dirName)
      : yield* findNearestPackageJson(dirName);
  });
}

export const RepoReaderLive = ({
  messagesDir,
  defaultLocale,
}: {
  messagesDir: string;
  defaultLocale: string;
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
          Effect.map((path) => path.trim()),
        ),
        packageRoot: findNearestPackageJson(messagesDir),
        derivedLocales: Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const files = yield* fs.readDirectory(messagesDir);
          const localeFiles = files
            .filter((file) => file.endsWith(".json"))
            .filter((f) => f !== `${defaultLocale}.json`)
            .filter((f) => f !== `meta.json`);

          return localeFiles;
        }),
      }),
      Effect.map(({ gitRepoRoot, packageRoot, derivedLocales, fs }) =>
        RepoReader.of({
          gitRepoRoot,
          packageRoot,
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
      Effect.tap((repo) => Effect.logDebug("Initalized repo", repo)),
      Effect.withLogSpan("RepoReader"),
    ),
  );
