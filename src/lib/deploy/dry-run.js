export function dryRunPayload({ project, created, generated = false, scanSummary, changeset = null }) {
  return {
    dry_run: true,
    project,
    created,
    generated,
    would_create_binding: created,
    file_count: scanSummary.file_count,
    bytes: scanSummary.bytes,
    warnings: scanSummary.warnings,
    uploaded: changeset ? changeset.toUpload.length : scanSummary.file_count,
    deleted: changeset ? changeset.toDelete.length : 0,
    unchanged: changeset ? changeset.unchanged : 0
  };
}
