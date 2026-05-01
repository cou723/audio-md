interface Props {
  message: string | null;
}

export function ErrorBanner({ message }: Props) {
  if (!message) return null;
  return <div id="error-banner" style={{ display: "block" }}>{message}</div>;
}
