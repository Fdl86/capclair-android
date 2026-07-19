export function normalizeSofiaText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n')
    .replace(/^\s*SIA France\s*-\s*SOFIA-Briefing\s+\d+\/\d+\s*$/gim, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

export function compactWhitespace(value: string) {
  return value.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, ' ').trim();
}
