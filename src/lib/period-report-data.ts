import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parsePeriodReportAggregates, PeriodReportDataError } from "@/lib/period-report-aggregates";
import type { WeeklyReportPeriod } from "@/lib/weekly-report";

export async function getPeriodReportAggregates(current: WeeklyReportPeriod, previous: WeeklyReportPeriod) {
  const supabase = await createSupabaseServerClient();
  let response;
  try {
    response = await supabase.rpc("get_period_report_aggregates_v1", {
      p_current_start: current.startIso, p_current_end: current.endIso,
      p_previous_start: previous.startIso, p_previous_end: previous.endIso
    });
  } catch {
    throw new PeriodReportDataError("database");
  }
  if (response.error) {
    const code = response.error.code;
    throw new PeriodReportDataError(code === "PGRST202" || code === "42883" ? "missing_rpc"
      : code === "42501" || code === "PGRST301" ? "permission" : "database");
  }
  return parsePeriodReportAggregates(response.data);
}
