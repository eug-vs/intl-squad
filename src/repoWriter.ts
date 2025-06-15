import { Context, Effect, Layer, Match, pipe, Pool } from "effect";
import { FileSystem } from "@effect/platform";
import { formatGitDiff, formatPatch } from "./git";
import _ from "lodash";

/**
 * This tag defines *how* writes to the repo files occur
 */
export class RepoWriter extends Context.Tag("RepoWriter")<
  RepoWriter,
  {
    updateFile(path: string, newContents: string): Effect.Effect<void>;
    provideSummary(summary: {
      subject: string;
      body?: string;
    }): Effect.Effect<void>;
  }
>() {}

/**
 * Manages repo writes as creation of scoped patch files
 */
class PatchWriter {
  public fileUpdates: Record<string, string> = {};
  public metadata: NonNullable<Parameters<typeof formatPatch>[1]> = {};
  constructor(author: string) {
    this.metadata.author = author;
  }

  updateFile(path: string, newContents: string) {
    return pipe(
      Effect.sync(() => {
        this.fileUpdates[path] = newContents;
      }),
      Effect.tap(() => Effect.log(`Update file ${path}`)),
    );
  }
  provideSummary({ subject, body }: { subject: string; body?: string }) {
    return Effect.sync(() => {
      this.metadata.subject = subject;
      this.metadata.body = body;
    });
  }
  savePatch() {
    const savePath = `/tmp/${_.snakeCase(this.metadata.subject)}.patch`;
    return pipe(
      Effect.forEach(
        Object.entries(this.fileUpdates),
        ([path, newContents]) => formatGitDiff(path, newContents),
        { concurrency: "unbounded" },
      ),
      Effect.map((diffs) => formatPatch(diffs, this.metadata)),
      Effect.tap(() => Effect.log(`Saving patch to ${savePath}`)),
      Effect.flatMap((patch) =>
        pipe(
          FileSystem.FileSystem,
          Effect.flatMap((fs) => fs.writeFileString(savePath, patch)),
        ),
      ),
    );
  }
}

export const makePatchWriterLayer = (author: string) =>
  Layer.scoped(
    RepoWriter,
    pipe(
      Effect.acquireRelease(
        Effect.sync(() => new PatchWriter(author)),
        (patchWriter) =>
          pipe(
            patchWriter.savePatch(),
            Effect.orElseSucceed(() =>
              Effect.logError(`Could not save patch :(`),
            ),
          ),
      ),
      Effect.withLogSpan(`patch-writer`),
    ),
  );
