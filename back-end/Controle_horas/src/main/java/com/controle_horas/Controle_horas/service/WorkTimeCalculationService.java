package com.controle_horas.Controle_horas.service;

import com.controle_horas.Controle_horas.entity.CloseReason;
import com.controle_horas.Controle_horas.entity.WorkLog;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class WorkTimeCalculationService {

    public static final ZoneId DISPLAY_ZONE = ZoneId.of("America/Sao_Paulo");

    public int sumClosedWorkedMinutes(List<WorkLog> workLogs) {
        return workLogs.stream()
                .filter(this::isClosed)
                .mapToInt(this::workedMinutes)
                .sum();
    }

    public int sumWorkedMinutesIncludingOpen(List<WorkLog> workLogs, Instant now) {
        int closedMinutes = sumClosedWorkedMinutes(workLogs);
        int openMinutes = workLogs.stream()
                .filter(workLog -> workLog.getExitAt() == null && workLog.getEntryAt() != null)
                .mapToInt(workLog -> Math.max(
                        0,
                        Math.toIntExact(Duration.between(workLog.getEntryAt(), now).toMinutes())))
                .sum();
        return closedMinutes + openMinutes;
    }

    public int sumWorkedMinutesOnDate(List<WorkLog> workLogs, LocalDate date) {
        return sumClosedWorkedMinutesByDisplayDate(workLogs).getOrDefault(date, 0);
    }

    public Map<LocalDate, Integer> sumClosedWorkedMinutesByDisplayDate(List<WorkLog> workLogs) {
        Map<LocalDate, Integer> minutesByDate = new LinkedHashMap<>();
        for (WorkLog workLog : workLogs) {
            if (!isClosed(workLog) || workLog.getEntryAt() == null) {
                continue;
            }
            addPartitionedMinutes(minutesByDate, workLog.getEntryAt(), workLog.getExitAt());
        }
        return minutesByDate;
    }

    public boolean isWorkDay(LocalDate date, Set<DayOfWeek> workDays) {
        if (date == null || workDays == null || workDays.isEmpty()) {
            return false;
        }
        return workDays.contains(date.getDayOfWeek());
    }

    public int effectiveDailyWorkloadMinutes(LocalDate date, int dailyWorkloadMinutes, Set<DayOfWeek> workDays) {
        if (!isWorkDay(date, workDays)) {
            return 0;
        }
        return dailyWorkloadMinutes;
    }

    public int calculateDailyBalanceMinutes(int workedMinutes, int dailyWorkloadMinutes) {
        return workedMinutes - dailyWorkloadMinutes;
    }

    public int calculateDailyBalanceMinutes(
            int workedMinutes,
            LocalDate date,
            int dailyWorkloadMinutes,
            Set<DayOfWeek> workDays) {
        int effectiveWorkload = effectiveDailyWorkloadMinutes(date, dailyWorkloadMinutes, workDays);
        return calculateDailyBalanceMinutes(workedMinutes, effectiveWorkload);
    }

    public int sumPausedMinutes(List<WorkLog> dayWorkLogs) {
        List<WorkLog> orderedLogs = dayWorkLogs.stream()
                .sorted(Comparator.comparing(WorkLog::getEntryAt))
                .toList();

        int pausedMinutes = 0;
        for (int index = 0; index < orderedLogs.size(); index++) {
            WorkLog workLog = orderedLogs.get(index);
            CloseReason closeReason = workLog.getCloseReason();
            if (closeReason == null || !closeReason.isTemporaryBreak() || workLog.getExitAt() == null) {
                continue;
            }
            if (index + 1 >= orderedLogs.size()) {
                continue;
            }
            WorkLog nextLog = orderedLogs.get(index + 1);
            pausedMinutes += Math.toIntExact(Duration.between(workLog.getExitAt(), nextLog.getEntryAt()).toMinutes());
        }
        return pausedMinutes;
    }

    public Instant calculateExpectedExitAt(List<WorkLog> dayWorkLogs, int dailyWorkloadMinutes) {
        return calculateExpectedExitAt(dayWorkLogs, dailyWorkloadMinutes, false, 0);
    }

    public Instant calculateExpectedExitAt(
            List<WorkLog> dayWorkLogs,
            int dailyWorkloadMinutes,
            boolean lunchEnabled,
            int lunchDurationMinutes) {
        Instant firstEntry = dayWorkLogs.stream()
                .map(WorkLog::getEntryAt)
                .filter(Objects::nonNull)
                .min(Comparator.naturalOrder())
                .orElse(null);

        if (firstEntry == null) {
            return null;
        }

        int pausedMinutes = sumPausedMinutes(dayWorkLogs);
        int plannedLunchMinutes = 0;
        if (lunchEnabled && lunchDurationMinutes > 0 && !hasLunchClose(dayWorkLogs)) {
            plannedLunchMinutes = lunchDurationMinutes;
        }

        return firstEntry
                .plus(Duration.ofMinutes(dailyWorkloadMinutes))
                .plus(Duration.ofMinutes(pausedMinutes))
                .plus(Duration.ofMinutes(plannedLunchMinutes));
    }

    public Instant calculateExpectedExitAt(
            List<WorkLog> dayWorkLogs,
            LocalDate date,
            int dailyWorkloadMinutes,
            Set<DayOfWeek> workDays) {
        return calculateExpectedExitAt(
                dayWorkLogs, date, dailyWorkloadMinutes, workDays, false, 0);
    }

    public Instant calculateExpectedExitAt(
            List<WorkLog> dayWorkLogs,
            LocalDate date,
            int dailyWorkloadMinutes,
            Set<DayOfWeek> workDays,
            boolean lunchEnabled,
            int lunchDurationMinutes) {
        int effectiveWorkload = effectiveDailyWorkloadMinutes(date, dailyWorkloadMinutes, workDays);
        return calculateExpectedExitAt(
                dayWorkLogs, effectiveWorkload, lunchEnabled, lunchDurationMinutes);
    }

    public int calculateHourBankMinutes(
            List<WorkLog> allWorkLogs,
            int dailyWorkloadMinutes,
            Set<DayOfWeek> workDays,
            LocalDate fromDate,
            LocalDate untilDate) {
        if (fromDate == null || untilDate == null || fromDate.isAfter(untilDate)) {
            return 0;
        }

        Map<LocalDate, List<WorkLog>> logsByDate = groupByDisplayDate(allWorkLogs);
        Map<LocalDate, Integer> workedMinutesByDate = sumClosedWorkedMinutesByDisplayDate(allWorkLogs);
        int hourBankMinutes = 0;

        for (LocalDate date = fromDate; !date.isAfter(untilDate); date = date.plusDays(1)) {
            List<WorkLog> dayLogs = logsByDate.getOrDefault(date, List.of());
            boolean pastDay = date.isBefore(untilDate);
            int effectiveWorkload = effectiveDailyWorkloadMinutes(date, dailyWorkloadMinutes, workDays);
            int workedMinutes = workedMinutesByDate.getOrDefault(date, 0);

            if (dayLogs.isEmpty()) {
                if (workedMinutes > 0 && pastDay) {
                    hourBankMinutes += calculateDailyBalanceMinutes(workedMinutes, effectiveWorkload);
                } else if (pastDay && effectiveWorkload > 0) {
                    hourBankMinutes -= effectiveWorkload;
                }
                continue;
            }

            if (!isDayComplete(dayLogs)) {
                if (pastDay) {
                    hourBankMinutes += calculateDailyBalanceMinutes(workedMinutes, effectiveWorkload);
                }
                continue;
            }

            hourBankMinutes += calculateDailyBalanceMinutes(workedMinutes, effectiveWorkload);
        }

        return hourBankMinutes;
    }

    public boolean isDayComplete(List<WorkLog> dayLogs) {
        if (dayLogs == null || dayLogs.isEmpty()) {
            return false;
        }
        if (hasOpenWorkLog(dayLogs)) {
            return false;
        }
        CloseReason lastCloseReason = dayLogs.stream()
                .filter(this::isClosed)
                .max(Comparator.comparing(WorkLog::getExitAt))
                .map(WorkLog::getCloseReason)
                .orElse(null);
        return lastCloseReason == null || !lastCloseReason.isTemporaryBreak();
    }

    public Map<LocalDate, List<WorkLog>> groupByDisplayDate(List<WorkLog> workLogs) {
        Map<LocalDate, List<WorkLog>> logsByDate = new LinkedHashMap<>();
        for (WorkLog workLog : workLogs) {
            LocalDate date = toDisplayDate(workLog.getEntryAt());
            logsByDate.computeIfAbsent(date, ignored -> new ArrayList<>()).add(workLog);
        }
        return logsByDate;
    }

    public LocalDate toDisplayDate(Instant instant) {
        return instant.atZone(DISPLAY_ZONE).toLocalDate();
    }

    public boolean hasOpenWorkLog(List<WorkLog> workLogs) {
        return workLogs.stream().anyMatch(workLog -> workLog.getExitAt() == null);
    }

    public boolean isClosed(WorkLog workLog) {
        return workLog.getExitAt() != null;
    }

    private boolean hasLunchClose(List<WorkLog> dayWorkLogs) {
        return dayWorkLogs.stream()
                .map(WorkLog::getCloseReason)
                .anyMatch(reason -> reason == CloseReason.LUNCH);
    }

    private void addPartitionedMinutes(
            Map<LocalDate, Integer> minutesByDate,
            Instant start,
            Instant end) {
        Instant cursor = start;
        while (cursor.isBefore(end)) {
            LocalDate date = toDisplayDate(cursor);
            Instant nextMidnight = date.plusDays(1).atStartOfDay(DISPLAY_ZONE).toInstant();
            Instant segmentEnd = end.isBefore(nextMidnight) ? end : nextMidnight;
            int minutes = Math.toIntExact(Duration.between(cursor, segmentEnd).toMinutes());
            if (minutes > 0) {
                minutesByDate.merge(date, minutes, Integer::sum);
            }
            cursor = segmentEnd;
        }
    }

    private int workedMinutes(WorkLog workLog) {
        return Math.toIntExact(Duration.between(workLog.getEntryAt(), workLog.getExitAt()).toMinutes());
    }
}
