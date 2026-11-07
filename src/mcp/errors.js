export function okResult(structuredContent, text) {
  return {
    content: [{ type: 'text', text }],
    structuredContent
  };
}

export function errorResult(code, message, hint, detail) {
  return {
    isError: true,
    // Clients show only this text for errors (structuredContent is dropped),
    // so the code must be in it for agents to branch on.
    content: [{ type: 'text', text: [`${code}: ${message}`, hint].filter(Boolean).join(' ') }],
    structuredContent: {
      code,
      message,
      ...(hint ? { hint } : {}),
      ...(detail ? { detail } : {})
    }
  };
}
