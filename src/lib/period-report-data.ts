import { parseAnalysisRankFilter, type AnalysisRankFilter } from "@/lib/analysis-rank-filter";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parsePeriodReportAggregates, PeriodReportDataError } from "@/lib/period-report-aggregates";
import type { WeeklyReportPeriod } from "@/lib/weekly-report";
import { parsePeriodReportEnvironment } from "@/lib/period-report-environment";

export async function getPeriodReportAggregates(current: WeeklyReportPeriod, previous: WeeklyReportPeriod, rankFilter: AnalysisRankFilter = "all", environmentFilter?: string | null) {
  const rank = parseAnalysisRankFilter(rankFilter);
  const environment = parsePeriodReportEnvironment(environmentFilter);
  const supabase = await createSupabaseServerClient();
  let response;
  try {
    response = await supabase.rpc(environment ? "get_period_report_aggregates_v3" : rank === "all" ? "get_period_report_aggregates_v1" : "get_period_report_aggregates_v2", {
      ...(environment ? { p_environment_id: environment, p_rank_filter: rank } : rank === "all" ? {} : { p_rank_filter: rank }),
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
