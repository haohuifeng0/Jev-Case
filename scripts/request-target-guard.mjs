const encodedSeparator = /%(?:2f|5c)/i;
const malformedEscape = /%(?![0-9a-f]{2})/i;
const unsafeCharacter = /[<>\\\u0000-\u001f\u007f]/;

export function getSafeRequestTarget(rawTarget) {
  const target = toOriginForm(rawTarget);
  if (target === undefined || target === "*") return target;

  const queryIndex = target.indexOf("?");
  const rawPath = queryIndex === -1 ? target : target.slice(0, queryIndex);
  if (rawPath.startsWith("//") || malformedEscape.test(rawPath) || encodedSeparator.test(rawPath)) {
    return undefined;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch (error) {
    if (error instanceof URIError) return undefined;
    throw error;
  }

  if (unsafeCharacter.test(decodedPath)) return undefined;
  if (decodedPath.split("/").some((segment) => segment === "." || segment === "..")) {
    return undefined;
  }
  return target;
}

function toOriginForm(rawTarget) {
  if (rawTarget === "*") return rawTarget;
  if (rawTarget.startsWith("/")) return rawTarget.includes("#") ? undefined : rawTarget;

  const absolute = rawTarget.match(/^https?:\/\/[^/?#]+(\/[^?#]*)?(\?[^#]*)?$/i);
  if (absolute === null) return undefined;
  return `${absolute[1] ?? "/"}${absolute[2] ?? ""}`;
}
