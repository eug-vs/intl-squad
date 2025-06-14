import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect, Logger, LogLevel, Match, pipe } from "effect";
import _ from "lodash";
import { projectConfig } from "../config";
import { runExtractor } from "./extractor";
import { runTranslator } from "./translator";

NodeRuntime.runMain(
  pipe(
    Match.value(process.argv[2]).pipe(
      Match.when("extractor", () => runExtractor(projectConfig)),
      Match.when("translator", () => runTranslator(projectConfig)),
      Match.orElseAbsurd,
    ),
    Effect.tapError(Effect.logError),
    Effect.tap(() => Effect.logDebug("Exiting")),
    Effect.scoped,
    Logger.withMinimumLogLevel(LogLevel.Debug),
    Effect.provide(NodeContext.layer),
  ),
);
