import { CircleParking } from 'lucide-react';
import { StatCard } from '@dm3/ui';
import { usePlugin } from '../hooks/usePlugin';

export function ParkingStatChip(): React.ReactElement | null {
  const parkingEnabled = usePlugin('parking');

  if (!parkingEnabled) {
    return null;
  }

  return (
    <div
      data-testid="dashboard-section-parking-chip"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6"
    >
      <StatCard
        label="Parking"
        value="78%"
        sub="312 / 400 spots"
        trend={{ direction: 'up', text: '5% from last week' }}
        icon={<CircleParking size={14} />}
        domain="operate"
      />
    </div>
  );
}
