package com.controle_horas.Controle_horas.dto;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;

public record DashboardResponse(
        LocalDate date,
        int dailyWorkloadMinutes,
        LocalTime standardEntryTime,
        LocalTime standardExitTime,
        boolean lunchEnabled,
        int lunchDurationMinutes,
        Set<DayOfWeek> workDays,
        String nextAction,
        Instant expectedExitAt,
        int workedMinutesToday,
        int pausedMinutesToday,
        int balanceMinutesToday,
        int hourBankMinutes,
        List<WorkLogResponse> workLogs
) {
}
