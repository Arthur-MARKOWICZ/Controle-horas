package com.controle_horas.Controle_horas.service;

import com.controle_horas.Controle_horas.dto.HistoryDayResponse;
import com.controle_horas.Controle_horas.dto.HistoryResponse;
import com.controle_horas.Controle_horas.dto.WorkLogResponse;
import com.controle_horas.Controle_horas.entity.User;
import com.controle_horas.Controle_horas.entity.WorkLog;
import com.controle_horas.Controle_horas.repository.WorkLogRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HistoryService {

    private final WorkLogRepository workLogRepository;
    private final UserService userService;
    private final WorkTimeCalculationService workTimeCalculationService;

    public HistoryService(
            WorkLogRepository workLogRepository,
            UserService userService,
            WorkTimeCalculationService workTimeCalculationService) {
        this.workLogRepository = workLogRepository;
        this.userService = userService;
        this.workTimeCalculationService = workTimeCalculationService;
    }

    @Transactional(readOnly = true)
    public HistoryResponse getHistory(String email, LocalDate startDate, LocalDate endDate) {
        validatePeriod(startDate, endDate);

        User user = userService.findUser(email);
        Instant rangeStart = startDate.atStartOfDay(WorkTimeCalculationService.DISPLAY_ZONE).toInstant();
        Instant rangeEnd = endDate.plusDays(1).atStartOfDay(WorkTimeCalculationService.DISPLAY_ZONE).toInstant();

        List<WorkLog> periodLogs = workLogRepository
                .findByUserIdAndEntryAtGreaterThanEqualAndEntryAtLessThanOrderByEntryAtAsc(
                        user.getId(), rangeStart, rangeEnd);
        List<WorkLog> allLogs = workLogRepository.findByUserIdOrderByEntryAtAsc(user.getId());

        Map<LocalDate, List<WorkLog>> logsByDate = workTimeCalculationService.groupByDisplayDate(periodLogs);
        List<HistoryDayResponse> days = logsByDate.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> toDayResponse(entry.getKey(), entry.getValue(), user.getDailyWorkloadMinutes()))
                .toList();

        int totalWorkedMinutes = days.stream().mapToInt(HistoryDayResponse::workedMinutes).sum();
        int totalBalanceMinutes = days.stream().mapToInt(HistoryDayResponse::balanceMinutes).sum();
        int hourBankMinutes = workTimeCalculationService.calculateHourBankMinutes(
                allLogs, user.getDailyWorkloadMinutes());

        return new HistoryResponse(
                startDate,
                endDate,
                totalWorkedMinutes,
                totalBalanceMinutes,
                hourBankMinutes,
                days);
    }

    private HistoryDayResponse toDayResponse(LocalDate date, List<WorkLog> dayLogs, int dailyWorkloadMinutes) {
        int workedMinutes = workTimeCalculationService.sumClosedWorkedMinutes(dayLogs);
        int balanceMinutes = workTimeCalculationService.calculateDailyBalanceMinutes(
                workedMinutes, dailyWorkloadMinutes);
        boolean isComplete = !workTimeCalculationService.hasOpenWorkLog(dayLogs);

        Instant firstEntryAt = dayLogs.stream()
                .map(WorkLog::getEntryAt)
                .filter(Objects::nonNull)
                .min(Comparator.naturalOrder())
                .orElse(null);

        Instant lastExitAt = dayLogs.stream()
                .map(WorkLog::getExitAt)
                .filter(Objects::nonNull)
                .max(Comparator.naturalOrder())
                .orElse(null);

        List<WorkLogResponse> workLogs = dayLogs.stream()
                .map(workLog -> new WorkLogResponse(workLog.getId(), workLog.getEntryAt(), workLog.getExitAt()))
                .toList();

        return new HistoryDayResponse(
                date,
                firstEntryAt,
                lastExitAt,
                workedMinutes,
                balanceMinutes,
                isComplete,
                workLogs);
    }

    private void validatePeriod(LocalDate startDate, LocalDate endDate) {
        if (startDate == null || endDate == null) {
            throw new IllegalArgumentException("startDate and endDate are required.");
        }
        if (startDate.isAfter(endDate)) {
            throw new IllegalArgumentException("startDate must be less than or equal to endDate.");
        }
    }
}
