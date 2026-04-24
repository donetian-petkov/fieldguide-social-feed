export function toJobId(...parts: string[]) {
  return parts
    .flatMap((part) => part.split(':'))
    .map((part) => part.trim().replace(/[^a-zA-Z0-9_-]+/g, '-'))
    .filter(Boolean)
    .join('-');
}
