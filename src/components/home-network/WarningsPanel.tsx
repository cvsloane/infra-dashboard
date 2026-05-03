import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface WarningsPanelProps {
  title?: string;
  warnings: string[];
}

export function WarningsPanel({ title = 'Warnings', warnings }: WarningsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {warnings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active warnings.</p>
        ) : (
          <ul className="space-y-2">
            {warnings.map((warning) => (
              <li key={warning} className="flex gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-300" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
