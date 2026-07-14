package com.controle_horas.Controle_horas.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record DashboardResponse(
        LocalDate date,
        int dailyWorkloadMinutes,
        LocalTime standardEntryTime,
        LocalTime standardExitTime,
        String nextAction,
        Instant expectedExitAt,
        int workedMinutesToday,
        int balanceMinutesToday,
        int hourBankMinutes,
        List<WorkLogResponse> workLogs
) {}
