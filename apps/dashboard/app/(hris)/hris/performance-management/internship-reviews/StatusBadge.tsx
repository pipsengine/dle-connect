export default function InternshipStatusBadge({ status }: { status: string }) {
  const slug = status.toLowerCase().replaceAll(' ', '-');
  return <span className={`status s-${slug}`}>{status}</span>;
}
