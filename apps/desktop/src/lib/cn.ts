import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Shadcn-standard className combiner.
 *
 * `clsx` resolves arrays / objects / falsy values into a single string,
 * then `twMerge` deduplicates conflicting Tailwind classes (e.g.
 * `cn("p-2", "p-4")` → `"p-4"`). Without `twMerge`, both classes would
 * land on the element and the resolved order would depend on stylesheet
 * insertion — flaky and impossible to override in props.
 *
 * Every Shadcn primitive expects `cn` to exist at this path; matching
 * the conventional name + location keeps v0-generated components
 * importable without rewrites.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
