export const slashless = (url: URL): string => url.toString().replace(/\/$/, '')
