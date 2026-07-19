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
        Instant firstEntry = dayWorkLogs.stream()
                .map(WorkLog::getEntryAt)
                .filter(Objects::nonNull)
                .min(Comparator.naturalOrder())
                .orElse(null);

        if (firstEntry == null) {
            return null;
        }

        int pausedMinutes = sumPausedMinutes(dayWorkLogs);
        return firstEntry
                .plus(Duration.ofMinutes(dailyWorkloadMinutes))
                .plus(Duration.ofMinutes(pausedMinutes));
    }

    public Instant calculateExpectedExitAt(
            List<WorkLog> dayWorkLogs,
            LocalDate date,
            int dailyWorkloadMinutes,
            Set<DayOfWeek> workDays) {
        int effectiveWorkload = effectiveDailyWorkloadMinutes(date, dailyWorkloadMinutes, workDays);
        return calculateExpectedExitAt(dayWorkLogs, effectiveWorkload);
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
        int hourBankMinutes = 0;

        for (LocalDate date = fromDate; !date.isAfter(untilDate); date = date.plusDays(1)) {
            List<WorkLog> dayLogs = logsByDate.getOrDefault(date, List.of());
            boolean pastDay = date.isBefore(untilDate);
            int effectiveWorkload = effectiveDailyWorkloadMinutes(date, dailyWorkloadMinutes, workDays);

            if (dayLogs.isEmpty()) {
                if (pastDay && effectiveWorkload > 0) {
                    hourBankMinutes -= effectiveWorkload;
                }
                continue;
            }

            if (!isDayComplete(dayLogs)) {
                continue;
            }

            int workedMinutes = sumClosedWorkedMinutes(dayLogs);
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

    private int workedMinutes(WorkLog workLog) {
        return Math.toIntExact(Duration.between(workLog.getEntryAt(), workLog.getExitAt()).toMinutes());
    }
}
