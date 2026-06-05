import React from 'react';

export function StatusRing({ status }: { status: 'green' | 'yellow' | 'red' | 'gray' }) {
  const colors = {
    green: 'border-green-500 bg-green-100',
    yellow: 'border-yellow-500 bg-yellow-100',
    red: 'border-red-500 bg-red-100',
    gray: 'border-gray-400 bg-gray-100',
  };
  return (
    <div className={`w-4 h-4 rounded-full border-2 ${colors[status]}`} title={status} />
  );
}
