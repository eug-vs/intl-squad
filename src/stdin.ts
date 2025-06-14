import { Effect, pipe, Stream } from "effect";
import { Readable } from "stream";
import fs from "fs";
import tty from "tty";

const nodeStreamToEffectStream = (s: typeof process.stdin) => {
  const stdin = Readable.toWeb(s);
  const stream = Stream.fromReadableStream({
    evaluate: () => stdin as ReadableStream,
    onError: (error) => error,
  });
  return stream;
};

// Handle input from TTY in case we have piped output to stdin
export const getStdinStream = (source: "stdin" | "tty") =>
  pipe(
    source === "stdin"
      ? Effect.succeed(process.stdin)
      : Effect.acquireRelease(
          Effect.sync(
            () =>
              new tty.ReadStream(
                fs.openSync("/dev/tty", "r"),
              ) as typeof process.stdin,
          ),
          (fd) => Effect.sync(() => fd.close()),
        ),
    Effect.map(nodeStreamToEffectStream),
  );
