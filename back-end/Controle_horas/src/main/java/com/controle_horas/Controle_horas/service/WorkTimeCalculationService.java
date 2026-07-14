package com.controle_horas.Controle_horas.service;

import com.controle_horas.Controle_horas.entity.WorkLog;
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

    public int calculateDailyBalanceMinutes(int workedMinutes, int dailyWorkloadMinutes) {
        return workedMinutes - dailyWorkloadMinutes;
    }

    public Instant calculateExpectedExitAt(List<WorkLog> dayWorkLogs, int dailyWorkloadMinutes) {
        return dayWorkLogs.stream()
                .map(WorkLog::getEntryAt)
                .filter(Objects::nonNull)
                .min(Comparator.naturalOrder())
                .map(firstEntry -> firstEntry.plus(Duration.ofMinutes(dailyWorkloadMinutes)))
                .orElse(null);
    }

    public int calculateHourBankMinutes(List<WorkLog> allWorkLogs, int dailyWorkloadMinutes) {
        Map<LocalDate, List<WorkLog>> logsByDate = groupByDisplayDate(allWorkLogs);
        int hourBankMinutes = 0;

        for (List<WorkLog> dayLogs : logsByDate.values()) {
            if (hasOpenWorkLog(dayLogs)) {
                continue;
            }
            int workedMinutes = sumClosedWorkedMinutes(dayLogs);
            hourBankMinutes += calculateDailyBalanceMinutes(workedMinutes, dailyWorkloadMinutes);
        }

        return hourBankMinutes;
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
