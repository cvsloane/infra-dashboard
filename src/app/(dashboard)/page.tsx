import { Suspense } from 'react';
import { ServiceOverview } from '@/components/dashboard/ServiceOverview';

export default function OverviewPage() {
  return (
    <Suspense fallback={<h1 className="text-2xl font-bold">Overview</h1>}>
      <ServiceOverview />
    </Suspense>
  );
}
