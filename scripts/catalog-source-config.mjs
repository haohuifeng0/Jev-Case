export const catalogRepository = "https://github.com/haohuifeng0/awesome-jev";
export const catalogRemote = `${catalogRepository}.git`;

export function catalogRawUrl(commit) {
  return `https://raw.githubusercontent.com/haohuifeng0/awesome-jev/${commit}/catalog.json`;
}
