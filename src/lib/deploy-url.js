export function deployUrl(hostname, files) {
  if (files.length === 1 && files[0] !== 'index.html' && !files[0].includes('/')) {
    return { url: `https://${hostname}/${files[0]}` };
  }

  if (files.includes('index.html')) {
    return { url: `https://${hostname}/` };
  }

  return {
    url: `https://${hostname}/`,
    warning: 'no index.html at root — this URL may not render'
  };
}
