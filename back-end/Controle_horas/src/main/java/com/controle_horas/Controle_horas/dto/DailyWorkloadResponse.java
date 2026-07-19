package com.controle_horas.Controle_horas.dto;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;

public record DailyWorkloadResponse(
        int dailyWorkloadMinutes,
        LocalTime standardEntryTime,
        LocalTime standardExitTime,
        boolean lunchEnabled,
        int lunchDurationMinutes,
        Set<DayOfWeek> workDays
) {}
