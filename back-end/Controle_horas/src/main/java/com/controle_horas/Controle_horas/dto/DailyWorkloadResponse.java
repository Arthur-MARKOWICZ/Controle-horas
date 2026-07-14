package com.controle_horas.Controle_horas.dto;

import java.time.LocalTime;

public record DailyWorkloadResponse(
        int dailyWorkloadMinutes,
        LocalTime standardEntryTime,
        LocalTime standardExitTime
) {}
