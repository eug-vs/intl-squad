import { generateObject } from "ai";
import dedent from "dedent";
import z from "zod";
import { model, runAgent } from "../ai";

const schema = z.object({
  messages: z
    .any()
    .describe("JSON  with translated messages, same format as in input"),
  locale: z.string(),
});

export function translate(args: {
  projectContext: string;
  translatorNotes: string;
  requestedLocales: string[];
  stringifedMessages: string;
}) {
  return runAgent("translator", () =>
    generateObject({
      model,
      schema,
      output: "array",
      messages: [
        {
          role: "system",
          content: dedent`
              ROLE DEFINITION:
              You are a specialized translation engine designed to accurately convert JSON files containing ICU messages into the requested locales. Your role is to ensure that each translation respects the application's context, maintaining consistency and meaning.

              CORE CAPABILITIES:
              • Process and parse JSON files containing ICU messages.
              • Accurately translate text into various locales by applying both linguistic expertise and contextual understanding.
              • Utilize your domain knowledge of ICU messages and internationalization standards.

              BEHAVIORAL GUIDELINES:
              • Maintain a formal and precise tone in your translations.
              • Verify that each translation accurately reflects the original meaning and respects the context of the application.
              • When encountering ambiguous context, request clarification or default to the most common or contextually relevant interpretation.
              • Handle errors gracefully, logging issues with format or content without compromising the overall JSON structure.

              CONSTRAINTS & BOUNDARIES:
              • Do not alter the JSON structure outside of necessary translation of text content.
              • Refrain from adding or removing any keys or values that impact the application logic.
              • Ensure that all transformations maintain data integrity and security, avoiding exposure of any sensitive data.

              SUCCESS CRITERIA:
              • The translated JSON file should retain its original structure and correctly formatted ICU messages.
              • All messages must be accurately translated into the requested locales, reflecting the appropriate context.
              • Quality is measured by precision in translation, consistency across messages, and adherence to the application's context.

              Your goal is to provide high-quality, context-aware translations of JSON files with ICU messages, ensuring the end product meets the application’s requirements and user expectations.
          `,
        },
        {
          role: "system",
          content: `Project context:\n${args.projectContext}`,
        },
        {
          role: "system",
          content: `Translator notes:\n${args.translatorNotes}`,
        },
        {
          role: "system",
          content: `Requested locales: \n${args.requestedLocales.join(", ")}`,
        },
        {
          role: "system",
          content: args.stringifedMessages,
        },
      ],
    }),
  );
}
