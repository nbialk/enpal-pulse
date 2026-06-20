/**
 * Question-led section: poses one of the homeowner's real questions as the
 * heading, answers it in plain language, and shows the chart as evidence.
 */
export function Section({
  question,
  answer,
  children,
  className = "",
}: {
  question: string;
  answer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-border bg-card p-5 ${className}`}
    >
      <h2 className="text-base font-semibold tracking-tight">{question}</h2>
      {answer && (
        <p className="mt-1 text-sm text-muted-foreground">{answer}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}
