import { jsonrepair } from "jsonrepair";

/**
 * Robust scorecard JSON parser.
 *
 * LLMs frequently return JSON with issues:
 *   - Wrapped in markdown code fences
 *   - Single-quoted property names or string values
 *   - Trailing commas
 *   - Truncated (unclosed braces/brackets)
 *   - Literal "..." as a placeholder
 *   - Unescaped double-quotes inside string values (e.g. candidate quotes)
 *
 * This parser tries several repair strategies in order, falling back to
 * the battle-tested `jsonrepair` library as a final attempt before throwing.
 */
export function parseScorecardJSON(raw: string): any {
  if (!raw || typeof raw !== "string") {
    throw new Error("Scorecard raw response is empty");
  }

  // Strategy 1: raw parse (happy path)
  try {
    return JSON.parse(raw);
  } catch {}

  // Strategy 2: strip markdown code fences then parse
  const fenceStripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(fenceStripped);
  } catch {}

  // Strategy 3: extract the first {...} block
  const match = fenceStripped.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(
      "Scorecard: no JSON object found in response. Preview: " +
        raw.substring(0, 200)
    );
  }
  let block = match[0];

  try {
    return JSON.parse(block);
  } catch {}

  // Strategy 4: repair common LLM mistakes
  let fixed = block
    // Remove literal "..." placeholders
    .replace(/\.\.\./g, "")
    // Remove trailing commas before } or ]
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    // Remove trailing comma at end of object
    .replace(/,\s*$/, "");

  try {
    return JSON.parse(fixed);
  } catch {}

  // Strategy 5: convert single-quoted property names to double-quoted
  // { 'key': ... }   →   { "key": ... }
  // ,'key':          →   ,"key":
  fixed = fixed.replace(/([{,]\s*)'([^']+?)'(\s*:)/g, '$1"$2"$3');

  try {
    return JSON.parse(fixed);
  } catch {}

  // Strategy 6: convert single-quoted string values to double-quoted
  // :'value' → :"value"   (but don't break apostrophes inside double-quoted strings)
  // This is risky — only try if nothing else worked.
  fixed = fixed.replace(/:\s*'([^']*?)'/g, (_m, p1) => {
    // escape any existing double quotes inside the captured value
    return `: "${p1.replace(/"/g, '\\"')}"`;
  });

  try {
    return JSON.parse(fixed);
  } catch {}

  // Strategy 7: close any unclosed braces/brackets (truncated response)
  const openBraces = (fixed.match(/{/g) || []).length;
  const closeBraces = (fixed.match(/}/g) || []).length;
  const openBrackets = (fixed.match(/\[/g) || []).length;
  const closeBrackets = (fixed.match(/]/g) || []).length;
  for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += "]";
  for (let i = 0; i < openBraces - closeBraces; i++) fixed += "}";

  try {
    return JSON.parse(fixed);
  } catch {}

  // Strategy 8: jsonrepair (battle-tested library — handles unescaped quotes
  // inside strings, missing commas, and many other LLM-generated JSON issues)
  try {
    const repaired = jsonrepair(block);
    return JSON.parse(repaired);
  } catch {}

  // Last resort: try jsonrepair on the raw input (in case extract failed)
  try {
    const repaired = jsonrepair(raw);
    return JSON.parse(repaired);
  } catch (finalErr) {
    throw new Error(
      `Scorecard JSON parse failed after all repair strategies. ` +
        `Original error: ${(finalErr as Error).message}. ` +
        `Preview: ${block.substring(0, 300)}`
    );
  }
}
