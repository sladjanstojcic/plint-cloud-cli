export function computeChangeset(localFiles, remoteFiles) {
  const remoteByPath = new Map(remoteFiles.map((file) => [file.path, file]));
  const localPaths = new Set(localFiles.map((file) => file.path));
  const toUpload = [];
  let unchanged = 0;

  for (const file of localFiles) {
    const remote = remoteByPath.get(file.path);
    if (!remote || remote.size !== file.size || remote.checksum !== file.checksum) {
      toUpload.push(file);
    } else {
      unchanged += 1;
    }
  }

  const toDelete = remoteFiles
    .filter((file) => !localPaths.has(file.path))
    .map((file) => file.path)
    .sort();

  return { toUpload, toDelete, unchanged };
}
