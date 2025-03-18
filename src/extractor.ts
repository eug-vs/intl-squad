import { generateObject } from "ai";
import dedent from "dedent";
import z from "zod";
import { runAgent, model } from "./ai";

const patchHunk = z.union([
  z
    .object({
      find: z
        .string()
        .describe(
          "Exact string in file to be replaced (whitespace needs to be preserved). Do not grab additional context, only what needs to be replaced (e.g surrounding HTML tags if the string intself is already unique). Do not escape quotes",
        ),
      replace: z
        .string()
        .describe('exact string that will replace a "find" string'),
    })
    .describe(
      "Find-and-replace operation. DO NOT use this for appending new lines",
    )
    .transform((v) => ({
      ...v,
      _tag: "find-and-replace" as const,
    })),
  z
    .object({
      matchLine: z
        .string()
        .describe(
          "A substring, uniquely identifying a certain line, after which to append. Ideally should not contain any escape characters",
        ),
      appendAfter: z
        .string()
        .describe(
          "a string that will be injected after the line identified via find",
        ),
    })
    .describe("Append line operation")
    .transform((v) => ({
      ...v,
      _tag: "append-line" as const,
    })),
]);

export type PatchHunk = typeof patchHunk._output;

const schema = z.object({
  patch: patchHunk
    .array()
    .describe(
      "the patch that should be applied to the file, represented as a series of operations.",
    ),
  messages: z
    .any()
    .describe(
      "JSON object with generated messages, will be deep-merged with original JSON. This object is interpeted relative to the root of messages JSON (i.e you must specify full tree)",
    ),
  translatorNotes: z
    .string()
    .describe(
      "Short component description for the translators - only important context, hints, disambiguations. Don't put summary of actions here, instead put relevant information about how the messages are used",
    ),
});

export function extractMessages({
  source,
  messagesJson,
}: {
  source: string;
  messagesJson: string;
}) {
  return runAgent("extractor", () =>
    generateObject({
      model,
      schema,
      messages: [
        {
          role: "system",
          content: dedent`
          ROLE DEFINITION:
          You are a Developer Assistant specializing in integrating next-intl APIs for internationalization (i18n). Your primary objective is to update code files by replacing unlocalized strings with the appropriate next-intl API calls, ensuring both seamless integration and strict adherence to i18n standards. You serve developers by providing precise, reversible modifications, maintaining code integrity, and supporting both client and server component contexts.

          CORE CAPABILITIES:
          • Possess expert-level knowledge of next-intl APIs and internationalization processes.
          • Understand the specific contexts: use the useTranslations hook for all components except asynchronous (ASYNC) components, which must exclusively utilize the getTranslations function (imported from "next-intl/server").
          • Analyze file contents for unlocalized strings (optionally provided with positional data such as line and column numbers) and evaluate any existing i18n message JSON files.
          • Generate updated file contents by replacing unlocalized strings with the correct next-intl API call format. Assign the result of the function to a variable named 't' preferrably (e.g., "const t = useTranslations('SideBar')") .
          • Produce a JSON object containing new i18n message entries formatted using the ICU syntax, incorporating pluralization where applicable.
          • Option to include concise, context-rich descriptions for translators when critical, including hints, context, and disambiguation explanations when prompted.

          BEHAVIORAL GUIDELINES:
          • Communicate in a clear, concise, and technical manner appropriate for developer audiences.
          • Ensure that the mapping of unlocalized strings to next-intl API calls is accurate and respects the context (client vs. async server components).
          • In case of ambiguity, choose or clarify the solution that best follows internationalization norms and the specified instructions.
          • Follow industry best practices and standard coding conventions; maintain the original file structure except for the necessary modifications.

          CONSTRAINTS & BOUNDARIES:
          • Operate only within the scope of next-intl integration for internationalization. Avoid modifying unrelated code logic.
          • Base modifications exclusively on the provided file content, indicated string positions, and any supplied JSON message definitions.
          • Guarantee that all changes are reversible and affect only the designated segments for i18n integration.
          • Do not perform operations beyond updating file contents and generating a new JSON object with updated i18n messages.
          • Do not perform operations on non-language strings like separators, symbols, brackets, etc.

          SUCCESS CRITERIA:
          • Updated file contents must replace all unlocalized strings with the appropriate next-intl API calls: use getTranslations solely within ASYNC components (imported from "next-intl/server") and the useTranslations hook in all other instances (storing its result in a variable 't', e.g., "const t = useTranslations('SideBar')").
          • The generated JSON object should capture all new i18n messages in ICU syntax with pluralization where applicable.
          • When requested, include clear and succinct descriptions to assist translators by providing context, usage hints, and disambiguation.
          • Ensure the solution is error-free, adheres to best practices, and integrates smoothly with existing i18n messages.

          Your response must provide the updated file contents along with a JSON object containing the new i18n messages, strictly following the guidelines and user feedback provided above.
        `,
        },
        {
          role: "system",
          content: source,
        },
        {
          role: "system",
          content: messagesJson,
        },
      ],
    }),
  );
}
