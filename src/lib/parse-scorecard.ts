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

  // Strategy 3: extract the first COMPLETE JSON object by tracking brace depth
  // (greedy regex \{[\s\S]*\} fails when AI returns two objects back-to-back)
  let block = "";
  const startIdx = fenceStripped.indexOf("{");
  if (startIdx === -1) {
    throw new Error(
      "Scorecard: no JSON object found in response. Preview: " +
        raw.substring(0, 200)
    );
  }
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startIdx; i < fenceStripped.length; i++) {
    const ch = fenceStripped[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (!inString) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          block = fenceStripped.slice(startIdx, i + 1);
          break;
        }
      }
    }
  }
  if (!block) block = fenceStripped.slice(startIdx); // fallback: take everything

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
