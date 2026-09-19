"use client";

import { useState } from "react";
import { Input } from "@/components/Field";

export function AnalysisDateTimeField({
  name,
  label,
  value,
  defaultTime
}: {
  name: "playedFrom" | "playedTo";
  label: string;
  value: string;
  defaultTime: string;
}) {
  const [date, setDate] = useState(value.split("T")[0] ?? "");
  const [time, setTime] = useState(value.split("T")[1] || defaultTime);

  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-semibold text-ink">{label}（日本時間）</legend>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,7.5rem)] gap-2">
        <Input
          aria-label={`${label}の日付`}
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        <Input
          aria-label={`${label}の時刻（日本時間）`}
          type="time"
          step={60}
          value={time}
          required={Boolean(date)}
          onChange={(event) => setTime(event.target.value)}
        />
      </div>
      <input type="hidden" name={name} value={date && time ? `${date}T${time}` : ""} />
    </fieldset>
  );
}
