package com.controle_horas.Controle_horas.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record HistoryDayResponse(
        LocalDate date,
        Instant firstEntryAt,
        Instant lastExitAt,
        int workedMinutes,
        int pausedMinutes,
        int balanceMinutes,
        boolean isComplete,
        List<WorkLogResponse> workLogs
) {}
