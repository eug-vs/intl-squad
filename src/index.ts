import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect, Logger, LogLevel, Match, pipe } from "effect";
import _ from "lodash";
import { runExtractor } from "./extractor";
import { runTranslator } from "./translator";
import { RepoReaderLive } from "./repoReader";

NodeRuntime.runMain(
  pipe(
    Match.value(process.argv[2]).pipe(
      Match.when("extractor", runExtractor),
      Match.when("translator", runTranslator),
      Match.orElseAbsurd,
    ),
    Effect.provide(
      RepoReaderLive({
        messagesDir:
          "/home/eug-vs/Documents/Projects/1moment.io/apps/web/src/messages/",
        eslintRoot: "/home/eug-vs/Documents/Projects/1moment.io/apps/web",
        defaultLocale: "en",
        derivedLocales: ["ru", "pl", "uk", "de"],
      }),
    ),
    Effect.tapError(Effect.logError),
    Effect.tap(() => Effect.logDebug("Exiting")),
    Effect.tap(
      Effect.logInfo(
        "Patches generated, apply them with `git am --3way /tmp/*.patch`",
      ),
    ),
    Effect.scoped,
    Logger.withMinimumLogLevel(LogLevel.Debug),
    Effect.provide(NodeContext.layer),
  ),
);
