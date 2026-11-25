import { JobReleaseDetail } from '../../../galvanizing-job-release';

export default async function GalvanizingReleaseDetailPage({ params }: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await params;
  return <JobReleaseDetail releaseId={releaseId} />;
}
