package com.controle_horas.Controle_horas.dto;

import java.time.LocalDate;
import java.util.List;

public record HistoryResponse(
        LocalDate startDate,
        LocalDate endDate,
        int totalWorkedMinutes,
        int totalBalanceMinutes,
        int hourBankMinutes,
        List<HistoryDayResponse> days
) {}
