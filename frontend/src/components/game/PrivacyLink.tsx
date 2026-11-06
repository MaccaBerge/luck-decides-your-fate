import { Link } from "react-router-dom";

export function PrivacyLink() {
  return (
    <Link
      to="/privacy"
      className="inline-flex min-h-11 items-center px-2 text-sm text-ink-muted underline underline-offset-3 hover:text-ink"
    >
      Privacy
    </Link>
  );
}
