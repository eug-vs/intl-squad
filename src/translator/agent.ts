import { generateObject } from "ai";
import dedent from "dedent";
import z from "zod";
import { model, runAgent } from "../ai";
import { JSONValue } from "../repo/jsonFile";
import { GlossaryFile } from "../repo/repoReader";

const schema = z.object({
  locale: z.string(),
  messages: z
    .any()
    .describe("JSON with translated messages, same format as in input")
    .transform((json) => JSONValue(json)),
  glossaryUpdate: z
    .record(z.string())
    .describe(
      "JSON object that should be added into existing glossary for future re-use. Keys are entity/concept names in English, values are preferred translations, optionally with other metadata.",
    )
    .transform((json) => JSONValue(json))
    .optional(),
  notes: z
    .string()
    .describe(
      "Put important notes here, possible issues that need to be reviewed, things you are unsure of. DO NOT put summary of your actions here.",
    ),
});

export function translate(args: {
  projectContext: string;
  glossaries: GlossaryFile[];
  messagesToTranslate: JSONValue;
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
              You are a specialized translation engine designed to accurately convert JSON files containing ICU messages into the requested locales. Your role is to ensure that each translation respects the application's context and glossary, maintaining consistency and meaning.

              CORE CAPABILITIES:
              • Process and parse JSON files containing ICU messages.
              • Accurately translate text into various locales by applying both linguistic expertise and contextual understanding.
              • Utilize your domain knowledge of ICU messages and internationalization standards.

              BEHAVIORAL GUIDELINES:
              • Verify that each translation accurately reflects the original meaning and respects the provided glossary and the context of the application.
              • When encountering ambiguous context, request clarification or default to the most common or contextually relevant interpretation.
              • Handle errors gracefully, logging issues with format or content without compromising the overall JSON structure.
              • Update glossary for future disambiguation. Glossary acts like a "lock-file", ensuring consistency across application. All entities and concepts that project uses should go in glossary.

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
        ...args.glossaries.map(({ locale, json }) => ({
          role: "system" as const,
          content: `Requested locale: ${locale}\n${JSON.stringify(json)}`,
        })),
        {
          role: "system",
          content: JSON.stringify(args.messagesToTranslate),
        },
      ],
    }),
  );
}
