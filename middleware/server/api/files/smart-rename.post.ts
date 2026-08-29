import {
  defineEventHandler,
  readBody,
  createError,
  getCookie,
  getHeader,
} from "h3";
import type { H3Event } from "h3";
import { getDownloadsRoot } from "../../utils/remoteMounts";
import { resolveSafe } from "../../utils/files";
import { getConfig } from "../../utils/database";
import {
  getSmartRenameSuggestion,
  buildProviderPreferredLocales,
  normalizeLocale,
} from "../../services/smart-rename";

const LOCALE_COOKIE_KEY = "sark-lang";

function parseAcceptLanguage(headerValue?: string): string[] {
  if (!headerValue) return [];
  return headerValue
    .split(",")
    .map((chunk) => normalizeLocale(chunk))
    .filter((v): v is string => Boolean(v));
}

function getPreferredLocales(event: H3Event): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (candidate?: string | null) => {
    if (!candidate) return;
    const normalized = normalizeLocale(candidate);
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };

  const localeHeader = getHeader(event, "x-transmule-locale");
  if (typeof localeHeader === "string") {
    for (const chunk of localeHeader.split(",")) push(chunk);
  }

  push(getCookie(event, LOCALE_COOKIE_KEY));

  const acceptLanguageHeader = getHeader(event, "accept-language");
  if (typeof acceptLanguageHeader === "string") {
    for (const locale of parseAcceptLanguage(acceptLanguageHeader)) {
      push(locale);
    }
  }

  push("en");
  return out;
}

export default defineEventHandler(async (event) => {
  requireUser(event);

  const root = getDownloadsRoot();
  const requestPreferredLocales = getPreferredLocales(event);
  const tmdbPreferredLocales = buildProviderPreferredLocales(
    normalizeLocale(getConfig("tmdb_locale") ?? ""),
    requestPreferredLocales,
  );
  const tvdbPreferredLocales = buildProviderPreferredLocales(
    normalizeLocale(getConfig("tvdb_locale") ?? ""),
    requestPreferredLocales,
  );
  const body = await readBody<{
    paths: string[];
    includeCleanup?: boolean;
    includeIntegrations?: boolean;
  }>(event);

  const includeCleanup = body?.includeCleanup !== false;
  const includeIntegrations = body?.includeIntegrations !== false;

  if (!Array.isArray(body?.paths) || body.paths.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "paths must be a non-empty array",
    });
  }

  for (const p of body.paths) {
    resolveSafe(root, p);
  }

  const suggestions = await Promise.all(
    body.paths.map((relPath) =>
      getSmartRenameSuggestion(relPath, {
        tmdbPreferredLocales,
        tvdbPreferredLocales,
        includeCleanup,
        includeIntegrations,
      }),
    ),
  );

  return { suggestions };
});