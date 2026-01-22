'use client';

import { useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface DeploymentLogsProps {
  logs: string | null;
  title?: string;
  autoScroll?: boolean;
}

// Simple ANSI color code to CSS class mapping
const ansiToClass: Record<string, string> = {
  '30': 'text-gray-900 dark:text-gray-100',
  '31': 'text-red-500',
  '32': 'text-green-500',
  '33': 'text-yellow-500',
  '34': 'text-blue-500',
  '35': 'text-purple-500',
  '36': 'text-cyan-500',
  '37': 'text-gray-300',
  '90': 'text-gray-500',
  '91': 'text-red-400',
  '92': 'text-green-400',
  '93': 'text-yellow-400',
  '94': 'text-blue-400',
  '95': 'text-purple-400',
  '96': 'text-cyan-400',
  '97': 'text-white',
};

function parseAnsiLine(line: string): { text: string; className: string }[] {
  const parts: { text: string; className: string }[] = [];
  const regex = /\x1b\[([0-9;]*)m/g;

  let lastIndex = 0;
  let currentClass = '';
  let match;

  while ((match = regex.exec(line)) !== null) {
    // Add text before this code
    if (match.index > lastIndex) {
      parts.push({
        text: line.slice(lastIndex, match.index),
        className: currentClass,
      });
    }

    // Update current class
    const codes = match[1].length > 0 ? match[1].split(';') : ['0'];
    for (const code of codes) {
      if (code === '0' || code === '39') {
        currentClass = '';
      } else if (ansiToClass[code]) {
        currentClass = ansiToClass[code];
      }
    }

    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < line.length) {
    parts.push({
      text: line.slice(lastIndex),
      className: currentClass,
    });
  }

  return parts.length > 0 ? parts : [{ text: line, className: '' }];
}

export function DeploymentLogs({ logs, title = 'Deployment Logs', autoScroll = true }: DeploymentLogsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleCopy = async () => {
    if (logs) {
      await navigator.clipboard.writeText(logs);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (logs) {
      const blob = new Blob([logs], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `deployment-logs-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const lines = logs?.split('\n') || [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy} disabled={!logs}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={!logs}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] w-full rounded-md border bg-black p-4" ref={scrollRef}>
          <pre className="font-mono text-xs text-gray-300">
            {lines.length > 0 ? (
              lines.map((line, i) => (
                <div key={i} className="hover:bg-white/5">
                  <span className="text-gray-500 select-none mr-4">
                    {String(i + 1).padStart(4, ' ')}
                  </span>
                  {parseAnsiLine(line).map((part, j) => (
                    <span key={j} className={part.className}>
                      {part.text}
                    </span>
                  ))}
                </div>
              ))
            ) : (
              <span className="text-gray-500">No logs available</span>
            )}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
