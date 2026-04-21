export type NotificationAlertType =
  | 'HIGH_FAILURE_RATIO'
  | 'SILENT_DELIVERY_SKIP'
  | 'RESOLUTION_ANOMALY';

export interface NotificationAlert {
  type: NotificationAlertType;
  severity: 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface NotificationAlertsResult {
  alerts: NotificationAlert[];
  checkedCount: number;
}
