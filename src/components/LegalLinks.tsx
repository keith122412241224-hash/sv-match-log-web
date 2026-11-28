import Link from "next/link";

export function FirstUseTerms() {
  return (
    <p className="text-sm leading-6 text-muted">
      初めて利用する方には、<Link className="font-semibold text-ink underline underline-offset-2" href="/terms">利用規約</Link>が適用されます。
    </p>
  );
}

export function LegalLinks() {
  return (
    <nav aria-label="規約・お問い合わせ" className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs font-semibold text-muted">
      <Link className="hover:text-ink hover:underline" href="/privacy">プライバシーポリシー</Link>
      <Link className="hover:text-ink hover:underline" href="/terms">利用規約</Link>
      <Link className="hover:text-ink hover:underline" href="/privacy#contact">お問い合わせ</Link>
    </nav>
  );
}
